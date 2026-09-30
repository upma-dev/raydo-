import mongoose from 'mongoose';
import { FoodAdmin as Staff } from '../admin/admin.model.js';
import { ADMIN_LEVELS } from '../admin/adminHierarchy.constants.js';

const getFranchiseId = (req) => req.query.franchiseId || req.body.franchiseId || req.user.franchiseId;

export const getStaffList = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { page = 1, limit = 20 } = req.query;
        
        const query = { franchiseId: new mongoose.Types.ObjectId(franchiseId) };

        const total = await Staff.countDocuments(query);
        const staff = await Staff.find(query)
            .select('-password -fcmTokens -fcmTokenMobile')
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: staff,
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

export const getStaffById = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const staff = await Staff.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        }).select('-password');

        if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });

        return res.status(200).json({ success: true, data: staff });
    } catch (error) {
        next(error);
    }
};

export const createStaff = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { email, password, name, phone, permissions, isActive } = req.body;

        const existingUser = await Staff.findOne({ email });
        if (existingUser) return res.status(400).json({ success: false, message: 'Email already exists' });

        const newStaff = new Staff({
            email,
            password,
            name,
            phone,
            permissions: permissions || [],
            isActive: isActive !== undefined ? isActive : true,
            franchiseId: new mongoose.Types.ObjectId(franchiseId),
            adminLevel: ADMIN_LEVELS.FRANCHISE_ADMIN, // Defaulting to Franchise Admin layer for Staff
            role: 'FRANCHISE_STAFF',
            module: 'franchise'
        });

        await newStaff.save();

        const staffData = newStaff.toObject();
        delete staffData.password;

        return res.status(201).json({ success: true, data: staffData, message: 'Staff created successfully' });
    } catch (error) {
        next(error);
    }
};

export const updateStaff = async (req, res, next) => {
    try {
        const franchiseId = getFranchiseId(req);
        if (!franchiseId) return res.status(403).json({ success: false, message: 'Franchise ID required' });

        const { name, phone, permissions, isActive } = req.body;

        const staff = await Staff.findOne({ 
            _id: req.params.id,
            franchiseId: new mongoose.Types.ObjectId(franchiseId)
        });

        if (!staff) return res.status(404).json({ success: false, message: 'Staff not found' });

        if (name) staff.name = name;
        if (phone) staff.phone = phone;
        if (permissions) staff.permissions = permissions;
        if (isActive !== undefined) staff.isActive = isActive;

        await staff.save();

        const staffData = staff.toObject();
        delete staffData.password;

        return res.status(200).json({ success: true, data: staffData, message: 'Staff updated successfully' });
    } catch (error) {
        next(error);
    }
};
