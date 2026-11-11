import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import PageFooter from '../components/PageFooter';
import ReceiptPreviewModal from '../components/ReceiptPreviewModal';
import { useAdminAuth } from '../context/AdminAuthProvider';
import { ApiError, errorMessage, requestApi, requestApiBlob } from '../utils/api';
import type { AdminLayoutOutletContext } from '../components/AdminLayout';
import type { LicensePaymentRequest, LicensePaymentRequestsResponse } from '../utils/types';

type PaymentFilter = 'pending' | 'all' | 'approved' | 'rejected';

function formatPaymentDate(date: string | null): string {
  return date ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—';
}

function formatAmount(amount: number, currency: string): string {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString()}`; }
}

export default function LicensesPage() {
  const { refreshKey, setRefreshing } = useOutletContext<AdminLayoutOutletContext>();
  const { clearSession } = useAdminAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<LicensePaymentRequest[]>([]);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [filter, setFilter] = useState<PaymentFilter>('pending');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsWarning, setNoticeIsWarning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [receiptLoadingId, setReceiptLoadingId] = useState<number | null>(null);

  const loadPayments = useCallback(async (activeCheck?: () => boolean) => {
    setLoading(true);
    setError('');
    setRefreshing(true);
    try {
      const result = await requestApi<LicensePaymentRequestsResponse>(`/admin/license-payments?status=${filter}&page=${page}`);
      if (!activeCheck || activeCheck()) {
        setPayments(result.payments);
        setPagination(result.pagination);
      }
    } catch (requestError) {
      if (activeCheck && !activeCheck()) return;
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
        clearSession();
        navigate('/login', { replace: true, state: { message: 'Your administrator session expired or is no longer authorized.' } });
      } else setError(errorMessage(requestError));
    } finally {
      if (!activeCheck || activeCheck()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [clearSession, filter, navigate, page, setRefreshing]);

  useEffect(() => {
    let active = true;
    void loadPayments(() => active);
    const timer = window.setInterval(async () => {
      try {
        const result = await requestApi<LicensePaymentRequestsResponse>(`/admin/license-payments?status=${filter}&page=${page}`);
        if (active) {
          setPayments(result.payments);
          setPagination(result.pagination);
        }
      } catch {
        // The header badge and manual refresh remain available if polling temporarily fails.
      }
    }, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [filter, page, loadPayments, refreshKey, reloadKey]);

  useEffect(() => () => { if (receiptUrl) URL.revokeObjectURL(receiptUrl); }, [receiptUrl]);

  async function viewReceipt(payment: LicensePaymentRequest): Promise<void> {
    setError('');
    setReceiptLoadingId(payment.id);
    try {
      const blob = await requestApiBlob(`/admin/license-payments/${payment.id}/proof`);
      setReceiptUrl(URL.createObjectURL(blob));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setReceiptLoadingId(null);
    }
  }

  async function decide(payment: LicensePaymentRequest, decision: 'approve' | 'reject'): Promise<void> {
    let adminNote: string | undefined;
    if (decision === 'approve') {
      if (!window.confirm(`Confirm you verified ${formatAmount(payment.amount, payment.currency)} in ${payment.payment_method} for ${payment.email_address}. Activate their one-time license?`)) return;
    } else {
      const note = window.prompt('Reason for rejecting this payment proof (required):');
      if (note === null) return;
      adminNote = note.trim();
      if (!adminNote) { setError('Enter a reason so the customer knows what needs to be corrected.'); return; }
    }

    setBusyId(payment.id);
    setError('');
    setNotice('');
    setNoticeIsWarning(false);
    try {
      const result = await requestApi<{ message: string; notification_sent: boolean }>(`/admin/license-payments/${payment.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, ...(adminNote ? { admin_note: adminNote } : {}) }),
      });
      setNotice(`${result.message}${result.notification_sent ? ' The customer was emailed.' : ' No customer email was sent; configure a mail delivery service.'}`);
      setNoticeIsWarning(!result.notification_sent);
      setPage(1);
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="page-content">
      <div className="page-heading"><div><p className="eyebrow">PRODUCT ACCESS</p><h1>Licenses</h1><p className="page-subtitle">Review payment proofs and activate one-time licenses after verifying funds arrived.</p></div></div>
      <div className="launch-period-banner"><span className="launch-period-icon">i</span><div><strong>FaithStream Studio is free for at least the first three months.</strong><p>Payments can only be submitted after the free period, a start date, and payment details are configured. The website will continue to show the free-period notice.</p></div></div>
      {error && <div className="alert-banner" role="alert">{error}</div>}
      {notice && <div className={noticeIsWarning ? 'warning-banner' : 'success-banner'} role="status">{notice}</div>}
      <section className="panel license-review-panel">
        <div className="license-review-toolbar"><div><p className="eyebrow">MANUAL VERIFICATION</p><h2>Payment proof inbox</h2></div><label className="license-filter">Show<select value={filter} onChange={(event) => { setFilter(event.target.value as PaymentFilter); setPage(1); }}><option value="pending">Pending review</option><option value="all">All requests</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label></div>
        {loading ? <div className="license-empty-state">Loading payment requests…</div> : payments.length === 0 ? <div className="license-empty-state"><span>✓</span><strong>No payment proofs to review</strong><p>When sales are enabled, customer submissions will appear here. Confirm every payment in your bank or e-wallet before approving.</p></div> : <div className="license-payment-list">
          {payments.map((payment) => <article className="license-payment-row" key={payment.id}>
            <div className="license-request-person"><span className="request-avatar">{payment.name.trim().slice(0, 1).toUpperCase() || '?'}</span><div><strong>{payment.name}</strong><small>{payment.email_address || 'Account email unavailable'}</small></div></div>
            <dl className="license-request-details"><div><dt>Payment</dt><dd>{payment.payment_method} · {formatAmount(payment.amount, payment.currency)}</dd></div><div><dt>Payer / reference</dt><dd>{payment.payer_name} · {payment.transaction_reference}</dd></div><div><dt>Submitted</dt><dd>{formatPaymentDate(payment.submitted_at)}</dd></div>{payment.admin_note && <div><dt>Review note</dt><dd>{payment.admin_note}</dd></div>}</dl>
            <div className="license-request-actions"><span className={`license-status status-${payment.status}`}>{payment.status}</span><button type="button" className="table-action" disabled={receiptLoadingId === payment.id} onClick={() => void viewReceipt(payment)}>{receiptLoadingId === payment.id ? 'Loading…' : 'View receipt'}</button>{payment.status === 'pending' && <><button type="button" className="table-action license-approve" disabled={busyId !== null} onClick={() => void decide(payment, 'approve')}>{busyId === payment.id ? 'Saving…' : 'Verify & activate'}</button><button type="button" className="table-action danger" disabled={busyId !== null} onClick={() => void decide(payment, 'reject')}>Reject</button></>}</div>
          </article>)}
        </div>}
        {!loading && pagination.total > 20 && <div className="pagination license-pagination"><span>Page {pagination.current_page} of {pagination.last_page} · {pagination.total} requests</span><div><button type="button" aria-label="Previous payment requests" disabled={pagination.current_page <= 1} onClick={() => setPage((current) => current - 1)}>←</button><button type="button" aria-label="Next payment requests" disabled={pagination.current_page >= pagination.last_page} onClick={() => setPage((current) => current + 1)}>→</button></div></div>}
      </section>
      <PageFooter>Receipt images are private. Never approve from the uploaded image alone; check your receiving account and match the reference, amount, and payer.</PageFooter>
      {receiptUrl && <ReceiptPreviewModal imageUrl={receiptUrl} onClose={() => { URL.revokeObjectURL(receiptUrl); setReceiptUrl(''); }} />}
    </section>
  );
}
