import { Server } from 'socket.io';
import { env } from '../../../config/env.js';
import { normalizePoint, toPoint } from '../../../utils/geo.js';
import { Driver } from '../driver/models/Driver.js';
import {
  broadcastSupportMessage,
  createSupportMessage,
  getSupportParticipantRoom,
  getSupportRoom,
  getSupportRoleRoom,
  markSupportMessagesAsRead,
  parseSupportConversationKey,
  setSupportChatServer,
} from '../chat/services/supportChatService.js';
import {
  addSocketSubscriptions,
  joinRideRoom,
  markDriverRejectedFromDispatch,
  notifyLateAvailableDriver,
  notifyRideAccepted,
  notifyRideBidUpdated,
  setSocketServer,
  startDispatchFlow,
} from '../services/dispatchService.js';
import { findZoneByPickup } from '../services/matchingService.js';
import { acceptRideAssignment, createRideRecord, getActiveRideForIdentity, getRideRoom, submitRideBid } from '../services/rideService.js';
import { SOCKET_EVENTS } from './events.js';
import { registerRideSocketHandlers } from './handlers/rideSocketHandler.js';
import { authorizeRideRoomAccess } from './middleware/rideRoomAuth.js';
import { attachSocketAuth } from './middleware/socketAuth.js';
import { clearDriverRoute } from './services/driverRouteService.js';

const linkedDriverInRideMode = async (driverId) => {
  const { linkedDriverMayBeOnline } = await import('../../food/delivery/services/hybridRide.service.js');
  return linkedDriverMayBeOnline(driverId);
};

const onAsync = (socket, handler) => async (payload = {}) => {
  try {
    await handler(payload);
  } catch (error) {
    socket.emit('errorMessage', {
      message: error.message || 'Socket operation failed',
    });
  }
};

const TAXI_SOCKET_ROLES = new Set(['driver', 'user', 'admin', 'owner']);

const resolveTaxiSocketIdentity = (socket) => {
  if (socket.auth?.sub && socket.auth?.role) {
    return socket.auth;
  }

  const userId = socket.user?.userId;
  const role = String(socket.user?.role || '').toLowerCase();

  if (!userId || !TAXI_SOCKET_ROLES.has(role)) {
    return null;
  }

  return {
    sub: String(userId),
    role,
  };
};

// How long a driver without a live socket stays "online" (covers page changes, app resume and network blips)
const DRIVER_OFFLINE_GRACE_MS = 5 * 60 * 1000;

// Driver apps ping their GPS every 1-2s. Persisting + re-running the dispatch scan on every single ping is what
// saturates MongoDB under load. We only process one location tick per driver per this window; the ones in between are
// dropped (the next allowed tick carries the freshest coordinates anyway). Matching tolerates a few seconds of staleness.
const DRIVER_LOCATION_MIN_INTERVAL_MS = Number(process.env.DRIVER_LOCATION_MIN_INTERVAL_MS || 3000);
const lastDriverLocationTickAt = new Map(); // driverId -> last processed timestamp

const registerTaxiSocketConnectionHandlers = (io) => {
  io.on('connection', async (socket) => {
    const identity = resolveTaxiSocketIdentity(socket);

    if (!identity) {
      return;
    }

    socket.auth = identity;

    addSocketSubscriptions(socket, { role: identity.role, entityId: identity.sub });

    // A reconnected socket (network blip, server reload) is a NEW socket that has lost its ride room. Put a rider / driver
    // back into the room of the ride they are in, so live location and status keep flowing without the app doing anything.
    if (identity.role === 'user' || identity.role === 'driver') {
      getActiveRideForIdentity({ role: identity.role, entityId: identity.sub })
        .then((activeRide) => {
          if (activeRide) joinRideRoom(socket, activeRide._id);
        })
        .catch(() => {});
    }

    socket.join(getSupportParticipantRoom(identity.role, identity.sub));
    socket.join(getSupportRoleRoom(identity.role));

    if (identity.role === 'driver') {
      await Driver.findByIdAndUpdate(identity.sub, { socketId: socket.id }).catch((error) => {
        console.error('Failed to store driver socket id on connect', error?.message || error);
      });
      notifyLateAvailableDriver(identity.sub).catch((error) => {
        console.error('Failed to notify late-available driver on socket connect', error);
      });
    }

    socket.on('chat:join', ({ conversationKey }) => {
      if (conversationKey) {
        const parsed = parseSupportConversationKey(conversationKey);

        if (parsed) {
          for (const key of parsed.keys) {
            socket.join(getSupportRoom(key));
          }
          return;
        }

        socket.join(getSupportRoom(conversationKey));
      }
    });

    socket.on(
      'chat:send',
      onAsync(socket, async ({ message, receiverRole, receiverId, conversationKey }) => {
        let nextReceiverRole = receiverRole;
        let nextReceiverId = receiverId;

        if (identity.role === 'admin' && (!nextReceiverRole || !nextReceiverId) && conversationKey) {
          const parsed = parseSupportConversationKey(conversationKey);
          nextReceiverRole = parsed?.peerRole;
          nextReceiverId = parsed?.peerId;
        }

        const savedMessage = await createSupportMessage({
          senderRole: identity.role,
          senderId: identity.sub,
          receiverRole: nextReceiverRole,
          receiverId: nextReceiverId,
          conversationKey,
          message,
        });

        broadcastSupportMessage(savedMessage);
      }),
    );

    socket.on(
      'chat:read',
      onAsync(socket, async ({ conversationKey }) => {
        if (!conversationKey) {
          return;
        }

        await markSupportMessagesAsRead({
          role: identity.role,
          id: identity.sub,
          conversationKey,
        });
      }),
    );

    socket.on(
      'joinRide',
      onAsync(socket, async ({ rideId }) => {
        if (!rideId) {
          return;
        }

        await authorizeRideRoomAccess({ socket, rideId });
        joinRideRoom(socket, rideId);
      }),
    );

    registerRideSocketHandlers({ io, socket, onAsync });

    const handleDriverLocationSocketUpdate = async (payload = {}) => {
      if (identity.role !== 'driver') {
        return;
      }

      // Throttle per driver: skip pings that arrive inside the min interval so one fast-moving driver cannot flood
      // Mongo with a write + zone lookup + dispatch scan on every GPS tick.
      const driverKey = String(identity.sub);
      const now = Date.now();
      const lastTick = lastDriverLocationTickAt.get(driverKey) || 0;
      if (now - lastTick < DRIVER_LOCATION_MIN_INTERVAL_MS) {
        return;
      }
      lastDriverLocationTickAt.set(driverKey, now);

      const coordsInput = payload.coordinates || payload.location || (
        Number.isFinite(Number(payload.latitude ?? payload.lat)) && Number.isFinite(Number(payload.longitude ?? payload.lng))
          ? [Number(payload.longitude ?? payload.lng), Number(payload.latitude ?? payload.lat)]
          : null
      );
      if (!coordsInput) return;

      const normalizedCoords = normalizePoint(coordsInput, 'coordinates');
      const zone = await findZoneByPickup(normalizedCoords);

      // A delivery partner's linked ride profile only counts as online while the partner is online in the delivery app
      const mayGoOnline = await linkedDriverInRideMode(identity.sub);
      await Driver.findByIdAndUpdate(identity.sub, {
        socketId: socket.id,
        ...(mayGoOnline ? { isOnline: true } : {}),
        location: toPoint(normalizedCoords, 'coordinates'),
        zoneId: zone?._id || null,
      });
      if (!mayGoOnline) return;
      notifyLateAvailableDriver(identity.sub).catch((error) => {
        console.error('Failed to notify late-available driver on location update', error);
      });
    };

    socket.on('locationUpdate', onAsync(socket, handleDriverLocationSocketUpdate));
    socket.on('driver_location_update', onAsync(socket, handleDriverLocationSocketUpdate));

    socket.on(
      'requestRide',
      onAsync(socket, async ({ pickup, drop, fare, estimatedDistanceMeters, estimatedDurationMinutes, vehicleTypeId, vehicleIconType, paymentMethod, serviceType, intercity }) => {
        if (identity.role !== 'user') {
          return;
        }

        // Ride creation and dispatch share the same service path as the REST controller.
        const ride = await createRideRecord({
          userId: identity.sub,
          pickupCoords: normalizePoint(pickup, 'pickup'),
          dropCoords: normalizePoint(drop, 'drop'),
          fare: Number(fare || 0),
          estimatedDistanceMeters: Number(estimatedDistanceMeters || 0),
          estimatedDurationMinutes: Number(estimatedDurationMinutes || 0),
          vehicleTypeId,
          vehicleIconType,
          paymentMethod,
          serviceType,
          intercity,
        });

        joinRideRoom(socket, ride._id);
        await startDispatchFlow(ride);

        socket.emit('rideCreated', {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
          status: ride.status,
        });

        socket.emit(SOCKET_EVENTS.RIDE_JOINED, {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
        });
      }),
    );

    socket.on(
      'acceptRide',
      onAsync(socket, async ({ rideId }) => {
        if (identity.role !== 'driver' || !rideId) {
          return;
        }

        // First successful transaction wins; later accepts are rejected by the service layer.
        const ride = await acceptRideAssignment({ rideId, driverId: identity.sub });
        joinRideRoom(socket, ride._id);
        await notifyRideAccepted(ride);

        const acceptedPayload = {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
          status: ride.status,
          liveStatus: ride.liveStatus,
          acceptedAt: ride.acceptedAt,
        };

        socket.emit('rideAccepted', acceptedPayload);
        socket.emit(SOCKET_EVENTS.RIDE_STATE, acceptedPayload);
        socket.emit(SOCKET_EVENTS.RIDE_JOINED, {
          rideId: String(ride._id),
          room: getRideRoom(ride._id),
        });
      }),
    );

    socket.on(
      'submitRideBid',
      onAsync(socket, async ({ rideId, bidFare }) => {
        if (identity.role !== 'driver' || !rideId) {
          return;
        }

        const result = await submitRideBid({
          rideId,
          driverId: identity.sub,
          bidFare,
        });

        socket.emit('rideBidSubmitted', {
          rideId: String(rideId),
          bid: result.bid,
        });

        await notifyRideBidUpdated(result);
      }),
    );

    socket.on('rejectRide', ({ rideId, reason } = {}) => {
      if (identity.role !== 'driver' || !rideId) {
        return;
      }

      markDriverRejectedFromDispatch(rideId, identity.sub, reason);
      socket.to(getRideRoom(rideId)).emit('driverRejectedRide', {
        rideId,
        driverId: identity.sub,
      });
    });

    socket.on('disconnect', async () => {
      if (identity.role !== 'driver') {
        return;
      }

      clearDriverRoute(identity.sub);
      lastDriverLocationTickAt.delete(String(identity.sub));

      // Only release the driver if THIS socket is still his current one. A page change / app resume opens the new socket
      // before the old one's disconnect arrives; that old disconnect must not take the driver offline.
      // A database outage must never take the whole server down from a socket event
      const released = await Driver.findOneAndUpdate(
        { _id: identity.sub, socketId: socket.id },
        { socketId: null },
      ).catch((error) => {
        console.error('Failed to release driver socket on disconnect', error?.message || error);
        return null;
      });
      if (!released) {
        return;
      }

      // A short network drop must not log the driver out of duty: go offline only if no new socket came back in time
      const timer = setTimeout(() => {
        Driver.updateOne(
          { _id: identity.sub, socketId: null, isOnline: true, isOnRide: { $ne: true } },
          { isOnline: false },
        ).catch(() => {});
      }, DRIVER_OFFLINE_GRACE_MS);
      timer.unref?.();
    });
  });
};

export const registerTaxiSocketIntegration = (io) => {
  if (!io) {
    return null;
  }

  setSocketServer(io);
  setSupportChatServer(io);
  registerTaxiSocketConnectionHandlers(io);

  return io;
};

export const configureTaxiSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','),
      credentials: true,
    },
  });

  attachSocketAuth(io);
  registerTaxiSocketIntegration(io);

  return io;
};
