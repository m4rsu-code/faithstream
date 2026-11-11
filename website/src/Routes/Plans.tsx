import Icon from '../components/Icon'
import LicensePaymentForm from '../components/LicensePaymentForm'

export default function Plans() {
  return (
    <section className="inner-page plans-page">
      <div className="plans-glow" />
      
      {/* Hero Section */}
      <div className="inner-page-hero plans-hero">
        <div className="eyebrow">
          <span className="eyebrow-line" /> FAITHSTREAM STUDIO PRICING
        </div>
        <h1>
          Free to use.<br />
          <em>Built for your service.</em>
        </h1>
        <p>
          FaithStream Studio will be free for at least its first three months. We’ll share the paid license details and timing in advance.
        </p>
      </div>

      {/* Plan Preview Card */}
      <div className="section-container plan-preview-card">
        <div className="plan-preview-icon">
          <Icon name="spark" size={22} />
        </div>
        <div>
          <span className="plan-status">FREE LAUNCH PERIOD</span>
          <h2>Use FaithStream Studio for free.</h2>
          <p>
            No payment is required during the launch period. A one-time license is planned afterward; there will be no monthly or annual subscription in the initial paid model.
          </p>
        </div>
        <a className="button button-primary" href="/download">
          Get FaithStream Studio <Icon name="arrow" size={16} />
        </a>
      </div>

      {/* Plan Info Grid */}
      <div className="section-container plan-info-grid">
        <article>
          <span>01</span>
          <h3>Free for at least three months</h3>
          <p>Try the app and use it for your church services during the launch period.</p>
        </article>
        <article>
          <span>02</span>
          <h3>One-time license planned</h3>
          <p>Paid access is planned as a one-time purchase, not a recurring subscription.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Details announced before launch</h3>
          <p>Pricing and the date paid licenses begin will be posted here in advance.</p>
        </article>
      </div>

      {/* License Payment Form Component */}
      <div className="section-container">
        <LicensePaymentForm />
      </div>
    </section>
  )
}