/**
 * Prints a full bill for an order: restaurant name + address, customer + delivery location,
 * every item (with variation, add-ons and notes), customer instructions and the price breakup.
 * Works for the raw order from the API and for the small "popup" order shape.
 */

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
const text = (...parts) => parts.map((p) => String(p ?? "").trim()).filter(Boolean).join(", ");

/** "razorpay", "razorpay_qr", "upi", "card" ... are all just ONLINE for the restaurant. Only cash is COD. */
export function paymentTypeLabel(method = "", status = "") {
  const m = String(method || "").trim().toLowerCase();
  const s = String(status || "").trim().toLowerCase();
  const type = !m ? "" : ["cash", "cod", "cash_on_delivery"].includes(m) ? "Cash on Delivery" : m === "wallet" ? "Online (Wallet)" : "Online";
  if (!type) return "";
  const state = s === "paid" || s === "captured" ? "Paid" : s === "refunded" ? "Refunded" : s === "failed" ? "Failed" : "";
  return state ? `${type} - ${state}` : type;
}

let restaurantCache = null;

/** Restaurant profile, fetched once (only needed for the name / address on the bill). */
export async function loadRestaurantForBill(restaurantAPI) {
  if (restaurantCache) return restaurantCache;
  try {
    const res = await restaurantAPI.getCurrentRestaurant();
    restaurantCache = res?.data?.data?.restaurant || res?.data?.restaurant || null;
  } catch {
    restaurantCache = null;
  }
  return restaurantCache;
}

const restaurantAddress = (r = {}) =>
  r.formattedAddress || text(r.addressLine1, r.addressLine2, r.area, r.city, r.state, r.pincode) || r.location?.formattedAddress || "";

export function buildBillHtml(order = {}, restaurant = {}) {
  const addr = order.deliveryAddress || order.address || order.customerAddress || {};
  const coords = addr.location?.coordinates || (addr.lat != null ? [addr.lng, addr.lat] : null);
  const mapText = Array.isArray(coords) && coords.length === 2 ? `${Number(coords[1]).toFixed(6)}, ${Number(coords[0]).toFixed(6)}` : "";
  const customerName = order.customerName || order.userId?.name || addr.fullName || addr.name || "Customer";
  const customerPhone = order.customerPhone || order.userId?.phone || addr.phone || "";
  const placed = order.createdAt ? new Date(order.createdAt) : new Date();
  const pricing = order.pricing || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const subtotal = Number(pricing.subtotal ?? items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0));
  const total = Number(pricing.total ?? order.total ?? subtotal);
  const payLabel = paymentTypeLabel(order.paymentMethod || order.payment?.method, order.payment?.status || order.paymentStatus);
  const restaurantName = restaurant.restaurantName || restaurant.name || order.restaurantName || "Restaurant";

  const rows = items.map((i) => {
    const qty = Number(i.quantity) || 1;
    const price = Number(i.price) || 0;
    const variant = i.variantName || i.variant || i.variation || i.selectedVariant?.name || i.optionName || i.variantTitle || "";
    const addons = Array.isArray(i.addons) ? i.addons.map((a) => a?.name || a?.title || a).filter(Boolean) : [];
    const note = i.notes || i.note || i.instructions || "";
    return `<tr>
      <td>${esc(i.name || "Item")}${variant ? `<div class="sub">${esc(variant)}</div>` : ""}${addons.length ? `<div class="sub">+ ${esc(addons.join(", "))}</div>` : ""}${note ? `<div class="note">Note: ${esc(note)}</div>` : ""}</td>
      <td class="c">${qty}</td><td class="r">${money(price)}</td><td class="r">${money(price * qty)}</td></tr>`;
  }).join("");

  const line = (label, value) => (value ? `<tr><td colspan="3" class="r">${label}</td><td class="r">${money(value)}</td></tr>` : "");
  const instructions = order.note || order.instructions || order.cookingInstructions || "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill ${esc(order.orderId || "")}</title>
<style>
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:0;padding:16px;max-width:380px}
  h1{font-size:18px;margin:0;text-align:center} .center{text-align:center} .muted{color:#555}
  hr{border:0;border-top:1px dashed #888;margin:10px 0} table{width:100%;border-collapse:collapse}
  th{text-align:left;border-bottom:1px solid #000;padding:4px 0;font-size:11px} td{padding:4px 0;vertical-align:top}
  .c{text-align:center} .r{text-align:right} .sub{font-size:10px;color:#555} .note{font-size:10px;font-style:italic}
  .box{border:1px solid #000;padding:6px;margin-top:8px} .total td{font-weight:bold;font-size:14px;border-top:1px solid #000}
  @media print{body{padding:0}}
</style></head><body>
  <h1>${esc(restaurantName)}</h1>
  <div class="center muted">${esc(restaurantAddress(restaurant))}</div>
  ${restaurant.primaryContactNumber || restaurant.ownerPhone ? `<div class="center muted">Ph: ${esc(restaurant.primaryContactNumber || restaurant.ownerPhone)}</div>` : ""}
  <hr>
  <div><b>Order:</b> #${esc(order.orderId || order._id || "")}</div>
  <div><b>Date:</b> ${esc(placed.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }))}</div>
  ${payLabel ? `<div><b>Payment type:</b> ${esc(payLabel)}</div>` : ""}
  <hr>
  <div><b>Customer:</b> ${esc(customerName)}${customerPhone ? ` (${esc(customerPhone)})` : ""}</div>
  <div><b>Deliver to:</b> ${esc(text(addr.street, addr.additionalDetails, addr.city, addr.state, addr.zipCode) || "Address not available")}</div>
  ${mapText ? `<div class="muted"><b>Location (lat, lng):</b> ${esc(mapText)}</div>` : ""}
  <hr>
  <table><thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead>
  <tbody>${rows || `<tr><td colspan="4">No items</td></tr>`}</tbody>
  <tfoot>
    <tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(subtotal)}</td></tr>
    ${line("Packaging", pricing.packagingFee)}${line("Delivery fee", pricing.deliveryFee)}${line("Platform fee", pricing.platformFee)}${line("Tax", pricing.tax)}${pricing.discount ? `<tr><td colspan="3" class="r">Discount</td><td class="r">-${money(pricing.discount)}</td></tr>` : ""}
    <tr class="total"><td colspan="3" class="r">TOTAL</td><td class="r">${money(total)}</td></tr>
  </tfoot></table>
  ${instructions ? `<div class="box"><b>Customer instructions:</b><br>${esc(instructions)}</div>` : ""}
  ${order.sendCutlery === false ? `<div class="muted" style="margin-top:6px">Do not send cutlery</div>` : ""}
  <hr><div class="center muted">Thank you!</div>
</body></html>`;
}

/**
 * Print with LIVE data: the order is fetched again from the server right now (payment status, items, instructions
 * may have changed since the list was loaded). Falls back to the order already on screen if the fetch fails.
 */
export async function printLiveOrderBill(order, restaurantAPI) {
  const id = order?._id || order?.mongoId || order?.orderMongoId || order?.orderId;
  let live = order;
  try {
    if (id) {
      const res = await restaurantAPI.getOrderById(id);
      const fresh = res?.data?.data?.order || res?.data?.data || res?.data?.order || null;
      if (fresh && (fresh.items || fresh.pricing)) live = { ...order, ...fresh };
    }
  } catch {
    // keep the on-screen order
  }
  const restaurant = await loadRestaurantForBill(restaurantAPI);
  printOrderBill(live, restaurant);
}

/** Opens the print dialog for the bill (hidden iframe, so pop-up blockers do not interfere). */
export function printOrderBill(order, restaurant) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(buildBillHtml(order, restaurant || {}));
  doc.close();
  const run = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  };
  if (iframe.contentWindow.document.readyState === "complete") setTimeout(run, 100);
  else iframe.onload = () => setTimeout(run, 100);
}
