import React, { useState, useEffect } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import Loader from '@food/components/Loader';
import { format } from 'date-fns';
import { ShieldCheck, ShieldAlert, FileText, Upload, Download, ExternalLink, X } from 'lucide-react';
import axios from 'axios';

const DOC_TYPES = ['PERSONAL_KYC', 'BUSINESS_KYC', 'BANK_PROOF', 'ADDRESS_PROOF', 'PAN', 'GST', 'BUSINESS_REGISTRATION'];

export default function FranchiseKyc() {
    const [kycDocs, setKycDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    
    const [uploadData, setUploadData] = useState({
        documentType: 'PERSONAL_KYC',
        file: null
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        fetchKycDocs();
    }, []);

    const fetchKycDocs = async () => {
        try {
            const { data } = await api.get('/franchise/kyc');
            setKycDocs(data.data);
        } catch (error) {
            toast.error('Failed to fetch KYC documents');
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
            toast.error('Only PDF, JPG, and PNG files are allowed');
            e.target.value = null;
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB conceptual limit
            toast.error('File size cannot exceed 5MB');
            e.target.value = null;
            return;
        }

        setUploadData({ ...uploadData, file });
    };

    const handleUploadSubmit = async (e) => {
        e.preventDefault();
        if (!uploadData.file) return toast.error('Please select a file');

        setUploading(true);
        try {
            const fileExt = uploadData.file.name.split('.').pop().toLowerCase();
            
            // 1. Get presigned URL
            const urlRes = await api.post('/franchise/kyc/upload-url', {
                documentType: uploadData.documentType,
                fileExtension: fileExt,
                // franchiseId is inferred from token by backend if Franchise Admin
            });
            const { uploadUrl, objectKey } = urlRes.data.data;

            // 2. Upload directly to S3 via presigned URL
            await axios.put(uploadUrl, uploadData.file, {
                headers: {
                    'Content-Type': uploadData.file.type
                }
            });

            // 3. Confirm upload with backend
            await api.post('/franchise/kyc/submit', {
                documentType: uploadData.documentType,
                objectKey,
                metadata: {
                    originalName: uploadData.file.name,
                    size: uploadData.file.size
                }
            });

            toast.success('Document uploaded successfully for review');
            setIsUploadModalOpen(false);
            setUploadData({ documentType: 'PERSONAL_KYC', file: null });
            fetchKycDocs();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Failed to upload document');
        } finally {
            setUploading(false);
        }
    };

    const viewDocument = async (id) => {
        try {
            const { data } = await api.get(`/franchise/kyc/${id}/download-url`);
            // Open secure presigned URL in new tab
            window.open(data.data.downloadUrl, '_blank');
        } catch (error) {
            toast.error('Failed to access secure document');
        }
    };

    const updateStatus = async (id, status, reason = '') => {
        try {
            await api.patch(`/franchise/kyc/${id}/status`, { status, rejectionReason: reason });
            toast.success(`Document marked as ${status}`);
            fetchKycDocs();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to update status');
        }
    };

    const getStatusBadge = (status) => {
        switch(status) {
            case 'VERIFIED': return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">Verified</span>;
            case 'REJECTED': return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full font-medium">Rejected</span>;
            case 'UNDER_REVIEW': return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">Under Review</span>;
            default: return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">Pending Review</span>;
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Franchise KYC Vault</h1>
                    <p className="text-sm text-gray-500 mt-1">Securely manage and verify franchise compliance documents.</p>
                </div>
                <button onClick={() => setIsUploadModalOpen(true)} className="bg-rose-600 text-white px-4 py-2 rounded-lg flex items-center shadow hover:bg-rose-700">
                    <Upload className="w-4 h-4 mr-2" /> Upload Document
                </button>
            </div>

            {loading ? <Loader /> : (
                <div className="grid grid-cols-1 gap-6">
                    {DOC_TYPES.map(docType => {
                        const docsOfType = kycDocs.filter(d => d.documentType === docType);
                        
                        return (
                            <div key={docType} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                                    <h3 className="font-semibold text-gray-800 flex items-center">
                                        <FileText className="w-5 h-5 mr-2 text-gray-400" />
                                        {docType.replace(/_/g, ' ')}
                                    </h3>
                                    {docsOfType.length === 0 && (
                                        <span className="text-sm text-gray-500 italic">Not Uploaded</span>
                                    )}
                                </div>
                                
                                {docsOfType.length > 0 && (
                                    <ul className="divide-y divide-gray-100">
                                        {docsOfType.map(doc => (
                                            <li key={doc._id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                                                <div className="flex items-center space-x-4">
                                                    <div className="flex-shrink-0">
                                                        {doc.status === 'VERIFIED' ? <ShieldCheck className="w-8 h-8 text-green-500" /> :
                                                         doc.status === 'REJECTED' ? <ShieldAlert className="w-8 h-8 text-red-500" /> :
                                                         <ShieldAlert className="w-8 h-8 text-yellow-500" />}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                                                            {doc.franchiseId?.name || 'Your Franchise'}
                                                            {getStatusBadge(doc.status)}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            Uploaded: {format(new Date(doc.createdAt), 'PPp')}
                                                        </div>
                                                        {doc.status === 'REJECTED' && (
                                                            <div className="text-xs text-red-600 mt-1">
                                                                Reason: {doc.rejectionReason}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-3">
                                                    <button onClick={() => viewDocument(doc._id)} className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium">
                                                        <ExternalLink className="w-4 h-4 mr-1" /> View Securely
                                                    </button>
                                                    
                                                    {/* Admin actions (These should ideally be hidden from Franchise Admin via RBAC UI checks) */}
                                                    <div className="pl-4 border-l flex space-x-2">
                                                        <button 
                                                            onClick={() => updateStatus(doc._id, 'VERIFIED')} 
                                                            className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 border border-green-200"
                                                        >
                                                            Verify
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                const reason = window.prompt("Rejection reason:");
                                                                if(reason) updateStatus(doc._id, 'REJECTED', reason);
                                                            }} 
                                                            className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 border border-red-200"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {isUploadModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen px-4 text-center sm:p-0">
                        <div className="fixed inset-0 transition-opacity" onClick={() => !uploading && setIsUploadModalOpen(false)}>
                            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg w-full">
                            <form onSubmit={handleUploadSubmit}>
                                <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="text-lg leading-6 font-medium text-gray-900">
                                            Upload KYC Document
                                        </h3>
                                        <button type="button" onClick={() => !uploading && setIsUploadModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Document Type</label>
                                            <select 
                                                value={uploadData.documentType} 
                                                onChange={e => setUploadData({...uploadData, documentType: e.target.value})}
                                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-rose-500 focus:border-rose-500 sm:text-sm"
                                            >
                                                {DOC_TYPES.map(dt => (
                                                    <option key={dt} value={dt}>{dt.replace(/_/g, ' ')}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">File (PDF, JPG, PNG)</label>
                                            <input 
                                                type="file" 
                                                accept=".pdf,.jpg,.jpeg,.png"
                                                required 
                                                onChange={handleFileChange}
                                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none sm:text-sm"
                                            />
                                            <p className="mt-1 text-xs text-gray-500">Max size: 5MB</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-end gap-3">
                                    <button 
                                        type="button" 
                                        onClick={() => !uploading && setIsUploadModalOpen(false)} 
                                        className="inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:text-sm"
                                        disabled={uploading}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-rose-600 text-base font-medium text-white hover:bg-rose-700 focus:outline-none sm:text-sm disabled:opacity-50"
                                        disabled={uploading}
                                    >
                                        {uploading ? 'Uploading securely to S3...' : 'Upload Document'}
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
