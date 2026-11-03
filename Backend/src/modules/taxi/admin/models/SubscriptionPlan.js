import mongoose from 'mongoose';

const subscriptionPlanSchema = new mongoose.Schema({
  audience: {
    type: String,
    // driver   = Raydo Sarthi (taxi / parcel driver app)
    // user     = rider (customer) ride pass
    // delivery = delivery partner app: food orders, two-wheeler rides and parcels (see service_type)
    enum: ['driver', 'user', 'delivery'],
    default: 'driver',
    index: true,
  },
  name: String,
  description: String,
  amount: Number,
  duration: Number, // in days
  transport_type: String,
  // Only for audience "delivery": which work the pass unlocks
  service_type: {
    type: String,
    enum: ['', 'food', 'ride', 'parcel'],
    default: '',
    index: true,
  },
  vehicle_type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiVehicle' },
  benefit_type: {
    type: String,
    enum: ['standard', 'limited', 'unlimited'],
    default: 'standard',
  },
  ride_limit: {
    type: Number,
    default: 0,
    min: 0,
  },
  how_it_works: String,
  active: { type: Boolean, default: true }
}, { timestamps: true });

export const SubscriptionPlan = mongoose.models.TaxiSubscriptionPlan || mongoose.model('TaxiSubscriptionPlan', subscriptionPlanSchema);
