export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <a className="brand" href="/" aria-label="FaithStream home"><img src="/faithstream-logo.png" alt="FaithStream" /></a>
          <p>Worship media tools, thoughtfully brought together for your church.</p>
        </div>
        <div className="footer-links">
          <div><span>Explore</span><a href="/#platform">Platform</a><a href="/#watch">Video guide</a></div>
          <div><span>FaithStream</span><a href="/download">Downloads</a><a href="/plans">Subscriptions</a></div>
          <div><span>Project</span><a href="https://github.com/m4rsu-code/faithstream" target="_blank" rel="noreferrer">GitHub</a><a href="https://github.com/m4rsu-code/faithstream/releases" target="_blank" rel="noreferrer">Releases</a></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} FaithStream</span><span>Made to help every service flow with care.</span></div>
    </footer>
  )
}
