import Icon from '../components/Icon'

const releasePage = 'https://github.com/m4rsu-code/faithstream/releases'

export default function Downloads() {
  return (
    <section className="inner-page download-page">
      <div className="inner-page-hero"><div className="eyebrow"><span className="eyebrow-line" /> DOWNLOAD FAITHSTREAM</div><h1>Bring FaithStream<br /><em>to your devices.</em></h1><p>Get the desktop Studio for your production setup and the mobile camera companion for Android.</p></div>
      <div className="section-container download-cards"><article className="download-card download-card-featured"><div className="download-card-icon"><Icon name="desktop" size={24} /></div><span className="download-platform">DESKTOP · WINDOWS</span><h2>FaithStream Studio</h2><p>Prepare presentations, manage scenes, connect cameras, and control your service output.</p><a className="button button-primary" href={releasePage} target="_blank" rel="noreferrer">View Windows downloads <Icon name="arrow" size={16} /></a><small>Choose the latest Windows release on GitHub.</small></article>
        <article className="download-card"><div className="download-card-icon"><Icon name="camera" size={24} /></div><span className="download-platform">MOBILE · ANDROID</span><h2>FaithStream Cam</h2><p>Pair an Android phone with the desktop Studio and use it as a camera source.</p><a className="button button-outline" href={releasePage} target="_blank" rel="noreferrer">View Android downloads <Icon name="arrow" size={16} /></a><small>Choose the latest Android release on GitHub.</small></article>
        <article className="download-card download-card-muted"><div className="download-card-icon"><Icon name="heart" size={24} /></div><span className="download-platform">MOBILE · iOS</span><h2>iPhone companion</h2><p>An iOS download package is not published yet. Check back here for availability.</p><span className="availability-pill">NOT AVAILABLE YET</span></article>
      </div>
      <div className="section-container download-note"><Icon name="spark" size={18} /><p>Only official release builds should be shared here. Development builds are for testing and may not be suitable for public download.</p></div>
      <div className="download-back-link"><a className="text-link text-link-light" href="/">Back to FaithStream <Icon name="arrow" size={15} /></a></div>
    </section>
  )
}
