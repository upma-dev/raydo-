import { getFirebaseMessaging } from '../../../config/firebase.js';
import { Driver } from '../driver/models/Driver.js';
import { User } from '../user/models/User.js';
import { Ride } from '../user/models/Ride.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { listEntityPushTokens } from './pushTokenService.js';

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

const chunk = (items, size) => {
  const groups = [];

  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }

  return groups;
};

const collectAudienceTargets = async ({ sendTo, serviceLocationId }) => {
  const includeUsers = sendTo === 'all' || sendTo === 'users';
  const includeDrivers = sendTo === 'all' || sendTo === 'drivers';
  const targets = [];

  if (includeUsers) {
    const userQuery = {
      deletedAt: null,
      isActive: { $ne: false },
      active: { $ne: false },
    };

    if (serviceLocationId) {
      const userIds = await Ride.distinct('userId', { service_location_id: serviceLocationId });
      userQuery._id = { $in: userIds };
    }

    const users = await User.find(userQuery)
      .select('_id fcmTokens fcmTokenMobile')
      .lean();

    users.forEach((user) => {
      listEntityPushTokens(user, 'user').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(user._id),
        });
      });
    });
  }

  if (includeDrivers) {
    const driverQuery = {
      deletedAt: null,
      approve: { $ne: false },
      status: { $ne: 'pending' },
    };

    if (serviceLocationId) {
      driverQuery.service_location_id = serviceLocationId;
    }

    const drivers = await Driver.find(driverQuery)
      .select('_id fcmTokenWeb fcmTokenMobile')
      .lean();

    drivers.forEach((driver) => {
      listEntityPushTokens(driver, 'driver').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(driver._id),
        });
      });
    });
  }

  return targets;
};

const removeInvalidTokens = async (invalidTargets = []) => {
  if (invalidTargets.length === 0) {
    return 0;
  }

  const userIdsByField = { fcmTokens: new Set(), fcmTokenMobile: new Set() };
  const driverIdsByField = { fcmTokenWeb: new Set(), fcmTokenMobile: new Set() };

  // Tokens that came from a delivery partner linked to a driver live on the partner, not on the driver
  const partnerTargets = invalidTargets.filter((target) => target.role === 'partner');
  const partnerOperations = ['fcmTokens', 'fcmTokenMobile'].flatMap((field) => {
    const fieldTargets = partnerTargets.filter((target) => target.field === field);
    if (fieldTargets.length === 0) return [];
    return [FoodDeliveryPartner.updateMany(
      { _id: { $in: [...new Set(fieldTargets.map((target) => target.entityId))] } },
      { $pull: { [field]: { $in: fieldTargets.map((target) => target.token) } } },
    )];
  });

  invalidTargets.forEach((target) => {
    if (target.role === 'user') {
      userIdsByField[target.field]?.add(target.entityId);
    }

    if (target.role === 'driver') {
      driverIdsByField[target.field]?.add(target.entityId);
    }
  });

  const operations = [...partnerOperations];

  Object.entries(userIdsByField).forEach(([field, ids]) => {
    if (ids.size > 0) {
      operations.push(
        User.updateMany(
          { _id: { $in: Array.from(ids) } },
          { $pull: { [field]: { $in: invalidTargets.filter((t) => t.role === 'user' && t.field === field).map((t) => t.token) } } },
        ),
      );
    }
  });

  Object.entries(driverIdsByField).forEach(([field, ids]) => {
    if (ids.size > 0) {
      operations.push(
        Driver.updateMany(
          { _id: { $in: Array.from(ids) } },
          { $set: { [field]: '' } },
        ),
      );
    }
  });

  await Promise.all(operations);
  return invalidTargets.length;
};

const sendPushToTargets = async ({
  targets = [],
  title,
  body,
  image = '',
  data = {},
}) => {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    return {
      attempted: false,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'Firebase messaging is not configured on the backend',
    };
  }

  const dedupedTargets = Array.from(
    new Map((Array.isArray(targets) ? targets : []).map((target) => [target.token, target])).values(),
  );

  if (dedupedTargets.length === 0) {
    return {
      attempted: true,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'No saved FCM tokens were found for the selected entities',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const failureCodes = {};
  let firstFailureMessage = '';
  const invalidTargets = [];
  const safeData = Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, String(value ?? '')]),
  );

  // A ride request is only worth answering for about a minute: deliver it at once with sound and drop it when stale
  const isRing = safeData.ring === 'true';

  for (const batch of chunk(dedupedTargets, 500)) {
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map((target) => target.token),
      notification: {
        title,
        body,
        ...(image ? { imageUrl: image } : {}),
      },
      data: {
        ...safeData,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        ...(isRing ? { ttl: 60000 } : {}),
        notification: {
          channelId: isRing ? 'default' : 'silent_channel',
          ...(image ? { imageUrl: image } : {}),
          ...(isRing
            ? {
                sound: 'default',
                defaultSound: true,
                defaultVibrateTimings: true,
                notificationPriority: 'PRIORITY_MAX',
                visibility: 'PUBLIC',
              }
            : {}),
        },
      },
      ...(isRing
        ? {
            apns: {
              headers: { 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 60) },
              payload: { aps: { sound: 'default' } },
            },
          }
        : {}),
      webpush: {
        headers: {
          Urgency: 'high',
          ...(isRing ? { TTL: '60' } : {}),
        },
        notification: {
          title,
          body,
          icon: '/raydo-logo.png',
          badge: '/raydo-logo.png',
          ...(image ? { image } : {}),
          ...(isRing ? { requireInteraction: true, vibrate: [500, 200, 500, 200, 500, 200, 800, 300, 500] } : {}),
        },
        data: safeData,
        fcmOptions: {
          link: safeData.targetUrl || safeData.link || (safeData.serviceType === 'parcel' ? '/food/delivery/feed' : '/taxi/driver/home'),
        },
      },
    });

    response.responses.forEach((item, index) => {
      if (item.success) {
        deliveredCount += 1;
        return;
      }

      failedCount += 1;
      const code = item.error?.code || 'unknown';
      failureCodes[code] = (failureCodes[code] || 0) + 1;
      if (!firstFailureMessage) firstFailureMessage = String(item.error?.message || '').slice(0, 160);

      // "invalid-argument" is also what FCM answers for a badly built message, which says nothing about the token: only
      // drop the token when the error is really about the registration token
      const tokenIsBad = code === 'messaging/invalid-registration-token'
        || code === 'messaging/registration-token-not-registered'
        || (code === 'messaging/invalid-argument' && /registration token/i.test(String(item.error?.message || '')));
      if (tokenIsBad) {
        invalidTargets.push(batch[index]);
      }
    });
  }

  if (failedCount > 0) {
    console.warn(`[Push] ${failedCount}/${dedupedTargets.length} failed: ${JSON.stringify(failureCodes)} first="${firstFailureMessage}"`);
  }

  const invalidTokenCount = await removeInvalidTokens(invalidTargets);

  return {
    attempted: true,
    deliveredCount,
    failedCount,
    invalidTokenCount,
    targetCount: dedupedTargets.length,
    reason: '',
  };
};

const collectDirectTargets = async ({ userIds = [], driverIds = [] }) => {
  const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const normalizedDriverIds = [...new Set((Array.isArray(driverIds) ? driverIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const targets = [];

  if (normalizedUserIds.length) {
    const users = await User.find({ _id: { $in: normalizedUserIds } })
      .select('_id fcmTokens fcmTokenMobile')
      .lean();

    users.forEach((user) => {
      listEntityPushTokens(user, 'user').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          entityId: String(user._id),
        });
      });
    });
  }

  if (normalizedDriverIds.length) {
    const drivers = await Driver.find({ _id: { $in: normalizedDriverIds } })
      .select('_id fcmTokenWeb fcmTokenMobile linkedDeliveryPartnerId')
      .lean();

    // A driver that is also a delivery partner: the partner's own tokens are always the freshest (the copy on the
    // driver is only refreshed when the partner goes online), so a ride request still reaches a closed app
    const linkedPartnerIds = [...new Set(drivers.map((driver) => String(driver.linkedDeliveryPartnerId || '')).filter(Boolean))];
    const linkedPartners = linkedPartnerIds.length
      ? await FoodDeliveryPartner.find({ _id: { $in: linkedPartnerIds } }).select('_id fcmTokens fcmTokenMobile').lean()
      : [];
    const partnerById = new Map(linkedPartners.map((partner) => [String(partner._id), partner]));

    drivers.forEach((driver) => {
      // The driver keeps its web token in fcmTokenWeb; the token list helper reads it as fcmTokens
      listEntityPushTokens({ fcmTokens: driver.fcmTokenWeb, fcmTokenMobile: driver.fcmTokenMobile }, 'driver').forEach((tokenEntry) => {
        targets.push({
          ...tokenEntry,
          field: tokenEntry.field === 'fcmTokens' ? 'fcmTokenWeb' : tokenEntry.field,
          entityId: String(driver._id),
        });
      });

      const partner = partnerById.get(String(driver.linkedDeliveryPartnerId || ''));
      if (partner) {
        listEntityPushTokens(partner, 'partner').forEach((tokenEntry) => {
          targets.push({
            ...tokenEntry,
            entityId: String(partner._id),
          });
        });
      }
    });
  }

  return targets;
};

export const sendPushNotificationToAudience = async ({
  notificationId,
  serviceLocationId,
  sendTo,
  title,
  body,
  image,
}) => {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    return {
      attempted: false,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'Firebase messaging is not configured on the backend',
    };
  }

  const targets = await collectAudienceTargets({ sendTo, serviceLocationId });
  const dedupedTargets = Array.from(
    new Map(targets.map((target) => [target.token, target])).values(),
  );

  if (dedupedTargets.length === 0) {
    return {
      attempted: true,
      deliveredCount: 0,
      failedCount: 0,
      invalidTokenCount: 0,
      targetCount: 0,
      reason: 'No saved FCM tokens were found for the selected audience',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  const invalidTargets = [];

  const userTargets = dedupedTargets.filter((t) => t.role === 'user');
  const driverTargets = dedupedTargets.filter((t) => t.role === 'driver');
  const targetGroups = [
    { targets: userTargets, redirectUrl: '/taxi/user' },
    { targets: driverTargets, redirectUrl: '/taxi/driver/home' },
  ].filter((g) => g.targets.length > 0);

  for (const group of targetGroups) {
    for (const batch of chunk(group.targets, 500)) {
      const response = await messaging.sendEachForMulticast({
        tokens: batch.map((target) => target.token),
        notification: {
          title,
          body,
          ...(image ? { imageUrl: image } : {}),
        },
        data: {
          notificationId: String(notificationId || ''),
          serviceLocationId: String(serviceLocationId || 'all'),
          sendTo: String(sendTo || 'all'),
          redirect_url: group.redirectUrl,
          link: group.redirectUrl,
          targetUrl: group.redirectUrl,
          click_action: group.redirectUrl,
        },
        android: {
          priority: 'high',
          notification: image ? { imageUrl: image } : undefined,
        },
        webpush: {
          notification: {
            title,
            body,
            ...(image ? { image } : {}),
          },
          fcmOptions: {
            link: group.redirectUrl,
          },
        },
      });

      response.responses.forEach((item, index) => {
        if (item.success) {
          deliveredCount += 1;
          return;
        }

        failedCount += 1;
        if (INVALID_TOKEN_CODES.has(item.error?.code)) {
          invalidTargets.push(batch[index]);
        }
      });
    }
  }

  const invalidTokenCount = await removeInvalidTokens(invalidTargets);

  return {
    attempted: true,
    deliveredCount,
    failedCount,
    invalidTokenCount,
    targetCount: dedupedTargets.length,
    reason: '',
  };
};

export const sendPushNotificationToEntities = async ({
  userIds = [],
  driverIds = [],
  title,
  body,
  image = '',
  data = {},
}) => {
  const targets = await collectDirectTargets({ userIds, driverIds });
  return sendPushToTargets({
    targets,
    title,
    body,
    image,
    data,
  });
};
