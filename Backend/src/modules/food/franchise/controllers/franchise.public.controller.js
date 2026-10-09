import { sendResponse } from '../../../../utils/response.js';
import * as taxiService from '../../admin/services/franchiseTaxi.service.js';
import * as franchisePublicService from '../services/franchise.public.service.js';

// India states data (static)
const INDIA_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Major cities per state (condensed for quick load)
const STATE_CITIES = {
    'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded'],
    'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Mehsana'],
    'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Sikar', 'Pali'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Ghaziabad', 'Meerut', 'Allahabad', 'Bareilly', 'Aligarh', 'Moradabad'],
    'Madhya Pradesh': ['Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Ratlam', 'Rewa'],
    'Karnataka': ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shimoga', 'Tumkur'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Tiruppur', 'Vellore', 'Erode', 'Thoothukudi'],
    'West Bengal': ['Kolkata', 'Howrah', 'Asansol', 'Siliguri', 'Durgapur', 'Bardhaman', 'Malda', 'Baharampur', 'Habra', 'Kharagpur'],
    'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Karimnagar', 'Ramagundam', 'Khammam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet'],
    'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Kakinada', 'Tirupati', 'Anantapur', 'Kadapa'],
    'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Palakkad', 'Alappuzha', 'Malappuram', 'Kannur', 'Kasaragod'],
    'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Pathankot', 'Hoshiarpur', 'Batala', 'Moga'],
    'Haryana': ['Faridabad', 'Gurgaon', 'Panipat', 'Ambala', 'Yamunanagar', 'Rohtak', 'Hisar', 'Karnal', 'Sonipat', 'Panchkula'],
    'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia', 'Darbhanga', 'Bihar Sharif', 'Arrah', 'Begusarai', 'Katihar'],
    'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar', 'Phusro', 'Hazaribagh', 'Giridih', 'Ramgarh', 'Medininagar'],
    'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Brahmapur', 'Sambalpur', 'Puri', 'Balasore', 'Bhadrak', 'Baripada', 'Jharsuguda'],
    'Delhi': ['New Delhi', 'North Delhi', 'South Delhi', 'East Delhi', 'West Delhi', 'Central Delhi', 'Dwarka', 'Rohini', 'Janakpuri', 'Saket'],
    'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa', 'Ponda', 'Bicholim', 'Curchorem', 'Canacona'],
    'Himachal Pradesh': ['Shimla', 'Manali', 'Dharamshala', 'Solan', 'Mandi', 'Baddi', 'Palampur', 'Nahan', 'Kullu', 'Hamirpur'],
    'Uttarakhand': ['Dehradun', 'Haridwar', 'Roorkee', 'Haldwani', 'Kashipur', 'Rudrapur', 'Rishikesh', 'Kotdwar', 'Nainital', 'Mussoorie'],
    'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon', 'Tinsukia', 'Tezpur', 'Bongaigaon', 'Dhubri', 'Diphu'],
    'Chandigarh': ['Chandigarh'],
    'Chhattisgarh': ['Raipur', 'Bhilai', 'Korba', 'Bilaspur', 'Durg', 'Rajnandgaon', 'Jagdalpur', 'Raigarh', 'Ambikapur', 'Mahasamund'],
};

/**
 * GET /v1/franchise/form-config
 */
export async function getFormConfigController(req, res, next) {
    try {
        const config = await franchisePublicService.getPublicFormConfig();
        return sendResponse(res, 200, 'Form config fetched', config);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/franchise/states
 */
export function getStatesController(req, res) {
    return sendResponse(res, 200, 'States fetched', INDIA_STATES);
}

/**
 * GET /v1/franchise/cities?state=Maharashtra
 */
export function getCitiesController(req, res) {
    const rawState = String(req.query.state || '').trim().toLowerCase();
    const stateKey = Object.keys(STATE_CITIES).find(k => k.toLowerCase().trim() === rawState);
    let cities = stateKey ? STATE_CITIES[stateKey] : [];
    
    // Fallback default major Indian cities if state not found
    if (!cities || cities.length === 0) {
        cities = ['Indore', 'Bhopal', 'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Lucknow', 'Ahmedabad', 'Bengaluru', 'Hyderabad'];
    }
    return sendResponse(res, 200, 'Cities fetched', cities);
}

/**
 * GET /v1/franchise/pincodes?city=Pune (uses Postal API)
 */
export async function getPincodesController(req, res, next) {
    try {
        const { city } = req.query;
        if (!city) return sendResponse(res, 400, 'City is required', []);

        // Use India Post API to get pincodes for city
        const url = `https://api.postalpincode.in/postoffice/${encodeURIComponent(city)}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();

        let pincodes = [];
        if (data?.[0]?.Status === 'Success' && Array.isArray(data[0].PostOffice)) {
            pincodes = [...new Set(data[0].PostOffice.map(po => po.Pincode))].sort();
        }
        return sendResponse(res, 200, 'Pincodes fetched', pincodes);
    } catch (err) {
        // Fallback: return empty — UI will allow manual entry
        return sendResponse(res, 200, 'Pincodes fetched', []);
    }
}

/**
 * POST /v1/franchise/apply
 */
export async function submitApplicationController(req, res, next) {
    try {
        const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress;
        const application = await franchisePublicService.submitFranchiseApplication({
            ...req.body,
            ipAddress,
        });
        return sendResponse(res, 201, 'Application submitted successfully', {
            applicationId: application.applicationId,
            status: application.status,
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/franchise/status?applicationId=FRN-2024-0001&phone=9876543210
 */
export async function getApplicationStatusController(req, res, next) {
    try {
        const { applicationId, phone } = req.query;
        if (!applicationId || !phone) {
            return sendResponse(res, 400, 'applicationId and phone are required', null);
        }
        const status = await franchisePublicService.getApplicationStatus(applicationId, phone);
        if (!status) return sendResponse(res, 404, 'Application not found', null);
        return sendResponse(res, 200, 'Status fetched', status);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/franchise/partner-dashboard
 * Logged-in franchise (Bearer token) -> full dashboard.
 * applicationId + phone only          -> onboarding view (fee + payment options).
 */
const partnerTaxi = (fn, message) => async (req, res, next) => {
    try {
        // franchiseId always comes from the login, never from the request
        return sendResponse(res, 200, message, await fn(req.user.franchiseId, req.query));
    } catch (err) {
        next(err);
    }
};
export const getPartnerTaxiOverviewController = partnerTaxi((id) => taxiService.getTaxiOverview(id), 'Taxi overview fetched');
export const getPartnerTaxiRidesController = partnerTaxi((id, q) => taxiService.listTaxiRides(id, q), 'Taxi rides fetched');
export const getPartnerTaxiDriversController = partnerTaxi((id, q) => taxiService.listTaxiDrivers(id, q), 'Taxi drivers fetched');
export const getPartnerTaxiBusController = partnerTaxi((id, q) => taxiService.listTaxiBookings(id, q), 'Bookings fetched');

export async function getPartnerDashboardController(req, res, next) {
    try {
        const franchiseId = req.user?.franchiseId || null;
        const { applicationId, phone } = req.query;
        if (!franchiseId && (!applicationId || !phone)) {
            return sendResponse(res, 400, 'Application ID and Phone number are required', null);
        }
        const data = await franchisePublicService.getPartnerDashboardData(applicationId, phone, { franchiseId });
        if (!data) return sendResponse(res, 404, 'Franchise account not found with provided credentials', null);
        return sendResponse(res, 200, 'Partner dashboard data fetched', data);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /v1/franchise/submit-payment
 */
export async function submitPaymentDetailsController(req, res, next) {
    try {
        const { applicationId, phone, ...paymentData } = req.body;
        if (!applicationId || !phone) {
            return sendResponse(res, 400, 'applicationId and phone are required', null);
        }
        const data = await franchisePublicService.submitPaymentDetails(applicationId, phone, paymentData);
        return sendResponse(res, 200, 'Payment details submitted successfully', data);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /v1/franchise/create-razorpay-order
 */
export async function createRazorpayOrderController(req, res, next) {
    try {
        const { applicationId, phone } = req.body;
        if (!applicationId || !phone) {
            return sendResponse(res, 400, 'applicationId and phone are required', null);
        }
        const orderInfo = await franchisePublicService.createRazorpayOrderForFranchise(applicationId, phone);
        return sendResponse(res, 200, 'Razorpay order generated successfully', orderInfo);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /v1/franchise/verify-razorpay-payment
 */
export async function verifyRazorpayPaymentController(req, res, next) {
    try {
        const { applicationId, phone, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        if (!applicationId || !phone) {
            return sendResponse(res, 400, 'applicationId and phone are required', null);
        }
        const data = await franchisePublicService.verifyRazorpayPaymentForFranchise(applicationId, phone, {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });
        return sendResponse(res, 200, 'Razorpay payment verified & access granted successfully', data);
    } catch (err) {
        next(err);
    }
}

// ─── Logged-in franchise only (franchiseId is taken from the verified token) ──

/** POST /v1/franchise/support-message */
export async function submitPartnerSupportMessageController(req, res, next) {
    try {
        const { subject, message, priority } = req.body;
        const data = await franchisePublicService.submitPartnerSupportMessage(req.user.franchiseId, { subject, message, priority });
        return sendResponse(res, 200, 'Support message sent to Admin successfully', data);
    } catch (err) {
        next(err);
    }
}

/** POST /v1/franchise/payout-request */
export async function submitPartnerPayoutRequestController(req, res, next) {
    try {
        const data = await franchisePublicService.submitPartnerPayoutRequest(req.user.franchiseId, req.body || {});
        return sendResponse(res, 200, 'Payout withdrawal request submitted successfully', data);
    } catch (err) {
        next(err);
    }
}

/** POST /v1/franchise/refund-request/claim */
export async function claimRefundFromSuperAdminController(req, res, next) {
    try {
        const data = await franchisePublicService.claimRefundFromSuperAdmin(req.user.franchiseId, req.body || {});
        return sendResponse(res, 200, 'Refund claim request sent to SuperAdmin', data);
    } catch (err) {
        next(err);
    }
}

/** POST /v1/franchise/refund-request/process */
export async function processRestaurantRefundController(req, res, next) {
    try {
        const { refundId } = req.body;
        if (!refundId) return sendResponse(res, 400, 'refundId is required', null);
        const data = await franchisePublicService.processRestaurantRefund(req.user.franchiseId, refundId);
        return sendResponse(res, 200, 'Refund processed successfully', data);
    } catch (err) {
        next(err);
    }
}

/** POST /v1/franchise/bank-details */
export async function updatePartnerBankDetailsController(req, res, next) {
    try {
        const data = await franchisePublicService.updatePartnerBankDetails(req.user.franchiseId, req.body || {});
        return sendResponse(res, 200, 'Bank account details saved successfully', data);
    } catch (err) {
        next(err);
    }
}
