import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { deliveryAPI } from '@food/api';
import RideModePill from '@/modules/DeliveryV2/components/RideModePill';
import { socketService } from '../../../shared/api/socket';
import { apiErrorOf, isRideModePartner, setRideModeCache } from '@/modules/DeliveryV2/utils/rideModeSession';

/**
 * Shown on the ride home of a delivery partner in Ride & Parcel mode: switches the partner back to food delivery.
 * The backend refuses while a ride is in progress, so a trip is never left half way.
 */
const RideModeReturnBar = ({ hasActiveRide = false }) => {
    const navigate = useNavigate();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);

    if (!isRideModePartner()) return null;

    const switchToFood = async () => {
        setConfirmOpen(false);
        setIsSwitching(true);
        try {
            const result = (await deliveryAPI.switchRideMode('food'))?.data?.data || {};
            socketService.disconnect();
            setRideModeCache('food');
            const upcoming = result.upcomingScheduledRides || [];
            toast.success(
                upcoming.length
                    ? `Back on Food delivery. You still have ${upcoming.length} scheduled ride(s) — switch back before pickup time.`
                    : 'Back on Food delivery. Go online to get orders.',
                { duration: upcoming.length ? 8000 : 4000 },
            );
            navigate('/food/delivery/feed', { replace: true });
        } catch (error) {
            toast.error(apiErrorOf(error).message);
        } finally {
            setIsSwitching(false);
        }
    };

    return (
        <>
            <div className="fixed top-[92px] left-0 right-0 z-40 mx-auto max-w-md flex justify-center pointer-events-none">
                <RideModePill
                    target="food"
                    busy={isSwitching}
                    className="pointer-events-auto"
                    onClick={() => (hasActiveRide
                        ? toast.error('Finish your current ride before switching to Food delivery.')
                        : setConfirmOpen(true))}
                />
            </div>

            <AnimatePresence>
                {confirmOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm"
                            onClick={() => setConfirmOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 24, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 24, scale: 0.96 }}
                            className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
                        >
                            <h3 className="text-[18px] font-black tracking-tight text-slate-950">Switch to Food delivery?</h3>
                            <p className="mt-2 text-[13px] font-semibold leading-relaxed text-slate-500">
                                You will go offline for rides and parcels. Your ride earnings stay in your Pocket.
                            </p>
                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setConfirmOpen(false)}
                                    className="h-12 rounded-[16px] border border-slate-200 bg-slate-50 text-[12px] font-black uppercase tracking-[0.14em] text-slate-500"
                                >
                                    Stay
                                </button>
                                <button
                                    type="button"
                                    onClick={switchToFood}
                                    className="h-12 rounded-[16px] bg-emerald-500 text-[12px] font-black uppercase tracking-[0.14em] text-white shadow-[0_14px_28px_rgba(16,185,129,0.28)]"
                                >
                                    Switch
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default RideModeReturnBar;
