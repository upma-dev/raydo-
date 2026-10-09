import { Router } from 'express';
import { adminRouter } from './adminRoutes.js';
import { taxiFranchiseRouter } from './taxiFranchiseRoutes.js';

export const adminModuleRouter = Router();

adminModuleRouter.use('/', adminRouter);
adminModuleRouter.use('/', taxiFranchiseRouter);
