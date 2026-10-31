import Icon from '../components/Icon'
import ProductPreview from '../components/ProductPreview'
import VideoShowcase from '../components/VideoShowcase'
import MobileWelcomeContent from '../components/MobileWelcomeContent'
import crossImage from '../assets/cross-mark.png'

const features = [
  { icon: 'slides' as const, number: '01', title: 'Build your service slides', text: 'Create and organize presentations with editable text, scripture, images, video, and custom backgrounds.' },
  { icon: 'stream' as const, number: '02', title: 'Run the whole service', text: 'Bring presentations, scenes, cameras, and streaming controls together in the Studio workspace.' },
  { icon: 'camera' as const, number: '03', title: 'Use a phone as a camera', text: 'Pair the FaithStream Cam companion with your desktop over your local network.' },
]

export default function Home() {
  return (
    <>
      <section className="hero-section">
        <div className="hero-orb hero-orb-a" /><div className="hero-orb hero-orb-b" />
        <div className="hero-inner">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> WORSHIP, MADE CLEARER</div>
            <h1>Every part of your service,<br /><em>in one steady flow.</em></h1>
            <p className="hero-description">FaithStream brings worship slides, live production, and a phone camera companion into one friendly workspace for your church.</p>
            <div className="hero-actions"><a className="button button-primary" href="/download">Explore downloads <Icon name="arrow" size={17} /></a><a className="button button-quiet" href="#platform"><span className="button-play"><Icon name="play" size={12} /></span> See what’s inside</a></div>
            <div className="hero-meta"><span><i className="meta-dot" /> Windows desktop</span><span className="meta-divider" /><span>Android camera companion</span></div>
          </div>
          <div className="hero-visual"><div className="visual-glow" /><div className="floating-note"><span className="floating-cross-badge"><img className="floating-note-cross" src={crossImage} alt="FaithStream cross" /></span><span><b>One calm workspace</b><small>Slides · scenes · stream</small></span></div><ProductPreview /><div className="visual-caption"><span>FAITHSTREAM STUDIO</span><span>BUILT FOR THE MOMENTS THAT MATTER</span></div></div>
        </div>
        <div className="hero-bottom-rule"><span>01 / A BETTER WAY TO PRESENT</span><span>SCROLL TO EXPLORE ↓</span></div>
      </section>

      <section className="intro-strip"><div className="section-container intro-strip-inner"><span className="intro-label">MADE FOR CHURCH MEDIA TEAMS</span><p>Less app-hopping. More focus on the people in the room.</p><a href="#how-it-works">How it works <Icon name="arrow" size={15} /></a></div></section>

      <section className="section platform-section" id="platform">
        <div className="section-container">
          <div className="section-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> THE FAITHSTREAM PLATFORM</div><h2>Your service tools,<br /><em>working together.</em></h2></div><p>Prepare the content, shape the scene, and bring it to the screen from one connected place.</p></div>
          <div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><div className="feature-top"><span className="feature-icon"><Icon name={feature.icon} size={21} /></span><span>{feature.number}</span></div><h3>{feature.title}</h3><p>{feature.text}</p><a href={feature.number === '03' ? '/download' : '/#how-it-works'} aria-label={`Learn about ${feature.title}`}><Icon name="arrow" size={17} /></a></article>)}</div>
        </div>
      </section>

      <section className="workflow-section" id="how-it-works">
        <div className="section-container workflow-layout"><div className="workflow-copy"><div className="eyebrow"><span className="eyebrow-line" /> A SIMPLE SERVICE FLOW</div><h2>From preparation<br />to <em>presentation.</em></h2><p>FaithStream keeps the steps easy to follow, whether you are building slides ahead of time or managing a service as it happens.</p><a className="text-link text-link-light" href="/download">Meet the desktop app <Icon name="arrow" size={16} /></a></div>
          <div className="steps-list"><article className="workflow-step"><span className="step-number">01</span><div><h3>Prepare</h3><p>Create a presentation, add scripture or media, and arrange your service content.</p></div><span className="step-mark"><Icon name="check" size={16} /></span></article><article className="workflow-step"><span className="step-number">02</span><div><h3>Set the scene</h3><p>Choose your presentation and position camera or media sources in the Studio.</p></div><span className="step-mark"><Icon name="check" size={16} /></span></article><article className="workflow-step"><span className="step-number">03</span><div><h3>Present</h3><p>Preview your output, move through slides, and stream or record from the desktop app.</p></div><span className="step-mark"><Icon name="play" size={14} /></span></article></div>
        </div>
      </section>

        <section className="section companion-section"><div className="section-container companion-layout"><div className="companion-art"><div className="companion-backdrop"><div className="phone-device"><div className="phone-speaker" /><div className="phone-screen"><div className="mobile-preview-glow" /><MobileWelcomeContent /></div></div><div className="companion-signal signal-one" /><div className="companion-signal signal-two" /><span className="companion-art-caption">A CAMERA IN YOUR POCKET</span></div></div>
          <div className="companion-copy"><div className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> THE MOBILE COMPANION</div><h2>Bring another<br /><em>camera angle.</em></h2><p>Turn an Android phone into a wireless camera source for FaithStream Studio. Pair it on your local network and use the view in your production scene.</p><ul className="check-list"><li><Icon name="check" size={16} /> Pair with a short code in Studio</li><li><Icon name="check" size={16} /> Switch between front and back camera</li><li><Icon name="check" size={16} /> Reconnect from the source list</li></ul><a className="button button-dark" href="/download">See mobile downloads <Icon name="arrow" size={16} /></a></div></div></section>

      <section className="section video-section" id="watch"><div className="section-container"><div className="section-heading video-heading"><div><div className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> WATCH & LEARN</div><h2>See FaithStream<br /><em>in action.</em></h2></div><p>We’re preparing an introduction and practical walkthrough videos to help you get started.</p></div><div className="video-layout"><VideoShowcase /><div className="video-side-copy"><span className="video-kicker">COMING SOON</span><h3>Made to be easy<br />to learn.</h3><p>The getting-started guide will cover presentations, scenes, camera pairing, and stream setup.</p><div className="video-chapters"><span><b>01</b> Meet the workspace</span><span><b>02</b> Prepare a presentation</span><span><b>03</b> Build a scene and present</span></div></div></div></div></section>

      <section className="plans-banner"><div className="section-container plans-banner-inner"><div><div className="eyebrow"><span className="eyebrow-line" /> SUBSCRIPTIONS</div><h2>Clear plans for<br /><em>growing ministries.</em></h2><p>Subscription details are being prepared. We’ll share what’s included and the pricing here before plans become available.</p></div><a className="button button-primary" href="/plans">View subscription updates <Icon name="arrow" size={16} /></a><div className="plans-banner-mark">F<span>·</span>S</div></div></section>

      <section className="final-cta"><div className="section-container final-cta-inner"><div><span className="final-cta-label">READY WHEN YOU ARE</span><h2>Bring your next service<br />together with FaithStream.</h2></div><a className="button button-light" href="/download">Explore the apps <Icon name="arrow" size={16} /></a></div></section>
    </>
  )
}
