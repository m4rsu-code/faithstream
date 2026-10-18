import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Image,
  Mic,
  Monitor,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Settings,
  Square,
  Trash2,
  Type,
  Volume2,
  VolumeX,
  Wifi,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ConfirmationModal from '../components/modal/ConfirmationModal';

/* ---------- Data ---------- */

type Slide = { text: string; ref?: string; bg?: string; bgImage?: string; bgVideo?: string; bgAssetId?: string; dim?: number; textColor?: string; title?: string };

type PresentationTextBox = {
  text: string; font: string; size: number; color: string; bold: boolean; italic: boolean;
  underline: boolean; align: 'left' | 'center' | 'right'; shadow: boolean; boxBg: string;
  boxBgOn: boolean; autoSize: boolean; lineHeight: number; letterSpacing: number;
  x: number; y: number; w: number; h: number;
};
type PresentationPicture = { id: number; src: string; x: number; y: number; w: number; h: number };
type PresentationShape = { id: number; kind: string; x: number; y: number; w: number; h: number; fill: string };
type PresentationDesign = {
  box?: PresentationTextBox | null;
  extraBoxes?: { id: number; box: PresentationTextBox }[];
  pictures?: PresentationPicture[];
  shapes?: PresentationShape[];
};
type StudioSlide = Slide & { design?: PresentationDesign };

type Scene = {
  id: number;
  name: string;
  desc: string;
  bg: string; // tailwind gradient classes (placeholder until real media is wired in)
  slides: StudioSlide[];
  presentationId?: string;
};

type SavedPresentationSlide = {
  id: number;
  title?: string;
  bg?: string;
  dim?: number;
  bgImage?: string;
  bgVideo?: string;
  bgAssetId?: string;
  box?: PresentationTextBox | null;
  extraBoxes?: { id: number; box: PresentationTextBox }[];
  pictures?: PresentationPicture[];
  shapes?: PresentationShape[];
};
type SavedPresentation = { id: string; name: string; slides: SavedPresentationSlide[]; locked?: boolean };
type StudioMedia = { id: string; type: 'image' | 'video'; blob: Blob };
type StudioMusicAsset = { id: string; name: string; blob: Blob; createdAt: number };
type StudioMusicAssetWithUrl = StudioMusicAsset & { url: string };
const STUDIO_SCENES_KEY = 'faithstream.studio-scenes';
const STUDIO_SLIDESHOW_SCENES_KEY = 'faithstream.studio-slideshow-scenes';
const STUDIO_OUTPUT_REF_KEY = 'faithstream.studio-output-ref';
const STUDIO_STREAM_OUTPUT_REF_KEY = 'faithstream.studio-stream-output-ref';
const STUDIO_DISPLAY_MODE_KEY = 'faithstream.studio-display-mode';
const STUDIO_PREVIEW_MODE_KEY = 'faithstream.studio-preview-mode';
const STUDIO_RESOLUTION_KEY = 'faithstream.studio-resolution';
const STUDIO_FRAME_RATE_KEY = 'faithstream.studio-frame-rate';
const STUDIO_BITRATE_KEY = 'faithstream.studio-bitrate';
const STUDIO_SESSION_KEY = 'faithstream.studio-session';
const STUDIO_MUSIC_DB = 'faithstream.studio-music';
const STUDIO_MUSIC_STORE = 'tracks';

const markStartupResourceReady = (resource: 'studio-media' | 'studio-music') => {
  window.dispatchEvent(new CustomEvent('faithstream:startup-resource-ready', { detail: resource }));
};

const loadStudioScenes = (): Scene[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_SCENES_KEY) ?? '[]') as Scene[];
    if (!Array.isArray(saved)) return [];
    const presentations = JSON.parse(localStorage.getItem('faithstream.presentations') ?? '[]') as SavedPresentation[];
    return saved.filter((scene) => Number.isFinite(scene?.id) && scene.name && scene.bg && Array.isArray(scene.slides))
      .filter((scene) => !scene.presentationId || presentations.some((item) => item.id === scene.presentationId))
      .map((scene) => {
      const presentation = presentations.find((item) => item.id === scene.presentationId);
      if (!presentation) return scene;
      return {
        ...scene,
        name: presentation.name || scene.name,
        slides: scene.slides.map((studioSlide, index) => {
          const savedSlide = presentation.slides[index];
          if (!savedSlide) return studioSlide;
          return {
            ...studioSlide,
            title: savedSlide.title || studioSlide.title || `Slide ${index + 1}`,
            ...(!studioSlide.design ? { design: { box: savedSlide.box, extraBoxes: savedSlide.extraBoxes, pictures: savedSlide.pictures, shapes: savedSlide.shapes } } : {}),
          };
        }),
      };
    });
  } catch { return []; }
};

const loadSlideshowScenes = (): Scene[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_SLIDESHOW_SCENES_KEY) ?? 'null') as Scene[] | null;
    if (Array.isArray(saved)) {
      const presentations = readSavedPresentations();
      return saved.filter((scene) => Number.isFinite(scene?.id) && scene.name && scene.bg && Array.isArray(scene.slides))
        .filter((scene) => !scene.presentationId || presentations.some((item) => item.id === scene.presentationId));
    }
  } catch { /* Migrate existing Studio scenes below. */ }
  // Preserve existing projects while giving Slideshow its own editable scene copy.
  return loadStudioScenes().map((scene) => ({ ...scene, slides: scene.slides.map((slide) => ({ ...slide, design: slide.design ? { ...slide.design } : undefined })) }));
};

const readSavedPresentations = (): SavedPresentation[] => {
  try {
    const saved = JSON.parse(localStorage.getItem('faithstream.presentations') ?? '[]') as SavedPresentation[];
    return Array.isArray(saved) ? saved.filter((presentation) => presentation?.id && Array.isArray(presentation.slides)) : [];
  } catch { return []; }
};

const readStudioMedia = async (): Promise<StudioMedia[]> => {
  const request = indexedDB.open('faithstream.media', 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => request.result.createObjectStore('assets', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const query = db.transaction('assets', 'readonly').objectStore('assets').getAll();
    query.onsuccess = () => resolve(query.result as StudioMedia[]);
    query.onerror = () => reject(query.error);
    query.transaction?.addEventListener('complete', () => db.close(), { once: true });
  });
};

const saveStudioMedia = async (asset: StudioMedia) => {
  const request = indexedDB.open('faithstream.media', 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('assets')) request.result.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('assets', 'readwrite');
    transaction.objectStore('assets').put(asset);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

const openStudioMusicDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(STUDIO_MUSIC_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STUDIO_MUSIC_STORE, { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readStudioMusic = async (): Promise<StudioMusicAsset[]> => {
  const db = await openStudioMusicDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STUDIO_MUSIC_STORE, 'readonly');
    const request = transaction.objectStore(STUDIO_MUSIC_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StudioMusicAsset[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
};

const saveStudioMusic = async (asset: StudioMusicAsset) => {
  const db = await openStudioMusicDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STUDIO_MUSIC_STORE, 'readwrite');
    transaction.objectStore(STUDIO_MUSIC_STORE).put(asset);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
};

const deleteStudioMusicAsset = async (id: string) => {
  const db = await openStudioMusicDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STUDIO_MUSIC_STORE, 'readwrite');
    transaction.objectStore(STUDIO_MUSIC_STORE).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
};

type Ref = { sceneId: number; slideIdx: number };

const same = (a: Ref, b: Ref) => a.sceneId === b.sceneId && a.slideIdx === b.slideIdx;

type SourceKind = 'camera' | 'screen' | 'media' | 'presentation' | 'text' | 'microphone' | 'desktop-audio' | 'music';
type Source = {
  id: number;
  sceneId: number;
  shared?: boolean;
  name: string;
  kind: SourceKind;
  visible: boolean;
  stream?: MediaStream;
  deviceId?: string;
  mediaAssetId?: string;
  loop?: boolean;
  text?: string;
  noiseSuppression?: boolean;
  layout?: { x: number; y: number; width: number; height: number };
};
const STUDIO_SOURCES_KEY = 'faithstream.studio-sources';
const SOURCE_OPTIONS: { kind: SourceKind; name: string; icon: LucideIcon; group: string }[] = [
  { kind: 'camera', name: 'Camera', icon: Camera, group: 'Video' },
  { kind: 'screen', name: 'Screen or window', icon: Monitor, group: 'Video' },
  { kind: 'media', name: 'Image or video', icon: Play, group: 'Video' },
  { kind: 'presentation', name: 'Presentation slides', icon: Monitor, group: 'Video' },
  { kind: 'text', name: 'Text overlay', icon: Type, group: 'Overlay' },
  { kind: 'microphone', name: 'Microphone', icon: Mic, group: 'Audio' },
  { kind: 'desktop-audio', name: 'Desktop audio', icon: Volume2, group: 'Audio' },
  { kind: 'music', name: 'Music track', icon: Music2, group: 'Audio' },
];

const loadStudioSources = (): Source[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(STUDIO_SOURCES_KEY) ?? '[]') as Source[];
    if (!Array.isArray(saved)) return [];
    const validSources = saved.filter((source) => Number.isFinite(source?.id) && Number.isFinite(source?.sceneId) && !!source.name && SOURCE_OPTIONS.some((option) => option.kind === source.kind));
    return validSources.map((source) => {
      if (source.kind !== 'camera' || (source.layout && source.layout.width <= 25)) return { ...source, shared: true, stream: undefined };
      const cameraIndex = validSources.filter((item) => item.sceneId === source.sceneId && item.kind === 'camera').findIndex((item) => item.id === source.id);
      return { ...source, shared: true, stream: undefined, layout: { x: 100 - (cameraIndex + 1) * 24, y: 72, width: 22, height: 22 } };
    });
  } catch { return []; }
};

type Channel = { id: number; sceneId: number; name: string; icon: LucideIcon; db: number; muted: boolean };

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

function ProgramTextBox({ box }: { box: PresentationTextBox }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      if (!wrap.current || !inner.current || !box.autoSize || !inner.current.offsetHeight) {
        setFitScale(1);
        return;
      }
      setFitScale(Math.min(1, wrap.current.clientHeight / inner.current.offsetHeight));
    };
    fit();
    const observer = new ResizeObserver(fit);
    if (wrap.current) observer.observe(wrap.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [box]);
  return (
    <div ref={wrap} className="absolute flex items-center overflow-hidden" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, background: box.boxBgOn ? box.boxBg : undefined, borderRadius: '1cqw' }}>
      <div ref={inner} className="w-full whitespace-pre-wrap break-words" style={{ textAlign: box.align, transform: `scale(${fitScale})`, transformOrigin: 'center', lineHeight: box.lineHeight, letterSpacing: `${(box.letterSpacing / 1280) * 100}cqw` }}>
        <div className="whitespace-pre-wrap" style={{ fontFamily: `"${box.font.replaceAll('"', '')}", sans-serif`, fontSize: `${(box.size / 1280) * 100}cqw`, fontWeight: box.bold ? 800 : 500, fontStyle: box.italic ? 'italic' : 'normal', textDecoration: box.underline ? 'underline' : 'none', color: box.color, textShadow: box.shadow ? '0 0.3cqw 1.2cqw rgba(0,0,0,0.65)' : undefined }}>{box.text}</div>
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
  maxRem = 2.25,
}: {
  bg: string;
  slide?: StudioSlide;
  scale?: number;
  minRem?: number;
  maxRem?: number;
}) {
  if (slide?.design) {
    const boxes = [slide.design.box, ...(slide.design.extraBoxes ?? []).map((item) => item.box)]
      .filter((box): box is PresentationTextBox => !!box);
    return (
      <div className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${slide.bg ?? bg}`} style={{ containerType: 'inline-size' }}>
        {slide.bgImage && <img src={slide.bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {slide.bgVideo && <video src={slide.bgVideo} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-black" style={{ opacity: (slide.dim ?? 0) / 100 }} />
        {slide.design.pictures?.map((picture) => <img key={picture.id} src={picture.src} alt="" draggable={false} className="absolute object-contain" style={{ left: `${picture.x}%`, top: `${picture.y}%`, width: `${picture.w}%`, height: `${picture.h}%` }} />)}
        {slide.design.shapes?.map((shape) => <div key={shape.id} className="absolute" style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.w}%`, height: `${shape.h}%`, backgroundColor: shape.fill, borderRadius: shape.kind === 'circle' ? '50%' : undefined, clipPath: shape.kind === 'triangle' ? 'polygon(50% 0, 0 100%, 100% 100%)' : shape.kind === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 93%, 50% 72%, 21% 93%, 32% 57%, 2% 35%, 39% 35%)' : shape.kind === 'arrow' ? 'polygon(0 30%, 65% 30%, 65% 0, 100% 50%, 65% 100%, 65% 70%, 0 70%)' : undefined }} />)}
        {boxes.map((box, index) => <ProgramTextBox key={index} box={box} />)}
      </div>
    );
  }
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br p-2 text-center text-white ${slide?.bg ?? bg}`}
      style={slide?.bgImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,${(slide.dim ?? 20) / 100}), rgba(0,0,0,${(slide.dim ?? 20) / 100})), url("${slide.bgImage}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
    >
      {slide?.bgVideo && <video src={slide.bgVideo} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />}
      {slide?.bgVideo && <div className="absolute inset-0 bg-black/20" />}
      {slide && scale && (
        <div className="relative z-10" style={{ fontSize: `clamp(${minRem}rem, ${scale}cqw, ${maxRem}rem)`, color: slide.textColor ?? '#fff' }}>
          <p className="whitespace-pre-line font-bold leading-snug drop-shadow">{slide.text}</p>
          {slide.ref && <p className="mt-1 text-[0.6em] opacity-90">{slide.ref}</p>}
        </div>
      )}
    </div>
  );
}

function SourcePreview({
  source,
  media,
  slide,
  bg,
  showLabel = true,
  className = 'aspect-video',
}: {
  source: Source;
  media?: { type: 'image' | 'video'; url: string };
  slide: StudioSlide;
  bg: string;
  showLabel?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current && source.stream) videoRef.current.srcObject = source.stream;
  }, [source.stream]);

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-lg bg-slate-950 ${className}`}>
      {(source.kind === 'camera' || source.kind === 'screen') && source.stream?.getVideoTracks().length ? (
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
      ) : source.kind === 'media' && media?.type === 'video' ? (
        <video src={media.url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
      ) : source.kind === 'media' && media?.type === 'image' ? (
        <img src={media.url} alt={source.name} className="h-full w-full object-cover" />
      ) : source.kind === 'presentation' ? (
        <SlideView bg={bg} slide={slide} scale={8} minRem={0.5} />
      ) : source.kind === 'text' ? (
        <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950 p-3 text-center text-sm font-semibold text-white">{source.text || 'Text overlay'}</div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-800 to-slate-950 text-xs text-warm-white/65">
          {source.kind === 'media' ? <Image size={18} /> : source.kind === 'camera' ? <Camera size={18} /> : <Monitor size={18} />}
          <span>{source.kind === 'media' ? 'Media unavailable' : 'Reconnect this source'}</span>
        </div>
      )}
      {showLabel && <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">{source.name}</span>}
    </div>
  );
}

function AudioChannelMeter({
  stream,
  db,
  muted,
  enabled,
  onLevel,
}: {
  stream?: MediaStream;
  db: number;
  muted: boolean;
  enabled: boolean;
  onLevel: (level: number) => void;
}) {
  const [level, setLevel] = useState(0);
  const [contextState, setContextState] = useState<AudioContextState | 'unavailable'>('closed');
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;

  useEffect(() => {
    const tracks = stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
    if (!tracks.length) {
      setLevel(0);
      setContextState('closed');
      onLevelRef.current(0);
      return;
    }

    let context: AudioContext;
    let input: MediaStreamAudioSourceNode;
    let gain: GainNode;
    let analyser: AnalyserNode;
    let output: MediaStreamAudioDestinationNode;
    try {
      context = new AudioContext();
      input = context.createMediaStreamSource(new MediaStream(tracks));
      gain = context.createGain();
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      output = context.createMediaStreamDestination();
      input.connect(gain);
      gain.connect(analyser);
      analyser.connect(output);
      contextRef.current = context;
      gainRef.current = gain;
      setContextState(context.state);
      context.onstatechange = () => setContextState(context.state);
      void context.resume().catch(() => setContextState('suspended'));
    } catch {
      setContextState('unavailable');
      onLevelRef.current(0);
      return;
    }

    const samples = new Float32Array(analyser.fftSize);
    let frame = 0;
    let lastUpdate = 0;
    const readLevel = (time: number) => {
      analyser.getFloatTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) total += sample * sample;
      const rms = Math.sqrt(total / samples.length);
      if (time - lastUpdate >= 100) {
        const visibleLevel = rms;
        setLevel(visibleLevel);
        onLevelRef.current(visibleLevel);
        lastUpdate = time;
      }
      frame = requestAnimationFrame(readLevel);
    };
    frame = requestAnimationFrame(readLevel);

    return () => {
      cancelAnimationFrame(frame);
      input.disconnect();
      gain.disconnect();
      analyser.disconnect();
      context.onstatechange = null;
      contextRef.current = null;
      gainRef.current = null;
      void context.close();
    };
  }, [stream]);

  useEffect(() => {
    const gain = gainRef.current;
    if (!gain) return;
    const target = muted || !enabled ? 0 : 10 ** (db / 20);
    gain.gain.setTargetAtTime(target, gain.context.currentTime, 0.02);
  }, [db, muted, enabled, stream]);

  const active = level > 0.002;
  const hasAudio = !!stream?.getAudioTracks().some((track) => track.readyState === 'live');
  const status = !hasAudio ? 'Disconnected' : muted || !enabled ? 'Muted' : contextState === 'suspended' ? 'Click to enable' : contextState === 'unavailable' ? 'Unavailable' : active ? 'Signal' : 'No signal';
  const dbLevel = level > 0 ? Math.max(0, Math.min(100, ((20 * Math.log10(level) + 60) / 60) * 100)) : 0;
  return (
    <button type="button" disabled={!stream || contextState !== 'suspended'} onClick={() => { void contextRef.current?.resume().then(() => setContextState(contextRef.current?.state ?? 'running')); }} className="mt-1 flex w-full items-center gap-1.5 text-left disabled:cursor-default" title="Live input level after the volume control">
      <span className="w-[4.5rem] shrink-0 truncate text-[9px] text-warm-white/50">{status}</span>
      <span className="flex h-2 flex-1 gap-px overflow-hidden rounded-sm bg-white/5" aria-label={`${status}, ${dbLevel.toFixed(0)} percent`}>
        {Array.from({ length: 18 }, (_, index) => {
          const lit = dbLevel >= ((index + 1) / 18) * 100;
          const color = index >= 15 ? 'bg-red-400' : index >= 12 ? 'bg-yellow-400' : 'bg-emerald-400';
          return <span key={index} className={`min-w-0 flex-1 ${lit ? color : 'bg-white/10'}`} />;
        })}
      </span>
    </button>
  );
}

function MonitorAudioTrack({ stream, enabled, volume }: { stream?: MediaStream; enabled: boolean; volume: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    const tracks = stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
    element.srcObject = tracks.length ? new MediaStream(tracks) : null;
  }, [stream]);
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, volume));
    element.muted = !enabled;
    if (enabled) void element.play().catch(() => {});
    else element.pause();
  }, [enabled, volume, stream]);
  return <audio ref={audioRef} autoPlay className="hidden" />;
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
  const [scenes, setScenes] = useState<Scene[]>(loadStudioScenes);
  const [slideshowScenes, setSlideshowScenes] = useState<Scene[]>(loadSlideshowScenes);
  const [savedPresentations, setSavedPresentations] = useState<SavedPresentation[]>([]);
  const [mediaUrls, setMediaUrls] = useState<Record<string, { type: 'image' | 'video'; url: string }>>({});
  const [addSceneOpen, setAddSceneOpen] = useState(false);
  const [selectedPresentationId, setSelectedPresentationId] = useState('');
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [sceneDeleteTab, setSceneDeleteTab] = useState<'stream' | 'slideshow'>('stream');
  const [addSceneTab, setAddSceneTab] = useState<'stream' | 'slideshow'>('stream');
  const [sceneId, setSceneId] = useState(() => scenes[0]?.id ?? 0); // scene whose slides are listed (Scenes panel)
  const [sidebarPanel, setSidebarPanel] = useState<'scenes' | 'music'>('scenes');
  const [selected, setSelected] = useState<Ref>(() => ({ sceneId: scenes[0]?.id ?? 0, slideIdx: 0 }));
  const slideCardRefs = useRef(new Map<string, HTMLDivElement>());
  const [preview, setPreview] = useState<Ref>(() => ({ sceneId: scenes[0]?.id ?? 0, slideIdx: 0 }));
  const [onAir, setOnAir] = useState<Ref>(() => ({ sceneId: scenes[0]?.id ?? 0, slideIdx: 0 }));

  const [transition, setTransition] = useState('Fade');
  const [duration, setDuration] = useState('1.0s');
  const onAirSlideRef = useRef<HTMLDivElement>(null);
  const transitionSettings = useRef({ transition, duration });

  useEffect(() => {
    transitionSettings.current = { transition, duration };
  }, [transition, duration]);

  useEffect(() => {
    const element = onAirSlideRef.current;
    const settings = transitionSettings.current;
    if (!element || settings.transition === 'Cut') return;
    const durationMs = Number.parseFloat(settings.duration) * 1000 || 1000;
    const frames: Keyframe[] = settings.transition === 'Slide'
      ? [
          { opacity: 0, transform: 'translateX(5%)' },
          { opacity: 1, transform: 'translateX(0)' },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
    const animation = element.animate(frames, { duration: durationMs, easing: 'ease-out' });
    return () => animation.cancel();
  }, [onAir.sceneId, onAir.slideIdx]);

  const [sources, setSources] = useState<Source[]>(loadStudioSources);
  const [musicAssets, setMusicAssets] = useState<StudioMusicAssetWithUrl[]>([]);
  const [musicPlaying, setMusicPlaying] = useState<Record<number, boolean>>({});
  const [previewingMusicId, setPreviewingMusicId] = useState<string | null>(null);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [audioError, setAudioError] = useState('');
  const [sourceEditor, setSourceEditor] = useState<Source | null>(null);
  const [sourceDraft, setSourceDraft] = useState('');
  const [selectedProgramSource, setSelectedProgramSource] = useState<number | null>(null);
  const [previewSetupLayouts, setPreviewSetupLayouts] = useState<Record<number, NonNullable<Source['layout']>>>({});
  const [cameraOnlySnapshot, setCameraOnlySnapshot] = useState<{ sceneId: number; sources: { id: number; visible: boolean; layout?: Source['layout'] }[] } | null>(null);
  const programCanvasRef = useRef<HTMLDivElement>(null);
  const previewSetupCanvasRef = useRef<HTMLDivElement>(null);
  const previewSetupDrag = useRef<{ id: number; mode: 'move' | 'resize'; startX: number; startY: number; layout: { x: number; y: number; width: number; height: number } } | null>(null);
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);
  const musicElements = useRef(new Map<number, HTMLAudioElement>());
  const musicStreams = useRef(new Map<number, MediaStream>());
  const musicPreviewElement = useRef<HTMLAudioElement | null>(null);
  const sourceStreams = useRef(new Map<number, MediaStream>());
  const sourceObjectUrls = useRef<string[]>([]);
  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);
  const [channels, setChannels] = useState<Channel[]>(() => sources
    .filter((source) => source.kind === 'microphone' || source.kind === 'desktop-audio' || source.kind === 'music')
    .map((source) => ({ id: source.id, sceneId: source.sceneId, name: source.name, icon: source.kind === 'microphone' ? Mic : source.kind === 'music' ? Music2 : Volume2, db: -6, muted: false })));
  const [audioLevels, setAudioLevels] = useState<Record<number, number>>({});

  const [live, setLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [goLiveSetupOpen, setGoLiveSetupOpen] = useState(false);
  const [streamResolution, setStreamResolution] = useState(() => localStorage.getItem(STUDIO_RESOLUTION_KEY) || '1080p');
  const [streamFrameRate, setStreamFrameRate] = useState(() => localStorage.getItem(STUDIO_FRAME_RATE_KEY) || '30');
  const [streamBitrate, setStreamBitrate] = useState(() => localStorage.getItem(STUDIO_BITRATE_KEY) || '6000');
  const [streamServerUrl, setStreamServerUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'live' | 'stopping' | 'stopped' | 'error'>('idle');
  const studioSessionStartedAt = useRef<number | null>(null);
  const [streamMessage, setStreamMessage] = useState('');
  const [streamConnectError, setStreamConnectError] = useState('');
  const [audioMonitor, setAudioMonitor] = useState(false);
  const liveAudioContext = useRef<AudioContext | null>(null);
  const liveAudioRecorder = useRef<MediaRecorder | null>(null);
  const liveAudioDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
  const liveAudioInputs = useRef(new Map<number, MediaStreamAudioSourceNode>());
  const liveAudioGains = useRef(new Map<number, GainNode>());
  const recordingAudioContext = useRef<AudioContext | null>(null);
  const recordingAudioRecorder = useRef<MediaRecorder | null>(null);
  const recordingAudioDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingAudioInputs = useRef(new Map<number, MediaStreamAudioSourceNode>());
  const recordingAudioGains = useRef(new Map<number, GainNode>());
  const [previewMode, setPreviewMode] = useState(() => localStorage.getItem(STUDIO_PREVIEW_MODE_KEY) !== 'false');
  const [studioOutputTab, setStudioOutputTab] = useState<'slideshow' | 'stream'>('stream');
  const [offlineSlide, setOfflineSlide] = useState<Ref>(() => ({ sceneId: slideshowScenes[0]?.id ?? 0, slideIdx: 0 }));
  const [offlineEditing, setOfflineEditing] = useState(false);
  const [offlineTextDraft, setOfflineTextDraft] = useState('');
  const [offlineRefDraft, setOfflineRefDraft] = useState('');
  const [offlineBoxDrafts, setOfflineBoxDrafts] = useState<Record<string, string>>({});
  const [studioDisplays, setStudioDisplays] = useState<{ id: number; name: string; primary: boolean }[]>([]);
  const [targetDisplayId, setTargetDisplayId] = useState<number | null>(null);
  const [displayError, setDisplayError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEndStream, setConfirmEndStream] = useState(() => localStorage.getItem('faithstream.studio-confirm-end') !== 'false');
  const [endStreamConfirmOpen, setEndStreamConfirmOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_PREVIEW_MODE_KEY, String(previewMode)); } catch { /* Keep the current Studio mode if storage is unavailable. */ }
  }, [previewMode]);
  useEffect(() => {
    try {
      localStorage.setItem(STUDIO_RESOLUTION_KEY, streamResolution);
      localStorage.setItem(STUDIO_FRAME_RATE_KEY, streamFrameRate);
      localStorage.setItem(STUDIO_BITRATE_KEY, streamBitrate);
    } catch { /* Keep the current stream settings if storage is unavailable. */ }
  }, [streamResolution, streamFrameRate, streamBitrate]);

  useEffect(() => {
    const active = live || recording;
    if (active && studioSessionStartedAt.current === null) studioSessionStartedAt.current = Date.now();
    if (!active) studioSessionStartedAt.current = null;
    const session = { live, recording, streamStatus, startedAt: studioSessionStartedAt.current };
    try { localStorage.setItem(STUDIO_SESSION_KEY, JSON.stringify(session)); } catch { /* Keep the live controls usable if storage is unavailable. */ }
    window.dispatchEvent(new CustomEvent('faithstream:studio-session', { detail: session }));
  }, [live, recording, streamStatus]);

  const [editing, setEditing] = useState(false); // editing the slide that is in Preview
  const [draftText, setDraftText] = useState('');
  const [draftRef, setDraftRef] = useState('');

  useEffect(() => {
    const storedScenes = scenes.map((scene) => ({
      ...scene,
      slides: scene.slides.map((slide) => slide.bgAssetId ? { ...slide, bgImage: undefined, bgVideo: undefined } : slide),
    }));
    try { localStorage.setItem(STUDIO_SCENES_KEY, JSON.stringify(storedScenes)); } catch { /* Keep the active Studio session usable if storage is unavailable. */ }
  }, [scenes]);

  useEffect(() => {
    const storedScenes = slideshowScenes.map((scene) => ({
      ...scene,
      slides: scene.slides.map((slide) => slide.bgAssetId ? { ...slide, bgImage: undefined, bgVideo: undefined } : slide),
    }));
    try { localStorage.setItem(STUDIO_SLIDESHOW_SCENES_KEY, JSON.stringify(storedScenes)); } catch { /* Keep the slideshow session usable if storage is unavailable. */ }
  }, [slideshowScenes]);

  useEffect(() => {
    const refreshLinkedPresentationTitles = () => {
      const presentations = readSavedPresentations();
      const byId = new Map(presentations.map((presentation) => [presentation.id, presentation]));
      const refresh = (current: Scene[]) => current.filter((scene) => !scene.presentationId || byId.has(scene.presentationId)).map((scene) => {
        const presentation = scene.presentationId ? byId.get(scene.presentationId) : undefined;
        if (!presentation) return scene;
        return {
          ...scene,
          name: presentation.name || scene.name,
          slides: scene.slides.map((slide, index) => {
            const savedSlide = presentation.slides[index];
            return savedSlide ? { ...slide, title: savedSlide.title || slide.title || `Slide ${index + 1}` } : slide;
          }),
        };
      });
      setScenes(refresh);
      setSlideshowScenes(refresh);
    };
    const onPresentationsStorage = (event: StorageEvent) => {
      if (event.key === 'faithstream.presentations') refreshLinkedPresentationTitles();
    };
    window.addEventListener('faithstream:presentations-updated', refreshLinkedPresentationTitles);
    window.addEventListener('storage', onPresentationsStorage);
    return () => {
      window.removeEventListener('faithstream:presentations-updated', refreshLinkedPresentationTitles);
      window.removeEventListener('storage', onPresentationsStorage);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_OUTPUT_REF_KEY, JSON.stringify(offlineSlide)); } catch { /* Output window can still follow the current Studio session. */ }
  }, [offlineSlide]);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_STREAM_OUTPUT_REF_KEY, JSON.stringify(onAir)); } catch { /* Keep stream monitor output in sync when storage is unavailable. */ }
  }, [onAir]);

  useEffect(() => {
    let active = true;
    void window.faithstreamWindow?.getStudioDisplays().then((displays) => {
      if (!active) return;
      setStudioDisplays(displays.map(({ id, name, primary }) => ({ id, name, primary })));
      setTargetDisplayId((current) => current ?? displays.find((display) => !display.primary)?.id ?? displays[0]?.id ?? null);
    }).catch(() => {
      if (active) setDisplayError('Could not read the connected monitors.');
    });
    const onOutputChange = (event: StorageEvent) => {
      if (!event.newValue) return;
      try {
        const next = JSON.parse(event.newValue) as Ref;
        if (!Number.isFinite(next.sceneId) || !Number.isFinite(next.slideIdx)) return;
        if (event.key === STUDIO_OUTPUT_REF_KEY) setOfflineSlide(next);
        if (event.key === STUDIO_STREAM_OUTPUT_REF_KEY) setOnAir(next);
      } catch { /* Ignore an incomplete update from the projector window. */ }
    };
    window.addEventListener('storage', onOutputChange);
    return () => {
      active = false;
      window.removeEventListener('storage', onOutputChange);
    };
  }, []);

  useEffect(() => {
    return window.faithstreamWindow?.onStreamStatus((event) => {
      const status = event.status as typeof streamStatus;
      setStreamStatus(status);
      setStreamMessage(event.message ?? '');
      if (status === 'error' || status === 'stopped') {
        setLive(false);
        if (liveAudioRecorder.current?.state !== 'inactive') liveAudioRecorder.current?.stop();
        liveAudioRecorder.current = null;
        void liveAudioContext.current?.close();
        liveAudioContext.current = null;
        liveAudioDestination.current = null;
        liveAudioInputs.current.forEach((input) => input.disconnect());
        liveAudioInputs.current.clear();
        liveAudioGains.current.clear();
      }
    });
  }, []);

  useEffect(() => {
    const subscribe = window.faithstreamWindow?.onRecordingStatus;
    if (!subscribe) return;
    return subscribe((event) => {
      if (event.status === 'saved') {
        setRecording(false);
      } else if (event.status === 'error') {
        setRecording(false);
        const recorder = recordingAudioRecorder.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      }
    });
  }, []);

  useEffect(() => {
    const context = liveAudioContext.current;
    const destination = liveAudioDestination.current;
    if (!context || !destination) return;
    const activeIds = new Set(mixerChannels.map((channel) => channel.id));
    liveAudioInputs.current.forEach((input, id) => {
      if (activeIds.has(id)) return;
      input.disconnect();
      liveAudioGains.current.get(id)?.disconnect();
      liveAudioInputs.current.delete(id);
      liveAudioGains.current.delete(id);
    });
    mixerChannels.forEach((channel) => {
      const source = sources.find((item) => item.id === channel.id);
      if (!liveAudioGains.current.has(channel.id)) {
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (tracks.length) {
          const input = context.createMediaStreamSource(new MediaStream(tracks));
          const newGain = context.createGain();
          input.connect(newGain).connect(destination);
          liveAudioInputs.current.set(channel.id, input);
          liveAudioGains.current.set(channel.id, newGain);
        }
      }
      const gain = liveAudioGains.current.get(channel.id);
      if (!gain) return;
      const value = source?.visible && !channel.muted ? 10 ** (channel.db / 20) : 0;
      gain.gain.setTargetAtTime(value, context.currentTime, 0.025);
    });
  }, [channels, sources, onAir.sceneId]);

  useEffect(() => {
    const context = recordingAudioContext.current;
    const destination = recordingAudioDestination.current;
    if (!context || !destination || !recordingAudioRecorder.current || recordingAudioRecorder.current.state === 'inactive') return;
    const activeIds = new Set(mixerChannels.map((channel) => channel.id));
    recordingAudioInputs.current.forEach((input, id) => {
      if (activeIds.has(id)) return;
      input.disconnect();
      recordingAudioGains.current.get(id)?.disconnect();
      recordingAudioInputs.current.delete(id);
      recordingAudioGains.current.delete(id);
    });
    mixerChannels.forEach((channel) => {
      const source = sources.find((item) => item.id === channel.id);
      if (!recordingAudioGains.current.has(channel.id)) {
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (tracks.length) {
          const input = context.createMediaStreamSource(new MediaStream(tracks));
          const gain = context.createGain();
          input.connect(gain).connect(destination);
          recordingAudioInputs.current.set(channel.id, input);
          recordingAudioGains.current.set(channel.id, gain);
        }
      }
      const gain = recordingAudioGains.current.get(channel.id);
      if (!gain) return;
      gain.gain.setTargetAtTime(source?.visible && !channel.muted ? 10 ** (channel.db / 20) : 0, context.currentTime, 0.025);
    });
  }, [channels, sources, onAir.sceneId]);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_SOURCES_KEY, JSON.stringify(sources.map(({ stream: _stream, ...source }) => source))); } catch { /* Keep the current source list usable if storage is unavailable. */ }
  }, [sources]);

  useEffect(() => () => {
    sourceStreams.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    musicElements.current.forEach((audio) => audio.pause());
    musicPreviewElement.current?.pause();
    sourceObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => {
    if (!addSourceOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!sourceMenuRef.current?.contains(target) && !sourceTriggerRef.current?.contains(target)) {
        setAddSourceOpen(false);
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [addSourceOpen]);

  useEffect(() => {
    if (selectedProgramSource === null) return;
    const clearSelectionOutsideOutput = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (programCanvasRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-program-layout-controls]')) return;
      setSelectedProgramSource(null);
    };
    document.addEventListener('pointerdown', clearSelectionOutsideOutput);
    return () => document.removeEventListener('pointerdown', clearSelectionOutsideOutput);
  }, [selectedProgramSource]);

  useEffect(() => {
    let urls: string[] = [];
    let cancelled = false;
    readStudioMedia().then((assets) => {
      const entries = assets.map((asset) => {
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        return [asset.id, { type: asset.type, url }] as const;
      });
      if (cancelled) { urls.forEach(URL.revokeObjectURL); return; }
      const loadedUrls = Object.fromEntries(entries) as Record<string, { type: 'image' | 'video'; url: string }>;
      setMediaUrls(loadedUrls);
      setScenes((current) => current.map((scene) => ({
        ...scene,
        slides: scene.slides.map((slide) => {
          const asset = slide.bgAssetId ? loadedUrls[slide.bgAssetId] : undefined;
          return asset ? { ...slide, bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined } : slide;
        }),
      })));
      setSlideshowScenes((current) => current.map((scene) => ({
        ...scene,
        slides: scene.slides.map((slide) => {
          const asset = slide.bgAssetId ? loadedUrls[slide.bgAssetId] : undefined;
          return asset ? { ...slide, bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined } : slide;
        }),
      })));
      markStartupResourceReady('studio-media');
    }).catch(() => {
      if (!cancelled) markStartupResourceReady('studio-media');
      /* Scenes can still use presentation slides without local media. */
    });
    return () => { cancelled = true; urls.forEach(URL.revokeObjectURL); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    void readStudioMusic().then((assets) => {
      const loaded = assets.map((asset) => {
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        return { ...asset, url };
      });
      if (cancelled) { urls.forEach(URL.revokeObjectURL); return; }
      sourceObjectUrls.current.push(...urls);
      setMusicAssets(loaded);
      markStartupResourceReady('studio-music');
    }).catch(() => {
      if (!cancelled) markStartupResourceReady('studio-music');
      if (!cancelled) setSourceError('Could not load saved music tracks.');
    });
    return () => { cancelled = true; urls.forEach(URL.revokeObjectURL); };
  }, []);

  const beginAddScene = () => {
    const available = readSavedPresentations();
    setAddSceneTab(studioOutputTab);
    setSavedPresentations(available);
    setSelectedPresentationId(available[0]?.id ?? '');
    setAddSceneOpen(true);
  };

  const makePresentationScene = (presentation: SavedPresentation, id: number): Scene => {
    const importedSlides: StudioSlide[] = presentation.slides.map((slide) => {
      const asset = slide.bgAssetId ? mediaUrls[slide.bgAssetId] : undefined;
      const textParts = [slide.box?.text, ...(slide.extraBoxes ?? []).map((item) => item.box?.text)]
        .filter((text): text is string => !!text?.trim());
      return {
        title: slide.title,
        text: textParts.join('\n') || slide.title || '',
        bg: slide.bg ?? 'from-slate-600 to-slate-950',
        bgAssetId: slide.bgAssetId,
        bgImage: asset?.type === 'image' ? asset.url : slide.bgAssetId ? undefined : slide.bgImage,
        bgVideo: asset?.type === 'video' ? asset.url : slide.bgAssetId ? undefined : slide.bgVideo,
        dim: slide.dim,
        textColor: slide.box?.color,
        design: { box: slide.box, extraBoxes: slide.extraBoxes, pictures: slide.pictures, shapes: slide.shapes },
      };
    });
    return {
      id,
      name: presentation.name,
      desc: `${importedSlides.length} presentation slides`,
      bg: importedSlides[0]?.bg ?? 'from-slate-600 to-slate-950',
      slides: importedSlides,
      presentationId: presentation.id,
    };
  };

  const addAllPresentationScenes = (destinationTab: 'stream' | 'slideshow' = studioOutputTab) => {
    const destinationScenes = destinationTab === 'slideshow' ? slideshowScenes : scenes;
    const existingPresentationIds = new Set(destinationScenes.map((scene) => scene.presentationId).filter(Boolean));
    const presentationsToAdd = readSavedPresentations().filter((presentation) => presentation.slides.length > 0 && !existingPresentationIds.has(presentation.id));
    if (!presentationsToAdd.length) {
      setAddSceneOpen(false);
      return;
    }
    let nextId = Math.max(0, ...destinationScenes.map((scene) => scene.id)) + 1;
    const newScenes = presentationsToAdd.map((presentation) => makePresentationScene(presentation, nextId++));
    if (destinationTab === 'slideshow') {
      setSlideshowScenes((current) => [...current, ...newScenes]);
      setOfflineSlide({ sceneId: newScenes[0].id, slideIdx: 0 });
    } else {
      setScenes((current) => [...current, ...newScenes]);
      setSceneId(newScenes[0].id);
      setSelected({ sceneId: newScenes[0].id, slideIdx: 0 });
      setPreview({ sceneId: newScenes[0].id, slideIdx: 0 });
      if (!previewMode) setOnAir({ sceneId: newScenes[0].id, slideIdx: 0 });
    }
    setAddSceneOpen(false);
  };

  const addPresentationScene = () => {
    const presentation = savedPresentations.find((item) => item.id === selectedPresentationId);
    if (!presentation || presentation.slides.length === 0) return;
    const destinationScenes = addSceneTab === 'slideshow' ? slideshowScenes : scenes;
    const id = Math.max(0, ...destinationScenes.map((item) => item.id)) + 1;
    const newScene = makePresentationScene(presentation, id);
    if (addSceneTab === 'slideshow') {
      setSlideshowScenes((current) => [...current, newScene]);
      setOfflineSlide({ sceneId: id, slideIdx: 0 });
    } else {
      setScenes((current) => [...current, newScene]);
      setSceneId(id);
      setSelected({ sceneId: id, slideIdx: 0 });
      setPreview({ sceneId: id, slideIdx: 0 });
      if (!previewMode) setOnAir({ sceneId: id, slideIdx: 0 });
    }
    setAddSceneOpen(false);
  };

  const removeSlideshowScene = (scene: Scene) => {
    const fallback = slideshowScenes.find((item) => item.id !== scene.id);
    const fallbackRef = { sceneId: fallback?.id ?? 0, slideIdx: 0 };
    setSlideshowScenes((current) => current.filter((item) => item.id !== scene.id));
    if (offlineSlide.sceneId === scene.id) setOfflineSlide(fallbackRef);
    setSceneToDelete(null);
  };

  const askDeleteScene = (scene: Scene, tab: 'stream' | 'slideshow') => {
    setSceneDeleteTab(tab);
    setSceneToDelete(scene);
  };

  const removeScene = (scene: Scene) => {
    const fallback = scenes.find((item) => item.id !== scene.id);
    const fallbackRef = { sceneId: fallback?.id ?? 0, slideIdx: 0 };
    setScenes((current) => current.filter((item) => item.id !== scene.id));
    sources.filter((source) => source.sceneId === scene.id && !source.shared).forEach((source) => {
      sourceStreams.current.get(source.id)?.getTracks().forEach((track) => track.stop());
      sourceStreams.current.delete(source.id);
    });
    setSources((current) => current
      .filter((source) => source.sceneId !== scene.id || source.shared)
      .map((source) => source.sceneId === scene.id && source.shared
        ? { ...source, sceneId: fallback?.id ?? 0 }
        : source));
    setChannels((current) => current
      .filter((channel) => channel.sceneId !== scene.id || sources.some((source) => source.id === channel.id && source.shared))
      .map((channel) => channel.sceneId === scene.id && sources.some((source) => source.id === channel.id && source.shared)
        ? { ...channel, sceneId: fallback?.id ?? 0 }
        : channel));
    if (sceneId === scene.id) {
      setSceneId(fallback?.id ?? 0);
      setSelected(fallbackRef);
    } else if (selected.sceneId === scene.id) setSelected(fallbackRef);
    if (preview.sceneId === scene.id) setPreview(fallbackRef);
    if (onAir.sceneId === scene.id) setOnAir(fallbackRef);
    setSceneToDelete(null);
  };

  const emptyScene: Scene = { id: 0, name: 'No scene selected', desc: '', bg: 'from-slate-700 to-slate-950', slides: [] };
  const resolve = (r: Ref) => {
    const sc = scenes.find((x) => x.id === r.sceneId) ?? emptyScene;
    const slide: StudioSlide = sc.slides[r.slideIdx] ?? { text: 'Add a presentation to create a scene' };
    return { bg: sc.bg, slide };
  };

  const offlineScene = slideshowScenes.find((item) => item.id === offlineSlide.sceneId) ?? emptyScene;
  const offlineCurrent = (() => {
    const sc = offlineScene;
    const slide = sc.slides[offlineSlide.slideIdx] ?? { text: 'Add a presentation to create a scene' };
    return { bg: sc.bg, slide };
  })();
  const setOfflineScene = (id: number) => {
    const target = { sceneId: id, slideIdx: 0 };
    setOfflineSlide(target);
    setOfflineEditing(false);
  };
  const startOfflineEdit = () => {
    const slide = offlineCurrent.slide;
    const boxes: Record<string, string> = {};
    if (slide.design?.box) boxes.main = slide.design.box.text;
    slide.design?.extraBoxes?.forEach((item) => { boxes[`extra-${item.id}`] = item.box.text; });
    setOfflineTextDraft(slide.text ?? '');
    setOfflineRefDraft(slide.ref ?? '');
    setOfflineBoxDrafts(boxes);
    setOfflineEditing(true);
  };
  const saveOfflineEdit = () => {
    setSlideshowScenes((current) => current.map((item) => item.id !== offlineSlide.sceneId ? item : {
      ...item,
      slides: item.slides.map((slide, index) => {
        if (index !== offlineSlide.slideIdx) return slide;
        if (!slide.design) return { ...slide, text: offlineTextDraft, ref: offlineRefDraft || undefined };
        return {
          ...slide,
          text: offlineTextDraft,
          ref: offlineRefDraft || undefined,
          design: {
            ...slide.design,
            box: slide.design.box ? { ...slide.design.box, text: offlineBoxDrafts.main ?? slide.design.box.text } : slide.design.box,
            extraBoxes: slide.design.extraBoxes?.map((box) => ({
              ...box,
              box: { ...box.box, text: offlineBoxDrafts[`extra-${box.id}`] ?? box.box.text },
            })),
          },
        };
      }),
    }));
    setOfflineEditing(false);
  };
  const openOfflineDisplay = async () => {
    if (targetDisplayId === null) {
      setDisplayError('Choose a connected monitor first.');
      return;
    }
    try { localStorage.setItem(STUDIO_DISPLAY_MODE_KEY, 'slideshow'); } catch { /* Keep the selected display usable if storage is unavailable. */ }
    const result = await window.faithstreamWindow?.openStudioDisplay(targetDisplayId);
    if (!result?.ok) setDisplayError(result?.message ?? 'Could not open the slideshow on that monitor.');
    else setDisplayError('');
  };
  const openStreamDisplay = async () => {
    if (targetDisplayId === null) {
      setDisplayError('Choose a connected monitor first.');
      return;
    }
    try {
      localStorage.setItem(STUDIO_STREAM_OUTPUT_REF_KEY, JSON.stringify(onAir));
      localStorage.setItem(STUDIO_DISPLAY_MODE_KEY, 'stream');
    } catch { /* Keep the selected display usable if storage is unavailable. */ }
    const result = await window.faithstreamWindow?.openStudioDisplay(targetDisplayId);
    if (!result?.ok) setDisplayError(result?.message ?? 'Could not open the stream slide on that monitor.');
    else setDisplayError('');
  };
  const stepOfflineSlide = (direction: -1 | 1) => {
    const count = offlineScene.slides.length;
    if (count < 1) return;
    const nextIndex = (offlineSlide.slideIdx + direction + count) % count;
    const target = { ...offlineSlide, slideIdx: nextIndex };
    setOfflineSlide(target);
    setOfflineEditing(false);
  };

  const scene = scenes.find((x) => x.id === sceneId) ?? emptyScene;
  const staged = resolve(selected);
  const previewed = resolve(preview);
  const previewSetupRef = previewMode ? preview : selected;
  const previewSetupSlide = resolve(previewSetupRef);
  const airing = resolve(onAir);
  // Keep sources available when switching slides/scenes, like reusable OBS sources.
  const sourcesForScene = (id: number) => sources.filter((source) => source.shared || source.sceneId === id);
  const sceneSources = sourcesForScene(sceneId);
  const onAirSceneSources = sourcesForScene(onAir.sceneId);
  const previewSceneSources = sourcesForScene(previewSetupRef.sceneId);
  const presentationSource = onAirSceneSources.find((source) => source.kind === 'presentation');
  const cameraSources = onAirSceneSources.filter((source) => source.kind === 'camera' && source.visible);
  const programOverlaySources = onAirSceneSources.filter((source) => source.visible && ['camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind));
  const previewSetupOverlays = previewSceneSources.filter((source) => source.visible && ['camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind));
  const visibleProgramOverlays = studioOutputTab === 'stream' ? programOverlaySources : [];
  const getProgramLayout = (source: Source) => {
    if (source.layout) return source.layout;
    if (source.kind === 'presentation') return { x: 0, y: 0, width: 100, height: 100 };
    if (source.kind === 'camera') {
      const cameraIndex = sourcesForScene(source.sceneId).filter((item) => item.kind === 'camera').findIndex((camera) => camera.id === source.id);
      return { x: 100 - (cameraIndex + 1) * 24, y: 72, width: 22, height: 22 };
    }
    return source.kind === 'text' ? { x: 10, y: 68, width: 80, height: 24 } : { x: 8, y: 8, width: 42, height: 42 };
  };
  const getPreviewSetupLayout = (source: Source) => previewSetupLayouts[source.id] ?? getProgramLayout(source);
  const selectedProgramOverlay = previewSetupOverlays.find((source) => source.id === selectedProgramSource);
  const selectedProgramLayout = selectedProgramOverlay ? getPreviewSetupLayout(selectedProgramOverlay) : null;
  const showPresentationInProgram = !!presentationSource?.visible;
  const cameraLimitReached = sceneSources.filter((source) => source.kind === 'camera').length >= 3;
  const mixerChannels = channels.filter((channel) => onAirSceneSources.some((source) => source.id === channel.id));
  const connectedMixerChannels = mixerChannels.filter((channel) => sources.find((source) => source.id === channel.id)?.stream?.getAudioTracks().some((track) => track.readyState === 'live'));
  const audibleMixerChannels = connectedMixerChannels.filter((channel) => !channel.muted && sources.find((source) => source.id === channel.id)?.visible);
  const streamAudioPeak = Math.max(0, ...audibleMixerChannels.map((channel) => audioLevels[channel.id] ?? 0));
  const streamAudioStatus = !mixerChannels.length ? 'No inputs' : !connectedMixerChannels.length ? 'Disconnected' : !audibleMixerChannels.length ? 'Muted' : streamAudioPeak > 0.002 ? 'Signal' : 'No signal';
  const streamAudioPercent = streamAudioPeak > 0 ? Math.max(0, Math.min(100, ((20 * Math.log10(streamAudioPeak) + 60) / 60) * 100)) : 0;

  // Step 1: clicking a slide only SELECTS it (it shows in the small "Selected slide" screen).
  const selectSlide = (i: number) => setSelected({ sceneId, slideIdx: i });

  const selectScene = (id: number) => {
    const target = { sceneId: id, slideIdx: 0 };
    setSceneId(id);
    setSelected(target);
    setPreview(target);
    if (!previewMode) setOnAir(target);
    setAddSourceOpen(false);
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
              const count = scenes.find((x) => x.id === preview.sceneId)?.slides.length ?? 0;
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

  useEffect(() => {
    if (studioOutputTab !== 'stream') return;
    slideCardRefs.current.get(`${selected.sceneId}:${selected.slideIdx}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected.sceneId, selected.slideIdx, studioOutputTab]);

  // Keyboard: ← → ↑ ↓ and PageUp / PageDown (what most presentation clickers send) change slides.
  // Fast mode (Preview Mode off): the slide goes on air immediately. Otherwise it is only selected.
  const step = (dir: 1 | -1) => {
    const count = scenes.find((x) => x.id === selected.sceneId)?.slides.length ?? 0;
    if (count < 1) return;
    const i = (selected.slideIdx + dir + count) % count;
    if (i === selected.slideIdx) return;
    const target = { sceneId: selected.sceneId, slideIdx: i };
    setSelected(target);
    if (!previewMode) {
      setPreview(target);
      setOnAir(target);
    }
  };

  const stepOnAir = (dir: 1 | -1) => {
    const count = scenes.find((item) => item.id === onAir.sceneId)?.slides.length ?? 0;
    if (count < 1) return;
    const slideIdx = (onAir.slideIdx + dir + count) % count;
    if (slideIdx === onAir.slideIdx) return;
    const target = { sceneId: onAir.sceneId, slideIdx };
    setSelected(target);
    setPreview(target);
    setOnAir(target);
  };

  const stepPreview = (dir: 1 | -1) => {
    const count = scenes.find((item) => item.id === preview.sceneId)?.slides.length ?? 0;
    if (count < 1) return;
    const slideIdx = (preview.slideIdx + dir + count) % count;
    if (slideIdx === preview.slideIdx) return;
    const target = { sceneId: preview.sceneId, slideIdx };
    setSelected(target);
    setPreview(target);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return; // typing a correction: leave the keys alone
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return; // sliders use arrow keys too
      if (studioOutputTab === 'stream' && previewMode && e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
        e.preventDefault();
        setOnAir(preview);
        return;
      }
      if (studioOutputTab === 'stream' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        if (previewMode) stepPreview(direction);
        else stepOnAir(direction);
        return;
      }
      const forward = ['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key);
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key);
      if (!forward && !back) return;
      e.preventDefault();
      if (studioOutputTab === 'slideshow') {
        stepOfflineSlide(forward ? 1 : -1);
        return;
      }
      step(forward ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, studioOutputTab, selected, onAir, scenes, previewMode, preview, sceneId, offlineSlide]);

  const toggleSource = (id: number) => {
    const source = sources.find((item) => item.id === id);
    if (!source) return;
    const visible = !source.visible;
    if (source.kind === 'microphone' || source.kind === 'desktop-audio' || source.kind === 'music') {
      const muted = channels.find((channel) => channel.id === id)?.muted ?? false;
      source.stream?.getAudioTracks().forEach((track) => { track.enabled = visible && !muted; });
    }
    setSources((list) => list.map((item) => (item.id === id ? { ...item, visible } : item)));
  };

  const createSource = (kind: SourceKind, details: Partial<Source> = {}) => {
    const option = SOURCE_OPTIONS.find((item) => item.kind === kind);
    if (!option) return null;
    const count = sceneSources.filter((source) => source.kind === kind).length + 1;
    const newSource: Source = {
      id: Math.max(0, ...sources.map((source) => source.id)) + 1,
      sceneId,
      shared: true,
      kind,
      name: details.name ?? (count > 1 && kind !== 'text' && kind !== 'presentation' ? `${option.name} ${count}` : option.name),
      visible: true,
      layout: kind === 'camera'
        ? { x: 100 - count * 24, y: 72, width: 22, height: 22 }
        : kind === 'text'
        ? { x: 10, y: 68, width: 80, height: 24 }
        : kind === 'screen'
          ? { x: 0, y: 0, width: 100, height: 100 }
          : { x: 8 + ((count - 1) % 3) * 8, y: 8 + ((count - 1) % 3) * 8, width: 42, height: 42 },
      ...details,
    };
    setSources((list) => [...list, newSource]);
    if (kind === 'microphone' || kind === 'desktop-audio' || kind === 'music') {
      setChannels((list) => [...list, {
        id: newSource.id,
        sceneId,
        name: newSource.name,
        icon: kind === 'microphone' ? Mic : kind === 'music' ? Music2 : Volume2,
        db: -6,
        muted: false,
      }]);
    }
    return newSource;
  };

  const beginProgramSourceDrag = (event: ReactPointerEvent, source: Source, mode: 'move' | 'resize') => {
    if (!previewSetupCanvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const layout = getPreviewSetupLayout(source);
    setSelectedProgramSource(source.id);
    previewSetupDrag.current = { id: source.id, mode, startX: event.clientX, startY: event.clientY, layout };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const moveProgramSource = (event: ReactPointerEvent) => {
    const drag = previewSetupDrag.current;
    const canvas = previewSetupCanvasRef.current;
    if (!drag || !canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const dx = ((event.clientX - drag.startX) / bounds.width) * 100;
    const dy = ((event.clientY - drag.startY) / bounds.height) * 100;
    const layout = drag.layout;
    setPreviewSetupLayouts((current) => ({ ...current, [drag.id]: drag.mode === 'move'
        ? { ...layout, x: Math.max(0, Math.min(100 - layout.width, layout.x + dx)), y: Math.max(0, Math.min(100 - layout.height, layout.y + dy)) }
        : { ...layout, width: Math.max(8, Math.min(100 - layout.x, layout.width + dx)), height: Math.max(8, Math.min(100 - layout.y, layout.height + dy)) } }));
  };

  const updateProgramLayout = (id: number, patch: Partial<NonNullable<Source['layout']>>) => {
    const source = previewSetupOverlays.find((item) => item.id === id);
    if (!source) return;
    setPreviewSetupLayouts((current) => {
      const layout = current[id] ?? getProgramLayout(source);
      const width = Math.max(8, Math.min(100, patch.width ?? layout.width));
      const height = Math.max(8, Math.min(100, patch.height ?? layout.height));
      const x = Math.max(0, Math.min(100 - width, patch.x ?? layout.x));
      const y = Math.max(0, Math.min(100 - height, patch.y ?? layout.y));
      return { ...current, [id]: { x, y, width, height } };
    });
  };

  const takePreviewSetupOnAir = () => {
    setSources((current) => current.map((source) => previewSetupLayouts[source.id] ? { ...source, layout: previewSetupLayouts[source.id] } : source));
    setPreview(previewSetupRef);
    setOnAir(previewSetupRef);
    setSelectedProgramSource(null);
  };

  const showCameraOnly = (cameraId?: number) => {
    const camera = cameraSources.find((source) => source.id === cameraId)
      ?? cameraSources.find((source) => source.id === selectedProgramSource)
      ?? cameraSources[0];
    if (!camera) return;
    setCameraOnlySnapshot((current) => current?.sceneId === onAir.sceneId ? current : {
      sceneId: onAir.sceneId,
      sources: onAirSceneSources
        .filter((source) => ['camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind))
        .map(({ id, visible, layout }) => ({ id, visible, layout })),
    });
    setSources((list) => list.map((source) => !onAirSceneSources.some((item) => item.id === source.id) || !['camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind)
      ? source
      : source.id === camera.id
        ? { ...source, visible: true, layout: { x: 0, y: 0, width: 100, height: 100 } }
        : { ...source, visible: false }));
    setSelectedProgramSource(camera.id);
  };

  const undoCameraOnly = () => {
    if (!cameraOnlySnapshot) return;
    setSources((list) => list.map((source) => {
      const previous = cameraOnlySnapshot.sources.find((item) => item.id === source.id);
      return previous
        ? { ...source, visible: previous.visible, layout: previous.layout }
        : source;
    }));
    setSelectedProgramSource(null);
    setCameraOnlySnapshot(null);
  };

  const captureStream = async (
    kind: SourceKind,
    sourceId?: number,
    preferredDeviceId?: string,
  ): Promise<{ stream: MediaStream; deviceId?: string; deviceName?: string } | undefined> => {
    if (!navigator.mediaDevices) throw new Error('Media capture is unavailable in this window.');
    if (kind === 'camera') {
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      const usedIds = sources
        .filter((source) => source.kind === 'camera' && (source.shared || source.sceneId === sceneId) && source.id !== sourceId)
        .map((source) => source.deviceId ?? source.stream?.getVideoTracks()[0]?.getSettings().deviceId)
        .filter((id): id is string => !!id);
      const device = preferredDeviceId
        ? cameras.find((camera) => camera.deviceId === preferredDeviceId)
        : cameras.find((camera) => !usedIds.includes(camera.deviceId));
      if (!device && cameras.length) throw new Error('No unused camera is available. Connect another camera or remove an existing camera source.');
      if (!device && usedIds.length) throw new Error('No additional camera was found. Connect another camera to add a separate view.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: device ? { deviceId: { exact: device.deviceId } } : true,
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      return { stream, deviceId: track?.getSettings().deviceId || device?.deviceId, deviceName: track?.label || device?.label };
    }
    if (kind === 'microphone') {
      const noiseSuppression = sources.find((source) => source.id === sourceId)?.noiseSuppression ?? true;
      return { stream: await navigator.mediaDevices.getUserMedia({ video: false, audio: { noiseSuppression, echoCancellation: true, autoGainControl: true } }) };
    }
    if (kind === 'screen') return { stream: await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }) };
    if (kind === 'desktop-audio') {
      const captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      captured.getVideoTracks().forEach((track) => track.stop());
      const audioTracks = captured.getAudioTracks();
      if (!audioTracks.length) {
        captured.getTracks().forEach((track) => track.stop());
        throw new Error('No system audio was shared. Choose a screen and enable its audio option.');
      }
      return { stream: new MediaStream(audioTracks) };
    }
    return undefined;
  };

  const addSource = async (kind: SourceKind) => {
    setAddSourceOpen(false);
    setSourceError('');
    if (kind === 'media') {
      sourceFileRef.current?.click();
      return;
    }
    if (kind === 'music') {
      musicFileRef.current?.click();
      return;
    }
    if (kind === 'camera' && cameraLimitReached) {
      setSourceError('A scene can have up to 3 camera sources.');
      return;
    }
    try {
      const captured = await captureStream(kind);
      const stream = captured?.stream;
      const source = createSource(kind, {
        ...(stream ? { stream } : {}),
        ...(captured?.deviceId ? { deviceId: captured.deviceId } : {}),
        ...(captured?.deviceName ? { name: captured.deviceName } : {}),
        ...(kind === 'text' ? { text: 'Text overlay' } : {}),
        ...(kind === 'microphone' ? { noiseSuppression: true } : {}),
      });
      if (source && stream) {
        sourceStreams.current.set(source.id, stream);
        stream.getTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            sourceStreams.current.delete(source.id);
            setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream: undefined } : item));
          }, { once: true });
        });
      }
      if (source?.kind === 'text') {
        setSourceEditor(source);
        setSourceDraft(source.text ?? '');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add this source.';
      if (error instanceof DOMException && error.name === 'NotAllowedError') return;
      setSourceError(message);
    }
  };

  const addMediaSource = async (file?: File) => {
    if (!file) return;
    setSourceError('');
    const id = Math.max(0, ...sources.map((source) => source.id)) + 1;
    const mediaAssetId = `studio-source-${id}-${Date.now()}`;
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    try {
      await saveStudioMedia({ id: mediaAssetId, type, blob: file });
      const url = URL.createObjectURL(file);
      sourceObjectUrls.current.push(url);
      setMediaUrls((current) => ({ ...current, [mediaAssetId]: { type, url } }));
      createSource('media', { id, name: file.name, mediaAssetId });
    } catch {
      setSourceError('Could not save that media file locally. Please try another file.');
    }
  };

  const addMusicAssetAsSource = (asset: StudioMusicAssetWithUrl) => {
    const source = createSource('music', { name: asset.name, mediaAssetId: asset.id, loop: true });
    if (source) {
      setAddSourceOpen(false);
      setSourceError('');
    }
  };

  const importMusicFile = async (file?: File) => {
    if (!file) return;
    setSourceError('');
    try {
      const stored: StudioMusicAsset = { id: `music-${crypto.randomUUID()}`, name: file.name, blob: file, createdAt: Date.now() };
      await saveStudioMusic(stored);
      const asset = { ...stored, url: URL.createObjectURL(stored.blob) };
      sourceObjectUrls.current.push(asset.url);
      setMusicAssets((current) => [asset, ...current]);
    } catch {
      setSourceError('Could not save this audio file. Please try another file.');
    }
  };

  const previewMusic = (asset: StudioMusicAssetWithUrl) => {
    if (previewingMusicId === asset.id) {
      musicPreviewElement.current?.pause();
      musicPreviewElement.current = null;
      setPreviewingMusicId(null);
      return;
    }
    musicPreviewElement.current?.pause();
    const audio = new Audio(asset.url);
    audio.onended = () => { setPreviewingMusicId(null); musicPreviewElement.current = null; };
    musicPreviewElement.current = audio;
    setPreviewingMusicId(asset.id);
    void audio.play().catch(() => { setPreviewingMusicId(null); musicPreviewElement.current = null; setSourceError('Could not preview this audio file.'); });
  };

  const attachMusicStream = (sourceId: number, audio: HTMLAudioElement) => {
    if (musicStreams.current.has(sourceId)) return;
    const capturable = audio as HTMLAudioElement & { captureStream?: () => MediaStream };
    const stream = capturable.captureStream?.();
    if (!stream?.getAudioTracks().length) return;
    const source = sources.find((item) => item.id === sourceId);
    const channel = channels.find((item) => item.id === sourceId);
    stream.getAudioTracks().forEach((track) => { track.enabled = (source?.visible ?? true) && !(channel?.muted ?? false); });
    musicStreams.current.set(sourceId, stream);
    sourceStreams.current.set(sourceId, stream);
    setSources((current) => current.map((item) => item.id === sourceId ? { ...item, stream } : item));
  };

  const toggleMusicPlayback = (sourceId: number) => {
    const audio = musicElements.current.get(sourceId);
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => attachMusicStream(sourceId, audio)).catch(() => setSourceError('Could not play this music track.'));
    } else audio.pause();
  };

  const reconnectSource = async (source: Source) => {
    try {
      const captured = await captureStream(source.kind, source.id, source.deviceId);
      const stream = captured?.stream;
      if (!stream) return;
      sourceStreams.current.set(source.id, stream);
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          sourceStreams.current.delete(source.id);
          setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream: undefined } : item));
        }, { once: true });
      });
      setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream, ...(captured.deviceId ? { deviceId: captured.deviceId } : {}) } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reconnect this source.';
      if (error instanceof DOMException && error.name === 'NotAllowedError') return;
      setSourceError(message);
    }
  };

  const saveSourceText = () => {
    if (!sourceEditor) return;
    const text = sourceDraft.trim();
    if (!text) return;
    setSources((list) => list.map((item) => item.id === sourceEditor.id ? { ...item, name: text.split('\n')[0].slice(0, 32) || 'Text overlay', text } : item));
    setSourceEditor(null);
  };

  const removeSource = (id: number) => {
    musicElements.current.get(id)?.pause();
    musicElements.current.delete(id);
    musicStreams.current.delete(id);
    setMusicPlaying((current) => { const next = { ...current }; delete next[id]; return next; });
    sourceStreams.current.get(id)?.getTracks().forEach((track) => track.stop());
    sourceStreams.current.delete(id);
    setChannels((list) => list.filter((channel) => channel.id !== id));
    setSources((list) => list.filter((source) => source.id !== id));
  };

  const deleteMusicAsset = async (asset: StudioMusicAssetWithUrl) => {
    try {
      await deleteStudioMusicAsset(asset.id);
      if (previewingMusicId === asset.id) {
        musicPreviewElement.current?.pause();
        musicPreviewElement.current = null;
        setPreviewingMusicId(null);
      }
      sources.filter((source) => source.kind === 'music' && source.mediaAssetId === asset.id).forEach((source) => removeSource(source.id));
      URL.revokeObjectURL(asset.url);
      sourceObjectUrls.current = sourceObjectUrls.current.filter((url) => url !== asset.url);
      setMusicAssets((current) => current.filter((item) => item.id !== asset.id));
    } catch {
      setSourceError('Could not delete this music track. Please try again.');
    }
  };

  const reorderSources = (draggedId: number, targetId: number) => {
    if (draggedId === targetId) return;
    setSources((list) => {
      const visibleSources = list.filter((source) => source.shared || source.sceneId === sceneId);
      const from = visibleSources.findIndex((source) => source.id === draggedId);
      const to = visibleSources.findIndex((source) => source.id === targetId);
      if (from < 0 || to < 0) return list;
      const [moved] = visibleSources.splice(from, 1);
      visibleSources.splice(to, 0, moved);
      const visibleIds = new Set(visibleSources.map((source) => source.id));
      return [...list.filter((source) => !visibleIds.has(source.id)), ...visibleSources];
    });
  };

  const updateChannel = (id: number, patch: Partial<Channel>) => {
    if (patch.muted !== undefined) {
      const sourceVisible = sources.find((source) => source.id === id)?.visible ?? true;
      (sourceStreams.current.get(id) ?? sources.find((source) => source.id === id)?.stream)?.getAudioTracks().forEach((track) => { track.enabled = sourceVisible && !patch.muted; });
    }
    setChannels((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const toggleNoiseSuppression = async (id: number) => {
    const source = sources.find((item) => item.id === id);
    const track = source?.stream?.getAudioTracks()[0];
    if (!source || !track) {
      setAudioError('Reconnect the microphone before changing noise suppression.');
      return;
    }
    if (!navigator.mediaDevices.getSupportedConstraints().noiseSuppression) {
      setAudioError('This device does not support microphone noise suppression.');
      return;
    }
    const next = !(source.noiseSuppression ?? true);
    try {
      await track.applyConstraints({ noiseSuppression: next });
      setSources((list) => list.map((item) => item.id === id ? { ...item, noiseSuppression: next } : item));
      setAudioError('');
    } catch {
      setAudioError('Could not change noise suppression for this microphone.');
    }
  };

  const stopLiveAudio = () => {
    if (liveAudioRecorder.current?.state !== 'inactive') liveAudioRecorder.current?.stop();
    liveAudioRecorder.current = null;
    void liveAudioContext.current?.close();
    liveAudioContext.current = null;
    liveAudioDestination.current = null;
    liveAudioInputs.current.forEach((input) => input.disconnect());
    liveAudioInputs.current.clear();
    liveAudioGains.current.clear();
  };

  const clearRecordingAudio = () => {
    recordingAudioRecorder.current = null;
    recordingAudioInputs.current.forEach((input) => input.disconnect());
    recordingAudioInputs.current.clear();
    recordingAudioGains.current.clear();
    recordingAudioDestination.current = null;
    void recordingAudioContext.current?.close();
    recordingAudioContext.current = null;
  };

  const startRecordingSession = async () => {
    const bridge = window.faithstreamWindow;
    const output = programCanvasRef.current;
    if (!bridge || !output || typeof bridge.startRecording !== 'function') return;
    let context: AudioContext | null = null;
    try {
      const bounds = output.getBoundingClientRect();
      const started = await bridge.startRecording({ capture: { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) } });
      if (!started.ok) return;
      context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      recordingAudioContext.current = context;
      recordingAudioDestination.current = destination;
      mixerChannels.forEach((channel) => {
        const source = sources.find((item) => item.id === channel.id);
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (!tracks.length) return;
        const input = context!.createMediaStreamSource(new MediaStream(tracks));
        const gain = context!.createGain();
        gain.gain.value = source?.visible && !channel.muted ? 10 ** (channel.db / 20) : 0;
        input.connect(gain).connect(destination);
        recordingAudioInputs.current.set(channel.id, input);
        recordingAudioGains.current.set(channel.id, gain);
      });
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) throw new Error('This computer cannot encode recording audio.');
      const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm;codecs=opus' });
      let pendingAudio = Promise.resolve();
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        pendingAudio = pendingAudio.then(async () => {
          const chunk = await event.data.arrayBuffer();
          bridge.sendRecordingAudio(chunk);
        });
      };
      recorder.onerror = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.onstop = () => {
        setRecording(false);
        void pendingAudio.then(() => bridge.stopRecording()).finally(clearRecordingAudio);
      };
      recordingAudioRecorder.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (error) {
      try { await bridge.stopRecording?.(); } catch { /* The desktop recorder may not have started. */ }
      void context?.close();
      clearRecordingAudio();
      setRecording(false);
      console.error('Could not start recording.', error);
    }
  };

  const stopRecordingSession = () => {
    const recorder = recordingAudioRecorder.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else {
      void window.faithstreamWindow?.stopRecording();
      clearRecordingAudio();
      setRecording(false);
    }
  };

  const finishLive = () => {
    setLive(false);
    setAudioMonitor(false);
    void window.faithstreamWindow?.stopStream();
    stopLiveAudio();
  };

  const toggleLive = () => {
    if (live && confirmEndStream) {
      setEndStreamConfirmOpen(true);
      return;
    }
    if (live) finishLive();
    else setGoLiveSetupOpen(true);
  };

  useEffect(() => {
    const onHeaderToggleLive = () => toggleLive();
    window.addEventListener('faithstream:header-toggle-live', onHeaderToggleLive);
    return () => window.removeEventListener('faithstream:header-toggle-live', onHeaderToggleLive);
  }, [live, confirmEndStream]);

  const startLive = async () => {
    const bridge = window.faithstreamWindow;
    if (!bridge) {
      setStreamConnectError('Live streaming is only available in the FaithStream desktop app.');
      return;
    }
    if (!streamServerUrl.trim() || !streamKey.trim()) {
      setStreamConnectError('Enter both the Facebook server URL and stream key from Live Producer.');
      return;
    }
    if (!programCanvasRef.current) {
      setStreamConnectError('The On-air output is not ready. Close this window and try again.');
      return;
    }

    setStreamConnectError('');
    setSelectedProgramSource(null);
    setGoLiveSetupOpen(false);
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      await context.resume();
      const mixedAudio = context.createMediaStreamDestination();
      liveAudioDestination.current = mixedAudio;
      mixerChannels.forEach((channel) => {
        const source = sources.find((item) => item.id === channel.id);
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (!tracks.length) return;
        const input = context!.createMediaStreamSource(new MediaStream(tracks));
        const gain = context!.createGain();
        gain.gain.value = source?.visible && !channel.muted ? 10 ** (channel.db / 20) : 0;
        input.connect(gain).connect(mixedAudio);
        liveAudioInputs.current.set(channel.id, input);
        liveAudioGains.current.set(channel.id, gain);
      });
      if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) throw new Error('This app cannot encode the audio stream on this computer.');
      const recorder = new MediaRecorder(mixedAudio.stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) void event.data.arrayBuffer().then((chunk) => bridge.sendStreamAudio(chunk));
      };
      recorder.onerror = () => {
        setStreamStatus('error');
        setStreamMessage('The audio encoder stopped unexpectedly.');
        setLive(false);
        void bridge.stopStream();
        stopLiveAudio();
      };
      recorder.start(100);
      liveAudioContext.current = context;
      liveAudioRecorder.current = recorder;

      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const output = programCanvasRef.current;
      if (!output) throw new Error('The On-air output is not ready.');
      const bounds = output.getBoundingClientRect();
      const is1080 = streamResolution === '1080p';
      const result = await bridge.startStream({
        serverUrl: streamServerUrl.trim(),
        streamKey: streamKey.trim(),
        width: is1080 ? 1920 : 1280,
        height: is1080 ? 1080 : 720,
        frameRate: Number(streamFrameRate),
        bitrate: Number(streamBitrate),
        capture: { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) },
      });
      if (!result.ok) throw new Error(result.message || 'Could not start the Facebook stream.');
      setStreamStatus('connecting');
      setStreamMessage('Connecting to Facebook Live…');
      setLive(true);
      setGoLiveSetupOpen(false);
      setAudioMonitor(false);
    } catch (error) {
      liveAudioRecorder.current?.stop();
      liveAudioRecorder.current = null;
      void context?.close();
      liveAudioContext.current = null;
      liveAudioDestination.current = null;
      liveAudioInputs.current.forEach((input) => input.disconnect());
      liveAudioInputs.current.clear();
      liveAudioGains.current.clear();
      setStreamStatus('error');
      setStreamMessage('');
      setStreamConnectError(error instanceof Error ? error.message : 'Could not start streaming. Check the URL and stream key.');
      setGoLiveSetupOpen(true);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div role="tablist" aria-label="Studio output" className="flex shrink-0 items-end gap-1 border-b border-white/10">
        <button
          type="button"
          role="tab"
          aria-selected={studioOutputTab === 'stream'}
          onClick={() => setStudioOutputTab('stream')}
          className={`border-b-2 px-3 py-2 text-xs font-semibold transition ${studioOutputTab === 'stream' ? 'border-brand text-white' : 'border-transparent text-warm-white/50 hover:text-white'}`}
        >Streaming</button>
        <button
          type="button"
          role="tab"
          aria-selected={studioOutputTab === 'slideshow'}
          disabled={live}
          onClick={() => { setStudioOutputTab('slideshow'); setEditing(false); setSelectedProgramSource(null); }}
          title={live ? 'End the stream before switching to offline slideshow' : undefined}
          className={`border-b-2 px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${studioOutputTab === 'slideshow' ? 'border-brand text-white' : 'border-transparent text-warm-white/50 hover:text-white'}`}
        >Slideshow</button>
      </div>
      {studioOutputTab === 'stream' ? (
      <>
      {/* Top row: takes all the leftover height */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_minmax(190px,0.8fr)_minmax(180px,0.7fr)] gap-3">
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
              <div
                key={`${onAir.sceneId}-${onAir.slideIdx}`}
                ref={onAirSlideRef}
                className="absolute inset-0"
              >
                <SlideView bg={airing.bg} slide={airing.slide} scale={5.5} minRem={0.55} />
              </div>
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
          </div>
        </div>

        {/* Program shows the visual sources that will make up this scene. */}
        <Panel
          title="Program"
          className="min-w-0 overflow-hidden"
          action={
            live ? <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white">LIVE</span> : <span className="text-[10px] text-warm-white/50">Standby</span>
          }
        >
          <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2">
            <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-500/15 px-2 py-1.5 text-[11px] font-semibold text-sky-200"><Monitor size={13} /> Slides</span>
            <select id="stream-output-monitor" aria-label="Streaming output monitor" value={targetDisplayId ?? ''} onChange={(event) => setTargetDisplayId(Number(event.target.value))} className="h-9 min-w-0 flex-1 rounded-md border border-white/15 bg-slate-950 px-2.5 text-xs text-warm-white outline-none focus:border-brand" disabled={!studioDisplays.length}>
              {studioDisplays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
            </select>
            <button type="button" aria-label="Show slides on monitor" title="Show the on-air slide on this monitor" onClick={() => { void openStreamDisplay(); }} disabled={!studioDisplays.length} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-brand px-2.5 text-xs font-bold text-white shadow-lg shadow-brand/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"><Monitor size={14} /> Show slides</button>
          </div>
          <p className="mb-2 shrink-0 text-[10px] text-warm-white/45">{previewMode ? '↓ / ↑ changes Preview · Enter puts it on air' : '↓ / ↑ changes the on-air slide'}</p>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
            <div className="grid shrink-0 grid-cols-2 gap-2">
            <section className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-2">
              <div className="mb-1 flex items-center justify-between gap-1">
                <h3 className="text-[11px] font-semibold text-sky-200">Preview setup</h3>
                <button type="button" onClick={takePreviewSetupOnAir} className="flex shrink-0 items-center gap-1 rounded-md bg-brand px-2 py-1 text-[10px] font-bold text-white hover:brightness-110"><ArrowRight size={12} /> Take to air</button>
              </div>
              <div
                ref={previewSetupCanvasRef}
                className="relative mx-auto aspect-video w-full overflow-hidden rounded-lg border border-white/15 bg-slate-950 touch-none"
                style={{ containerType: 'inline-size' }}
                onPointerMove={moveProgramSource}
                onPointerUp={() => { previewSetupDrag.current = null; }}
                onPointerCancel={() => { previewSetupDrag.current = null; }}
                onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedProgramSource(null); }}
              >
                <div className="absolute inset-0 bg-black" />
                {previewSetupOverlays.map((source) => {
                  const layout = getPreviewSetupLayout(source);
                  const selectedLayer = selectedProgramSource === source.id;
                  return <div
                    key={source.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${source.name}. Drag to position; drag the corner to resize in Preview setup.`}
                    onPointerDown={(event) => beginProgramSourceDrag(event, source, 'move')}
                    onClick={() => setSelectedProgramSource(source.id)}
                    onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedProgramSource(source.id); }}
                    className={`absolute cursor-move touch-none ${selectedLayer ? 'outline outline-2 outline-sky-400' : 'hover:outline hover:outline-1 hover:outline-white/60'}`}
                    style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%`, zIndex: previewSceneSources.length - previewSceneSources.findIndex((item) => item.id === source.id) }}
                  >
                    <SourcePreview source={source} media={source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined} slide={previewSetupSlide.slide} bg={previewSetupSlide.bg} showLabel={false} />
                    {selectedLayer && <button type="button" aria-label={`Resize ${source.name}`} title="Drag to resize" onPointerDown={(event) => beginProgramSourceDrag(event, source, 'resize')} className="absolute -bottom-1.5 -right-1.5 z-30 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-sky-500 shadow" />}
                  </div>;
                })}
              </div>
              {selectedProgramOverlay && selectedProgramLayout && <div data-program-layout-controls className="mt-1.5 flex items-end gap-1 rounded-lg border border-white/10 bg-black/20 p-1.5">
                <div className="mr-auto min-w-0 pb-1"><p className="truncate text-[9px] font-semibold text-warm-white">{selectedProgramOverlay.name}</p><p className="text-[8px] text-warm-white/45">Preview size</p></div>
                {([['X', 'x', 100 - selectedProgramLayout.width], ['Y', 'y', 100 - selectedProgramLayout.height], ['W', 'width', 100 - selectedProgramLayout.x], ['H', 'height', 100 - selectedProgramLayout.y]] as const).map(([label, key, max]) => <label key={key} className="flex w-9 shrink-0 flex-col gap-1 text-[8px] text-warm-white/55">{label}<input type="number" min={key === 'width' || key === 'height' ? 8 : 0} max={max} value={selectedProgramLayout[key]} onChange={(event) => updateProgramLayout(selectedProgramOverlay.id, { [key]: Number(event.currentTarget.value) })} className="w-full rounded border border-white/10 bg-slate-950 px-0.5 py-1 text-center text-[9px] text-white outline-none focus:border-sky-400" /></label>)}
              </div>}
            </section>
            <section className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-2">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-warm-white/75">On-air output</h3>
                <div className="flex items-center gap-2">
                  <span className="max-w-28 truncate text-[10px] text-red-300">{showPresentationInProgram ? airing.slide.title || `Slide ${onAir.slideIdx + 1}` : 'Camera / overlay output'}</span>
                  {cameraOnlySnapshot ? (
                    <button onClick={undoCameraOnly} className="rounded border border-sky-400/30 px-1.5 py-0.5 text-[10px] text-sky-200 hover:bg-sky-400/10">Undo camera only</button>
                  ) : cameraSources.length > 0 ? (
                    <button onClick={() => showCameraOnly()} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-warm-white/70 hover:border-brand hover:text-white">Camera only</button>
                  ) : null}
                </div>
              </div>
              <div
                ref={programCanvasRef}
                className="relative mx-auto aspect-video w-full max-w-[380px] overflow-hidden border border-white/15 bg-slate-950 touch-none"
                style={{ containerType: 'inline-size' }}
              >
                <div className="absolute inset-0 bg-black" />
                {visibleProgramOverlays.map((source) => {
                  const layout = getProgramLayout(source);
                  return (
                    <div
                      key={source.id}
                      className="absolute"
                      style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%`, zIndex: onAirSceneSources.length - onAirSceneSources.findIndex((item) => item.id === source.id) }}
                    >
                      <SourcePreview
                        source={source}
                        media={source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined}
                        slide={airing.slide}
                        bg={airing.bg}
                        showLabel={false}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
            </div>

            <section className="min-w-0 shrink-0">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-warm-white/75">Camera sources</h3>
                <span className="text-[10px] text-warm-white/45">{cameraSources.length}/3</span>
              </div>
              <div className="mx-auto w-full max-w-full">
                {cameraSources.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {cameraSources.map((source) => (
                      <button key={source.id} onClick={() => showCameraOnly(source.id)} title={`Put ${source.name} on air`} className="block w-full overflow-hidden rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
                        <SourcePreview source={source} slide={airing.slide} bg={airing.bg} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-warm-white/40">No camera sources added</div>
                )}
              </div>
            </section>

          </div>

        </Panel>

        <Panel title="Slides" className="min-w-0">
          <div className="mb-2 flex shrink-0 items-baseline justify-between gap-2">
            <h3 className="truncate text-xs font-semibold text-warm-white/80">{scene.name}</h3>
            <span className="shrink-0 text-[10px] text-warm-white/50">{scene.slides.length}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
            {scene.slides.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-3 text-center text-xs text-warm-white/45">Add a presentation to create a scene.</p>}
            {scene.slides.map((sl, i) => {
              const ref: Ref = { sceneId, slideIdx: i };
              const cardKey = `${sceneId}:${i}`;
              const isSelected = same(selected, ref);
              const inPreview = same(preview, ref);
              const isOnAir = same(onAir, ref);
              return <div key={i} ref={(element) => { if (element) slideCardRefs.current.set(cardKey, element); else slideCardRefs.current.delete(cardKey); }} className="min-w-0 shrink-0">
                <button
                  onClick={() => selectSlide(i)}
                  onDoubleClick={() => sendToPreview(ref)}
                  title="Click to select, double-click to send to Preview"
                  aria-pressed={isSelected}
                  className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 transition ${isSelected ? 'border-brand ring-2 ring-brand/40' : 'border-white/10 hover:border-white/40'}`}
                >
                  <SlideView bg={scene.bg} slide={sl} scale={8} minRem={0.5} />
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
                  <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                    {isOnAir && <span className="rounded bg-red-600 px-1 text-[9px] font-bold text-white">On air</span>}
                    {inPreview && <span className="rounded bg-sky-600 px-1 text-[9px] font-bold text-white">Preview</span>}
                  </div>
                </button>
                <p className="mt-1 truncate px-0.5 text-[11px] font-medium text-warm-white/80" title={sl.title?.trim() || `Slide ${i + 1}`}>{sl.title?.trim() || `Slide ${i + 1}`}</p>
              </div>;
            })}
          </div>
        </Panel>

        {/* Sidebar keeps Scenes and Music together while the active list uses the full height. */}
        <Panel
          title={sidebarPanel === 'scenes' ? 'Scenes' : 'Music'}
          className="min-w-0"
          action={
            sidebarPanel === 'scenes' ? (
              <button aria-label="Add scene" onClick={beginAddScene} className="text-warm-white/70 hover:text-brand"><Plus size={18} /></button>
            ) : (
              <button type="button" onClick={() => musicFileRef.current?.click()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-white/75 hover:bg-white/5 hover:text-white"><Plus size={14} /> Upload</button>
            )
          }
        >
          <div role="tablist" aria-label="Studio sidebar panels" className="mb-2 flex shrink-0 gap-1 rounded-lg bg-black/20 p-1">
            <button type="button" role="tab" aria-selected={sidebarPanel === 'scenes'} onClick={() => setSidebarPanel('scenes')} className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold ${sidebarPanel === 'scenes' ? 'bg-white/10 text-white' : 'text-warm-white/55 hover:text-white'}`}>Scenes</button>
            <button type="button" role="tab" aria-selected={sidebarPanel === 'music'} onClick={() => setSidebarPanel('music')} className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold ${sidebarPanel === 'music' ? 'bg-white/10 text-white' : 'text-warm-white/55 hover:text-white'}`}>Music</button>
          </div>
          {sidebarPanel === 'scenes' ? <>
          <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {scenes.length === 0 && <li className="rounded-lg border border-dashed border-white/10 p-3 text-xs leading-relaxed text-warm-white/45">No scenes yet. Add one to bring a saved presentation into Studio.</li>}
            {scenes.map((s) => (
              <li key={s.id} className="group relative">
                <button
                  onClick={() => selectScene(s.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-1.5 pr-9 text-left transition-colors ${
                    sceneId === s.id ? 'border-brand bg-brand/10' : 'border-white/10 hover:bg-white/5'
                  }`}
                >
                  <div className="h-10 w-16 shrink-0 overflow-hidden rounded">
                    <SlideView bg={s.bg} slide={s.slides[0]} />
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
                <button
                  aria-label={`Delete scene ${s.name}`}
                  title={scenes.length === 1 ? 'Studio must keep at least one scene' : `Delete ${s.name}`}
                  onClick={() => askDeleteScene(s, 'stream')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-warm-white/45 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button onClick={beginAddScene} className="mt-2 flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-white/10 py-1.5 text-sm text-warm-white hover:bg-white/5"><Plus size={16} />Add Scene</button>
          </> : <>
          <input ref={musicFileRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { void importMusicFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          {musicAssets.length ? (
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
              {musicAssets.map((asset) => {
                const added = sceneSources.some((source) => source.kind === 'music' && source.mediaAssetId === asset.id);
                return <li key={asset.id} className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 hover:bg-white/5">
                  <button type="button" onClick={() => previewMusic(asset)} title={previewingMusicId === asset.id ? 'Stop preview' : `Preview ${asset.name}`} aria-label={previewingMusicId === asset.id ? `Stop preview of ${asset.name}` : `Preview ${asset.name}`} className="shrink-0 rounded p-1.5 text-brand hover:bg-white/10">{previewingMusicId === asset.id ? <Pause size={13} /> : <Play size={13} />}</button>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-warm-white/75" title={asset.name}>{asset.name}</span>
                  <button type="button" disabled={added} onClick={() => addMusicAssetAsSource(asset)} className="shrink-0 rounded px-2 py-1 text-[10px] font-semibold text-brand hover:bg-brand/10 disabled:text-warm-white/35">{added ? 'Added' : 'Add'}</button>
                  <button type="button" aria-label={`Delete ${asset.name}`} title="Delete track" onClick={() => { void deleteMusicAsset(asset); }} className="shrink-0 rounded p-1.5 text-warm-white/40 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={13} /></button>
                </li>;
              })}
            </ul>
          ) : <button type="button" onClick={() => musicFileRef.current?.click()} className="flex min-h-20 flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 px-3 text-center text-xs text-warm-white/45 hover:border-brand/40 hover:text-warm-white/70">Upload a track to build your music library.</button>}
          </>}
        </Panel>
      </div>

      {/* Bottom row: natural height */}
      <div className="grid shrink-0 grid-cols-4 gap-3">
        {/* Sources stay in the original lower row; the Add menu opens upward to stay clear of the footer. */}
        <Panel
          title="Sources"
          className="max-h-48 min-h-0"
          action={
            <button ref={sourceTriggerRef} aria-label="Add source" aria-expanded={addSourceOpen} onClick={() => setAddSourceOpen((open) => !open)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-white/75 hover:bg-white/5 hover:text-white">
              <Plus size={15} /> Add source
            </button>
          }
        >
          <div ref={sourceMenuRef} className="relative flex min-h-0 flex-1 flex-col">
            {addSourceOpen && (
              <div className="absolute bottom-full right-0 z-30 mb-2 max-h-48 w-56 overflow-y-scroll overscroll-contain rounded-xl border border-white/10 bg-[#101d2a] p-2 shadow-2xl" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
                {(['Video', 'Audio', 'Overlay'] as const).map((group) => (
                  <div key={group} className="mb-1 last:mb-0">
                    <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-warm-white/40">{group}</p>
                    {SOURCE_OPTIONS.filter((option) => option.group === group && option.kind !== 'music').map(({ kind, name, icon: Icon }) => {
                      const disabled = kind === 'camera' && cameraLimitReached;
                      return (
                        <button key={kind} disabled={disabled} onClick={() => { void addSource(kind); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-warm-white/80 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                          <span className="flex items-center gap-2"><Icon size={14} className="text-warm-white/60" />{name}</span>
                          {kind === 'camera' && <span className="text-[10px] text-warm-white/45">{sceneSources.filter((source) => source.kind === 'camera').length}/3</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {sceneSources.length > 0 ? (
              <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
                {sceneSources.map((source) => {
                  const { id, name, kind, visible } = source;
                  const Icon = SOURCE_OPTIONS.find((option) => option.kind === kind)?.icon ?? Type;
                  const musicAsset = kind === 'music' ? musicAssets.find((asset) => asset.id === source.mediaAssetId) : undefined;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={(event) => { event.dataTransfer.setData('text/source-id', String(id)); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); reorderSources(Number(event.dataTransfer.getData('text/source-id')), id); }}
                      className="group flex items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5 text-sm text-warm-white"
                    >
                      {kind === 'music' && musicAsset && <audio
                        ref={(element) => { if (element) musicElements.current.set(id, element); else musicElements.current.delete(id); }}
                        src={musicAsset.url}
                        loop={source.loop ?? false}
                        onPlay={(event) => { setMusicPlaying((current) => ({ ...current, [id]: true })); attachMusicStream(id, event.currentTarget); }}
                        onPause={() => setMusicPlaying((current) => ({ ...current, [id]: false }))}
                        onEnded={() => setMusicPlaying((current) => ({ ...current, [id]: false }))}
                        className="hidden"
                      />}
                      <GripVertical size={14} className="shrink-0 cursor-grab text-warm-white/35" />
                      <Icon size={15} className="shrink-0 text-warm-white/70" />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      {kind === 'music' && <>
                        <button type="button" aria-label={musicPlaying[id] ? `Pause ${name}` : `Play ${name}`} title={musicPlaying[id] ? 'Pause track' : 'Play track'} onClick={() => toggleMusicPlayback(id)} className="text-warm-white/70 hover:text-brand">{musicPlaying[id] ? <Pause size={14} /> : <Play size={14} />}</button>
                        <button type="button" aria-pressed={source.loop ?? false} title={source.loop ? 'Loop enabled' : 'Play once'} onClick={() => {
                          const loop = !source.loop;
                          const audio = musicElements.current.get(id);
                          if (audio) audio.loop = loop;
                          setSources((current) => current.map((item) => item.id === id ? { ...item, loop } : item));
                        }} className={`rounded px-1 text-[9px] ${source.loop ? 'text-brand' : 'text-warm-white/40 hover:text-warm-white'}`}>{source.loop ? 'LOOP' : 'ONCE'}</button>
                      </>}
                      <button aria-label={visible ? `Hide ${name}` : `Show ${name}`} title={visible ? 'Hide source' : 'Show source'} onClick={() => toggleSource(id)} className="text-warm-white/60 hover:text-brand">
                        {visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      {kind === 'text' && (
                        <button aria-label={`Edit ${name}`} title="Edit text" onClick={() => { setSourceEditor(source); setSourceDraft(source.text ?? ''); }} className="text-warm-white/45 hover:text-brand">
                          <Pencil size={14} />
                        </button>
                      )}
                      {['camera', 'screen', 'microphone', 'desktop-audio'].includes(kind) && !source.stream && (
                        <button aria-label={`Reconnect ${name}`} title="Connect source" onClick={() => reconnectSource(source)} className="text-warm-white/55 hover:text-brand">
                          <Radio size={14} />
                        </button>
                      )}
                      <button aria-label={`Remove ${name}`} title="Remove source" onClick={() => removeSource(id)} className="text-warm-white/45 opacity-0 transition hover:text-red-300 focus:opacity-100 group-hover:opacity-100">
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex h-full min-h-20 items-center justify-center rounded-lg border border-dashed border-white/10 px-3 text-center text-xs text-warm-white/45">
                No sources added to this scene yet. Choose <span className="mx-1 font-semibold text-warm-white/65">Add source</span> to set up the stream.
              </div>
            )}
            {sourceError && <p role="alert" className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-[11px] text-red-200">{sourceError}</p>}
          </div>
          <input ref={sourceFileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => { void addMediaSource(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
        </Panel>

        {/* Audio mixer */}
        <Panel title="Audio Mixer">
          <ul className="flex flex-col gap-3">
            {mixerChannels.map(({ id, name, icon: Icon, db, muted }) => {
              const source = sources.find((item) => item.id === id);
              return (
                <li key={id} className="flex items-center gap-3">
                  <Icon size={16} className="shrink-0 text-warm-white/70" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-xs text-warm-white">
                      <span className="truncate">{name}</span>
                      <span className="ml-2 shrink-0 tabular-nums text-warm-white/60">{db.toFixed(1)} dB</span>
                    </div>
                    <input
                      type="range"
                      min={-60}
                      max={0}
                      step={0.5}
                      value={db}
                      disabled={muted || !source?.stream}
                      aria-label={`${name} volume`}
                      onChange={(e) => updateChannel(id, { db: Number(e.target.value) })}
                      className="mt-1 w-full accent-brand disabled:opacity-40"
                    />
                    <AudioChannelMeter
                      stream={source?.stream}
                      db={db}
                      muted={muted}
                      enabled={source?.visible ?? false}
                      onLevel={(level) => setAudioLevels((current) => Math.abs((current[id] ?? 0) - level) < 0.005 ? current : { ...current, [id]: level })}
                    />
                    {source?.kind === 'microphone' && (
                      <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                        <span className="text-warm-white/55">Noise suppression</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={source.noiseSuppression ?? true}
                          disabled={!source.stream?.getAudioTracks().some((track) => track.readyState === 'live')}
                          onClick={() => { void toggleNoiseSuppression(id); }}
                          className={`rounded px-1.5 py-0.5 font-medium disabled:opacity-40 ${(source.noiseSuppression ?? true) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-warm-white/55'}`}
                        >
                          {(source.noiseSuppression ?? true) ? 'On' : 'Off'}
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
                    onClick={() => updateChannel(id, { muted: !muted })}
                    className={muted ? 'text-red-400' : 'text-warm-white/70 hover:text-brand'}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                </li>
              );
            })}
            {!mixerChannels.length && <li className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-warm-white/45">Add a microphone or desktop audio source to control it here.</li>}
          </ul>
          {audioError && <p role="alert" className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">{audioError}</p>}
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
                {live ? streamMessage || 'Connecting to Facebook Live…' : streamStatus === 'error' ? streamMessage || 'Connection failed' : 'Offline'}
              </p>
            </div>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Stream Health</dt>
              <dd className={`flex items-center gap-1 ${streamStatus === 'live' ? 'text-emerald-400' : streamStatus === 'error' ? 'text-red-300' : live ? 'text-amber-300' : 'text-warm-white/40'}`}>
                <Wifi size={16} /> {streamStatus === 'live' ? 'Receiving' : streamStatus === 'error' ? 'Failed' : live ? 'Connecting' : '-'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Dropped Frames</dt>
              <dd className="text-warm-white">0 (0.0%)</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Audio Level</dt>
              <dd className="flex items-center gap-2">
                <span className={`text-[10px] ${streamAudioStatus === 'Signal' ? 'text-emerald-400' : 'text-warm-white/45'}`}>{streamAudioStatus}</span>
                <span className="flex gap-0.5" aria-label={`${streamAudioPercent.toFixed(0)} percent`}>
                  {Array.from({ length: 10 }, (_, i) => {
                    const lit = streamAudioPercent >= ((i + 1) / 10) * 100;
                    const color = i >= 8 ? 'bg-red-400' : i >= 7 ? 'bg-yellow-400' : 'bg-emerald-400';
                    return <span key={i} className={`h-3 w-1.5 rounded-sm ${lit ? color : 'bg-white/15'}`} />;
                  })}
                </span>
              </dd>
            </div>
          </dl>
        </Panel>

        {/* Quick controls */}
        <Panel
          title="Quick Controls"
          action={<button aria-label="Studio settings" title="Studio settings" onClick={() => setSettingsOpen(true)} className="rounded-lg p-1.5 text-warm-white/65 hover:bg-white/5 hover:text-white"><Settings size={16} /></button>}
        >
          <div className="flex flex-col gap-2.5">
            <button
              onClick={toggleLive}
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-colors ${
                live ? 'bg-red-600 hover:bg-red-500' : 'bg-brand hover:brightness-110'
              }`}
            >
              {live ? <Square size={16} /> : <Radio size={18} />}
              {live ? 'End Stream' : 'Go Live'}
            </button>
            <button
              onClick={() => recording ? stopRecordingSession() : void startRecordingSession()}
              className="flex items-center justify-center gap-2 rounded-lg border border-white/20 py-2.5 text-sm font-medium text-warm-white hover:bg-white/5"
            >
              <Circle size={16} className={recording ? 'fill-red-500 text-red-500' : ''} />
              {recording ? 'Stop Recording' : 'Record'}
            </button>
            <Switch label="Preview Mode" on={previewMode} onChange={setPreviewMode} />
          </div>
        </Panel>
      </div>
      </>
      ) : (
        <section aria-label="Offline slideshow" className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-panel px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-white">Offline slideshow</h2>
              <p className="mt-1 text-xs text-warm-white/50">Choose a scene, then send its slides to a connected projector or monitor.</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-warm-white/60">Output monitor
                <select value={targetDisplayId ?? ''} onChange={(event) => setTargetDisplayId(Number(event.target.value))} className={`${selectClass} mt-1 block min-w-40`} disabled={!studioDisplays.length}>
                  {studioDisplays.map((display) => <option key={display.id} value={display.id}>{display.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { void openOfflineDisplay(); }} disabled={!studioDisplays.length} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Show on monitor</button>
            </div>
            <p className="basis-full text-right text-[10px] text-warm-white/40">Open the same scene on another monitor by selecting it and choosing Show on monitor. Press Esc on a display to close it.</p>
          </div>
          {displayError && <p role="alert" className="shrink-0 text-xs text-amber-200">{displayError}</p>}
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_280px_280px]">
            <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-white/10 bg-panel p-3">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black" style={{ containerType: 'inline-size' }}>
                <SlideView bg={offlineCurrent.bg} slide={offlineCurrent.slide} scale={8} minRem={0.55} />
                {!offlineEditing && <button type="button" onClick={startOfflineEdit} className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/65 px-3 py-2 text-xs font-semibold text-white hover:bg-black/85"><Pencil size={13} />Edit text</button>}
                {offlineEditing && (
                  <div className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-[#0b1520]/95 p-4 backdrop-blur-sm">
                    <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
                      <div><h3 className="text-sm font-semibold text-white">Edit this slide</h3><p className="mt-1 text-[11px] text-warm-white/50">Changes appear on every monitor showing this scene after you save.</p></div>
                      <button type="button" aria-label="Close editor" onClick={() => setOfflineEditing(false)} className="rounded p-1 text-warm-white/50 hover:bg-white/10 hover:text-white"><X size={16} /></button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                      {offlineCurrent.slide.design?.box || offlineCurrent.slide.design?.extraBoxes?.length ? (
                        <>
                          {offlineCurrent.slide.design.box && <label className="block text-xs text-warm-white/65">Main text<textarea value={offlineBoxDrafts.main ?? ''} onChange={(event) => setOfflineBoxDrafts((current) => ({ ...current, main: event.target.value }))} className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-brand" /></label>}
                          {offlineCurrent.slide.design.extraBoxes?.map((box, index) => <label key={box.id} className="block text-xs text-warm-white/65">Text box {index + 2}<textarea value={offlineBoxDrafts[`extra-${box.id}`] ?? ''} onChange={(event) => setOfflineBoxDrafts((current) => ({ ...current, [`extra-${box.id}`]: event.target.value }))} className="mt-1.5 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-brand" /></label>)}
                        </>
                      ) : (
                        <label className="block text-xs text-warm-white/65">Slide text<textarea value={offlineTextDraft} onChange={(event) => setOfflineTextDraft(event.target.value)} className="mt-1.5 min-h-28 w-full resize-y rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-brand" /></label>
                      )}
                      <label className="block text-xs text-warm-white/65">Reference (optional)<input value={offlineRefDraft} onChange={(event) => setOfflineRefDraft(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-sm text-white outline-none focus:border-brand" placeholder="e.g. John 3:16" /></label>
                    </div>
                    <div className="mt-3 flex shrink-0 justify-end gap-2">
                      <button type="button" onClick={() => setOfflineEditing(false)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/5">Cancel</button>
                      <button type="button" onClick={saveOfflineEdit} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:brightness-110">Save changes</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3">
                <span className="text-xs text-warm-white/55">Slide {Math.min(offlineSlide.slideIdx + 1, Math.max(offlineScene.slides.length, 1))} of {offlineScene.slides.length}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => stepOfflineSlide(-1)} disabled={!offlineScene.slides.length || offlineSlide.slideIdx === 0} className="rounded-lg border border-white/10 px-3 py-2 text-sm text-warm-white disabled:opacity-35">Previous</button>
                  <button type="button" onClick={() => stepOfflineSlide(1)} disabled={!offlineScene.slides.length || offlineSlide.slideIdx >= offlineScene.slides.length - 1} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-35">Next slide</button>
                </div>
              </div>
            </div>
            <div className="order-3 flex min-h-0 flex-col rounded-xl border border-white/10 bg-panel p-3">
                <div className="mb-2 flex shrink-0 items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Scenes</h3>
                  <button type="button" aria-label="Add scene" title="Add scene" onClick={beginAddScene} className="rounded p-1 text-warm-white/60 hover:bg-white/10 hover:text-white"><Plus size={15} /></button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
                  {slideshowScenes.map((item) => <div key={item.id} className="group relative">
                    <button type="button" onClick={() => setOfflineScene(item.id)} aria-pressed={offlineSlide.sceneId === item.id} className={`flex w-full items-center justify-between gap-2 rounded-lg border py-2 pl-3 pr-9 text-left transition ${offlineSlide.sceneId === item.id ? 'border-brand bg-brand/10 text-white' : 'border-white/10 text-warm-white/70 hover:border-white/25 hover:text-white'}`}>
                      <span className="min-w-0"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="mt-0.5 block text-[10px] text-warm-white/45">{item.slides.length} {item.slides.length === 1 ? 'slide' : 'slides'}</span></span>
                      {onAir.sceneId === item.id && <span title="On air" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                    </button>
                    <button type="button" aria-label={`Delete scene ${item.name}`} title={`Delete ${item.name}`} onClick={() => askDeleteScene(item, 'slideshow')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-warm-white/45 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
                  </div>)}
                  {!slideshowScenes.length && <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-warm-white/45">Add a scene to get started.</p>}
                </div>
                <button type="button" onClick={beginAddScene} className="mt-2 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-xs text-warm-white hover:bg-white/5"><Plus size={14} />Add Scene</button>
            </div>
            <div className="order-2 flex min-h-0 flex-col rounded-xl border border-white/10 bg-panel p-3">
                <h3 className="mb-2 shrink-0 text-sm font-semibold text-white">Slides <span className="font-normal text-warm-white/45">· {offlineScene.name}</span></h3>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
                  {offlineScene.slides.map((slide, index) => (
                    <button key={`${offlineScene.id}-${index}`} type="button" onClick={() => { setOfflineSlide({ sceneId: offlineScene.id, slideIdx: index }); setOfflineEditing(false); }} aria-pressed={offlineSlide.slideIdx === index} className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${offlineSlide.slideIdx === index ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/25'}`}>
                      <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded bg-black" style={{ containerType: 'inline-size' }}><SlideView bg={offlineScene.bg} slide={slide} scale={4} minRem={0.4} /></span>
                      <span className="min-w-0"><span className="block text-[10px] text-warm-white/45">SLIDE {index + 1}</span><span className="block truncate text-xs text-white">{slide.title || slide.text || `Slide ${index + 1}`}</span></span>
                    </button>
                  ))}
                  {!offlineScene.slides.length && <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-warm-white/45">This scene has no slides.</p>}
                </div>
            </div>
          </div>
        </section>
      )}
      {addSceneOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddSceneOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-scene-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-scene-title" className="text-lg font-bold text-warm-white">Add a presentation scene</h2>
                <p className="mt-1 text-sm text-warm-white/55">Choose one of your saved presentations to add its slides to Studio.</p>
              </div>
              <button aria-label="Close" onClick={() => setAddSceneOpen(false)} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </div>
            {savedPresentations.filter((presentation) => presentation.slides.length > 0).length > 0 ? (
              <>
                <div role="radiogroup" aria-label="Saved presentations" className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {savedPresentations.filter((presentation) => presentation.slides.length > 0).map((presentation) => (
                    <button key={presentation.id} type="button" role="radio" aria-checked={selectedPresentationId === presentation.id} onClick={() => setSelectedPresentationId(presentation.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selectedPresentationId === presentation.id ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/25 hover:bg-white/[0.03]'}`}>
                      <span className="min-w-0"><span className="block truncate text-sm font-medium text-warm-white">{presentation.name}</span><span className="mt-1 block text-xs text-warm-white/45">{presentation.slides.length} {presentation.slides.length === 1 ? 'slide' : 'slides'}</span></span>
                      <span aria-hidden="true" className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${selectedPresentationId === presentation.id ? 'border-brand' : 'border-white/30'}`}>{selectedPresentationId === presentation.id && <span className="h-2 w-2 rounded-full bg-brand" />}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setAddSceneOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
                  <button onClick={() => addAllPresentationScenes(addSceneTab)} className="rounded-lg border border-brand/40 px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/10">Add all scenes</button>
                  <button onClick={addPresentationScene} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110">Add selected</button>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm text-warm-white/60">No saved presentations with slides yet. Create and save a presentation first, then return here to add it as a scene.</div>
            )}
          </section>
        </div>
      )}
      {goLiveSetupOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setGoLiveSetupOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="go-live-setup-title" className="my-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="go-live-setup-title" className="text-lg font-bold text-warm-white">Go live setup</h2>
                <p className="mt-1 text-sm text-warm-white/55">Check the program and audio, then choose your stream quality.</p>
              </div>
              <button aria-label="Close go live setup" onClick={() => { setGoLiveSetupOpen(false); setAudioMonitor(false); }} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-warm-white">What viewers will see</h3>
                  <span className="flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />Program preview</span>
                </div>
                <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black" style={{ containerType: 'inline-size' }}>
                  {showPresentationInProgram ? <SlideView bg={airing.bg} slide={airing.slide} scale={8} minRem={0.5} /> : <div className="absolute inset-0 bg-black" />}
                  {visibleProgramOverlays.map((source) => {
                    const layout = getProgramLayout(source);
                    return <div key={source.id} className="pointer-events-none absolute overflow-hidden" style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%` }}>
                      <SourcePreview source={source} media={source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined} slide={airing.slide} bg={airing.bg} showLabel={false} className="" />
                    </div>;
                  })}
                  {!showPresentationInProgram && visibleProgramOverlays.length === 0 && <p className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-white/55">No visible video sources. Add a camera, media, or presentation source in Studio.</p>}
                </div>
                <p className="mt-2 text-xs text-warm-white/45">Preview follows your current On-air output.</p>
              </div>
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 p-4">
                  <h3 className="text-sm font-semibold text-warm-white">Facebook Live destination</h3>
                  <p className="mt-1 text-xs text-warm-white/50">Copy the server URL and the entire stream key from Facebook Live Producer.</p>
                  <label className="mt-3 block text-xs text-warm-white/60">Server URL
                    <input type="url" value={streamServerUrl} onChange={(event) => setStreamServerUrl(event.target.value)} className={`${selectClass} mt-1.5 w-full`} placeholder="Paste Facebook’s server URL" autoComplete="off" />
                  </label>
                  <label className="mt-3 block text-xs text-warm-white/60">Stream key
                    <span className="mt-1.5 flex gap-2">
                      <input type={showStreamKey ? 'text' : 'password'} value={streamKey} onChange={(event) => setStreamKey(event.target.value)} className={`${selectClass} min-w-0 flex-1`} placeholder="Paste your stream key" autoComplete="new-password" spellCheck={false} />
                      <button type="button" aria-label={showStreamKey ? 'Hide stream key' : 'Show stream key'} title={showStreamKey ? 'Hide stream key' : 'Show stream key'} onClick={() => setShowStreamKey((visible) => !visible)} className="rounded-lg border border-white/10 px-3 text-warm-white/70 hover:bg-white/5">{showStreamKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </span>
                  </label>
                  <p className="mt-2 text-[10px] text-warm-white/40">The key is kept only for this app session and is cleared when Studio closes.</p>
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <h3 className="text-sm font-semibold text-warm-white">Video quality</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs text-warm-white/60">Resolution
                      <select value={streamResolution} onChange={(event) => setStreamResolution(event.target.value)} className={`${selectClass} mt-1.5 w-full`}>
                        <option value="720p">720p · 1280 × 720</option>
                        <option value="1080p">1080p · 1920 × 1080</option>
                      </select>
                    </label>
                    <label className="text-xs text-warm-white/60">Frame rate
                      <select value={streamFrameRate} onChange={(event) => setStreamFrameRate(event.target.value)} className={`${selectClass} mt-1.5 w-full`}>
                        <option value="30">30 fps</option>
                        <option value="60">60 fps</option>
                      </select>
                    </label>
                    <label className="col-span-2 text-xs text-warm-white/60">Video bitrate
                      <select value={streamBitrate} onChange={(event) => setStreamBitrate(event.target.value)} className={`${selectClass} mt-1.5 w-full`}>
                        <option value="2500">2,500 kbps · Lower bandwidth</option>
                        <option value="4500">4,500 kbps · Balanced</option>
                        <option value="6000">6,000 kbps · Higher quality</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-warm-white/40">These are the requested output settings. They take effect when a streaming encoder and destination are connected.</p>
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-warm-white">Audio check</h3>
                      <p className="mt-1 text-xs text-warm-white/50">{streamAudioStatus} · {streamAudioPercent.toFixed(0)}% peak</p>
                    </div>
                    <div className="flex h-4 w-32 gap-0.5" aria-label={`Audio level ${streamAudioPercent.toFixed(0)} percent`}>
                      {Array.from({ length: 18 }, (_, index) => <span key={index} className={`flex-1 rounded-sm ${streamAudioPercent >= ((index + 1) / 18) * 100 ? (index >= 15 ? 'bg-red-400' : index >= 12 ? 'bg-yellow-400' : 'bg-emerald-400') : 'bg-white/10'}`} />)}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {mixerChannels.map((channel) => {
                      const source = sources.find((item) => item.id === channel.id);
                      const liveTrack = source?.stream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false;
                      const status = !source?.visible || channel.muted ? 'Muted' : liveTrack ? ((audioLevels[channel.id] ?? 0) > 0.002 ? 'Receiving audio' : 'Listening') : 'Not connected';
                      return <div key={channel.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 text-warm-white/75"><channel.icon size={14} /><span className="truncate">{channel.name}</span></span>
                        <span className={status === 'Receiving audio' ? 'text-emerald-300' : 'text-warm-white/45'}>{status}</span>
                        {source?.stream && <MonitorAudioTrack stream={source.stream} enabled={audioMonitor && liveTrack && source.visible && !channel.muted} volume={10 ** (channel.db / 20)} />}
                      </div>;
                    })}
                    {!mixerChannels.length && <p className="text-xs text-warm-white/45">No microphone or desktop audio sources are in this scene yet.</p>}
                  </div>
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <Switch label="Monitor audio in headphones" on={audioMonitor} onChange={setAudioMonitor} />
                    <p className="mt-1 text-[10px] text-warm-white/40">Use headphones to avoid hearing your microphone through your speakers.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="min-w-0 text-xs">
                {streamConnectError ? <p role="alert" className="text-red-300">{streamConnectError}</p> : <p className="text-warm-white/45">FaithStream will send the On-air program and enabled audio sources to Facebook over RTMPS.</p>}
                {streamStatus === 'error' && streamMessage && <p role="status" className="mt-1 text-red-300">{streamMessage}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setGoLiveSetupOpen(false); setAudioMonitor(false); }} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
                <button onClick={() => { void startLive(); }} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110"><Radio size={16} />Go Live</button>
              </div>
            </div>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="studio-settings-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="studio-settings-title" className="text-lg font-bold text-warm-white">Studio settings</h2>
                <p className="mt-1 text-sm text-warm-white/55">A few controls for presenting and going live.</p>
              </div>
              <button aria-label="Close settings" onClick={() => setSettingsOpen(false)} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </div>
            <div className="mt-5 rounded-xl border border-white/10 p-4">
              <h3 className="text-sm font-semibold text-warm-white">Keyboard shortcuts</h3>
              <dl className="mt-3 flex flex-col gap-2 text-sm">
                <div className="flex justify-between text-warm-white/65"><dt>Next slide</dt><dd className="text-warm-white">→ / ↓ / Page Down</dd></div>
                <div className="flex justify-between text-warm-white/65"><dt>Previous slide</dt><dd className="text-warm-white">← / ↑ / Page Up</dd></div>
              </dl>
            </div>
            <div className="mt-3 rounded-xl border border-white/10 p-4">
              <Switch
                label="Confirm before ending a stream"
                on={confirmEndStream}
                onChange={(value) => {
                  setConfirmEndStream(value);
                  localStorage.setItem('faithstream.studio-confirm-end', String(value));
                }}
              />
            </div>
          </section>
        </div>
      )}
      {sourceEditor && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceEditor(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="source-editor-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="source-editor-title" className="text-lg font-bold text-warm-white">Edit text overlay</h2>
                <p className="mt-1 text-sm text-warm-white/55">This text appears over the scene preview.</p>
              </div>
              <button aria-label="Close text editor" onClick={() => setSourceEditor(null)} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </div>
            <textarea autoFocus value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} aria-label="Overlay text" className="mt-4 min-h-28 w-full resize-y rounded-lg border border-white/15 bg-navy p-3 text-sm text-warm-white outline-none focus:border-brand" placeholder="Type the text for your overlay" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSourceEditor(null)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
              <button onClick={saveSourceText} disabled={!sourceDraft.trim()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:opacity-40">Save text</button>
            </div>
          </section>
        </div>
      )}
      <ConfirmationModal
        open={endStreamConfirmOpen}
        title="End the live stream?"
        message="This will stop the current stream. You can go live again afterward."
        confirmLabel="End stream"
        onCancel={() => setEndStreamConfirmOpen(false)}
        onConfirm={() => { finishLive(); setEndStreamConfirmOpen(false); }}
      />
      <ConfirmationModal
        open={sceneToDelete !== null}
        title="Delete scene?"
        message={sceneToDelete ? `Delete “${sceneToDelete.name}” and remove it from Studio? This cannot be undone.` : ''}
        onCancel={() => setSceneToDelete(null)}
        onConfirm={() => { if (sceneToDelete) sceneDeleteTab === 'slideshow' ? removeSlideshowScene(sceneToDelete) : removeScene(sceneToDelete); }}
      />
    </div>
  );
}

/** Full-screen, control-free slideshow output rendered in a separate monitor window. */
export function StudioDisplayOutput() {
  const [outputMode, setOutputMode] = useState<'stream' | 'slideshow'>(() => localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? 'stream' : 'slideshow');
  const [scenes, setScenes] = useState<Scene[]>(() => outputMode === 'stream' ? loadStudioScenes() : loadSlideshowScenes());
  const [currentRef, setCurrentRef] = useState<Ref>(() => {
    try {
      const key = localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Ref | null;
      if (saved && Number.isFinite(saved.sceneId) && Number.isFinite(saved.slideIdx)) return saved;
    } catch { /* Start from the first available slide. */ }
    const firstScene = (localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? loadStudioScenes() : loadSlideshowScenes())[0];
    return { sceneId: firstScene?.id ?? 0, slideIdx: 0 };
  });
  const [assets, setAssets] = useState<Record<string, { type: 'image' | 'video'; url: string }>>({});

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    void readStudioMedia().then((media) => {
      if (!active) return;
      const next: Record<string, { type: 'image' | 'video'; url: string }> = {};
      for (const asset of media) {
        const url = URL.createObjectURL(asset.blob);
        urls.push(url);
        next[asset.id] = { type: asset.type, url };
      }
      setAssets(next);
    }).catch(() => setAssets({}));
    const onStorage = (event: StorageEvent) => {
      if (event.key === STUDIO_DISPLAY_MODE_KEY) {
        const mode = event.newValue === 'stream' ? 'stream' : 'slideshow';
        setOutputMode(mode);
        setScenes(mode === 'stream' ? loadStudioScenes() : loadSlideshowScenes());
        const key = mode === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
        try {
          const next = JSON.parse(localStorage.getItem(key) ?? 'null') as Ref | null;
          if (next && Number.isFinite(next.sceneId) && Number.isFinite(next.slideIdx)) setCurrentRef(next);
        } catch { /* Keep the current output while a new mode initializes. */ }
      }
      if (event.key === STUDIO_SLIDESHOW_SCENES_KEY && localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) !== 'stream') setScenes(loadSlideshowScenes());
      if (event.key === STUDIO_SCENES_KEY && localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream') setScenes(loadStudioScenes());
      const activeRefKey = localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
      if (event.key === activeRefKey && event.newValue) {
        try {
          const next = JSON.parse(event.newValue) as Ref;
          if (Number.isFinite(next.sceneId) && Number.isFinite(next.slideIdx)) setCurrentRef(next);
        } catch { /* Ignore incomplete updates. */ }
      }
    };
    window.addEventListener('storage', onStorage);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void window.faithstreamWindow?.closeStudioDisplay();
        return;
      }
      const direction = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key) ? 1
        : ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
      if (!direction) return;
      event.preventDefault();
      const mode = localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? 'stream' : 'slideshow';
      const outputKey = mode === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
      setCurrentRef((current) => {
        const scene = (mode === 'stream' ? loadStudioScenes() : loadSlideshowScenes()).find((item) => item.id === current.sceneId);
        const count = scene?.slides.length ?? 0;
        if (!count) return current;
        const next = { ...current, slideIdx: (current.slideIdx + direction + count) % count };
        try { localStorage.setItem(outputKey, JSON.stringify(next)); } catch { /* Keep the current output visible. */ }
        return next;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      active = false;
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('keydown', onKeyDown);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const scene = scenes.find((item) => item.id === currentRef.sceneId) ?? scenes[0];
  const slide = scene?.slides[currentRef.slideIdx];
  const asset = slide?.bgAssetId ? assets[slide.bgAssetId] : undefined;
  const outputSlide = slide ? {
    ...slide,
    bgImage: asset?.type === 'image' ? asset.url : slide.bgImage,
    bgVideo: asset?.type === 'video' ? asset.url : slide.bgVideo,
  } : undefined;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black" style={{ containerType: 'inline-size' }} aria-label="Slideshow output">
      <SlideView bg={scene?.bg ?? 'from-black to-black'} slide={outputSlide} scale={10} minRem={0.75} maxRem={8} />
    </main>
  );
}
