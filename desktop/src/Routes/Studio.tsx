import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Mic,
  Monitor,
  Pencil,
  Play,
  Plus,
  Radio,
  Settings,
  Square,
  Type,
  Video,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ---------- Data ---------- */

type Slide = { text: string; ref?: string };

type Scene = {
  id: number;
  name: string;
  desc: string;
  bg: string; // tailwind gradient classes (placeholder until real media is wired in)
  slides: Slide[];
};

const SCENES: Scene[] = [
  {
    id: 1,
    name: 'Worship',
    desc: 'Lyrics + Background',
    bg: 'from-orange-400/80 via-indigo-800 to-slate-900',
    slides: [
      {
        text: 'Great is Thy faithfulness, O God my Father; There is no shadow of turning with Thee.',
        ref: 'Lamentations 3:23',
      },
      { text: 'Chorus', ref: 'Edit this slide' },
      { text: 'Verse 2', ref: 'Edit this slide' },
    ],
  },
  {
    id: 2,
    name: 'Preaching',
    desc: 'Bible + Speaker',
    bg: 'from-stone-600 to-stone-950',
    slides: [
      { text: 'For God so loved the world, that he gave his only begotten Son.', ref: 'John 3:16' },
      { text: 'The LORD is my shepherd; I shall not want.', ref: 'Psalm 23:1' },
      {
        text: 'And we know that all things work together for good to them that love God.',
        ref: 'Romans 8:28',
      },
    ],
  },
  {
    id: 3,
    name: 'Announcement',
    desc: 'Image + Text',
    bg: 'from-indigo-500 to-blue-950',
    slides: [{ text: 'Announcements' }, { text: 'Upcoming events' }, { text: 'Welcome, visitors!' }],
  },
  {
    id: 4,
    name: 'Offering',
    desc: 'Image + Text',
    bg: 'from-rose-500/80 to-amber-900',
    slides: [
      { text: 'Give cheerfully' },
      { text: 'God loveth a cheerful giver.', ref: '2 Corinthians 9:7' },
    ],
  },
  {
    id: 5,
    name: 'Closing',
    desc: 'Thank You',
    bg: 'from-slate-600 to-slate-950',
    slides: [{ text: 'Thank you for joining us' }, { text: 'God bless you' }],
  },
];

type Ref = { sceneId: number; slideIdx: number };

const same = (a: Ref, b: Ref) => a.sceneId === b.sceneId && a.slideIdx === b.slideIdx;

type Source = { id: number; name: string; icon: LucideIcon; visible: boolean };

const INITIAL_SOURCES: Source[] = [
  { id: 1, name: 'Camera 1 (USB Camera)', icon: Camera, visible: true },
  { id: 2, name: 'Microphone (USB Audio)', icon: Mic, visible: true },
  { id: 3, name: 'Screen Capture', icon: Monitor, visible: true },
  { id: 4, name: 'Media (Video/Images)', icon: Play, visible: true },
  { id: 5, name: 'Text / Slides', icon: Type, visible: true },
];

type Channel = { id: number; name: string; icon: LucideIcon; db: number; muted: boolean };

const INITIAL_CHANNELS: Channel[] = [
  { id: 1, name: 'Mic/Aux', icon: Mic, db: -6, muted: false },
  { id: 2, name: 'Camera 1', icon: Camera, db: 0, muted: false },
  { id: 3, name: 'Desktop Audio', icon: Volume2, db: -12, muted: false },
];

/* ---------- Small building blocks ---------- */

function Panel({
  title,
  action,
  className = '',
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border border-white/10 bg-panel p-3 ${className}`}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-bold text-warm-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Fits a 16:9 box inside whatever space is left over (never overflows),
 * so the monitor shrinks with the window instead of forcing a scroll.
 */
function Fit({
  className = '',
  grow = 1,
  children,
}: {
  className?: string;
  grow?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center"
      style={{ containerType: 'size', flexGrow: grow }}
    >
      <div
        className={`relative overflow-hidden ${className}`}
        style={{ width: 'min(100cqw, calc(100cqh * 16 / 9))', aspectRatio: '16 / 9' }}
      >
        {children}
      </div>
    </div>
  );
}

/** A slide drawn on a scene background. Text size follows the nearest size container (cqw). */
function SlideView({
  bg,
  slide,
  scale,
  minRem = 0.75,
}: {
  bg: string;
  slide?: Slide;
  scale?: number;
  minRem?: number;
}) {
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br p-2 text-center text-white ${bg}`}
    >
      {slide && scale && (
        <div style={{ fontSize: `clamp(${minRem}rem, ${scale}cqw, 2.25rem)` }}>
          <p className="font-bold leading-snug drop-shadow">{slide.text}</p>
          {slide.ref && <p className="mt-1 text-[0.6em] opacity-90">{slide.ref}</p>}
        </div>
      )}
    </div>
  );
}

/** Camera / live video input. These sit in fixed positions in the Program panel. */
function Feed({
  label,
  icon: Icon,
  bg,
  live,
}: {
  label: string;
  icon: LucideIcon;
  bg: string;
  live: boolean;
}) {
  return (
    <div className={`relative aspect-video overflow-hidden rounded-lg bg-gradient-to-br ${bg}`}>
      <div className="flex h-full items-center justify-center pb-5 text-white/90">
        <Icon size={28} />
      </div>
      {live && (
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded bg-red-600 px-1.5 text-[10px] font-bold text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-xs font-semibold text-white">
        {label}
      </div>
    </div>
  );
}

function Switch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm text-warm-white">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`h-6 w-11 rounded-full p-0.5 transition-colors ${on ? 'bg-sky-500' : 'bg-white/15'}`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`}
        />
      </button>
    </div>
  );
}

const selectClass =
  'rounded-lg border border-white/10 bg-navy px-3 py-1.5 text-sm text-warm-white outline-none focus:border-brand';

/* ---------- Page ---------- */

export default function Studio() {
  const [scenes, setScenes] = useState<Scene[]>(SCENES); // editable copy of the scenes + slides
  const [sceneId, setSceneId] = useState(1); // scene whose slides are listed (Scenes panel)
  const [selected, setSelected] = useState<Ref>({ sceneId: 1, slideIdx: 0 }); // step 1: "Selected slide" screen
  const [preview, setPreview] = useState<Ref>({ sceneId: 1, slideIdx: 0 }); // step 2: Preview screen
  const [onAir, setOnAir] = useState<Ref>({ sceneId: 1, slideIdx: 0 }); // step 3: what the audience sees

  const [transition, setTransition] = useState('Fade');
  const [duration, setDuration] = useState('1.0s');

  const [sources, setSources] = useState(INITIAL_SOURCES);
  const [channels, setChannels] = useState(INITIAL_CHANNELS);

  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [autoSwitch, setAutoSwitch] = useState(true);
  const [previewMode, setPreviewMode] = useState(true);

  const [editing, setEditing] = useState(false); // editing the slide that is in Preview
  const [draftText, setDraftText] = useState('');
  const [draftRef, setDraftRef] = useState('');

  const resolve = (r: Ref) => {
    const sc = scenes.find((x) => x.id === r.sceneId)!;
    return { bg: sc.bg, slide: sc.slides[r.slideIdx] };
  };

  const scene = scenes.find((x) => x.id === sceneId)!; // scene whose slides are listed
  const staged = resolve(selected);
  const previewed = resolve(preview);
  const airing = resolve(onAir);

  // Step 1: clicking a slide only SELECTS it (it shows in the small "Selected slide" screen).
  const selectSlide = (i: number) => setSelected({ sceneId, slideIdx: i });

  const selectScene = (id: number) => {
    setSceneId(id);
    setSelected({ sceneId: id, slideIdx: 0 });
  };

  // Double-click a slide = send it to Preview right away (with Preview Mode off: straight on air).
  const sendToPreview = (target: Ref) => {
    setPreview(target);
    if (!previewMode) setOnAir(target);
  };

  // ONE button that always does the next sensible step, and says what it will do.
  const nothing = {
    label: 'Showing on air',
    hint: previewMode ? 'Pick another slide to continue' : 'Pick a slide, or press → / PageDown',
  };
  const next: { label: string; hint: string; run?: () => void } = previewMode
    ? !same(selected, preview)
      ? {
          label: 'Send to Preview',
          hint: 'Moves the selected slide into Preview',
          run: () => setPreview(selected),
        }
      : !same(preview, onAir)
        ? {
            label: 'Put on air',
            hint: 'Shows the Preview slide to the audience',
            run: () => {
              setOnAir(preview);
              // Get the next slide ready, so the next press is already lined up.
              const count = scenes.find((x) => x.id === preview.sceneId)!.slides.length;
              if (same(selected, preview) && preview.slideIdx + 1 < count) {
                setSelected({ sceneId: preview.sceneId, slideIdx: preview.slideIdx + 1 });
              }
            },
          }
        : nothing
    : !same(selected, onAir)
      ? {
          label: 'Put on air',
          hint: 'Goes on air right away. Tip: use ← → or PageUp / PageDown',
          run: () => sendToPreview(selected),
        }
      : nothing;

  // Fix typos in the slide that is in Preview, before it goes on air.
  const startEdit = () => {
    setDraftText(previewed.slide.text);
    setDraftRef(previewed.slide.ref ?? '');
    setEditing(true);
  };

  const saveEdit = () => {
    const text = draftText.trim();
    if (!text) return;
    const ref = draftRef.trim() || undefined;
    setScenes((list) =>
      list.map((sc) =>
        sc.id !== preview.sceneId
          ? sc
          : { ...sc, slides: sc.slides.map((sl, i) => (i === preview.slideIdx ? { text, ref } : sl)) },
      ),
    );
    setEditing(false);
  };

  // If a different slide moves into Preview, close the editor.
  useEffect(() => setEditing(false), [preview.sceneId, preview.slideIdx]);

  // Keyboard: ← → ↑ ↓ and PageUp / PageDown (what most presentation clickers send) change slides.
  // Fast mode (Preview Mode off): the slide goes on air immediately. Otherwise it is only selected.
  const step = (dir: 1 | -1) => {
    const count = scenes.find((x) => x.id === selected.sceneId)!.slides.length;
    const i = Math.min(count - 1, Math.max(0, selected.slideIdx + dir));
    if (i === selected.slideIdx) return;
    const target = { sceneId: selected.sceneId, slideIdx: i };
    setSelected(target);
    if (!previewMode) {
      setPreview(target);
      setOnAir(target);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return; // typing a correction: leave the keys alone
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return; // sliders use arrow keys too
      const forward = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key);
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
      if (!forward && !back) return;
      e.preventDefault();
      step(forward ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toggleSource = (id: number) =>
    setSources((list) => list.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)));

  const updateChannel = (id: number, patch: Partial<Channel>) =>
    setChannels((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Top row: takes all the leftover height */}
      <div className="grid min-h-0 flex-1 grid-cols-[1fr_1fr_0.6fr] gap-3">
        {/* Left: Preview (big), Selected slide + On air side by side, then ONE next-step button */}
        <div className="flex min-h-0 flex-col gap-2">
          <Fit grow={3} className="rounded-xl border border-sky-500/50">
            <span className="absolute left-3 top-3 z-10 rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white">
              Preview
            </span>
            {!editing && (
              <button
                onClick={startEdit}
                className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded bg-black/55 px-2 py-1 text-xs font-medium text-white hover:bg-black/75"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
            <SlideView bg={previewed.bg} slide={previewed.slide} scale={4.4} />
            {editing && (
              <div className="absolute inset-0 z-20 flex flex-col gap-2 bg-slate-950/90 p-3">
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  aria-label="Slide text"
                  className="min-h-0 flex-1 resize-none rounded-lg border border-white/15 bg-navy p-2 text-sm text-warm-white outline-none focus:border-brand"
                />
                <input
                  value={draftRef}
                  onChange={(e) => setDraftRef(e.target.value)}
                  aria-label="Reference"
                  placeholder="Reference (optional), e.g. John 3:16"
                  className="rounded-lg border border-white/15 bg-navy px-2 py-1.5 text-sm text-warm-white outline-none focus:border-brand"
                />
                {same(preview, onAir) && (
                  <p className="text-[11px] text-amber-300">
                    This slide is on air. Saving will change it live.
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-white/20 px-3 py-1 text-sm text-warm-white hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={!draftText.trim()}
                    className="rounded-lg bg-brand px-3 py-1 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </Fit>

          <div className="flex min-h-0 flex-[2] gap-2">
            <Fit className="rounded-xl border border-red-500/60">
              <span className="absolute left-2 top-2 z-10 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                On air
              </span>
              <SlideView bg={airing.bg} slide={airing.slide} scale={5.5} minRem={0.55} />
            </Fit>
            <Fit className="rounded-xl border border-brand/60">
              <span className="absolute left-2 top-2 z-10 rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-white">
                Selected slide
              </span>
              <SlideView bg={staged.bg} slide={staged.slide} scale={5.5} minRem={0.55} />
            </Fit>
          </div>

          <button
            onClick={next.run}
            disabled={!next.run}
            className={`flex shrink-0 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition ${
              next.run ? 'bg-brand text-white hover:brightness-110' : 'bg-white/10 text-warm-white/60'
            }`}
          >
            {next.run ? <ArrowRight size={16} /> : <Check size={16} />}
            {next.label}
          </button>
          <p className="shrink-0 text-center text-[11px] text-warm-white/60">{next.hint}</p>

          <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-panel p-2">
            <label className="flex items-center gap-2 text-sm text-warm-white/70">
              Transition
              <select
                value={transition}
                onChange={(e) => setTransition(e.target.value)}
                className={selectClass}
              >
                <option>Fade</option>
                <option>Cut</option>
                <option>Slide</option>
              </select>
            </label>
            <label className="ml-auto flex items-center gap-2 text-sm text-warm-white/70">
              Duration
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={selectClass}
              >
                <option>0.5s</option>
                <option>1.0s</option>
                <option>2.0s</option>
              </select>
            </label>
            <button
              aria-label="Transition settings"
              className="rounded-lg p-1.5 text-warm-white/70 hover:bg-white/5"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Middle: Program = camera + live video (fixed), slides of the chosen scene under them */}
        <Panel
          title="Program"
          action={
            live ? (
              <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">LIVE</span>
            ) : (
              <span className="text-xs text-warm-white/50">Standby</span>
            )
          }
        >
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Feed label="Camera 1" icon={Camera} bg="from-blue-700 to-slate-950" live={live} />
            <Feed label="Live Video" icon={Video} bg="from-emerald-700 to-slate-900" live={live} />
          </div>

          <div className="mb-1.5 mt-3 flex shrink-0 items-baseline justify-between gap-2">
            <h3 className="truncate text-sm font-bold text-warm-white">Slides: {scene.name}</h3>
            <span className="shrink-0 text-xs text-warm-white/50">Click a slide to select it</span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto">
            {scene.slides.map((sl, i) => {
              const ref: Ref = { sceneId, slideIdx: i };
              const isSelected = same(selected, ref);
              const inPreview = same(preview, ref);
              const isOnAir = same(onAir, ref);
              return (
                <div key={i} style={{ containerType: 'inline-size' }}>
                  <button
                    onClick={() => selectSlide(i)}
                    onDoubleClick={() => sendToPreview(ref)}
                    title="Click to select, double-click to send to Preview"
                    aria-pressed={isSelected}
                    className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 transition ${
                      isSelected
                        ? 'border-brand ring-2 ring-brand/40'
                        : 'border-white/10 hover:border-white/40'
                    }`}
                  >
                    <SlideView bg={scene.bg} slide={sl} scale={8} minRem={0.5} />
                    <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[10px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                      {isOnAir && (
                        <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">
                          On air
                        </span>
                      )}
                      {inPreview && (
                        <span className="rounded bg-sky-600 px-1 text-[9px] font-bold text-white">
                          Preview
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Right: Scenes (list scrolls inside its own panel if it ever gets long) */}
        <Panel
          title="Scenes"
          action={
            <button aria-label="Add scene" className="text-warm-white/70 hover:text-brand">
              <Plus size={18} />
            </button>
          }
        >
          <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {scenes.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => selectScene(s.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-1.5 text-left transition-colors ${
                    sceneId === s.id ? 'border-brand bg-brand/10' : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded">
                    <SlideView bg={s.bg} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-warm-white">
                      {s.id} {s.name}
                    </p>
                    <p className="truncate text-xs text-warm-white/50">{s.desc}</p>
                  </div>
                  {onAir.sceneId === s.id && (
                    <span aria-label="On air" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                </button>
              </li>
            ))}
          </ul>
          <button className="mt-2 flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 py-1.5 text-sm text-warm-white hover:bg-white/5">
            <Plus size={16} /> Add Scene
          </button>
        </Panel>
      </div>

      {/* Bottom row: natural height */}
      <div className="grid shrink-0 grid-cols-4 gap-3">
        {/* Sources */}
        <Panel
          title="Sources"
          action={
            <button aria-label="Add source" className="text-warm-white/70 hover:text-brand">
              <Plus size={18} />
            </button>
          }
        >
          <ul className="flex flex-col gap-2">
            {sources.map(({ id, name, icon: Icon, visible }) => (
              <li key={id} className="flex items-center gap-3 text-sm text-warm-white">
                <Icon size={16} className="shrink-0 text-warm-white/70" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <button
                  aria-label={visible ? `Hide ${name}` : `Show ${name}`}
                  onClick={() => toggleSource(id)}
                  className="text-warm-white/70 hover:text-brand"
                >
                  {visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <GripVertical size={14} className="text-warm-white/30" />
              </li>
            ))}
          </ul>
        </Panel>

        {/* Audio mixer */}
        <Panel title="Audio Mixer">
          <ul className="flex flex-col gap-3">
            {channels.map(({ id, name, icon: Icon, db, muted }) => (
              <li key={id} className="flex items-center gap-3">
                <Icon size={16} className="shrink-0 text-warm-white/70" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-warm-white">
                    <span>{name}</span>
                    <span className="tabular-nums text-warm-white/60">{db.toFixed(1)} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    step={0.5}
                    value={db}
                    disabled={muted}
                    aria-label={`${name} volume`}
                    onChange={(e) => updateChannel(id, { db: Number(e.target.value) })}
                    className="mt-1 w-full accent-brand disabled:opacity-40"
                  />
                </div>
                <button
                  aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
                  onClick={() => updateChannel(id, { muted: !muted })}
                  className={muted ? 'text-red-400' : 'text-warm-white/70 hover:text-brand'}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Stream status */}
        <Panel title="Stream Status">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
              f
            </div>
            <div>
              <p className="text-sm font-medium text-warm-white">Facebook Live</p>
              <p className="text-xs text-warm-white/50">
                {live ? 'Good connection - 1080p - 6,000 kbps' : 'Offline'}
              </p>
            </div>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Stream Health</dt>
              <dd className={`flex items-center gap-1 ${live ? 'text-emerald-400' : 'text-warm-white/40'}`}>
                <Wifi size={16} /> {live ? 'Excellent' : '-'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Dropped Frames</dt>
              <dd className="text-warm-white">0 (0.0%)</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Audio Level</dt>
              <dd className="flex gap-0.5" aria-hidden>
                {Array.from({ length: 10 }, (_, i) => (
                  <span
                    key={i}
                    className={`h-3 w-1.5 rounded-sm ${live && i < 8 ? 'bg-emerald-400' : 'bg-white/15'}`}
                  />
                ))}
              </dd>
            </div>
          </dl>
        </Panel>

        {/* Quick controls */}
        <Panel title="Quick Controls">
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => setLive((v) => !v)}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-colors ${
                live ? 'bg-red-600 hover:bg-red-500' : 'bg-brand hover:brightness-110'
              }`}
            >
              {live ? <Square size={16} /> : <Radio size={18} />}
              {live ? 'End Stream' : 'Go Live'}
            </button>
            <button
              onClick={() => setRecording((v) => !v)}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/20 py-2.5 text-sm font-medium text-warm-white hover:bg-white/5"
            >
              <Circle size={16} className={recording ? 'fill-red-500 text-red-500' : ''} />
              {recording ? 'Stop Recording' : 'Record'}
            </button>
            <Switch label="Auto Switch" on={autoSwitch} onChange={setAutoSwitch} />
            <Switch label="Preview Mode" on={previewMode} onChange={setPreviewMode} />
          </div>
        </Panel>
      </div>
    </div>
  );
}