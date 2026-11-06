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
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowRight,
  Bold,
  BookOpen,
  BookMarked,
  Check,
  Circle as CircleIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Italic,
  LayoutTemplate,
  Loader2,
  FolderOpen,
  FolderPlus,
  Lock,
  MoreHorizontal,
  Pencil,
  Minus,
  Play,
  Plus,
  Save,
  Search,
  Shapes,
  Square,
  Star,
  Tag,
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
import {
  DEFAULT_CATEGORIES,
  cleanCategoryName,
  dragHasFiles,
  groupByFolder,
  isBackgroundMedia,
  isPowerPoint,
  isSlideImage,
  loadPresentationCategories,
  naturalCompare,
  pathedFilesFromInput,
  readDroppedFiles,
  savePresentationCategories,
  type PathedFile,
} from '../utils/slideLibrary';
import CountdownDisplay, { COUNTDOWN_FONTS, DEFAULT_COUNTDOWN_UNITS, type CountdownFormat, type CountdownSettings } from '../components/CountdownDisplay';
import { formatMediaSizeInKb, prepareMediaFile } from '../utils/mediaOptimization';
import { getAccountDatabaseName, getAccountStorageKey } from '../utils/accountStorage';
import GOOGLE_FONT_FAMILIES from '../data/google-font-families.json';
import { API_BASE_URL as PRESENTATION_API_URL } from '../utils/apiConfig';
import Songbooks from './Songbooks';
import { songSlideLayouts, type Song, type SongTextLayout } from '../utils/songbooks';
import SlideTextEditor from '../components/SlideTextEditor';
import { backgroundClasses, backgroundStyle, customBackground, parseCustomBackground } from '../utils/slideBackground';
import { activeAlign, alignText, hasLineAligns, lineAlignAt, remapLineAligns, type TextRange } from '../utils/lineAlign';
import BodyPortal from '../components/BodyPortal';

/* ---------- Types & data ---------- */

type Align = 'left' | 'center' | 'right' | 'justify';
type VAlign = 'top' | 'middle' | 'bottom';
const VALIGN_ITEMS: Record<VAlign, string> = { top: 'items-start', middle: 'items-center', bottom: 'items-end' };
const VALIGN_ORIGIN: Record<VAlign, string> = { top: 'top center', middle: 'center', bottom: 'bottom center' };

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
  /** Show the text in capital letters. The typed text keeps its case, so this can be switched off again. */
  uppercase?: boolean;
  /** Where the text sits inside its box, top to bottom. Missing means middle (older slides). */
  valign?: VAlign;
  /** Alignment of single lines that differ from the box's `align` (index = line number; null = follow the box). */
  lineAligns?: (Align | null)[];
};

/** Applies a change to a text box; editing the text keeps each line's own alignment. */
const patchTextBox = (box: TextBox, patch: Partial<TextBox>): TextBox => {
  const next = { ...box, ...patch };
  if (patch.text !== undefined && !('lineAligns' in patch) && box.lineAligns) next.lineAligns = remapLineAligns(box.text, patch.text, box.lineAligns);
  return next;
};

type PictureT = { id: number; src: string; x: number; y: number; w: number; h: number; mediaType?: 'image' | 'video'; assetId?: string; muted?: boolean; aspectRatio?: number; layerOrder?: number | 'back' | 'front' };
type ShapeT = { id: number; kind: 'rectangle' | 'circle' | 'triangle' | 'line' | 'star' | 'arrow'; x: number; y: number; w: number; h: number; fill: string; layerOrder?: number };
type MediaAsset = { id: string; name: string; type: 'image' | 'video'; category?: 'background' | 'slide'; collection?: string; blob: Blob; originalBlob?: Blob; optimized?: boolean; createdAt: number; url: string };
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

/**
 * A template is a whole presentation design: a matching set of slides (welcome, worship,
 * Scripture, sermon, announcements, giving, closing) in one look. "My templates" are
 * presentations the user saved as a template.
 */
type SlideTemplate = { id: string; label: string; slides: Omit<SlideT, 'id'>[]; mine?: boolean; colors?: string[]; updatedAt?: number };
type TemplateTheme = { id: string; label: string; bg: string; altBg: string; text: string; soft: string; accent: string; heading: string; body: string };
const tb = (text: string, size: number, patch: Partial<TextBox>): TextBox => ({ ...defaultBox(text, size), autoSize: true, ...patch });
const accentBar = (id: number, x: number, y: number, w: number, h: number, fill: string): ShapeT => ({ id, kind: 'rectangle', x, y, w, h, fill, layerOrder: 2000 });
const TEMPLATE_THEMES: TemplateTheme[] = [
  { id: 'midnight', label: 'Midnight', bg: customBackground('#0F1B2D', '#1E3A5F'), altBg: customBackground('#0B1422', '#16263D'), text: '#FFFFFF', soft: '#C9D8EC', accent: '#F5B971', heading: 'Montserrat', body: 'Montserrat' },
  { id: 'warm', label: 'Warm Sunday', bg: customBackground('#2A1D17', '#5A3A28'), altBg: customBackground('#1E1511', '#3B281D'), text: '#FFF8F0', soft: '#EAD9C8', accent: '#F2A65A', heading: 'Poppins', body: 'Poppins' },
  { id: 'light', label: 'Clean Light', bg: customBackground('#F7F4EE'), altBg: customBackground('#ECE6DC'), text: '#1F2937', soft: '#4B5563', accent: '#B4632E', heading: 'Montserrat', body: 'Calibri' },
  { id: 'forest', label: 'Forest', bg: customBackground('#0E3B2E', '#06231B'), altBg: customBackground('#0A2C22', '#041A14'), text: '#FFFFFF', soft: '#CDEBDD', accent: '#E9C46A', heading: 'Montserrat', body: 'Cambria' },
];
const themeSlides = (t: TemplateTheme): Omit<SlideT, 'id'>[] => {
  const head = (text: string, size: number, patch: Partial<TextBox>) => tb(text, size, { font: t.heading, color: t.text, shadow: false, ...patch });
  const body = (text: string, size: number, patch: Partial<TextBox>) => tb(text, size, { font: t.body, color: t.soft, bold: false, shadow: false, ...patch });
  const label = (text: string, patch: Partial<TextBox>) => tb(text, 28, { font: t.heading, color: t.accent, letterSpacing: 6, shadow: false, ...patch });
  return [
    { title: 'Welcome', bg: t.bg, dim: 0, box: head('Welcome', 128, { x: 10, y: 28, w: 80, h: 22, letterSpacing: 2 }), extraBoxes: [{ id: 1, box: body("We're so glad you're here", 44, { x: 10, y: 56, w: 80, h: 10 }) }], shapes: [accentBar(1, 44, 52.5, 12, 0.7, t.accent)] },
    { title: 'Worship', bg: t.altBg, dim: 0, box: head('Lyrics go here\nSecond line of the song', 76, { x: 8, y: 22, w: 84, h: 56, lineHeight: 1.25 }), extraBoxes: [{ id: 1, box: body('Song title', 26, { x: 8, y: 88, w: 84, h: 6 }) }] },
    { title: 'Scripture', bg: t.bg, dim: 0, box: body('God is our refuge and strength, a very present help in trouble.', 64, { font: t.body, color: t.text, italic: true, x: 12, y: 26, w: 76, h: 40, lineHeight: 1.3 }), extraBoxes: [{ id: 1, box: label('PSALM 46:1', { x: 12, y: 72, w: 76, h: 8 }) }] },
    { title: 'Sermon title', bg: t.altBg, dim: 0, box: head('Sermon Title', 104, { align: 'left', valign: 'top', x: 9, y: 36, w: 72, h: 30, lineHeight: 1.05 }), extraBoxes: [{ id: 1, box: label('THIS SUNDAY', { align: 'left', x: 9, y: 26, w: 50, h: 7 }) }, { id: 2, box: body('Pastor Name · Book 1:1-10', 38, { align: 'left', x: 9, y: 70, w: 72, h: 8 }) }], shapes: [accentBar(1, 9, 34, 8, 0.8, t.accent)] },
    { title: 'Sermon point', bg: t.bg, dim: 0, box: head('The main point of this part of the message', 72, { align: 'left', valign: 'top', x: 9, y: 30, w: 80, h: 34, lineHeight: 1.15 }), extraBoxes: [{ id: 1, box: label('POINT 1', { align: 'left', x: 9, y: 21, w: 40, h: 7 }) }, { id: 2, box: body('Supporting verse or note', 36, { align: 'left', x: 9, y: 70, w: 80, h: 8 }) }], shapes: [accentBar(1, 0, 0, 1.4, 100, t.accent)] },
    { title: 'Announcements', bg: t.altBg, dim: 0, box: head('Announcements', 64, { align: 'left', x: 9, y: 10, w: 82, h: 12 }), extraBoxes: [{ id: 1, box: body('• Youth night — Friday 7 PM\n• Prayer meeting — Wednesday 6 PM\n• Bible study — Saturday 9 AM', 44, { align: 'left', valign: 'top', x: 9, y: 30, w: 82, h: 58, lineHeight: 1.6, color: t.text }) }], shapes: [accentBar(1, 9, 23.5, 10, 0.7, t.accent)] },
    { title: 'Giving', bg: t.bg, dim: 0, box: head('Tithes & Offering', 92, { x: 10, y: 26, w: 80, h: 20 }), extraBoxes: [{ id: 1, box: body('"Each of you should give what you have decided in your heart to give." — 2 Corinthians 9:7', 36, { italic: true, x: 14, y: 54, w: 72, h: 16, lineHeight: 1.35 }) }], shapes: [accentBar(1, 45, 50, 10, 0.7, t.accent)] },
    { title: 'Closing', bg: t.altBg, dim: 0, box: head('Thank you for worshiping with us', 80, { x: 10, y: 30, w: 80, h: 26, lineHeight: 1.15 }), extraBoxes: [{ id: 1, box: body('See you next Sunday · God bless!', 40, { x: 10, y: 62, w: 80, h: 9 }) }] },
  ];
};
const TEMPLATES: SlideTemplate[] = TEMPLATE_THEMES.map((theme) => ({ id: theme.id, label: theme.label, slides: themeSlides(theme), colors: [theme.bg, theme.altBg, customBackground(theme.accent)] }));

const TEXT_PRESETS = [
  { label: 'Title + subtitle', text: 'Title\nSubtitle goes here', size: 96 },
];

let nextId = 100;
/** Presentations saved as templates ("My templates") for this account. */
const MY_TEMPLATES_KEY = 'faithstream.presentation.templates';
const loadMyTemplates = (): SlideTemplate[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(getAccountStorageKey(MY_TEMPLATES_KEY)) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item): SlideTemplate[] => {
      if (!item || typeof item.id !== 'string' || typeof item.label !== 'string') return [];
      // Early saves held a single slide.
      const slides = Array.isArray(item.slides) ? item.slides : item.slide ? [item.slide] : [];
      const colors = Array.isArray(item.colors) ? item.colors.filter((color: unknown): color is string => typeof color === 'string') : undefined;
      const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : 0;
      return slides.length ? [{ id: item.id, label: item.label, slides, colors, updatedAt, mine: true }] : [];
    });
  } catch { return []; }
};
const saveMyTemplates = (templates: SlideTemplate[]) => {
  try { localStorage.setItem(getAccountStorageKey(MY_TEMPLATES_KEY), JSON.stringify(templates.map(({ id, label, slides, colors, updatedAt }) => ({ id, label, slides, colors, updatedAt })))); } catch { /* storage full: keep them for this session */ }
};
/** A new slide from a template slide, with fresh ids so it never clashes with slides already in the deck. */
const slideFromTemplate = (template: Omit<SlideT, 'id'>): SlideT => {
  const copy = JSON.parse(JSON.stringify(template)) as Omit<SlideT, 'id'>;
  return {
    ...copy,
    id: nextId++,
    locked: undefined,
    extraBoxes: copy.extraBoxes?.map((item) => ({ ...item, id: nextId++ })),
    shapes: copy.shapes?.map((shape) => ({ ...shape, id: nextId++ })),
    pictures: copy.pictures?.map((picture) => ({ ...picture, id: nextId++ })),
  };
};

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
const MEDIA_DB = 'faithstream.media';
const MEDIA_STORE = 'assets';

/** `colors`: background colours saved for this presentation only (same format as a slide's `bg`). */
type PresentationProject = { id: string; name: string; slides: SlideT[]; updatedAt: number; locked?: boolean; deviceOnly?: boolean; hasLocalMedia?: boolean; colors?: string[] };
type SyncedPresentation = Pick<PresentationProject, 'id' | 'name' | 'slides' | 'updatedAt' | 'colors'> & { hasLocalMedia?: boolean };
const MAX_PRESENTATION_COLORS = 24;
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

  return { id: project.id, name: project.name, slides, updatedAt: project.updatedAt, hasLocalMedia, ...(project.colors?.length ? { colors: project.colors } : {}) };
};

const loadProjects = (): PresentationProject[] => {
  try {
    const rawProjects = localStorage.getItem(getAccountStorageKey(PROJECTS_STORAGE_KEY));
    if (rawProjects) {
      const parsed = JSON.parse(rawProjects) as PresentationProject[];
      if (Array.isArray(parsed)) {
        const ids = parsed.flatMap((project) => project.slides.map((slide) => slide.id));
        if (ids.length) nextId = Math.max(nextId, ...ids) + 1;
        return parsed;
      }
    }
  } catch {
    /* start with an empty presentation library */
  }
  return [];
};

const openMediaDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(getAccountDatabaseName(MEDIA_DB), 1);
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

/*
 * Kept between visits to the Presentations page so reopening it is instant: the media library
 * (with its preview URLs), which presentation versions the account already has, and when the
 * account was last checked.
 */
let mediaLibraryCache: { db: string; assets: MediaAsset[] } | null = null;
const syncedVersions = new Map<string, number>();
let lastAccountCheck = 0;
/** Template versions the account already has (so unchanged templates are not uploaded again). */
const syncedTemplateVersions = new Map<string, number>();
/** Templates deleted on this computer that still need deleting from the account (e.g. made offline). */
const DELETED_TEMPLATES_KEY = 'faithstream.presentation.templates.deleted';
const loadDeletedTemplateIds = (): string[] => {
  try { const raw = JSON.parse(localStorage.getItem(getAccountStorageKey(DELETED_TEMPLATES_KEY)) ?? '[]'); return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
};
const saveDeletedTemplateIds = (ids: string[]) => {
  try { localStorage.setItem(getAccountStorageKey(DELETED_TEMPLATES_KEY), JSON.stringify([...new Set(ids)].slice(-200))); } catch { /* retried next time */ }
};
type SyncedTemplate = { id: string; name: string; slides: Omit<SlideT, 'id'>[]; colors?: string[]; updatedAt: number; hasLocalMedia?: boolean };
/** A template as the account stores it: pictures and videos stay on this computer, like presentations. */
const prepareTemplateForAccountSync = (template: SlideTemplate): SyncedTemplate => {
  const synced = prepareProjectForAccountSync({ id: template.id, name: template.label, slides: template.slides as SlideT[], updatedAt: template.updatedAt ?? 0, colors: template.colors });
  return { id: synced.id, name: synced.name.slice(0, 120), slides: synced.slides, colors: synced.colors, updatedAt: synced.updatedAt, hasLocalMedia: synced.hasLocalMedia };
};
const ACCOUNT_CHECK_INTERVAL_MS = 60_000;

const saveMediaAsset = async (file: File, category: 'background' | 'slide' = 'background', collection?: string): Promise<StoredMediaAsset> => {
  const prepared = await prepareMediaFile(file);
  const asset: StoredMediaAsset = { id: crypto.randomUUID(), name: file.name, type: file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name) ? 'video' : 'image', category, ...(collection ? { collection } : {}), blob: prepared.file, originalBlob: prepared.originalFile, optimized: !!prepared.originalFile, createdAt: Date.now() };
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

/** Saves changed details (such as a collection name) for existing library items. */
const updateMediaAssetsInDb = async (assets: StoredMediaAsset[]) => {
  if (!assets.length) return;
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE);
    for (const asset of assets) store.put(asset);
    transaction.oncomplete = () => { db.close(); resolve(); };
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
    const raw = localStorage.getItem(getAccountStorageKey(STORAGE_KEY));
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
      className={`absolute flex ${VALIGN_ITEMS[box.valign ?? 'middle']} overflow-hidden`}
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
          textAlignLast: box.align === 'justify' ? 'left' : undefined,
          transform: `scale(${scale})`,
          transformOrigin: VALIGN_ORIGIN[box.valign ?? 'middle'],
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
            textTransform: box.uppercase ? 'uppercase' : undefined,
            color: box.color,
            textShadow: shadow,
          }}
        >
          {hasLineAligns(box.lineAligns)
            ? box.text.split('\n').map((line, lineIndex) => {
              const lineAlign = lineAlignAt(box.align, box.lineAligns, lineIndex);
              return <div key={lineIndex} style={{ textAlign: lineAlign, textAlignLast: lineAlign === 'justify' ? 'left' : undefined }}>{line || ' '}</div>;
            })
            : box.text}
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
      className={`absolute isolate inset-0 overflow-hidden bg-linear-to-br ${backgroundClasses(slide.bg)}`}
      style={{ containerType: 'inline-size', ...backgroundStyle(slide.bg) }}
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
    <BodyPortal><div
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
    </div></BodyPortal>
  );
}

/* ---------- Page ---------- */

type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
/** Format: everything about the selected text, shape, video or countdown. Media: add pictures and videos. */
type PropsTab = 'Format' | 'Media' | 'Background';
type Dock = 'Templates' | 'Text' | 'Scripture' | 'Media' | 'Shapes';

const DOCK: { key: Dock; icon: LucideIcon; hint: string }[] = [
  { key: 'Templates', icon: LayoutTemplate, hint: 'Pick a template to see its slides, then add them all or just the ones you need' },
  { key: 'Text', icon: Type, hint: 'Add another independent text box to this slide' },
  { key: 'Scripture', icon: BookOpen, hint: 'Find a verse and add it to this slide' },
  { key: 'Media', icon: ImageIcon, hint: 'Add pictures and video backgrounds' },
  { key: 'Shapes', icon: Shapes, hint: 'Coming soon' },
];

const ZOOMS: Record<string, number> = { '100%': 1, '75%': 0.75, '50%': 0.5 };

const HANDLES: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
};
/** Side handles for text boxes: left / right change only the width (the box then grows or shrinks to fit the text, like Canva); top / bottom change only the height. */
const TEXT_SIDE_HANDLES: Record<'n' | 's' | 'e' | 'w', string> = {
  n: 'left-1/2 -top-1 h-1.5 w-5 -translate-x-1/2 cursor-ns-resize',
  s: 'left-1/2 -bottom-1 h-1.5 w-5 -translate-x-1/2 cursor-ns-resize',
  e: 'top-1/2 -right-1 h-5 w-1.5 -translate-y-1/2 cursor-ew-resize',
  w: 'top-1/2 -left-1 h-5 w-1.5 -translate-y-1/2 cursor-ew-resize',
};

export default function Presentation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [slides, setSlides] = useState<SlideT[]>(loadSlides);
  const [projects, setProjects] = useState<PresentationProject[]>(loadProjects);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() => (mediaLibraryCache?.db === getAccountDatabaseName(MEDIA_DB) ? mediaLibraryCache.assets : []));
  // True once the media library has been read (or came from the cache), so the cache is never
  // replaced by the empty list the page starts with.
  const mediaReadyRef = useRef(mediaLibraryCache?.db === getAccountDatabaseName(MEDIA_DB));
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<PropsTab>('Format');
  const [dock, setDock] = useState<Dock>('Templates');
  const [zoom, setZoom] = useState('100%');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [projectMenuFor, setProjectMenuFor] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [videoPreviewAsset, setVideoPreviewAsset] = useState<MediaAsset | null>(null);
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [draggingSlide, setDraggingSlide] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [scripturePickerOpen, setScripturePickerOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [mediaImporting, setMediaImporting] = useState<string | null>(null);
  const [slideImportProgress, setSlideImportProgress] = useState<{ message: string; current: number; total: number } | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [isBoxSelected, setIsBoxSelected] = useState(false);
  /** The text highlighted in a text box editor, so the align buttons can change just those lines. */
  const [textSelection, setTextSelection] = useState<(TextRange & { slideId: number; boxId: number | null }) | null>(null);
  const [selectedPictureId, setSelectedPictureId] = useState<number | null>(null);
  const [pictureMenu, setPictureMenu] = useState<{ kind: 'picture' | 'text' | 'background'; id: number | null; x: number; y: number } | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<number | null>(null);
  const [selectedCountdown, setSelectedCountdown] = useState(false);
  const [backgroundEditing, setBackgroundEditing] = useState(false);
  const [alignmentGuides, setAlignmentGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [fontSearch, setFontSearch] = useState('');
  const [accountSyncStatus, setAccountSyncStatus] = useState('Connecting to your account…');
  // Library organisation (kept on this device).
  const [projectCategories, setProjectCategories] = useState<Record<string, string>>(loadPresentationCategories);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryCategory, setLibraryCategory] = useState('All');
  const [newCategoryDraft, setNewCategoryDraft] = useState('');
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [libraryDragOver, setLibraryDragOver] = useState(false);
  // Background collections.
  const [backgroundCollection, setBackgroundCollection] = useState('All');
  const [renamingCollection, setRenamingCollection] = useState<string | null>(null);
  const [collectionNameDraft, setCollectionNameDraft] = useState('');
  const [backgroundImportProgress, setBackgroundImportProgress] = useState<{ message: string; current: number; total: number } | null>(null);
  const [backgroundDragOver, setBackgroundDragOver] = useState(false);
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
      // Checked within the last minute: the saved list is already up to date.
      if (Date.now() - lastAccountCheck < ACCOUNT_CHECK_INTERVAL_MS) {
        accountSyncReadyRef.current = true;
        if (!cancelled) setAccountSyncStatus('Connected — syncing presentations');
        return;
      }
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
          // The account already has this version; it does not need uploading again.
          syncedVersions.set(project.id, project.updatedAt);
        }
        lastAccountCheck = Date.now();
        for (const existingProject of projectsRef.current) {
          const project = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existingProject.id)
            ? existingProject
            : { ...existingProject, id: crypto.randomUUID() };
          const remote = merged.get(project.id);
          if (!remote || project.updatedAt >= remote.updatedAt) merged.set(project.id, project);
        }
        const next = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
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
    const accountProjects = projects.filter((project) => !project.deviceOnly && project.id !== activeProjectId);
    // Upload only presentations that changed since the account last had them. (Loading pictures
    // also updates the list, but must not re-upload everything on every visit.)
    const syncableProjects = accountProjects.filter((project) => syncedVersions.get(project.id) !== project.updatedAt);
    if (accountProjects.length && !syncableProjects.length) {
      setAccountSyncStatus('Synced to your account · imported media stays on this device');
      return;
    }
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
        syncedVersions.set(project.id, project.updatedAt);
      })).then(() => {
        setAccountSyncStatus('Synced to your account · imported media stays on this device');
      }).catch(() => {
        setAccountSyncStatus('Sync failed — check your connection; this device still has its local copy');
      });
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [projects, activeProjectId]);

  // Connects slides to their pictures and videos. The library is read from storage only on the
  // first visit; after that it comes from memory, so the page opens without delay.
  useEffect(() => {
    let cancelled = false;
    const attach = (assets: MediaAsset[]) => {
      const byId = new Map(assets.map((asset) => [asset.id, asset]));
      const withMedia = (slide: SlideT): SlideT => {
        const asset = slide.bgAssetId ? byId.get(slide.bgAssetId) : undefined;
        const pictures = slide.pictures?.map((picture) => {
          const pictureAsset = picture.assetId ? byId.get(picture.assetId) : undefined;
          return pictureAsset ? { ...picture, src: pictureAsset.url } : picture;
        });
        const restoreAsset = slide.bgPictureRestore?.assetId ? byId.get(slide.bgPictureRestore.assetId) : undefined;
        const bgPictureRestore = restoreAsset && slide.bgPictureRestore ? { ...slide.bgPictureRestore, src: restoreAsset.url } : slide.bgPictureRestore;
        return { ...slide, ...(asset ? { bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined } : {}), bgPictureRestore, pictures };
      };
      skipUndoRecordingRef.current = true;
      setSlides((current) => current.map(withMedia));
      setProjects((current) => current.map((project) => ({ ...project, slides: project.slides.map(withMedia) })));
    };
    const dbName = getAccountDatabaseName(MEDIA_DB);
    if (mediaLibraryCache?.db === dbName) {
      attach(mediaLibraryCache.assets);
      return () => { cancelled = true; };
    }
    readMediaAssets().then((stored) => {
      const assets = stored.map((asset) => ({ ...asset, url: URL.createObjectURL(asset.blob) }));
      if (cancelled) { assets.forEach((asset) => URL.revokeObjectURL(asset.url)); return; }
      mediaLibraryCache = { db: dbName, assets };
      mediaReadyRef.current = true;
      setMediaAssets(assets);
      attach(assets);
    }).catch(() => { if (!cancelled) setStatus('Could not load the media library'); });
    // The preview URLs stay alive in the cache for the next visit; deleting an item frees its URL.
    return () => { cancelled = true; };
  }, []);

  // Keep the cache in step with media added or deleted on this page.
  useEffect(() => {
    if (mediaReadyRef.current) mediaLibraryCache = { db: getAccountDatabaseName(MEDIA_DB), assets: mediaAssets };
  }, [mediaAssets]);

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
      localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('faithstream:presentations-updated'));
      return next;
    });
  }, [slides, activeProjectId, projectName]);

  // Close a presentation's ⋯ menu when clicking anywhere outside it, or pressing Esc.
  useEffect(() => {
    if (!projectMenuFor) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-project-menu]')) setProjectMenuFor(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProjectMenuFor(null); };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [projectMenuFor]);

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
  const canvasTextRef = useRef<HTMLDivElement>(null);
  const canvasTextMeasureRef = useRef<HTMLDivElement>(null);
  /**
   * Set while a text box is resized from a side or corner: its height then hugs the text
   * (like Canva). `bottom` keeps the bottom edge still when a top corner is dragged.
   */
  const fitTextHeightRef = useRef<{ bottom: number | null } | null>(null);
  const [canvasTextScale, setCanvasTextScale] = useState(1);
  const slideImportInput = useRef<HTMLInputElement>(null);
  const slideFolderInput = useRef<HTMLInputElement>(null);
  const backgroundFolderInput = useRef<HTMLInputElement>(null);
  const backgroundFilesInput = useRef<HTMLInputElement>(null);
  // React has no prop for folder pickers, so switch these inputs to folder mode directly.
  const markFolderInput = useCallback((element: HTMLInputElement | null) => {
    if (element) { element.setAttribute('webkitdirectory', ''); element.setAttribute('directory', ''); }
  }, []);
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
    const room = textarea.clientHeight - contentHeight * scale;
    const valign = box?.valign ?? 'middle';
    textarea.style.paddingTop = `${Math.max(0, valign === 'top' ? 0 : valign === 'bottom' ? room : room / 2)}px`;
    // Resizing: the box hugs its text, so making it narrower makes it taller instead of shrinking the words.
    const stageHeight = stageRef.current?.getBoundingClientRect().height ?? 0;
    const fit = fitTextHeightRef.current;
    if (fit && box && stageHeight > 0 && contentHeight > 0) {
      const needed = Math.max(3, (contentHeight / stageHeight) * 100 + 0.4);
      if (fit.bottom !== null) {
        const wanted = Math.min(fit.bottom, needed);
        if (Math.abs(wanted - box.h) > 0.2 || Math.abs(fit.bottom - wanted - box.y) > 0.2) updateBoxById(selectedBoxId, { y: fit.bottom - wanted, h: wanted });
      } else {
        const wanted = Math.min(100 - box.y, needed);
        if (Math.abs(wanted - box.h) > 0.2) updateBoxById(selectedBoxId, { h: wanted });
      }
    }
  }, [box?.valign, box?.text, box?.size, box?.lineHeight, box?.letterSpacing, box?.font, box?.w, box?.h, box?.autoSize, canvasTextScale, isBoxSelected, selectedBoxId, zoom]);

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
    if (selectedBoxId === null) return s.box ? { ...s, box: patchTextBox(s.box, patch) } : s;
    return { ...s, extraBoxes: (s.extraBoxes ?? []).map((item) => item.id === selectedBoxId ? { ...item, box: patchTextBox(item.box, patch) } : item) };
  }));

  const updateBoxById = (id: number | null, patch: Partial<TextBox>) => !cur.locked && setSlides((l) => l.map((s, i) => {
    if (i !== index) return s;
    if (id === null) return s.box ? { ...s, box: patchTextBox(s.box, patch) } : s;
    return { ...s, extraBoxes: (s.extraBoxes ?? []).map((item) => item.id === id ? { ...item, box: patchTextBox(item.box, patch) } : item) };
  }));

  /** The highlighted range in this box, if the highlight belongs to it. */
  const selectionIn = (id: number | null) => textSelection && textSelection.slideId === cur.id && textSelection.boxId === id ? textSelection : null;
  const rememberSelection = (id: number | null, start: number, end: number) => setTextSelection((current) => (
    current && current.slideId === cur.id && current.boxId === id && current.start === start && current.end === end ? current : { slideId: cur.id, boxId: id, start, end }
  ));
  /** Highlighted lines get the alignment; with nothing highlighted the whole box does. */
  const applyAlign = (id: number | null, target: TextBox, value: Align) => updateBoxById(id, alignText(target.text, target.align, target.lineAligns, value, selectionIn(id)));
  const shownAlign = (id: number | null, target: TextBox) => activeAlign(target.text, target.align, target.lineAligns, selectionIn(id));

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

  const normalizedCountdown = (countdown: CountdownSettings): CountdownSettings & Required<Pick<CountdownSettings, 'align' | 'x' | 'y' | 'w' | 'h' | 'size'>> => ({
    ...countdown, align: countdown.align ?? 'center',
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
    setTab('Format');
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
    setTab('Format');
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

  const insertSlide = (s: SlideT, at = slides.length) => {
    if (projectLocked) return;
    const insertionIndex = clamp(at, 0, slides.length);
    const usedIds = new Set(slides.map((slide) => slide.id));
    let insertedSlide = s;
    if (usedIds.has(s.id)) {
      let id = nextId++;
      while (usedIds.has(id)) id = nextId++;
      insertedSlide = { ...s, id };
    }
    setSlides((current) => [...current.slice(0, insertionIndex), insertedSlide, ...current.slice(insertionIndex)]);
    setIndex(insertionIndex);
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

  /** Deletes every slide (locked slides stay). An empty presentation gets one blank slide to start again. */
  const removeAll = () => {
    if (projectLocked) return;
    const lockedCount = slides.filter((slide) => slide.locked).length;
    const removable = slides.length - lockedCount;
    if (!removable) { flash('All slides are locked. Unlock them to delete them.'); return; }
    setDeleteConfirmation({
      title: 'Delete all slides?',
      message: lockedCount
        ? `Delete ${removable} slide${removable === 1 ? '' : 's'}? ${lockedCount} locked slide${lockedCount === 1 ? ' stays' : 's stay'}. This cannot be undone.`
        : `Delete all ${removable} slide${removable === 1 ? '' : 's'} in this presentation? You'll start again with one blank slide. This cannot be undone.`,
      onConfirm: () => {
        const kept = slides.filter((slide) => slide.locked);
        setSlides(kept.length ? kept : [makeSlide({ bg: BGS[4], text: 'New slide', size: 96 })]);
        setIndex(0);
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
    setTab('Format');
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
    insertSlide(countdownSlide);
    setSelectedBoxId(null);
    setIsBoxSelected(false);
    setSelectedPictureId(null);
    setSelectedShapeId(null);
    setTab('Format');
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
    setTab('Format');
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
    const MIN = 3;
    // Sides and corners keep the box hugging its text; only the top / bottom handles set a height by hand.
    fitTextHeightRef.current = mode === 'move' || mode === 'n' || mode === 's' ? null : { bottom: mode === 'nw' || mode === 'ne' ? target.y + target.h : null };

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
      // (the 'move' mode returned above, so 'e' / 'w' / 'n' / 's' here are always resize sides)
      if (mode.includes('w')) {
        nx = clamp(x + dx, 0, x + w - MIN);
        nw = w + (x - nx);
      }
      if (mode === 'n' || mode === 's') {
        if (mode === 's') nh = clamp(h + dy, MIN, 100 - y);
        else {
          ny = clamp(y + dy, 0, y + h - MIN);
          nh = h + (y - ny);
        }
        updateBoxById(boxId, { y: ny, h: nh });
        return;
      }
      // Corners scale the text with the box (like Canva); left / right sides only rewrap it.
      // The height is left to follow the text (see fitTextHeightRef).
      const factor = nw / w;
      updateBoxById(boxId, mode.length === 2
        ? { x: nx, w: nw, size: clamp(Math.round(target.size * factor), 8, 400), letterSpacing: target.letterSpacing * factor }
        : { x: nx, w: nw });
    };
    const onUp = () => {
      fitTextHeightRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setAlignmentGuides({ x: null, y: null });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /* ----- templates ----- */

  const [myTemplates, setMyTemplates] = useState<SlideTemplate[]>(loadMyTemplates);
  const templateSyncReadyRef = useRef(false);
  const [templateSyncTick, setTemplateSyncTick] = useState(0);

  // Account sync for "My templates" (same idea as presentations): templates are kept on this
  // computer first, then uploaded; signing in on another device downloads them.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await window.faithstreamWindow?.getAuthToken();
      if (!token || cancelled) return;
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
      // Finish deletes made while offline first, so they don't come back.
      const deleted = loadDeletedTemplateIds();
      const stillDeleting: string[] = [];
      await Promise.all(deleted.map(async (id) => {
        try {
          const response = await fetch(`${PRESENTATION_API_URL}/templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers });
          if (!response.ok && response.status !== 404) stillDeleting.push(id);
        } catch { stillDeleting.push(id); }
      }));
      saveDeletedTemplateIds(stillDeleting);
      try {
        const response = await fetch(`${PRESENTATION_API_URL}/templates`, { headers });
        if (!response.ok) throw new Error('Could not load templates.');
        const result = await response.json() as { templates?: SyncedTemplate[] };
        const remote = (Array.isArray(result.templates) ? result.templates : []).filter((item) => item && typeof item.id === 'string' && Array.isArray(item.slides) && !stillDeleting.includes(item.id));
        if (cancelled) return;
        for (const item of remote) syncedTemplateVersions.set(item.id, item.updatedAt);
        setMyTemplates((current) => {
          const merged = new Map(current.map((item) => [item.id, item]));
          for (const item of remote) {
            const local = merged.get(item.id);
            // The newer copy wins; when equal, this computer's copy keeps its pictures.
            if (!local || item.updatedAt > (local.updatedAt ?? 0)) merged.set(item.id, { id: item.id, label: item.name, slides: item.slides, colors: item.colors, updatedAt: item.updatedAt, mine: true });
          }
          const next = [...merged.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
          saveMyTemplates(next);
          return next;
        });
      } catch { /* offline: templates stay on this computer and sync next time */ }
      templateSyncReadyRef.current = true;
      if (!cancelled) setTemplateSyncTick((value) => value + 1);
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!templateSyncReadyRef.current) return;
    const changed = myTemplates.filter((item) => syncedTemplateVersions.get(item.id) !== (item.updatedAt ?? 0));
    if (!changed.length) return;
    const timeout = window.setTimeout(() => {
      void (async () => {
        const token = await window.faithstreamWindow?.getAuthToken();
        if (!token) return;
        await Promise.all(changed.map(async (item) => {
          try {
            const response = await fetch(`${PRESENTATION_API_URL}/templates/${encodeURIComponent(item.id)}`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(prepareTemplateForAccountSync(item)),
            });
            if (response.ok) syncedTemplateVersions.set(item.id, item.updatedAt ?? 0);
          } catch { /* offline: retried on the next change or visit */ }
        }));
      })();
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [myTemplates, templateSyncTick]);
  const deleteTemplateFromAccount = (id: string) => {
    syncedTemplateVersions.delete(id);
    saveDeletedTemplateIds([...loadDeletedTemplateIds(), id]);
    void (async () => {
      const token = await window.faithstreamWindow?.getAuthToken();
      if (!token) return;
      try {
        const response = await fetch(`${PRESENTATION_API_URL}/templates/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
        if (response.ok || response.status === 404) saveDeletedTemplateIds(loadDeletedTemplateIds().filter((item) => item !== id));
      } catch { /* kept in the list and retried next time */ }
    })();
  };
  /** The template whose slides are shown in the bottom bar (null = the list of templates). */
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const allTemplates = [...myTemplates, ...TEMPLATES];
  const openTemplate = allTemplates.find((item) => item.id === openTemplateId) ?? null;
  /** Links a template's saved pictures / videos to the media library. */
  const withTemplateMedia = (slide: SlideT): SlideT => {
    const byId = new Map(mediaAssets.map((asset) => [asset.id, asset]));
    const asset = slide.bgAssetId ? byId.get(slide.bgAssetId) : undefined;
    return {
      ...slide,
      ...(slide.bgAssetId ? { bgImage: asset?.type === 'image' ? asset.url : undefined, bgVideo: asset?.type === 'video' ? asset.url : undefined, bgAssetId: asset ? slide.bgAssetId : undefined } : {}),
      pictures: slide.pictures?.map((picture) => { const pictureAsset = picture.assetId ? byId.get(picture.assetId) : undefined; return pictureAsset ? { ...picture, src: pictureAsset.url } : picture; }).filter((picture) => !!picture.src),
    };
  };
  /** A brand-new presentation still has only its untouched starter slide; a template replaces it. */
  const onlyStarterSlide = slides.length === 1 && !slides[0].locked && slides[0].title === 'New slide' && slides[0].box?.text === 'New slide'
    && !slides[0].extraBoxes?.length && !slides[0].pictures?.length && !slides[0].shapes?.length && !slides[0].bgImage && !slides[0].bgVideo;
  /** Background colours saved for the open presentation only. */
  const deckColors = projects.find((project) => project.id === activeProjectId)?.colors ?? [];
  const setDeckColors = (update: (colors: string[]) => string[]) => {
    if (!activeProjectId || projectLocked) return;
    setProjects((current) => {
      const next = current.map((project) => {
        if (project.id !== activeProjectId) return project;
        const colors = [...new Set(update(project.colors ?? []))].slice(0, MAX_PRESENTATION_COLORS);
        return { ...project, colors: colors.length ? colors : undefined, updatedAt: Date.now() };
      });
      try { localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next)); } catch { /* kept for this session */ }
      return next;
    });
  };
  const addDeckColor = (bg: string) => {
    if (deckColors.includes(bg)) { flash('This color is already saved in this presentation.'); return; }
    if (deckColors.length >= MAX_PRESENTATION_COLORS) { flash(`You can save up to ${MAX_PRESENTATION_COLORS} colors per presentation. Remove one first.`); return; }
    setDeckColors((colors) => [...colors, bg]);
  };
  const removeDeckColor = (bg: string) => setDeckColors((colors) => colors.filter((color) => color !== bg));

  const addTemplateSlides = (sources: Omit<SlideT, 'id'>[], label: string, colors?: string[]) => {
    if (colors?.length) setDeckColors((current) => [...current, ...colors]);
    if (projectLocked || !sources.length) return;
    const added = sources.map((source) => withTemplateMedia(slideFromTemplate(source)));
    if (onlyStarterSlide) {
      setSlides(added);
      setIndex(0);
    } else {
      const at = clamp(index + 1, 0, slides.length);
      setSlides((current) => [...current.slice(0, at), ...added, ...current.slice(at)]);
      setIndex(at);
    }
    flash(added.length === 1 ? `Added a “${added[0].title}” slide.` : `Added ${added.length} slides from “${label}”.`);
  };
  const saveDeckAsTemplate = () => {
    const clean = serializable(slides).map(({ id: _id, locked: _locked, bgPictureRestore: _restore, ...slide }) => slide);
    const template: SlideTemplate = { id: crypto.randomUUID(), label: (projectName.trim() || 'My template').slice(0, 120), slides: clean, colors: deckColors.length ? deckColors : undefined, updatedAt: Date.now(), mine: true };
    setMyTemplates((current) => { const next = [template, ...current].slice(0, 40); saveMyTemplates(next); return next; });
    setOpenTemplateId(null);
    setDock('Templates');
    flash(`Saved “${template.label}” as a template (${clean.length} slide${clean.length === 1 ? '' : 's'}).`);
  };
  const deleteMyTemplate = (id: string) => {
    const template = myTemplates.find((item) => item.id === id);
    if (!template) return;
    setDeleteConfirmation({
      title: 'Delete template?',
      message: `Delete the template “${template.label}”? Presentations you already made from it are not changed.`,
      onConfirm: () => {
        setMyTemplates((current) => { const next = current.filter((item) => item.id !== id); saveMyTemplates(next); return next; });
        deleteTemplateFromAccount(id);
        setOpenTemplateId((current) => (current === id ? null : current));
        setDeleteConfirmation(null);
        flash(`Deleted the template “${template.label}”.`);
      },
    });
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
    localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
    setSlides([firstSlide]);
    setIndex(0);
    setProjectName(name);
    setActiveProjectId(id);
    originalProjectRef.current = null;
    newDraftProjectIdRef.current = id;
    setLeaveConfirmationOpen(false);
    setDock('Templates');
  };

  type SlideImportGroup = { name: string; category?: string; images: File[]; powerpoint?: File };

  /** Turns image files and PowerPoint files into slides for one new presentation. */
  const buildSlidesFromGroup = async (group: SlideImportGroup, report: (message: string) => void, step: () => void) => {
    const slidesOut: SlideT[] = [];
    const assetsOut: MediaAsset[] = [];
    const asSlide = (asset: MediaAsset, title: string): SlideT => ({
      id: nextId++, title, bg: BGS[4], dim: 0, bgImage: asset.url, bgAssetId: asset.id, box: null, extraBoxes: [], pictures: [], shapes: [],
    });
    for (const file of group.images) {
      report(`Saving ${file.name}`);
      const stored = await saveMediaAsset(file, 'slide');
      const asset: MediaAsset = { ...stored, url: URL.createObjectURL(stored.blob) };
      assetsOut.push(asset);
      slidesOut.push(asSlide(asset, file.name.replace(/\.[^.]+$/, '').trim() || `Slide ${slidesOut.length + 1}`));
      step();
    }
    if (group.powerpoint) {
      report(`Reading ${group.powerpoint.name} in PowerPoint`);
      const rendered = await window.faithstreamWindow?.renderPowerPointSlides(group.powerpoint);
      if (!rendered?.ok || !rendered.slides?.length) throw new Error(rendered?.message || 'PowerPoint rendering is unavailable.');
      for (const renderedSlide of rendered.slides) {
        const binary = atob(renderedSlide.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const png = new File([bytes], `${renderedSlide.name}.png`, { type: 'image/png' });
        const stored = await saveMediaAsset(png, 'slide');
        const asset: MediaAsset = { ...stored, url: URL.createObjectURL(stored.blob) };
        assetsOut.push(asset);
        slidesOut.push(asSlide(asset, renderedSlide.name));
        report(`Saving ${renderedSlide.name}`);
      }
      step();
    }
    return { slides: slidesOut, assets: assetsOut };
  };

  /** Imports one or many presentations, keeps going if one fails, and reports a summary. */
  const importSlideGroups = async (groups: SlideImportGroup[]) => {
    const work = groups.filter((group) => group.images.length || group.powerpoint);
    if (!work.length) {
      flash('No slide images or PowerPoint files were found there.');
      return;
    }
    const totalSteps = work.reduce((sum, group) => sum + group.images.length + (group.powerpoint ? 1 : 0), 0);
    let done = 0;
    setSlideImportProgress({ message: 'Preparing slides…', current: 0, total: totalSteps });
    const created: PresentationProject[] = [];
    const createdCategories: Record<string, string> = {};
    const failures: string[] = [];
    let slideTotal = 0;
    let bytesTotal = 0;
    for (const group of work) {
      const groupEnd = done + group.images.length + (group.powerpoint ? 1 : 0);
      let message = 'Preparing slides…';
      try {
        const { slides: groupSlides, assets } = await buildSlidesFromGroup(group, (next) => {
          message = work.length > 1 ? `${group.name} · ${next}` : next;
          setSlideImportProgress({ message, current: done, total: totalSteps });
        }, () => {
          done += 1;
          setSlideImportProgress({ message, current: done, total: totalSteps });
        });
        done = groupEnd;
        if (!groupSlides.length) continue;
        setMediaAssets((current) => [...assets, ...current]);
        const project: PresentationProject = { id: crypto.randomUUID(), name: group.name.slice(0, 120) || 'Imported slides', slides: serializable(groupSlides), updatedAt: Date.now() + created.length, deviceOnly: true };
        created.push(project);
        if (group.category) createdCategories[project.id] = group.category;
        slideTotal += groupSlides.length;
        bytesTotal += assets.reduce((sum, asset) => sum + asset.blob.size, 0);
      } catch (error) {
        done = groupEnd;
        failures.push(`${group.name}: ${error instanceof Error ? error.message : 'could not be imported'}`);
      }
    }
    setSlideImportProgress(null);
    if (created.length) {
      const next = [...created.reverse(), ...projectsRef.current];
      localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
      setProjects(next);
      if (Object.keys(createdCategories).length) updateCategories((current) => ({ ...current, ...createdCategories }));
    }
    const summary = created.length
      ? `${created.length === 1 ? `“${created[0].name}”` : `${created.length} presentations`} imported · ${slideTotal} ${slideTotal === 1 ? 'slide' : 'slides'} · ${formatMediaSizeInKb(bytesTotal)} stored`
      : 'Nothing was imported.';
    flash(failures.length ? `${summary}. Skipped ${failures.join('; ')}` : summary);
  };

  /** "Import files": the selected images (and one PowerPoint) become a single presentation, as before. */
  const importSlideImages = async (files: FileList | null) => {
    const selected = Array.from(files ?? []);
    const images = selected.filter(isSlideImage).sort((a, b) => naturalCompare(a.name, b.name));
    const powerpoint = selected.find(isPowerPoint);
    if (!images.length && !powerpoint) return;
    const name = (powerpoint?.name ?? images[0]?.name ?? 'Imported slides').replace(/\.[^.]+$/, '') || 'Imported slides';
    await importSlideGroups([{ name, images, powerpoint, category: libraryCategory !== 'All' && libraryCategory !== 'Uncategorized' ? libraryCategory : undefined }]);
  };

  /**
   * "Import folder" or drag-and-drop: every folder of images becomes its own presentation,
   * named after the folder; every PowerPoint becomes its own presentation too. When the
   * imported folder has subfolders ("Songs/Amazing Grace"), the top folder name becomes
   * the category ("Songs").
   */
  const importSlideFolder = async (files: PathedFile[]) => {
    const groups: SlideImportGroup[] = [];
    const filterCategory = libraryCategory !== 'All' && libraryCategory !== 'Uncategorized' ? libraryCategory : undefined;
    for (const folder of groupByFolder(files)) {
      const category = folder.parentName ? cleanCategoryName(folder.parentName) : filterCategory;
      const images = folder.files.filter(isSlideImage);
      if (images.length) groups.push({ name: folder.name, category, images });
      for (const powerpoint of folder.files.filter(isPowerPoint)) {
        groups.push({ name: powerpoint.name.replace(/\.[^.]+$/, ''), category, images: [], powerpoint });
      }
    }
    await importSlideGroups(groups);
  };

  /* ----- library categories ----- */

  const updateCategories = (change: (current: Record<string, string>) => Record<string, string>) => {
    setProjectCategories((current) => {
      const next = change(current);
      savePresentationCategories(next);
      return next;
    });
  };
  const setProjectCategory = (projectId: string, category: string | null) => {
    const clean = category ? cleanCategoryName(category) : '';
    updateCategories((current) => {
      const next = { ...current };
      if (clean) next[projectId] = clean;
      else delete next[projectId];
      return next;
    });
    setProjectMenuFor(null);
    setNewCategoryDraft('');
  };
  const categoryNames = [...new Set([...DEFAULT_CATEGORIES, ...Object.values(projectCategories)])].sort(naturalCompare);

  /* ----- songs → presentations ----- */

  /**
   * Turns a song from the songbooks into an ordinary presentation (a separate copy you can
   * design with backgrounds and fonts, then add to Studio like any presentation).
   */
  const createPresentationFromSong = (song: Song) => {
    // Same layout as the song shows in Studio: its own design (or the default song style),
    // including font, spacing, ALL CAPS (the Aa setting, so it can be switched off per text box)
    // and background.
    const toBox = (layout: SongTextLayout): TextBox => ({
      ...defaultBox(layout.text, layout.size),
      font: layout.font, bold: layout.bold, italic: layout.italic, underline: layout.underline, uppercase: layout.uppercase,
      align: layout.align, valign: layout.valign, lineAligns: layout.lineAligns, color: layout.color, shadow: layout.shadow, lineHeight: layout.lineHeight,
      letterSpacing: layout.letterSpacing, boxBg: layout.boxBg, boxBgOn: layout.boxBgOn,
      x: layout.x, y: layout.y, w: layout.w, h: layout.h,
    });
    const deck: SlideT[] = songSlideLayouts(song).map((layout, index) => {
      const asset = layout.backgroundAssetId ? mediaAssets.find((item) => item.id === layout.backgroundAssetId) : undefined;
      return {
        id: nextId++,
        title: layout.label ?? `Part ${index + 1}`,
        bg: layout.background,
        dim: layout.dim,
        ...(asset ? { bgAssetId: asset.id, bgImage: asset.type === 'image' ? asset.url : undefined, bgVideo: asset.type === 'video' ? asset.url : undefined, bgVideoMuted: asset.type === 'video' ? true : undefined } : {}),
        box: toBox(layout.box),
        extraBoxes: layout.subtitleBox ? [{ id: nextId++, box: toBox(layout.subtitleBox) }] : [],
      };
    });
    const project: PresentationProject = { id: crypto.randomUUID(), name: song.title.slice(0, 120), slides: serializable(deck), updatedAt: Date.now() };
    const next = [project, ...projects];
    setProjects(next);
    localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
    updateCategories((current) => ({ ...current, [project.id]: 'Songs' }));
    navigate('/presentations', { replace: true });
    openProject({ ...project, slides: deck });
    flash(`“${song.title}” is now a presentation with ${deck.length} slides. Design it here, then add it to Studio like any presentation.`);
  };

  /* ----- background collections ----- */

  const collectionOf = (asset: MediaAsset) => asset.collection || 'Uploads';

  /** Adds backgrounds. Each imported folder becomes a collection named after it. */
  const importBackgrounds = async (files: PathedFile[], asFolder: boolean) => {
    const media = files.filter(({ file }) => isBackgroundMedia(file));
    if (!media.length) {
      flash('No images or videos were found there.');
      return;
    }
    const namedTarget = backgroundCollection !== 'All' && backgroundCollection !== 'Uploads' ? backgroundCollection : undefined;
    const plan = asFolder
      ? groupByFolder(media).flatMap((folder) => folder.files.map((file) => ({ file, collection: cleanCategoryName(folder.name) || namedTarget })))
      : media.map(({ file }) => ({ file, collection: namedTarget }));
    const added: MediaAsset[] = [];
    let failed = 0;
    for (const [position, item] of plan.entries()) {
      setBackgroundImportProgress({ message: `Adding ${item.file.name}`, current: position, total: plan.length });
      try {
        const stored = await saveMediaAsset(item.file, 'background', item.collection);
        added.push({ ...stored, url: URL.createObjectURL(stored.blob) });
      } catch {
        failed += 1;
      }
    }
    setBackgroundImportProgress(null);
    setMediaAssets((current) => [...added, ...current]);
    const collections = [...new Set(added.map((asset) => asset.collection).filter((name): name is string => !!name))];
    if (collections.length === 1) setBackgroundCollection(collections[0]);
    flash(`${added.length} ${added.length === 1 ? 'background' : 'backgrounds'} added${collections.length ? ` to ${collections.length === 1 ? `“${collections[0]}”` : `${collections.length} collections`}` : ''}${failed ? ` · ${failed} could not be read` : ''}`);
  };

  const renameBackgroundCollection = async (from: string, to: string) => {
    const name = cleanCategoryName(to);
    setRenamingCollection(null);
    if (!name || name === from || from === 'Uploads') return;
    const changed = mediaAssets.filter((asset) => asset.category !== 'slide' && asset.collection === from).map((asset) => ({ ...asset, collection: name }));
    try {
      await updateMediaAssetsInDb(changed.map(({ url: _url, ...stored }) => stored));
      setMediaAssets((current) => current.map((asset) => changed.find((item) => item.id === asset.id) ?? asset));
      setBackgroundCollection(name);
      flash(`Collection renamed to “${name}”`);
    } catch {
      flash('Could not rename this collection');
    }
  };

  const deleteBackgroundCollection = (name: string) => {
    const doomed = backgroundAssets.filter((asset) => collectionOf(asset) === name);
    setDeleteConfirmation({
      title: `Delete “${name}”?`,
      message: `Delete the ${doomed.length} ${doomed.length === 1 ? 'background' : 'backgrounds'} in this collection? Slides using them will switch back to their color background.`,
      onConfirm: () => {
        void (async () => {
          const ids = new Set<string>();
          for (const asset of doomed) {
            try { await deleteMediaAssetFromDb(asset.id); ids.add(asset.id); URL.revokeObjectURL(asset.url); } catch { /* keep the ones that could not be removed */ }
          }
          const clearSlide = (slide: SlideT): SlideT => ({
            ...(slide.bgAssetId && ids.has(slide.bgAssetId) ? { ...slide, bgAssetId: undefined, bgImage: undefined, bgVideo: undefined } : slide),
            bgPictureRestore: slide.bgPictureRestore?.assetId && ids.has(slide.bgPictureRestore.assetId) ? undefined : slide.bgPictureRestore,
            pictures: slide.pictures?.filter((picture) => !picture.assetId || !ids.has(picture.assetId)),
          });
          setMediaAssets((current) => current.filter((item) => !ids.has(item.id)));
          setSlides((current) => current.map(clearSlide));
          setProjects((current) => {
            const next = current.map((project) => ({ ...project, slides: project.slides.map(clearSlide) }));
            try { localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next)); } catch { /* Keep the editor usable if storage is full. */ }
            return next;
          });
          setBackgroundCollection('All');
          setDeleteConfirmation(null);
          flash(`Deleted “${name}” (${ids.size} ${ids.size === 1 ? 'background' : 'backgrounds'})`);
        })();
      },
    });
  };

  /** Copies this slide's background (color, image or video, and darkening) to every unlocked slide. */
  const applyBackgroundToAllSlides = () => {
    if (projectLocked) return;
    const fields: Partial<SlideT> = { bg: cur.bg, dim: cur.dim, bgImage: cur.bgImage, bgVideo: cur.bgVideo, bgVideoMuted: cur.bgVideoMuted, bgAssetId: cur.bgAssetId, bgPosition: cur.bgPosition, bgPictureRestore: undefined };
    const changed = slides.filter((slide, slideIndex) => slideIndex !== index && !slide.locked).length;
    setSlides((list) => list.map((slide, slideIndex) => (slideIndex === index || slide.locked ? slide : { ...slide, ...fields })));
    flash(changed ? 'Background applied to all slides' : 'Every other slide is locked');
  };

  const toggleProjectLock = (id: string) => {
    const next = projects.map((project) => project.id === id
      ? { ...project, locked: !project.locked, updatedAt: Date.now() }
      : project);
    setProjects(next);
    localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
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
        updateCategories((current) => { const rest = { ...current }; delete rest[id]; return rest; });
        setProjects(next);
        localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
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

  const flashTimerRef = useRef<number | undefined>(undefined);
  const flash = (msg: string) => {
    setStatus(msg);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setStatus(''), Math.min(9000, Math.max(2500, msg.length * 45)));
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
        try { localStorage.setItem(getAccountStorageKey(STORAGE_KEY), JSON.stringify(next)); } catch { /* Keep the editor usable if storage is full. */ }
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
        try { localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next)); } catch { /* Keep the editor usable if storage is full. */ }
        return next;
      });
      setDeleteConfirmation(null);
      flash('Upload deleted from the media library');
    } catch {
      setDeleteConfirmation(null);
      flash('Could not delete this background');
    }
  };

  const save = async () => {
    if (saving) return false;
    const savingStartedAt = Date.now();
    setSaving(true);
    setStatus('Saving your presentation…');
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      const id = activeProjectId ?? crypto.randomUUID();
      const project: PresentationProject = {
        id,
        name: projectName.trim() || 'Untitled presentation',
        slides: serializable(),
        updatedAt: Date.now(),
        colors: projects.find((item) => item.id === id)?.colors,
      };
      const next = [project, ...projects.filter((item) => item.id !== id)];
      localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
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
    } finally {
      const remainingLoadingTime = 3000 - (Date.now() - savingStartedAt);
      if (remainingLoadingTime > 0) await new Promise<void>((resolve) => window.setTimeout(resolve, remainingLoadingTime));
      setSaving(false);
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
        localStorage.setItem(getAccountStorageKey(PROJECTS_STORAGE_KEY), JSON.stringify(next));
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

  const keepChangesAndContinue = async () => {
    const target = pendingNavigation;
    if (!await save()) return;
    setPendingNavigation(null);
    if (target) navigate(target);
  };

  /* ----- render ----- */

  if (!activeProjectId) {
    const requestedView = new URLSearchParams(location.search).get('view');
    const libraryView = requestedView === 'songbooks' || requestedView === 'backgrounds' ? requestedView : 'presentations';
    const libraryTabs = (
      <div role="tablist" aria-label="Library" className="mt-3 inline-flex gap-1 rounded-xl border border-white/10 bg-panel p-1">
        {([['presentations', 'Presentations', FolderOpen], ['backgrounds', 'Backgrounds', ImageIcon], ['songbooks', 'Songbooks', BookMarked]] as const).map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={libraryView === key} onClick={() => navigate(key === 'songbooks' || key === 'backgrounds' ? `/presentations?view=${key}` : '/presentations', { replace: true })} className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${libraryView === key ? 'bg-brand text-navy' : 'text-warm-white/65 hover:bg-white/5 hover:text-white'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>
    );
    if (libraryView === 'songbooks') {
      return (
        <div className="flex h-full min-h-0 flex-col p-6 md:p-8">
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
            <div className="mb-5 flex shrink-0 items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><BookMarked size={22} /></span>
              <div>
                <h1 className="text-2xl font-bold text-warm-white">Songbooks</h1>
                <p className="mt-1 text-sm text-warm-white/55">Your song library, connected to Studio (Music → Songbooks) and to your presentations.</p>
              </div>
            </div>
            <div className="mb-4 shrink-0">{libraryTabs}</div>
            <div className="min-h-0 flex-1"><Songbooks embedded onMakePresentation={createPresentationFromSong} /></div>
          </div>
        </div>
      );
    }
    if (libraryView === 'backgrounds') {
      const names = [...new Set(backgroundAssets.map(collectionOf))].sort((a, b) => (a === 'Uploads' ? 1 : b === 'Uploads' ? -1 : naturalCompare(a, b)));
      const chips = ['All', ...names];
      const active = chips.includes(backgroundCollection) ? backgroundCollection : 'All';
      const visibleBackgrounds = backgroundAssets.filter((asset) => (active === 'All' || collectionOf(asset) === active));
      return (
        <div className="flex h-full min-h-0 flex-col overflow-y-auto p-6 md:p-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><ImageIcon size={22} /></span>
                <div>
                  <h1 className="text-2xl font-bold text-warm-white">Backgrounds</h1>
                  <p className="mt-1 text-sm text-warm-white/55">Import and organize local images and videos for presentations and songbooks.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={backgroundImportProgress !== null} title="Add every picture and video in a folder (its subfolders become collections)" onClick={() => backgroundFolderInput.current?.click()} className="flex items-center gap-2 rounded-xl border border-white/15 bg-panel px-4 py-2.5 text-sm font-semibold text-warm-white hover:border-brand/50 hover:bg-white/5 disabled:opacity-50"><FolderPlus size={16} /> Add a folder</button>
                <button type="button" disabled={backgroundImportProgress !== null} title="Pick one picture or video, or select several (Ctrl+click)" onClick={() => backgroundFilesInput.current?.click()} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-navy hover:brightness-110 disabled:opacity-50"><Upload size={16} /> Add pictures or videos</button>
              </div>
            </div>
            {libraryTabs}
            <input ref={(element) => { backgroundFolderInput.current = element; markFolderInput(element); }} type="file" multiple hidden onChange={(event) => { const picked = pathedFilesFromInput(event.target.files); event.target.value = ''; void importBackgrounds(picked, true); }} />
            <input ref={backgroundFilesInput} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => { const picked = pathedFilesFromInput(event.target.files); event.target.value = ''; void importBackgrounds(picked, false); }} />
            {backgroundImportProgress && <div role="status" aria-live="polite" className="my-4 rounded-xl border border-brand/25 bg-brand/5 p-3 text-sm text-warm-white/75"><div className="flex items-center gap-2"><Loader2 size={16} className="animate-spin text-brand" /><span className="min-w-0 flex-1 truncate">{backgroundImportProgress.message}</span><span className="tabular-nums text-warm-white/50">{backgroundImportProgress.current}/{backgroundImportProgress.total}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-brand transition-[width]" style={{ width: `${backgroundImportProgress.total ? backgroundImportProgress.current / backgroundImportProgress.total * 100 : 0}%` }} /></div></div>}
            <div className="my-5 flex flex-wrap items-center justify-between gap-3">
              <div role="tablist" aria-label="Background collections" className="flex max-w-full flex-wrap gap-1.5">
                {chips.map((name) => <button key={name} role="tab" aria-selected={active === name} onClick={() => { setBackgroundCollection(name); setRenamingCollection(null); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${active === name ? 'border-brand bg-brand/15 text-white' : 'border-white/10 text-warm-white/60 hover:text-white'}`}>{name}<span className="ml-1.5 tabular-nums text-brand/80">{name === 'All' ? backgroundAssets.length : backgroundAssets.filter((asset) => collectionOf(asset) === name).length}</span></button>)}
              </div>
              <span className="text-xs text-warm-white/45">{visibleBackgrounds.length} saved locally</span>
            </div>
            {active !== 'All' && active !== 'Uploads' && <div className="mb-4 flex items-center justify-end gap-1 text-xs">
              {renamingCollection === active ? <form onSubmit={(event) => { event.preventDefault(); void renameBackgroundCollection(active, collectionNameDraft); }} className="flex gap-1.5"><input autoFocus value={collectionNameDraft} onChange={(event) => setCollectionNameDraft(event.target.value)} aria-label="Collection name" maxLength={40} className="rounded-md border border-white/10 bg-panel px-2 py-1 text-white outline-none focus:border-brand" /><button type="submit" className="rounded-md bg-brand/20 p-1.5 text-brand"><Check size={14} /></button><button type="button" onClick={() => setRenamingCollection(null)} className="rounded-md p-1.5 text-warm-white/50"><X size={14} /></button></form> : <><button type="button" onClick={() => { setRenamingCollection(active); setCollectionNameDraft(active); }} className="flex items-center gap-1 rounded-md px-2 py-1 text-warm-white/60 hover:bg-white/10"><Pencil size={12} /> Rename collection</button><button type="button" onClick={() => deleteBackgroundCollection(active)} className="flex items-center gap-1 rounded-md px-2 py-1 text-red-300/80 hover:bg-red-500/10"><Trash2 size={12} /> Delete collection</button></>}
            </div>}
            {visibleBackgrounds.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleBackgrounds.map((asset) => <article key={asset.id} className="group relative overflow-hidden rounded-xl border border-white/10 bg-panel transition hover:border-brand/50">
                <button type="button" onClick={() => setVideoPreviewAsset(asset.type === 'video' ? asset : null)} title={asset.type === 'video' ? `Preview ${asset.name}` : asset.name} className="block w-full text-left">
                  <span className="relative block aspect-video overflow-hidden bg-navy">{asset.type === 'image' ? <img src={asset.url} alt={asset.name} loading="lazy" className="h-full w-full object-cover" /> : <video src={`${asset.url}#t=0.5`} muted preload="metadata" className="h-full w-full object-cover" />}<span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">{asset.type === 'video' ? 'VIDEO' : 'IMAGE'}</span></span>
                  <span className="block truncate px-2 pt-2 text-xs font-semibold text-warm-white">{asset.name}</span><span className="block truncate px-2 pb-2 text-[10px] text-warm-white/45">{collectionOf(asset)} · {formatMediaSizeInKb(asset.blob.size)}</span>
                </button>
                {asset.type === 'video' && <button type="button" aria-label={`Play ${asset.name}`} onClick={() => setVideoPreviewAsset(asset)} className="absolute left-2 top-2 rounded-md bg-black/75 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"><Play size={13} /></button>}
                <button type="button" aria-label={`Delete ${asset.name}`} title="Remove from background library" onClick={() => setDeleteConfirmation({ title: 'Delete uploaded background?', message: `Delete “${asset.name}” from saved uploads? Slides using it will switch back to their color background.`, onConfirm: () => { void deleteMediaAsset(asset); } })} className="absolute right-2 top-2 rounded-md border border-white/15 bg-black/75 p-1.5 text-white/80 opacity-0 transition hover:bg-red-600 group-hover:opacity-100 focus:opacity-100"><Trash2 size={13} /></button>
              </article>)}
            </div> : <div className="mt-2 rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center"><FolderPlus size={30} className="mx-auto text-warm-white/35" /><p className="mt-3 font-semibold text-warm-white">No backgrounds in this collection yet</p><p className="mt-1 text-sm text-warm-white/50">Import a folder of up to your whole background library, or add individual image and video files.</p><p className="mt-3 text-xs text-warm-white/40">Choose a background on a slide from its Background panel, or in a songbook from Design → Background.</p></div>}
            <p className="mt-5 text-xs leading-relaxed text-warm-white/40">Backgrounds are stored on this computer and shared by the presentation editor and songbook designer. Imported folders are organized as collections.</p>
          </div>
          {videoPreviewAsset && <BodyPortal><div className="fixed inset-0 z-130 flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideoPreviewAsset(null); }}>
            <section role="dialog" aria-modal="true" aria-label={`Preview ${videoPreviewAsset.name}`} className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#101d2a] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate text-sm font-semibold text-warm-white">{videoPreviewAsset.name}</h2><button type="button" onClick={() => setVideoPreviewAsset(null)} aria-label="Close video preview" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={17} /></button></div>
              <video src={videoPreviewAsset.url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
              <p className="mt-3 text-xs text-warm-white/50">To use this background, open a presentation and choose it from the Background panel, or select it in a songbook’s Design → Background.</p>
            </section>
          </div></BodyPortal>}
          {/* This view is its own screen, so it needs its own status message and confirmation
              window; without them, deleting a background only asked after switching tabs. */}
          {status && <div role="status" className="pointer-events-none fixed bottom-16 left-1/2 z-50 max-w-[min(640px,90vw)] -translate-x-1/2 rounded-xl border border-white/10 bg-navy/95 px-4 py-2.5 text-center text-sm text-warm-white shadow-2xl backdrop-blur">{status}</div>}
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
    const query = librarySearch.trim().toLocaleLowerCase();
    const inCategory = (project: PresentationProject, category: string) => category === 'All'
      || (category === 'Uncategorized' ? !projectCategories[project.id] : projectCategories[project.id] === category);
    const visibleProjects = projects.filter((project) => inCategory(project, libraryCategory)
      && (!query || project.name.toLocaleLowerCase().includes(query) || (projectCategories[project.id] ?? '').toLocaleLowerCase().includes(query)));
    const usedCategories = [...new Set(projects.map((project) => projectCategories[project.id]).filter((name): name is string => !!name))].sort(naturalCompare);
    const filterChips = ['All', ...usedCategories, ...(projects.some((project) => !projectCategories[project.id]) && usedCategories.length ? ['Uncategorized'] : [])];
    if (libraryCategory !== 'All' && !filterChips.includes(libraryCategory)) filterChips.push(libraryCategory);
    const countIn = (category: string) => projects.filter((project) => inCategory(project, category)).length;
    return (
      <div
        className="relative h-full min-h-0 overflow-y-auto p-6 md:p-8"
        onDragOver={(event) => { if (!dragHasFiles(event) || slideImportProgress) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setLibraryDragOver(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setLibraryDragOver(false); }}
        onDrop={(event) => {
          if (!dragHasFiles(event)) return;
          event.preventDefault();
          setLibraryDragOver(false);
          if (slideImportProgress) return;
          const transfer = event.dataTransfer;
          void readDroppedFiles(transfer).then((files) => importSlideFolder(files)).catch(() => flash('Could not read the dropped files.'));
        }}
      >
        {libraryDragOver && <div className="pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-studio/85 text-center backdrop-blur-sm">
          <FolderPlus size={40} className="text-brand" />
          <p className="mt-3 text-lg font-semibold text-warm-white">Drop to import slides</p>
          <p className="mt-1 max-w-sm text-sm text-warm-white/60">Each folder of images becomes a presentation. PowerPoint files are converted too.</p>
        </div>}
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
              {libraryTabs}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
              <button disabled={slideImportProgress !== null} aria-haspopup="menu" aria-expanded={importMenuOpen} onClick={() => setImportMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-xl border border-white/15 bg-panel px-4 py-3 text-sm font-semibold text-warm-white transition hover:bg-white/5 disabled:cursor-wait disabled:opacity-70">
                {slideImportProgress ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />} {slideImportProgress ? 'Importing…' : 'Import'} {!slideImportProgress && <ChevronDown size={15} className={`transition ${importMenuOpen ? 'rotate-180' : ''}`} />}
              </button>
              {importMenuOpen && <>
                <div className="fixed inset-0 z-20" onClick={() => setImportMenuOpen(false)} />
                <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-white/10 bg-navy p-1.5 text-sm text-warm-white shadow-xl">
                  <button role="menuitem" onClick={() => { setImportMenuOpen(false); slideImportInput.current?.click(); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/10">
                    <Upload size={17} className="mt-0.5 shrink-0 text-brand" />
                    <span><span className="block font-semibold">Slide files</span><span className="block text-xs text-warm-white/50">Pick images or a PowerPoint — they become one presentation</span></span>
                  </button>
                  <button role="menuitem" onClick={() => { setImportMenuOpen(false); slideFolderInput.current?.click(); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/10">
                    <FolderPlus size={17} className="mt-0.5 shrink-0 text-brand" />
                    <span><span className="block font-semibold">Folder of slides</span><span className="block text-xs text-warm-white/50">Each folder inside becomes its own presentation</span></span>
                  </button>
                  <p className="px-3 pb-1 pt-2 text-[11px] text-warm-white/40">Tip: you can also drag folders onto this page.</p>
                </div>
              </>}
              </div>
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
          <input
            ref={(element) => { slideFolderInput.current = element; markFolderInput(element); }}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const picked = pathedFilesFromInput(event.target.files);
              event.target.value = '';
              void importSlideFolder(picked);
            }}
          />

          {projects.length > 0 && <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative block md:w-72">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-white/40" />
              <input value={librarySearch} onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search presentations" aria-label="Search presentations" className="w-full rounded-xl border border-white/10 bg-panel py-2.5 pl-9 pr-3 text-sm text-warm-white outline-none placeholder:text-warm-white/35 focus:border-brand" />
            </label>
            <div role="tablist" aria-label="Categories" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {filterChips.map((category) => (
                <button key={category} role="tab" aria-selected={libraryCategory === category} onClick={() => setLibraryCategory(category)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${libraryCategory === category ? 'border-brand bg-brand/15 text-white' : 'border-white/10 text-warm-white/60 hover:border-white/25 hover:text-warm-white'}`}>
                  {category}<span className={`tabular-nums ${libraryCategory === category ? 'text-brand' : 'text-warm-white/35'}`}>{countIn(category)}</span>
                </button>
              ))}
            </div>
          </div>}

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

          {projects.length > 0 && !visibleProjects.length && <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-panel/50 px-6 py-16 text-center">
            <Search size={26} className="text-warm-white/30" />
            <p className="mt-3 text-sm font-semibold text-warm-white">No presentations match</p>
            <button onClick={() => { setLibrarySearch(''); setLibraryCategory('All'); }} className="mt-3 text-xs font-semibold text-brand hover:underline">Show all presentations</button>
          </div>}

          {projects.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProjects.map((project) => {
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
                          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-warm-white/50">{projectCategories[project.id] && <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-warm-white/75"><Tag size={11} />{projectCategories[project.id]}</span>}<span>{project.slides.length} {project.slides.length === 1 ? 'slide' : 'slides'} · Updated {new Date(project.updatedAt).toLocaleDateString()}</span></p>
                          {(project.hasLocalMedia || project.deviceOnly) && <p className="mt-1 text-[11px] text-amber-200/80">Imported media stays on its original device</p>}
                        </div>
                        <ChevronRight size={18} className="shrink-0 text-warm-white/40 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                      </div>
                    </button>
                    <button data-project-menu aria-label={`Options for ${project.name}`} onClick={() => setProjectMenuFor(projectMenuFor === project.id ? null : project.id)} className="absolute right-3 top-3 z-20 rounded-lg bg-black/65 p-2 text-white opacity-0 transition hover:bg-black/85 group-hover:opacity-100 focus:opacity-100">
                      <MoreHorizontal size={16} />
                    </button>
                    {projectMenuFor === project.id && <>
                      <div data-project-menu className="absolute right-3 top-12 z-30 w-60 rounded-xl border border-white/10 bg-navy p-1.5 text-sm text-warm-white shadow-xl">
                        <button onClick={() => toggleProjectLock(project.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10">{project.locked ? <Unlock size={15} /> : <Lock size={15} />}{project.locked ? 'Unlock presentation' : 'Lock presentation'}</button>
                        <button onClick={() => deleteProject(project.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"><Trash2 size={15} /> Delete presentation</button>
                        <div className="my-1.5 border-t border-white/10" />
                        <div className="max-h-36 overflow-y-auto">
                        <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-warm-white/40">Category</p>
                        {categoryNames.map((category) => (
                          <button key={category} onClick={() => setProjectCategory(project.id, category)} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-white/10">
                            <span className="flex w-4 justify-center">{projectCategories[project.id] === category && <Check size={14} className="text-brand" />}</span>{category}
                          </button>
                        ))}
                        <form onSubmit={(event) => { event.preventDefault(); if (cleanCategoryName(newCategoryDraft)) setProjectCategory(project.id, newCategoryDraft); }} className="flex items-center gap-1.5 px-2 py-1.5">
                          <input value={newCategoryDraft} onChange={(event) => setNewCategoryDraft(event.target.value)} placeholder="New category…" aria-label="New category name" maxLength={40} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-white outline-none focus:border-brand" />
                          <button type="submit" disabled={!cleanCategoryName(newCategoryDraft)} aria-label="Add category" className="rounded-md bg-brand/20 p-1 text-brand disabled:opacity-30"><Plus size={14} /></button>
                        </form>
                        {projectCategories[project.id] && <button onClick={() => setProjectCategory(project.id, null)} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-warm-white/60 hover:bg-white/10"><span className="w-4" />Remove category</button>}
                        </div>
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
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-warm-white/55">Create a presentation, or drag a folder of slides here to import it.</p>
              <button onClick={createProject} className="mt-5 flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-navy transition hover:brightness-110"><Plus size={17} /> Create Presentation</button>
            </div>
          )}
        </div>
        {status && <div role="status" className="pointer-events-none fixed bottom-16 left-1/2 z-50 max-w-[min(640px,90vw)] -translate-x-1/2 rounded-xl border border-white/10 bg-navy/95 px-4 py-2.5 text-center text-sm text-warm-white shadow-2xl backdrop-blur">{status}</div>}
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
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Delete all slides"
                title="Delete all slides"
                disabled={projectLocked || onlyStarterSlide}
                onClick={removeAll}
                className="flex items-center rounded-lg border border-white/10 p-1.5 text-warm-white/60 transition hover:border-red-400/50 hover:bg-red-500/10 hover:text-red-200 disabled:pointer-events-none disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={addBlank}
                className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-navy hover:brightness-110"
              >
                <Plus size={14} /> Add Slide
              </button>
            </div>
          }
        >
          <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {slides.map((s, i) => (
              <li
                key={`${s.id}:${i}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); reorderSlides(from, i); setDraggingSlide(null); }}
                onDragEnd={() => setDraggingSlide(null)}
                className={`relative ${draggingSlide === i ? 'opacity-40' : ''}`}
              >
                <button
                  draggable={!projectLocked}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDraggingSlide(i); }}
                  onClick={() => setIndex(i)}
                  aria-label={`Open slide ${i + 1}`}
                  aria-pressed={i === index}
                  className={`relative block aspect-video w-full cursor-grab overflow-hidden rounded-lg border-2 transition active:cursor-grabbing ${
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
                  onClick={() => setMenuFor(menuFor === `${s.id}:${i}` ? null : `${s.id}:${i}`)}
                  className="absolute right-1.5 top-1.5 z-10 rounded bg-black/65 p-1 text-white hover:bg-black/85"
                >
                  <MoreHorizontal size={14} />
                </button>

                {menuFor === `${s.id}:${i}` && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                    <div className="absolute right-1.5 top-9 z-20 w-36 rounded-lg border border-white/10 bg-navy p-1 text-xs text-warm-white shadow-xl">
                      {[
                        { label: 'Add slide above', run: () => insertSlide(makeSlide({ bg: BGS[4], text: 'New slide', size: 96 }), i), off: projectLocked },
                        { label: 'Add slide below', run: () => insertSlide(makeSlide({ bg: BGS[4], text: 'New slide', size: 96 }), i + 1), off: projectLocked },
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
                <div onPointerDown={startBackgroundDrag} aria-label="Drag to reposition the background image" className="absolute inset-0 z-60 cursor-move border-2 border-dashed border-brand/80" />
                <div className="absolute left-1/2 top-3 z-70 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-white/15 bg-navy/95 px-3 py-2 text-xs text-white shadow-xl">
                  <span>Drag to reposition background</span>
                  <button type="button" onClick={() => setBackgroundEditing(false)} className="rounded bg-brand px-2.5 py-1 font-semibold text-navy">Done</button>
                </div>
              </>}

              {(cur.pictures ?? []).map((picture, pictureIndex) => <div data-slide-object key={picture.id} onPointerDown={picture.mediaType === 'video' ? undefined : startPictureDrag(picture)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (cur.locked) return; selectPicture(picture.id); setPictureMenu({ kind: 'picture', id: picture.id, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 220) }); }} onClick={(e) => { if (picture.mediaType === 'video') return; e.stopPropagation(); selectPicture(picture.id); }} className={`absolute z-10 ${picture.mediaType === 'video' ? 'pointer-events-none' : 'cursor-move'} ${selectedPictureId === picture.id ? 'border-2 border-cyan-300' : 'border border-transparent'}`} style={{ left: `${picture.x}%`, top: `${picture.y}%`, width: `${picture.w}%`, height: `${picture.h}%`, zIndex: typeof picture.layerOrder === 'number' ? picture.layerOrder : picture.layerOrder === 'front' ? 5000 : picture.layerOrder === 'back' ? 0 : 1000 + pictureIndex, touchAction: 'none' }}>
                {picture.mediaType === 'video' && <div onPointerDown={startPictureDrag(picture)} onClick={(event) => { event.stopPropagation(); setSelectedPictureId(picture.id); setSelectedCountdown(false); }} aria-label="Drag to move video" className="pointer-events-auto absolute inset-x-0 -top-3 h-3 cursor-move" />}
                {selectedPictureId === picture.id && (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map((handle) => <span key={handle} onPointerDown={startPictureResize(picture, handle)} className={`pointer-events-auto absolute z-20 h-3.5 w-3.5 rounded-sm border-2 border-cyan-700 bg-white shadow ${HANDLES[handle]}`} />)}
                {selectedPictureId === picture.id && <button onPointerDown={(e) => e.stopPropagation()} onClick={() => { updateSlide({ pictures: (cur.pictures ?? []).filter((item) => item.id !== picture.id) }); setSelectedPictureId(null); }} aria-label={picture.mediaType === 'video' ? 'Delete video' : 'Delete image'} className="pointer-events-auto absolute -right-2 -top-2 z-30 rounded-full bg-red-600 p-1 text-white shadow"><Trash2 size={12} /></button>}
              </div>)}
              {pictureMenu && createPortal(<>
                <div className="fixed inset-0 z-9998" onPointerDown={() => setPictureMenu(null)} />
                <div role="menu" aria-label={`${pictureMenu.kind === 'picture' ? 'Image' : pictureMenu.kind === 'text' ? 'Text' : 'Background'} options`} className="fixed z-9999 w-48 rounded-lg border border-white/10 bg-navy p-1 text-xs text-warm-white shadow-xl" style={{ left: pictureMenu.x, top: pictureMenu.y }}>
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
                {selectedShapeId === shape.id && (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map((handle) => <span key={handle} onPointerDown={startShapeResize(shape, handle)} className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-slate-400 bg-white ${HANDLES[handle]}`} />)}
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
                {selectedCountdown && (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map((handle) => <span key={handle} onPointerDown={startCountdownInteraction(handle)} className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-slate-400 bg-white ${HANDLES[handle]}`} />)}
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
                const align = (value: Align) => applyAlign(id, textBox, value);
                const currentAlign = shownAlign(id, textBox);
                const valign = (value: VAlign) => updateBoxById(id, { valign: value });
                const boxValign = textBox.valign ?? 'middle';
                return <div data-slide-object key={id ?? 'main'} onPointerDown={startDrag('move', id, textBox)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (cur.locked) return; setSelectedBoxId(id); setIsBoxSelected(true); setSelectedPictureId(null); setSelectedShapeId(null); setSelectedCountdown(false); setPictureMenu({ kind: 'text', id, x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 220) }); }} className={`absolute z-10 cursor-move ${selected ? 'border border-white' : 'border border-transparent'}`} onClick={(e) => { e.stopPropagation(); setSelectedBoxId(id); setIsBoxSelected(true); setSelectedPictureId(null); setSelectedShapeId(null); setSelectedCountdown(false); }} style={{ left: `${textBox.x}%`, top: `${textBox.y}%`, width: `${textBox.w}%`, height: `${textBox.h}%`, zIndex: typeof textBox.layerOrder === 'number' ? textBox.layerOrder : textBox.layerOrder === 'front' ? 5000 : textBox.layerOrder === 'back' ? 0 : id === null ? 3000 : 3001 + (cur.extraBoxes ?? []).findIndex((item) => item.id === id), touchAction: 'none' }}>
                  {selected && <div className="absolute inset-0 z-0 overflow-hidden" style={{ background: textBox.boxBgOn ? textBox.boxBg : undefined }}>
                    <div ref={canvasTextMeasureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 w-full whitespace-pre-wrap" style={{ overflowWrap: 'anywhere', fontFamily: FONTS[textBox.font] ?? `"${textBox.font.replaceAll('"', '')}", sans-serif`, fontSize: `${(textBox.size / 1280) * 100}cqw`, fontWeight: textBox.bold ? 800 : 500, fontStyle: textBox.italic ? 'italic' : 'normal', textTransform: textBox.uppercase ? 'uppercase' : undefined, lineHeight: textBox.lineHeight, letterSpacing: `${(textBox.letterSpacing / 1280) * 100}cqw` }}>{textBox.text || ' '}</div>
                    <SlideTextEditor
                      editorRef={canvasTextRef}
                      label="Edit text on slide"
                      text={textBox.text}
                      align={textBox.align}
                      lineAligns={textBox.lineAligns}
                      onChange={(text) => updateBoxById(id, { text })}
                      onSelectionChange={(start, end) => rememberSelection(id, start, end)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      className="absolute inset-0 h-full w-full cursor-text overflow-hidden border-0 bg-transparent p-0 outline-none"
                      style={{
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        fontFamily: FONTS[textBox.font] ?? `"${textBox.font.replaceAll('"', '')}", sans-serif`,
                        fontSize: `${(textBox.size * canvasTextScale / 1280) * 100}cqw`,
                        fontWeight: textBox.bold ? 800 : 500,
                        fontStyle: textBox.italic ? 'italic' : 'normal',
                        textDecoration: textBox.underline ? 'underline' : 'none',
                        textTransform: textBox.uppercase ? 'uppercase' : undefined,
                        lineHeight: textBox.lineHeight,
                        letterSpacing: `${(textBox.letterSpacing / 1280) * 100}cqw`,
                        color: textBox.color,
                        textShadow: textBox.shadow ? '0 0 1.2cqw rgba(0,0,0,0.65)' : undefined,
                        paddingTop: 0,
                        background: textBox.boxBgOn ? textBox.boxBg : undefined,
                      }}
                    />
                  </div>}
                  {selected && (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map((h) => <span key={h} onPointerDown={startDrag(h, id, textBox)} className={`absolute z-20 h-2.5 w-2.5 rounded-sm border border-slate-400 bg-white ${HANDLES[h]}`} />)}
                  {selected && (Object.keys(TEXT_SIDE_HANDLES) as (keyof typeof TEXT_SIDE_HANDLES)[]).map((h) => <span key={h} onPointerDown={startDrag(h, id, textBox)} className={`absolute z-20 rounded-full border border-slate-400 bg-white ${TEXT_SIDE_HANDLES[h]}`} />)}
                  {selected && <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className={`absolute left-1/2 z-20 flex -translate-x-1/2 cursor-default items-center gap-0.5 rounded-lg border border-white/10 bg-navy/95 p-1 shadow-xl ${toolbarBelow ? 'top-full mt-3' : 'bottom-full mb-3'}`}>
                    <IconBtn label="Add text box" onClick={addText}><Plus size={15} /></IconBtn>
                    <IconBtn label="Align left" active={currentAlign === 'left'} onClick={() => align('left')}><AlignLeft size={15} /></IconBtn>
                    <IconBtn label="Align center" active={currentAlign === 'center'} onClick={() => align('center')}><AlignCenter size={15} /></IconBtn>
                    <IconBtn label="Align right" active={currentAlign === 'right'} onClick={() => align('right')}><AlignRight size={15} /></IconBtn>
                    <IconBtn label="Justify" active={currentAlign === 'justify'} onClick={() => align('justify')}><AlignJustify size={15} /></IconBtn>
                    <span className="mx-0.5 h-4 w-px bg-white/10" />
                    <IconBtn label="Text at top" active={boxValign === 'top'} onClick={() => valign('top')}><AlignVerticalJustifyStart size={15} /></IconBtn>
                    <IconBtn label="Text in middle" active={boxValign === 'middle'} onClick={() => valign('middle')}><AlignVerticalJustifyCenter size={15} /></IconBtn>
                    <IconBtn label="Text at bottom" active={boxValign === 'bottom'} onClick={() => valign('bottom')}><AlignVerticalJustifyEnd size={15} /></IconBtn>
                    <span className="mx-0.5 h-4 w-px bg-white/10" />
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
            {(['Format', 'Media', 'Background'] as const).map((t) => (
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
            {tab === 'Media' && <div className="mb-5">
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
            {tab === 'Format' && cur.countdown && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand/25 bg-brand/5 p-3">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Countdown timer</SectionTitle>
                <button type="button" onClick={() => updateSlide({ countdown: undefined })} className="rounded-md px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/10">Remove</button>
              </div>
              {(() => {
                const countdown = cur.countdown;
                if (!countdown) return null;
                const units = { ...DEFAULT_COUNTDOWN_UNITS, ...countdown.units };
                const setFromNow = (minutes: number) => updateCountdown({ targetAt: new Date(Date.now() + minutes * 60_000).toISOString() });
                const formats: { value: CountdownFormat; label: string; hint: string }[] = [
                  { value: 'auto', label: 'Auto', hint: '01:05:09, or 2d 03h 15m when days are left' },
                  { value: 'clock', label: '00:00:00', hint: 'Hours, minutes and seconds' },
                  { value: 'minutes', label: '00:00', hint: 'Minutes and seconds (good for short timers)' },
                  { value: 'words', label: 'Words', hint: '2 Days 3 Hours 15 Minutes' },
                  { value: 'boxes', label: 'Boxes', hint: 'Big numbers with the unit under each' },
                ];
                const chip = (active: boolean) => `rounded-md border px-2 py-1 text-[11px] font-semibold transition ${active ? 'border-brand bg-brand/15 text-brand' : 'border-white/10 text-warm-white/70 hover:border-white/25 hover:text-white'}`;
                return <>
                  <p className="text-[11px] text-warm-white/55">Select the timer on the slide to move or resize it.</p>

                  <p className="-mb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-white/45">Counts down to</p>
                  <input type="datetime-local" aria-label="Event date and time" value={toLocalDateTimeInput(countdown.targetAt)} onChange={(event) => {
                    const target = new Date(event.target.value);
                    if (!Number.isNaN(target.getTime())) updateCountdown({ targetAt: target.toISOString() });
                  }} className={fieldClass} />
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-warm-white/55">From now:
                    {[5, 10, 15, 30, 60].map((minutes) => <button key={minutes} type="button" onClick={() => setFromNow(minutes)} className={chip(false)}>{minutes < 60 ? `${minutes} min` : '1 hour'}</button>)}
                  </div>

                  <p className="-mb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-white/45">Timer style</p>
                  <div className="flex flex-wrap gap-1">
                    {formats.map((option) => <button key={option.value} type="button" title={option.hint} onClick={() => updateCountdown({ format: option.value })} className={chip((countdown.format ?? 'auto') === option.value)}>{option.label}</button>)}
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-warm-white/75"><input type="checkbox" checked={countdown.showSeconds ?? true} onChange={(event) => updateCountdown({ showSeconds: event.target.checked })} className="h-3.5 w-3.5 accent-brand" /> Show seconds</label>
                  {(countdown.format === 'words' || countdown.format === 'boxes') && <div className="grid grid-cols-2 gap-2">
                    {(['days', 'hours', 'minutes', 'seconds'] as const).map((key) => <label key={key} className="block text-[11px] text-warm-white/60">{DEFAULT_COUNTDOWN_UNITS[key]} word
                      <input value={countdown.units?.[key] ?? ''} placeholder={DEFAULT_COUNTDOWN_UNITS[key]} maxLength={20} onChange={(event) => updateCountdown({ units: { ...countdown.units, [key]: event.target.value } })} className={`${fieldClass} mt-1`} />
                    </label>)}
                    <p className="col-span-2 -mt-1 text-[10px] text-warm-white/45">Type your own words, in any language (e.g. Araw, Oras, Minuto, Segundo). Shown: {units.days} · {units.hours} · {units.minutes} · {units.seconds}</p>
                  </div>}

                  <p className="-mb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-white/45">Numbers</p>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <select aria-label="Countdown font" value={countdown.font ?? 'Montserrat'} onChange={(event) => updateCountdown({ font: event.target.value })} className={fieldClass} style={{ fontFamily: `"${countdown.font ?? 'Montserrat'}", sans-serif` }}>
                      {[...new Set([countdown.font ?? 'Montserrat', ...COUNTDOWN_FONTS])].map((font) => <option key={font} value={font} style={{ fontFamily: `"${font}", sans-serif` }}>{font}</option>)}
                    </select>
                    <div className="flex items-center gap-0.5">
                      <IconBtn label="Bold numbers" active={countdown.bold ?? true} onClick={() => updateCountdown({ bold: !(countdown.bold ?? true) })}><Bold size={15} /></IconBtn>
                      <ColorField label="Countdown color" value={countdown.color} onChange={(color) => updateCountdown({ color })} />
                    </div>
                  </div>
                  <label className="block text-xs text-warm-white/70">Size
                    <div className="mt-1 flex items-center gap-2"><input type="range" min="32" max="240" step="4" value={countdown.size ?? 112} onChange={(event) => updateCountdown({ size: Number(event.target.value) })} className="w-full accent-brand" /><span className="w-12 text-right tabular-nums">{countdown.size ?? 112}px</span></div>
                  </label>
                  <div className="flex items-center justify-between text-xs text-warm-white/75">
                    <span className="flex items-center gap-0.5">
                      <IconBtn label="Align left" active={(countdown.align ?? 'center') === 'left'} onClick={() => updateCountdown({ align: 'left' })}><AlignLeft size={15} /></IconBtn>
                      <IconBtn label="Align center" active={(countdown.align ?? 'center') === 'center'} onClick={() => updateCountdown({ align: 'center' })}><AlignCenter size={15} /></IconBtn>
                      <IconBtn label="Align right" active={(countdown.align ?? 'center') === 'right'} onClick={() => updateCountdown({ align: 'right' })}><AlignRight size={15} /></IconBtn>
                    </span>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={countdown.shadow ?? true} onChange={(event) => updateCountdown({ shadow: event.target.checked })} className="h-3.5 w-3.5 accent-brand" /> Shadow</label>
                  </div>

                  <p className="-mb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-white/45">Label</p>
                  <input aria-label="Countdown label" value={countdown.label} onChange={(event) => updateCountdown({ label: event.target.value })} className={fieldClass} placeholder="e.g. Service starts in (leave empty to hide)" maxLength={120} />
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-warm-white/60">
                    <button type="button" onClick={() => updateCountdown({ labelPosition: 'above' })} className={chip((countdown.labelPosition ?? 'above') === 'above')}>Above timer</button>
                    <button type="button" onClick={() => updateCountdown({ labelPosition: 'below' })} className={chip(countdown.labelPosition === 'below')}>Below timer</button>
                    <span className="ml-auto flex items-center gap-0.5">
                      <IconBtn label="Bold label" active={countdown.labelBold ?? true} onClick={() => updateCountdown({ labelBold: !(countdown.labelBold ?? true) })}><Bold size={15} /></IconBtn>
                      <ColorField label="Label color" value={countdown.labelColor ?? countdown.color} onChange={(labelColor) => updateCountdown({ labelColor })} />
                    </span>
                  </div>
                  <label className="block text-xs text-warm-white/70">Label size
                    <div className="mt-1 flex items-center gap-2"><input type="range" min="16" max="96" step="2" value={countdown.labelSize ?? 34} onChange={(event) => updateCountdown({ labelSize: Number(event.target.value) })} className="w-full accent-brand" /><span className="w-12 text-right tabular-nums">{countdown.labelSize ?? 34}px</span></div>
                  </label>

                  <p className="-mb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-white/45">When time is up</p>
                  <input aria-label="Message when the countdown ends" value={countdown.endText ?? 'Starting now'} onChange={(event) => updateCountdown({ endText: event.target.value })} className={fieldClass} placeholder="Leave empty to show nothing" maxLength={120} />
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => updateCountdown({ endMode: 'below' })} className={chip((countdown.endMode ?? 'below') === 'below')}>Show under 00:00</button>
                    <button type="button" onClick={() => updateCountdown({ endMode: 'replace' })} className={chip(countdown.endMode === 'replace')}>Replace the timer</button>
                  </div>

                  <p className="-mb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-white/45">Area (% of the slide)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height']] as const).map(([key, label]) => <label key={key} className="block text-xs text-warm-white/70">{label}
                      <input type="number" min="0" max="100" value={Math.round(countdown[key] ?? ({ x: 10, y: 30, w: 80, h: 40 }[key]))} onChange={(event) => updateCountdown({ [key]: clamp(Number(event.target.value) || 0, 0, 100) })} className={`${fieldClass} mt-1`} />
                    </label>)}
                  </div>
                  <p className="text-[11px] text-warm-white/50">The timer counts down live on the slide, in Studio, on the output screens and on the stream.</p>
                </>;
              })()}
            </div>}
            {tab === 'Format' &&
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
                      onSelect={(e) => rememberSelection(selectedBoxId, e.currentTarget.selectionStart, e.currentTarget.selectionEnd)}
                      className={`${fieldClass} resize-none`}
                    />
                    <p className="mt-1 text-[11px] text-warm-white/50">
                      The first line is the title. Other lines become the subtitle.
                    </p>
                  </div>

                  <SectionTitle>Text style</SectionTitle>
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
                    <IconBtn label={box.uppercase ? 'All caps on (click for normal text)' : 'All caps'} active={!!box.uppercase} onClick={() => updateBox({ uppercase: !box.uppercase })}>
                      <span className="text-[12px] font-bold leading-none tracking-tight">{box.uppercase ? 'AA' : 'Aa'}</span>
                    </IconBtn>
                    <span className="mx-1 h-5 w-px bg-white/10" />
                    <IconBtn label="Align left" active={shownAlign(selectedBoxId, box) === 'left'} onClick={() => applyAlign(selectedBoxId, box, 'left')}>
                      <AlignLeft size={15} />
                    </IconBtn>
                    <IconBtn label="Align center" active={shownAlign(selectedBoxId, box) === 'center'} onClick={() => applyAlign(selectedBoxId, box, 'center')}>
                      <AlignCenter size={15} />
                    </IconBtn>
                    <IconBtn label="Align right" active={shownAlign(selectedBoxId, box) === 'right'} onClick={() => applyAlign(selectedBoxId, box, 'right')}>
                      <AlignRight size={15} />
                    </IconBtn>
                    <IconBtn label="Justify" active={shownAlign(selectedBoxId, box) === 'justify'} onClick={() => applyAlign(selectedBoxId, box, 'justify')}>
                      <AlignJustify size={15} />
                    </IconBtn>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="mr-1 text-[11px] text-warm-white/50">Position in box</span>
                    <IconBtn label="Text at top" active={(box.valign ?? 'middle') === 'top'} onClick={() => updateBox({ valign: 'top' })}>
                      <AlignVerticalJustifyStart size={15} />
                    </IconBtn>
                    <IconBtn label="Text in middle" active={(box.valign ?? 'middle') === 'middle'} onClick={() => updateBox({ valign: 'middle' })}>
                      <AlignVerticalJustifyCenter size={15} />
                    </IconBtn>
                    <IconBtn label="Text at bottom" active={(box.valign ?? 'middle') === 'bottom'} onClick={() => updateBox({ valign: 'bottom' })}>
                      <AlignVerticalJustifyEnd size={15} />
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

                  <SectionTitle>Spacing</SectionTitle>
                    <label className="block">
                      <span className="flex justify-between text-xs text-warm-white/70">
                        Line spacing <span>{box.lineHeight.toFixed(2)}</span>
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
                {(() => {
                  const custom = parseCustomBackground(cur.bg);
                  const from = custom?.from ?? '#1E293B';
                  const applyColor = (bg: string) => updateSlide({ bg, bgImage: undefined, bgVideo: undefined, bgVideoMuted: undefined, bgAssetId: undefined, bgPosition: undefined, bgPictureRestore: undefined });
                  return (
                    <div>
                      <p className="mb-2 text-xs text-warm-white/70">Your own color</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-warm-white/70">
                        <label className="flex items-center gap-1.5">Color
                          <input type="color" aria-label="Background color" value={from} onChange={(event) => applyColor(customBackground(event.target.value, custom?.to))} className={`h-8 w-11 cursor-pointer rounded border bg-transparent ${custom && !cur.bgImage && !cur.bgVideo ? 'border-brand' : 'border-white/15'}`} />
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5">
                          <input type="checkbox" checked={!!custom?.to} onChange={(event) => applyColor(customBackground(from, event.target.checked ? custom?.to ?? '#000000' : undefined))} className="h-3.5 w-3.5 accent-brand" /> Blend to
                        </label>
                        {custom?.to && <input type="color" aria-label="Second background color" value={custom.to} onChange={(event) => applyColor(customBackground(from, event.target.value))} className="h-8 w-11 cursor-pointer rounded border border-white/15 bg-transparent" />}
                      </div>
                      {(cur.bgImage || cur.bgVideo) && <p className="mt-1 text-[10px] text-warm-white/45">Picking a color replaces the background picture or video.</p>}
                      <div className="mt-3 rounded-lg border border-white/10 bg-black/15 p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs text-warm-white/70">Presentation colors</p>
                          <button type="button" disabled={projectLocked || !!cur.bgImage || !!cur.bgVideo || deckColors.includes(cur.bg)} onClick={() => addDeckColor(cur.bg)} title="Save this slide's background color for this presentation" className="flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] font-semibold text-warm-white/80 hover:border-brand hover:text-white disabled:opacity-35">
                            <Plus size={12} /> Add color
                          </button>
                        </div>
                        {deckColors.length ? (
                          <div className="grid grid-cols-6 gap-1.5">
                            {deckColors.map((color) => (
                              <div key={color} className="group relative">
                                <button type="button" aria-label="Use this saved color" title="Use this color on this slide" onClick={() => applyColor(color)} className={`block aspect-square w-full rounded-md border-2 bg-linear-to-br ${backgroundClasses(color)} ${cur.bg === color && !cur.bgImage && !cur.bgVideo ? 'border-brand' : 'border-white/15'}`} style={backgroundStyle(color)} />
                                {!projectLocked && <button type="button" aria-label="Remove this saved color" title="Remove from this presentation" onClick={() => removeDeckColor(color)} className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/85 text-warm-white/85 ring-1 ring-white/20 hover:text-red-300 group-hover:flex"><X size={10} /></button>}
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-[10px] leading-snug text-warm-white/45">Pick a color or gradient, then click Add color to keep it for this presentation only.</p>}
                      </div>
                    </div>
                  );
                })()}
                {(cur.bgImage || cur.bgVideo) && <button type="button" onClick={() => removeBackgroundMedia(false)} className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-red-200 hover:bg-red-500/10">Remove background {cur.bgVideo ? 'video' : 'image'}</button>}
                {cur.bgImage && <p className="text-[11px] text-warm-white/50">Double-click the background on the slide, then drag it to reposition.</p>}
                <button type="button" disabled={projectLocked || slides.length < 2} onClick={applyBackgroundToAllSlides} title="Copy this slide's background and darkening to every unlocked slide" className="flex items-center justify-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-semibold text-warm-white transition hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-40"><Check size={14} className="text-brand" /> Use this background on all slides</button>
                <div
                  className={`relative rounded-xl transition ${backgroundDragOver ? 'ring-2 ring-brand ring-offset-2 ring-offset-panel' : ''}`}
                  onDragOver={(event) => { if (!dragHasFiles(event) || backgroundImportProgress) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setBackgroundDragOver(true); }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBackgroundDragOver(false); }}
                  onDrop={(event) => {
                    if (!dragHasFiles(event)) return;
                    event.preventDefault();
                    setBackgroundDragOver(false);
                    if (backgroundImportProgress) return;
                    void readDroppedFiles(event.dataTransfer).then((files) => importBackgrounds(files, files.some(({ path }) => path.includes('/')))).catch(() => flash('Could not read the dropped files.'));
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-warm-white/80">Background library</p>
                    <span className="text-[10px] text-warm-white/45">{backgroundAssets.length} saved</span>
                  </div>
                  <div className="mb-2 grid grid-cols-2 gap-1.5">
                    <button type="button" disabled={backgroundImportProgress !== null} title="Add every picture and video in a folder (its subfolders become collections)" onClick={() => backgroundFolderInput.current?.click()} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 py-2 text-[11px] font-semibold text-warm-white hover:border-brand/50 hover:bg-white/5 disabled:opacity-50"><FolderPlus size={14} /> Import folder</button>
                    <button type="button" disabled={backgroundImportProgress !== null} title="Pick one picture or video, or select several (Ctrl+click)" onClick={() => backgroundFilesInput.current?.click()} className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-2 py-2 text-[11px] font-semibold text-warm-white hover:border-brand/50 hover:bg-white/5 disabled:opacity-50"><Upload size={14} /> Add files</button>
                  </div>
                  {backgroundImportProgress && <div role="status" aria-live="polite" className="mb-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-[11px] text-warm-white/75">
                    <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><Loader2 size={13} className="shrink-0 animate-spin text-brand" /><span className="truncate">{backgroundImportProgress.message}</span></span><span className="shrink-0 tabular-nums text-warm-white/50">{backgroundImportProgress.current}/{backgroundImportProgress.total}</span></div>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${backgroundImportProgress.total ? backgroundImportProgress.current / backgroundImportProgress.total * 100 : 0}%` }} /></div>
                  </div>}
                  {backgroundAssets.length > 0 && (() => {
                    const names = [...new Set(backgroundAssets.map(collectionOf))].sort((a, b) => (a === 'Uploads' ? 1 : b === 'Uploads' ? -1 : naturalCompare(a, b)));
                    const chips = ['All', ...names];
                    const active = chips.includes(backgroundCollection) ? backgroundCollection : 'All';
                    return (
                      <>
                        <div role="tablist" aria-label="Background collections" className="mb-2 flex max-h-[4.5rem] flex-wrap gap-1 overflow-y-auto">
                          {chips.map((name) => (
                            <button key={name} role="tab" aria-selected={active === name} onClick={() => { setBackgroundCollection(name); setRenamingCollection(null); }} className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${active === name ? 'border-brand bg-brand/15 text-white' : 'border-white/10 text-warm-white/55 hover:text-warm-white'}`}>
                              {name} <span className={active === name ? 'text-brand' : 'text-warm-white/35'}>{name === 'All' ? backgroundAssets.length : backgroundAssets.filter((asset) => collectionOf(asset) === name).length}</span>
                            </button>
                          ))}
                        </div>
                        {active !== 'All' && active !== 'Uploads' && (renamingCollection === active ? (
                          <form onSubmit={(event) => { event.preventDefault(); void renameBackgroundCollection(active, collectionNameDraft); }} className="mb-2 flex items-center gap-1.5">
                            <input autoFocus value={collectionNameDraft} onChange={(event) => setCollectionNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setRenamingCollection(null); } }} aria-label="Collection name" maxLength={40} className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs text-white outline-none focus:border-brand" />
                            <button type="submit" aria-label="Save collection name" className="rounded-md bg-brand/20 p-1.5 text-brand"><Check size={13} /></button>
                            <button type="button" aria-label="Cancel rename" onClick={() => setRenamingCollection(null)} className="rounded-md p-1.5 text-warm-white/50 hover:bg-white/10"><X size={13} /></button>
                          </form>
                        ) : (
                          <div className="mb-2 flex items-center justify-end gap-1 text-[10px]">
                            <button type="button" onClick={() => { setRenamingCollection(active); setCollectionNameDraft(active); }} className="flex items-center gap-1 rounded-md px-2 py-1 text-warm-white/60 hover:bg-white/10 hover:text-warm-white"><Pencil size={11} /> Rename</button>
                            <button type="button" onClick={() => deleteBackgroundCollection(active)} className="flex items-center gap-1 rounded-md px-2 py-1 text-red-300/80 hover:bg-red-500/10 hover:text-red-200"><Trash2 size={11} /> Delete collection</button>
                          </div>
                        ))}
                        <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">
                          {backgroundAssets.filter((asset) => active === 'All' || collectionOf(asset) === active).map((asset) => (
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
                      </>
                    );
                  })()}
                  {backgroundAssets.length === 0 && !backgroundImportProgress && (
                    <div className="rounded-lg border border-dashed border-white/15 p-4 text-center text-[11px] leading-relaxed text-warm-white/50">
                      <FolderPlus size={20} className="mx-auto mb-1.5 text-warm-white/30" />
                      Import a folder of backgrounds, or drag one here. Each folder becomes a collection, like “Christmas” or “Motion loops”.
                    </div>
                  )}
                  <p className="mt-2 text-[10px] leading-relaxed text-warm-white/40">Images and videos added in Content also appear under Uploads. Smaller high-quality copies are used when they save space.</p>
                  <input ref={(element) => { backgroundFolderInput.current = element; markFolderInput(element); }} type="file" multiple hidden onChange={(event) => { const picked = pathedFilesFromInput(event.target.files); event.target.value = ''; void importBackgrounds(picked, true); }} />
                  <input ref={backgroundFilesInput} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => { const picked = pathedFilesFromInput(event.target.files); event.target.value = ''; void importBackgrounds(picked, false); }} />
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
          {dock === 'Templates' && (openTemplate ? <>
            <button type="button" onClick={() => setOpenTemplateId(null)} className="flex h-full w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 text-xs text-warm-white/70 transition hover:border-brand hover:text-white">
              <ChevronLeft size={18} /> All templates
            </button>
            {openTemplate.mine && <button type="button" onClick={() => deleteMyTemplate(openTemplate.id)} className="flex h-full w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 text-xs text-red-200/80 transition hover:border-red-400/60 hover:bg-red-500/10"><Trash2 size={16} /> Delete template</button>}
            <ActionCard icon={Plus} label={onlyStarterSlide ? 'Use this template' : `Add all ${openTemplate.slides.length} slides`} hint={onlyStarterSlide ? `Start with all ${openTemplate.slides.length} slides` : `“${openTemplate.label}”`} onClick={() => addTemplateSlides(openTemplate.slides, openTemplate.label, openTemplate.colors)} />
            {openTemplate.slides.map((source, slideIndex) => (
              <button key={slideIndex} type="button" title="Add this slide" onClick={() => addTemplateSlides([source], openTemplate.label, openTemplate.colors)} className="w-37.5 shrink-0 text-left">
                <span className="relative block aspect-video overflow-hidden rounded-lg border border-white/10 transition hover:border-brand">
                  <SlideRender slide={withTemplateMedia(slideFromTemplate(source))} />
                </span>
                <span className="mt-1 block truncate text-xs text-warm-white/80">{source.title || `Slide ${slideIndex + 1}`}</span>
              </button>
            ))}
          </> : <>
            <ActionCard icon={Save} label="Save as template" hint="Keep this presentation's design" onClick={saveDeckAsTemplate} />
            {allTemplates.map((t) => (
              <div key={t.id} className="group relative w-37.5 shrink-0">
              {t.mine && <button type="button" aria-label={`Delete template ${t.label}`} title="Delete this template" onClick={() => deleteMyTemplate(t.id)} className="absolute right-1 top-1 z-10 rounded-md bg-black/75 p-1.5 text-warm-white/85 ring-1 ring-white/15 transition hover:bg-red-500/80 hover:text-white"><Trash2 size={13} /></button>}
              <button type="button" onClick={() => setOpenTemplateId(t.id)} className="w-full text-left">
                <span className="relative block">
                  <span className="absolute inset-x-2 -top-1 h-full rounded-lg border border-white/10 bg-white/5" />
                  <span className="relative block aspect-video overflow-hidden rounded-lg border border-white/10 transition group-hover:border-brand">
                    <SlideRender slide={withTemplateMedia(slideFromTemplate(t.slides[0]))} />
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">{t.slides.length} slide{t.slides.length === 1 ? '' : 's'}</span>
                  </span>
                </span>
                <span className="mt-1 flex items-center gap-1 truncate text-xs text-warm-white/80">{t.mine && <span className="rounded bg-brand/20 px-1 text-[9px] font-bold text-brand">MINE</span>}{t.label}</span>
              </button>
              </div>
            ))}
          </>)}

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
          onClick={() => { void save(); }}
          disabled={saving}
          aria-busy={saving}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-panel px-5 py-3 text-sm font-medium text-warm-white hover:bg-white/5 disabled:cursor-wait disabled:opacity-70"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving…' : 'Save & Close'}
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

      {videoPreviewAsset && <BodyPortal><div className="fixed inset-0 z-130 flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setVideoPreviewAsset(null); }}>
        <section role="dialog" aria-modal="true" aria-label={`Preview ${videoPreviewAsset.name}`} className="w-full max-w-4xl rounded-2xl border border-white/10 bg-[#101d2a] p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate text-sm font-semibold text-warm-white">{videoPreviewAsset.name}</h2><button type="button" onClick={() => setVideoPreviewAsset(null)} aria-label="Close video preview" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={17} /></button></div>
          <video src={videoPreviewAsset.url} controls autoPlay playsInline className="max-h-[70vh] w-full rounded-lg bg-black" />
          <p className="mt-3 text-xs text-warm-white/55">This upload is from the background library. Add videos that need player controls from the Content tab.</p>
          <div className="mt-2 flex justify-end"><button type="button" onClick={() => { applyMediaAsset(videoPreviewAsset); setVideoPreviewAsset(null); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy">Use as background</button></div>
        </section>
      </div></BodyPortal>}
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
          setTab('Format');
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
      {leaveConfirmationOpen && <BodyPortal><div className="fixed inset-0 z-90 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) { setLeaveConfirmationOpen(false); setPendingNavigation(null); } }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="leave-presentation-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
          <h2 id="leave-presentation-title" className="text-base font-bold text-warm-white">You have unsaved changes</h2>
          <p className="mt-2 text-sm leading-relaxed text-warm-white/60">Save your slide changes before leaving this presentation, or discard them?</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => { setLeaveConfirmationOpen(false); setPendingNavigation(null); }} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5 disabled:cursor-wait disabled:opacity-50">Keep editing</button>
            <button type="button" disabled={saving} onClick={discardEditorChanges} className="rounded-lg border border-red-400/30 px-4 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10 disabled:cursor-wait disabled:opacity-50">Discard changes</button>
            <button type="button" disabled={saving} onClick={() => { void keepChangesAndContinue(); }} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-wait disabled:opacity-70">{saving && <Loader2 size={15} className="animate-spin" />}{saving ? 'Saving…' : 'Keep changes'}</button>
          </div>
        </section>
      </div></BodyPortal>}
    </div>
  );
}
