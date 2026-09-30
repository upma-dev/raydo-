import mongoose from 'mongoose';
import { Franchise } from '../src/core/franchise/franchise.model.js';
import { franchiseIsolation } from '../src/core/franchise/franchiseIsolation.middleware.js';

// Mock request/response objects to test middleware isolation rules
const createMockReq = (user, method = 'GET', query = {}, body = {}) => ({
    user,
    method,
    query,
    body
});

const createMockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

async function runSecurityTests() {
    console.log('--- RUNNING FRANCHISE SECURITY ISOLATION TESTS ---');

    // 1. Setup Mock Users
    const superAdmin = { adminLevel: 'platform_superadmin', role: 'PLATFORM_SUPERADMIN' };
    const franchiseA_Admin = { adminLevel: 'franchise_admin', role: 'FRANCHISE_ADMIN', franchiseId: new mongoose.Types.ObjectId() };
    const franchiseB_Admin = { adminLevel: 'franchise_admin', role: 'FRANCHISE_ADMIN', franchiseId: new mongoose.Types.ObjectId() };

    let passed = 0;
    let failed = 0;

    const assert = (condition, testName) => {
        if (condition) {
            console.log(`✅ PASS: ${testName}`);
            passed++;
        } else {
            console.log(`❌ FAIL: ${testName}`);
            failed++;
        }
    };

    // Test A: Franchise A requests records, isolation should force their ID
    const reqA = createMockReq(franchiseA_Admin, 'GET');
    const resA = createMockRes();
    franchiseIsolation(reqA, resA, () => {});
    assert(reqA.query.franchiseId === franchiseA_Admin.franchiseId.toString(), 'Franchise A isolation forces Franchise A ID');

    // Test B: Franchise A explicitly tries to send Franchise B ID in query
    const reqB = createMockReq(franchiseA_Admin, 'GET', { franchiseId: franchiseB_Admin.franchiseId.toString() });
    const resB = createMockRes();
    franchiseIsolation(reqB, resB, () => {});
    assert(reqB.query.franchiseId === franchiseA_Admin.franchiseId.toString(), 'Cross-franchise query attack overridden by middleware');

    // Test C: Franchise A tries to POST to Franchise B
    const reqC = createMockReq(franchiseA_Admin, 'POST', {}, { franchiseId: franchiseB_Admin.franchiseId.toString() });
    const resC = createMockRes();
    franchiseIsolation(reqC, resC, () => {});
    assert(reqC.body.franchiseId === franchiseA_Admin.franchiseId.toString(), 'Cross-franchise body attack overridden by middleware');

    // Test D: Super Admin requests records (no isolation applied)
    const reqD = createMockReq(superAdmin, 'GET');
    const resD = createMockRes();
    franchiseIsolation(reqD, resD, () => {});
    assert(reqD.query.franchiseId === undefined, 'Super Admin bypasses isolation');

    // Test E: Unauthenticated request (should proceed to standard auth check without isolation forcing)
    const reqE = createMockReq(null, 'GET');
    const resE = createMockRes();
    franchiseIsolation(reqE, resE, () => {});
    assert(reqE.query.franchiseId === undefined, 'Unauthenticated request untouched by isolation (handled by auth)');

    console.log(`\nTests Complete: ${passed} Passed, ${failed} Failed`);
}

runSecurityTests().catch(console.error);
