import mongoose from 'mongoose';
import { FranchiseTerritory } from './franchiseTerritory.model.js';
import { FranchiseAudit } from './franchiseAudit.model.js';

const DeliveryPartner = mongoose.model('FoodDeliveryPartner');

const getFranchiseId = (req) => req.query.franchiseId || req.body.franchiseId || req.user.franchiseId;

export const getDeliveryPartnersList = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { page = 1, limit = 20, search, status } = req.query;
        
        const query = { franchiseId: new mongoose.Types.ObjectId(franchiseId) };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) {
            query.status = status;
        }

        const total = await DeliveryPartner.countDocuments(query);
        const partners = await DeliveryPartner.find(query)
            .select('name phone vehicleType status territoryId createdAt availabilityStatus')
            .populate('territoryId', 'name')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: partners,
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

export const getDeliveryPartnerById = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const partner = await DeliveryPartner.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        }).populate('territoryId');

        if (!partner) return res.status(404).json({ success: false, message: 'Delivery Partner not found' });

        return res.status(200).json({ success: true, data: partner });
    } catch (error) {
        next(error);
    }
};

export const createDeliveryPartner = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { territoryId } = req.body;

        if (territoryId) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        const newPartner = new DeliveryPartner({
            ...req.body,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            territoryId: territoryId ? new mongoose.Types.ObjectId(territoryId) : null,
            status: 'approved'
        });

        await newPartner.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Delivery Partner Created',
            entity: 'FoodDeliveryPartner',
            entityId: newPartner._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(201).json({ success: true, data: newPartner, message: 'Delivery Partner created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateDeliveryPartner = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { territoryId } = req.body;

        const partner = await DeliveryPartner.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        if (!partner) return res.status(404).json({ success: false, message: 'Delivery Partner not found' });

        if (territoryId && territoryId !== partner.territoryId?.toString()) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        Object.assign(partner, req.body);
        partner.franchiseId = new mongoose.Types.ObjectId(franchiseId);

        await partner.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Delivery Partner Updated',
            entity: 'FoodDeliveryPartner',
            entityId: partner._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(200).json({ success: true, data: partner, message: 'Delivery Partner updated successfully' });
    } catch (error) {
        next(error);
    }
};
