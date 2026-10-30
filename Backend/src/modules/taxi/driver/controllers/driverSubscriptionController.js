import { getDriverSubscriptionState, purchaseDriverSubscription } from '../services/driverSubscriptionService.js';

export const getMyDriverSubscriptions = async (req, res) => {
  res.json({ success: true, data: await getDriverSubscriptionState(req.auth.sub) });
};

export const buyDriverSubscription = async (req, res) => {
  const result = await purchaseDriverSubscription({
    driverId: req.auth.sub,
    planId: req.body?.planId,
  });

  res.status(201).json({
    success: true,
    data: result,
    message: result.startsLater
      ? 'Subscription renewed. It starts when your current plan ends.'
      : 'Subscription activated.',
  });
};
