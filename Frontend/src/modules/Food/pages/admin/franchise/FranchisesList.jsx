import React, { useEffect, useState } from 'react';
import api from '@food/api'; // using existing API service
import { toast } from 'sonner';

export default function FranchisesList() {
    const [franchises, setFranchises] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFranchises();
    }, []);

    const fetchFranchises = async () => {
        try {
            setLoading(true);
            const { data } = await api.get('/franchise');
            if (data.success) {
                setFranchises(data.data);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch franchises');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusChange = async (id, status) => {
        try {
            const { data } = await api.patch(`/franchise/${id}/status`, { status });
            if (data.success) {
                toast.success('Status updated successfully');
                fetchFranchises();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading franchises...</div>;
    }

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6 text-gray-800">Franchise Management</h1>
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b">
                        <tr>
                            <th className="p-4 font-semibold text-gray-600">Name</th>
                            <th className="p-4 font-semibold text-gray-600">Legal Name</th>
                            <th className="p-4 font-semibold text-gray-600">Email</th>
                            <th className="p-4 font-semibold text-gray-600">Status</th>
                            <th className="p-4 font-semibold text-gray-600">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {franchises.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-gray-500">
                                    No franchises found.
                                </td>
                            </tr>
                        ) : (
                            franchises.map((f) => (
                                <tr key={f._id} className="hover:bg-gray-50 transition-colors">
                                    <td className="p-4">{f.name}</td>
                                    <td className="p-4">{f.legalName}</td>
                                    <td className="p-4">{f.email}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                            f.status === 'active' ? 'bg-green-100 text-green-700' :
                                            f.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                            {f.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="p-4 flex gap-2">
                                        {f.status !== 'active' && (
                                            <button 
                                                onClick={() => handleStatusChange(f._id, 'active')}
                                                className="text-sm bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600"
                                            >
                                                Approve
                                            </button>
                                        )}
                                        {f.status !== 'suspended' && (
                                            <button 
                                                onClick={() => handleStatusChange(f._id, 'suspended')}
                                                className="text-sm bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                                            >
                                                Suspend
                                            </button>
                                        )}
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
