import mongoose from 'mongoose';
import { franchiseIsolation } from '../src/core/franchise/franchiseIsolation.middleware.js';

// Mock models and data for testing logic
const createMockReq = (user, method = 'GET', query = {}, body = {}, params = {}) => ({
    user,
    method,
    query,
    body,
    params
});

const createMockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
};

async function runPhase2BSecurityTests() {
    console.log('--- RUNNING PHASE 2B ISOLATION & SECURITY TESTS ---');

    const fA = new mongoose.Types.ObjectId();
    const fB = new mongoose.Types.ObjectId();

    const superAdmin = { adminLevel: 'platform_superadmin', role: 'PLATFORM_SUPERADMIN' };
    const staffA = { adminLevel: 'franchise_admin', role: 'FRANCHISE_STAFF', franchiseId: fA };
    const staffB = { adminLevel: 'franchise_admin', role: 'FRANCHISE_STAFF', franchiseId: fB };

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

    // Test: Franchise A sees Restaurant A (via implicit franchiseId set by middleware)
    const req1 = createMockReq(staffA, 'GET');
    const res1 = createMockRes();
    franchiseIsolation(req1, res1, () => {});
    assert(req1.query.franchiseId === fA.toString(), 'Franchise A sees Restaurant A (isolated ID set)');

    // Test: Franchise A sees Delivery Partner B (attempts to override query)
    const req2 = createMockReq(staffA, 'GET', { franchiseId: fB.toString() });
    const res2 = createMockRes();
    franchiseIsolation(req2, res2, () => {});
    assert(req2.query.franchiseId === fA.toString(), 'Franchise A sees Delivery Partner B (DENIED/OVERRIDDEN)');

    // Test: Franchise A edits Vehicle B (attempts to override body)
    const req3 = createMockReq(staffA, 'PATCH', {}, { franchiseId: fB.toString() });
    const res3 = createMockRes();
    franchiseIsolation(req3, res3, () => {});
    assert(req3.body.franchiseId === fA.toString(), 'Franchise A edits Vehicle B (DENIED/OVERRIDDEN)');

    // Test: Super Admin sees both franchises' restaurants
    const req5 = createMockReq(superAdmin, 'GET');
    const res5 = createMockRes();
    franchiseIsolation(req5, res5, () => {});
    assert(req5.query.franchiseId === undefined, 'Super Admin bypasses isolation (ALLOWED to see all)');

    console.log(`\nPhase 2B Tests Complete: ${passed} Passed, ${failed} Failed`);
}

runPhase2BSecurityTests().catch(console.error);
