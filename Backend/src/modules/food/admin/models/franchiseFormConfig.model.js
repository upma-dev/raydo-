import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema({
    key: { type: String, required: true },           // e.g. "companyName"
    label: { type: String, required: true },         // e.g. "Company Name"
    type: {
        type: String,
        enum: ['text', 'email', 'tel', 'number', 'textarea', 'select'],
        default: 'text',
    },
    placeholder: { type: String },
    required: { type: Boolean, default: false },
    options: [String],                               // for type === 'select'
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    section: {
        type: String,
        enum: ['business_info', 'location'],
        default: 'business_info',
    },
}, { _id: false });

const documentSchema = new mongoose.Schema({
    key: { type: String, required: true },           // e.g. "aadhaar"
    label: { type: String, required: true },         // e.g. "Aadhaar Card"
    description: { type: String },                  // e.g. "Front side of Aadhaar"
    required: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    acceptedFormats: { type: String, default: 'image/*,.pdf' },
    maxSizeMB: { type: Number, default: 5 },
}, { _id: false });

const franchiseFormConfigSchema = new mongoose.Schema({
    fields: [fieldSchema],
    requiredDocuments: [documentSchema],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, {
    timestamps: true,
});

// Singleton pattern — only one config document
franchiseFormConfigSchema.statics.getConfig = async function () {
    let config = await this.findOne();
    if (!config) {
        config = await this.create({
            fields: [
                { key: 'companyName', label: 'Company / Business Name', type: 'text', required: true, order: 1, enabled: true, section: 'business_info', placeholder: 'Enter your company name' },
                { key: 'businessType', label: 'Business Type', type: 'select', required: true, order: 2, enabled: true, section: 'business_info', options: ['Proprietorship', 'Partnership', 'Private Limited', 'LLP', 'Other'] },
                { key: 'investmentRange', label: 'Investment Range', type: 'select', required: true, order: 3, enabled: true, section: 'business_info', options: ['Below 5 Lakhs', '5-10 Lakhs', '10-25 Lakhs', '25-50 Lakhs', 'Above 50 Lakhs'] },
                { key: 'experience', label: 'Business Experience', type: 'select', required: false, order: 4, enabled: true, section: 'business_info', options: ['Fresher', '1-2 Years', '2-5 Years', '5-10 Years', 'Above 10 Years'] },
                { key: 'currentBusiness', label: 'Current Business (if any)', type: 'text', required: false, order: 5, enabled: true, section: 'business_info', placeholder: 'e.g. Retail Shop, Transport' },
                { key: 'whyFranchise', label: 'Why do you want this Franchise?', type: 'textarea', required: false, order: 6, enabled: true, section: 'business_info', placeholder: 'Tell us your motivation...' },
            ],
            requiredDocuments: [
                { key: 'aadhaar', label: 'Aadhaar Card', description: 'Front side of Aadhaar card', required: true, order: 1, enabled: true, acceptedFormats: 'image/*,.pdf', maxSizeMB: 5 },
                { key: 'pan', label: 'PAN Card', description: 'Clear photo of PAN card', required: true, order: 2, enabled: true, acceptedFormats: 'image/*,.pdf', maxSizeMB: 5 },
                { key: 'businessProof', label: 'Business Address Proof', description: 'GST certificate, Shop Act, or Utility Bill', required: false, order: 3, enabled: true, acceptedFormats: 'image/*,.pdf', maxSizeMB: 10 },
                { key: 'selfie', label: 'Applicant Selfie', description: 'Clear selfie of the applicant', required: false, order: 4, enabled: true, acceptedFormats: 'image/*', maxSizeMB: 5 },
            ],
        });
    }
    return config;
};

const FranchiseFormConfig = mongoose.model('FranchiseFormConfig', franchiseFormConfigSchema);
export default FranchiseFormConfig;
