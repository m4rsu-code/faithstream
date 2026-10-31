import Icon from '../components/Icon'

export default function Plans() {
  return (
    <section className="inner-page plans-page">
      <div className="plans-glow" />
      <div className="inner-page-hero plans-hero"><div className="eyebrow"><span className="eyebrow-line" /> FAITHSTREAM SUBSCRIPTIONS</div><h1>Simple plans.<br /><em>Room to grow.</em></h1><p>We’re shaping subscription options around the needs of church media teams. Plan features and pricing will be posted here before subscriptions launch.</p></div>
      <div className="section-container plan-preview-card"><div className="plan-preview-icon"><Icon name="spark" size={22} /></div><div><span className="plan-status">PLAN DETAILS IN PROGRESS</span><h2>Subscriptions are coming soon.</h2><p>FaithStream’s account, cloud storage, and subscription services are still being prepared. No payment is required to use this page, and no plan is available to purchase yet.</p></div><a className="button button-primary" href="/download">Explore FaithStream <Icon name="arrow" size={16} /></a></div>
      <div className="section-container plan-info-grid"><article><span>01</span><h3>Know what’s included</h3><p>We’ll show each plan’s features clearly before you subscribe.</p></article><article><span>02</span><h3>Choose a billing option</h3><p>Available billing periods and prices will be listed here once confirmed.</p></article><article><span>03</span><h3>Manage your account</h3><p>Account and subscription management details will be shared before launch.</p></article></div>
    </section>
  )
}
