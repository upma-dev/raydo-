import mongoose from 'mongoose';
import { FranchiseTerritory } from './franchiseTerritory.model.js';
import { FranchiseAudit } from './franchiseAudit.model.js';

const FleetVehicle = mongoose.model('TaxiFleetVehicle');

const getFranchiseId = (req) => req.query.franchiseId || req.body.franchiseId || req.user.franchiseId;

export const getVehiclesList = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { page = 1, limit = 20, search, status } = req.query;
        
        const query = { franchiseId: new mongoose.Types.ObjectId(franchiseId) };

        if (search) {
            query.$or = [
                { license_plate_number: { $regex: search, $options: 'i' } },
                { car_model: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) {
            query.status = status;
        }

        const total = await FleetVehicle.countDocuments(query);
        const vehicles = await FleetVehicle.find(query)
            .select('license_plate_number car_brand car_model transport_type status territoryId createdAt')
            .populate('territoryId', 'name')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: vehicles,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

export const getVehicleById = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const vehicle = await FleetVehicle.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        }).populate('territoryId');

        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

        return res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        next(error);
    }
};

export const createVehicle = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { territoryId, license_plate_number } = req.body;

        const existing = await FleetVehicle.findOne({ license_plate_number: license_plate_number.toUpperCase() });
        if (existing) return res.status(400).json({ success: false, message: 'License plate already registered' });

        if (territoryId) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        const newVehicle = new FleetVehicle({
            ...req.body,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            territoryId: territoryId ? new mongoose.Types.ObjectId(territoryId) : null,
            status: 'approved'
        });

        await newVehicle.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Vehicle Created',
            entity: 'TaxiFleetVehicle',
            entityId: newVehicle._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(201).json({ success: true, data: newVehicle, message: 'Vehicle created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateVehicle = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { territoryId } = req.body;

        const vehicle = await FleetVehicle.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

        if (territoryId && territoryId !== vehicle.territoryId?.toString()) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        Object.assign(vehicle, req.body);
        vehicle.franchiseId = new mongoose.Types.ObjectId(franchiseId);

        await vehicle.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Vehicle Updated',
            entity: 'TaxiFleetVehicle',
            entityId: vehicle._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(200).json({ success: true, data: vehicle, message: 'Vehicle updated successfully' });
    } catch (error) {
        next(error);
    }
};
