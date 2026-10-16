import mongoose from 'mongoose';

const ownerSchema = new mongoose.Schema(
  {
    company_name: {
      type: String,
      required: true,
      trim: true,
    },
    legacy_id: {
      type: String,
      default: '',
      trim: true,
    },
    user_id: {
      type: Number,
      default: null,
    },
    owner_name: {
      type: String,
      default: null,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    surname: {
      type: String,
      default: null,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      default: null,
      minlength: 6,
      select: false,
    },
    service_location_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxiServiceLocation',
      default: null,
    },
    legacy_service_location_id: {
      type: String,
      default: '',
      trim: true,
    },
    transport_type: {
      type: String,
      default: 'taxi',
      trim: true,
    },
    phone: {
      type: String,
      default: null,
      trim: true,
    },
    address: {
      type: String,
      default: null,
      trim: true,
    },
    postal_code: {
      type: String,
      default: null,
      trim: true,
    },
    city: {
      type: String,
      default: null,
      trim: true,
    },
    expiry_date: {
      type: Date,
      default: null,
    },
    no_of_vehicles: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax_number: {
      type: String,
      default: null,
      trim: true,
    },
    bank_name: {
      type: String,
      default: null,
      trim: true,
    },
    ifsc: {
      type: String,
      default: null,
      trim: true,
    },
    account_no: {
      type: String,
      default: null,
      trim: true,
    },
    iban: {
      type: String,
      default: null,
      trim: true,
    },
    bic: {
      type: String,
      default: null,
      trim: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    approve: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      default: 'pending',
      trim: true,
    },
    fcmTokenWeb: {
      type: String,
      default: '',
      trim: true,
    },
    fcmTokenMobile: {
      type: String,
      default: '',
      trim: true,
    },
    wallet: {
      balance: {
        type: Number,
        default: 0,
      }
    },
    // How fleet ride earnings are shared between the owner and the fleet driver (set by admin).
    //  salary: owner keeps 100% of the net ride earning and pays the driver a salary outside the app
    //  split:  owner keeps owner_share_percent of the net earning, the driver wallet gets the rest
    earning_settings: {
      model: {
        type: String,
        enum: ['salary', 'split'],
        default: 'salary',
      },
      owner_share_percent: {
        type: Number,
        default: 100,
        min: 0,
        max: 100,
      },
      updated_at: {
        type: Date,
        default: null,
      },
    },
    area_snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    user_snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true },
);

ownerSchema.index({ company_name: 1 });
ownerSchema.index({ service_location_id: 1 });
ownerSchema.index({ legacy_id: 1 }, { sparse: true });

export const Owner = mongoose.models.TaxiOwner || mongoose.model('TaxiOwner', ownerSchema);
