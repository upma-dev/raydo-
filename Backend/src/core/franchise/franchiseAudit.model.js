import mongoose from 'mongoose';

const franchiseAuditSchema = new mongoose.Schema(
    {
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin' // Or User, depending on who triggers it
        },
        role: {
            type: String // e.g. PLATFORM_SUPERADMIN, FRANCHISE_ADMIN, SYSTEM, APPLICANT
        },
        action: {
            type: String,
            enum: [
                'Franchise Created', 'Application Submitted', 'KYC Uploaded', 'KYC Verified',
                'KYC Rejected', 'Territory Assigned', 'Commercial Changed', 'Agreement Created',
                'Agreement Signed', 'Status Changed', 'Franchise Suspended', 'Franchise Terminated',
                'General Settings Updated'
            ],
            required: true
        },
        entity: {
            type: String, // e.g. 'Franchise', 'FranchiseKyc', 'FranchiseTerritory', 'FranchiseAgreement'
            required: true
        },
        entityId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        oldValue: {
            type: mongoose.Schema.Types.Mixed
        },
        newValue: {
            type: mongoose.Schema.Types.Mixed
        }
    },
    {
        timestamps: true
    }
);

franchiseAuditSchema.index({ entity: 1, entityId: 1 });
franchiseAuditSchema.index({ action: 1 });
franchiseAuditSchema.index({ createdAt: -1 });

export const FranchiseAudit = mongoose.models.FranchiseAudit || mongoose.model('FranchiseAudit', franchiseAuditSchema);
export default FranchiseAudit;
