import mongoose from 'mongoose';
import { FranchiseTerritory } from './franchiseTerritory.model.js';
import { FranchiseAudit } from './franchiseAudit.model.js';
import bcrypt from 'bcryptjs';

const Driver = mongoose.model('TaxiDriver');

const getFranchiseId = (req) => req.query.franchiseId || req.body.franchiseId || req.user.franchiseId;

export const getDriversList = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { page = 1, limit = 20, search, status } = req.query;
        
        const query = { franchiseId: new mongoose.Types.ObjectId(franchiseId), deletedAt: null };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (status) {
            query.status = status;
        }

        const total = await Driver.countDocuments(query);
        const drivers = await Driver.find(query)
            .select('name phone email status approve isOnline vehicleType vehicleNumber territoryId createdAt')
            .populate('territoryId', 'name')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: drivers,
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

export const getDriverById = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const driver = await Driver.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            deletedAt: null
        }).populate('territoryId');

        if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

        return res.status(200).json({ success: true, data: driver });
    } catch (error) {
        next(error);
    }
};

export const createDriver = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { name, phone, email, password, vehicleType, territoryId } = req.body;

        const existingDriver = await Driver.findOne({ phone, deletedAt: null });
        if (existingDriver) return res.status(400).json({ success: false, message: 'Phone number already registered' });

        if (territoryId) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newDriver = new Driver({
            name,
            phone,
            email,
            password: hashedPassword,
            vehicleType,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            territoryId: territoryId ? new mongoose.Types.ObjectId(territoryId) : null,
            status: 'approved',
            approve: true
        });

        await newDriver.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Driver Created',
            entity: 'TaxiDriver',
            entityId: newDriver._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        const driverData = newDriver.toObject();
        delete driverData.password;

        return res.status(201).json({ success: true, data: driverData, message: 'Driver created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateDriver = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { name, phone, email, status, approve, territoryId } = req.body;

        const driver = await Driver.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            deletedAt: null
        });

        if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });

        if (territoryId && territoryId !== driver.territoryId?.toString()) {
            const territory = await FranchiseTerritory.findOne({ 
                _id: territoryId,
                franchiseId: new mongoose.Types.ObjectId(franchiseId)
            });
            if (!territory) return res.status(400).json({ success: false, message: 'Invalid territory for this franchise' });
            driver.territoryId = territoryId;
        }

        if (name) driver.name = name;
        if (phone) driver.phone = phone;
        if (email) driver.email = email;
        if (status) driver.status = status;
        if (approve !== undefined) driver.approve = approve;

        await driver.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role,
            action: 'Driver Updated',
            entity: 'TaxiDriver',
            entityId: driver._id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        return res.status(200).json({ success: true, data: driver, message: 'Driver updated successfully' });
    } catch (error) {
        next(error);
    }
};
