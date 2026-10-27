import { normalizePoint } from '../../../../utils/geo.js';
import { RIDE_LIVE_STATUS } from '../../constants/index.js';
import { getDriverRoom, getUserRoom } from '../../services/dispatchService.js';
import {
  appendRideMessage,
  getActiveRideForIdentity,
  getRideDetails,
  getRideRoom,
  serializeRideRealtime,
  updateRideDriverLocation,
  updateRideLifecycle,
} from '../../services/rideService.js';
import { authorizeRideRoomAccess } from '../middleware/rideRoomAuth.js';
import { SOCKET_EVENTS } from '../events.js';
import { clearDriverRoute, updateDriverRoute } from '../services/driverRouteService.js';
import { sendPushNotificationToEntities } from '../../services/pushNotificationService.js';

// Live location is shown to the rider the moment it arrives; only every Nth tick is also written to the database
const RIDE_LOCATION_SAVE_MIN_INTERVAL_MS = Number(process.env.RIDE_LOCATION_SAVE_MS || 4000);
const RIDE_AUTH_CACHE_MS = 60 * 1000;
const lastLocationSavedAt = new Map(); // rideId -> last time the location was written to the database

const driverLifecycleStatuses = new Set([
  RIDE_LIVE_STATUS.ACCEPTED,
  RIDE_LIVE_STATUS.ARRIVING,
  RIDE_LIVE_STATUS.STARTED,
  RIDE_LIVE_STATUS.ARRIVED,
  RIDE_LIVE_STATUS.COMPLETED,
]);

export const registerRideSocketHandlers = ({ io, socket, onAsync }) => {
  const emitRideState = (ride) => {
    const payload = serializeRideRealtime(ride);
    io.to(getRideRoom(ride._id)).emit(SOCKET_EVENTS.RIDE_STATE, payload);
    return payload;
  };

  socket.on(
    SOCKET_EVENTS.RIDE_JOIN,
    onAsync(socket, async ({ rideId }) => {
      if (!rideId) {
        throw new Error('rideId is required');
      }

      const ride = await authorizeRideRoomAccess({ socket, rideId });
      const room = getRideRoom(ride._id);
      socket.join(room);

      socket.emit(SOCKET_EVENTS.RIDE_JOINED, {
        rideId: String(ride._id),
        room,
      });

      const activeRide = await getActiveRideForIdentity({
        role: socket.auth.role,
        entityId: socket.auth.sub,
      });

      if (activeRide && String(activeRide._id) === String(ride._id)) {
        socket.emit(SOCKET_EVENTS.RIDE_STATE, serializeRideRealtime(activeRide));
      }
    }),
  );

  socket.on(
    SOCKET_EVENTS.RIDE_REJOIN_CURRENT,
    onAsync(socket, async () => {
      const activeRide = await getActiveRideForIdentity({
        role: socket.auth.role,
        entityId: socket.auth.sub,
      });

      if (!activeRide) {
        return;
      }

      const room = getRideRoom(activeRide._id);
      socket.join(room);
      socket.emit(SOCKET_EVENTS.RIDE_JOINED, {
        rideId: String(activeRide._id),
        room,
      });
      socket.emit(SOCKET_EVENTS.RIDE_STATE, serializeRideRealtime(activeRide));
    }),
  );

  // This socket's driver may send live location only for rides it is assigned to. The check is cached per ride (re-checked
  // every minute) so a GPS tick does not cost a database read.
  const authorizedRides = new Map(); // rideId -> { userId, at }

  socket.on(
    SOCKET_EVENTS.RIDE_DRIVER_LOCATION_UPDATE,
    onAsync(socket, async ({ rideId, coordinates, heading, speed }) => {
      if (socket.auth.role !== 'driver') {
        throw new Error('Only drivers can update live ride location');
      }

      const rideKey = String(rideId || '');
      const now = Date.now();
      let access = authorizedRides.get(rideKey);
      if (!access || now - access.at > RIDE_AUTH_CACHE_MS) {
        const ride = await authorizeRideRoomAccess({ socket, rideId });
        access = { userId: String(ride.userId || ''), at: now };
        authorizedRides.set(rideKey, access);
      }

      const point = normalizePoint(coordinates, 'coordinates');
      const safeHeading = Number.isFinite(Number(heading)) ? Number(heading) : null;
      const safeSpeed = Number.isFinite(Number(speed)) ? Number(speed) : null;
      const locationUpdate = {
        rideId: rideKey,
        coordinates: point,
        heading: safeHeading,
        speed: safeSpeed,
        updatedAt: new Date(now).toISOString(),
        sentAt: now,
      };

      // 1. Tell the passenger FIRST. The ride room is the normal way; the passenger's own room is a second way, so a rider
      //    whose socket reconnected and has not re-joined the ride room still sees the driver move.
      const target = io.to(getRideRoom(rideId));
      (access.userId ? target.to(getUserRoom(access.userId)) : target).emit(SOCKET_EVENTS.RIDE_DRIVER_LOCATION_UPDATED, locationUpdate);

      // 2. Save it for the "last known place" (a rider who opens the screen later, a refresh), but not on every tick
      const lastSavedAt = lastLocationSavedAt.get(rideKey) || 0;
      if (now - lastSavedAt >= RIDE_LOCATION_SAVE_MIN_INTERVAL_MS) {
        lastLocationSavedAt.set(rideKey, now);
        if (lastLocationSavedAt.size > 5000) lastLocationSavedAt.clear();
        updateRideDriverLocation({
          rideId,
          driverId: socket.auth.sub,
          coordinates: point,
          heading: safeHeading,
          speed: safeSpeed,
        }).catch((error) => {
          console.error('Failed to save ride driver location', error?.message || error);
        });
      }

      updateDriverRoute({
        io,
        rideId,
        driverId: socket.auth.sub,
        coordinates: point,
      });
    }),
  );

  socket.on(
    SOCKET_EVENTS.RIDE_STATUS_UPDATE,
    onAsync(socket, async ({ rideId, status, paymentMethod }) => {
      if (socket.auth.role !== 'driver') {
        throw new Error('Only drivers can update ride status');
      }

      if (!driverLifecycleStatuses.has(status)) {
        throw new Error('Unsupported ride status transition');
      }

      await authorizeRideRoomAccess({ socket, rideId });

      const ride = await updateRideLifecycle({
        rideId,
        driverId: socket.auth.sub,
        nextStatus: status,
        paymentMethod,
      });
      const populatedRide = await getRideDetails(rideId);

      const payload = {
        rideId: String(populatedRide._id),
        status: populatedRide.status,
        liveStatus: populatedRide.liveStatus,
        acceptedAt: populatedRide.acceptedAt,
        arrivedAt: populatedRide.arrivedAt,
        completedAt: populatedRide.completedAt,
      };

      io.to(getRideRoom(rideId)).emit(SOCKET_EVENTS.RIDE_STATUS_UPDATED, payload);
      emitRideState(populatedRide);

      if (status === RIDE_LIVE_STATUS.COMPLETED) {
        const walletUpdate = ride.$locals?.walletUpdate;
        if (walletUpdate) {
          io.to(getDriverRoom(socket.auth.sub)).emit('driver:wallet:updated', {
            wallet: walletUpdate.wallet,
            transaction: walletUpdate.transaction,
          });
        }
        clearDriverRoute(socket.auth.sub);
      }
    }),
  );

  socket.on(
    SOCKET_EVENTS.RIDE_MESSAGE_SEND,
    onAsync(socket, async ({ rideId, message }) => {
      const ride = await authorizeRideRoomAccess({ socket, rideId });

      const savedMessage = await appendRideMessage({
        rideId,
        role: socket.auth.role,
        senderId: socket.auth.sub,
        message,
      });

      const notifPayload = {
        id: String(savedMessage?._id || savedMessage?.id || `${rideId}-${Date.now()}`),
        rideId: String(rideId),
        senderRole: socket.auth.role,
        senderName: socket.auth.role === 'driver' ? 'Driver' : 'Passenger',
        text: message,
        message: savedMessage,
      };

      const room = getRideRoom(rideId);
      io.to(room).emit(SOCKET_EVENTS.RIDE_MESSAGE_NEW, savedMessage);
      io.to(room).emit('chat:message', savedMessage);
      io.to(room).emit('chat:notification', notifPayload);

      const userId = ride?.userId?._id || ride?.userId || ride?.user;
      const driverId = ride?.driverId?._id || ride?.driverId || ride?.driver;

      if (userId) {
        io.to(getUserRoom(userId)).emit('chat:message', savedMessage);
        io.to(getUserRoom(userId)).emit('chat:notification', notifPayload);
        io.to(getUserRoom(userId)).emit('order-chat-notification', notifPayload);
      }
      if (driverId) {
        io.to(getDriverRoom(driverId)).emit('chat:message', savedMessage);
        io.to(getDriverRoom(driverId)).emit('chat:notification', notifPayload);
        io.to(getDriverRoom(driverId)).emit('order-chat-notification', notifPayload);
      }

      // Send FCM Push Notification if app is in background or closed
      try {
        const isDriverSender = socket.auth.role === 'driver';
        const senderTitle = isDriverSender ? 'New Message from Driver' : 'New Message from Passenger';
        const cleanMessageText = String(message || '').trim();

        if (isDriverSender && userId) {
          sendPushNotificationToEntities({
            userIds: [userId],
            title: senderTitle,
            body: cleanMessageText,
            data: {
              type: 'ride_chat_message',
              rideId: String(rideId),
              senderRole: 'driver',
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
          }).catch(() => {});
        } else if (!isDriverSender && driverId) {
          sendPushNotificationToEntities({
            driverIds: [driverId],
            title: senderTitle,
            body: cleanMessageText,
            data: {
              type: 'ride_chat_message',
              rideId: String(rideId),
              senderRole: 'user',
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
          }).catch(() => {});
        }
      } catch (pushErr) {
        // Log & ignore push errors
      }
    }),
  );
};
