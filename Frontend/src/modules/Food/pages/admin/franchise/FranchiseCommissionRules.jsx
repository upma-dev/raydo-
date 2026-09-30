import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import { Plus, Edit2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import Loader from '@food/components/Loader';
import { format } from 'date-fns';

export default function FranchiseCommissionRules() {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Pagination and Filters
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [filters, setFilters] = useState({ search: '', serviceType: '', status: '' });

    const [formData, setFormData] = useState({
        ruleId: '',
        serviceType: 'FOOD',
        calculationType: 'PERCENTAGE',
        franchiseShare: '',
        companyShare: ''
    });

    useEffect(() => {
        fetchRules();
    }, [page, filters]);

    const fetchRules = async () => {
        try {
            setLoading(true);
            const { search, serviceType, status } = filters;
            const query = new URLSearchParams({ page, limit: 10 });
            if (search) query.append('search', search);
            if (serviceType) query.append('serviceType', serviceType);
            if (status) query.append('status', status);

            const { data } = await api.get(`/franchise/commission-rules?${query.toString()}`);
            setRules(data.data.docs || []);
            setTotalPages(data.data.totalPages || 1);
        } catch (error) {
            toast.error('Failed to fetch commission rules');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (formData.franchiseShare < 0 || formData.companyShare < 0) {
                return toast.error('Shares cannot be negative');
            }
            if (formData.calculationType === 'PERCENTAGE' && (Number(formData.franchiseShare) + Number(formData.companyShare) > 100)) {
                return toast.error('Total percentage cannot exceed 100%');
            }

            await api.post('/franchise/commission-rules', {
                ...formData,
                franchiseShare: Number(formData.franchiseShare),
                companyShare: Number(formData.companyShare)
            });
            toast.success('New rule version created successfully');
            setIsModalOpen(false);
            fetchRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to create rule version');
        }
    };

    const toggleStatus = async (ruleId, currentStatus) => {
        try {
            const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
            await api.patch(`/franchise/commission-rules/${ruleId}/status`, { status: newStatus });
            toast.success(`Rule marked as ${newStatus}`);
            fetchRules();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update rule status');
        }
    };

    const openModal = () => {
        setFormData({
            ruleId: '',
            serviceType: 'FOOD',
            calculationType: 'PERCENTAGE',
            franchiseShare: '',
            companyShare: ''
        });
        setIsModalOpen(true);
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Commission Rules</h1>
                <button onClick={openModal} className="bg-rose-600 text-white px-4 py-2 rounded-lg flex items-center shadow hover:bg-rose-700">
                    <Plus className="w-4 h-4 mr-2" /> Create New Rule / Version
                </button>
            </div>

            <div className="mb-4 flex gap-4">
                <input 
                    type="text" 
                    placeholder="Search Rule ID..." 
                    value={filters.search}
                    onChange={e => setFilters({...filters, search: e.target.value})}
                    className="border px-3 py-2 rounded-md shadow-sm w-64 focus:ring-rose-500 focus:border-rose-500"
                />
                <select 
                    value={filters.serviceType} 
                    onChange={e => setFilters({...filters, serviceType: e.target.value})}
                    className="border px-3 py-2 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500"
                >
                    <option value="">All Services</option>
                    <option value="FOOD">FOOD</option>
                    <option value="TAXI">TAXI</option>
                </select>
                <select 
                    value={filters.status} 
                    onChange={e => setFilters({...filters, status: e.target.value})}
                    className="border px-3 py-2 rounded-md shadow-sm focus:ring-rose-500 focus:border-rose-500"
                >
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="EXPIRED">Expired</option>
                </select>
            </div>

            {loading ? <Loader /> : (
                <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rule ID (v)</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Service</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shares</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {rules.length === 0 ? (
                                <tr><td colSpan="6" className="px-6 py-8 text-center text-gray-500">No commission rules found</td></tr>
                            ) : (
                                rules.map(rule => (
                                    <tr key={rule._id}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-bold text-gray-900">{rule.ruleId}</div>
                                            <div className="text-xs text-gray-500">Version {rule.version}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-md">
                                                {rule.serviceType}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <div>Franchise: <span className="font-semibold">{rule.franchiseShare}{rule.calculationType === 'PERCENTAGE' ? '%' : ' (Fixed)'}</span></div>
                                            <div>Company: <span className="font-semibold">{rule.companyShare}{rule.calculationType === 'PERCENTAGE' ? '%' : ' (Fixed)'}</span></div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {format(new Date(rule.effectiveFrom), 'dd MMM yyyy')}
                                            {rule.effectiveTo && <div>to {format(new Date(rule.effectiveTo), 'dd MMM yyyy')}</div>}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                                rule.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {rule.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => toggleStatus(rule._id, rule.status)} 
                                                className={`text-sm ${rule.status === 'ACTIVE' ? 'text-rose-600 hover:text-rose-900' : 'text-green-600 hover:text-green-900'}`}
                                            >
                                                {rule.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="px-6 py-3 border-t flex justify-between items-center bg-gray-50">
                            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded bg-white disabled:opacity-50">Prev</button>
                            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
                            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded bg-white disabled:opacity-50">Next</button>
                        </div>
                    )}
                </div>
            )}

            {/* Create Rule Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
                        <div className="fixed inset-0 transition-opacity" onClick={() => setIsModalOpen(false)}>
                            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                            <form onSubmit={handleSubmit}>
                                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                                        Create Commission Rule Version
                                    </h3>
                                    
                                    <div className="bg-blue-50 text-blue-800 p-3 rounded-md mb-4 flex gap-2 text-sm">
                                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                        <span>Historical rules cannot be edited. Creating a new version for an existing Rule ID will automatically deactivate the previous active version for that scope.</span>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Rule ID</label>
                                            <input type="text" required placeholder="e.g. FOOD-DEL-01" value={formData.ruleId} onChange={e => setFormData({...formData, ruleId: e.target.value.toUpperCase()})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Service Type</label>
                                                <select value={formData.serviceType} onChange={e => setFormData({...formData, serviceType: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm">
                                                    <option value="FOOD">FOOD</option>
                                                    <option value="TAXI">TAXI</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Calculation Type</label>
                                                <select value={formData.calculationType} onChange={e => setFormData({...formData, calculationType: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm">
                                                    <option value="PERCENTAGE">PERCENTAGE</option>
                                                    <option value="FIXED">FIXED AMOUNT</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Franchise Share {formData.calculationType === 'PERCENTAGE' ? '(%)' : '(Amount)'}</label>
                                                <input type="number" min="0" step="0.01" required value={formData.franchiseShare} onChange={e => setFormData({...formData, franchiseShare: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Company Share {formData.calculationType === 'PERCENTAGE' ? '(%)' : '(Amount)'}</label>
                                                <input type="number" min="0" step="0.01" required value={formData.companyShare} onChange={e => setFormData({...formData, companyShare: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                                    <button type="submit" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-rose-600 text-base font-medium text-white hover:bg-rose-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm">
                                        Create Rule Version
                                    </button>
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
