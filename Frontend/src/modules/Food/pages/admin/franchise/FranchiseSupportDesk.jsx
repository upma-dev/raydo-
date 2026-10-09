import React, { useState, useEffect, useCallback } from "react";
import { adminAPI } from "@food/api";
import { MessageSquare, Send, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function FranchiseSupportDesk() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Reply form state
  const [replyInput, setReplyInput] = useState({});
  const [replyingMessageId, setReplyingMessageId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getFranchiseApplications({ limit: 100 });
      if (res?.data?.data) {
        setApplications(res.data.data.applications || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load support inquiries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Aggregate support messages across all franchise applications
  const allSupportMessages = applications.flatMap(app => 
    (app.supportMessages || []).map(msg => ({
      ...msg,
      appId: app._id,
      applicationId: app.applicationId,
      applicantName: app.applicantName,
      city: app.city,
      phone: app.phone,
    }))
  );

  const filteredSupportMessages = allSupportMessages.filter(m => {
    if (statusFilter === 'pending') return m.status === 'pending' || m.status === 'open';
    if (statusFilter === 'replied') return m.status === 'replied';
    if (statusFilter === 'resolved') return m.status === 'resolved';
    return true;
  });

  const handleReplyMessage = async (appId, messageId) => {
    const text = replyInput[messageId];
    if (!text || !text.trim()) {
      toast.error('Please enter reply text');
      return;
    }
    setReplyingMessageId(messageId);
    try {
      await adminAPI.replyFranchiseSupportMessage(appId, messageId, {
        reply: text.trim(),
        status: 'replied',
      });
      toast.success("Reply sent to Franchise Partner!");
      setReplyInput(prev => ({ ...prev, [messageId]: '' }));
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send reply');
    } finally {
      setReplyingMessageId(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 font-sans space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shadow-xs">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Franchise Partner Support Desk</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                View and respond to inquiries, questions & support tickets submitted by franchise partners
              </p>
            </div>
          </div>

          <button
            onClick={fetchData}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Support Desk Content Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
        
        {/* Status Filter Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 pb-4">
          <div className="font-extrabold text-sm text-slate-900">
            Total Inquiries ({filteredSupportMessages.length})
          </div>

          <div className="flex items-center gap-2 text-xs">
            {[
              { id: 'all', label: 'All Tickets' },
              { id: 'pending', label: '🟡 Pending Reply' },
              { id: 'replied', label: '🟢 Replied' },
              { id: 'resolved', label: '🔵 Resolved' },
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-3.5 py-1.5 rounded-xl font-bold border transition-all ${
                  statusFilter === st.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets List */}
        {loading ? (
          <div className="flex items-center justify-center p-16 gap-3 text-slate-500 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-red-600" />
            <span>Loading support tickets...</span>
          </div>
        ) : filteredSupportMessages.length === 0 ? (
          <div className="text-center py-16 text-slate-400 font-medium text-xs">
            No support inquiries found in this section.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSupportMessages.map((msg, idx) => (
              <div key={msg.messageId || idx} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3 text-xs shadow-xs">
                
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-900 text-sm">{msg.subject}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        msg.priority === 'urgent' ? 'bg-red-100 text-red-800 border border-red-200' :
                        msg.priority === 'high' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        'bg-slate-200 text-slate-700'
                      }`}>
                        {msg.priority?.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                      <span>Applicant: <strong className="text-slate-900">{msg.applicantName}</strong> ({msg.applicationId})</span>
                      <span>City: <strong>{msg.city}</strong></span>
                      <span>Phone: <strong>{msg.phone}</strong></span>
                      <span className="text-slate-400">📅 {new Date(msg.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                    msg.status === 'replied' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    msg.status === 'resolved' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {msg.status === 'replied' ? '🟢 Replied' : msg.status === 'resolved' ? '🔵 Resolved' : '🟡 Pending Reply'}
                  </span>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 text-slate-800 font-medium leading-relaxed">
                  {msg.message}
                </div>

                {/* Existing Reply if present */}
                {msg.reply && (
                  <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                    <div className="font-extrabold text-blue-900 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-blue-600" /> Admin Reply:
                    </div>
                    <p className="text-slate-800 font-semibold">{msg.reply}</p>
                  </div>
                )}

                {/* Reply Form */}
                <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Type response to franchise partner..."
                    value={replyInput[msg.messageId] || ''}
                    onChange={e => setReplyInput({ ...replyInput, [msg.messageId]: e.target.value })}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => handleReplyMessage(msg.appId, msg.messageId)}
                    disabled={replyingMessageId === msg.messageId}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 shrink-0"
                  >
                    {replyingMessageId === msg.messageId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{msg.reply ? 'Update Reply' : 'Send Reply'}</span>
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
