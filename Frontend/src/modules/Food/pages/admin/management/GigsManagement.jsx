import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calendar, Clock, Plus, Users, CheckCircle2, AlertTriangle, XCircle,
  Search, Filter, Edit, Trash2, X, RefreshCcw, ShieldCheck, LayoutGrid, List, ShieldAlert, MapPin
} from 'lucide-react';
import { apiClient } from '@/services/api';
import { adminAPI } from '@food/api';
import { toast } from 'sonner';
import useAdminNotifications from '@food/hooks/useAdminNotifications';
import HandoverApprovalModal from '@food/components/admin/HandoverApprovalModal';
import DriverLiveLocationModal from '@food/components/admin/deliveryman/DriverLiveLocationModal';

export const GigsManagement = () => {
  const [searchParams] = useSearchParams();
  const handoverIdFromUrl = searchParams.get('handoverId');
  const { items: adminNotifications, approveHandover: rawApproveHandover, rejectHandover: rawRejectHandover } = useAdminNotifications();
  const [apiPendingHandovers, setApiPendingHandovers] = useState([]);

  const fetchPendingHandovers = async () => {
    try {
      const res = await adminAPI.getPendingHandovers();
      const rawData = res?.data?.data || res?.data || res;
      const rows = rawData?.orders || rawData?.items || (Array.isArray(rawData) ? rawData : []) || [];
      if (Array.isArray(rows)) {
        const mapped = rows.map((item) => {
          const requestedBy = item?.dispatch?.handoverRequest?.requestedBy;
          const partnerName =
            (typeof requestedBy === "object" ? (requestedBy?.name || requestedBy?.fullName) : null) ||
            item?.deliveryPartnerName ||
            item?.deliveryPartner?.fullName ||
            item?.deliveryPartner?.name ||
            "Delivery Partner";
          const partnerPhone =
            (typeof requestedBy === "object" ? requestedBy?.phone : null) ||
            item?.deliveryPartnerPhone ||
            item?.deliveryPartner?.phone ||
            "N/A";
          const partnerVehicle =
            (typeof requestedBy === "object"
              ? [requestedBy?.vehicleType, requestedBy?.vehicleNumber].filter(Boolean).join(" - ")
              : null) || "";

          const restaurantObj = typeof item?.restaurantId === "object" ? item.restaurantId : null;
          const restaurantName = restaurantObj?.restaurantName || restaurantObj?.name || item?.restaurantName || "Restaurant";
          const zoneName = (typeof restaurantObj?.zoneId === "object" ? restaurantObj.zoneId?.name : null) || restaurantObj?.area || item?.zoneName || "Zone";

          const userObj = typeof item?.userId === "object" ? item.userId : null;
          const customerName = userObj?.name || userObj?.fullName || item?.customerName || item?.deliveryAddress?.contactName || "Customer";
          const customerPhone = userObj?.phone || item?.customerPhone || item?.deliveryAddress?.contactPhone || "N/A";
          const customerAddress = item?.customerAddress || item?.deliveryAddress?.formattedAddress || [item?.deliveryAddress?.addressLine1, item?.deliveryAddress?.city].filter(Boolean).join(", ") || "N/A";

          const reason = item?.dispatch?.handoverRequest?.reason || item?.reason || "Emergency";
          const note = item?.dispatch?.handoverRequest?.note || item?.note || "";
          const orderDisplayId = item?.order_id || item?.orderId || item?._id;
          const orderMongoId = String(item?._id || item?.id || item?.orderMongoId || "");

          return {
            id: `approval-handover-${orderMongoId}`,
            orderMongoId,
            orderId: orderDisplayId,
            title: `🚨 Order Handover Request`,
            message: `Driver ${partnerName}${partnerPhone && partnerPhone !== "N/A" ? ` (${partnerPhone})` : ""} requested handover for Order #${orderDisplayId} (${restaurantName}). Reason: ${reason}${note ? ` (${note})` : ""}. Driver set Offline. Admin approval required.`,
            type: "approval",
            category: "handover_approval",
            path: `/admin/food/delivery-partners/gigs?handoverId=${orderMongoId}`,
            createdAt: item?.dispatch?.handoverRequest?.requestedAt || item?.updatedAt || item?.createdAt,
            timeLabel: item?.dispatch?.handoverRequest?.requestedAt
              ? new Date(item.dispatch.handoverRequest.requestedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })
              : "Recently",
            partnerName,
            partnerPhone,
            partnerVehicle,
            restaurantName,
            zoneName,
            customerName,
            customerPhone,
            customerAddress,
            reason,
            note,
            rawOrder: item,
          };
        });
        setApiPendingHandovers(mapped);
      }
    } catch (err) {
      console.warn("Failed to fetch pending handovers:", err);
    }
  };

  const handleApproveHandover = async (orderId) => {
    const strId = String(orderId || "").trim();
    const ok = await rawApproveHandover(orderId);
    setApiPendingHandovers((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (h) =>
          String(h.orderMongoId) !== strId &&
          String(h.orderId) !== strId &&
          String(h.id) !== strId &&
          String(h.id) !== `approval-handover-${strId}`
      )
    );
    fetchPendingHandovers();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("adminNotificationsUpdated"));
    return ok;
  };

  const handleRejectHandover = async (orderId, reason) => {
    const strId = String(orderId || "").trim();
    const ok = await rawRejectHandover(orderId, reason);
    setApiPendingHandovers((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (h) =>
          String(h.orderMongoId) !== strId &&
          String(h.orderId) !== strId &&
          String(h.id) !== strId &&
          String(h.id) !== `approval-handover-${strId}`
      )
    );
    fetchPendingHandovers();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("adminNotificationsUpdated"));
    return ok;
  };

  const combinedHandoversMap = new Map();
  [...apiPendingHandovers, ...adminNotifications.filter(it => it.category === "handover_approval")].forEach(item => {
    const key = String(item.orderMongoId || item.orderId || item.id);
    if (key) combinedHandoversMap.set(key, item);
  });
  const pendingHandovers = Array.from(combinedHandoversMap.values());

  const [selectedHandoverItem, setSelectedHandoverItem] = useState(null);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);

  useEffect(() => {
    if (handoverIdFromUrl && pendingHandovers.length > 0) {
      const match = pendingHandovers.find(h => String(h.orderMongoId) === String(handoverIdFromUrl) || String(h.orderId) === String(handoverIdFromUrl));
      if (match) {
        setSelectedHandoverItem(match);
        setHandoverModalOpen(true);
      }
    }
  }, [handoverIdFromUrl, pendingHandovers]);

  const [gigs, setGigs] = useState([]);
  const [stats, setStats] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState('card');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGig, setEditingGig] = useState(null);
  const [deactivatingGig, setDeactivatingGig] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomZone, setIsCustomZone] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '12:00',
    endTime: '16:00',
    capacity: 20,
    zoneName: 'All Zones',
    cancellationCutoffMinutes: 60
  });

  const [partnerBookings, setPartnerBookings] = useState([]);
  const [bookingSummary, setBookingSummary] = useState(null);
  const [partnerFilterTab, setPartnerFilterTab] = useState('all');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState('');
  const [selectedGigIdFilter, setSelectedGigIdFilter] = useState('');
  const [remindingBookingId, setRemindingBookingId] = useState(null);

  const [selectedLivePartner, setSelectedLivePartner] = useState(null);
  const [liveModalOpen, setLiveModalOpen] = useState(false);

  const handleOpenLiveLocation = (booking) => {
    setSelectedLivePartner({
      _id: booking.partnerId || booking.partner_id || booking._id,
      name: booking.partnerName,
      phone: booking.partnerPhone,
      profilePhoto: booking.profilePhoto,
      vehicleType: booking.vehicleType || 'Bike',
      vehicleNumber: booking.vehicleNumber || '',
      availabilityStatus: booking.workStatus === 'Working / Online' ? 'online' : 'offline',
      lastLat: booking.lastLat,
      lastLng: booking.lastLng,
      activeOrderId: booking.activeOrderId || null,
    });
    setLiveModalOpen(true);
  };

  const handleRemindPartner = async (booking) => {
    const bookingId = booking._id || booking.bookingId;
    if (!bookingId) {
      toast.error('Invalid booking record');
      return;
    }

    try {
      setRemindingBookingId(bookingId);
      const res = await apiClient.post(`/food/gigs/admin/gigs/bookings/${bookingId}/remind`, {
        partnerId: booking.partnerId
      });
      if (res.data?.success) {
        toast.success(res.data.message || `Reminder notification sent to ${booking.partnerName}`);
      } else {
        toast.error(res.data?.message || 'Failed to send reminder notification');
      }
    } catch (err) {
      console.error('Send reminder error:', err);
      toast.error(err.response?.data?.message || 'Failed to send reminder notification');
    } finally {
      setRemindingBookingId(null);
    }
  };

  const fetchGigs = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs', {
        params: { date: selectedDate, status: statusFilter }
      });
      if (res.data?.success && res.data.data) {
        setGigs(res.data.data.gigs || []);
      }
    } catch (err) {
      toast.error('Failed to load gigs');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs/stats');
      if (res.data?.success && res.data.data) {
        setStats(res.data.data);
      }
    } catch (err) {
      console.warn('Failed to load gig stats:', err);
    }
  };

  const fetchZones = async () => {
    try {
      const res = await apiClient.get('/food/admin/zones');
      const list = res.data?.data?.zones || res.data?.zones || [];
      if (Array.isArray(list)) {
        setZones(list);
      }
    } catch (err) {
      console.warn('Failed to load zones:', err);
    }
  };

  const fetchPartnerBookings = async () => {
    try {
      const res = await apiClient.get('/food/gigs/admin/gigs/bookings', {
        params: {
          date: selectedDate,
          status: partnerFilterTab,
          zoneId: selectedZoneFilter,
          gigId: selectedGigIdFilter
        }
      });
      if (res.data?.success && res.data.data) {
        setPartnerBookings(res.data.data.bookings || []);
        setBookingSummary(res.data.data.summary || null);
      }
    } catch (err) {
      console.warn('Failed to load partner gig bookings:', err);
    }
  };

  useEffect(() => {
    // Gig (shift) booking is discontinued: only the order-handover requests are loaded here.
    fetchPendingHandovers();
  }, [selectedDate, statusFilter, partnerFilterTab, selectedZoneFilter, selectedGigIdFilter]);

  const handleCreateOrUpdateGig = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingGig) {
        await apiClient.patch(`/food/gigs/admin/gigs/${editingGig._id}`, formData);
        toast.success('Gig updated successfully');
      } else {
        const res = await apiClient.post('/food/gigs/admin/gigs', formData);
        const count = res.data?.data?.count || (Array.isArray(res.data?.data?.gigs) ? res.data.data.gigs.length : 1);
        if (count > 1) {
          toast.success(`Created ${count} gig slots for everyday schedule!`);
        } else {
          toast.success('Gig created successfully');
        }
      }
      setShowCreateModal(false);
      setEditingGig(null);
      fetchGigs();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save gig');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateGig = async (gigId) => {
    try {
      await apiClient.delete(`/food/gigs/admin/gigs/${gigId}`);
      toast.success('Gig slot deactivated successfully');
      setGigs((prev) => prev.filter((g) => g._id !== gigId));
      fetchGigs();
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to deactivate gig');
    }
  };

  const openEditModal = (gig) => {
    setEditingGig(gig);
    const zName = gig.zoneName || 'All Zones';
    const knownNames = ['All Zones', ...zones.map((z) => z.name || z.serviceLocation || z.zoneName).filter(Boolean)];
    setIsCustomZone(!knownNames.includes(zName));
    setFormData({
      title: gig.title || 'Shift',
      date: gig.date || selectedDate,
      startTime: gig.startTime || '12:00',
      endTime: gig.endTime || '16:00',
      capacity: gig.capacity || 20,
      zoneName: zName,
      cancellationCutoffMinutes: gig.cancellationCutoffMinutes ?? 60,
      repeatOption: 'single',
      endDate: gig.date || selectedDate
    });
    setShowCreateModal(true);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Operations Control</span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Handover Requests</h1>
          <p className="text-xs text-slate-500 font-medium mt-1">Riders who cannot finish an order ask here for a handover. Approve to send the order to another rider.</p>
        </div>
      </div>

      {pendingHandovers.length === 0 && (
        <div className="bg-white p-10 rounded-3xl border border-gray-100 shadow-sm text-center text-sm font-semibold text-slate-400">
          No handover requests right now.
        </div>
      )}

      {/* 🚨 Pending Emergency Handover Requests List Box */}
      {pendingHandovers.length > 0 && (
        <div className="bg-gradient-to-br from-rose-50 to-amber-50 p-6 rounded-3xl border border-rose-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Pending Order Handover Requests
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold">
                    {pendingHandovers.length}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">Review driver emergency handover requests zone-wise, inspect customer & driver details, and approve for automatic re-dispatch.</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingHandovers.map((item) => {
              const rawOrder = item?.rawOrder || {};
              const orderDisplayId = item?.orderId || item?.orderMongoId || "N/A";
              const partnerName = item?.partnerName || rawOrder?.deliveryPartnerName || "Delivery Partner";
              const partnerPhone = item?.partnerPhone || rawOrder?.deliveryPartnerPhone || "N/A";
              const customerName = item?.customerName || rawOrder?.customerName || "Customer";
              const customerPhone = item?.customerPhone || rawOrder?.userPhone || "N/A";
              const restaurantName = item?.restaurantName || rawOrder?.restaurantName || "Restaurant";
              const zoneName = item?.zoneName || rawOrder?.zoneName || "Zone";
              const reason = item?.reason || "Emergency";

              return (
                <div key={item.id} className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm hover:shadow-md transition-all space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                      Order #{orderDisplayId}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                      Zone: {zoneName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Requesting Driver</span>
                      <span className="font-bold text-slate-900">{partnerName}</span>
                      <span className="text-[11px] text-slate-500 block">{partnerPhone}</span>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Customer</span>
                      <span className="font-bold text-slate-900">{customerName}</span>
                      <span className="text-[11px] text-slate-500 block">{customerPhone}</span>
                    </div>
                  </div>

                  <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-slate-500 font-medium">Restaurant: </span>
                    <span className="font-bold text-slate-900">{restaurantName}</span>
                    <div className="mt-1 text-rose-700 font-medium">
                      Reason: "{reason}"
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        setSelectedHandoverItem(item);
                        setHandoverModalOpen(true);
                      }}
                      className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors text-center shadow-sm"
                    >
                      Review & Approve Request
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveHandover(item.orderMongoId || item.orderId)}
                      className="px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-xl text-xs font-bold transition-all"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = prompt("Reason for rejection:", "Rejected by admin") || "Rejected by admin";
                        handleRejectHandover(item.orderMongoId || item.orderId, r);
                      }}
                      className="px-3 py-2 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all"
                    >
                      Reject
                    </button>
                    {partnerPhone && partnerPhone !== "N/A" && (
                      <a
                        href={`tel:${partnerPhone}`}
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
                      >
                        Call
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <HandoverApprovalModal
        isOpen={handoverModalOpen}
        onClose={() => setHandoverModalOpen(false)}
        notification={selectedHandoverItem}
        onApprove={handleApproveHandover}
        onReject={handleRejectHandover}
      />
    </div>
  );
};

export default GigsManagement;
