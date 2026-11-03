import { getDriverReturnTripState, setDriverReturnTrip } from '../../services/returnTripService.js';

export const getMyReturnTrip = async (req, res) => {
  res.json({ success: true, data: await getDriverReturnTripState(req.auth.sub) });
};

export const setMyReturnTrip = async (req, res) => {
  const { enabled, destinationZoneId, source, fromRideId } = req.body || {};
  const data = await setDriverReturnTrip(req.auth.sub, {
    enabled: enabled === true || enabled === 'true',
    destinationZoneId,
    source,
    fromRideId,
  });
  res.json({
    success: true,
    data,
    message: data.current ? `Return trip on: rides to ${data.current.destinationName} come to you first.` : 'Return trip off.',
  });
};
