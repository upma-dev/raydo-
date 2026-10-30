import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  Loader2,
  Clock
} from 'lucide-react';
import WeekSelector from '@delivery/components/WeekSelector';
import { deliveryAPI } from '@food/api';
import { formatCurrency } from '@food/utils/currency';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

/**
 * DeductionStatementV2 - 1:1 Match with Old DeductionStatement UI.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const DeductionStatementV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [deductions, setDeductions] = useState([]);
  const [weekRange, setWeekRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - new Date().getDay())),
    end: new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 6))
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getWalletTransactions({ 
          type: 'deduction', 
          limit: 100 
        });
        
        if (response?.data?.success) {
           const all = response.data.data.transactions || [];
           const filtered = all.filter((t) => {
              const type = String(t.type || '').trim().toLowerCase();
              const isManualDeduction = type === 'withdrawal' || type === 'deposit' || type === 'ride_dues';
              if (!isManualDeduction) return false;

              const baseDate = t.date || t.createdAt;
              const d = new Date(baseDate);
              return d >= weekRange.start && d <= weekRange.end;
           });
           setDeductions(filtered);
        }
      } catch (err) {
        toast.error('Failed to load deductions');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weekRange]);

  // Day-wise groups, newest day first
  const dayGroups = useMemo(() => {
    const map = new Map();
    deductions.forEach((item) => {
      const d = new Date(item.createdAt || item.date);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, { key, date: d, items: [], total: 0 });
      const g = map.get(key);
      g.items.push(item);
      g.total += Number(item.amount) || 0;
    });
    const groups = [...map.values()].sort((a, b) => b.date - a.date);
    groups.forEach((g) => g.items.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)));
    return groups;
  }, [deductions]);

  return (
    <div className="min-h-screen bg-[#f6e9dc] font-poppins pb-32">
       {/* Header (Old Style) */}
       <div className="bg-white border-b border-gray-200 px-4 py-4 safe-top flex items-center gap-4">
          <button 
            onClick={goBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 leading-none">Deduction statement</h1>
       </div>

       {/* Main Content */}
       <div className="px-4 py-6">
          <WeekSelector onChange={setWeekRange} />

          {/* Transactions List */}
          {loading ? (
             <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-4" />
                <p className="text-gray-600 text-sm font-medium">Loading deductions...</p>
             </div>
          ) : deductions.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-12">
                {/* Classic Empty State Illustration */}
                <div className="flex flex-col gap-2 mb-6">
                   {[...Array(3)].map((_, i) => (
                      <div key={i} className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 w-64 opacity-50">
                         <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded mt-1 ${i === 0 ? 'bg-green-500' : i === 1 ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                            <div className="flex-1 space-y-2">
                               <div className="h-1.5 bg-gray-100 rounded w-3/4"></div>
                               <div className="h-1.5 bg-gray-100 rounded w-1/2"></div>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
                <p className="text-gray-600 text-base font-bold">No transactions</p>
                <p className="text-gray-400 text-xs font-medium mt-1">Is hafton mein koi deduction nahi hui.</p>
             </div>
          ) : (
             <div className="space-y-5 mb-6">
                {dayGroups.map((group) => (
                   <div key={group.key}>
                      <div className="flex items-center justify-between px-1 mb-2">
                         <p className="text-gray-900 text-xs font-black uppercase tracking-wider">
                            {group.date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                         </p>
                         <p className="text-red-600 text-xs font-bold">-{formatCurrency(group.total)}</p>
                      </div>
                      <div className="space-y-3">
                         {group.items.map((item, index) => (
                            <div
                              key={item._id || index}
                              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 active:scale-[0.98] transition-all"
                            >
                               <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                     <div className={`w-2 h-2 rounded ${
                                        index % 3 === 0 ? 'bg-green-500' :
                                        index % 3 === 1 ? 'bg-orange-500' : 'bg-blue-500'
                                     }`}></div>
                                     <div>
                                        <p className="text-gray-900 text-sm font-bold leading-tight">{item.description || 'System Deduction'}</p>
                                        <p className="text-gray-400 text-[10px] font-bold mt-1 uppercase tracking-tight">
                                           {new Date(item.createdAt || item.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                     </div>
                                  </div>
                                  <div className="text-red-600 text-base font-bold">
                                     -{formatCurrency(item.amount)}
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                ))}
             </div>
          )}
       </div>
    </div>
  );
};
