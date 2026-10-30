import { useEffect, useState } from 'react';
import { CircleHelp, Info, X } from 'lucide-react';

const HELP_SECTIONS = [
  {
    id: 'start', label: 'Getting started',
    intro: 'A simple first-time workflow: create your slides, set up a Studio scene, check the output, then stream or present.',
    topics: [
      { title: 'Learn the main areas', text: 'Use the left navigation to move between Studio, Presentations, and Settings. Presentations is where you build slide decks. Studio is where you assemble a live scene and send it to a display or Facebook. Settings holds your profile and defaults.' },
      { title: 'Make your first presentation', text: 'Open Presentations and choose Create Presentation, or import slide images or a PowerPoint file. Open the deck, add or edit slides, and give the presentation a clear title. Then go to Studio and add it as a scene.' },
      { title: 'Check before going live', text: 'In Studio, confirm the right scene and slide are selected, arrange the Program sources, and check the On air screen. For Facebook, open Go Live and enter the RTMPS URL and stream key from Live Producer. Start with a modest quality setting if this computer or network is new to streaming.' },
      { title: 'Know what viewers see', text: 'The On air screen is the actual program output. Program is the setup area where you arrange and stage sources. When preview mode is enabled, changes stay staged until you choose Take to air.' },
    ],
  },
  {
    id: 'studio', label: 'Studio',
    intro: 'Studio is where you prepare the program, choose what viewers see, and send it to a screen or stream.',
    topics: [
      { title: 'Understand the screens', text: 'On air is the output viewers or the selected display receive now. Program is your setup workspace: arrange the slide, camera, text, and other sources there, then choose Take to air. Changes to Program do not replace On air until you take them.' },
      { title: 'Choose scenes and slides', text: 'A scene groups a presentation’s slides and sources. Select a scene in the Scenes panel, then choose a slide in the Slides panel. Add Scene brings a saved presentation into Studio. Use the transition and duration controls to choose how slide changes appear.' },
      { title: 'Stage and arrange a scene', text: 'In Program, select a source to edit it. Drag it to move; drag the corner handle to resize, or enter X, Y, W, and H values. Choose available cameras from the camera tiles. Use Camera only to temporarily stage just the camera, and Undo camera only to restore the previous setup. Select Take to air when the arrangement is ready.' },
      { title: 'Use the Sources panel', text: 'Choose Add source to add a camera, screen, microphone, desktop audio, text, or media source. Use the eye control to show or hide a source. Drag source rows to reorder layers; items higher in the list appear in front. Use the edit control beside text sources, and the trash control to remove a source.' },
      { title: 'Use Music and the Audio Mixer', text: 'The Music panel lets you upload tracks, preview them, add them as a source, and choose whether they play once or loop. The Audio Mixer lets you mute or adjust available audio inputs and monitor their levels. You can stream slides without adding a microphone, camera, or music.' },
      { title: 'Show slides on a monitor', text: 'Choose the output display in Program and select Show slides to open the program on that screen. Use the Slideshow tab for a separate offline slide presentation: select a scene and slide, then show it on a connected monitor. Edit slide content in Presentations.' },
      { title: 'Start and end a Facebook stream', text: 'Choose Go Live. Enter the secure RTMPS server URL and complete stream key from Facebook Live Producer, set resolution, frame rate, and bitrate, and choose Go Live in the setup window. The footer changes from Connecting to a live confirmation when Facebook is receiving the stream. End Stream stops it; Settings can ask for confirmation first.' },
      { title: 'Find stream errors', text: 'Open the notification bell to read detailed connection or encoder errors. If encoding falls behind, try 720p at 30 fps and close other demanding apps. Check the RTMPS URL, current key, internet connection, and firewall or VPN if Facebook cannot be reached.' },
      { title: 'Studio settings and keyboard shortcuts', text: 'Open the gear menu in Studio for slide shortcuts and the end-stream confirmation option. Use the arrow keys or Page Up/Page Down to move between slides. Settings in the left navigation also contains app-wide preferences.' },
    ],
  },
  {
    id: 'presentations', label: 'Presentations',
    intro: 'Create and edit reusable slide decks before adding them to a Studio scene.',
    topics: [
      { title: 'Create, import, and manage decks', text: 'Choose Create Presentation for a blank deck. Import Slides accepts PNG, JPEG, WebP, or PowerPoint files. Select a deck card to open it. Its options menu can lock or unlock it, or delete it. A locked presentation cannot be edited until unlocked.' },
      { title: 'Build the slide sequence', text: 'Use Add Slide to make a blank slide. Select a thumbnail to edit it, type in the slide title field to rename it, and drag thumbnails to reorder them. The slide options menu can duplicate, move up or down, lock or unlock, and delete a slide. Ctrl+Z undoes slide editing changes.' },
      { title: 'Add text, scripture, and design', text: 'Use the editor dock: Templates adds a designed slide, Text adds a text box, Scripture searches for a verse, and Media adds images or video. Shapes is marked as coming soon. Select text on the slide to type directly, or use the Content panel; Style controls appearance, and Background controls the slide background.' },
      { title: 'Position images and text', text: 'Select an object on the canvas, then drag it to move it or drag a corner handle to resize. Right-click an image or text object for options such as duplicate, layer order, or delete. Images can be set as a background; use the background options to remove it. Double-click a background image to adjust its position, then choose Done.' },
      { title: 'Use your finished deck', text: 'Changes are saved as you work. Return to Studio and use Add Scene to load the saved presentation. Its slides will appear in Studio’s Slides panel for staging and presenting.' },
    ],
  },
  {
    id: 'settings', label: 'Settings',
    intro: 'Set account details and defaults for how FaithStream looks and behaves on this computer.',
    topics: [
      { title: 'Profile and sign-in', text: 'Change your display name and role, then choose Save profile. Your sign-in email cannot be edited here. Use Sign out to return to the login screen.' },
      { title: 'Colors and slide preview', text: 'Choose a color theme for the app. Preview slides before showing them controls how Studio advances slides: when enabled, select a slide for Preview and choose Take to air; when disabled, slide changes go straight to the output. The arrow keys move to the previous or next slide.' },
      { title: 'Stream safety and quality', text: 'Turn on Ask before ending a live stream to show a confirmation before stopping. Set the default picture size, frame rate, and bitrate used when Go Live setup opens. Higher resolution, frame rate, and bitrate need more computer capacity and upload bandwidth; choose 720p and a lower bitrate if the stream struggles.' },
      { title: 'Where preferences are saved', text: 'The Settings page explains which preferences stay on this device. Stream URL and key are entered in Go Live setup; the stream key is not saved in Settings.' },
    ],
  },
  {
    id: 'troubleshooting', label: 'Troubleshooting',
    intro: 'Use these quick checks when something does not look or connect as expected.',
    topics: [
      { title: 'The footer says Not connected', text: 'Confirm you completed Go Live setup and that the status changes to the live confirmation. A stream that is merely set up or connecting is not yet confirmed live. Check Notifications for the detailed error.' },
      { title: 'The stream is blurry or falls behind', text: 'Choose a resolution and bitrate your computer and upload connection can sustain. Try 720p at 30 fps, then increase quality only if the stream stays stable. Keep the application open while troubleshooting performance.' },
      { title: 'There is no audio', text: 'Audio is optional. For audio, add and enable a microphone, desktop audio, or music source in Studio, and check its mute and mixer level. A slide-only stream can still run without audio.' },
      { title: 'A slide or camera is missing', text: 'Check that the source is visible (eye icon), is included in the Program setup, and is on the intended layer. Use Take to air if Preview mode is enabled. Confirm the right scene and output display are selected.' },
      { title: 'Read the detailed error', text: 'Select the notification bell in the app header and open the latest Stream connection problem. The footer is intentionally brief; the notification contains the detailed message.' },
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
      {helpOpen && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setHelpOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="stream-help-title" className="flex h-[90vh] max-h-[760px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#101d2a] text-white shadow-2xl">
          <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 id="stream-help-title" className="text-base font-semibold">FaithStream user guide</h2>
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
      </div>}
    </footer>
  );
}
