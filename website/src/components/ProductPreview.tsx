import MobileWelcomeContent from './MobileWelcomeContent'

export default function ProductPreview() {
  return (
    <div className="product-showcase" aria-label="FaithStream Studio desktop and mobile app preview">
      {/* Desktop Preview Card */}
      <div className="desktop-preview-card">
        <div className="desktop-preview-label">
          <span className="desktop-preview-dot" /> DESKTOP STUDIO
        </div>
        <img
          src="/faithstream-studio.png"
          alt="FaithStream Studio streaming workspace with slides, scenes, audio controls, and program preview"
        />
      </div>

      {/* Mobile Welcome Preview Card */}
      <div className="mobile-welcome-preview" aria-label="FaithStream Cam mobile welcome screen preview">
        <div className="mobile-preview-glow" />
        <MobileWelcomeContent />
      </div>
    </div>
  )
}