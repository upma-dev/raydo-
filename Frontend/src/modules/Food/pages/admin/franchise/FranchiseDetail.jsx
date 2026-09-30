import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@food/api';
import { toast } from 'sonner';

export default function FranchiseDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [franchise, setFranchise] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'applicant', label: 'Applicant' },
        { id: 'business', label: 'Business' },
        { id: 'kyc', label: 'KYC' },
        { id: 'territory', label: 'Territory' },
        { id: 'commercial', label: 'Commercial' },
        { id: 'agreement', label: 'Agreement' },
        { id: 'status_history', label: 'Status History' },
        { id: 'activity', label: 'Activity/Audit' }
    ];

    useEffect(() => {
        fetchFranchise();
    }, [id]);

    const fetchFranchise = async () => {
        try {
            setLoading(true);
            const { data } = await api.get(`/franchise/${id}`);
            if (data.success) {
                setFranchise(data.data);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to fetch franchise details');
            navigate('/admin/food/franchises');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading franchise...</div>;
    if (!franchise) return <div className="p-8 text-center text-red-500">Franchise not found.</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{franchise.name}</h1>
                    <p className="text-gray-500">App ID: {franchise.applicationId}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800">
                        {franchise.status}
                    </span>
                    <button className="px-4 py-2 bg-rose-600 text-white rounded shadow text-sm font-medium hover:bg-rose-700">
                        Update Status
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="border-b border-gray-200 overflow-x-auto hide-scrollbar flex whitespace-nowrap">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id 
                                ? 'border-rose-500 text-rose-600' 
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-6 min-h-[400px]">
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 mb-4">Franchise Summary</h3>
                                <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                    <div className="sm:col-span-1">
                                        <dt className="text-sm font-medium text-gray-500">Legal Name</dt>
                                        <dd className="mt-1 text-sm text-gray-900">{franchise.legalName}</dd>
                                    </div>
                                    <div className="sm:col-span-1">
                                        <dt className="text-sm font-medium text-gray-500">Franchise Type</dt>
                                        <dd className="mt-1 text-sm text-gray-900 capitalize">{franchise.franchiseType}</dd>
                                    </div>
                                    <div className="sm:col-span-1">
                                        <dt className="text-sm font-medium text-gray-500">Email Address</dt>
                                        <dd className="mt-1 text-sm text-gray-900">{franchise.email}</dd>
                                    </div>
                                    <div className="sm:col-span-1">
                                        <dt className="text-sm font-medium text-gray-500">Phone</dt>
                                        <dd className="mt-1 text-sm text-gray-900">{franchise.phone}</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    )}
                    {activeTab === 'applicant' && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Applicant Information</h3>
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Applicant Name</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{franchise.name}</dd>
                                </div>
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{franchise.email}</dd>
                                </div>
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Phone</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{franchise.phone}</dd>
                                </div>
                            </dl>
                        </div>
                    )}
                    
                    {activeTab === 'business' && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Business Information</h3>
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Legal Company Name</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{franchise.legalName}</dd>
                                </div>
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Business Type</dt>
                                    <dd className="mt-1 text-sm text-gray-900 capitalize">{franchise.businessType || 'N/A'}</dd>
                                </div>
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Registration Number</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{franchise.businessRegistrationDetails?.registrationNumber || 'N/A'}</dd>
                                </div>
                                <div className="sm:col-span-1">
                                    <dt className="text-sm font-medium text-gray-500">Tax ID / GST</dt>
                                    <dd className="mt-1 text-sm text-gray-900">{franchise.businessRegistrationDetails?.taxId || 'N/A'}</dd>
                                </div>
                            </dl>
                        </div>
                    )}

                    {activeTab === 'territory' && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Territory Assignment</h3>
                            {franchise.territoryId ? (
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <h4 className="font-semibold text-gray-900">{franchise.territoryId.name}</h4>
                                    <p className="text-sm text-gray-600 mt-1">{franchise.territoryId.city}, {franchise.territoryId.state}</p>
                                    <p className="text-sm text-gray-500 mt-2">Status: <span className="font-medium text-gray-900">{franchise.territoryId.status}</span></p>
                                </div>
                            ) : (
                                <div className="text-gray-500 italic">No territory assigned yet. Request: {franchise.businessAddress?.city}, {franchise.businessAddress?.state}</div>
                            )}
                        </div>
                    )}

                    {activeTab === 'commercial' && (
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Commercial Configuration</h3>
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
                                <p className="text-sm text-blue-800">These values are controlled by Super Admin only.</p>
                            </div>
                            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-3">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <dt className="text-xs font-medium text-gray-500 uppercase">Franchise Fee</dt>
                                    <dd className="mt-1 text-xl font-semibold text-gray-900">${franchise.commercials?.franchiseFee || 0}</dd>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <dt className="text-xs font-medium text-gray-500 uppercase">Company Share</dt>
                                    <dd className="mt-1 text-xl font-semibold text-gray-900">{franchise.commercials?.companyShare || 0}%</dd>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <dt className="text-xs font-medium text-gray-500 uppercase">Franchise Share</dt>
                                    <dd className="mt-1 text-xl font-semibold text-gray-900">{franchise.commercials?.franchiseShare || 0}%</dd>
                                </div>
                            </dl>
                        </div>
                    )}

                    {['kyc', 'agreement', 'status_history', 'activity'].includes(activeTab) && (
                        <div className="text-center py-20 text-gray-500">
                            {tabs.find(t => t.id === activeTab)?.label} API Integration Pending.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
