import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import { Search } from 'lucide-react';
import Loader from '@food/components/Loader';

export default function FranchiseDeliveryPartners() {
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        fetchPartners();
    }, [search]);

    const fetchPartners = async () => {
        try {
            const { data } = await api.get('/franchise/operations/delivery-partners', {
                params: { search }
            });
            setPartners(data.data);
        } catch (error) {
            toast.error('Failed to fetch delivery partners');
        } finally {
            setLoading(false);
        }
    };

    if (loading && partners.length === 0) return <Loader />;

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Franchise Delivery Partners</h1>
            </div>

            <div className="bg-white p-4 rounded-lg shadow mb-6 border border-gray-200">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Search by name or phone..." 
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-rose-500 focus:border-rose-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Partner</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Availability</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Territory</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {partners.length === 0 ? (
                            <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-500">No delivery partners found</td></tr>
                        ) : (
                            partners.map(p => (
                                <tr key={p._id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{p.name}</div>
                                        <div className="text-xs text-gray-500">{p.phone}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            p.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {p.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            p.availabilityStatus === 'online' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {p.availabilityStatus}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {p.territoryId?.name || 'Not assigned'}
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
