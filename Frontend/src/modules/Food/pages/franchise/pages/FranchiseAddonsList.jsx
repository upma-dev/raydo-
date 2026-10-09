import React, { useState, useEffect } from 'react';
import { Search, Package, Building2, Loader2 } from 'lucide-react';
import { franchisePartnerAPI } from '@food/api';
import { toast } from 'sonner';

export default function FranchiseAddonsList() {
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAddons();
  }, []);

  const fetchAddons = async () => {
    try {
      setLoading(true);
      const res = await franchisePartnerAPI.getAddons({ limit: 1000 });
      const list = res?.data?.data?.addons || res?.data?.addons || [];
      setAddons(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error('Failed to load franchise addons');
      setAddons([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredAddons = addons.filter(a =>
    String(a.name || a.draft?.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
          Franchise Partner Portal
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Franchise Restaurant Addons</h1>
        <p className="text-sm text-slate-500 mt-1">Manage addons requested by restaurants in your franchise zone.</p>

        <div className="mt-4 relative min-w-[240px] max-w-md">
          <input
            type="text"
            placeholder="Search addons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2.5 w-full text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-indigo-600"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">SL</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Addon Name</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Restaurant</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Price</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Loading addons...</p>
                  </td>
                </tr>
              ) : filteredAddons.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700">No Addons Found</p>
                  </td>
                </tr>
              ) : (
                filteredAddons.map((addon, index) => (
                  <tr key={addon.id || addon._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-500">{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{addon.name || addon.draft?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{addon.restaurantName || addon.restaurant?.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">₹{addon.price || addon.draft?.price || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 capitalize">
                        {addon.approvalStatus || 'Approved'}
                      </span>
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
