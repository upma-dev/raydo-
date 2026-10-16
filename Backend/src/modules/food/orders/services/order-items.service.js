import mongoose from 'mongoose';
import { FoodItem } from '../../admin/models/food.model.js';
import { isFoodItemAvailableNow } from '../../utils/foodAvailability.js';
import { ValidationError } from '../../../../core/auth/errors.js';

/**
 * ORDER ITEMS: the server, not the app, decides what an item costs.
 *
 * The app sends { itemId, variantId?, quantity }. Whatever price / name it also sends is ignored: the price comes from
 * the FoodItem (or its variant) in the database, the item must belong to the restaurant being ordered from, and it
 * must be available right now (active, approved, in its time window, in stock).
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export async function resolveOrderItems(restaurantId, rawItems = [], { at = new Date() } = {}) {
  const lines = Array.isArray(rawItems) ? rawItems : [];
  if (lines.length === 0) throw new ValidationError('At least one item required');

  const ids = [];
  for (const line of lines) {
    const id = String(line?.itemId || '');
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ValidationError('Invalid item in cart');
    ids.push(id);
  }

  const foods = await FoodItem.find({ _id: { $in: [...new Set(ids)] } }).lean();
  const byId = new Map(foods.map((f) => [String(f._id), f]));

  const wantedByItem = new Map();
  const items = lines.map((line) => {
    const food = byId.get(String(line.itemId));
    if (!food || String(food.restaurantId) !== String(restaurantId)) {
      throw new ValidationError(`${line?.name || 'An item'} is not available at this restaurant`);
    }
    if (food.approvalStatus && food.approvalStatus !== 'approved') {
      throw new ValidationError(`${food.name} is not available`);
    }
    if (!isFoodItemAvailableNow(food, at)) {
      throw new ValidationError(`${food.name} is currently unavailable`);
    }

    const quantity = Math.floor(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity < 1) throw new ValidationError(`Invalid quantity for ${food.name}`);

    let price = Number(food.price);
    let variantName = '';
    let variantId;
    if (line.variantId) {
      const variant = (food.variants || []).find((v) => String(v._id) === String(line.variantId));
      if (!variant) throw new ValidationError(`The selected option of ${food.name} is no longer available`);
      price = Number(variant.price);
      variantName = variant.name || '';
      variantId = String(variant._id);
    }
    if (!Number.isFinite(price) || price < 0) throw new ValidationError(`${food.name} has no valid price`);

    wantedByItem.set(String(food._id), (wantedByItem.get(String(food._id)) || 0) + quantity);

    return {
      itemId: String(food._id),
      name: food.name,
      price: round2(price),
      quantity,
      isVeg: food.foodType ? food.foodType === 'Veg' : line.isVeg !== false,
      image: food.image || line.image || '',
      notes: line.notes || '',
      ...(variantId ? { variantId, variantName, variantPrice: round2(price) } : {}),
    };
  });

  // Enough stock for the TOTAL asked of an item (the same item can be in two cart lines)
  for (const [itemId, wanted] of wantedByItem) {
    const food = byId.get(itemId);
    if (typeof food.stockQuantity === 'number' && wanted > food.stockQuantity) {
      throw new ValidationError(`Only ${Math.max(0, food.stockQuantity)} of ${food.name} left`);
    }
  }

  const subtotal = round2(items.reduce((sum, it) => sum + it.price * it.quantity, 0));
  return { items, subtotal };
}

/**
 * Take the ordered quantity out of stock, ATOMICALLY (the old read-then-save lost updates and oversold under load).
 * Items without a stock number are not stock-managed and are skipped. If any item runs short, everything already
 * reserved by this call is put back and a ValidationError is thrown.
 * Returns the reservations so the caller can release them if a later step fails.
 */
export async function reserveStock(items = []) {
  const wanted = new Map();
  for (const it of items) {
    wanted.set(String(it.itemId), (wanted.get(String(it.itemId)) || 0) + Math.max(1, Number(it.quantity) || 1));
  }

  const reserved = [];
  for (const [itemId, quantity] of wanted) {
    const before = await FoodItem.findOneAndUpdate(
      { _id: itemId, stockQuantity: { $type: 'number', $gte: quantity } },
      { $inc: { stockQuantity: -quantity } },
      { new: false },
    ).lean();

    if (before) {
      const after = before.stockQuantity - quantity;
      let switchedOff = false;
      if (after <= 0) {
        const off = await FoodItem.updateOne({ _id: itemId, stockQuantity: { $lte: 0 }, isAvailable: { $ne: false } }, { $set: { isAvailable: false } });
        switchedOff = off.modifiedCount > 0;
      }
      reserved.push({ itemId, quantity, previousStock: before.stockQuantity, stockQuantity: after, previousIsAvailable: before.isAvailable !== false, switchedOff, food: before });
      continue;
    }

    // No stock number = not stock-managed (fine); a number too small = sold out while this order was being placed
    const current = await FoodItem.findById(itemId).select('stockQuantity name').lean();
    if (current && typeof current.stockQuantity === 'number') {
      await releaseStock(reserved);
      throw new ValidationError(`Only ${Math.max(0, current.stockQuantity)} of ${current.name} left`);
    }
  }
  return reserved;
}

/** Put reserved stock back (order failed / was cancelled). Atomic; re-enables an item this order had switched off. */
export async function releaseStock(reserved = []) {
  for (const r of reserved) {
    try {
      await FoodItem.updateOne({ _id: r.itemId, stockQuantity: { $type: 'number' } }, { $inc: { stockQuantity: r.quantity } });
      if (r.switchedOff) await FoodItem.updateOne({ _id: r.itemId, stockQuantity: { $gt: 0 } }, { $set: { isAvailable: true } });
    } catch {
      // a failed release must never hide the original error
    }
  }
}
