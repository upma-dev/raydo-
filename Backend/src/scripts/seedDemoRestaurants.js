/**
 * Demo restaurants, categories, foods (and one pending rider + join request) for the demo franchises created by
 * seedDemoFranchises.js. Dev / test databases only. Safe to run again (skips what exists).
 *
 *   node src/scripts/seedDemoRestaurants.js
 *
 * For each demo franchise (in its own food zone):
 *  - 2 approved restaurants stamped with the franchise (+ menu of approved foods, 1 food waiting for approval)
 *  - 4 franchise categories
 *  - 1 restaurant join request (pending, not yet claimed) -> "New Joining Request" page
 *  - 1 delivery rider waiting for approval -> "Delivery riders" page
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data into a production environment.');
    process.exit(1);
}

const IMG = {
    biryani: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800',
    thali: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800',
    pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800',
    curry: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
    paneer: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=800',
    dessert: 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800',
    drink: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=800',
    starter: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800',
};

const DEMO = [
    {
        email: 'food.franchise@raydo.demo',
        city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001',
        restaurants: [
            {
                name: 'Demo Biryani House', owner: 'Arjun Mehta', phone: '9888000101', veg: false, cuisines: ['Biryani', 'Mughlai'], image: IMG.biryani,
                foods: [
                    ['Chicken Dum Biryani', 'Main Course', 249, 'Non-Veg', IMG.biryani, [['Half', 249], ['Full', 429]]],
                    ['Mutton Biryani', 'Main Course', 349, 'Non-Veg', IMG.biryani],
                    ['Veg Biryani', 'Main Course', 189, 'Veg', IMG.biryani],
                    ['Chicken 65', 'Starters', 199, 'Non-Veg', IMG.starter],
                    ['Gulab Jamun (2 pcs)', 'Desserts', 69, 'Veg', IMG.dessert],
                    ['Masala Chaas', 'Beverages', 49, 'Veg', IMG.drink],
                ],
                pendingFood: ['Hyderabadi Special Biryani', 'Main Course', 399, 'Non-Veg', IMG.biryani],
            },
            {
                name: 'Demo Veg Thali Point', owner: 'Sunita Sharma', phone: '9888000102', veg: true, cuisines: ['North Indian', 'Thali'], image: IMG.thali,
                foods: [
                    ['Special Veg Thali', 'Main Course', 199, 'Veg', IMG.thali],
                    ['Paneer Butter Masala', 'Main Course', 229, 'Veg', IMG.paneer],
                    ['Dal Makhani', 'Main Course', 179, 'Veg', IMG.curry],
                    ['Paneer Tikka', 'Starters', 219, 'Veg', IMG.paneer],
                    ['Rasmalai', 'Desserts', 89, 'Veg', IMG.dessert],
                ],
                pendingFood: ['Rajasthani Thali', 'Main Course', 259, 'Veg', IMG.thali],
            },
        ],
        joinRequest: { name: 'New Tandoor Junction (join request)', owner: 'Ravi Verma', phone: '9888000103' },
        rider: { name: 'Demo Rider Bhopal', phone: '9777000101', vehicleNumber: 'MP04DM0101' },
    },
    {
        email: 'both.franchise@raydo.demo',
        city: 'Orai', state: 'Uttar Pradesh', pincode: '285001',
        restaurants: [
            {
                name: 'Orai Spice Kitchen', owner: 'Mohit Gupta', phone: '9888000201', veg: false, cuisines: ['North Indian', 'Chinese'], image: IMG.curry,
                foods: [
                    ['Butter Chicken', 'Main Course', 289, 'Non-Veg', IMG.curry, [['Half', 289], ['Full', 499]]],
                    ['Kadai Paneer', 'Main Course', 239, 'Veg', IMG.paneer],
                    ['Veg Hakka Noodles', 'Main Course', 159, 'Veg', IMG.curry],
                    ['Chilli Chicken', 'Starters', 219, 'Non-Veg', IMG.starter],
                    ['Cold Coffee', 'Beverages', 99, 'Veg', IMG.drink],
                ],
                pendingFood: ['Chicken Manchurian', 'Starters', 229, 'Non-Veg', IMG.starter],
            },
            {
                name: 'Orai Pizza Point', owner: 'Neha Saxena', phone: '9888000202', veg: true, cuisines: ['Pizza', 'Fast Food'], image: IMG.pizza,
                foods: [
                    ['Margherita Pizza', 'Main Course', 199, 'Veg', IMG.pizza, [['Regular', 199], ['Medium', 349]]],
                    ['Farmhouse Pizza', 'Main Course', 299, 'Veg', IMG.pizza],
                    ['Garlic Bread', 'Starters', 119, 'Veg', IMG.starter],
                    ['Choco Lava Cake', 'Desserts', 99, 'Veg', IMG.dessert],
                ],
                pendingFood: ['Paneer Tikka Pizza', 'Main Course', 329, 'Veg', IMG.pizza],
            },
        ],
        joinRequest: { name: 'Orai Chaat Corner (join request)', owner: 'Deepak Yadav', phone: '9888000203' },
        rider: { name: 'Demo Rider Orai', phone: '9777000201', vehicleNumber: 'UP92DM0201' },
    },
];

const CATEGORIES = ['Starters', 'Main Course', 'Desserts', 'Beverages'];

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    await import('../app.js'); // registers all models
    const FranchiseApplication = mongoose.model('FranchiseApplication');
    const FoodZone = mongoose.model('FoodZone');
    const FoodRestaurant = mongoose.model('FoodRestaurant');
    const FoodCategory = mongoose.model('FoodCategory');
    const FoodItem = mongoose.model('FoodItem');
    const Rider = mongoose.model('FoodDeliveryPartner');
    const summary = [];

    for (const d of DEMO) {
        const app = await FranchiseApplication.findOne({ email: d.email }).lean();
        if (!app) { console.warn(`skip ${d.email}: run seedDemoFranchises.js first`); continue; }
        const zone = await FoodZone.findById(app.zoneId).lean();
        if (!zone) { console.warn(`skip ${d.email}: franchise has no food zone`); continue; }
        const lat0 = zone.coordinates.reduce((s, p) => s + p.latitude, 0) / zone.coordinates.length;
        const lng0 = zone.coordinates.reduce((s, p) => s + p.longitude, 0) / zone.coordinates.length;
        const spot = (i) => ({ lat: Math.round((lat0 + 0.004 * (i - 1)) * 1e6) / 1e6, lng: Math.round((lng0 + 0.003 * (i - 1)) * 1e6) / 1e6 });

        // Franchise categories
        const cat = {};
        for (const [i, name] of CATEGORIES.entries()) {
            let c = await FoodCategory.findOne({ name, franchiseId: app._id }).lean();
            if (!c) c = (await FoodCategory.create({ name, type: name.toLowerCase(), franchiseId: app._id, zoneId: app.zoneId, approvalStatus: 'approved', isApproved: true, approvedAt: new Date(), isActive: true, sortOrder: i })).toObject();
            cat[name] = c;
        }

        const restaurantDoc = (r, i, extra = {}) => {
            const p = spot(i);
            const address = `${r.name.replace(/ \(join request\)$/, '')}, Main Road, ${d.city}`;
            return {
                restaurantName: r.name, ownerName: r.owner, ownerPhone: r.phone, primaryContactNumber: r.phone,
                ownerEmail: `${r.phone}@raydo.demo`, pureVegRestaurant: Boolean(r.veg), isRestaurant: true,
                addressLine1: address, city: d.city, state: d.state, pincode: d.pincode,
                location: { type: 'Point', coordinates: [p.lng, p.lat], latitude: p.lat, longitude: p.lng, address, city: d.city, state: d.state, addressLine1: address, pincode: d.pincode },
                zoneId: app.zoneId, cuisines: r.cuisines || [], profileImage: r.image || IMG.thali, coverImages: [r.image || IMG.thali], menuImages: [],
                estimatedDeliveryTime: '30-40 mins', estimatedDeliveryTimeMinutes: 35, rating: 4.3, totalRatings: 40,
                isAcceptingOrders: true, isActive: true,
                ...extra,
            };
        };

        // Approved restaurants with menus
        for (const [i, r] of d.restaurants.entries()) {
            let rest = await FoodRestaurant.findOne({ restaurantName: r.name, franchiseId: app._id }).lean();
            if (!rest) {
                rest = (await FoodRestaurant.create(restaurantDoc(r, i, { status: 'approved', approvedAt: new Date(), franchiseId: app._id }))).toObject();
            }
            let made = 0;
            const addFood = async ([name, category, price, foodType, image, variants], approvalStatus) => {
                if (await FoodItem.exists({ restaurantId: rest._id, name })) return;
                await FoodItem.create({
                    restaurantId: rest._id, categoryId: cat[category]._id, categoryName: category, name, description: `${name} - freshly prepared`,
                    price, foodType, image, isActive: true, isAvailable: true, approvalStatus,
                    variants: (variants || []).map(([vn, vp]) => ({ name: vn, price: vp })),
                    availableTime: { isAllDay: true, startTime: '', endTime: '' },
                });
                made += 1;
            };
            for (const f of r.foods) await addFood(f, 'approved');
            if (r.pendingFood) await addFood(r.pendingFood, 'pending');
            summary.push({ franchise: d.email, restaurant: r.name, status: 'approved', newFoods: made });
        }

        // A join request waiting for the franchise (unclaimed restaurant in its zone)
        if (!(await FoodRestaurant.exists({ restaurantName: d.joinRequest.name }))) {
            await FoodRestaurant.create(restaurantDoc({ ...d.joinRequest, veg: true, cuisines: ['Street Food'], image: IMG.starter }, 3, { status: 'pending', isAcceptingOrders: false, franchiseId: null }));
        }
        summary.push({ franchise: d.email, restaurant: d.joinRequest.name, status: 'pending (join request)', newFoods: 0 });

        // A rider waiting for approval in the zone
        if (!(await Rider.exists({ phone: d.rider.phone }))) {
            await Rider.create({
                name: d.rider.name, phone: d.rider.phone, countryCode: '+91', city: d.city, state: d.state,
                vehicleType: 'bike', vehicleName: 'Honda Shine', vehicleNumber: d.rider.vehicleNumber,
                zoneId: app.zoneId, zoneName: zone.name, status: 'pending',
                profilePhoto: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=400',
            });
        }
    }

    console.table(summary);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
