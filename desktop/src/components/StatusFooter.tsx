import { useEffect, useState } from 'react';
import { CircleHelp, Info, X } from 'lucide-react';
import BodyPortal from './BodyPortal';

const HELP_SECTIONS = [
  {
    id: 'start', label: 'Getting started',
    intro: 'A first-time workflow: prepare your content in Presentations, arrange the output in Studio, then show it on a display or stream it.',
    topics: [
      { title: 'Navigate FaithStream Studio', text: 'Studio is the live production workspace. Presentations contains your slide decks, background library, and songbooks. Settings contains your profile and app preferences. The BETA label and version number appear at the bottom of the sidebar.' },
      { title: 'Prepare content', text: 'In Presentations, create a deck or import slides. Add text, scripture, images, and video, then set each slide’s design. You can also create songbooks and type songs in the Songbooks tab.' },
      { title: 'Set up Studio', text: 'In Studio, add a presentation as a scene. Choose a scene and slide, add the camera or audio sources you need, and arrange the Program output. The left On air screen shows the current output; the Program panel is where you prepare the next output.' },
      { title: 'Show or stream', text: 'Choose an Output display and press Show slides to present on a monitor. For Facebook, choose Go Live, enter the server URL and stream key from Live Producer, select stream quality, and start the connection. Wait for the app to report that the stream is live.' },
      { title: 'Keep your files straight', text: 'FaithStream Studio stores some items locally and syncs some account content. Read the Songbooks and Presentations sections below before moving files or expecting imported media to appear on another computer.' },
    ],
  },
  {
    id: 'studio', label: 'Studio',
    intro: 'Studio assembles slides, cameras, audio, and other sources into a live program or an offline slideshow.',
    topics: [
      { title: 'On air and Program', text: 'On air is the current output sent to selected monitors and, while streaming, to the audience. Program is the staging workspace. With Preview Mode on, select a slide, choose Show Preview, adjust the visible sources, then choose Put on Air. With Preview Mode off, slide selection goes directly on air; use Show on Air to apply the staged layout.' },
      { title: 'Scenes and slides', text: 'A scene groups a presentation or song/scripture slides for Studio. Add Scene brings a saved presentation into the scene list; adding a song or scripture creates a scene without putting it on air automatically. Select a scene, then a slide. Slide transition and duration settings apply when slides change; they do not animate or reposition camera and other source layers.' },
      { title: 'Arrange Program sources', text: 'Select a camera, image/video, text, or presentation source in the Program preview. Drag it to position it, drag its corner handle to resize it, or edit its X, Y, W, and H values. Choose a camera from the camera tiles. Camera only temporarily stages one camera; Exit camera only restores the previous setup.' },
      { title: 'Manage source layers', text: 'Add sources for cameras, FaithStream Cam phones, screen capture, microphone, desktop audio, text, or media. The eye control shows or hides a source. Drag rows in Sources to reorder layers: higher rows are in front. Add up to three FaithStream Cam phone sources and pair each phone from its source controls. Remove a source with its trash button.' },
      { title: 'Music and the Audio Mixer', text: 'In Music → Audio tracks, add a track from a file on this computer, preview it, then add it to Sources. FaithStream Studio references the original file path; moving or deleting that file makes the track unavailable. Audio Mixer controls volume and mute for program audio, and each channel’s settings include available options such as pan, compressor, or microphone noise suppression. Music and audio are optional; slide-only streaming works without them.' },
      { title: 'Monitor and offline slideshow', text: 'Select one or more monitors in Output display, then choose Show slides. The Streaming tab shows the current on-air program. The Slideshow tab is a separate offline presentation output; choose its scene and slide, then show it on the selected monitor. Edit slide content in Presentations.' },
      { title: 'Go live and end the stream', text: 'Open Go Live, enter the secure RTMPS server URL and full stream key from Facebook Live Producer, and choose resolution, frame rate, and bitrate. Start the stream from that setup. The footer reports whether the stream is connecting, live, or disconnected. Navigating to Presentations or Settings does not stop an active stream. End it from Studio; Settings can require a confirmation first.' },
      { title: 'Slide controls and transitions', text: 'When Preview Mode is off, selecting a slide sends it straight to the output. When it is on, select and preview a slide before putting it on air. Use the arrow keys or Page Up/Page Down to move through slides. The selected transition and duration affect slide changes only, not camera or other overlays.' },
      { title: 'Find stream errors', text: 'Open the notification bell for full connection and encoder errors; the footer stays brief. Check the RTMPS URL and current key in Live Producer, internet connection, and firewall/VPN if Facebook cannot be reached. If encoding falls behind, try 720p at 30 fps and close demanding apps. A stream can run without a microphone, camera, or slides.' },
    ],
  },
  {
    id: 'presentations', label: 'Presentations',
    intro: 'Create slide decks, curate reusable backgrounds, and manage songbooks before presenting in Studio.',
    topics: [
      { title: 'Presentations tab and account sync', text: 'The Presentations page has Presentations, Backgrounds, and Songbooks tabs. Create decks or import slide images and PowerPoint files. Deck text and layouts sync to your account when signed in and connected; imported media files remain on the device that imported them.' },
      { title: 'Build and edit a deck', text: 'Create a presentation, add slides, rename and reorder them, then choose a slide to edit. Use Templates for a starting design, Text to add a text box, Scripture to search and select verses, and Media to add images or videos. You can type directly in text boxes or use the side panel. Ctrl+Z undoes slide edits.' },
      { title: 'Scripture slides', text: 'In the Scripture picker, choose a book, chapter, and translation. Select a starting verse and move the pointer to the last verse you want; the range updates as you move. Choose to design the selected verses before adding them or present them directly. Designed passages create one slide per verse, and the design controls let you edit text layout and choose a background.' },
      { title: 'Adjust images and text', text: 'Select a canvas object to move or resize it. Right-click text or an image for available object and layer actions. Images can be placed behind or in front of text, brought forward or backward, or set as the slide background. Double-click a background image to adjust its position; remove it from the background controls to restore it as an object.' },
      { title: 'Background library', text: 'Open Backgrounds to import individual image/video files or a folder. Folder imports become collections. Preview backgrounds and reuse them in slide designs and song designs. Background files are stored locally on this computer and are not account-synced.' },
      { title: 'Send the deck to Studio', text: 'Changes save as you work. Go to Studio, choose Add Scene, select the presentation, and add it. The scene’s slide list follows the presentation. Song and scripture scenes can also be added from Studio without changing the current on-air slide.' },
    ],
  },
  {
    id: 'songbooks', label: 'Songbooks',
    intro: 'Songbooks are reusable lyric libraries connected to Studio and slide design.',
    topics: [
      { title: 'Create and edit songs', text: 'In Presentations → Songbooks, create a songbook and add songs by typing their title and lyrics. You can edit a song’s details and design how its lyric slides look. Each song part becomes a slide when added to Studio.' },
      { title: 'Sync and local imports', text: 'Songbooks and songs you create in FaithStream Studio sync to your account when signed in and the server is available. Songs imported from files stay on the computer where they were imported. Importing a FaithStream Studio songbook file creates local-only songbooks. In Studio, local-only books are marked “This device”.' },
      { title: 'Use a song in Studio', text: 'Open Studio → Music → Songbooks, find a song, and add it to the Scenes list. Adding it does not put it on air. Select its scene and choose a slide; use Preview Mode if you want to stage the slide before showing it.' },
      { title: 'Import and export', text: 'Import supported song files into a personal songbook. Export a songbook or create an app backup from the Songbooks page to keep a separate copy. Restored backup content stays local to that device.' },
    ],
  },
  {
    id: 'settings', label: 'Settings',
    intro: 'Manage your account profile and choose app and streaming defaults for this computer.',
    topics: [
      { title: 'Profile and profile photo', text: 'Change your name, role, and profile photo. Use Adjust framing to choose how the photo appears, then save profile changes. Your sign-in email is read-only. Sign out returns to the login screen.' },
      { title: 'Request account deletion', text: 'Request deletion from the account section and confirm with your password. The request is sent for admin review; it is not deleted immediately. You can cancel a pending request in Settings.' },
      { title: 'Appearance and slide workflow', text: 'Choose a color theme for this computer. Preview slides before showing them controls whether selecting a slide stages it first or sends it directly on air. Arrow keys and Page Up/Page Down navigate slides.' },
      { title: 'Stream safety and quality', text: 'Ask before ending a live stream adds a confirmation step. Choose default resolution, frame rate, and bitrate for Go Live setup. Higher settings need more processing power and upload bandwidth; for a 4 GB PC, start with 720p, 30 fps, and Low or Balanced bitrate.' },
      { title: 'What stays local', text: 'App theme, stream preferences, backgrounds, imported media, Studio source setup, and local audio file references stay on this computer. The Facebook stream key is entered in Go Live setup, not saved in Settings.' },
    ],
  },
  {
    id: 'troubleshooting', label: 'Troubleshooting',
    intro: 'Use these checks when a source, slide, or stream is not behaving as expected.',
    topics: [
      { title: 'The stream is not live', text: 'Confirm the server URL and full stream key in Facebook Live Producer, then retry Go Live. Check internet access and firewall/VPN filtering. The footer shows connection state; open the notification bell for the full error.' },
      { title: 'The stream is blurry or slow', text: 'Try 720p at 30 fps with Low or Balanced bitrate, close demanding applications, and check upload speed. Raise quality only after the stream runs smoothly. The final quality also depends on your computer and connection.' },
      { title: 'Music is unavailable', text: 'Studio uses the original audio file on this computer. If it was moved, renamed, deleted, or its drive is disconnected, remove and add the track again from its current location. Music tracks do not sync to another device.' },
      { title: 'Audio does not sound right', text: 'Check that the source is visible and playing, then inspect its Audio Mixer channel. Lowering the fader to its minimum silences that channel; the mute button also silences it. The audio mixer can also affect microphone and desktop audio.' },
      { title: 'A slide, camera, or text is missing', text: 'Check that the correct scene is selected and that the source eye icon is on. In Preview Mode, use Show Preview and Put on Air. Confirm source order and camera visibility in Program, and verify the selected output display.' },
      { title: 'A phone camera will not connect', text: 'Add a FaithStream Cam source in Studio and pair the phone using the details shown for that camera. Keep the phone and computer on the same local network, allow FaithStream Studio through the computer firewall, and reconnect the source if needed.' },
      { title: 'Changes do not appear on another device', text: 'Sign into the same FaithStream Studio account and connect to the same server. Created songbooks and typed songs sync when the account sync service and its database migration are available. Imported songs, backgrounds, and presentation media files are local to the device that imported them.' },
    ],
  },
] as const;

export default function StatusFooter({ message = 'Ready.' }: { message?: string }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<(typeof HELP_SECTIONS)[number]['id']>('start');
  const activeSection = HELP_SECTIONS.find((section) => section.id === helpSection) ?? HELP_SECTIONS[0];

  useEffect(() => {
    if (!helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [helpOpen]);

  return (
    <footer className="flex items-center justify-between border-t border-white/10 bg-panel px-6 py-3 text-sm text-warm-white/80">
      <div className="flex items-center gap-3">
        <Info size={22} className="rounded-full bg-brand p-0.5 text-navy" />
        <span>{message}</span>
      </div>
      <button type="button" onClick={() => setHelpOpen(true)} className="flex items-center gap-1.5 text-xs hover:text-brand">
        <CircleHelp size={16} /> Need help?
      </button>
      {helpOpen && <BodyPortal><div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="stream-help-title" className="flex h-[90vh] max-h-[760px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#101d2a] text-white shadow-2xl">
          <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 id="stream-help-title" className="text-base font-semibold">FaithStream Studio user guide</h2>
              <p className="mt-1 text-xs text-white/55">How to use the app from Studio through Settings.</p>
            </div>
            <button type="button" aria-label="Close help" onClick={() => setHelpOpen(false)} className="rounded-md p-1 text-white/55 hover:bg-white/10 hover:text-white"><X size={18} /></button>
          </header>
          <nav aria-label="Guide sections" className="flex flex-wrap gap-2 border-b border-white/10 px-5 pt-3">
            {HELP_SECTIONS.map((section) => <button key={section.id} type="button" aria-pressed={helpSection === section.id} onClick={() => setHelpSection(section.id)} className={`border-b-2 px-3 py-2 text-xs font-semibold ${helpSection === section.id ? 'border-brand text-brand' : 'border-transparent text-white/55 hover:text-white'}`}>{section.label}</button>)}
          </nav>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
            <p className="text-xs leading-relaxed text-white/65">{activeSection.intro}</p>
            {activeSection.topics.map((topic, index) => <section key={topic.title}>
              <h3 className="font-medium">{index + 1}. {topic.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/65">{topic.text}</p>
            </section>)}
          </div>
          <div className="flex justify-end border-t border-white/10 px-5 py-3">
            <button type="button" onClick={() => setHelpOpen(false)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110">Close</button>
          </div>
        </section>
      </div></BodyPortal>}
    </footer>
  );
}
