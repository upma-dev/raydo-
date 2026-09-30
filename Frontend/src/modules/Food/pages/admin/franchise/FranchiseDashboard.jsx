import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { Users, Car, MapPin, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function FranchiseDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const { data } = await api.get('/franchise/operations/dashboard');
            setStats(data.data);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading Dashboard...</div>;
    }

    if (!stats) return null;

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Franchise Operations</h1>
            
            {/* Territory Status */}
            <div className="mb-8 bg-blue-50 border border-blue-100 rounded-lg p-4">
                <div className="flex items-center">
                    <MapPin className="w-5 h-5 text-blue-600 mr-2" />
                    <h2 className="text-lg font-medium text-blue-900">Assigned Territory</h2>
                </div>
                <p className="mt-2 text-blue-800">
                    {stats.territory.assigned ? (
                        <>
                            <span className="font-bold">{stats.territory.name}</span> — Status: <span className="capitalize">{stats.territory.status}</span>
                        </>
                    ) : (
                        'No territory assigned yet.'
                    )}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
                {/* Driver Stats */}
                <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Drivers</h2>
                        <Car className="text-gray-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded">
                            <p className="text-sm text-gray-500">Total</p>
                            <p className="text-2xl font-bold">{stats.drivers.total}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded">
                            <p className="text-sm text-green-600">Active</p>
                            <p className="text-2xl font-bold text-green-700">{stats.drivers.active}</p>
                        </div>
                    </div>
                </div>

                {/* Staff Stats */}
                <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Staff</h2>
                        <Users className="text-gray-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-50 p-4 rounded">
                            <p className="text-sm text-gray-500">Total</p>
                            <p className="text-2xl font-bold">{stats.staff.total}</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded">
                            <p className="text-sm text-green-600">Active</p>
                            <p className="text-2xl font-bold text-green-700">{stats.staff.active}</p>
                        </div>
                    </div>
                </div>

                {/* Restaurant Stats */}
                <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Restaurants</h2>
                    </div>
                    <div className="bg-gray-50 p-4 rounded w-1/2">
                        <p className="text-sm text-gray-500">Total</p>
                        <p className="text-2xl font-bold">{stats.restaurants?.total || 0}</p>
                    </div>
                </div>

                {/* Delivery Partner Stats */}
                <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Del Partners</h2>
                    </div>
                    <div className="bg-gray-50 p-4 rounded w-1/2">
                        <p className="text-sm text-gray-500">Total</p>
                        <p className="text-2xl font-bold">{stats.deliveryPartners?.total || 0}</p>
                    </div>
                </div>

                {/* Vehicle Stats */}
                <div className="bg-white rounded-lg shadow p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Fleet Vehicles</h2>
                    </div>
                    <div className="bg-gray-50 p-4 rounded w-1/2">
                        <p className="text-sm text-gray-500">Total</p>
                        <p className="text-2xl font-bold">{stats.vehicles?.total || 0}</p>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-gray-100">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800 flex items-center">
                        <Activity className="w-5 h-5 mr-2" />
                        Recent Activity
                    </h2>
                </div>
                {stats.recentActivity.length === 0 ? (
                    <div className="p-6 text-center text-gray-500">No recent activity</div>
                ) : (
                    <ul className="divide-y divide-gray-200">
                        {stats.recentActivity.map((activity, idx) => (
                            <li key={idx} className="p-4 hover:bg-gray-50 transition">
                                <p className="text-sm font-medium text-gray-900">{activity.action}</p>
                                <p className="text-xs text-gray-500 mt-1">Entity: {activity.entity} | {new Date(activity.createdAt).toLocaleString()}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
