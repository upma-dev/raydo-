import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import Loader from '@food/components/Loader';
import { Wallet, PieChart, Activity, IndianRupee, ArrowDownRight, ArrowUpRight } from 'lucide-react';

export default function FranchiseFinancials() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const res = await api.get('/franchise/financials/dashboard');
            setData(res.data.data);
        } catch (error) {
            toast.error('Failed to fetch financial dashboard');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loader />;
    
    if (!data) return (
        <div className="p-6 text-center text-gray-500">
            Failed to load dashboard data.
        </div>
    );

    const { totals, globalWallet } = data;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Financial Overview</h1>
            
            {globalWallet && (
                <div className="mb-8 p-6 bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl shadow-lg text-white">
                    <h2 className="text-lg font-medium text-gray-300 mb-4 flex items-center">
                        <Wallet className="w-5 h-5 mr-2" />
                        Global Franchise Wallet Aggregate
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <div className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-1">Total Balance Distributed</div>
                            <div className="text-4xl font-bold">₹{Number(globalWallet.globalBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Gross Amount */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Gross Transaction Vol</div>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Activity className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        ₹{Number(totals.totalGrossAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Platform Commissionable */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Commissionable</div>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <PieChart className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-gray-900">
                        ₹{Number(totals.totalCommissionableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
                
                {/* Franchise Earnings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-rose-500">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Franchise Earnings</div>
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            <IndianRupee className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-rose-600">
                        ₹{Number(totals.totalFranchiseShare || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Company Earnings */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-green-500">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Company Earnings</div>
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                            <IndianRupee className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                        ₹{Number(totals.totalCompanyShare || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Partner Share</h3>
                    <p className="text-gray-500 text-xs mb-4">Money allocated to Delivery Riders & Restaurants</p>
                    <div className="text-xl font-bold text-gray-900">
                        ₹{Number(totals.totalPartnerShare || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Ledger Credits</h3>
                    <p className="text-gray-500 text-xs mb-4">Total money credited to franchise wallets</p>
                    <div className="text-xl font-bold text-gray-900 flex items-center">
                        <ArrowDownRight className="w-4 h-4 text-green-500 mr-1" />
                        ₹{Number(totals.totalCredits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Total Ledger Debits</h3>
                    <p className="text-gray-500 text-xs mb-4">Total reversals and deductions</p>
                    <div className="text-xl font-bold text-gray-900 flex items-center">
                        <ArrowUpRight className="w-4 h-4 text-rose-500 mr-1" />
                        ₹{Number(totals.totalDebits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>
        </div>
    );
}
