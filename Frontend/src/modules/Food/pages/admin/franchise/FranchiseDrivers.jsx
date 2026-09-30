import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import Loader from '@food/components/Loader';

export default function FranchiseDrivers() {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    useEffect(() => {
        fetchDrivers();
    }, [search, statusFilter]);

    const fetchDrivers = async () => {
        try {
            const { data } = await api.get('/franchise/operations/drivers', {
                params: { search, status: statusFilter }
            });
            setDrivers(data.data);
        } catch (error) {
            toast.error('Failed to fetch drivers');
        } finally {
            setLoading(false);
        }
    };

    if (loading && drivers.length === 0) return <Loader />;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Franchise Drivers</h1>
            </div>

            <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200 flex space-x-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Search by name, email, or phone..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-rose-500"
                >
                    <option value="">All Statuses</option>
                    <option value="approved">Active</option>
                    <option value="pending">Pending</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Driver</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vehicle</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Territory</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {drivers.length === 0 ? (
                            <tr><td colSpan="5" className="px-6 py-8 text-center text-gray-500">No drivers found matching criteria</td></tr>
                        ) : (
                            drivers.map(d => (
                                <tr key={d._id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{d.name}</div>
                                        <div className="text-xs text-gray-500">Joined: {new Date(d.createdAt).toLocaleDateString()}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">{d.email || 'No email'}</div>
                                        <div className="text-xs text-gray-500">{d.phone}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900 capitalize">{d.vehicleType}</div>
                                        <div className="text-xs text-gray-500">{d.vehicleNumber || 'N/A'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            d.status === 'approved' ? 'bg-green-100 text-green-800' :
                                            d.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {d.status}
                                        </span>
                                        <span className="block mt-1 text-xs text-gray-500">
                                            {d.isOnline ? '🟢 Online' : '⚪ Offline'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {d.territoryId?.name || 'Not assigned'}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
