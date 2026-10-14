import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', required: true, index: true },
        type: { type: String, enum: ['order', 'restaurant', 'other'], required: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodOrder', default: null },
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', default: null },
        issueType: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open', index: true },
        adminResponse: { type: String, default: '' },
        // Franchise partner of the restaurant's zone: sees this ticket in its portal and may answer it (admin sees both)
        franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', default: null, index: true },
        franchiseResponse: { type: String, default: '' },
        franchiseRespondedAt: { type: Date, default: null }
    },
    { collection: 'food_support_tickets', timestamps: true }
);

supportTicketSchema.index({ userId: 1, createdAt: -1 });

export const FoodSupportTicket = mongoose.model('FoodSupportTicket', supportTicketSchema);
