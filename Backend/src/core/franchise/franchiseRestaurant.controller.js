import mongoose from 'mongoose';
import { FranchiseTerritory } from './franchiseTerritory.model.js';
import { FranchiseAudit } from './franchiseAudit.model.js';

const FoodRestaurant = mongoose.model('FoodRestaurant');

const getFranchiseId = (req) => req.query.franchiseId || req.body.franchiseId || req.user.franchiseId;

export const getRestaurantsList = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { page = 1, limit = 20, search, status } = req.query;
        
        const query = { franchiseId: new mongoose.Types.ObjectId(franchiseId) };

        if (search) {
            query.$or = [
                { restaurantName: { $regex: search, $options: 'i' } },
                { ownerName: { $regex: search, $options: 'i' } },
                { ownerPhone: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) {
            query.status = status;
        }

        const total = await FoodRestaurant.countDocuments(query);
        const restaurants = await FoodRestaurant.find(query)
            .select('restaurantName ownerName ownerPhone status isAcceptingOrders territoryId city createdAt')
            .populate('territoryId', 'name')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: restaurants,
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

export const getRestaurantById = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const restaurant = await FoodRestaurant.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        }).populate('territoryId');

        if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

        return res.status(200).json({ success: true, data: restaurant });
    } catch (error) {
        next(error);
    }
};

export const createRestaurant = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { restaurantName, ownerName, ownerPhone, territoryId } = req.body;

        if (territoryId) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        const newRestaurant = new FoodRestaurant({
            ...req.body,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            territoryId: territoryId ? new mongoose.Types.ObjectId(territoryId) : null,
            status: 'approved'
        });

        await newRestaurant.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Restaurant Created',
            entity: 'FoodRestaurant',
            entityId: newRestaurant._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(201).json({ success: true, data: newRestaurant, message: 'Restaurant created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateRestaurant = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { territoryId } = req.body;

        const restaurant = await FoodRestaurant.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

        if (territoryId && territoryId !== restaurant.territoryId?.toString()) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        Object.assign(restaurant, req.body);
        
        // Ensure franchise ownership cannot be hijacked via req.body
        restaurant.franchiseId = new mongoose.Types.ObjectId(franchiseId);

        await restaurant.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Restaurant Updated',
            entity: 'FoodRestaurant',
            entityId: restaurant._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(200).json({ success: true, data: restaurant, message: 'Restaurant updated successfully' });
    } catch (error) {
        next(error);
    }
};
