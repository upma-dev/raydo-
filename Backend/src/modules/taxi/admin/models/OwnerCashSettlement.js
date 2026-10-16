import mongoose from 'mongoose';

// One row each time a fleet owner marks cash as received from a driver (cash rides).
const ownerCashSettlementSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiOwner',
      required: true,
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiDriver',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    dueBefore: {
      type: Number,
      default: 0,
    },
    dueAfter: {
      type: Number,
      default: 0,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true },
);

export const OwnerCashSettlement =
  mongoose.models.TaxiOwnerCashSettlement ||
  mongoose.model('TaxiOwnerCashSettlement', ownerCashSettlementSchema);
