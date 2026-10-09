import mongoose from 'mongoose';

/**
 * One row per gateway payment that has already been credited somewhere (wallet top-up, ...).
 * The UNIQUE index on paymentId is what makes a payment usable exactly once, forever, for everyone.
 * (The wallet's own transaction list only keeps the last 50 entries, so it cannot be used to detect replays.)
 */
const processedPaymentSchema = new mongoose.Schema(
  {
    paymentId: { type: String, required: true, unique: true, trim: true },
    kind: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    amount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'taxi_processed_payments' },
);

export const ProcessedPayment =
  mongoose.models.TaxiProcessedPayment || mongoose.model('TaxiProcessedPayment', processedPaymentSchema);
