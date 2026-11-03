import PageFooter from '../components/PageFooter';

export default function SubscriptionsPage() {
  return (
    <section className="page-content">
      <div className="page-heading"><div><p className="eyebrow">REVENUE &amp; PLANS</p><h1>Subscriptions</h1><p className="page-subtitle">Subscription visibility and billing status.</p></div></div>
      <section className="panel billing-panel"><div className="billing-art">◇</div><p className="eyebrow">NOT CONFIGURED</p><h2>Subscription data isn’t connected yet.</h2><p>FaithStream’s public plans page says subscriptions are still being prepared. There’s no billing provider or subscription table in the backend today, so this dashboard has no plan or payment records to display.</p><div className="billing-checklist"><div><span>01</span><span><strong>Choose a billing provider</strong><small>For example, a payment processor that can notify the backend when subscriptions change.</small></span><b>TO DO</b></div><div><span>02</span><span><strong>Define plans and billing periods</strong><small>Set the plan names, prices, currencies, and renewal rules.</small></span><b>TO DO</b></div><div><span>03</span><span><strong>Connect subscription records</strong><small>Then this page can report active, trialing, past-due, and cancelled plans.</small></span><b>TO DO</b></div></div></section>
      <PageFooter>No billing actions are available until subscriptions are implemented.</PageFooter>
    </section>
  );
}
