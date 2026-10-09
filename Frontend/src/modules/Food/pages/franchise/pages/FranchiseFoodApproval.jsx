import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Loader2, Utensils } from 'lucide-react';
import { franchisePartnerAPI } from '@food/api';
import { toast } from 'sonner';

export default function FranchiseFoodApproval() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPendingApprovals();
  }, []);

  const fetchPendingApprovals = async () => {
    try {
      setLoading(true);
      const res = await franchisePartnerAPI.getPendingFoodApprovals();
      const list = res?.data?.data?.foods || res?.data?.data || res?.data?.foods || [];
      setApprovals(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error('Failed to load pending food approvals');
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm mb-6">
        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
          Franchise Partner Portal
        </span>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">Food Approvals</h1>
        <p className="text-sm text-slate-500 mt-1">Review new food items submitted by restaurants in your franchise zone.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">SL</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase">Item Name</th>
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
                    <p className="text-sm text-slate-500">Loading pending approvals...</p>
                  </td>
                </tr>
              ) : approvals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <p className="text-lg font-semibold text-slate-700">No Pending Approvals</p>
                    <p className="text-xs text-slate-400 mt-1">All food items in your zone are currently approved.</p>
                  </td>
                </tr>
              ) : (
                approvals.map((item, index) => (
                  <tr key={item.id || item._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-500">{index + 1}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{item.name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{item.restaurantName || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">₹{item.price || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 capitalize">
                        {item.approvalStatus || 'Pending'}
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
