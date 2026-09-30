import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import Loader from '@food/components/Loader';
import { format } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Search, X } from 'lucide-react';

export default function FranchiseLedger() {
    const [ledger, setLedger] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedEntry, setSelectedEntry] = useState(null);
    
    // Pagination and Filters
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState({ search: '', serviceType: '', transactionType: '', type: '' });

    useEffect(() => {
        fetchLedger();
    }, [page, filters]);

    const fetchLedger = async () => {
        try {
            setLoading(true);
            const query = new URLSearchParams({ page, limit: 15 });
            if (filters.search) query.append('search', filters.search);
            if (filters.serviceType) query.append('serviceType', filters.serviceType);
            if (filters.transactionType) query.append('transactionType', filters.transactionType);
            if (filters.type) query.append('type', filters.type);

            const { data } = await api.get(`/franchise/financials/ledger?${query.toString()}`);
            setLedger(data.data.docs || []);
            setTotalPages(data.data.totalPages || 1);
        } catch (error) {
            toast.error('Failed to fetch ledger');
        } finally {
            setLoading(false);
        }
    };

    const fetchDetail = async (id) => {
        try {
            const { data } = await api.get(`/franchise/financials/ledger/${id}`);
            setSelectedEntry(data.data);
        } catch (error) {
            toast.error('Failed to fetch ledger detail');
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Financial Ledger</h1>

            <div className="mb-6 flex gap-4 bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search Transaction ID..." 
                        value={filters.search}
                        onChange={e => setFilters({...filters, search: e.target.value})}
                        className="pl-9 pr-3 py-2 border rounded-md shadow-sm w-64 focus:ring-rose-500 focus:border-rose-500 text-sm"
                    />
                </div>
                <select 
                    value={filters.serviceType} 
                    onChange={e => setFilters({...filters, serviceType: e.target.value})}
                    className="border px-3 py-2 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 text-sm"
                >
                    <option value="">All Services</option>
                    <option value="FOOD_ORDER">Food Orders</option>
                    <option value="TAXI_RIDE">Taxi Rides</option>
                </select>
                <select 
                    value={filters.transactionType} 
                    onChange={e => setFilters({...filters, transactionType: e.target.value})}
                    className="border px-3 py-2 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 text-sm"
                >
                    <option value="">All Transaction Types</option>
                    <option value="COMMISSION">Commission</option>
                    <option value="REVERSAL">Reversal</option>
                    <option value="REFUND">Refund</option>
                    <option value="ADJUSTMENT">Adjustment</option>
                </select>
                <select 
                    value={filters.type} 
                    onChange={e => setFilters({...filters, type: e.target.value})}
                    className="border px-3 py-2 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500 text-sm"
                >
                    <option value="">All Entries (Cr/Dr)</option>
                    <option value="CREDIT">Credits</option>
                    <option value="DEBIT">Debits</option>
                </select>
            </div>

            {loading && !ledger.length ? <Loader /> : (
                <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID / Source</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance After</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {ledger.length === 0 ? (
                                <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No ledger entries found</td></tr>
                            ) : (
                                ledger.map(entry => (
                                    <tr key={entry._id} onClick={() => fetchDetail(entry._id)} className="hover:bg-gray-50 cursor-pointer transition">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {format(new Date(entry.createdAt), 'dd MMM yyyy, HH:mm')}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900">{entry.ledgerTransactionId}</div>
                                            <div className="text-xs text-gray-500 capitalize">{String(entry.sourceType).replace('_', ' ')}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                entry.transactionType === 'COMMISSION' ? 'bg-blue-100 text-blue-800' :
                                                entry.transactionType === 'REVERSAL' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {entry.transactionType}
                                            </span>
                                            {entry.status === 'REVERSED' && (
                                                <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                    REVERSED
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {entry.credit > 0 ? (
                                                <span className="text-green-600 flex items-center justify-end">
                                                    + ₹{Number(entry.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </span>
                                            ) : entry.debit > 0 ? (
                                                <span className="text-rose-600 flex items-center justify-end">
                                                    - ₹{Number(entry.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">₹0.00</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900 font-medium">
                                            ₹{Number(entry.balanceAfter).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    
                    {totalPages > 1 && (
                        <div className="px-6 py-3 border-t flex justify-between items-center bg-gray-50">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded bg-white disabled:opacity-50 text-sm font-medium text-gray-700">Previous</button>
                            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded bg-white disabled:opacity-50 text-sm font-medium text-gray-700">Next</button>
                        </div>
                    )}
                </div>
            )}

            {selectedEntry && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div className="fixed inset-0 transition-opacity" onClick={() => setSelectedEntry(null)}>
                            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl w-full">
                            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                <div className="flex justify-between items-center border-b pb-4 mb-4">
                                    <h3 className="text-lg leading-6 font-bold text-gray-900">
                                        Ledger Detail <span className="text-gray-500 text-sm ml-2 font-normal">({selectedEntry.ledgerTransactionId})</span>
                                    </h3>
                                    <button onClick={() => setSelectedEntry(null)} className="text-gray-400 hover:text-gray-500">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Transaction Info</h4>
                                        <div className="space-y-3 text-sm">
                                            <div className="flex justify-between"><span className="text-gray-500">Type</span> <span className="font-medium text-gray-900">{selectedEntry.transactionType}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Source</span> <span className="font-medium text-gray-900">{selectedEntry.sourceType}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Source ID</span> <span className="font-medium text-gray-900 truncate max-w-[150px]">{selectedEntry.sourceId}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Date</span> <span className="font-medium text-gray-900">{format(new Date(selectedEntry.createdAt), 'PPp')}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Status</span> <span className="font-medium text-gray-900">{selectedEntry.status}</span></div>
                                            {selectedEntry.originalLedgerTransactionId && (
                                                <div className="flex justify-between"><span className="text-gray-500">Reverses Txn</span> <span className="font-medium text-rose-600">{selectedEntry.originalLedgerTransactionId}</span></div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Financial Breakdown</h4>
                                        <div className="space-y-3 text-sm">
                                            <div className="flex justify-between"><span className="text-gray-500">Gross Amount</span> <span className="font-medium text-gray-900">₹{selectedEntry.grossAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Commissionable</span> <span className="font-medium text-gray-900">₹{selectedEntry.commissionableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                                            <div className="border-t my-2 pt-2 flex justify-between"><span className="text-gray-500">Partner Share</span> <span className="font-medium text-gray-900">₹{selectedEntry.partnerShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-500">Company Share</span> <span className="font-medium text-gray-900">₹{selectedEntry.companyShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                                            <div className="flex justify-between"><span className="text-gray-900 font-bold">Franchise Share</span> <span className="font-bold text-rose-600">₹{selectedEntry.franchiseShare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-6 border-t pt-4">
                                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Rule Applied</h4>
                                    <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-700">
                                        <div className="flex gap-4">
                                            <div>Rule ID: <span className="font-medium">{selectedEntry.commissionRuleId?.ruleId || 'N/A'}</span></div>
                                            <div>Version: <span className="font-medium">{selectedEntry.commissionRuleVersion}</span></div>
                                            <div>Calculation: <span className="font-medium">{selectedEntry.commissionRuleId?.calculationType || 'N/A'}</span></div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="mt-6 flex justify-between items-center bg-gray-50 p-4 rounded-md">
                                    <div>
                                        <div className="text-sm text-gray-500">Entry Amount</div>
                                        <div className={`text-xl font-bold ${selectedEntry.credit > 0 ? 'text-green-600' : 'text-rose-600'}`}>
                                            {selectedEntry.credit > 0 ? '+' : '-'} ₹{Math.max(selectedEntry.credit, selectedEntry.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-gray-500">Balance After</div>
                                        <div className="text-xl font-bold text-gray-900">
                                            ₹{Number(selectedEntry.balanceAfter).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                </div>
                                
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
