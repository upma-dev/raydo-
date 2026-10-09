import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Import models
import { FoodZone } from '../modules/food/admin/models/zone.model.js';
import { FoodCategory } from '../modules/food/admin/models/category.model.js';
import { FoodRestaurant } from '../modules/food/restaurant/models/restaurant.model.js';
import { FoodItem } from '../modules/food/admin/models/food.model.js';

import { Zone as TaxiZone } from '../modules/taxi/driver/models/Zone.js';
import { ServiceLocation as TaxiServiceLocation } from '../modules/taxi/admin/models/ServiceLocation.js';
import { Vehicle as TaxiVehicle } from '../modules/taxi/admin/models/Vehicle.js';
import { SetPrice } from '../modules/taxi/admin/models/SetPrice.js';
import { TaxiFranchisePartner } from '../modules/taxi/admin/models/TaxiFranchisePartner.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/raydo';

async function seedIndoreZone() {
  console.log('🚀 Starting Data Seeding for INDORE ZONE...');
  console.log(`Connecting to MongoDB...`);
  
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB successfully.');

  // ==========================================
  // 1. SEED FOOD ZONE & TAXI SERVICE LOCATION
  // ==========================================
  console.log('\n📍 Step 1: Seeding Indore Zones & Service Locations...');
  
  // Food Zone Polygon around Indore
  const indoreFoodCoords = [
    { latitude: 22.7600, longitude: 75.8000 },
    { latitude: 22.7600, longitude: 75.9300 },
    { latitude: 22.6500, longitude: 75.9300 },
    { latitude: 22.6500, longitude: 75.8000 },
    { latitude: 22.7600, longitude: 75.8000 }
  ];

  let foodZone = await FoodZone.findOne({ name: { $regex: /^Indore/i } });
  if (!foodZone) {
    foodZone = await FoodZone.create({
      name: 'Indore',
      zoneName: 'Indore Zone',
      country: 'India',
      serviceLocation: 'Indore, Madhya Pradesh',
      unit: 'kilometer',
      coordinates: indoreFoodCoords,
      isActive: true
    });
    console.log(`✅ Created FoodZone: Indore (ID: ${foodZone._id})`);
  } else {
    foodZone.coordinates = indoreFoodCoords;
    foodZone.isActive = true;
    await foodZone.save();
    console.log(`✅ Updated existing FoodZone: Indore (ID: ${foodZone._id})`);
  }

  // Taxi Service Location
  let taxiLocation = await TaxiServiceLocation.findOne({ name: { $regex: /^Indore/i } });
  if (!taxiLocation) {
    taxiLocation = await TaxiServiceLocation.create({
      name: 'Indore',
      country: 'India',
      currency_code: 'INR',
      currency_symbol: '₹',
      timezone: 'Asia/Kolkata',
      active: true,
      status: 'active'
    });
    console.log(`✅ Created TaxiServiceLocation: Indore (ID: ${taxiLocation._id})`);
  } else {
    console.log(`ℹ️ TaxiServiceLocation already exists: Indore (ID: ${taxiLocation._id})`);
  }

  // Taxi Zone GeoJSON Polygon
  let taxiZone = await TaxiZone.findOne({ name: { $regex: /^Indore/i } });
  const taxiGeoPolygon = {
    type: 'Polygon',
    coordinates: [[
      [75.8000, 22.7600],
      [75.9300, 22.7600],
      [75.9300, 22.6500],
      [75.8000, 22.6500],
      [75.8000, 22.7600]
    ]]
  };

  if (!taxiZone) {
    taxiZone = await TaxiZone.create({
      name: 'Indore Zone',
      service_location_id: taxiLocation._id,
      unit: 'km',
      active: true,
      status: 'active',
      boundary_mode: 'polygon',
      geometry: taxiGeoPolygon
    });
    console.log(`✅ Created TaxiZone: Indore Zone (ID: ${taxiZone._id})`);
  } else {
    taxiZone.service_location_id = taxiLocation._id;
    taxiZone.geometry = taxiGeoPolygon;
    taxiZone.active = true;
    await taxiZone.save();
    console.log(`✅ Updated existing TaxiZone: Indore Zone (ID: ${taxiZone._id})`);
  }

  // ==========================================
  // 2. SEED FOOD CATEGORIES
  // ==========================================
  console.log('\n🍲 Step 2: Seeding Indori Food Categories...');
  
  const categoryDefs = [
    { name: 'Poha & Indori Snacks', type: 'Food', foodTypeScope: 'Veg', image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600' },
    { name: 'Street Food & Chat', type: 'Food', foodTypeScope: 'Veg', image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600' },
    { name: 'Sweets & Rabri', type: 'Food', foodTypeScope: 'Veg', image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=600' },
    { name: 'North Indian & Thali', type: 'Food', foodTypeScope: 'Both', image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600' },
    { name: 'Beverages & Shakes', type: 'Food', foodTypeScope: 'Both', image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=600' }
  ];

  const categoryMap = {};
  for (const cat of categoryDefs) {
    let doc = await FoodCategory.findOne({ name: cat.name });
    if (!doc) {
      doc = await FoodCategory.create({
        name: cat.name,
        type: cat.type,
        foodTypeScope: cat.foodTypeScope,
        image: cat.image,
        isApproved: true,
        approvalStatus: 'approved',
        zoneId: foodZone._id,
        isActive: true
      });
      console.log(`   + Added Category: ${cat.name}`);
    } else {
      doc.zoneId = foodZone._id;
      await doc.save();
    }
    categoryMap[cat.name] = doc._id;
  }

  // ==========================================
  // 3. SEED INDORE RESTAURANTS & MENU ITEMS
  // ==========================================
  console.log('\n🏪 Step 3: Seeding Famous Indore Outlets & Menus...');

  const restaurantsData = [
    {
      name: 'Vijay Chaat House',
      ownerName: 'Vijay Sharma',
      phone: '9826012345',
      pureVeg: true,
      address: 'Chappan Dukan, New Palasia, Indore',
      lat: 22.7244,
      lng: 75.8839,
      rating: 4.9,
      deliveryTime: '20-25 mins',
      cover: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800',
      dishes: [
        { name: 'Indori Usal Poha with Jalebi', category: 'Poha & Indori Snacks', price: 60, veg: 'Veg', desc: 'Authentic Indori Poha topped with Ratlami Sev, onion, Jeeravan & hot crispy Jalebi.' },
        { name: 'Koprapak Special (250g)', category: 'Sweets & Rabri', price: 150, veg: 'Veg', desc: 'Famous Indore coconut sweet made with fresh khoya and saffron.' },
        { name: 'Bhutte Ka Kees', category: 'Street Food & Chat', price: 90, veg: 'Veg', desc: 'Traditional grated sweet corn cooked in milk, ghee, mustard seeds and Indori spices.' },
        { name: 'Kachori with Chutney (2 Pcs)', category: 'Street Food & Chat', price: 40, veg: 'Veg', desc: 'Crispy moong dal kachori served with green spicy chutney and sweet tamarind chutney.' }
      ]
    },
    {
      name: 'Sarafa Special Sweets & Chat',
      ownerName: 'Sunil Agrawal',
      phone: '9826054321',
      pureVeg: true,
      address: 'Sarafa Night Market, Rajwada, Indore',
      lat: 22.7196,
      lng: 75.8577,
      rating: 4.8,
      deliveryTime: '25-30 mins',
      cover: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800',
      dishes: [
        { name: 'Garadu Chaat Special', category: 'Street Food & Chat', price: 110, veg: 'Veg', desc: 'Deep-fried yam tossed in special Indori Chatpata Garadu Masala and lemon juice.' },
        { name: 'Jumbo Mawa Bati', category: 'Sweets & Rabri', price: 80, veg: 'Veg', desc: 'Rich gulab jamun stuffed with dry fruits and lost in sugar syrup.' },
        { name: 'Rabri Malpua (2 Pcs)', category: 'Sweets & Rabri', price: 120, veg: 'Veg', desc: 'Hot ghee malpuas topped with thick saffron basundi rabri.' },
        { name: 'Sabudana Khichdi', category: 'Street Food & Chat', price: 70, veg: 'Veg', desc: 'Non-sticky tapioca khichdi topped with crunchy roasted peanuts and potato salli.' }
      ]
    },
    {
      name: 'Indore Zaika Dhaba & Thali',
      ownerName: 'Rajesh Patidar',
      phone: '9826098765',
      pureVeg: true,
      address: 'Bhawarkua Square, AB Road, Indore',
      lat: 22.6926,
      lng: 75.8676,
      rating: 4.7,
      deliveryTime: '30-35 mins',
      cover: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800',
      dishes: [
        { name: 'Special Indori Dal Bafla Thali', category: 'North Indian & Thali', price: 240, veg: 'Veg', desc: '4 Ghee Baflas, Panchmel Dal, Churma Ladoo, Kadi, Aloo Sabzi, Rice & Papad.' },
        { name: 'Sev Tamatar Ki Sabzi + 4 Butter Roti', category: 'North Indian & Thali', price: 180, veg: 'Veg', desc: 'Tangy tomato curry cooked with thick Ratlami Sev and served hot with phulkas.' },
        { name: 'Paneer Butter Masala Combo', category: 'North Indian & Thali', price: 210, veg: 'Veg', desc: 'Rich Cottage cheese in butter tomato gravy with Jeera Rice and Butter Naan.' },
        { name: 'Kesariya Lassi (300ml)', category: 'Beverages & Shakes', price: 70, veg: 'Veg', desc: 'Thick chilled sweet curd lassi topped with malai and dry fruits.' }
      ]
    },
    {
      name: 'Johnny Hot Dog',
      ownerName: 'Vijay Singh',
      phone: '9826067890',
      pureVeg: false,
      address: 'Shop 21, Chappan Dukan, Indore',
      lat: 22.7246,
      lng: 75.8841,
      rating: 4.9,
      deliveryTime: '15-20 mins',
      cover: 'https://images.unsplash.com/photo-1627308595229-7830a5c91f9f?w=800',
      dishes: [
        { name: 'Johnny Mutton Hotdog', category: 'Street Food & Chat', price: 120, veg: 'Non-Veg', desc: 'Iconic Indori round burger bun with juicy spiced mutton patty and green chutney.' },
        { name: 'Johnny Egg Veg Hotdog', category: 'Street Food & Chat', price: 70, veg: 'Non-Veg', desc: 'Fluffy fried egg patty in buttered toasted bun.' },
        { name: 'Johnny Special Veg Hotdog', category: 'Street Food & Chat', price: 60, veg: 'Veg', desc: 'Crispy potato patty inside toasted butter bun served with chutneys.' }
      ]
    },
    {
      name: 'Nafees Restaurant',
      ownerName: 'Mohd Nafees',
      phone: '9826011223',
      pureVeg: false,
      address: 'Old Palasia Main Road, Indore',
      lat: 22.7275,
      lng: 75.8882,
      rating: 4.8,
      deliveryTime: '30-40 mins',
      cover: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=800',
      dishes: [
        { name: 'Hyderabadi Chicken Dum Biryani', category: 'North Indian & Thali', price: 290, veg: 'Non-Veg', desc: 'Long grain basmati rice cooked on dum with marinated tender chicken piece and aromatic spices.' },
        { name: 'Butter Chicken Special', category: 'North Indian & Thali', price: 340, veg: 'Non-Veg', desc: 'Charcoal grilled chicken tikka in rich creamy tomato and butter gravy.' },
        { name: 'Garlic Butter Naan', category: 'North Indian & Thali', price: 60, veg: 'Veg', desc: 'Fresh tandoori naan brushed with garlic butter.' }
      ]
    }
  ];

  for (const rData of restaurantsData) {
    let rest = await FoodRestaurant.findOne({
      $or: [{ restaurantName: rData.name }, { ownerPhone: rData.phone }]
    });

    const restPayload = {
      restaurantName: rData.name,
      ownerName: rData.ownerName,
      ownerEmail: `${rData.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`,
      ownerPhone: rData.phone,
      pureVegRestaurant: rData.pureVeg,
      isRestaurant: true,
      addressLine1: rData.address,
      city: 'Indore',
      state: 'Madhya Pradesh',
      pincode: '452001',
      rating: rData.rating,
      totalRatings: 145,
      estimatedDeliveryTime: rData.deliveryTime,
      estimatedDeliveryTimeMinutes: parseInt(rData.deliveryTime) || 25,
      profileImage: rData.cover,
      coverImages: [rData.cover],
      status: 'approved',
      approvedAt: new Date(),
      zoneId: foodZone._id,
      isAcceptingOrders: true,
      location: {
        type: 'Point',
        coordinates: [rData.lng, rData.lat],
        latitude: rData.lat,
        longitude: rData.lng,
        city: 'Indore',
        state: 'Madhya Pradesh',
        address: rData.address
      }
    };

    if (!rest) {
      rest = await FoodRestaurant.create(restPayload);
      console.log(`   + Added Restaurant: ${rData.name}`);
    } else {
      Object.assign(rest, restPayload);
      await rest.save();
      console.log(`   ~ Updated Restaurant: ${rData.name}`);
    }

    // Seed Menu items for this restaurant
    for (const d of rData.dishes) {
      const catId = categoryMap[d.category];
      let foodItem = await FoodItem.findOne({ restaurantId: rest._id, name: d.name });
      const foodPayload = {
        restaurantId: rest._id,
        categoryId: catId,
        categoryName: d.category,
        name: d.name,
        description: d.desc,
        price: d.price,
        image: rData.cover,
        foodType: d.veg,
        isActive: true,
        isAvailable: true,
        approvalStatus: 'approved',
        approvedAt: new Date()
      };

      if (!foodItem) {
        await FoodItem.create(foodPayload);
        console.log(`     - Dish added: ${d.name} (₹${d.price})`);
      } else {
        Object.assign(foodItem, foodPayload);
        await foodItem.save();
      }
    }
  }

  // ==========================================
  // 4. SEED TAXI FARE & PRICING RULES FOR INDORE
  // ==========================================
  console.log('\n🚕 Step 4: Setting up Taxi Pricing Rules for Indore Zone...');

  const vehicles = await TaxiVehicle.find({ active: 1 }).lean();
  if (vehicles.length > 0) {
    for (const v of vehicles) {
      let priceDoc = await SetPrice.findOne({
        zone_id: taxiZone._id,
        vehicle_type: v._id,
        transport_type: 'taxi'
      });

      const basePrice = v.name?.toLowerCase().includes('bike') ? 25 : v.name?.toLowerCase().includes('auto') ? 35 : v.name?.toLowerCase().includes('suv') ? 90 : 50;
      const pricePerKm = v.name?.toLowerCase().includes('bike') ? 9 : v.name?.toLowerCase().includes('auto') ? 12 : v.name?.toLowerCase().includes('suv') ? 20 : 14;

      const pricePayload = {
        zone_id: taxiZone._id,
        service_location_id: taxiLocation._id,
        pricing_scope: 'ride',
        transport_type: 'taxi',
        vehicle_type: v._id,
        base_price: basePrice,
        base_distance: 2,
        price_per_distance: pricePerKm,
        time_price: 1.5,
        waiting_charge: 2,
        free_waiting_before: 3,
        user_cancellation_fee: 30,
        driver_cancellation_fee: 20,
        admin_commision: 10,
        admin_commision_type: 1, // percentage
        active: 1,
        status: 'active'
      };

      if (!priceDoc) {
        await SetPrice.create(pricePayload);
        console.log(`   + Taxi Price Rule Created for Indore: ${v.name} (Base ₹${basePrice}, ₹${pricePerKm}/km)`);
      } else {
        Object.assign(priceDoc, pricePayload);
        await priceDoc.save();
        console.log(`   ~ Updated Taxi Price Rule for Indore: ${v.name}`);
      }
    }
  } else {
    console.log('   ⚠️ No TaxiVehicles found in system. (Run app module seeds if needed)');
  }

  // ==========================================
  // 5. SEED INDORE FRANCHISE PARTNER
  // ==========================================
  console.log('\n🤝 Step 5: Seeding Indore Franchise Partner Account...');

  let partner = await TaxiFranchisePartner.findOne({ email: 'indore.franchise@raydo.in' });
  if (!partner) {
    partner = await TaxiFranchisePartner.create({
      partnerId: 'IND-FR-001',
      name: 'Indore City Mobility & Foods',
      email: 'indore.franchise@raydo.in',
      phone: '9826000099',
      password: 'IndorePartner@123',
      zoneId: taxiZone._id,
      zoneName: 'Indore Zone',
      franchiseCommissionRate: 10,
      platformCommissionRate: 5,
      franchiseFee: 80000,
      walletBalance: 2500,
      totalEarned: 15400,
      isActive: true,
      status: 'active'
    });
    console.log(`✅ Indore Franchise Partner Created! Login: indore.franchise@raydo.in / Password: IndorePartner@123`);
  } else {
    console.log(`ℹ️ Indore Franchise Partner already exists.`);
  }

  console.log('\n🎉 ALL INDORE ZONE DATA SEEDED SUCCESSFULLY!');
  console.log('============================================');
  console.log(`📍 FoodZone: Indore (ID: ${foodZone._id})`);
  console.log(`📍 TaxiZone: Indore Zone (ID: ${taxiZone._id})`);
  console.log(`🏪 Outlets: 5 Iconic Indore Restaurants Added`);
  console.log(`🍲 Items: Indori Poha, Jalebi, Garadu, Dal Bafla & Mutton Hotdog Added`);
  console.log(`🚕 Taxi Pricing: Configured for All Vehicle Types`);
  console.log('============================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

seedIndoreZone().catch(err => {
  console.error('❌ SEEDING FAILED:', err);
  process.exit(1);
});
