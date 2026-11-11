import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Icon from './Icon'
import { API_BASE, getWebsiteToken, getWebsiteUser, PAYMENT_STATUS_EVENT, WEBSITE_ACCOUNT_EVENT, type WebsiteUser } from '../utils/account'

interface PaymentMethod {
  id: string
  name: string
  recipient_name: string
  account_number: string
  qr_image_url: string
}

interface PaymentOptions {
  sales_enabled: boolean
  free_notice: string
  price: number
  currency: string
  payment_methods: PaymentMethod[]
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}

export default function LicensePaymentForm() {
  const [options, setOptions] = useState<PaymentOptions | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [account, setAccount] = useState<WebsiteUser | null>(() => getWebsiteUser())
  const [payerName, setPayerName] = useState('')
  const [reference, setReference] = useState('')
  const [methodId, setMethodId] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)

  useEffect(() => {
    let active = true
    fetch(`${API_BASE}/license/payment-options`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Payment options are temporarily unavailable.')
        return (await response.json()) as PaymentOptions
      })
      .then((data) => {
        if (active) {
          setOptions(data)
          setMethodId(data.payment_methods[0]?.id || '')
        }
      })
      .catch(() => {
        if (active) setOptions(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const syncAccount = () => setAccount(getWebsiteUser())
    window.addEventListener(WEBSITE_ACCOUNT_EVENT, syncAccount)
    return () => window.removeEventListener(WEBSITE_ACCOUNT_EVENT, syncAccount)
  }, [])

  const selectedMethod = useMemo(
    () => options?.payment_methods.find((method) => method.id === methodId) || null,
    [methodId, options]
  )

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    setSuccess('')

    if (!account || !getWebsiteToken()) {
      setError('Sign in to your verified FaithStream Studio account before submitting payment proof.')
      return
    }

    if (!options?.sales_enabled || !receipt) {
      setError('Choose a payment receipt image before submitting.')
      return
    }

    const body = new FormData()
    body.set('payment_method', methodId)
    body.set('payer_name', payerName.trim())
    body.set('transaction_reference', reference.trim())
    body.set('amount', String(options.price))
    body.set('proof', receipt)

    setSubmitting(true)
    try {
      const response = await fetch(`${API_BASE}/license/payment-requests`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${getWebsiteToken()}` },
        body,
      })
      const result = (await response.json().catch(() => ({}))) as {
        message?: string
        errors?: Record<string, string[]>
      }

      if (!response.ok) {
        const firstValidationMessage = result.errors ? Object.values(result.errors).flat()[0] : undefined
        throw new Error(firstValidationMessage || result.message || 'Could not submit your payment proof. Please try again.')
      }

      setSuccess(result.message || 'Your payment proof was submitted. Please wait for manual verification.')
      window.dispatchEvent(new Event(PAYMENT_STATUS_EVENT))
      setPayerName('')
      setReference('')
      setReceipt(null)

      const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]')
      if (fileInput) fileInput.value = ''
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit your payment proof.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="license-payment-section" aria-labelledby="license-payment-title">
      <div className="license-payment-heading">
        <span className="plan-status">ONE-TIME LICENSE</span>
        <h2 id="license-payment-title">Payment by QR code</h2>
        <p>Choose a payment method and submit the receipt. We’ll verify it manually before activating the license.</p>
      </div>

      {loading ? (
        <p className="license-payment-state">Checking payment availability…</p>
      ) : !options?.sales_enabled ? (
        <div className="license-payment-state">
          <strong>Payments are not open yet.</strong>
          <span>
            FaithStream Studio is free during the launch period. The one-time license and payment instructions will be announced here in advance.
          </span>
        </div>
      ) : (
        <>
          <div className="license-price-card">
            <span>One-time price</span>
            <strong>{formatPrice(options.price, options.currency)}</strong>
          </div>

          <div className="license-method-grid">
            {options.payment_methods.map((method) => (
              <button
                className={`license-method ${methodId === method.id ? 'selected' : ''}`}
                key={method.id}
                type="button"
                onClick={() => setMethodId(method.id)}
                aria-pressed={methodId === method.id}
              >
                {method.name}
              </button>
            ))}
          </div>

          {selectedMethod && (
            <div className="license-qr-card">
              <div>
                <strong>Pay to {selectedMethod.recipient_name}</strong>
                {selectedMethod.account_number && <span>Account: {selectedMethod.account_number}</span>}
                <small>Pay the exact one-time price shown above.</small>
              </div>
              <img src={selectedMethod.qr_image_url} alt={`${selectedMethod.name} payment QR code`} />
            </div>
          )}

          {!account ? (
            <div className="license-account-required">
              <strong>Sign in before sending payment proof</strong>
              <p>
                Use the same verified FaithStream Studio account as your desktop app. The payment request will be attached to this account so it can be reviewed and activated.
              </p>
              <div>
                <a className="button button-primary" href="/account?mode=login">
                  Sign in <Icon name="arrow" size={16} />
                </a>
                <a className="button button-quiet" href="/account?mode=register">
                  Create account
                </a>
              </div>
            </div>
          ) : (
            <form className="license-payment-form" onSubmit={(event) => void submit(event)}>
              <div className="license-signed-in">
                <span>Submitting for</span>
                <strong>{account.name}</strong>
                <small>{account.email_address}</small>
              </div>

              <label>
                Name shown on the payment
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={payerName}
                  onChange={(event) => setPayerName(event.target.value)}
                />
              </label>

              <label>
                Transaction reference
                <input
                  type="text"
                  required
                  minLength={6}
                  maxLength={100}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Enter the reference exactly as shown"
                />
              </label>

              <label>
                Payment receipt (JPG, PNG, or WebP; max 5 MB)
                <input
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setReceipt(event.target.files?.[0] || null)}
                />
              </label>

              <p className="license-privacy-note">
                Receipt images are stored privately and can only be reviewed by authorized FaithStream Studio administrators.
              </p>

              {error && (
                <p className="license-form-error" role="alert">
                  {error}
                </p>
              )}

              {success && (
                <p className="license-form-success" role="status">
                  {success}
                </p>
              )}

              <button className="button button-primary license-submit" type="submit" disabled={submitting}>
                {submitting ? 'Submitting receipt…' : 'Submit payment proof'} <Icon name="arrow" size={16} />
              </button>

              <p className="license-review-notice">
                After sending, please allow time for manual verification. Your license will not activate until the payment has been confirmed in the receiving account.
              </p>
            </form>
          )}
        </>
      )}
    </section>
  )
}