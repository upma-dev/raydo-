import mongoose from 'mongoose';

const ownerWalletTransactionSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiOwner',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    kind: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
    },
    // What moved the money: ride_share, ride_commission, bus_ticket, withdrawal, withdrawal_refund,
    // ride_refund, admin_adjustment. Older rows have no category.
    category: {
      type: String,
      default: '',
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiRide',
      default: null,
    },
    busBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiBusBooking',
      default: null,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

export const OwnerWalletTransaction =
  mongoose.models.TaxiOwnerWalletTransaction ||
  mongoose.model('TaxiOwnerWalletTransaction', ownerWalletTransactionSchema);
