import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import PageFooter from '../components/PageFooter'
import ReceiptPreviewModal from '../components/ReceiptPreviewModal'
import { useAdminAuth } from '../context/AdminAuthProvider'
import { ApiError, errorMessage, requestApi, requestApiBlob } from '../utils/api'
import type { AdminLayoutOutletContext } from '../components/AdminLayout'
import type {
  AdminLicense,
  AdminLicenseAction,
  AdminLicenseActionsResponse,
  AdminLicensesResponse,
  LicensePaymentRequest,
  LicensePaymentRequestsResponse,
} from '../utils/types'

type PaymentFilter = 'pending' | 'all' | 'approved' | 'rejected'

function formatPaymentDate(date: string | null): string {
  return date
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
    : '—'
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString()}`
  }
}

export default function LicensesPage() {
  const { refreshKey, setRefreshing } = useOutletContext<AdminLayoutOutletContext>()
  const { clearSession } = useAdminAuth()
  const navigate = useNavigate()

  const [payments, setPayments] = useState<LicensePaymentRequest[]>([])
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [filter, setFilter] = useState<PaymentFilter>('pending')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeIsWarning, setNoticeIsWarning] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptLoadingId, setReceiptLoadingId] = useState<number | null>(null)
  const [licenses, setLicenses] = useState<AdminLicense[]>([])
  const [licenseCounts, setLicenseCounts] = useState({ active: 0, revoked: 0 })
  const [licensePagination, setLicensePagination] = useState({ current_page: 1, last_page: 1, total: 0 })
  const [licensePage, setLicensePage] = useState(1)
  const [licenseFilter, setLicenseFilter] = useState<'all' | 'active' | 'revoked'>('all')
  const [licenseSearch, setLicenseSearch] = useState('')
  const [licenseSearchDraft, setLicenseSearchDraft] = useState('')
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [grantEmail, setGrantEmail] = useState('')
  const [grantReason, setGrantReason] = useState('')
  const [grantBusy, setGrantBusy] = useState(false)
  const [licenseActions, setLicenseActions] = useState<AdminLicenseAction[]>([])

  const loadPayments = useCallback(
    async (activeCheck?: () => boolean) => {
      setLoading(true)
      setError('')
      setRefreshing(true)
      try {
        const result = await requestApi<LicensePaymentRequestsResponse>(
          `/admin/license-payments?status=${filter}&page=${page}`
        )
        if (!activeCheck || activeCheck()) {
          setPayments(result.payments)
          setPagination(result.pagination)
        }
      } catch (requestError) {
        if (activeCheck && !activeCheck()) return
        if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
          clearSession()
          navigate('/login', {
            replace: true,
            state: { message: 'Your administrator session expired or is no longer authorized.' },
          })
        } else {
          setError(errorMessage(requestError))
        }
      } finally {
        if (!activeCheck || activeCheck()) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [clearSession, filter, navigate, page, setRefreshing]
  )

  useEffect(() => {
    let active = true
    void loadPayments(() => active)

    const timer = window.setInterval(async () => {
      try {
        const result = await requestApi<LicensePaymentRequestsResponse>(
          `/admin/license-payments?status=${filter}&page=${page}`
        )
        if (active) {
          setPayments(result.payments)
          setPagination(result.pagination)
        }
      } catch {
        // The header badge and manual refresh remain available if polling temporarily fails.
      }
    }, 30000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [filter, page, loadPayments, refreshKey, reloadKey])

  useEffect(() => {
    let active = true
    setLicenseLoading(true)
    void requestApi<AdminLicensesResponse>(
      `/admin/licenses?status=${licenseFilter}&page=${licensePage}&search=${encodeURIComponent(licenseSearch)}`
    ).then((result) => {
      if (!active) return
      setLicenses(result.licenses)
      setLicenseCounts(result.counts)
      setLicensePagination(result.pagination)
    }).catch((requestError) => {
      if (active) setError(errorMessage(requestError))
    }).finally(() => {
      if (active) setLicenseLoading(false)
    })
    return () => { active = false }
  }, [licenseFilter, licensePage, licenseSearch, refreshKey, reloadKey])

  useEffect(() => {
    let active = true
    void requestApi<AdminLicenseActionsResponse>('/admin/license-actions?page=1')
      .then((result) => { if (active) setLicenseActions(result.actions) })
      .catch((requestError) => { if (active) setError(errorMessage(requestError)) })
    return () => { active = false }
  }, [refreshKey, reloadKey])

  useEffect(() => {
    return () => {
      if (receiptUrl) URL.revokeObjectURL(receiptUrl)
    }
  }, [receiptUrl])

  async function viewReceipt(payment: LicensePaymentRequest): Promise<void> {
    setError('')
    setReceiptLoadingId(payment.id)
    try {
      const blob = await requestApiBlob(`/admin/license-payments/${payment.id}/proof`)
      setReceiptUrl(URL.createObjectURL(blob))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setReceiptLoadingId(null)
    }
  }

  async function decide(payment: LicensePaymentRequest, decision: 'approve' | 'reject'): Promise<void> {
    let adminNote: string | undefined

    if (decision === 'approve') {
      if (
        !window.confirm(
          `Confirm you verified ${formatAmount(payment.amount, payment.currency)} in ${payment.payment_method} for ${payment.email_address}. Activate their one-time license?`
        )
      ) {
        return
      }
    } else {
      const note = window.prompt('Reason for rejecting this payment proof (required):')
      if (note === null) return
      adminNote = note.trim()
      if (!adminNote) {
        setError('Enter a reason so the customer knows what needs to be corrected.')
        return
      }
    }

    setBusyId(payment.id)
    setError('')
    setNotice('')
    setNoticeIsWarning(false)

    try {
      const result = await requestApi<{ message: string; notification_sent: boolean }>(
        `/admin/license-payments/${payment.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ decision, ...(adminNote ? { admin_note: adminNote } : {}) }),
        }
      )
      setNotice(
        `${result.message}${
          result.notification_sent
            ? ' The customer was emailed.'
            : ' No customer email was sent; configure a mail delivery service.'
        }`
      )
      setNoticeIsWarning(!result.notification_sent)
      setPage(1)
      setReloadKey((key) => key + 1)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusyId(null)
    }
  }

  async function grantLicense(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!window.confirm(`Grant a one-time license to ${grantEmail.trim()}? This does not enable customer payment submissions.`)) return
    setGrantBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await requestApi<{ message: string }>('/admin/licenses', {
        method: 'POST',
        body: JSON.stringify({ email_address: grantEmail.trim(), reason: grantReason.trim() }),
      })
      setNotice(result.message)
      setGrantEmail('')
      setGrantReason('')
      setReloadKey((key) => key + 1)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setGrantBusy(false)
    }
  }

  async function revokeLicense(license: AdminLicense): Promise<void> {
    const reason = window.prompt(`Why are you revoking the license for ${license.email_address || license.name}?`)
    if (reason === null) return
    if (reason.trim().length < 5) {
      setError('Enter a reason with at least five characters.')
      return
    }
    if (!window.confirm(`Revoke the one-time license for ${license.email_address || license.name}?`)) return
    setBusyId(license.id)
    setError('')
    setNotice('')
    try {
      const result = await requestApi<{ message: string }>(`/admin/licenses/${license.id}/revoke`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      setNotice(result.message)
      setReloadKey((key) => key + 1)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="page-content">
      {/* Header */}
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRODUCT ACCESS</p>
          <h1>Licenses</h1>
          <p className="page-subtitle">
            Review payment proofs and activate one-time licenses after verifying funds arrived.
          </p>
        </div>
      </div>

      {/* Free Launch Period Banner */}
      <div className="launch-period-banner">
        <span className="launch-period-icon">i</span>
        <div>
          <strong>FaithStream Studio is free for at least the first three months.</strong>
          <p>
            Payments can only be submitted after the free period, a start date, and payment details are configured. The website will continue to show the free-period notice.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className={noticeIsWarning ? 'warning-banner' : 'success-banner'} role="status">
          {notice}
        </div>
      )}

      <section className="license-management-grid">
        <article className="panel license-access-panel">
          <div className="license-review-toolbar">
            <div>
              <p className="eyebrow">ACCESS MANAGEMENT</p>
              <h2>One-time licenses</h2>
            </div>
            <div className="license-counts">
              <span className="license-status status-active">{licenseCounts.active} active</span>
              <span className="license-status status-rejected">{licenseCounts.revoked} revoked</span>
            </div>
          </div>
          <p className="license-management-note">
            Manage access now for testing or complimentary grants. This does not open public sales or change the free launch period.
          </p>
          <p className="license-management-note license-enforcement-note">
            Revoking a license blocks account access only after license enforcement is enabled in the backend.
          </p>
          <form className="license-grant-form" onSubmit={(event) => void grantLicense(event)}>
            <label>
              Account email
              <input type="email" value={grantEmail} onChange={(event) => setGrantEmail(event.target.value)} placeholder="user@example.com" required maxLength={255} />
            </label>
            <label>
              Reason for granting access
              <input value={grantReason} onChange={(event) => setGrantReason(event.target.value)} placeholder="Beta access, complimentary license…" required minLength={5} maxLength={500} />
            </label>
            <button type="submit" className="table-action license-approve" disabled={grantBusy}>
              {grantBusy ? 'Granting…' : 'Grant one-time license'}
            </button>
          </form>
        </article>

        <article className="panel license-audit-panel">
          <div className="license-review-toolbar">
            <div>
              <p className="eyebrow">ADMIN HISTORY</p>
              <h2>Recent license actions</h2>
            </div>
          </div>
          {licenseActions.length === 0 ? (
            <p className="license-management-note">License grants, revocations, and payment decisions will appear here.</p>
          ) : (
            <div className="license-action-list">
              {licenseActions.slice(0, 5).map((action) => (
                <div className="license-action-row" key={action.id}>
                  <div>
                    <strong>{action.action.replace(/_/g, ' ')}</strong>
                    <span>{action.user_email}</span>
                    <small>{action.reason || 'No reason recorded'}</small>
                  </div>
                  <time>{formatPaymentDate(action.created_at)}</time>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="panel license-review-panel license-access-list-panel">
        <div className="license-review-toolbar">
          <div>
            <p className="eyebrow">LICENSE DIRECTORY</p>
            <h2>Account access</h2>
          </div>
          <div className="license-directory-controls">
            <form onSubmit={(event) => { event.preventDefault(); setLicensePage(1); setLicenseSearch(licenseSearchDraft.trim()) }}>
              <input aria-label="Search license accounts" value={licenseSearchDraft} onChange={(event) => setLicenseSearchDraft(event.target.value)} placeholder="Search account" />
              <button type="submit" className="table-action">Search</button>
            </form>
            <label className="license-filter">
              Show
              <select value={licenseFilter} onChange={(event) => { setLicenseFilter(event.target.value as typeof licenseFilter); setLicensePage(1) }}>
                <option value="all">All licenses</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
              </select>
            </label>
          </div>
        </div>
        {licenseLoading ? (
          <div className="license-empty-state">Loading license records…</div>
        ) : licenses.length === 0 ? (
          <div className="license-empty-state"><strong>No license records yet</strong><p>Grant a license above or review a customer payment below.</p></div>
        ) : (
          <div className="license-payment-list">
            {licenses.map((license) => (
              <article className="license-payment-row license-record-row" key={license.id}>
                <div className="license-request-person">
                  <span className="request-avatar">{license.name.trim().slice(0, 1).toUpperCase() || '?'}</span>
                  <div><strong>{license.name}</strong><small>{license.email_address || 'Account email unavailable'}</small></div>
                </div>
                <dl className="license-request-details">
                  <div><dt>Status</dt><dd><span className={`license-status status-${license.status}`}>{license.status}</span> · {license.source === 'manual' ? 'Manual grant' : 'Payment verified'}</dd></div>
                  <div><dt>Activated</dt><dd>{formatPaymentDate(license.activated_at)}{license.activated_by ? ` · ${license.activated_by}` : ''}</dd></div>
                  <div><dt>Reason</dt><dd>{license.status === 'active' ? license.activation_note || 'Payment verified' : license.revocation_note || 'Revoked'}</dd></div>
                </dl>
                <div className="license-request-actions">
                  {license.status === 'active' && <button type="button" className="table-action danger" disabled={busyId !== null} onClick={() => void revokeLicense(license)}>{busyId === license.id ? 'Revoking…' : 'Revoke license'}</button>}
                </div>
              </article>
            ))}
          </div>
        )}
        {!licenseLoading && licensePagination.last_page > 1 && (
          <div className="pagination license-pagination">
            <span>Page {licensePagination.current_page} of {licensePagination.last_page} · {licensePagination.total} accounts</span>
            <div>
              <button type="button" aria-label="Previous license records" disabled={licensePage <= 1} onClick={() => setLicensePage((value) => value - 1)}>←</button>
              <button type="button" aria-label="Next license records" disabled={licensePage >= licensePagination.last_page} onClick={() => setLicensePage((value) => value + 1)}>→</button>
            </div>
          </div>
        )}
      </section>

      {/* License Review Panel */}
      <section className="panel license-review-panel">
        <div className="license-review-toolbar">
          <div>
            <p className="eyebrow">MANUAL VERIFICATION</p>
            <h2>Payment proof inbox</h2>
          </div>
          <label className="license-filter">
            Show
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as PaymentFilter)
                setPage(1)
              }}
            >
              <option value="pending">Pending review</option>
              <option value="all">All requests</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="license-empty-state">Loading payment requests…</div>
        ) : payments.length === 0 ? (
          <div className="license-empty-state">
            <span>✓</span>
            <strong>No payment proofs to review</strong>
            <p>
              When sales are enabled, customer submissions will appear here. Confirm every payment in your bank or e-wallet before approving.
            </p>
          </div>
        ) : (
          <div className="license-payment-list">
            {payments.map((payment) => (
              <article className="license-payment-row" key={payment.id}>
                <div className="license-request-person">
                  <span className="request-avatar">
                    {payment.name.trim().slice(0, 1).toUpperCase() || '?'}
                  </span>
                  <div>
                    <strong>{payment.name}</strong>
                    <small>{payment.email_address || 'Account email unavailable'}</small>
                  </div>
                </div>

                <dl className="license-request-details">
                  <div>
                    <dt>Payment</dt>
                    <dd>
                      {payment.payment_method} · {formatAmount(payment.amount, payment.currency)}
                    </dd>
                  </div>
                  <div>
                    <dt>Payer / reference</dt>
                    <dd>
                      {payment.payer_name} · {payment.transaction_reference}
                    </dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatPaymentDate(payment.submitted_at)}</dd>
                  </div>
                  {payment.admin_note && (
                    <div>
                      <dt>Review note</dt>
                      <dd>{payment.admin_note}</dd>
                    </div>
                  )}
                </dl>

                <div className="license-request-actions">
                  <span className={`license-status status-${payment.status}`}>{payment.status}</span>
                  <button
                    type="button"
                    className="table-action"
                    disabled={receiptLoadingId === payment.id}
                    onClick={() => void viewReceipt(payment)}
                  >
                    {receiptLoadingId === payment.id ? 'Loading…' : 'View receipt'}
                  </button>
                  {payment.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        className="table-action license-approve"
                        disabled={busyId !== null}
                        onClick={() => void decide(payment, 'approve')}
                      >
                        {busyId === payment.id ? 'Saving…' : 'Verify & activate'}
                      </button>
                      <button
                        type="button"
                        className="table-action danger"
                        disabled={busyId !== null}
                        onClick={() => void decide(payment, 'reject')}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && pagination.total > 20 && (
          <div className="pagination license-pagination">
            <span>
              Page {pagination.current_page} of {pagination.last_page} · {pagination.total} requests
            </span>
            <div>
              <button
                type="button"
                aria-label="Previous payment requests"
                disabled={pagination.current_page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Next payment requests"
                disabled={pagination.current_page >= pagination.last_page}
                onClick={() => setPage((current) => current + 1)}
              >
                →
              </button>
            </div>
          </div>
        )}
      </section>

      <PageFooter>
        Receipt images are private. Never approve from the uploaded image alone; check your receiving account and match the reference, amount, and payer.
      </PageFooter>

      {receiptUrl && (
        <ReceiptPreviewModal
          imageUrl={receiptUrl}
          onClose={() => {
            URL.revokeObjectURL(receiptUrl)
            setReceiptUrl('')
          }}
        />
      )}
    </section>
  )
}
