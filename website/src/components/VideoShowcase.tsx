import Icon from './Icon'
import MobileWelcomeContent from './MobileWelcomeContent'

// Add the finished walkthrough video at this path when it is ready.
const INTRO_VIDEO_SRC = ''

export default function VideoShowcase() {
  return (
    <div className="video-frame">
      {INTRO_VIDEO_SRC ? <video className="intro-video" controls preload="metadata" src={INTRO_VIDEO_SRC} /> : <div className="video-placeholder">
        <div className="video-grid-art"><div className="video-screen-card"><img src="/faithstream-studio.png" alt="FaithStream desktop Studio" /></div><div className="video-phone-card"><div className="phone-camera-lens" /><div className="phone-screen"><div className="mobile-preview-glow" /><MobileWelcomeContent /></div></div><div className="video-orbit orbit-one" /><div className="video-orbit orbit-two" /></div>
        <div className="video-overlay"><span className="play-button"><Icon name="play" size={21} /></span><span className="video-coming">INTRODUCTION VIDEO<br /><b>Coming soon</b></span></div>
      </div>}
    </div>
  )
}
