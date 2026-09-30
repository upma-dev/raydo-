import mongoose from 'mongoose';

const maintenanceSettingSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      required: true,
      enum: ['food', 'taxi', 'all'],
    },
    serviceType: {
      type: String,
      required: true,
      default: 'all',
      // 'all', 'ride', 'rental', 'outstation', 'pooling', 'delivery', etc.
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      // null means 'All Zones'
    },
    isMaintenance: {
      type: Boolean,
      default: true,
    },
    maintenanceMessage: {
      type: String,
      default: 'Service is currently under maintenance. Please try again later.',
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one setting per module + serviceType + zone combination
maintenanceSettingSchema.index({ module: 1, serviceType: 1, zoneId: 1 }, { unique: true });

export const MaintenanceSetting = mongoose.model('MaintenanceSetting', maintenanceSettingSchema);
