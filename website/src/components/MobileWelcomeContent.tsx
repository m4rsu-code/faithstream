export default function MobileWelcomeContent() {
  return (
    <>
      <div className="mobile-preview-brand-group">
        <img className="mobile-preview-logo" src="/faithstream-logo.png" alt="FaithStream" />
        <span className="mobile-preview-brand">FAITHSTREAM CAM</span>
      </div>
      <div className="mobile-preview-copy">
        <div className="mobile-preview-message">Ready<br />when<br />you are.</div>
        <div className="mobile-preview-status"><i /> CAMERA READY</div>
      </div>
      <div className="mobile-preview-loading">
        <span>Opening camera setup…</span>
        <div className="mobile-preview-loader"><i /><i className="active" /><i /></div>
      </div>
    </>
  )
}
