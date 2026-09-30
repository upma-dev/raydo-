import React, { useState } from 'react';
import api from '@food/api';
import { toast } from 'sonner';
import { CheckCircle2, ChevronRight, Upload, Briefcase, User, MapPin, DollarSign, FileText } from 'lucide-react';

export default function FranchiseApply() {
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [applicationId, setApplicationId] = useState('');

    const [formData, setFormData] = useState(() => {
        const savedDraft = localStorage.getItem('franchise_application_draft');
        if (savedDraft) {
            try {
                return JSON.parse(savedDraft);
            } catch (e) {}
        }
        return {
            // Step 1: Applicant
            name: '',
            email: '',
            phone: '',
            // Step 2: Business
            legalName: '',
            businessType: '',
            registrationNumber: '',
            taxId: '',
            // Step 3: Type & Services
            franchiseType: 'unit',
            services: [],
            // Step 4: Territory
            businessAddress: { street: '', city: '', state: '', zipCode: '', country: '' },
            preferredTerritory: '',
            // Step 5: Investment
            investmentCapacity: '',
            // Step 6: KYC
            personalKyc: null,
            businessKyc: null,
        };
    });

    // Save draft on change
    React.useEffect(() => {
        localStorage.setItem('franchise_application_draft', JSON.stringify(formData));
    }, [formData]);

    const steps = [
        { id: 1, title: 'Applicant', icon: User },
        { id: 2, title: 'Business', icon: Briefcase },
        { id: 3, title: 'Services', icon: CheckCircle2 },
        { id: 4, title: 'Territory', icon: MapPin },
        { id: 5, title: 'Investment', icon: DollarSign },
        { id: 6, title: 'KYC', icon: FileText },
        { id: 7, title: 'Review', icon: CheckCircle2 }
    ];

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({
                ...prev,
                [parent]: { ...prev[parent], [child]: value }
            }));
        } else if (type === 'checkbox') {
            if (name === 'services') {
                setFormData(prev => ({
                    ...prev,
                    services: checked 
                        ? [...prev.services, value] 
                        : prev.services.filter(s => s !== value)
                }));
            }
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleNext = () => {
        // Validation could be added here
        setCurrentStep(prev => Math.min(prev + 1, 7));
        window.scrollTo(0, 0);
    };

    const handleBack = () => {
        setCurrentStep(prev => Math.max(prev - 1, 1));
        window.scrollTo(0, 0);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Note: Since file uploads require FormData, we'd normally use it.
            // For Phase 1 wizard demo, we send JSON and assume KYC uploaded separately or via base64
            
            const payload = {
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                legalName: formData.legalName,
                businessType: formData.businessType,
                businessRegistrationDetails: {
                    registrationNumber: formData.registrationNumber,
                    taxId: formData.taxId
                },
                franchiseType: formData.franchiseType,
                services: formData.services,
                businessAddress: formData.businessAddress
            };

            const { data } = await api.post('/franchise/apply', payload);
            
            setSubmitted(true);
            setApplicationId(data.data?.applicationId || 'FR-APP-XXXXXX');
            localStorage.removeItem('franchise_application_draft');
            toast.success('Application submitted successfully!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to submit application');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Application Received!</h2>
                    <p className="text-gray-900 font-semibold mb-2">Application ID: {applicationId}</p>
                    <p className="text-gray-600 mb-6">
                        Thank you for your interest in partnering with Raydo. Our team will review your application and contact you shortly.
                    </p>
                    <button 
                        onClick={() => window.location.reload()} 
                        className="w-full py-3 px-4 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-gray-900">Franchise Partner Application</h1>
                    <p className="mt-2 text-gray-600">Join the Raydo Ecosystem</p>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between relative">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-gray-200 rounded-full"></div>
                        <div 
                            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-rose-500 rounded-full transition-all duration-300"
                            style={{ width: `${((currentStep - 1) / 6) * 100}%` }}
                        ></div>
                        
                        {steps.map((step) => {
                            const StepIcon = step.icon;
                            const isActive = currentStep === step.id;
                            const isCompleted = currentStep > step.id;
                            
                            return (
                                <div key={step.id} className="relative z-10 flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                                        isActive ? 'border-rose-500 bg-white text-rose-500' :
                                        isCompleted ? 'border-rose-500 bg-rose-500 text-white' :
                                        'border-gray-300 bg-white text-gray-400'
                                    }`}>
                                        <StepIcon className="w-5 h-5" />
                                    </div>
                                    <span className={`absolute -bottom-6 text-xs font-medium w-max ${
                                        isActive || isCompleted ? 'text-gray-900' : 'text-gray-400'
                                    }`}>
                                        {step.title}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden mt-12">
                    <div className="p-8">
                        
                        {/* STEP 1: Applicant Information */}
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">Applicant Information</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                        <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3 focus:ring-rose-500 focus:border-rose-500" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                        <input required type="email" name="email" value={formData.email} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3 focus:ring-rose-500 focus:border-rose-500" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                                        <input required type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3 focus:ring-rose-500 focus:border-rose-500" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Business Information */}
                        {currentStep === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">Business Information</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Legal Company Name *</label>
                                        <input type="text" name="legalName" value={formData.legalName} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
                                        <select name="businessType" value={formData.businessType} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3 bg-white">
                                            <option value="">Select Type</option>
                                            <option value="LLC">LLC</option>
                                            <option value="Corporation">Corporation</option>
                                            <option value="Sole Proprietorship">Sole Proprietorship</option>
                                            <option value="Partnership">Partnership</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number (CIN/LLPIN)</label>
                                        <input type="text" name="registrationNumber" value={formData.registrationNumber} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID / GST Number</label>
                                        <input type="text" name="taxId" value={formData.taxId} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: Franchise Type & Services */}
                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">Franchise Type & Services</h2>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Franchise Type</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {['unit', 'multi-unit', 'master', 'area-developer'].map(type => (
                                            <label key={type} className={`border rounded-lg p-4 flex cursor-pointer transition ${formData.franchiseType === type ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                                <input type="radio" name="franchiseType" value={type} checked={formData.franchiseType === type} onChange={handleChange} className="mt-1 mr-3 text-rose-500 focus:ring-rose-500" />
                                                <div>
                                                    <span className="block font-medium text-gray-900 capitalize">{type.replace('-', ' ')}</span>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Services to Operate *</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {['taxi', 'food', 'delivery', 'airport', 'outstation', 'bus'].map(service => (
                                            <label key={service} className="flex items-center space-x-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                                                <input type="checkbox" name="services" value={service} checked={formData.services.includes(service)} onChange={handleChange} className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300 rounded" />
                                                <span className="text-gray-900 font-medium capitalize">{service}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 4: Territory */}
                        {currentStep === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">Business & Preferred Territory</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                                        <input type="text" name="businessAddress.street" value={formData.businessAddress.street} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                                        <input type="text" name="businessAddress.city" value={formData.businessAddress.city} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">State / Province *</label>
                                        <input type="text" name="businessAddress.state" value={formData.businessAddress.state} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP / Postal Code *</label>
                                        <input type="text" name="businessAddress.zipCode" value={formData.businessAddress.zipCode} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                                        <input type="text" name="businessAddress.country" value={formData.businessAddress.country} onChange={handleChange} className="w-full rounded-lg border-gray-300 border p-3" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 5: Investment */}
                        {currentStep === 5 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">Investment Capacity</h2>
                                <p className="text-gray-500 text-sm">Please indicate your initial capital readiness for infrastructure, licensing, and security deposits.</p>
                                
                                <div className="space-y-4">
                                    {['Under $50,000', '$50,000 - $100,000', '$100,000 - $250,000', '$250,000+'].map(amount => (
                                        <label key={amount} className={`flex items-center p-4 border rounded-lg cursor-pointer ${formData.investmentCapacity === amount ? 'border-rose-500 bg-rose-50' : 'hover:bg-gray-50'}`}>
                                            <input type="radio" name="investmentCapacity" value={amount} checked={formData.investmentCapacity === amount} onChange={handleChange} className="h-4 w-4 text-rose-600 focus:ring-rose-500 border-gray-300" />
                                            <span className="ml-3 font-medium text-gray-900">{amount}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STEP 6: KYC */}
                        {currentStep === 6 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">KYC & Documents</h2>
                                <p className="text-gray-500 text-sm">Please upload clear copies of the following documents. Max size 5MB per file.</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 cursor-pointer">
                                        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                                        <span className="block text-sm font-medium text-gray-900">Personal ID Proof</span>
                                        <span className="block text-xs text-gray-500 mt-1">Passport / Driver's License</span>
                                    </div>
                                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 cursor-pointer">
                                        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                                        <span className="block text-sm font-medium text-gray-900">Business Registration</span>
                                        <span className="block text-xs text-gray-500 mt-1">Certificate of Incorporation</span>
                                    </div>
                                </div>
                                <div className="bg-yellow-50 text-yellow-800 text-sm p-4 rounded-lg mt-4">
                                    * Files will be securely uploaded directly to your Franchise application portal for Admin review.
                                </div>
                            </div>
                        )}

                        {/* STEP 7: Review & Submit */}
                        {currentStep === 7 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold text-gray-900">Review Application</h2>
                                
                                <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="block text-sm text-gray-500">Applicant</span>
                                            <span className="block font-medium text-gray-900">{formData.name}</span>
                                            <span className="block text-sm text-gray-600">{formData.email}</span>
                                        </div>
                                        <div>
                                            <span className="block text-sm text-gray-500">Business</span>
                                            <span className="block font-medium text-gray-900">{formData.legalName || 'N/A'}</span>
                                            <span className="block text-sm text-gray-600">{formData.businessType || 'N/A'}</span>
                                        </div>
                                        <div className="col-span-2 pt-4 border-t border-gray-200">
                                            <span className="block text-sm text-gray-500 mb-1">Selected Services</span>
                                            <div className="flex flex-wrap gap-2">
                                                {formData.services.map(s => (
                                                    <span key={s} className="bg-gray-200 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold capitalize">{s}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start mt-6">
                                    <div className="flex items-center h-5">
                                        <input id="terms" type="checkbox" required className="w-4 h-4 text-rose-600 bg-gray-100 border-gray-300 rounded focus:ring-rose-500" />
                                    </div>
                                    <div className="ml-2 text-sm">
                                        <label htmlFor="terms" className="font-medium text-gray-900">Terms & Conditions</label>
                                        <p className="text-gray-500">I declare that all information provided is accurate and consent to Raydo verifying these details for franchise evaluation.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Footer Actions */}
                    <div className="px-8 py-5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={handleBack}
                            disabled={currentStep === 1 || loading}
                            className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Back
                        </button>
                        
                        {currentStep < 7 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                className="px-6 py-2.5 bg-rose-600 rounded-lg text-sm font-medium text-white hover:bg-rose-700 flex items-center"
                            >
                                Continue <ChevronRight className="w-4 h-4 ml-1" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={loading}
                                className="px-8 py-2.5 bg-rose-600 rounded-lg text-sm font-bold text-white hover:bg-rose-700 flex items-center disabled:opacity-50"
                            >
                                {loading ? 'Submitting...' : 'Submit Application'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
