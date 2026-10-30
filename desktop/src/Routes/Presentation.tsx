import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowRight,
  Bold,
  BookOpen,
  Circle as CircleIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Italic,
  LayoutTemplate,
  Loader2,
  FolderOpen,
  Lock,
  MoreHorizontal,
  Minus,
  Play,
  Plus,
  Save,
  Shapes,
  Square,
  Star,
  Trash2,
  Triangle,
  Timer,
  Type,
  Upload,
  Unlock,
  Underline,
  Video,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import ScripturePickerModal from '../components/modal/ScripturePickerModal';
import ConfirmationModal from '../components/modal/ConfirmationModal';
import CountdownDisplay, { type CountdownSettings } from '../components/CountdownDisplay';
import { formatMediaSizeInKb, prepareMediaFile } from '../utils/mediaOptimization';
import GOOGLE_FONT_FAMILIES from '../data/google-font-families.json';

/* ---------- Types & data ---------- */

type Align = 'left' | 'center' | 'right';

type TextBox = {
  text: string; // first line = title, other lines = subtitle
  layerOrder?: number | 'back' | 'front';
  font: string;
  size: number; // px on a 1280 x 720 slide
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: Align;
  shadow: boolean;
  boxBg: string;
  boxBgOn: boolean;
  autoSize: boolean;
  lineHeight: number;
  letterSpacing: number;
  x: number; // position + size in % of the slide
  y: number;
  w: number;
  h: number;
};

type PictureT = { id: number; src: string; x: number; y: number; w: number; h: number; mediaType?: 'image' | 'video'; assetId?: string; muted?: boolean; aspectRatio?: number; layerOrder?: number | 'back' | 'front' };
type ShapeT = { id: number; kind: 'rectangle' | 'circle' | 'triangle' | 'line' | 'star' | 'arrow'; x: number; y: number; w: number; h: number; fill: string; layerOrder?: number };
type MediaAsset = { id: string; name: string; type: 'image' | 'video'; category?: 'background' | 'slide'; blob: Blob; originalBlob?: Blob; optimized?: boolean; createdAt: number; url: string };
type StoredMediaAsset = Omit<MediaAsset, 'url'>;

type SlideT = {
  id: number;
  title: string;
  bg: string; // tailwind gradient classes
  dim: number; // 0-80, % darkening over the background
  bgImage?: string;
  bgPosition?: { x: number; y: number };
  bgVideo?: string;
  bgVideoMuted?: boolean;
  bgAssetId?: string;
  bgPictureRestore?: PictureT;
  box: TextBox | null;
  extraBoxes?: { id: number; box: TextBox }[];
  pictures?: PictureT[];
  shapes?: ShapeT[];
  countdown?: CountdownSettings;
  locked?: boolean;
};

const FONTS: Record<string, string> = {
  Montserrat: "'Montserrat', 'Segoe UI', sans-serif",
  Poppins: "'Poppins', 'Segoe UI', sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  'Arial Black': "'Arial Black', Arial, sans-serif",
  Calibri: "Calibri, 'Segoe UI', sans-serif",
  Cambria: "Cambria, Georgia, serif",
  Candara: "Candara, 'Segoe UI', sans-serif",
  'Century Gothic': "'Century Gothic', 'Segoe UI', sans-serif",
  'Comic Sans MS': "'Comic Sans MS', 'Segoe UI', sans-serif",
  Consolas: "Consolas, 'Courier New', monospace",
  'Courier New': "'Courier New', monospace",
  'Franklin Gothic Medium': "'Franklin Gothic Medium', 'Arial Narrow', sans-serif",
  Garamond: "Garamond, 'Times New Roman', serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  Impact: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
  'Lucida Console': "'Lucida Console', Monaco, monospace",
  'Lucida Sans Unicode': "'Lucida Sans Unicode', 'Lucida Grande', sans-serif",
  'Palatino Linotype': "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
  'Segoe Print': "'Segoe Print', 'Segoe UI', sans-serif",
  'Segoe UI': "'Segoe UI', Tahoma, sans-serif",
  Tahoma: "Tahoma, 'Segoe UI', sans-serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Trebuchet MS': "'Trebuchet MS', 'Segoe UI', sans-serif",
  Verdana: "Verdana, Geneva, sans-serif",
};
const GOOGLE_FONTS = GOOGLE_FONT_FAMILIES as string[];
const requestedGoogleFonts = new Set<string>();
const loadGoogleFont = (family: string) => {
  if (!GOOGLE_FONTS.includes(family) || requestedGoogleFonts.has(family)) return;
  requestedGoogleFonts.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
  document.head.appendChild(link);
};

const BGS = [
  'from-orange-400/80 via-indigo-800 to-slate-900',
  'from-stone-600 to-stone-950',
  'from-indigo-500 to-blue-950',
  'from-rose-500/80 to-amber-900',
  'from-slate-600 to-slate-950',
  'from-sky-700 to-slate-950',
  'from-emerald-700 to-slate-900',
  'from-purple-700 via-indigo-900 to-slate-950',
];

const defaultBox = (text: string, size = 96): TextBox => ({
  text,
  font: 'Montserrat',
  size,
  color: '#FFFFFF',
  bold: true,
  italic: false,
  underline: false,
  align: 'center',
  shadow: true,
  boxBg: '#CB874C',
  boxBgOn: false,
  autoSize: true,
  lineHeight: 1.15,
  letterSpacing: 0,
  x: 15,
  y: 25,
  w: 70,
  h: 50,
});

const TEMPLATES = [
  { label: 'Worship', bg: BGS[0], text: 'Worship\nOur God is worthy', size: 96 },
  {
    label: 'Scripture',
    bg: BGS[1],
    text: 'Psalm 46:1\nGod is our refuge and strength, a very present help in trouble.',
    size: 64,
  },
  { label: 'Lyrics', bg: BGS[7], text: 'Song title\nLyrics go here', size: 80 },
  { label: 'Announcement', bg: BGS[2], text: 'Church\nAnnouncements', size: 88 },
  { label: 'Custom Background', bg: BGS[5], text: 'Your text here', size: 96 },
];

const TEXT_PRESETS = [
  { label: 'Title + subtitle', text: 'Title\nSubtitle goes here', size: 96 },
];

let nextId = 100;
const makeSlide = (t: { bg: string; text: string; size: number; label?: string }): SlideT => ({
  id: nextId++,
  title: t.label ?? t.text.split('\n')[0] ?? 'Untitled slide',
  bg: t.bg,
  dim: 25,
  box: defaultBox(t.text, t.size),
});

const INITIAL: SlideT[] = [
  { bg: BGS[0], text: "Welcome\nWe're so glad you're here", size: 96 },
  { bg: BGS[5], text: 'Worship\nOur God is worthy', size: 96 },
  { bg: BGS[1], text: 'Psalm 46:1\nGod is our refuge and strength, a very present help in trouble.', size: 64 },
  { bg: BGS[7], text: 'Lyrics\nAdd your lyrics here', size: 80 },
  { bg: BGS[3], text: 'God Bless You\nSee you next time', size: 88 },
].map(makeSlide);

const STORAGE_KEY = 'faithstream.presentation';
const PROJECTS_STORAGE_KEY = 'faithstream.presentations';
const PRESENTATION_API_URL = ((import.meta as ImportMeta & { env: { VITE_FAITHSTREAM_API_URL?: string } }).env.VITE_FAITHSTREAM_API_URL ?? 'http://127.0.0.1:8000/api').replace(/\/$/, '');
const MEDIA_DB = 'faithstream.media';
const MEDIA_STORE = 'assets';

type PresentationProject = { id: string; name: string; slides: SlideT[]; updatedAt: number; locked?: boolean; deviceOnly?: boolean; hasLocalMedia?: boolean };
type SyncedPresentation = Pick<PresentationProject, 'id' | 'name' | 'slides' | 'updatedAt'> & { hasLocalMedia?: boolean };
type DeleteConfirmation = { title: string; message: string; onConfirm: () => void };

const prepareProjectForAccountSync = (project: PresentationProject): SyncedPresentation => {
  let hasLocalMedia = Boolean(project.hasLocalMedia);
  const slides = project.slides.map((slide) => {
    if (slide.bgAssetId || slide.bgImage || slide.bgVideo) hasLocalMedia = true;
    const slideWithoutLocalBackground = { ...slide };
    delete slideWithoutLocalBackground.bgAssetId;
    delete slideWithoutLocalBackground.bgImage;
    delete slideWithoutLocalBackground.bgVideo;
    if (slide.bgPictureRestore) hasLocalMedia = true;
    delete slideWithoutLocalBackground.bgPictureRestore;
    const pictures = (slide.pictures ?? []).filter((picture) => {
      if (picture.assetId || picture.src) {
        hasLocalMedia = true;
        return false;
      }
      return true;
    });
    return { ...slideWithoutLocalBackground, pictures };
  });

  return { id: project.id, name: project.name, slides, updatedAt: project.updatedAt, hasLocalMedia };
};

const loadProjects = (): PresentationProject[] => {
  try {
    const rawProjects = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (rawProjects) {
      const parsed = JSON.parse(rawProjects) as PresentationProject[];
      if (Array.isArray(parsed)) {
        const ids = parsed.flatMap((project) => project.slides.map((slide) => slide.id));
        if (ids.length) nextId = Math.max(nextId, ...ids) + 1;
        return parsed;
      }
    }
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (legacyRaw) {
      const slides = JSON.parse(legacyRaw) as SlideT[];
      if (Array.isArray(slides) && slides.length) {
        nextId = Math.max(nextId, ...slides.map((slide) => slide.id)) + 1;
        return [{ id: 'legacy-presentation', name: 'My presentation', slides, updatedAt: Date.now() }];
      }
    }
  } catch {
    /* start with an empty presentation library */
  }
  return [];
};

const openMediaDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(MEDIA_DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readMediaAssets = async (): Promise<StoredMediaAsset[]> => {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredMediaAsset[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
    request.transaction?.addEventListener('complete', () => db.close(), { once: true });
  });
};

const saveMediaAsset = async (file: File, category: 'background' | 'slide' = 'background'): Promise<StoredMediaAsset> => {
  const prepared = await prepareMediaFile(file);
  const asset: StoredMediaAsset = { id: crypto.randomUUID(), name: file.name, type: file.type.startsWith('video/') ? 'video' : 'image', category, blob: prepared.file, originalBlob: prepared.originalFile, optimized: !!prepared.originalFile, createdAt: Date.now() };
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, 'readwrite');
    transaction.objectStore(MEDIA_STORE).put(asset);
    transaction.oncomplete = () => {
      db.close();
      window.dispatchEvent(new CustomEvent('faithstream:media-updated'));
      resolve(asset);
    };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
};

const deleteMediaAssetFromDb = async (id: string) => {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, 'readwrite');
    transaction.objectStore(MEDIA_STORE).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
};

const loadSlides = (): SlideT[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SlideT[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        nextId = Math.max(nextId, ...parsed.map((s) => s.id)) + 1;
        return parsed.map((slide) => ({ ...slide, title: slide.title || slide.box?.text.split('\n')[0] || 'Untitled slide' }));
      }
    }
  } catch {
    /* fall back to the sample slides */
  }
  return INITIAL;
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const getImageAspectRatio = (src: string) => new Promise<number>((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 32 / 44);
  image.onerror = () => resolve(32 / 44);
  image.src = src;
});
const toLocalDateTimeInput = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const slideName = (s: SlideT) => s.title;

/* ---------- Slide rendering (used by the canvas, thumbnails, templates and preview) ---------- */

function TextBoxView({ box, defaultLayerOrder = 3000 }: { box: TextBox; defaultLayerOrder?: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Auto sizing: shrink the text until it fits inside the box.
  const fit = useCallback(() => {
    const w = wrap.current;
    const i = inner.current;
    if (!w || !i) return;
    if (!box.autoSize || i.offsetHeight === 0) return setScale(1);
    setScale(Math.min(1, w.clientHeight / i.offsetHeight));
  }, [box.autoSize]);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (wrap.current) ro.observe(wrap.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [fit]);

  const shadow = box.shadow ? '0 0.3cqw 1.2cqw rgba(0,0,0,0.65)' : undefined;
  const cqw = (px: number) => `${(px / 1280) * 100}cqw`;

  return (
    <div
      ref={wrap}
      className="absolute flex items-center overflow-hidden"
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        zIndex: typeof box.layerOrder === 'number' ? box.layerOrder : box.layerOrder === 'front' ? 5000 : box.layerOrder === 'back' ? 0 : defaultLayerOrder,
        background: box.boxBgOn ? box.boxBg : undefined,
        borderRadius: '1cqw',
      }}
    >
      <div
        ref={inner}
        className="w-full whitespace-pre-wrap wrap-break-word"
        style={{
          textAlign: box.align,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
          lineHeight: box.lineHeight,
          letterSpacing: cqw(box.letterSpacing),
        }}
      >
        <div
          className="whitespace-pre-wrap"
          style={{
            fontFamily: FONTS[box.font] ?? `"${box.font.replaceAll('"', '')}", sans-serif`,
            fontSize: cqw(box.size),
            fontWeight: box.bold ? 800 : 500,
            fontStyle: box.italic ? 'italic' : 'normal',
            textDecoration: box.underline ? 'underline' : 'none',
            color: box.color,
            textShadow: shadow,
          }}
        >
          {box.text}
        </div>
      </div>
    </div>
  );
}

/** Fills its (relative, 16:9) parent. Everything inside scales with the slide's width. */
function SlideRender({ slide, onVideoSelect, editingTextBoxId }: { slide: SlideT; onVideoSelect?: (id: number) => void; editingTextBoxId?: number | null }) {
  const renderPicture = (picture: PictureT, index: number) => {
    const zIndex = typeof picture.layerOrder === 'number' ? picture.layerOrder : picture.layerOrder === 'front' ? 5000 : picture.layerOrder === 'back' ? 0 : 1000 + index;
    const style = { left: `${picture.x}%`, top: `${picture.y}%`, width: `${picture.w}%`, height: `${picture.h}%`, zIndex };
    return picture.mediaType === 'video'
      ? <video key={picture.id} data-slide-video-id={picture.id} src={picture.src} controls playsInline muted={picture.muted ?? false} onPointerDown={(event) => { event.stopPropagation(); onVideoSelect?.(picture.id); }} onClick={(event) => { event.stopPropagation(); onVideoSelect?.(picture.id); }} className="pointer-events-auto absolute object-contain" style={style} />
      : <img key={picture.id} src={picture.src} alt="" draggable={false} className="absolute object-contain" style={style} />;
  };

  return (
    <div
      className={`absolute isolate inset-0 overflow-hidden bg-linear-to-br ${slide.bg}`}
      style={{ containerType: 'inline-size' }}
    >
      {slide.bgImage && (
        <img src={slide.bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${slide.bgPosition?.x ?? 50}% ${slide.bgPosition?.y ?? 50}%` }} />
      )}
      {slide.bgVideo && (
        <video
          src={slide.bgVideo}
          autoPlay
          loop
          muted={slide.bgVideoMuted ?? true}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${slide.bgPosition?.x ?? 50}% ${slide.bgPosition?.y ?? 50}%` }}
        />
      )}
      <div className="absolute inset-0 bg-black" style={{ opacity: slide.dim / 100 }} />
      {slide.pictures?.map(renderPicture)}
      {slide.shapes?.map((shape, index) => <div key={shape.id} className="absolute" style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.w}%`, height: `${shape.h}%`, zIndex: shape.layerOrder ?? 2000 + index, backgroundColor: shape.fill, borderRadius: shape.kind === 'circle' ? '50%' : undefined, clipPath: shape.kind === 'triangle' ? 'polygon(50% 0, 0 100%, 100% 100%)' : shape.kind === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 93%, 50% 72%, 21% 93%, 32% 57%, 2% 35%, 39% 35%)' : shape.kind === 'arrow' ? 'polygon(0 30%, 65% 30%, 65% 0, 100% 50%, 65% 100%, 65% 70%, 0 70%)' : undefined }} />)}
      {slide.box && editingTextBoxId !== null && <TextBoxView box={slide.box} />}
      {slide.extraBoxes?.filter(({ id }) => editingTextBoxId !== id).map(({ id, box }, index) => <TextBoxView key={id} box={box} defaultLayerOrder={3001 + index} />)}
      {slide.countdown && <CountdownDisplay countdown={slide.countdown} />}
    </div>
  );
}

/* ---------- Small UI pieces ---------- */

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

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${on ? 'bg-brand' : 'bg-white/15'}`}
    >
      <span
        className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`}
      />
    </button>
  );
}

function IconBtn({
  active = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
        active ? 'bg-white/15 text-brand' : 'text-warm-white/70 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  );
}

function ColorField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-warm-white/80">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-6 w-6 cursor-pointer rounded border border-white/20 bg-transparent p-0"
      />
      <span className="tabular-nums">{value}</span>
    </label>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/10 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm text-warm-white"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-warm-white/50">{children}</p>;
}

function ActionCard({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-full w-37.5 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 px-2 text-center transition hover:border-brand hover:bg-brand/5"
    >
      <Icon size={20} className="text-brand" />
      <span className="text-sm font-medium text-warm-white">{label}</span>
      <span className="text-[11px] text-warm-white/50">{hint}</span>
    </button>
  );
}

const fieldClass =
  'w-full rounded-lg border border-white/10 bg-navy px-2.5 py-1.5 text-sm text-warm-white outline-none focus:border-brand';

/* ---------- Full-screen preview ---------- */

function PreviewOverlay({
  slides,
  start,
  onClose,
}: {
  slides: SlideT[];
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);

  useEffect(() => {
    void window.faithstreamWindow?.setPresentationFullscreen(true);
    return () => { void window.faithstreamWindow?.setPresentationFullscreen(false); };
  }, []);

  useEffect(() => {
    const go = (d: number) => setI((v) => clamp(v + d, 0, slides.length - 1));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Slide preview"
      className="group fixed inset-0 z-50 flex items-center justify-center bg-black"
    >
      <div
        className="relative"
        style={{ width: 'min(100vw, calc(100vh * 16 / 9))', aspectRatio: '16 / 9' }}
      >
        <SlideRender slide={slides[i]} />
      </div>
      <button
        aria-label="Close preview"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white shadow-lg hover:bg-white/25"
      >
        <X size={18} />
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex items-center justify-center gap-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); setI((v) => clamp(v - 1, 0, slides.length - 1)); }}
          disabled={i === 0}
          className="pointer-events-auto rounded-lg border border-white/20 bg-black/65 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-black/85 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="rounded-md bg-black/50 px-3 py-2 text-xs text-white/75 backdrop-blur">
          {i + 1} / {slides.length}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setI((v) => clamp(v + 1, 0, slides.length - 1)); }}
          disabled={i === slides.length - 1}
          className="pointer-events-auto rounded-lg border border-white/20 bg-black/65 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur hover:bg-black/85 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
type PropsTab = 'Content' | 'Style' | 'Background';
type Dock = 'Templates' | 'Text' | 'Scripture' | 'Media' | 'Shapes';

const DOCK: { key: Dock; icon: LucideIcon; hint: string }[] = [
  { key: 'Templates', icon: LayoutTemplate, hint: 'Click a template to add it as a new slide' },
  { key: 'Text', icon: Type, hint: 'Add another independent text box to this slide' },
  { key: 'Scripture', icon: BookOpen, hint: 'Find a verse and add it to this slide' },
  { key: 'Media', icon: ImageIcon, hint: 'Add pictures and video backgrounds' },
  { key: 'Shapes', icon: Shapes, hint: 'Coming soon' },
];

const ZOOMS: Record<string, number> = { '100%': 1, '75%': 0.75, '50%': 0.5 };

const HANDLES: Record<Exclude<Mode, 'move'>, string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
};

export default function Presentation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [slides, setSlides] = useState<SlideT[]>(loadSlides);
  const [projects, setProjects] = useState<PresentationProject[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<PropsTab>('Content');
  const [dock, setDock] = useState<Dock>('Templates');
  const [zoom, setZoom] = useState('100%');
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [projectMenuFor, setProjectMenuFor] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [videoPreviewAsset, setVideoPreviewAsset] = useState<MediaAsset | null>(null);
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [draggingSlide, setDraggingSlide] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [scripturePickerOpen, setScripturePickerOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [mediaImporting, setMediaImporting] = useState<string | null>(null);
  const [slideImportProgress, setSlideImportProgress] = useState<{ message: string; current: number; total: number } | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [isBoxSelected, setIsBoxSelected] = useState(false);
  const [selectedPictureId, setSelectedPictureId] = useState<number | null>(null);
  const [pictureMenu, setPictureMenu] = useState<{ kind: 'picture' | 'text' | 'background'; id: number | null; x: number; y: number } | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);
  const [selectedCountdown, setSelectedCountdown] = useState(false);
  const [backgroundEditing, setBackgroundEditing] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState('');
  const [accountSyncStatus, setAccountSyncStatus] = useState('Connecting to your account…');
  const fontPickerRef = useRef<HTMLDivElement>(null);
  const undoHistoryRef = useRef<SlideT[][]>([]);
  const previousSlidesRef = useRef(slides);
  const skipUndoRecordingRef = useRef(false);
  const undoHistoryProjectRef = useRef(activeProjectId);
  const originalProjectRef = useRef<PresentationProject | null>(null);
  const newDraftProjectIdRef = useRef<string | null>(null);
  const accountTokenRef = useRef<string | null>(null);
  const accountSyncReadyRef = useRef(false);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  useLayoutEffect(() => {
    if (undoHistoryProjectRef.current !== activeProjectId) {
      undoHistoryProjectRef.current = activeProjectId;
      undoHistoryRef.current = [];
      previousSlidesRef.current = slides;
      skipUndoRecordingRef.current = false;
      return;
    }
    if (skipUndoRecordingRef.current) {
      skipUndoRecordingRef.current = false;
      previousSlidesRef.current = slides;
      return;
    }
    if (previousSlidesRef.current !== slides) {
      undoHistoryRef.current.push(previousSlidesRef.current);
      if (undoHistoryRef.current.length > 100) undoHistoryRef.current.shift();
      previousSlidesRef.current = slides;
    }
  }, [slides, activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    const connectAndLoadAccountProjects = async () => {
      const token = await window.faithstreamWindow?.getAuthToken();
      if (!token) {
        if (!cancelled) setAccountSyncStatus('Local only — sign in to sync presentations');
        return;
      }

      accountTokenRef.current = token;
      try {
        const response = await fetch(`${PRESENTATION_API_URL}/presentations`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!response.ok) throw new Error('Could not load presentations from your account.');
        const result = await response.json() as { presentations?: SyncedPresentation[] };
        const remoteProjects = Array.isArray(result.presentations) ? result.presentations : [];
        if (cancelled) return;

        const merged = new Map<string, PresentationProject>();
        for (const project of remoteProjects) {
          merged.set(project.id, { ...project, hasLocalMedia: Boolean(project.hasLocalMedia) });
        }
        for (const existingProject of projectsRef.current) {
          const project = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existingProject.id)
            ? existingProject
            : { ...existingProject, id: crypto.randomUUID() };
          const remote = merged.get(project.id);
          if (!remote || project.updatedAt >= remote.updatedAt) merged.set(project.id, project);
        }
        const next = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
        accountSyncReadyRef.current = true;
        setProjects(next);
        setAccountSyncStatus('Connected — syncing presentations');
      } catch {
        if (cancelled) return;
        accountSyncReadyRef.current = true;
        setAccountSyncStatus('Offline — changes are saved on this device');
      }
    };

    void connectAndLoadAccountProjects().catch(() => {
      if (!cancelled) setAccountSyncStatus('Local only — unable to connect to the account server');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!accountSyncReadyRef.current || !accountTokenRef.current) return;
    const token = accountTokenRef.current;
    const syncableProjects = projects.filter((project) => !project.deviceOnly && project.id !== activeProjectId);
    if (!syncableProjects.length) {
      if (projects.some((project) => project.deviceOnly)) {
        setAccountSyncStatus('Connected — imported slide files stay on this device');
      } else if (activeProjectId) {
        setAccountSyncStatus('Connected — save this presentation to sync it');
      } else {
        setAccountSyncStatus('Connected — no presentations to sync yet');
      }
      return;
    }

    setAccountSyncStatus('Syncing presentations…');
    const timeout = window.setTimeout(() => {
      void Promise.all(syncableProjects.map(async (project) => {
        const payload = prepareProjectForAccountSync(project);
        const response = await fetch(`${PRESENTATION_API_URL}/presentations/${encodeURIComponent(project.id)}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Account sync failed.');
      })).then(() => {
        setAccountSyncStatus('Synced to your account · imported media stays on this device');
      }).catch(() => {
        setAccountSyncStatus('Sync failed — check your connection; this device still has its local copy');
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [projects, activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    readMediaAssets().then((stored) => {
      const assets = stored.map((asset) => ({ ...asset, url: URL.createObjectURL(asset.blob) }));
      urls = assets.map((asset) => asset.url);
      if (cancelled) { urls.forEach(URL.revokeObjectURL); return; }
      setMediaAssets(assets);
      skipUndoRecordingRef.current = true;
      setSlides((current) => current.map((slide) => {
        const asset = assets.find((item) => item.id === slide.bgAssetId);
        const pictures = slide.pictures?.map((picture) => {
          const pictureAsset = picture.assetId ? assets.find((item) => item.id === picture.assetId) : undefined;
          return pictureAsset ? { ...picture, src: pictureAsset.url } : picture;
        });
        const restoreAsset = slide.bgPictureRestore?.assetId ? assets.find((item) => item.id === slide.bgPictureRestore?.assetId) : undefined;
        const bgPictureRestore = restoreAsset && slide.bgPictureRestore ? { ...slide.bgPictureRestore, src: restoreAsset.url } : slide.bgPictureRestore;
        return { ...slide, ...(asset ? { bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined } : {}), bgPictureRestore, pictures };
      }));
      setProjects((current) => current.map((project) => ({
        ...project,
        slides: project.slides.map((slide) => {
          const asset = assets.find((item) => item.id === slide.bgAssetId);
          const pictures = slide.pictures?.map((picture) => {
            const pictureAsset = picture.assetId ? assets.find((item) => item.id === picture.assetId) : undefined;
            return pictureAsset ? { ...picture, src: pictureAsset.url } : picture;
          });
          const restoreAsset = slide.bgPictureRestore?.assetId ? assets.find((item) => item.id === slide.bgPictureRestore?.assetId) : undefined;
          const bgPictureRestore = restoreAsset && slide.bgPictureRestore ? { ...slide.bgPictureRestore, src: restoreAsset.url } : slide.bgPictureRestore;
          return { ...slide, ...(asset ? { bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined } : {}), bgPictureRestore, pictures };
        }),
      })));
    }).catch(() => { if (!cancelled) setStatus('Could not load the media library'); });
    return () => { cancelled = true; urls.forEach(URL.revokeObjectURL); };
  }, []);

  useEffect(() => {
    slides.forEach((slide) => {
      [slide.box, ...(slide.extraBoxes ?? []).map((item) => item.box)].forEach((textBox) => {
        if (textBox) loadGoogleFont(textBox.font);
      });
    });
  }, [slides]);

  useEffect(() => {
    if (!activeProjectId) return;
    const savedSlides = slides.map((slide) => ({ ...slide, bgImage: slide.bgAssetId ? undefined : slide.bgImage, bgVideo: undefined, bgPictureRestore: slide.bgPictureRestore?.assetId ? { ...slide.bgPictureRestore, src: '' } : slide.bgPictureRestore, pictures: slide.pictures?.map((picture) => picture.assetId ? { ...picture, src: '' } : picture) }));
    setProjects((current) => {
      const next = current.map((project) => project.id === activeProjectId
        ? { ...project, name: projectName.trim() || 'Untitled presentation', slides: savedSlides, updatedAt: Date.now() }
        : project);
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('faithstream:presentations-updated'));
      return next;
    });
  }, [slides, activeProjectId, projectName]);

  useEffect(() => {
    if (!fontPickerOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!fontPickerRef.current?.contains(event.target as Node)) setFontPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFontPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [fontPickerOpen]);

  const stageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const canvasTextRef = useRef<HTMLTextAreaElement>(null);
  const canvasTextMeasureRef = useRef<HTMLDivElement>(null);
  const [canvasTextScale, setCanvasTextScale] = useState(1);
  const slideImportInput = useRef<HTMLInputElement>(null);
  const contentInput = useRef<HTMLInputElement>(null);

  const cur = slides[index];
  const box = selectedBoxId === null
    ? cur.box
    : cur.extraBoxes?.find((item) => item.id === selectedBoxId)?.box ?? null;

  useLayoutEffect(() => {
    const textarea = canvasTextRef.current;
    const measure = canvasTextMeasureRef.current;
    if (!textarea || !measure || !isBoxSelected) return;
    measure.textContent = box?.text || ' ';
    const contentHeight = measure.getBoundingClientRect().height;
    const scale = box?.autoSize && contentHeight > 0 ? Math.min(1, textarea.clientHeight / contentHeight) : 1;
    setCanvasTextScale((current) => Math.abs(current - scale) > 0.001 ? scale : current);
    textarea.style.paddingTop = `${Math.max(4, (textarea.clientHeight - contentHeight * scale) / 2)}px`;
  }, [box?.text, box?.size, box?.lineHeight, box?.letterSpacing, box?.font, box?.w, box?.h, box?.autoSize, canvasTextScale, isBoxSelected, selectedBoxId, zoom]);

  useLayoutEffect(() => {
    if (!isBoxSelected) return;
    canvasTextRef.current?.focus();
  }, [isBoxSelected, selectedBoxId]);

  const selectedShape = (cur.shapes ?? []).find((shape) => shape.id === selectedShapeId);
  const selectedPicture = (cur.pictures ?? []).find((picture) => picture.id === selectedPictureId);
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const projectLocked = !!activeProject?.locked;
  const legacyImportedSlideAssetIds = new Set(projects.flatMap((project) => {
    const imageOnlyDeck = project.slides.length > 1 && project.slides.every((slide) => !!slide.bgAssetId && !slide.box && !slide.extraBoxes?.length);
    return imageOnlyDeck ? project.slides.map((slide) => slide.bgAssetId).filter((id): id is string => !!id) : [];
  }));
  const backgroundAssets = mediaAssets.filter((asset) => asset.category !== 'slide'
    && !legacyImportedSlideAssetIds.has(asset.id)
    && !/^slide\s+\d+\.png$/i.test(asset.name));
  const contentAssets = backgroundAssets;
  const allBoxes: { id: number | null; box: TextBox }[] = [
    ...(cur.box ? [{ id: null, box: cur.box }] : []),
    ...(cur.extraBoxes ?? []),
  ];
  const fontOptions = [...new Set([...GOOGLE_FONTS, ...Object.keys(FONTS)])]
    .filter((family) => family.toLocaleLowerCase().includes(fontSearch.trim().toLocaleLowerCase()))
    .slice(0, 60);

  useEffect(() => { setSelectedBoxId(null); setIsBoxSelected(false); setSelectedPictureId(null); setPictureMenu(null); setSelectedShapeId(null); setSelectedCountdown(false); setBackgroundEditing(false); setMenuFor(null); }, [index, activeProjectId]);

  /* ----- editing helpers ----- */

  const updateSlide = (patch: Partial<SlideT>) =>
    !cur.locked && setSlides((l) => l.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const updateSlideTitle = (id: number, title: string) =>
    setSlides((l) => l.map((s) => s.id === id && !s.locked ? { ...s, title } : s));

  const updateBox = (patch: Partial<TextBox>) => !cur.locked && setSlides((l) => l.map((s, i) => {
    if (i !== index) return s;
    if (selectedBoxId === null) return s.box ? { ...s, box: { ...s.box, ...patch } } : s;
    return { ...s, extraBoxes: (s.extraBoxes ?? []).map((item) => item.id === selectedBoxId ? { ...item, box: { ...item.box, ...patch } } : item) };
  }));

  const updateBoxById = (id: number | null, patch: Partial<TextBox>) => !cur.locked && setSlides((l) => l.map((s, i) => {
    if (i !== index) return s;
    if (id === null) return s.box ? { ...s, box: { ...s.box, ...patch } } : s;
    return { ...s, extraBoxes: (s.extraBoxes ?? []).map((item) => item.id === id ? { ...item, box: { ...item.box, ...patch } } : item) };
  }));

  const updatePicture = (id: number, patch: Partial<PictureT>) => !cur.locked && setSlides((l) => l.map((s, i) => i === index ? { ...s, pictures: (s.pictures ?? []).map((picture) => picture.id === id ? { ...picture, ...patch } : picture) } : s));
  const setPictureAsBackground = (id: number) => {
    const picture = cur.pictures?.find((item) => item.id === id);
    if (!picture || cur.locked) return;
    updateSlide({
      bgAssetId: picture.assetId,
      bgImage: picture.mediaType === 'video' ? undefined : picture.src,
      bgVideo: picture.mediaType === 'video' ? picture.src : undefined,
      bgVideoMuted: picture.mediaType === 'video' ? true : undefined,
      bgPosition: { x: 50, y: 50 },
      bgPictureRestore: picture.mediaType === 'video' ? undefined : picture,
      pictures: (cur.pictures ?? []).filter((item) => item.id !== id),
    });
    setSelectedPictureId(null);
    setBackgroundEditing(false);
    setPictureMenu(null);
  };
  const removeBackgroundMedia = (restorePicture: boolean) => {
    const picture = restorePicture ? cur.bgPictureRestore : undefined;
    updateSlide({
      bgAssetId: undefined,
      bgImage: undefined,
      bgVideo: undefined,
      bgVideoMuted: undefined,
      bgPosition: undefined,
      bgPictureRestore: undefined,
      pictures: picture ? [...(cur.pictures ?? []), picture] : cur.pictures,
    });
    if (picture) {
      setSelectedPictureId(picture.id);
      setSelectedBoxId(null);
      setIsBoxSelected(false);
    }
    setBackgroundEditing(false);
    setPictureMenu(null);
  };
  const moveLayer = (kind: 'picture' | 'shape' | 'text', id: number | null, action: 'front' | 'forward' | 'backward' | 'back') => {
    if (cur.locked) return;
    const objects: { key: string; kind: 'picture' | 'shape' | 'text'; id: number | null; order: number }[] = [
      ...(cur.pictures ?? []).map((item, position) => ({ key: `picture:${item.id}`, kind: 'picture' as const, id: item.id, order: typeof item.layerOrder === 'number' ? item.layerOrder : item.layerOrder === 'front' ? 5000 : item.layerOrder === 'back' ? 0 : 1000 + position })),
      ...(cur.shapes ?? []).map((item, position) => ({ key: `shape:${item.id}`, kind: 'shape' as const, id: item.id, order: item.layerOrder ?? 2000 + position })),
      ...(cur.box ? [{ key: 'text:main', kind: 'text' as const, id: null, order: typeof cur.box.layerOrder === 'number' ? cur.box.layerOrder : cur.box.layerOrder === 'front' ? 5000 : cur.box.layerOrder === 'back' ? 0 : 3000 }] : []),
      ...(cur.extraBoxes ?? []).map(({ id, box }, position) => ({ key: `text:${id}`, kind: 'text' as const, id, order: typeof box.layerOrder === 'number' ? box.layerOrder : box.layerOrder === 'front' ? 5000 : box.layerOrder === 'back' ? 0 : 3001 + position })),
    ].sort((a, b) => a.order - b.order);
    const key = `${kind}:${id ?? 'main'}`;
    const currentIndex = objects.findIndex((item) => item.key === key);
    if (currentIndex < 0) return;
    const [moving] = objects.splice(currentIndex, 1);
    const targetIndex = action === 'front' ? objects.length : action === 'back' ? 0 : action === 'forward' ? Math.min(currentIndex + 1, objects.length) : Math.max(0, currentIndex - 1);
    objects.splice(targetIndex, 0, moving);
    setSlides((items) => items.map((slide, slideIndex) => {
      if (slideIndex !== index) return slide;
      return {
        ...slide,
        pictures: slide.pictures?.map((item) => ({ ...item, layerOrder: objects.findIndex((entry) => entry.key === `picture:${item.id}`) * 10 })),
        shapes: slide.shapes?.map((item) => ({ ...item, layerOrder: objects.findIndex((entry) => entry.key === `shape:${item.id}`) * 10 })),
        box: slide.box ? { ...slide.box, layerOrder: objects.findIndex((entry) => entry.key === 'text:main') * 10 } : slide.box,
        extraBoxes: slide.extraBoxes?.map((item) => ({ ...item, box: { ...item.box, layerOrder: objects.findIndex((entry) => entry.key === `text:${item.id}`) * 10 } })),
      };
    }));
    setPictureMenu(null);
  };
  const duplicatePicture = (id: number) => {
    const picture = cur.pictures?.find((item) => item.id === id);
    if (!picture || cur.locked) return;
    const duplicate = { ...picture, id: nextId++, x: clamp(picture.x + 4, 0, 100 - picture.w), y: clamp(picture.y + 4, 0, 100 - picture.h) };
    updateSlide({ pictures: [...(cur.pictures ?? []), duplicate] });
    setSelectedPictureId(duplicate.id);
    setPictureMenu(null);
  };
  const duplicateTextBox = (id: number | null) => {
    const source = id === null ? cur.box : cur.extraBoxes?.find((item) => item.id === id)?.box;
    if (!source || cur.locked) return;
    const duplicateId = nextId++;
    const duplicate = { ...source, x: clamp(source.x + 4, 0, 100 - source.w), y: clamp(source.y + 4, 0, 100 - source.h) };
    updateSlide({ extraBoxes: [...(cur.extraBoxes ?? []), { id: duplicateId, box: duplicate }] });
    setSelectedBoxId(duplicateId);
    setIsBoxSelected(true);
    setSelectedPictureId(null);
    setPictureMenu(null);
  };
  const selectPicture = (id: number) => {
    setSelectedPictureId(id);
    setSelectedShapeId(null);
    setSelectedCountdown(false);
    setSelectedBoxId(null);
    setIsBoxSelected(false);
  };
  const startBackgroundDrag = (event: RPointerEvent<HTMLDivElement>) => {
    if (!backgroundEditing || cur.locked || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const position = cur.bgPosition ?? { x: 50, y: 50 };
    const moveBackground = (pointer: PointerEvent) => {
      updateSlide({ bgPosition: {
        x: clamp(position.x - (pointer.clientX - startX) / rect.width * 100, 0, 100),
        y: clamp(position.y - (pointer.clientY - startY) / rect.height * 100, 0, 100),
      } });
    };
    const stop = () => {
      window.removeEventListener('pointermove', moveBackground);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', moveBackground);
    window.addEventListener('pointerup', stop);
  };
  const toggleSelectedVideoPlayback = () => {
    if (!selectedPicture || selectedPicture.mediaType !== 'video') return;
    const video = stageRef.current?.querySelector<HTMLVideoElement>(`video[data-slide-video-id="${selectedPicture.id}"]`);
    if (!video) return;
    if (video.paused) void video.play().catch(() => setStatus('Could not play this video. Use the player controls on the slide.'));
    else video.pause();
  };
  const updateShape = (id: number, patch: Partial<ShapeT>) => !cur.locked && setSlides((l) => l.map((s, i) => i === index ? { ...s, shapes: (s.shapes ?? []).map((shape) => shape.id === id ? { ...shape, ...patch } : shape) } : s));

  const normalizedCountdown = (countdown: CountdownSettings): Required<CountdownSettings> => ({
    targetAt: countdown.targetAt, label: countdown.label, color: countdown.color, align: countdown.align ?? 'center',
    x: countdown.x ?? 10, y: countdown.y ?? 30, w: countdown.w ?? 80, h: countdown.h ?? 40, size: countdown.size ?? 112,
  });
  const updateCountdown = (patch: Partial<CountdownSettings>) => {
    if (!cur.countdown || cur.locked) return;
    updateSlide({ countdown: { ...normalizedCountdown(cur.countdown), ...patch } });
  };

  const startCountdownInteraction = (mode: Mode) => (event: RPointerEvent) => {
    if (cur.locked || !cur.countdown || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    stageRef.current.focus({ preventScroll: true });
    setSelectedCountdown(true);
    setSelectedPictureId(null); setSelectedShapeId(null); setSelectedBoxId(null); setIsBoxSelected(false);
    setTab('Content');
    const initial = normalizedCountdown(cur.countdown);
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / rect.width * 100;
      const dy = (pointer.clientY - startY) / rect.height * 100;
      if (mode === 'move') {
        const nextX = clamp(initial.x + dx, 0, 100 - initial.w);
        const nextY = clamp(initial.y + dy, 0, 100 - initial.h);
        const others = [
          ...allBoxes.map((item) => item.box),
          ...(cur.pictures ?? []),
        ];
        const xTargets = [
          { position: 50 - initial.w / 2, line: 50 }, { position: 0, line: 0 }, { position: 100 - initial.w, line: 100 },
          ...others.flatMap((item) => [
            { position: item.x, line: item.x },
            { position: item.x + (item.w - initial.w) / 2, line: item.x + item.w / 2 },
            { position: item.x + item.w - initial.w, line: item.x + item.w },
          ]),
        ];
        const yTargets = [
          { position: 50 - initial.h / 2, line: 50 }, { position: 0, line: 0 }, { position: 100 - initial.h, line: 100 },
          ...others.flatMap((item) => [
            { position: item.y, line: item.y },
            { position: item.y + (item.h - initial.h) / 2, line: item.y + item.h / 2 },
            { position: item.y + item.h - initial.h, line: item.y + item.h },
          ]),
        ];
        const nearest = (value: number, targets: { position: number; line: number }[]) => targets
          .map((target) => ({ ...target, distance: Math.abs(value - target.position) }))
          .filter((target) => target.distance < 1.6)
          .sort((a, b) => a.distance - b.distance)[0];
        const snapX = nearest(nextX, xTargets);
        const snapY = nearest(nextY, yTargets);
        setAlignmentGuides({ x: snapX?.line ?? null, y: snapY?.line ?? null });
        updateCountdown({ x: snapX?.position ?? nextX, y: snapY?.position ?? nextY });
        return;
      }
      setAlignmentGuides({ x: null, y: null });
      const MIN = 8;
      let x = initial.x;
      let y = initial.y;
      let w = initial.w;
      let h = initial.h;
      if (mode.includes('e')) w = clamp(initial.w + dx, MIN, 100 - x);
      if (mode.includes('w')) {
        x = clamp(initial.x + dx, 0, initial.x + initial.w - MIN);
        w = initial.w + (initial.x - x);
      }
      if (mode.includes('s')) h = clamp(initial.h + dy, MIN, 100 - y);
      if (mode.includes('n')) {
        y = clamp(initial.y + dy, 0, initial.y + initial.h - MIN);
        h = initial.h + (initial.y - y);
      }
      updateCountdown({ x, y, w, h });
    };
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); setAlignmentGuides({ x: null, y: null }); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const addShape = (kind: ShapeT['kind']) => {
    if (cur.locked) return;
    const id = nextId++;
    const isLine = kind === 'line';
    updateSlide({ shapes: [...(cur.shapes ?? []), { id, kind, x: 39, y: 38, w: isLine ? 28 : 22, h: isLine ? 1.5 : 24, fill: '#CB874C' }] });
    setSelectedShapeId(id);
    setSelectedCountdown(false);
    setSelectedPictureId(null);
    setSelectedBoxId(null);
    setIsBoxSelected(false);
  };

  const startShapeDrag = (shape: ShapeT) => (event: RPointerEvent) => {
    if (cur.locked || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    stageRef.current.focus({ preventScroll: true });
    setSelectedShapeId(shape.id);
    setTab('Content');
    setSelectedPictureId(null);
    setSelectedBoxId(null);
    setIsBoxSelected(false);
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const moveShape = (pointer: PointerEvent) => updateShape(shape.id, {
      x: clamp(shape.x + (pointer.clientX - startX) / rect.width * 100, 0, 100 - shape.w),
      y: clamp(shape.y + (pointer.clientY - startY) / rect.height * 100, 0, 100 - shape.h),
    });
    const stop = () => {
      window.removeEventListener('pointermove', moveShape);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', moveShape);
    window.addEventListener('pointerup', stop);
  };

  const startShapeResize = (shape: ShapeT, handle: Exclude<Mode, 'move'>) => (event: RPointerEvent) => {
    if (cur.locked || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const resizeShape = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / rect.width * 100;
      const dy = (pointer.clientY - startY) / rect.height * 100;
      let x = shape.x;
      let y = shape.y;
      let w = shape.w;
      let h = shape.h;
      if (handle.includes('e')) w = Math.max(2, shape.w + dx);
      if (handle.includes('s')) h = Math.max(2, shape.h + dy);
      if (handle.includes('w')) { w = Math.max(2, shape.w - dx); x = shape.x + shape.w - w; }
      if (handle.includes('n')) { h = Math.max(2, shape.h - dy); y = shape.y + shape.h - h; }
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      w = Math.min(w, 100 - x);
      h = Math.min(h, 100 - y);
      updateShape(shape.id, { x, y, w, h });
    };
    const stop = () => {
      window.removeEventListener('pointermove', resizeShape);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', resizeShape);
    window.addEventListener('pointerup', stop);
  };

  const addPicture = async (file?: File) => {
    if (cur.locked || !file) return;
    setMediaImporting(file.name);
    try {
      const stored = await saveMediaAsset(file);
      const asset: MediaAsset = { ...stored, url: URL.createObjectURL(stored.blob) };
      setMediaAssets((items) => [asset, ...items.filter((item) => item.id !== asset.id)]);
      const aspectRatio = await getImageAspectRatio(asset.url);
      const width = Math.min(48, 65 * aspectRatio);
      const height = width / aspectRatio;
      const id = nextId++;
      updateSlide({ pictures: [...(cur.pictures ?? []), { id, src: asset.url, assetId: asset.id, mediaType: 'image', aspectRatio, x: (100 - width) / 2, y: (100 - height) / 2, w: width, h: height }] });
      setSelectedPictureId(id);
      setSelectedBoxId(null);
      setIsBoxSelected(false);
      setMediaImporting(null);
      flash(asset.optimized ? `Optimized copy ready (${formatMediaSizeInKb(asset.blob.size)}). Original kept in the library.` : `Added ${file.name} (${formatMediaSizeInKb(asset.blob.size)}).`);
    } catch {
      setMediaImporting(null);
      setStatus('Could not add this image to the slide');
    }
  };

  const addSlideVideo = async (file?: File) => {
    if (!file || cur.locked) return;
    setMediaImporting(file.name);
    try {
      const stored = await saveMediaAsset(file);
      const asset: MediaAsset = { ...stored, url: URL.createObjectURL(stored.blob) };
      setMediaAssets((items) => [asset, ...items.filter((item) => item.id !== asset.id)]);
      const aspectRatio = await new Promise<number>((resolve) => {
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        const fallback = window.setTimeout(() => resolve(16 / 9), 3000);
        probe.onloadedmetadata = () => { window.clearTimeout(fallback); resolve(probe.videoWidth > 0 && probe.videoHeight > 0 ? probe.videoWidth / probe.videoHeight : 16 / 9); };
        probe.onerror = () => { window.clearTimeout(fallback); resolve(16 / 9); };
        probe.src = asset.url;
      });
      const maxWidth = Math.min(72, 70 * aspectRatio);
      const width = Math.min(56, maxWidth);
      const height = width / aspectRatio;
      const id = nextId++;
      updateSlide({ pictures: [...(cur.pictures ?? []), { id, src: asset.url, assetId: asset.id, mediaType: 'video', muted: false, aspectRatio, x: (100 - width) / 2, y: (100 - height) / 2, w: width, h: height }] });
      setSelectedPictureId(id);
      setSelectedBoxId(null);
      setIsBoxSelected(false);
      setSelectedShapeId(null);
      setMediaImporting(null);
      flash(`Video added (${formatMediaSizeInKb(asset.blob.size)}). Its player controls are on the slide.`);
    } catch {
      setMediaImporting(null);
      setStatus('Could not add this video to the slide');
    }
  };

  const addContentMedia = (file?: File) => {
    if (!file) return;
    if (file.type.startsWith('video/')) void addSlideVideo(file);
    else if (file.type.startsWith('image/')) void addPicture(file);
    else setStatus('Choose an image or video file');
  };

  const addRecentContentMedia = (asset: MediaAsset) => {
    if (cur.locked) return;
    if (asset.type === 'video') {
      void (async () => {
        const aspectRatio = await new Promise<number>((resolve) => {
          const probe = document.createElement('video');
          probe.preload = 'metadata';
          const fallback = window.setTimeout(() => resolve(16 / 9), 3000);
          probe.onloadedmetadata = () => { window.clearTimeout(fallback); resolve(probe.videoWidth > 0 && probe.videoHeight > 0 ? probe.videoWidth / probe.videoHeight : 16 / 9); };
          probe.onerror = () => { window.clearTimeout(fallback); resolve(16 / 9); };
          probe.src = asset.url;
        });
        const width = Math.min(56, 70 * aspectRatio);
        const height = width / aspectRatio;
        const id = nextId++;
        updateSlide({ pictures: [...(cur.pictures ?? []), { id, src: asset.url, assetId: asset.id, mediaType: 'video', muted: false, aspectRatio, x: (100 - width) / 2, y: (100 - height) / 2, w: width, h: height }] });
        setSelectedPictureId(id);
        setSelectedBoxId(null);
        setIsBoxSelected(false);
        setSelectedShapeId(null);
      })();
      return;
    }
    void getImageAspectRatio(asset.url).then((aspectRatio) => {
      const width = Math.min(48, 65 * aspectRatio);
      const height = width / aspectRatio;
      const id = nextId++;
      updateSlide({ pictures: [...(cur.pictures ?? []), { id, src: asset.url, assetId: asset.id, mediaType: 'image', aspectRatio, x: (100 - width) / 2, y: (100 - height) / 2, w: width, h: height }] });
      setSelectedPictureId(id);
      setSelectedBoxId(null);
      setIsBoxSelected(false);
      setSelectedShapeId(null);
    });
  };

  const startPictureDrag = (picture: PictureT) => (event: RPointerEvent) => {
    if (cur.locked || event.button !== 0 || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    stageRef.current.focus({ preventScroll: true });
    setSelectedPictureId(picture.id);
    setSelectedShapeId(null);
    setSelectedCountdown(false);
    setSelectedBoxId(null);
    setIsBoxSelected(false);
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const movePicture = (pointer: PointerEvent) => {
      const rawX = clamp(picture.x + (pointer.clientX - startX) / rect.width * 100, 0, 100 - picture.w);
      const rawY = clamp(picture.y + (pointer.clientY - startY) / rect.height * 100, 0, 100 - picture.h);
      const objects = [
        ...allBoxes.map((item) => item.box),
        ...(cur.pictures ?? []).filter((item) => item.id !== picture.id),
      ];
      const xs = [{ position: 50 - picture.w / 2, line: 50 }, { position: 0, line: 0 }, { position: 100 - picture.w, line: 100 }, ...objects.flatMap((item) => [
        { position: item.x, line: item.x }, { position: item.x + (item.w - picture.w) / 2, line: item.x + item.w / 2 }, { position: item.x + item.w - picture.w, line: item.x + item.w },
      ])];
      const ys = [{ position: 50 - picture.h / 2, line: 50 }, { position: 0, line: 0 }, { position: 100 - picture.h, line: 100 }, ...objects.flatMap((item) => [
        { position: item.y, line: item.y }, { position: item.y + (item.h - picture.h) / 2, line: item.y + item.h / 2 }, { position: item.y + item.h - picture.h, line: item.y + item.h },
      ])];
      const nearest = (value: number, targets: { position: number; line: number }[]) => targets.map((target) => ({ ...target, distance: Math.abs(value - target.position) })).filter((target) => target.distance < 1.6).sort((a, b) => a.distance - b.distance)[0];
      const snapX = nearest(rawX, xs);
      const snapY = nearest(rawY, ys);
      setAlignmentGuides({ x: snapX?.line ?? null, y: snapY?.line ?? null });
      updatePicture(picture.id, { x: snapX?.position ?? rawX, y: snapY?.position ?? rawY });
    };
    const stop = () => {
      window.removeEventListener('pointermove', movePicture);
      window.removeEventListener('pointerup', stop);
      setAlignmentGuides({ x: null, y: null });
    };
    window.addEventListener('pointermove', movePicture);
    window.addEventListener('pointerup', stop);
  };

  const startPictureResize = (picture: PictureT, handle: Exclude<Mode, 'move'>) => (event: RPointerEvent) => {
    if (cur.locked || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const ratio = picture.aspectRatio ?? picture.w / Math.max(1, picture.h);
    const east = handle.includes('e');
    const west = handle.includes('w');
    const south = handle.includes('s');
    const north = handle.includes('n');
    const right = picture.x + picture.w;
    const bottom = picture.y + picture.h;
    const resize = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / rect.width * 100;
      const dy = (pointer.clientY - startY) / rect.height * 100;
      const widthFromX = picture.w + (east ? dx : west ? -dx : 0);
      const widthFromY = picture.w + (south ? dy * ratio : north ? -dy * ratio : 0);
      const maxWidth = Math.min(east ? 100 - picture.x : right, (south ? 100 - picture.y : north ? bottom : 100) * ratio);
      const width = clamp(Math.abs(dx) >= Math.abs(dy * ratio) ? widthFromX : widthFromY, 8, Math.max(8, maxWidth));
      const height = width / ratio;
      const x = west ? right - width : picture.x;
      const y = north ? bottom - height : picture.y;
      updatePicture(picture.id, { x, y, w: width, h: height });
    };
    const stop = () => {
      window.removeEventListener('pointermove', resize);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', resize);
    window.addEventListener('pointerup', stop);
  };

  const deleteTextBox = (id: number | null) => {
    if (id === null) updateSlide({ box: null });
    else updateSlide({ extraBoxes: (cur.extraBoxes ?? []).filter((item) => item.id !== id) });
    setSelectedBoxId(null);
    setIsBoxSelected(false);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        const target = event.target as HTMLElement;
        const isSlideTextField = target.id === 'slide-text' || target.getAttribute('aria-label') === 'Edit text on slide';
        const isEditableField = target.isContentEditable
          || target.tagName === 'TEXTAREA'
          || (target instanceof HTMLInputElement && !['range', 'color', 'checkbox', 'radio', 'file', 'button'].includes(target.type));
        if (isEditableField && !isSlideTextField) return;
        const previousSlides = undoHistoryRef.current.pop();
        if (!previousSlides) return;
        event.preventDefault();
        skipUndoRecordingRef.current = true;
        previousSlidesRef.current = previousSlides;
        setSlides(previousSlides);
        return;
      }
      if (event.key !== 'Backspace' && event.key !== 'Delete') return;
      if (cur.locked || projectLocked) return;
      const target = event.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((!box || !isBoxSelected) && selectedPictureId === null && selectedShapeId === null && !selectedCountdown) return;
      event.preventDefault();
      if (selectedCountdown) {
        updateSlide({ countdown: undefined });
        setSelectedCountdown(false);
      } else if (selectedPictureId !== null) {
        updateSlide({ pictures: (cur.pictures ?? []).filter((picture) => picture.id !== selectedPictureId) });
        setSelectedPictureId(null);
      } else if (selectedShapeId !== null) {
        updateSlide({ shapes: (cur.shapes ?? []).filter((shape) => shape.id !== selectedShapeId) });
        setSelectedShapeId(null);
      } else deleteTextBox(selectedBoxId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [box, isBoxSelected, selectedBoxId, selectedPictureId, selectedShapeId, selectedCountdown, index, cur.locked, projectLocked]);

  const insertSlide = (s: SlideT, at = index + 1) => {
    if (projectLocked) return;
    setSlides((l) => [...l.slice(0, at), s, ...l.slice(at)]);
    setIndex(at);
  };

  const addBlank = () => insertSlide(makeSlide({ bg: BGS[4], text: 'New slide', size: 96 }));

  const duplicate = (i: number) => {
    const copy = { ...slides[i], id: nextId++, box: slides[i].box && { ...slides[i].box! } };
    insertSlide(copy, i + 1);
  };

  const remove = (i: number) => {
    if (projectLocked) return;
    const slide = slides[i];
    if (!slide) return;
    setDeleteConfirmation({
      title: 'Delete slide?',
      message: `Delete “${slide.title || `Slide ${i + 1}`}”? This cannot be undone.`,
      onConfirm: () => {
        if (slides.length === 1) {
          setSlides([makeSlide({ bg: BGS[4], text: 'New slide', size: 96 })]);
          setIndex(0);
        } else {
          setSlides((current) => current.filter((_, k) => k !== i));
          setIndex((value) => clamp(value > i ? value - 1 : value === i ? Math.max(0, i - 1) : value, 0, slides.length - 2));
        }
        setDeleteConfirmation(null);
      },
    });
  };

  const move = (i: number, d: -1 | 1) => {
    if (projectLocked) return;
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    setSlides((l) => {
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setIndex(j);
  };

  const reorderSlides = (from: number, to: number) => {
    if (projectLocked || from === to || from < 0 || to < 0 || from >= slides.length || to >= slides.length) return;
    const activeId = cur.id;
    const next = [...slides];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setSlides(next);
    setIndex(next.findIndex((slide) => slide.id === activeId));
  };

  const toggleSlideLock = (id: number) => {
    if (projectLocked) return;
    setSlides((current) => current.map((slide) => slide.id === id ? { ...slide, locked: !slide.locked } : slide));
  };

  const addText = () => {
    if (cur.locked || projectLocked) return;
    const id = nextId++;
    const newBox = { id, box: { ...defaultBox('Your text here'), x: 24, y: 34, w: 52, h: 30, size: 72 } };
    updateSlide({ extraBoxes: [...(cur.extraBoxes ?? []), newBox] });
    setSelectedBoxId(id);
    setIsBoxSelected(true);
    setSelectedCountdown(false);
    setTab('Content');
    setTimeout(() => textRef.current?.select(), 0);
  };

  const addCountdownSlide = () => {
    if (projectLocked) return;
    const countdownSlide: SlideT = {
      id: nextId++,
      title: 'Countdown',
      bg: cur.bg,
      dim: cur.dim,
      box: null,
      countdown: { targetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), label: 'Event starts in', color: '#FFFFFF', x: 10, y: 30, w: 80, h: 40, size: 112 },
    };
    setSlides((current) => {
      const next = [...current];
      next.splice(index + 1, 0, countdownSlide);
      return next;
    });
    setIndex(index + 1);
    setSelectedBoxId(null);
    setIsBoxSelected(false);
    setSelectedPictureId(null);
    setSelectedShapeId(null);
    setTab('Content');
  };

  const applyTextPreset = (p: { text: string; size: number }) => {
    if (cur.locked || projectLocked) return;
    const id = nextId++;
    const offset = (cur.extraBoxes?.length ?? 0) % 4;
    const presetBox = {
      id,
      box: {
        ...defaultBox(p.text, p.size),
        x: 15 + offset * 4,
        y: 25 + offset * 4,
        w: 70,
        h: 50,
      },
    };
    updateSlide({ extraBoxes: [...(cur.extraBoxes ?? []), presetBox] });
    setSelectedBoxId(id);
    setIsBoxSelected(true);
    setSelectedPictureId(null);
    setTab('Content');
  };

  const applyMediaAsset = (asset: MediaAsset) => {
    updateSlide({
      bgAssetId: asset.id,
      bgImage: asset.type === 'image' ? asset.url : undefined,
      bgVideo: asset.type === 'video' ? asset.url : undefined,
      bgVideoMuted: asset.type === 'video' ? (cur.bgVideoMuted ?? true) : undefined,
      bgPosition: { x: 50, y: 50 },
      bgPictureRestore: undefined,
    });
    setBackgroundEditing(false);
  };

  /* ----- drag to move / resize the text box on the canvas ----- */

  const startDrag = (mode: Mode, boxId: number | null, target: TextBox) => (e: RPointerEvent) => {
    if (cur.locked || e.button !== 0 || !stageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    stageRef.current.focus({ preventScroll: true });
    setSelectedBoxId(boxId);
    setIsBoxSelected(true);
    setSelectedPictureId(null);
    const rect = stageRef.current.getBoundingClientRect();
    const { x, y, w, h } = target;
    const sx = e.clientX;
    const sy = e.clientY;
    const MIN = 8;

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / rect.width) * 100;
      const dy = ((ev.clientY - sy) / rect.height) * 100;
      if (mode === 'move') {
        const nextX = clamp(x + dx, 0, 100 - w);
        const nextY = clamp(y + dy, 0, 100 - h);
        const others = [
          ...allBoxes.filter((item) => item.id !== boxId).map((item) => item.box),
          ...(cur.pictures ?? []),
        ];
        const xTargets = [
          { position: 50 - w / 2, line: 50 }, { position: 0, line: 0 }, { position: 100 - w, line: 100 },
          ...others.flatMap((item) => [
            { position: item.x, line: item.x },
            { position: item.x + (item.w - w) / 2, line: item.x + item.w / 2 },
            { position: item.x + item.w - w, line: item.x + item.w },
          ]),
        ];
        const yTargets = [
          { position: 50 - h / 2, line: 50 }, { position: 0, line: 0 }, { position: 100 - h, line: 100 },
          ...others.flatMap((item) => [
            { position: item.y, line: item.y },
            { position: item.y + (item.h - h) / 2, line: item.y + item.h / 2 },
            { position: item.y + item.h - h, line: item.y + item.h },
          ]),
        ];
        const nearest = (value: number, targets: { position: number; line: number }[]) => targets
          .map((target) => ({ ...target, distance: Math.abs(value - target.position) }))
          .filter((target) => target.distance < 1.6)
          .sort((a, b) => a.distance - b.distance)[0];
        const snapX = nearest(nextX, xTargets);
        const snapY = nearest(nextY, yTargets);
        setAlignmentGuides({ x: snapX?.line ?? null, y: snapY?.line ?? null });
        updateBoxById(boxId, { x: snapX?.position ?? nextX, y: snapY?.position ?? nextY });
        return;
      }
      setAlignmentGuides({ x: null, y: null });
      let nx = x;
      let ny = y;
      let nw = w;
      let nh = h;
      if (mode.includes('e')) nw = clamp(w + dx, MIN, 100 - x);
      if (mode.includes('w')) {
        nx = clamp(x + dx, 0, x + w - MIN);
        nw = w + (x - nx);
      }
      if (mode.includes('s')) nh = clamp(h + dy, MIN, 100 - y);
      if (mode.includes('n')) {
        ny = clamp(y + dy, 0, y + h - MIN);
        nh = h + (y - ny);
      }
      updateBoxById(boxId, { x: nx, y: ny, w: nw, h: nh });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setAlignmentGuides({ x: null, y: null });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ----- save / export ----- */

  // Media files are stored in IndexedDB; a slide only keeps the library asset ID.
  const serializable = (deck: SlideT[] = slides) => deck.map((s) => ({ ...s, bgImage: s.bgAssetId ? undefined : s.bgImage, bgVideo: undefined, bgPictureRestore: s.bgPictureRestore?.assetId ? { ...s.bgPictureRestore, src: '' } : s.bgPictureRestore, pictures: s.pictures?.map((picture) => picture.assetId ? { ...picture, src: '' } : picture) }));
  const presentationSnapshot = (name: string, deck: SlideT[]) => JSON.stringify({
    name: name.trim() || 'Untitled presentation',
    slides: serializable(deck),
  });
  const hasEditorChanges = () => {
    const original = originalProjectRef.current;
    return (!!activeProjectId && newDraftProjectIdRef.current === activeProjectId)
      || (!!original && presentationSnapshot(projectName, slides) !== presentationSnapshot(original.name, original.slides));
  };

  useEffect(() => {
    if (!activeProjectId) return;
    const interceptPageNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!target || target.target === '_blank') return;
      let nextPath: string;
      try {
        const hash = new URL(target.href, window.location.href).hash;
        if (!hash.startsWith('#/')) return;
        nextPath = hash.slice(1).split('?')[0];
      } catch { return; }
      if (nextPath === location.pathname || !hasEditorChanges()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPendingNavigation(nextPath);
      setLeaveConfirmationOpen(true);
    };
    document.addEventListener('click', interceptPageNavigation, true);
    return () => document.removeEventListener('click', interceptPageNavigation, true);
  }, [activeProjectId, location.pathname, projectName, slides]);

  const createProject = () => {
    const id = crypto.randomUUID();
    const name = 'Untitled presentation';
    const firstSlide = makeSlide({ bg: BGS[4], text: 'New slide', size: 96 });
    const project: PresentationProject = { id, name, slides: [firstSlide], updatedAt: Date.now() };
    const next = [project, ...projects];
    setProjects(next);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
    setSlides([firstSlide]);
    setIndex(0);
    setProjectName(name);
    setActiveProjectId(id);
    originalProjectRef.current = null;
    newDraftProjectIdRef.current = id;
    setLeaveConfirmationOpen(false);
    setDock('Templates');
  };

  const importSlideImages = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));
    const powerpoint = selectedFiles.find((file) => file.name.toLowerCase().endsWith('.pptx'));
    if (!imageFiles.length && !powerpoint) return;
    setSlideImportProgress({ message: 'Preparing slides…', current: 0, total: Math.max(1, imageFiles.length) });
    try {
      const importedSlides: SlideT[] = [];
      const importedAssets: MediaAsset[] = [];
      for (const [fileIndex, file] of imageFiles.entries()) {
        setSlideImportProgress({ message: `Saving ${file.name}`, current: fileIndex, total: imageFiles.length });
        const stored = await saveMediaAsset(file, 'slide');
        const asset: MediaAsset = { ...stored, url: URL.createObjectURL(stored.blob) };
        importedAssets.push(asset);
        const title = file.name.replace(/\.[^.]+$/, '').trim() || `Slide ${importedSlides.length + 1}`;
        importedSlides.push({
          id: nextId++,
          title,
          bg: BGS[4],
          dim: 0,
          bgImage: asset.url,
          bgAssetId: asset.id,
          box: null,
          extraBoxes: [],
          pictures: [],
          shapes: [],
        });
        setSlideImportProgress({ message: `Saving ${file.name}`, current: fileIndex + 1, total: imageFiles.length });
      }
      if (powerpoint) {
        setSlideImportProgress({ message: `Reading ${powerpoint.name}`, current: 0, total: 0 });
        const rendered = await window.faithstreamWindow?.renderPowerPointSlides(powerpoint);
        if (!rendered?.ok || !rendered.slides?.length) throw new Error(rendered?.message || 'PowerPoint rendering is unavailable.');
        setSlideImportProgress({ message: `Saving PowerPoint slides`, current: 0, total: rendered.slides.length });
        for (const [slideIndex, renderedSlide] of rendered.slides.entries()) {
          const binary = atob(renderedSlide.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          const png = new File([bytes], `${renderedSlide.name}.png`, { type: 'image/png' });
          const stored = await saveMediaAsset(png, 'slide');
          const asset: MediaAsset = { ...stored, url: URL.createObjectURL(stored.blob) };
          importedAssets.push(asset);
          importedSlides.push({
            id: nextId++,
            title: renderedSlide.name,
            bg: BGS[4],
            dim: 0,
            bgImage: asset.url,
            bgAssetId: asset.id,
            box: null,
            extraBoxes: [],
            pictures: [],
            shapes: [],
          });
          setSlideImportProgress({ message: `Saving ${renderedSlide.name}`, current: slideIndex + 1, total: rendered.slides.length });
        }
      }
      if (!importedSlides.length) throw new Error('No slides found');
      setMediaAssets((current) => [...importedAssets, ...current]);
      const sourceName = powerpoint?.name ?? imageFiles[0]?.name ?? 'Imported slides';
      const name = sourceName.replace(/\.[^.]+$/, '') || 'Imported slides';
      const project: PresentationProject = {
        id: crypto.randomUUID(),
        name,
        slides: serializable(importedSlides),
        updatedAt: Date.now(),
        deviceOnly: true,
      };
      const next = [project, ...projects];
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
      setProjects(next);
      setSlideImportProgress(null);
      const totalKb = importedAssets.reduce((sum, asset) => sum + asset.blob.size, 0);
      flash(`${importedSlides.length} ${powerpoint ? 'PowerPoint ' : ''}slide${importedSlides.length === 1 ? '' : 's'} imported with original design · ${formatMediaSizeInKb(totalKb)} media stored`);
    } catch (error) {
      setSlideImportProgress(null);
      flash(error instanceof Error ? error.message : 'Could not import these slides.');
    }
  };

  const toggleProjectLock = (id: string) => {
    const next = projects.map((project) => project.id === id
      ? { ...project, locked: !project.locked, updatedAt: Date.now() }
      : project);
    setProjects(next);
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
    setProjectMenuFor(null);
  };

  const deleteProject = (id: string) => {
    const project = projects.find((item) => item.id === id);
    if (!project) return;
    setDeleteConfirmation({
      title: 'Delete presentation?',
      message: `Delete “${project.name}” and all of its slides? This cannot be undone.`,
      onConfirm: () => {
        const next = projects.filter((item) => item.id !== id);
        setProjects(next);
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
        if (!project.deviceOnly && accountTokenRef.current) {
          void fetch(`${PRESENTATION_API_URL}/presentations/${encodeURIComponent(project.id)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accountTokenRef.current}`, Accept: 'application/json' },
          }).then((response) => {
            if (!response.ok) throw new Error('Account deletion failed.');
          }).catch(() => {
            setAccountSyncStatus('Could not remove this presentation from account sync; try again while online');
          });
        }
        window.dispatchEvent(new CustomEvent('faithstream:presentations-updated'));
        setProjectMenuFor(null);
        setDeleteConfirmation(null);
      },
    });
  };

  const openProject = (project: PresentationProject) => {
    originalProjectRef.current = { ...project, slides: serializable(project.slides) };
    newDraftProjectIdRef.current = null;
    setLeaveConfirmationOpen(false);
    setSlides(project.slides.map((slide) => {
      const asset = mediaAssets.find((item) => item.id === slide.bgAssetId);
      return asset ? { ...slide, bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined } : slide;
    }));
    setIndex(0);
    setProjectName(project.name);
    setActiveProjectId(project.id);
    setStatus('');
  };

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 2500);
  };

  const deleteMediaAsset = async (asset: MediaAsset) => {
    try {
      await deleteMediaAssetFromDb(asset.id);
      URL.revokeObjectURL(asset.url);
      setMediaAssets((current) => current.filter((item) => item.id !== asset.id));
      setSlides((current) => {
        const next = current.map((slide) => ({
          ...(slide.bgAssetId === asset.id ? { ...slide, bgAssetId: undefined, bgImage: undefined, bgVideo: undefined } : slide),
          bgPictureRestore: slide.bgPictureRestore?.assetId === asset.id ? undefined : slide.bgPictureRestore,
          pictures: slide.pictures?.filter((picture) => picture.assetId !== asset.id),
        }));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the editor usable if storage is full. */ }
        return next;
      });
      setProjects((current) => {
        const next = current.map((project) => ({
          ...project,
          slides: project.slides.map((slide) => ({
            ...(slide.bgAssetId === asset.id ? { ...slide, bgAssetId: undefined, bgImage: undefined, bgVideo: undefined } : slide),
            bgPictureRestore: slide.bgPictureRestore?.assetId === asset.id ? undefined : slide.bgPictureRestore,
            pictures: slide.pictures?.filter((picture) => picture.assetId !== asset.id),
          })),
        }));
        try { localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the editor usable if storage is full. */ }
        return next;
      });
      setDeleteConfirmation(null);
      flash('Upload deleted from the media library');
    } catch {
      setDeleteConfirmation(null);
      flash('Could not delete this background');
    }
  };

  const save = () => {
    try {
      const id = activeProjectId ?? crypto.randomUUID();
      const project: PresentationProject = {
        id,
        name: projectName.trim() || 'Untitled presentation',
        slides: serializable(),
        updatedAt: Date.now(),
      };
      const next = [project, ...projects.filter((item) => item.id !== id)];
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
      setProjects(next);
      window.dispatchEvent(new CustomEvent('faithstream:presentations-updated'));
      originalProjectRef.current = null;
      newDraftProjectIdRef.current = null;
      setLeaveConfirmationOpen(false);
      setActiveProjectId(null);
      setStatus('');
      return true;
    } catch {
      flash('Could not save: images are too large');
      return false;
    }
  };

  const requestBackToPresentations = () => {
    if (hasEditorChanges()) {
      setLeaveConfirmationOpen(true);
      return;
    }
    originalProjectRef.current = null;
    setActiveProjectId(null);
  };

  const discardEditorChanges = () => {
    const original = originalProjectRef.current;
    const draftId = newDraftProjectIdRef.current;
    if (original || draftId) {
      const next = draftId
        ? projects.filter((project) => project.id !== draftId)
        : projects.map((project) => project.id === original!.id ? original! : project);
      try {
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
        setProjects(next);
        window.dispatchEvent(new CustomEvent('faithstream:presentations-updated'));
      } catch {
        flash('Could not discard changes on this device.');
        return;
      }
    }
    originalProjectRef.current = null;
    newDraftProjectIdRef.current = null;
    setLeaveConfirmationOpen(false);
    setActiveProjectId(null);
    const target = pendingNavigation;
    setPendingNavigation(null);
    if (target) navigate(target);
  };

  const keepChangesAndContinue = () => {
    const target = pendingNavigation;
    if (!save()) return;
    setPendingNavigation(null);
    if (target) navigate(target);
  };

  /* ----- render ----- */

  if (!activeProjectId) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><FolderOpen size={22} /></span>
                <div>
                  <h1 className="text-2xl font-bold text-warm-white">Presentations</h1>
                  <p className="mt-1 text-sm text-warm-white/55">Your saved slide projects, together in one place.</p>
                  <p className="mt-1 text-xs text-warm-white/40">{accountSyncStatus}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={slideImportProgress !== null} onClick={() => slideImportInput.current?.click()} className="flex items-center gap-2 rounded-xl border border-white/15 bg-panel px-4 py-3 text-sm font-semibold text-warm-white transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-70">
                {slideImportProgress ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />} {slideImportProgress ? 'Importing…' : 'Import Slides'}
              </button>
              <button onClick={createProject} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-navy shadow-lg shadow-black/20 transition hover:brightness-110">
                <Plus size={18} /> Create Presentation
              </button>
            </div>
          </div>
          <input
            ref={slideImportInput}
            type="file"
          accept="image/png,image/jpeg,image/webp,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            multiple
            hidden
            onChange={(event) => {
              void importSlideImages(event.target.files);
              event.target.value = '';
            }}
          />

          {slideImportProgress && <div role="status" aria-live="polite" className="mb-5 rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="flex items-center gap-3">
              <Loader2 size={18} className="shrink-0 animate-spin text-brand" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-warm-white">{slideImportProgress.message}</span>
                  {slideImportProgress.total > 0 && <span className="shrink-0 text-xs tabular-nums text-warm-white/60">{slideImportProgress.current} / {slideImportProgress.total}</span>}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  {slideImportProgress.total > 0
                    ? <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${Math.min(100, slideImportProgress.current / slideImportProgress.total * 100)}%` }} />
                    : <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />}
                </div>
              </div>
            </div>
          </div>}

          {projects.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((project) => {
                const firstSlide = project.slides[0];
                const asset = mediaAssets.find((item) => item.id === firstSlide?.bgAssetId);
                const cover = firstSlide ? { ...firstSlide, bgImage: asset?.type === 'image' ? asset.url : firstSlide.bgImage, bgVideo: asset?.type === 'video' ? asset.url : firstSlide.bgVideo } : null;
                return (
                  <div key={project.id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-panel text-left transition hover:-translate-y-0.5 hover:border-brand/70 hover:shadow-xl hover:shadow-black/20">
                    <button onClick={() => openProject(project)} aria-label={`Open ${project.name}`} className="block w-full text-left">
                      <div className="relative aspect-video overflow-hidden bg-navy">
                        {cover ? <SlideRender slide={cover} /> : <div className="absolute inset-0 flex items-center justify-center text-warm-white/30"><FolderOpen size={38} /></div>}
                        <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur"><FolderOpen size={14} /> Presentation</span>
                        {project.locked && <span className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/65 px-2.5 py-1.5 text-xs font-semibold text-amber-200 backdrop-blur"><Lock size={13} /> Locked</span>}
                      </div>
                      <div className="flex items-center justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-warm-white">{project.name}</p>
                          <p className="mt-1 text-xs text-warm-white/50">{project.slides.length} {project.slides.length === 1 ? 'slide' : 'slides'} · Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
                          {(project.hasLocalMedia || project.deviceOnly) && <p className="mt-1 text-[11px] text-amber-200/80">Imported media stays on its original device</p>}
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-warm-white/40 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                      </div>
                    </button>
                    <button aria-label={`Options for ${project.name}`} onClick={() => setProjectMenuFor(projectMenuFor === project.id ? null : project.id)} className="absolute right-3 top-3 z-20 rounded-lg bg-black/65 p-2 text-white opacity-0 transition hover:bg-black/85 group-hover:opacity-100 focus:opacity-100">
                      <MoreHorizontal size={16} />
                    </button>
                    {projectMenuFor === project.id && <>
                      <div className="fixed inset-0 z-20" onClick={() => setProjectMenuFor(null)} />
                      <div className="absolute right-3 top-12 z-30 w-48 rounded-xl border border-white/10 bg-navy p-1.5 text-sm text-warm-white shadow-xl">
                        <button onClick={() => toggleProjectLock(project.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10">{project.locked ? <Unlock size={15} /> : <Lock size={15} />}{project.locked ? 'Unlock presentation' : 'Lock presentation'}</button>
                        <button onClick={() => deleteProject(project.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"><Trash2 size={15} /> Delete presentation</button>
                      </div>
                    </>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[min(480px,65vh)] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-panel/50 px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 text-brand/80"><FolderOpen size={30} /></span>
              <h2 className="mt-5 text-lg font-semibold text-warm-white">No presentations yet</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-warm-white/55">Create a presentation to start adding slides, lyrics, scripture, images, and shapes.</p>
              <button onClick={createProject} className="mt-5 flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-navy transition hover:brightness-110"><Plus size={17} /> Create Presentation</button>
            </div>
          )}
        </div>
        <ConfirmationModal
          open={deleteConfirmation !== null}
          title={deleteConfirmation?.title ?? ''}
          message={deleteConfirmation?.message ?? ''}
          onCancel={() => setDeleteConfirmation(null)}
          onConfirm={() => deleteConfirmation?.onConfirm()}
        />
      </div>
    );
  }

  const toolbarBelow = selectedCountdown ? (cur.countdown?.y ?? 30) < 16 : !!box && box.y < 16;

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-panel px-3 py-2">
        <button onClick={requestBackToPresentations} aria-label="Back to presentations" title="Back to presentations" className="rounded-lg p-2 text-warm-white/70 hover:bg-white/5 hover:text-white"><ChevronLeft size={19} /></button>
        <FolderOpen size={17} className="shrink-0 text-brand" />
        <input aria-label="Presentation name" value={projectName} onChange={(event) => setProjectName(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-warm-white outline-none placeholder:text-warm-white/35" placeholder="Presentation name" />
        <span className="hidden text-xs text-warm-white/45 sm:block">{slides.length} {slides.length === 1 ? 'slide' : 'slides'}</span>
      </div>
      {/* Top: slides, canvas, properties */}
      <div className="grid min-h-0 flex-1 grid-cols-[clamp(240px,22vw,320px)_minmax(0,1fr)_clamp(260px,21vw,320px)] gap-3">
        {/* Slides */}
        <Panel
          title={`Slides (${slides.length})`}
          action={
            <button
              onClick={addBlank}
              className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-navy hover:brightness-110"
            >
              <Plus size={14} /> Add Slide
            </button>
          }
        >
          <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {slides.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDraggingSlide(i); }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); reorderSlides(from, i); setDraggingSlide(null); }}
                onDragEnd={() => setDraggingSlide(null)}
                className={`relative cursor-grab active:cursor-grabbing ${draggingSlide === i ? 'opacity-40' : ''}`}
              >
                <button
                  onClick={() => setIndex(i)}
                  aria-label={`Open slide ${i + 1}`}
                  aria-pressed={i === index}
                  className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 transition ${
                    i === index
                      ? 'border-brand ring-2 ring-brand/40'
                      : 'border-white/10 hover:border-white/40'
                  }`}
                >
                  <SlideRender slide={s} />
                  <span className="absolute left-1.5 top-1.5 z-10 rounded bg-black/65 px-1.5 text-xs font-semibold text-white">
                    {i + 1}
                  </span>
                </button>
                <input
                  aria-label={`Title for slide ${i + 1}`}
                  value={slideName(s)}
                  onChange={(e) => updateSlideTitle(s.id, e.target.value)}
                  disabled={projectLocked}
                  placeholder="Name this slide"
                  className="mt-1 w-full rounded border border-transparent bg-transparent px-1 py-1 text-xs text-warm-white/80 outline-none placeholder:text-warm-white/40 focus:border-white/15 focus:bg-navy disabled:cursor-not-allowed disabled:opacity-50"
                />
                {s.locked && <span className="absolute bottom-8 left-1.5 z-10 flex items-center gap-1 rounded bg-black/70 px-1.5 py-1 text-[10px] font-semibold text-amber-200"><Lock size={11} /> Locked</span>}

                <button
                  aria-label={`Options for slide ${i + 1}`}
                  onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                  className="absolute right-1.5 top-1.5 z-10 rounded bg-black/65 p-1 text-white hover:bg-black/85"
                >
                  <MoreHorizontal size={14} />
                </button>

                {menuFor === s.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                    <div className="absolute right-1.5 top-9 z-20 w-36 rounded-lg border border-white/10 bg-navy p-1 text-xs text-warm-white shadow-xl">
                      {[
                        { label: 'Duplicate', run: () => duplicate(i), off: false },
                        { label: 'Move up', run: () => move(i, -1), off: i === 0 },
                        { label: 'Move down', run: () => move(i, 1), off: i === slides.length - 1 },
                        { label: s.locked ? 'Unlock slide' : 'Lock slide', run: () => toggleSlideLock(s.id), off: projectLocked },
                        { label: 'Delete slide', run: () => remove(i), off: projectLocked },
                      ].map((m) => (
                        <button
                          key={m.label}
                          disabled={m.off}
                          onClick={() => {
                            m.run();
                            setMenuFor(null);
                          }}
                          className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </li>
            ))}
            <li>
              <button
                onClick={addBlank}
                className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-white/20 text-sm text-warm-white/70 transition hover:border-brand hover:text-brand"
              >
                <Plus size={16} /> New slide
              </button>
            </li>
          </ul>
        </Panel>

        {/* Canvas */}
        <section className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-panel p-3">
          <p className="mb-2 shrink-0 text-xs text-warm-white/60">
            Select a text box to edit it. Drag to move it; drag a corner to resize it.
          </p>
          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            style={{ containerType: 'size' }}
          >
            <div
              ref={stageRef}
              tabIndex={0}
              onClick={() => { setIsBoxSelected(false); setSelectedPictureId(null); setSelectedShapeId(null); setSelectedCountdown(false); }}
              onDoubleClick={(event) => {
                if (cur.locked || !cur.bgImage || (event.target as HTMLElement).closest('[data-slide-object]')) return;
                event.preventDefault();
                setBackgroundEditing(true);
              }}
              onContextMenu={(event) => {
                if (cur.locked || (!cur.bgImage && !cur.bgVideo) || (event.target as HTMLElement).closest('[data-slide-object]')) return;
                event.preventDefault();
                setPictureMenu({ kind: 'background', id: null, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 100) });
              }}
              aria-label="Slide canvas. Select a text box and press Backspace or Delete to remove it."
              className="relative isolate"
              style={{
                width: `calc(min(100cqw, 100cqh * 16 / 9) * ${ZOOMS[zoom]})`,
                aspectRatio: '16 / 9',
                containerType: 'inline-size',
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-lg border border-white/10">
                <SlideRender slide={cur} onVideoSelect={selectPicture} editingTextBoxId={isBoxSelected ? selectedBoxId : undefined} />
              </div>

              {alignmentGuides.x !== null && <div aria-hidden className="pointer-events-none absolute inset-y-0 z-30 border-l border-dashed border-cyan-300 shadow-[0_0_5px_rgba(103,232,249,.8)]" style={{ left: `${alignmentGuides.x}%` }} />}
              {alignmentGuides.y !== null && <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30 border-t border-dashed border-cyan-300 shadow-[0_0_5px_rgba(103,232,249,.8)]" style={{ top: `${alignmentGuides.y}%` }} />}

              {backgroundEditing && cur.bgImage && <>
                <div onPointerDown={startBackgroundDrag} aria-label="Drag to reposition the background image" className="absolute inset-0 z-[60] cursor-move border-2 border-dashed border-brand/80" />
                <div className="absolute left-1/2 top-3 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-white/15 bg-navy/95 px-3 py-2 text-xs text-white shadow-xl">
                  <span>Drag to reposition background</span>
                  <button type="button" onClick={() => setBackgroundEditing(false)} className="rounded bg-brand px-2.5 py-1 font-semibold text-navy">Done</button>
                </div>
              </>}

              {(cur.pictures ?? []).map((picture, pictureIndex) => <div data-slide-object key={picture.id} onPointerDown={picture.mediaType === 'video' ? undefined : startPictureDrag(picture)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (cur.locked) return; selectPicture(picture.id); setPictureMenu({ kind: 'picture', id: picture.id, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 220) }); }} onClick={(e) => { if (picture.mediaType === 'video') return; e.stopPropagation(); selectPicture(picture.id); }} className={`absolute z-10 ${picture.mediaType === 'video' ? 'pointer-events-none' : 'cursor-move'} ${selectedPictureId === picture.id ? 'border-2 border-cyan-300' : 'border border-transparent'}`} style={{ left: `${picture.x}%`, top: `${picture.y}%`, width: `${picture.w}%`, height: `${picture.h}%`, zIndex: typeof picture.layerOrder === 'number' ? picture.layerOrder : picture.layerOrder === 'front' ? 5000 : picture.layerOrder === 'back' ? 0 : 1000 + pictureIndex, touchAction: 'none' }}>
                {picture.mediaType === 'video' && <div onPointerDown={startPictureDrag(picture)} onClick={(event) => { event.stopPropagation(); setSelectedPictureId(picture.id); setSelectedCountdown(false); }} aria-label="Drag to move video" className="pointer-events-auto absolute inset-x-0 -top-3 h-3 cursor-move" />}
                {selectedPictureId === picture.id && (Object.keys(HANDLES) as Exclude<Mode, 'move'>[]).map((handle) => <span key={handle} onPointerDown={startPictureResize(picture, handle)} className={`pointer-events-auto absolute z-20 h-3.5 w-3.5 rounded-sm border-2 border-cyan-700 bg-white shadow ${HANDLES[handle]}`} />)}
                {selectedPictureId === picture.id && <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { updateSlide({ pictures: (cur.pictures ?? []).filter((item) => item.id !== picture.id) }); setSelectedPictureId(null); }} aria-label={picture.mediaType === 'video' ? 'Delete video' : 'Delete image'} className="pointer-events-auto absolute -right-2 -top-2 z-30 rounded-full bg-red-600 p-1 text-white shadow"><Trash2 size={12} /></button>}
              </div>)}
              {pictureMenu && createPortal(<>
                <div className="fixed inset-0 z-[9998]" onPointerDown={() => setPictureMenu(null)} />
                <div role="menu" aria-label={`${pictureMenu.kind === 'picture' ? 'Image' : pictureMenu.kind === 'text' ? 'Text' : 'Background'} options`} className="fixed z-[9999] w-48 rounded-lg border border-white/10 bg-navy p-1 text-xs text-warm-white shadow-xl" style={{ left: pictureMenu.x, top: pictureMenu.y }}>
                  {pictureMenu.kind === 'background' ? (
                    <button role="menuitem" onClick={() => removeBackgroundMedia(true)} className="block w-full rounded px-3 py-2 text-left text-red-200 hover:bg-red-500/10">Remove background {cur.bgVideo ? 'video' : 'image'}</button>
                  ) : <>
                    <button role="menuitem" onClick={() => moveLayer(pictureMenu.kind === 'text' ? 'text' : 'picture', pictureMenu.id, 'front')} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">Bring to front</button>
                    <button role="menuitem" onClick={() => moveLayer(pictureMenu.kind === 'text' ? 'text' : 'picture', pictureMenu.id, 'forward')} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">Bring forward</button>
                    <button role="menuitem" onClick={() => moveLayer(pictureMenu.kind === 'text' ? 'text' : 'picture', pictureMenu.id, 'backward')} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">Send backward</button>
                    <button role="menuitem" onClick={() => moveLayer(pictureMenu.kind === 'text' ? 'text' : 'picture', pictureMenu.id, 'back')} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">Send to back</button>
                    {pictureMenu.kind === 'picture' && pictureMenu.id !== null && <button role="menuitem" onClick={() => setPictureAsBackground(pictureMenu.id!)} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">Set as background</button>}
                    <button role="menuitem" onClick={() => pictureMenu.kind === 'picture' && pictureMenu.id !== null ? duplicatePicture(pictureMenu.id) : duplicateTextBox(pictureMenu.id)} className="block w-full rounded px-3 py-2 text-left hover:bg-white/10">Duplicate</button>
                    <button role="menuitem" onClick={() => {
                      if (pictureMenu.kind === 'picture' && pictureMenu.id !== null) {
                        updateSlide({ pictures: (cur.pictures ?? []).filter((item) => item.id !== pictureMenu.id) });
                        setSelectedPictureId(null);
                      } else {
                        deleteTextBox(pictureMenu.id);
                        setIsBoxSelected(false);
                      }
                      setPictureMenu(null);
                    }} className="block w-full rounded px-3 py-2 text-left text-red-200 hover:bg-red-500/10">Delete {pictureMenu.kind === 'picture' ? 'image' : 'text box'}</button>
                  </>}
                </div>
              </>, document.body)}

              {(cur.shapes ?? []).map((shape, shapeIndex) => <div data-slide-object key={shape.id} onPointerDown={startShapeDrag(shape)} onClick={(event) => { event.stopPropagation(); setSelectedShapeId(shape.id); setSelectedPictureId(null); setSelectedCountdown(false); setSelectedBoxId(null); setIsBoxSelected(false); }} className={`absolute z-10 cursor-move ${selectedShapeId === shape.id ? 'border border-cyan-300' : 'border border-transparent'}`} style={{ left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.w}%`, height: `${shape.h}%`, zIndex: shape.layerOrder ?? 2000 + shapeIndex, touchAction: 'none' }}>
                {selectedShapeId === shape.id && (Object.keys(HANDLES) as Exclude<Mode, 'move'>[]).map((handle) => <span key={handle} onPointerDown={startShapeResize(shape, handle)} className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-slate-400 bg-white ${HANDLES[handle]}`} />)}
                {selectedShapeId === shape.id && <button onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); updateSlide({ shapes: (cur.shapes ?? []).filter((item) => item.id !== shape.id) }); setSelectedShapeId(null); }} aria-label="Delete shape" className="absolute -right-2 -top-2 z-30 rounded-full bg-red-600 p-1 text-white shadow"><Trash2 size={12} /></button>}
              </div>)}

              {cur.countdown && <div
                onPointerDown={startCountdownInteraction('move')}
                onClick={(event) => { event.stopPropagation(); setSelectedCountdown(true); setSelectedPictureId(null); setSelectedShapeId(null); setSelectedBoxId(null); setIsBoxSelected(false); }}
                data-slide-object
                className={`absolute z-20 cursor-move ${selectedCountdown ? 'border border-white' : 'border border-transparent'}`}
                style={{ left: `${cur.countdown.x ?? 10}%`, top: `${cur.countdown.y ?? 30}%`, width: `${cur.countdown.w ?? 80}%`, height: `${cur.countdown.h ?? 40}%`, touchAction: 'none' }}
                aria-label="Countdown text box. Drag to move, drag a corner to resize, or press Backspace to remove."
              >
                {selectedCountdown && (Object.keys(HANDLES) as Exclude<Mode, 'move'>[]).map((handle) => <span key={handle} onPointerDown={startCountdownInteraction(handle)} className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-slate-400 bg-white ${HANDLES[handle]}`} />)}
                {selectedCountdown && <div onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className={`absolute left-1/2 z-30 flex -translate-x-1/2 cursor-default items-center gap-0.5 rounded-lg border border-white/10 bg-navy/95 p-1 shadow-xl ${toolbarBelow ? 'top-full mt-3' : 'bottom-full mb-3'}`}>
                  <IconBtn label="Add text box" onClick={addText}><Plus size={15} /></IconBtn>
                  <IconBtn label="Align left" active={(cur.countdown.align ?? 'center') === 'left'} onClick={() => updateCountdown({ align: 'left' })}><AlignLeft size={15} /></IconBtn>
                  <IconBtn label="Align center" active={(cur.countdown.align ?? 'center') === 'center'} onClick={() => updateCountdown({ align: 'center' })}><AlignCenter size={15} /></IconBtn>
                  <IconBtn label="Align right" active={(cur.countdown.align ?? 'center') === 'right'} onClick={() => updateCountdown({ align: 'right' })}><AlignRight size={15} /></IconBtn>
                  <IconBtn label="Delete countdown" onClick={() => { updateSlide({ countdown: undefined }); setSelectedCountdown(false); }}><Trash2 size={15} /></IconBtn>
                </div>}
              </div>}

              {allBoxes.map(({ id, box: textBox }) => {
                const selected = isBoxSelected && id === selectedBoxId;
                const align = (value: Align) => updateBoxById(id, { align: value });
                return <div data-slide-object key={id ?? 'main'} onPointerDown={startDrag('move', id, textBox)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (cur.locked) return; setSelectedBoxId(id); setIsBoxSelected(true); setSelectedPictureId(null); setSelectedShapeId(null); setSelectedCountdown(false); setPictureMenu({ kind: 'text', id, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 220) }); }} className={`absolute z-10 cursor-move ${selected ? 'border border-white' : 'border border-transparent'}`} onClick={(e) => { e.stopPropagation(); setSelectedBoxId(id); setIsBoxSelected(true); setSelectedPictureId(null); setSelectedShapeId(null); setSelectedCountdown(false); }} style={{ left: `${textBox.x}%`, top: `${textBox.y}%`, width: `${textBox.w}%`, height: `${textBox.h}%`, zIndex: typeof textBox.layerOrder === 'number' ? textBox.layerOrder : textBox.layerOrder === 'front' ? 5000 : textBox.layerOrder === 'back' ? 0 : id === null ? 3000 : 3001 + (cur.extraBoxes ?? []).findIndex((item) => item.id === id), touchAction: 'none' }}>
                  {selected && <div className="absolute inset-0 z-0 overflow-hidden px-1" style={{ background: textBox.boxBgOn ? textBox.boxBg : undefined }}>
                    <div ref={canvasTextMeasureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-full whitespace-pre-wrap px-1" style={{ overflowWrap: 'anywhere', fontFamily: FONTS[textBox.font] ?? `"${textBox.font.replaceAll('"', '')}", sans-serif`, fontSize: `${(textBox.size / 1280) * 100}cqw`, fontWeight: textBox.bold ? 800 : 500, fontStyle: textBox.italic ? 'italic' : 'normal', lineHeight: textBox.lineHeight, letterSpacing: `${(textBox.letterSpacing / 1280) * 100}cqw` }}>{textBox.text || ' '}</div>
                    <textarea
                      ref={canvasTextRef}
                      aria-label="Edit text on slide"
                      rows={1}
                      value={textBox.text}
                      onChange={(event) => updateBoxById(id, { text: event.target.value })}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute inset-0 h-full w-full resize-none overflow-hidden border-0 bg-transparent px-1 py-1 outline-none"
                      style={{
                        textAlign: textBox.align,
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        fontFamily: FONTS[textBox.font] ?? `"${textBox.font.replaceAll('"', '')}", sans-serif`,
                        fontSize: `${(textBox.size * canvasTextScale / 1280) * 100}cqw`,
                        fontWeight: textBox.bold ? 800 : 500,
                        fontStyle: textBox.italic ? 'italic' : 'normal',
                        textDecoration: textBox.underline ? 'underline' : 'none',
                        lineHeight: textBox.lineHeight,
                        letterSpacing: `${(textBox.letterSpacing / 1280) * 100}cqw`,
                        color: textBox.color,
                        textShadow: textBox.shadow ? '0 0 1.2cqw rgba(0,0,0,0.65)' : undefined,
                        paddingTop: 4,
                        background: textBox.boxBgOn ? textBox.boxBg : undefined,
                      }}
                    />
                  </div>}
                  {selected && (Object.keys(HANDLES) as Exclude<Mode, 'move'>[]).map((h) => <span key={h} onPointerDown={startDrag(h, id, textBox)} className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-slate-400 bg-white ${HANDLES[h]}`} />)}
                  {selected && <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className={`absolute left-1/2 z-20 flex -translate-x-1/2 cursor-default items-center gap-0.5 rounded-lg border border-white/10 bg-navy/95 p-1 shadow-xl ${toolbarBelow ? 'top-full mt-3' : 'bottom-full mb-3'}`}>
                    <IconBtn label="Add text box" onClick={addText}><Plus size={15} /></IconBtn>
                    <IconBtn label="Align left" active={textBox.align === 'left'} onClick={() => align('left')}><AlignLeft size={15} /></IconBtn>
                    <IconBtn label="Align center" active={textBox.align === 'center'} onClick={() => align('center')}><AlignCenter size={15} /></IconBtn>
                    <IconBtn label="Align right" active={textBox.align === 'right'} onClick={() => align('right')}><AlignRight size={15} /></IconBtn>
                    <IconBtn label="Delete text box" onClick={() => deleteTextBox(id)}><Trash2 size={15} /></IconBtn>
                  </div>}
                </div>;
              })}
              {cur.locked && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4 text-center backdrop-blur-[1px]">
                <div className="rounded-xl border border-white/10 bg-navy/95 px-5 py-4 shadow-xl">
                  <Lock size={20} className="mx-auto text-amber-200" />
                  <p className="mt-2 text-sm font-semibold text-white">Slide locked</p>
                  <p className="mt-1 text-xs text-white/60">Unlock it from the slide options to make changes.</p>
                </div>
              </div>}
            </div>
          </div>

          <div className="mt-2 flex shrink-0 items-center justify-between text-xs text-warm-white/70">
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous slide"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
                className="rounded p-1 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Slide {index + 1} of {slides.length}
              </span>
              <button
                aria-label="Next slide"
                disabled={index === slides.length - 1}
                onClick={() => setIndex(index + 1)}
                className="rounded p-1 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span>1280 × 720</span>
              <select
                aria-label="Zoom"
                value={zoom}
                onChange={(e) => setZoom(e.target.value)}
                className="rounded-lg border border-white/10 bg-navy px-2 py-1 text-xs text-warm-white outline-none focus:border-brand"
              >
                {Object.keys(ZOOMS).map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Properties */}
        <section className="relative flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-panel">
          <div className="flex shrink-0 border-b border-white/10 text-sm">
            {(['Content', 'Style', 'Background'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px flex-1 border-b-2 px-1 py-2.5 transition-colors ${
                  tab === t
                    ? 'border-brand font-medium text-brand'
                    : 'border-transparent text-warm-white/60 hover:text-warm-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'Content' && <div className="mb-5">
              <button type="button" disabled={mediaImporting !== null || cur.locked} onClick={() => contentInput.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2.5 text-xs font-semibold text-warm-white hover:border-brand/50 hover:bg-white/5 disabled:cursor-wait disabled:opacity-50"><Plus size={15} /> Add image or video</button>
              <p className="mt-2 text-[10px] leading-relaxed text-warm-white/50">Images and videos you add here can also be reused as backgrounds.</p>
              {mediaImporting && <div role="status" aria-live="polite" className="mt-2 flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-[11px] text-warm-white/75"><Loader2 size={14} className="animate-spin text-brand" /> Adding {mediaImporting}…</div>}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-warm-white/80">Recent uploads</p><span className="text-[10px] text-warm-white/45">{contentAssets.length}</span></div>
                {contentAssets.length === 0 ? <p className="rounded-lg border border-dashed border-white/15 p-3 text-center text-[11px] text-warm-white/50">Your added images and videos will appear here.</p> : <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1">
                  {contentAssets.map((asset) => <div key={asset.id} className="group relative overflow-hidden rounded-lg border border-white/10 transition hover:border-brand/60">
                    <button type="button" disabled={cur.locked} onClick={() => addRecentContentMedia(asset)} title={`Add ${asset.name} to this slide`} className="block w-full text-left disabled:opacity-50">
                      <span className="relative block aspect-video overflow-hidden bg-navy">{asset.type === 'image' ? <img src={asset.url} alt="" className="h-full w-full object-cover" /> : <video src={asset.url} muted className="h-full w-full object-cover" />}<span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">{asset.type === 'video' ? 'VIDEO' : 'IMAGE'}</span></span>
                      <span className="block truncate px-1.5 pt-1 text-[10px] text-warm-white/75">{asset.name}</span><span className="block px-1.5 pb-1 text-[9px] text-warm-white/45">{formatMediaSizeInKb(asset.blob.size)}</span>
                    </button>
                    <button type="button" aria-label={`Delete ${asset.name}`} title={`Delete ${asset.name}`} onClick={() => setDeleteConfirmation({ title: 'Delete uploaded file?', message: `Delete “${asset.name}” from Recent Uploads? It will also be removed from any slides and backgrounds using this file.`, onConfirm: () => { void deleteMediaAsset(asset); } })} className="absolute right-1 top-1 z-10 rounded-md border border-white/15 bg-black/75 p-1.5 text-white/75 opacity-0 shadow transition hover:bg-red-600 hover:text-white focus:opacity-100 group-hover:opacity-100"><Trash2 size={12} /></button>
                  </div>)}
                </div>}
              </div>
            </div>}
            {tab === 'Content' && cur.countdown && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Countdown timer</SectionTitle>
                <button type="button" onClick={() => updateSlide({ countdown: undefined })} className="rounded-md px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/10">Remove</button>
              </div>
              <p className="text-[11px] text-warm-white/55">Select the timer on the slide to move or resize its area. Change the number size below.</p>
              <label className="block text-xs text-warm-white/70">Label
                <input value={cur.countdown.label} onChange={(event) => updateCountdown({ label: event.target.value })} className={`${fieldClass} mt-1`} placeholder="Event starts in" />
              </label>
              <label className="block text-xs text-warm-white/70">Event date and time
                <input type="datetime-local" value={toLocalDateTimeInput(cur.countdown.targetAt)} onChange={(event) => {
                  const target = new Date(event.target.value);
                  if (!Number.isNaN(target.getTime())) updateCountdown({ targetAt: target.toISOString() });
                }} className={`${fieldClass} mt-1`} />
              </label>
              <label className="block text-xs text-warm-white/70">Number size
                <div className="mt-1 flex items-center gap-2"><input type="range" min="32" max="240" step="4" value={cur.countdown.size ?? 112} onChange={(event) => updateCountdown({ size: Number(event.target.value) })} className="w-full accent-brand" /><span className="w-12 text-right tabular-nums">{cur.countdown.size ?? 112}px</span></div>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']] as const).map(([key, label]) => <label key={key} className="block text-xs text-warm-white/70">{label} (%)
                  <input type="number" min="0" max="100" value={Math.round(cur.countdown?.[key] ?? ({ x: 10, y: 30, w: 80, h: 40 }[key]))} onChange={(event) => updateCountdown({ [key]: clamp(Number(event.target.value) || 0, 0, 100) })} className={`${fieldClass} mt-1`} />
                </label>)}
              </div>
              <div className="flex items-center justify-between text-xs text-warm-white/75">Timer color<ColorField label="Countdown color" value={cur.countdown.color} onChange={(color) => updateCountdown({ color })} /></div>
              <p className="text-[11px] text-warm-white/50">This slide counts down in real time to the event.</p>
            </div>}
            {tab === 'Content' &&
              (selectedPicture?.mediaType === 'video' ? (
                <div className="flex flex-col gap-3">
                  <SectionTitle>Slide video</SectionTitle>
                  <p className="text-xs leading-relaxed text-warm-white/55">Select the video on the slide to show its resize handles. Use the player controls to play or pause. Resizing changes its display size without changing the uploaded file.</p>
                  <button type="button" onClick={toggleSelectedVideoPlayback} className="flex items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-warm-white hover:bg-white/5"><Play size={14} /> Play / pause video</button>
                  <button type="button" aria-pressed={!(selectedPicture.muted ?? false)} onClick={() => updatePicture(selectedPicture.id, { muted: !(selectedPicture.muted ?? false) })} className="flex items-center justify-between rounded-lg border border-white/15 px-3 py-2 text-xs text-warm-white hover:bg-white/5"><span>Video audio</span><span className="font-semibold text-brand">{selectedPicture.muted ? 'Muted' : 'On'}</span></button>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-warm-white/70">Width (%)
                      <input type="number" min="8" max="100" value={Math.round(selectedPicture.w)} onChange={(event) => {
                        const ratio = selectedPicture.aspectRatio ?? 16 / 9;
                        let width = clamp(Number(event.target.value) || 8, 8, 100);
                        let height = width / ratio;
                        if (height > 100) { height = 100; width = height * ratio; }
                        updatePicture(selectedPicture.id, { w: width, h: height, x: clamp(selectedPicture.x, 0, 100 - width), y: clamp(selectedPicture.y, 0, 100 - height) });
                      }} className={`${fieldClass} mt-1`} />
                    </label>
                    <label className="text-xs text-warm-white/70">Height (%)
                      <input type="number" min="8" max="100" value={Math.round(selectedPicture.h)} onChange={(event) => {
                        const ratio = selectedPicture.aspectRatio ?? 16 / 9;
                        let height = clamp(Number(event.target.value) || 8, 8, 100);
                        let width = height * ratio;
                        if (width > 100) { width = 100; height = width / ratio; }
                        updatePicture(selectedPicture.id, { w: width, h: height, x: clamp(selectedPicture.x, 0, 100 - width), y: clamp(selectedPicture.y, 0, 100 - height) });
                      }} className={`${fieldClass} mt-1`} />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-warm-white/70">Left (%)<input type="number" min="0" max={Math.floor(100 - selectedPicture.w)} value={Math.round(selectedPicture.x)} onChange={(event) => updatePicture(selectedPicture.id, { x: clamp(Number(event.target.value) || 0, 0, 100 - selectedPicture.w) })} className={`${fieldClass} mt-1`} /></label>
                    <label className="text-xs text-warm-white/70">Top (%)<input type="number" min="0" max={Math.floor(100 - selectedPicture.h)} value={Math.round(selectedPicture.y)} onChange={(event) => updatePicture(selectedPicture.id, { y: clamp(Number(event.target.value) || 0, 0, 100 - selectedPicture.h) })} className={`${fieldClass} mt-1`} /></label>
                  </div>
                </div>
              ) : selectedShape ? (
                <div className="flex flex-col gap-4">
                  <SectionTitle>Shape</SectionTitle>
                  <p className="text-sm capitalize text-warm-white">{selectedShape.kind}</p>
                  <div className="flex items-center justify-between text-sm text-warm-white">
                    Fill color
                    <ColorField label="Shape fill color" value={selectedShape.fill} onChange={(value) => updateShape(selectedShape.id, { fill: value })} />
                  </div>
                  <p className="text-xs text-warm-white/50">This changes the selected shape only.</p>
                </div>
              ) : !box ? (
                <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-sm text-warm-white/70">
                  This slide has no text yet.
                  <button
                    onClick={addText}
                    className="mt-3 block w-full rounded-lg bg-brand py-2 text-sm font-bold text-navy hover:brightness-110"
                  >
                    Add text box
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="slide-text" className="mb-1 block text-xs text-warm-white/70">
                      Text
                    </label>
                    <textarea
                      id="slide-text"
                      ref={textRef}
                      rows={3}
                      value={box.text}
                      onChange={(e) => updateBox({ text: e.target.value })}
                      className={`${fieldClass} resize-none`}
                    />
                    <p className="mt-1 text-[11px] text-warm-white/50">
                      The first line is the title. Other lines become the subtitle.
                    </p>
                  </div>

                  <SectionTitle>Format</SectionTitle>
                  <div className="-mt-1 flex items-center gap-0.5">
                    <IconBtn label="Bold" active={box.bold} onClick={() => updateBox({ bold: !box.bold })}>
                      <Bold size={15} />
                    </IconBtn>
                    <IconBtn label="Italic" active={box.italic} onClick={() => updateBox({ italic: !box.italic })}>
                      <Italic size={15} />
                    </IconBtn>
                    <IconBtn label="Underline" active={box.underline} onClick={() => updateBox({ underline: !box.underline })}>
                      <Underline size={15} />
                    </IconBtn>
                    <span className="mx-1 h-5 w-px bg-white/10" />
                    <IconBtn label="Align left" active={box.align === 'left'} onClick={() => updateBox({ align: 'left' })}>
                      <AlignLeft size={15} />
                    </IconBtn>
                    <IconBtn label="Align center" active={box.align === 'center'} onClick={() => updateBox({ align: 'center' })}>
                      <AlignCenter size={15} />
                    </IconBtn>
                    <IconBtn label="Align right" active={box.align === 'right'} onClick={() => updateBox({ align: 'right' })}>
                      <AlignRight size={15} />
                    </IconBtn>
                  </div>

                  <div className="grid grid-cols-[1fr_84px] gap-2">
                    <div className="relative min-w-0" ref={fontPickerRef}>
                      <input
                        aria-label="Search fonts"
                        role="combobox"
                        aria-expanded={fontPickerOpen}
                        aria-controls="font-picker-options"
                        placeholder="Search fonts…"
                        value={fontPickerOpen ? fontSearch : box.font}
                        onFocus={() => { setFontSearch(''); setFontPickerOpen(true); }}
                        onChange={(event) => { setFontSearch(event.target.value); setFontPickerOpen(true); }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && fontOptions[0]) {
                            event.preventDefault();
                            updateBox({ font: fontOptions[0] });
                            loadGoogleFont(fontOptions[0]);
                            setFontPickerOpen(false);
                          }
                        }}
                        className={fieldClass}
                      />
                      {fontPickerOpen && <div id="font-picker-options" role="listbox" className="absolute left-0 top-full z-50 mt-1 max-h-64 w-[min(280px,70vw)] overflow-y-auto rounded-lg border border-white/10 bg-[#101d2a] p-1 shadow-2xl">
                        {fontOptions.length ? fontOptions.map((family) => <button key={family} type="button" role="option" aria-selected={box.font === family} onMouseDown={(event) => event.preventDefault()} onClick={() => {
                          updateBox({ font: family });
                          loadGoogleFont(family);
                          setFontSearch('');
                          setFontPickerOpen(false);
                        }} className={`block w-full truncate rounded px-2.5 py-2 text-left text-sm ${box.font === family ? 'bg-brand/15 text-brand' : 'text-warm-white hover:bg-white/10'}`} style={{ fontFamily: FONTS[family] ?? `"${family.replaceAll('"', '')}", sans-serif` }}>{family}</button>)
                          : <p className="px-2.5 py-3 text-xs text-warm-white/50">No fonts found.</p>}
                        {fontOptions.length === 60 && <p className="px-2.5 py-2 text-[10px] text-warm-white/45">Showing first 60 matches. Type more to narrow the list.</p>}
                      </div>}
                    </div>
                    <select
                      aria-label="Font size"
                      value={box.size}
                      onChange={(e) => updateBox({ size: Number(e.target.value), autoSize: false })}
                      className={fieldClass}
                    >
                      {[...new Set([32, 48, 64, 72, 96, 120, 144, box.size])]
                        .sort((a, b) => a - b)
                        .map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                    </select>
                  </div>

                  <SectionTitle>Look</SectionTitle>
                  <div className="flex items-center justify-between text-sm text-warm-white">
                    Text Color
                    <ColorField label="Text color" value={box.color} onChange={(v) => updateBox({ color: v })} />
                  </div>

                  <div className="flex items-center justify-between text-sm text-warm-white">
                    Text Shadow
                    <Toggle label="Text shadow" on={box.shadow} onChange={(v) => updateBox({ shadow: v })} />
                  </div>

                  <div className="flex items-center justify-between text-sm text-warm-white">
                    Background Color
                    <div className="flex items-center gap-3">
                      <ColorField label="Box background color" value={box.boxBg} onChange={(v) => updateBox({ boxBg: v, boxBgOn: true })} />
                      <Toggle label="Use box background" on={box.boxBgOn} onChange={(v) => updateBox({ boxBgOn: v })} />
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-3">
                    <div className="flex items-center justify-between text-sm text-warm-white">
                      Auto Sizing
                      <Toggle label="Auto sizing" on={box.autoSize} onChange={(v) => updateBox({ autoSize: v })} />
                    </div>
                    <p className="mt-1 text-xs text-warm-white/50">
                      Text shrinks to fit the text box when you drag it smaller.
                    </p>
                  </div>

                  <Collapsible title="Position & Size">
                    <div className="grid grid-cols-2 gap-2 text-xs text-warm-white/70">
                      {(['x', 'y', 'w', 'h'] as const).map((k) => (
                        <label key={k} className="flex items-center gap-2">
                          <span className="w-4 uppercase">{k}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(box[k])}
                            onChange={(e) => {
                              const v = clamp(Number(e.target.value) || 0, k === 'w' || k === 'h' ? 8 : 0, 100);
                              updateBox({ [k]: v } as Partial<TextBox>);
                            }}
                            className={fieldClass}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-1 text-[11px] text-warm-white/50">Values are % of the slide.</p>
                  </Collapsible>
                </div>
              ))}

            {tab === 'Style' && (
              <div className="flex flex-col gap-4 text-sm text-warm-white">
                {selectedShape ? (
                  <div className="flex items-center justify-between">
                    Shape fill
                    <ColorField label="Shape fill color" value={selectedShape.fill} onChange={(value) => updateShape(selectedShape.id, { fill: value })} />
                  </div>
                ) : !box ? (
                  <p className="text-warm-white/60">Add a text box to change its style.</p>
                ) : (
                  <>
                    <label className="block">
                      <span className="flex justify-between text-xs text-warm-white/70">
                        Line height <span>{box.lineHeight.toFixed(2)}</span>
                      </span>
                      <input
                        type="range"
                        min={0.9}
                        max={1.8}
                        step={0.05}
                        value={box.lineHeight}
                        onChange={(e) => updateBox({ lineHeight: Number(e.target.value) })}
                        className="mt-1 w-full accent-brand"
                      />
                    </label>
                    <label className="block">
                      <span className="flex justify-between text-xs text-warm-white/70">
                        Letter spacing <span>{box.letterSpacing}px</span>
                      </span>
                      <input
                        type="range"
                        min={-4}
                        max={20}
                        step={1}
                        value={box.letterSpacing}
                        onChange={(e) => updateBox({ letterSpacing: Number(e.target.value) })}
                        className="mt-1 w-full accent-brand"
                      />
                    </label>
                  </>
                )}
              </div>
            )}

            {tab === 'Background' && (
              <div className="flex flex-col gap-4">
                <div>
                  <p className="mb-2 text-xs text-warm-white/70">Colors</p>
                  <div className="grid grid-cols-4 gap-2">
                    {BGS.map((b) => (
                      <button
                        key={b}
                        aria-label="Use this background"
                        onClick={() => updateSlide({ bg: b, bgImage: undefined, bgVideo: undefined, bgVideoMuted: undefined, bgAssetId: undefined, bgPosition: undefined, bgPictureRestore: undefined })}
                        className={`aspect-video rounded-md border-2 bg-linear-to-br ${b} ${
                          cur.bg === b && !cur.bgImage && !cur.bgVideo ? 'border-brand' : 'border-white/10'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                {(cur.bgImage || cur.bgVideo) && <button type="button" onClick={() => removeBackgroundMedia(false)} className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-red-200 hover:bg-red-500/10">Remove background {cur.bgVideo ? 'video' : 'image'}</button>}
                {cur.bgImage && <p className="text-[11px] text-warm-white/50">Double-click the background on the slide, then drag it to reposition.</p>}
                <p className="text-[10px] leading-relaxed text-warm-white/45">Choose from uploads added in Content. Smaller high quality copies are used when they save space; original uploads are kept.</p>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-warm-white/80">Recent uploads</p>
                    <span className="text-[10px] text-warm-white/45">{backgroundAssets.length} saved</span>
                  </div>
                  {backgroundAssets.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-white/15 p-3 text-center text-[11px] text-warm-white/50">Images and videos added in Content will appear here to use as backgrounds.</p>
                  ) : (
                    <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1">
                      {backgroundAssets.map((asset) => (
                        <div key={asset.id} className={`group relative overflow-hidden rounded-lg border transition ${cur.bgAssetId === asset.id ? 'border-brand ring-1 ring-brand/40' : 'border-white/10 hover:border-white/40'}`}>
                          <button onClick={() => applyMediaAsset(asset)} title={`Set ${asset.name} as the slide background`} className="block w-full text-left">
                            <span className="relative block aspect-video overflow-hidden bg-navy">
                              {asset.type === 'image' ? <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" /> : <video src={asset.url} muted className="h-full w-full object-cover" />}
                              {asset.type === 'video' && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-white">VIDEO</span>}
                            </span>
                            <span className="block truncate px-1.5 pt-1 text-[10px] text-warm-white/75">{asset.name}</span>
                            <span className="block truncate px-1.5 pb-1 text-[9px] text-warm-white/45">{asset.optimized && asset.originalBlob ? `${formatMediaSizeInKb(asset.originalBlob.size)} → ` : ''}{formatMediaSizeInKb(asset.blob.size)}{asset.optimized ? ' · optimized copy' : ''}</span>
                          </button>
                          {asset.type === 'video' && <button type="button" aria-label={`Preview ${asset.name}`} title={`Play preview of ${asset.name}`} onClick={() => setVideoPreviewAsset(asset)} className="absolute bottom-2 right-2 z-10 rounded-md bg-black/80 p-1.5 text-white hover:bg-brand"><Play size={13} /></button>}
                          <button type="button" aria-label={`Delete ${asset.name}`} title={`Delete ${asset.name}`} onClick={() => setDeleteConfirmation({
                            title: 'Delete uploaded background?',
                            message: `Delete “${asset.name}” from saved uploads? Slides using this file will switch back to their color background.`,
                            onConfirm: () => { void deleteMediaAsset(asset); },
                          })} className="absolute right-1 top-1 z-10 rounded-md border border-white/15 bg-black/75 p-1.5 text-white/75 opacity-0 shadow transition hover:bg-red-600 hover:text-white focus:opacity-100 group-hover:opacity-100">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {cur.bgVideo && (
                  <button
                    type="button"
                    aria-pressed={!(cur.bgVideoMuted ?? true)}
                    onClick={() => updateSlide({ bgVideoMuted: !(cur.bgVideoMuted ?? true) })}
                    className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs text-warm-white hover:bg-white/5"
                  >
                    <span>Background video audio</span>
                    <span className="font-semibold text-brand">{cur.bgVideoMuted ?? true ? 'Muted' : 'On'}</span>
                  </button>
                )}
                <label className="block text-sm text-warm-white">
                  <span className="flex justify-between text-xs text-warm-white/70">
                    Darken background <span>{cur.dim}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={cur.dim}
                    onChange={(e) => updateSlide({ dim: Number(e.target.value) })}
                    className="mt-1 w-full accent-brand"
                  />
                  <span className="text-[11px] text-warm-white/50">Makes text easier to read on bright photos.</span>
                </label>
              </div>
            )}

          </div>
          {cur.locked && <div className="absolute inset-0 z-30 flex items-center justify-center bg-navy/85 p-5 text-center backdrop-blur-[1px]">
            <div><Lock size={22} className="mx-auto text-amber-200" /><p className="mt-3 text-sm font-semibold text-white">This slide is locked</p><p className="mt-1 text-xs text-white/55">Use the slide options menu to unlock it.</p></div>
          </div>}
        </section>
      </div>

      {/* Add to your slide: ONE place for templates, text, scripture and media */}
      <section className="flex h-43 shrink-0 flex-col rounded-xl border border-white/10 bg-panel">
        <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-2">
          {DOCK.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setDock(key)}
              aria-pressed={dock === key}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                dock === key
                  ? 'border-brand font-medium text-brand'
                  : 'border-transparent text-warm-white/70 hover:text-warm-white'
              }`}
            >
              <Icon size={16} /> {key}
            </button>
          ))}
          <span className="ml-auto truncate pr-2 text-xs text-warm-white/50">
            {DOCK.find((d) => d.key === dock)!.hint}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {dock === 'Templates' &&
            TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => insertSlide(makeSlide(t))}
                className="w-37.5 shrink-0 text-left"
              >
                <span className="relative block aspect-video overflow-hidden rounded-lg border border-white/10 hover:border-brand">
                  <SlideRender slide={makeSlide(t)} />
                </span>
                <span className="mt-1 block truncate text-xs text-warm-white/80">{t.label}</span>
              </button>
            ))}

          {dock === 'Text' && (
            <>
              <ActionCard icon={Timer} label="Countdown slide" hint="Create a live event countdown" onClick={addCountdownSlide} />
              <ActionCard icon={Type} label="Add text box" hint="Type on this slide" onClick={addText} />
              {TEXT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyTextPreset(p)}
                  className="h-full w-42.5 shrink-0 rounded-lg border border-white/10 p-3 text-left hover:border-brand"
                >
                  <span className="block text-sm font-semibold text-warm-white">{p.label}</span>
                  <span className="mt-1 overflow-hidden text-xs text-warm-white/60 [-webkit-box-orient:vertical] [-webkit-line-clamp:3] [display:-webkit-box]">
                    {p.text.replace('\n', ' - ')}
                  </span>
                </button>
              ))}
            </>
          )}

          {dock === 'Scripture' && (
            <ActionCard icon={BookOpen} label="Search Scripture" hint="Choose a verse to add to this slide" onClick={() => setScripturePickerOpen(true)} />
          )}

          {dock === 'Media' && (
            <>
              {BGS.map((b) => (
                <button
                  key={b}
                  aria-label="Use this background"
                  title="Use this background"
                  onClick={() => updateSlide({ bg: b, bgImage: undefined, bgVideo: undefined, bgAssetId: undefined })}
                  className={`aspect-video h-full shrink-0 rounded-lg border-2 bg-linear-to-br ${b} ${
                    cur.bg === b && !cur.bgImage && !cur.bgVideo ? 'border-brand' : 'border-white/10'
                  }`}
                />
              ))}
            </>
          )}

          {dock === 'Shapes' && (
            <>
              {([
                { kind: 'rectangle', label: 'Rectangle', icon: Square },
                { kind: 'circle', label: 'Circle', icon: CircleIcon },
                { kind: 'triangle', label: 'Triangle', icon: Triangle },
                { kind: 'line', label: 'Line', icon: Minus },
                { kind: 'star', label: 'Star', icon: Star },
                { kind: 'arrow', label: 'Arrow', icon: ArrowRight },
              ] as const).map(({ kind, label, icon: Icon }) => (
                <ActionCard key={kind} icon={Icon} label={label} hint="Add to this slide" onClick={() => addShape(kind)} />
              ))}
              <p className="self-center text-xs text-warm-white/50">Drag a shape to move it. Select and press Backspace to remove.</p>
            </>
          )}
        </div>
      </section>

      {/* Bottom: save and preview */}
      <div className="flex shrink-0 items-center gap-3">
        <button
          onClick={save}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-panel px-5 py-3 text-sm font-medium text-warm-white hover:bg-white/5"
        >
          <Save size={18} /> Save & Close
        </button>
        <span role="status" className="text-xs text-warm-white/70">
          {status}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setPreviewing(true)}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-panel px-8 py-3 text-sm font-medium text-warm-white hover:bg-white/5"
          >
            <Play size={16} /> Preview
          </button>
        </div>
      </div>

      <input ref={contentInput} type="file" accept="image/*,video/*" hidden onChange={(event) => { addContentMedia(event.target.files?.[0]); event.target.value = ''; }} />

      {videoPreviewAsset && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideoPreviewAsset(null); }}>
        <section role="dialog" aria-modal="true" aria-label={`Preview ${videoPreviewAsset.name}`} className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#101d2a] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate text-sm font-semibold text-warm-white">{videoPreviewAsset.name}</h2><button type="button" onClick={() => setVideoPreviewAsset(null)} aria-label="Close video preview" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={17} /></button></div>
          <video src={videoPreviewAsset.url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
          <p className="mt-3 text-xs text-warm-white/55">This upload is from the background library. Add videos that need player controls from the Content tab.</p>
          <div className="mt-2 flex justify-end"><button type="button" onClick={() => { applyMediaAsset(videoPreviewAsset); setVideoPreviewAsset(null); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy">Use as background</button></div>
        </section>
      </div>}
      {previewing && <PreviewOverlay slides={slides} start={index} onClose={() => setPreviewing(false)} />}
      <ScripturePickerModal
        open={scripturePickerOpen}
        onClose={() => setScripturePickerOpen(false)}
        onAdd={(reference, text) => {
          const id = nextId++;
          const offset = (cur.extraBoxes?.length ?? 0) % 4;
          const verseBox = {
            id,
            box: {
              ...defaultBox(`${reference}\n${text}`, 56),
              x: 15 + offset * 4,
              y: 28 + offset * 4,
              w: 70,
              h: 44,
            },
          };
          updateSlide({ extraBoxes: [...(cur.extraBoxes ?? []), verseBox] });
          setSelectedBoxId(id);
          setIsBoxSelected(true);
          setTab('Content');
          setScripturePickerOpen(false);
        }}
      />
      {projectLocked && <div className="absolute inset-0 z-70 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-panel p-6 text-center shadow-2xl">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200"><Lock size={22} /></span>
          <h2 className="mt-4 text-lg font-semibold text-warm-white">Presentation locked</h2>
          <p className="mt-2 text-sm text-warm-white/55">Unlock this presentation from its options menu before editing its slides.</p>
          <button onClick={requestBackToPresentations} className="mt-5 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-navy hover:brightness-110">Back to presentations</button>
        </div>
      </div>}
      <ConfirmationModal
        open={deleteConfirmation !== null}
        title={deleteConfirmation?.title ?? ''}
        message={deleteConfirmation?.message ?? ''}
        onCancel={() => setDeleteConfirmation(null)}
        onConfirm={() => deleteConfirmation?.onConfirm()}
      />
      {leaveConfirmationOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLeaveConfirmationOpen(false); setPendingNavigation(null); } }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="leave-presentation-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
          <h2 id="leave-presentation-title" className="text-base font-bold text-warm-white">You have unsaved changes</h2>
          <p className="mt-2 text-sm leading-relaxed text-warm-white/60">Save your slide changes before leaving this presentation, or discard them?</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => { setLeaveConfirmationOpen(false); setPendingNavigation(null); }} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Keep editing</button>
            <button type="button" onClick={discardEditorChanges} className="rounded-lg border border-red-400/30 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">Discard changes</button>
            <button type="button" onClick={keepChangesAndContinue} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110">Keep changes</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
