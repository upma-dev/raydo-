import React, { useState, useEffect, useMemo } from 'react';
import { Search, FileText, Clock, CheckCircle, Package, Truck, XCircle, Loader2, IndianRupee } from 'lucide-react';
import { franchisePartnerAPI } from '@food/api';
import { toast } from 'sonner';

export default function FranchiseOrdersList({ statusKey = 'all' }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(statusKey);

  useEffect(() => {
    fetchOrders();
  }, [activeTab]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = {};
      if (activeTab !== 'all') params.orderStatus = activeTab;
      const res = await franchisePartnerAPI.getOrders(params);
      const list = res?.data?.data?.orders || res?.data?.orders || [];
      setOrders(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error('Failed to load franchise orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase().trim();
    return orders.filter(o =>
      String(o.order_id || o.orderId || o._id || '').toLowerCase().includes(q) ||
      String(o.customerName || '').toLowerCase().includes(q) ||
      String(o.restaurantName || '').toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  const statusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'delivered') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s.includes('cancel')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (s === 'pending') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              Franchise Partner Portal
            </span>
            <h1 className="text-2xl font-bold text-slate-900 mt-2">Franchise Orders</h1>
            <p className="text-sm text-slate-500 mt-1">Real-time orders placed across restaurants in your franchise zone.</p>
          </div>

          <span className="px-3.5 py-1.5 rounded-full text-sm font-bold bg-indigo-100 text-indigo-800">
            Total Orders: {filteredOrders.length}
          </span>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-100 mb-4">
          {[
            { id: 'all', label: 'All Orders' },
            { id: 'pending', label: 'Pending' },
            { id: 'accepted', label: 'Accepted' },
            { id: 'processing', label: 'Processing' },
            { id: 'food-on-the-way', label: 'On The Way' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'canceled', label: 'Cancelled' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] w-full">
          <input
            type="text"
            placeholder="Search by order ID, customer name, restaurant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-indigo-600"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Order ID</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Restaurant</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Total</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Loading franchise orders...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700 mb-1">No Orders Found</p>
                    <p className="text-sm text-slate-500">No orders match your selected filter for this zone.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o) => (
                  <tr key={o._id || o.order_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600">
                      #{o.order_id || o.orderId || String(o._id).slice(-6)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {o.customerName || o.deliveryAddress?.contactName || 'Customer'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-medium">
                      {o.restaurantName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                      ₹{o.pricing?.total || o.total || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusBadge(o.orderStatus)}`}>
                        {o.orderStatus || 'pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                      {o.createdAt ? new Date(o.createdAt).toLocaleString('en-IN') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
