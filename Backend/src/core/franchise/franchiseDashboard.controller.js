import mongoose from 'mongoose';
import { Franchise } from './franchise.model.js';
import { FranchiseTerritory } from './franchiseTerritory.model.js';
import { FranchiseAudit } from './franchiseAudit.model.js';
import { FoodAdmin as Staff } from '../admin/admin.model.js';

// The Driver model is inside the Taxi module, but we can access it
// Since Phase 2A only requires TaxiDriver integration
const Driver = mongoose.model('TaxiDriver');

export const getOperationalDashboard = async (req, res, next) => {
    try {
        const query = {};
        
        // Data Isolation Enforcement
        // req.query.franchiseId is set by franchiseIsolation middleware if the user is a Franchise Admin
        const franchiseId = req.query.franchiseId || req.user.franchiseId;

        if (!franchiseId) {
            return res.status(403).json({ success: false, message: 'Franchise ID is required for dashboard' });
        }

        const fId = new mongoose.Types.ObjectId(franchiseId);

        // 1. Get Driver Stats
        const totalDrivers = await Driver.countDocuments({ franchiseId: fId, deletedAt: null });
        const activeDrivers = await Driver.countDocuments({ franchiseId: fId, status: 'approved', deletedAt: null });
        const pendingDrivers = await Driver.countDocuments({ franchiseId: fId, status: 'pending', deletedAt: null });
        const inactiveDrivers = await Driver.countDocuments({ franchiseId: fId, status: 'inactive', deletedAt: null });

        // 2. Get Staff Stats
        const totalStaff = await Staff.countDocuments({ franchiseId: fId });
        const activeStaff = await Staff.countDocuments({ franchiseId: fId, isActive: true });

        // Phase 2B Stats
        const FoodRestaurant = mongoose.model('FoodRestaurant');
        const DeliveryPartner = mongoose.model('FoodDeliveryPartner');
        const FleetVehicle = mongoose.model('TaxiFleetVehicle');

        const totalRestaurants = await FoodRestaurant.countDocuments({ franchiseId: fId });
        const totalDeliveryPartners = await DeliveryPartner.countDocuments({ franchiseId: fId });
        const totalVehicles = await FleetVehicle.countDocuments({ franchiseId: fId });

        // 3. Get Territory Info
        const territory = await FranchiseTerritory.findOne({ franchiseId: fId });

        // 4. Get Recent Activity
        const recentActivity = await FranchiseAudit.find({ entityId: fId }) // Or any activity related to this franchise
            .sort({ createdAt: -1 })
            .limit(5);

        return res.status(200).json({
            success: true,
            data: {
                drivers: {
                    total: totalDrivers,
                    active: activeDrivers,
                    inactive: inactiveDrivers,
                    pending: pendingDrivers
                },
                staff: {
                    total: totalStaff,
                    active: activeStaff
                },
                restaurants: {
                    total: totalRestaurants
                },
                deliveryPartners: {
                    total: totalDeliveryPartners
                },
                vehicles: {
                    total: totalVehicles
                },
                territory: territory ? {
                    assigned: true,
                    status: territory.status,
                    name: territory.name
                } : {
                    assigned: false,
                    status: null,
                    name: 'No territory assigned'
                },
                recentActivity
            }
        });

    } catch (error) {
        next(error);
    }
};
