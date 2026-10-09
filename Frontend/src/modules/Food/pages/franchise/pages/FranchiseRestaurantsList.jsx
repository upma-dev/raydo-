import React, { useState, useEffect, useMemo } from 'react';
import { Search, Building2, Phone, Mail, MapPin, Eye, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { franchisePartnerAPI } from '@food/api';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@food/components/ui/dialog';

export default function FranchiseRestaurantsList() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      setLoading(true);
      const res = await franchisePartnerAPI.getRestaurants({ limit: 1000 });
      const list = res?.data?.data?.restaurants || res?.data?.restaurants || [];
      setRestaurants(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error('Failed to load franchise restaurants');
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredRestaurants = useMemo(() => {
    let list = [...restaurants];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r =>
        (r.restaurantName || r.name || '').toLowerCase().includes(q) ||
        (r.ownerName || '').toLowerCase().includes(q) ||
        (r.ownerPhone || r.primaryContactNumber || '').includes(q) ||
        (r.city || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(r => (r.status || 'approved').toLowerCase() === statusFilter);
    }
    return list;
  }, [restaurants, searchQuery, statusFilter]);

  const handleViewDetails = (restaurant) => {
    setSelectedRestaurant(restaurant);
    setShowDetailModal(true);
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
            <h1 className="text-2xl font-bold text-slate-900 mt-2">Franchise Outlets & Restaurants</h1>
            <p className="text-sm text-slate-500 mt-1">Manage all restaurant outlets onboarding in your franchise zone.</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3.5 py-1.5 rounded-full text-sm font-bold bg-indigo-100 text-indigo-800">
              Total Outlets: {filteredRestaurants.length}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="relative flex-1 min-w-[240px] w-full">
            <input
              type="text"
              placeholder="Search by restaurant name, owner, phone, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-indigo-600"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>

          <div className="flex items-center gap-2 border border-slate-200 rounded-xl p-1 bg-slate-50">
            {['all', 'approved', 'pending', 'rejected'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  statusFilter === st ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex h-64 items-center justify-center bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : filteredRestaurants.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">No Restaurants Found</h3>
          <p className="text-sm text-slate-500 mt-1">No restaurants have been added in your franchise zone yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRestaurants.map(r => {
            const name = r.restaurantName || r.name || 'Unnamed Restaurant';
            const status = r.status || 'approved';
            const ownerPhone = r.ownerPhone || r.primaryContactNumber || 'N/A';
            const ownerEmail = r.ownerEmail || 'N/A';
            const address = r.addressLine1 || r.address || r.city || 'Franchise Zone';

            return (
              <div key={r._id || r.id} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold capitalize ${
                      status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {status}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">{name}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{r.ownerName ? `Owner: ${r.ownerName}` : 'Restaurant Partner'}</p>

                  <div className="mt-4 space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-slate-400 shrink-0" />
                      <span>{ownerPhone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{ownerEmail}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{address}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={() => handleViewDetails(r)}
                    className="px-4 py-2 rounded-xl bg-slate-50 text-indigo-600 hover:bg-indigo-50 font-bold text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Eye size={14} />
                    View Details
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Details Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-bold text-slate-900">Restaurant Information</DialogTitle>
          </DialogHeader>
          {selectedRestaurant && (
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedRestaurant.restaurantName || selectedRestaurant.name}</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">Status: {selectedRestaurant.status || 'Approved'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p><span className="font-semibold text-slate-700">Owner Name:</span> <span className="text-slate-900">{selectedRestaurant.ownerName || '-'}</span></p>
                <p><span className="font-semibold text-slate-700">Owner Phone:</span> <span className="text-slate-900">{selectedRestaurant.ownerPhone || selectedRestaurant.primaryContactNumber || '-'}</span></p>
                <p><span className="font-semibold text-slate-700">Owner Email:</span> <span className="text-slate-900">{selectedRestaurant.ownerEmail || '-'}</span></p>
                <p><span className="font-semibold text-slate-700">FSSAI No:</span> <span className="text-slate-900">{selectedRestaurant.fssaiNumber || '-'}</span></p>
                <p><span className="font-semibold text-slate-700">Opening Time:</span> <span className="text-slate-900">{selectedRestaurant.openingTime || '09:00'}</span></p>
                <p><span className="font-semibold text-slate-700">Closing Time:</span> <span className="text-slate-900">{selectedRestaurant.closingTime || '22:00'}</span></p>
              </div>

              {selectedRestaurant.addressLine1 && (
                <div className="text-sm">
                  <span className="font-semibold text-slate-800">Address: </span>
                  <span className="text-slate-600">{selectedRestaurant.addressLine1}, {selectedRestaurant.city || ''}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
