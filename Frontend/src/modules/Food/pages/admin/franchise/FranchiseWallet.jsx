import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import Loader from '@food/components/Loader';
import { format } from 'date-fns';
import { Wallet, ArrowUpRight, ArrowDownRight, Clock } from 'lucide-react';

export default function FranchiseWallet() {
    const [wallet, setWallet] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWallet();
    }, []);

    const fetchWallet = async () => {
        try {
            const { data } = await api.get('/franchise/financials/wallet');
            setWallet(data.data);
        } catch (error) {
            toast.error('Failed to fetch wallet information');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <Loader />;

    if (!wallet) return (
        <div className="p-6 text-center text-gray-500">
            <p>Wallet not found or not initialized yet.</p>
        </div>
    );

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Franchise Wallet</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Available Balance */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Available Balance</div>
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                        ₹{Number(wallet.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Total Credits */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Credits</div>
                        <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                            <ArrowDownRight className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                        ₹{Number(wallet.totalCredits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>

                {/* Total Debits */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Debits</div>
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <ArrowUpRight className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-gray-900">
                        ₹{Number(wallet.totalDebits || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium text-gray-900">Wallet Information</h3>
                    <p className="text-sm text-gray-500 mt-1">This wallet is read-only. Transactions are automatically posted by the commission engine.</p>
                </div>
                <div className="text-right">
                    <div className="text-sm text-gray-500 flex items-center justify-end">
                        <Clock className="w-4 h-4 mr-1" /> Last Updated
                    </div>
                    <div className="font-medium text-gray-900 mt-1">
                        {wallet.updatedAt ? format(new Date(wallet.updatedAt), 'PPp') : 'N/A'}
                    </div>
                </div>
            </div>
        </div>
    );
}
