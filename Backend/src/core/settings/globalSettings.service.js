import { FoodBusinessSettings } from '../../modules/food/admin/models/businessSettings.model.js';
import { AdminBusinessSetting as TaxiBusinessSetting } from '../../modules/taxi/admin/models/AdminBusinessSetting.js';
import { createDefaultBusinessSettings as createTaxiDefaults } from '../../modules/taxi/admin/data/defaultBusinessSettings.js';
import { config } from '../../config/env.js';
import { getActivePaymentGateway, resolveConfiguredGatewayCredentials } from '../../modules/taxi/services/paymentGatewayService.js';
import { getAdminPageByKey, upsertLegalPage, upsertAboutPage } from '../../modules/food/admin/services/pageContent.service.js';

/**
 * GLOBAL SETTINGS - one screen / one API for brand, contact, colours and legal text.
 *
 * Storage is unchanged (so every existing Food and Taxi screen keeps working); this service is the single
 * place that reads from and writes to BOTH stores, so the two apps can never drift apart:
 *   brand + contact  -> FoodBusinessSettings  AND  Taxi general settings
 *   colours          -> Taxi customization (Food has no server-side theme store)
 *   legal / privacy  -> FoodPageContent (already the only copy; Taxi pages read the same documents)
 */

class SettingsError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Shown on both apps. Keys are the existing FoodPageContent keys.
export const LEGAL_DOCUMENTS = [
    { key: 'privacy', label: 'Privacy Policy', audience: 'Customers (Food + Taxi)' },
    { key: 'terms', label: 'Terms & Conditions', audience: 'Customers (Food + Taxi)' },
    { key: 'refund', label: 'Refund Policy', audience: 'Customers (Food + Taxi)' },
    { key: 'cancellation', label: 'Cancellation Policy', audience: 'Customers (Food + Taxi)' },
    { key: 'shipping', label: 'Shipping Policy', audience: 'Customers (Food)' },
    { key: 'driver_privacy', label: 'Driver Privacy Policy', audience: 'Taxi drivers' },
    { key: 'driver_terms', label: 'Driver Terms & Conditions', audience: 'Taxi drivers' },
    { key: 'restaurant_privacy', label: 'Restaurant Privacy Policy', audience: 'Restaurant partners' },
    { key: 'restaurant_terms', label: 'Restaurant Terms & Conditions', audience: 'Restaurant partners' },
    { key: 'delivery_privacy', label: 'Delivery Partner Privacy Policy', audience: 'Delivery partners' },
    { key: 'delivery_terms', label: 'Delivery Partner Terms & Conditions', audience: 'Delivery partners' },
];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const str = (v) => (typeof v === 'string' ? v.trim() : '');

async function getFoodSettings() {
    let doc = await FoodBusinessSettings.findOne();
    if (!doc) doc = await FoodBusinessSettings.create({ companyName: 'Raydo', email: 'admin@raydo.com' });
    return doc;
}

async function getTaxiSettings() {
    let doc = await TaxiBusinessSetting.findOne({ scope: 'default' });
    if (!doc) doc = await TaxiBusinessSetting.create(createTaxiDefaults());
    return doc;
}

export async function getGlobalSettings() {
    const [food, taxi] = await Promise.all([getFoodSettings(), getTaxiSettings()]);
    const general = taxi.general || {};
    const custom = taxi.customization || {};

    return {
        brand: {
            appName: food.companyName || general.app_name || 'Raydo',
            email: food.email || '',
            phoneCountryCode: food.phone?.countryCode || '+91',
            phone: food.phone?.number || '',
            bookingPhone: general.contact_booking_number || '',
            address: food.address || '',
            state: food.state || '',
            pincode: food.pincode || '',
            region: food.region || 'India',
            footerText: general.footer_1 || '',
            logo: food.logo?.url || general.logo || '',
            favicon: food.favicon?.url || general.favicon || '',
        },
        appearance: {
            primaryColor: custom.admin_theme_color || '#405189',
            accentColor: custom.landing_theme_color || '#0ab39c',
            currencySymbol: custom.currency_symbol || '₹',
        },
        // Tells the admin whether the two apps currently agree (useful right after this screen is first used)
        inSync: {
            appName: (food.companyName || '') === (general.app_name || ''),
            phone: (food.phone?.number || '') === (general.contact_phone_1 || ''),
            logo: (food.logo?.url || '') === (general.logo || ''),
        },
        legalDocuments: LEGAL_DOCUMENTS,
        updatedAt: food.updatedAt,
    };
}

export async function updateGlobalSettings(body = {}) {
    const brand = body.brand || {};
    const appearance = body.appearance || {};

    // ---- validate first, write after (so a bad field never leaves the apps half-updated)
    if (brand.appName !== undefined && (str(brand.appName).length < 2 || str(brand.appName).length > 50)) {
        throw new SettingsError('App name must be between 2 and 50 characters');
    }
    if (brand.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(brand.email))) throw new SettingsError('Invalid email address');
    if (brand.phone && !/^\d{7,15}$/.test(str(brand.phone))) throw new SettingsError('Phone must be 7-15 digits');
    if (brand.bookingPhone && !/^\d{7,15}$/.test(str(brand.bookingPhone))) throw new SettingsError('Booking phone must be 7-15 digits');
    if (brand.address && String(brand.address).length > 250) throw new SettingsError('Address is too long (max 250 characters)');
    if (brand.pincode && !/^\d{4,10}$/.test(str(brand.pincode))) throw new SettingsError('Pincode must be 4-10 digits');
    ['primaryColor', 'accentColor'].forEach((k) => {
        if (appearance[k] !== undefined && !HEX.test(str(appearance[k]))) throw new SettingsError('Colours must be hex values like #405189');
    });

    const [food, taxi] = await Promise.all([getFoodSettings(), getTaxiSettings()]);

    // ---- Food store
    if (brand.appName !== undefined) food.companyName = str(brand.appName);
    if (brand.email !== undefined && str(brand.email)) food.email = str(brand.email);
    if (brand.phone !== undefined || brand.phoneCountryCode !== undefined) {
        food.phone = {
            countryCode: str(brand.phoneCountryCode) || food.phone?.countryCode || '+91',
            number: brand.phone !== undefined ? str(brand.phone) : food.phone?.number || '',
        };
    }
    if (brand.address !== undefined) food.address = String(brand.address);
    if (brand.state !== undefined) food.state = str(brand.state);
    if (brand.pincode !== undefined) food.pincode = str(brand.pincode);
    if (brand.region !== undefined && str(brand.region)) food.region = str(brand.region);

    const applyEverywhere = body.applyLogoEverywhere !== false;
    if (brand.logo !== undefined) {
        const url = str(brand.logo);
        food.logo = { url, publicId: '' };
        if (applyEverywhere) {
            ['userLogo', 'deliveryLogo', 'driverLogo', 'restaurantLogo', 'adminLogo'].forEach((f) => { food[f] = { url, publicId: '' }; });
        }
    }
    if (brand.favicon !== undefined) food.favicon = { url: str(brand.favicon), publicId: '' };

    // ---- Taxi store
    const general = { ...(taxi.general || {}) };
    if (brand.appName !== undefined) general.app_name = str(brand.appName);
    if (brand.phone !== undefined) general.contact_phone_1 = str(brand.phone);
    if (brand.bookingPhone !== undefined) general.contact_booking_number = str(brand.bookingPhone);
    if (brand.footerText !== undefined) general.footer_1 = str(brand.footerText);
    if (brand.logo !== undefined) {
        general.logo = str(brand.logo);
        general.footer_logo = str(brand.logo);
    }
    if (brand.favicon !== undefined) general.favicon = str(brand.favicon);
    taxi.general = general;
    taxi.markModified('general');

    const custom = { ...(taxi.customization || {}) };
    if (appearance.primaryColor !== undefined) custom.admin_theme_color = str(appearance.primaryColor);
    if (appearance.accentColor !== undefined) custom.landing_theme_color = str(appearance.accentColor);
    if (appearance.currencySymbol !== undefined && str(appearance.currencySymbol)) custom.currency_symbol = str(appearance.currencySymbol);
    taxi.customization = custom;
    taxi.markModified('customization');

    await Promise.all([food.save(), taxi.save()]);
    return getGlobalSettings();
}

// ---- Legal / privacy ---------------------------------------------------------

const LEGAL_KEYS = new Set(LEGAL_DOCUMENTS.map((d) => d.key));

export async function getLegalDocument(key) {
    if (!LEGAL_KEYS.has(key)) throw new SettingsError('Unknown document');
    const { data } = await getAdminPageByKey(key);
    return { key, title: data?.title || '', content: data?.content || '' };
}

export async function saveLegalDocument(key, { title, content } = {}, adminId = null) {
    if (!LEGAL_KEYS.has(key)) throw new SettingsError('Unknown document');
    if (!str(title)) throw new SettingsError('Title is required');
    const saved = await upsertLegalPage(key, { title, content }, adminId);
    return { key, title: saved.data?.title || '', content: saved.data?.content || '' };
}

/** Keep the "About" page name in step with the brand name. */
export async function syncAboutName(appName, adminId = null) {
    try {
        const { data } = await getAdminPageByKey('about');
        await upsertAboutPage({ ...(data || {}), appName }, adminId);
    } catch {
        // About page is optional; never block a settings save because of it
    }
}

// ---- Integrations & payments (READ-ONLY status) -----------------------------------------------
//
// These services are one real-world resource shared by Food and Taxi (one Razorpay account, one SMS provider,
// one Firebase project...). Their secrets live in the server .env, so this screen only REPORTS what is
// configured - it never returns a secret, only "set / not set" and a masked tail.

const mask = (v) => {
    const t = String(v || '').trim();
    if (!t) return '';
    return t.length <= 8 ? '****' : `${t.slice(0, 8)}...${t.slice(-4)}`;
};
const razorMode = (keyId) => (String(keyId).startsWith('rzp_live_') ? 'live' : String(keyId).startsWith('rzp_test_') ? 'test' : 'unknown');
const has = (v) => Boolean(String(v || '').trim());

export async function getIntegrationsStatus() {
    // --- Razorpay: Food reads only .env; Taxi reads its own DB keys first and falls back to .env
    const foodKeyId = String(config.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '').trim();
    const foodSecretSet = has(config.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET);

    let taxi = { gateway: null, enabled: false, keyId: '', source: 'none', error: '' };
    try {
        const active = await getActivePaymentGateway();
        taxi.gateway = active?.slug || null;
        taxi.enabled = Boolean(active);
        if (active?.slug === 'razor_pay') {
            const creds = await resolveConfiguredGatewayCredentials('razor_pay');
            taxi.keyId = creds.keyId;
            taxi.source = creds.keyId === foodKeyId ? 'env' : 'taxi_admin_db';
        }
    } catch (err) {
        taxi.error = err?.message || 'Could not resolve Taxi payment keys';
    }

    const taxiUsesRazorpay = taxi.gateway === 'razor_pay' && Boolean(taxi.keyId);
    const sameAccount = foodKeyId && taxiUsesRazorpay ? foodKeyId === taxi.keyId : null;
    const razorpayWarnings = [];
    if (!foodKeyId || !foodSecretSet) razorpayWarnings.push('Food has no Razorpay keys in the server .env, so Food online payments cannot work.');
    if (sameAccount === false) razorpayWarnings.push('Food and Taxi are charging to DIFFERENT Razorpay accounts. Food uses the .env keys, Taxi uses keys saved in Taxi > Payment Gateway Settings. The webhook secret in .env only verifies the .env account.');
    if (taxi.gateway && taxi.gateway !== 'razor_pay') razorpayWarnings.push(`Taxi's active gateway is "${taxi.gateway}", not Razorpay.`);
    if (taxi.error) razorpayWarnings.push(`Taxi payment keys problem: ${taxi.error}`);
    if (!has(config.razorpayWebhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET)) razorpayWarnings.push('RAZORPAY_WEBHOOK_SECRET is not set, so Razorpay webhooks cannot be verified.');

    const smsKeyInEnv = has(config.smsApiKey || process.env.SMS_INDIA_HUB_API_KEY);
    const firebaseOk = has(config.firebaseServiceAccount) || has(config.firebaseServiceAccountPath);
    const mapsOk = has(process.env.GOOGLE_MAPS_API_KEY);
    const mailOk = has(config.emailHost) && has(config.emailUser) && has(process.env.EMAIL_PASS);
    const cloudOk = has(config.cloudinaryCloudName) && has(config.cloudinaryApiKey) && has(config.cloudinaryApiSecret);

    return {
        razorpay: {
            food: { configured: Boolean(foodKeyId && foodSecretSet), keyId: mask(foodKeyId), mode: foodKeyId ? razorMode(foodKeyId) : '', source: '.env' },
            taxi: { configured: taxiUsesRazorpay, activeGateway: taxi.gateway, keyId: mask(taxi.keyId), mode: taxi.keyId ? razorMode(taxi.keyId) : '', source: taxi.source === 'taxi_admin_db' ? 'Taxi admin screen (database)' : taxi.source === 'env' ? '.env (same as Food)' : '' },
            sameAccount,
            webhookSecretSet: has(config.razorpayWebhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET),
            warnings: razorpayWarnings,
        },
        services: [
            { key: 'sms', label: 'SMS / OTP provider', provider: 'SMS India Hub', usedBy: 'Food + Taxi OTP login', configured: smsKeyInEnv, managedIn: 'Server .env (SMS_INDIA_HUB_*)',
              warning: smsKeyInEnv ? '' : 'SMS keys are NOT in the .env. OTP currently works only because a fallback key is written inside the Taxi source code. Move it to the .env and rotate that key.' },
            { key: 'firebase', label: 'Push notifications (Firebase)', provider: config.firebaseProjectId || 'Firebase', usedBy: 'Food + Taxi push', configured: firebaseOk, managedIn: 'Server .env (FIREBASE_*)', warning: firebaseOk ? '' : 'Firebase service account is not configured.' },
            { key: 'maps', label: 'Google Maps', provider: 'Google Maps', usedBy: 'Food + Taxi maps, zones, distance', configured: mapsOk, managedIn: 'Server .env (GOOGLE_MAPS_API_KEY)', warning: mapsOk ? '' : 'GOOGLE_MAPS_API_KEY is not set.' },
            { key: 'mail', label: 'Email (SMTP)', provider: config.emailHost || '', usedBy: 'Admin password reset, emails', configured: mailOk, managedIn: 'Server .env (EMAIL_*)', warning: mailOk ? '' : 'EMAIL_HOST / EMAIL_USER / EMAIL_PASS are not all set.' },
            { key: 'storage', label: 'Image storage (Cloudinary)', provider: config.cloudinaryCloudName || '', usedBy: 'Logos, documents, photos', configured: cloudOk, managedIn: 'Server .env (CLOUDINARY_*)', warning: cloudOk ? '' : 'Cloudinary keys are not fully set.' },
        ],
    };
}
