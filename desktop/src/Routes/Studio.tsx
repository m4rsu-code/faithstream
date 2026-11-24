import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  ArrowRight,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Eye,
  EyeOff,
  GripVertical,
  Image,
  Loader2,
  Maximize2,
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
import type { StreamStatus } from '../shared/streamContracts';
import ConfirmationModal from '../components/modal/ConfirmationModal';
import AudioMixerSettingsModal from '../components/modal/AudioMixerSettingsModal';
import ExpandedSlidesModal from '../components/modal/ExpandedSlidesModal';
import ScripturePickerModal, { preloadBible, type SelectedScriptureVerse } from '../components/modal/ScripturePickerModal';
import SongEditorModal from '../components/modal/SongEditorModal';
import { registerModalEscape } from '../components/modal/modalEscape';
import CountdownDisplay, { paintCountdown, type CountdownSettings } from '../components/CountdownDisplay';
import StudioSongsPanel from '../Sub-tabs/StudioSongsPanel';
import { SegmentedTabs, UnderlineTabs } from '../Sub-tabs/TabNavigation';
import SongScriptureDesignPanel from '../components/SongScriptureDesignPanel';
import SlideBackgroundLayer from '../components/SlideBackgroundLayer';
import { readBackgroundLibrary } from '../utils/mediaLibrary';
import { hasLineAligns, lineAlignAt } from '../utils/lineAlign';
import { backgroundClasses, backgroundStyle, customBackgroundStops } from '../utils/slideBackground';
import { SHOW_SONG_EVENT, SONG_SAVED_EVENT, SONG_SLIDE_SETTINGS_EVENT, compareSongs, firstLine, loadLibrary, loadSongSlideSettings, saveSong, searchSongs, songLineKey, songSlideLayouts, songStyleFor, type Song, type Songbook, type SongStyle, type SongTextLayout } from '../utils/songbooks';
import { formatMediaSizeInKb, prepareMediaFile } from '../utils/mediaOptimization';
import { getAccountDatabaseName, getAccountStorageKey } from '../utils/accountStorage';
import GOOGLE_FONT_FAMILIES from '../data/google-font-families.json';

/* ---------- Data ---------- */

type Slide = { text: string; ref?: string; bg?: string; canvasAspect?: number; canvasWidthPoints?: number; canvasHeightPoints?: number; bgImage?: string; bgImageFit?: 'cover' | 'contain'; bgPosition?: { x: number; y: number }; bgVideo?: string; bgVideoMuted?: boolean; bgAssetId?: string; dim?: number; backgroundOpacity?: number; textColor?: string; title?: string; countdown?: CountdownSettings };

type PresentationTextBox = {
  text: string; font: string; size: number; color: string; bold: boolean; italic: boolean;
  underline: boolean; align: 'left' | 'center' | 'right' | 'justify'; shadow: boolean; boxBg: string;
  boxBgOn: boolean; autoSize: boolean; lineHeight: number; letterSpacing: number;
  x: number; y: number; w: number; h: number; layerOrder?: number | 'back' | 'front';
  /** Show the text in capital letters (the stored text keeps its normal case). */
  uppercase?: boolean;
  /** Where the text sits in its box, top to bottom (missing = middle). */
  valign?: 'top' | 'middle' | 'bottom';
  /** Single lines aligned differently from the box (index = line number; null = follow the box). */
  lineAligns?: ('left' | 'center' | 'right' | 'justify' | null)[];
  importedRuns?: { text: string; font: string; size: number; letterSpacing?: number; color: string; bold: boolean; italic: boolean; underline: boolean }[];
  importedPadding?: { top: number; right: number; bottom: number; left: number };
  powerPointImported?: boolean;
  powerPointTextFit?: boolean;
  animation?: StudioAnimation;
  animationDuration?: number;
  animationDelay?: number;
  animationEasing?: 'smooth' | 'linear' | 'snappy';
};
type StudioAnimation = 'none' | 'fade' | 'rise' | 'pop' | 'typewriter' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom' | 'drift' | 'bounce' | 'spin' | 'blur';
const requestedStudioFonts = new Set<string>();
const studioFontKey = (family: string) => family.normalize('NFKD').toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
const resolveStudioFont = (family: string) => (GOOGLE_FONT_FAMILIES as string[]).find((candidate) => studioFontKey(candidate) === studioFontKey(family)) ?? family.trim();
const loadStudioFont = (family: string) => {
  const resolvedFamily = resolveStudioFont(family);
  if (!(GOOGLE_FONT_FAMILIES as string[]).includes(resolvedFamily) || requestedStudioFonts.has(resolvedFamily)) return;
  requestedStudioFonts.add(resolvedFamily);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(resolvedFamily)}&display=swap`;
  document.head.appendChild(link);
};
const studioAnimationStyle = (item: { animation?: StudioAnimation; animationDuration?: number; animationDelay?: number; animationEasing?: 'smooth' | 'linear' | 'snappy' }) => ({
  animationDuration: `${item.animationDuration ?? (item.animation === 'typewriter' ? 1500 : 700)}ms`,
  animationDelay: `${item.animationDelay ?? 0}ms`,
  animationTimingFunction: item.animationEasing === 'linear' ? 'linear' : item.animationEasing === 'snappy' ? 'cubic-bezier(.16,1,.3,1)' : 'cubic-bezier(.2,.75,.25,1)',
  animationFillMode: 'both' as const,
});
type PresentationPicture = { id: number; src: string; x: number; y: number; w: number; h: number; aspectRatio?: number; mediaType?: 'image' | 'video'; assetId?: string; poster?: string; muted?: boolean; fitToBox?: boolean; layerOrder?: number | 'back' | 'front'; animation?: StudioAnimation; animationDuration?: number; animationDelay?: number; animationEasing?: 'smooth' | 'linear' | 'snappy' };
type PresentationShape = { id: number; kind: string; x: number; y: number; w: number; h: number; fill: string; layerOrder?: number; animation?: StudioAnimation; animationDuration?: number; animationDelay?: number; animationEasing?: 'smooth' | 'linear' | 'snappy' };
type PresentationDesign = {
  box?: PresentationTextBox | null;
  extraBoxes?: { id: number; box: PresentationTextBox }[];
  pictures?: PresentationPicture[];
  shapes?: PresentationShape[];
  countdown?: CountdownSettings;
};
type StudioSlide = Slide & { design?: PresentationDesign; presentationSlideId?: number };

type Scene = {
  id: number;
  name: string;
  desc: string;
  bg: string; // tailwind gradient classes (placeholder until real media is wired in)
  slides: StudioSlide[];
  presentationId?: string;
  /** Studio creates one presentation source for a linked deck the first time it is used. */
  presentationSourceInitialized?: boolean;
  /** Set when this scene shows a song from the songbooks; editing the song updates the scene. */
  songId?: string;
  scriptureReference?: string;
  scriptureVerses?: SelectedScriptureVerse[];
  scriptureStyle?: SongStyle;
};

const scriptureDesignForScene = (scene: Scene): { reference: string; verses: SelectedScriptureVerse[]; style: SongStyle } | null => {
  if (scene.scriptureVerses?.length) return {
    reference: scene.scriptureReference ?? scene.name,
    verses: scene.scriptureVerses,
    style: scene.scriptureStyle ?? { ...loadSongSlideSettings(), titleSlide: false },
  };
  if (!scene.desc.startsWith('Scripture')) return null;
  const verses = scene.slides.map((slide) => {
    const text = slide.design?.box?.text ?? slide.text;
    const lines = text.split('\n');
    const reference = slide.ref ?? slide.title ?? lines[0]?.trim() ?? scene.name;
    return { reference, text: lines[0]?.trim() === reference ? lines.slice(1).join('\n') : text };
  });
  const first = scene.slides[0];
  const box = first?.design?.box;
  const base = loadSongSlideSettings();
  const style: SongStyle = {
    ...base,
    titleSlide: false,
    background: first?.bg ?? base.background,
    ...(first?.bgAssetId ? { backgroundAssetId: first.bgAssetId } : {}),
    dim: first?.dim ?? base.dim,
    backgroundOpacity: first?.backgroundOpacity ?? base.backgroundOpacity,
    ...(box ? {
      font: box.font,
      fontSize: box.size,
      autoFit: box.autoSize,
      lineHeight: box.lineHeight,
      bold: box.bold,
      italic: box.italic,
      underline: box.underline,
      caps: false,
      align: box.align,
      valign: box.valign ?? 'middle',
      letterSpacing: box.letterSpacing,
      boxBg: box.boxBg,
      boxBgOn: box.boxBgOn,
      color: box.color,
      shadow: box.shadow,
      area: { x: box.x, y: box.y, w: box.w, h: box.h },
    } : {}),
  };
  return { reference: scene.name, verses, style };
};

const SONG_SCENE_BG = 'from-purple-700 via-indigo-900 to-slate-950';
/**
 * Song text uses the same fitted text box as presentations, so it sits identically in the
 * thumbnails, Preview, the output monitors and the stream: centred, inside safe margins,
 * and shrunk automatically when a part has long lines.
 */
const songTextBox = (text: string, size = 64, uppercase = false): PresentationTextBox => ({
  text, font: 'Segoe UI', size, color: '#FFFFFF', bold: true, italic: false, underline: false,
  align: 'center', shadow: true, boxBg: '#000000', boxBgOn: false, autoSize: true, lineHeight: 1.2, letterSpacing: 0,
  x: 6, y: 8, w: 88, h: 84, uppercase,
});
/** A song text area as a Studio text box. */
const songLayoutBox = (layout: SongTextLayout): PresentationTextBox => ({
  text: layout.text, font: layout.font, size: layout.size, color: layout.color, bold: layout.bold, italic: layout.italic,
  underline: layout.underline, align: layout.align, valign: layout.valign, lineAligns: layout.lineAligns, shadow: layout.shadow, boxBg: layout.boxBg, boxBgOn: layout.boxBgOn, autoSize: true,
  lineHeight: layout.lineHeight, letterSpacing: layout.letterSpacing, x: layout.x, y: layout.y, w: layout.w, h: layout.h, uppercase: layout.uppercase,
});
/**
 * Builds a song's Studio slides from its style (its own design, or the default song style):
 * an optional title slide, then the lyrics at one shared size, on the chosen background.
 */
const songSceneSlides = (song: Song, mediaUrls: StudioMediaUrlMap = {}): StudioSlide[] => {
  const sharedBackground = loadSongSlideSettings();
  const style = {
    ...songStyleFor(song),
    // Keep the shared background choice in sync even when this song has an older saved style.
    background: sharedBackground.background,
    backgroundAssetId: sharedBackground.backgroundAssetId,
    dim: sharedBackground.dim,
    backgroundOpacity: sharedBackground.backgroundOpacity,
  };
  return songSlideLayouts(song, style).map((layout, index) => {
    const asset = layout.backgroundAssetId ? mediaUrls[layout.backgroundAssetId] : undefined;
    return {
      text: layout.text,
      title: layout.label ?? `Part ${index + 1}`,
      bg: layout.background,
      dim: layout.dim,
      backgroundOpacity: layout.backgroundOpacity,
      bgAssetId: layout.backgroundAssetId,
      bgImage: asset?.type === 'image' ? asset.url : asset?.type === 'video' ? asset.thumbnailUrl : undefined,
      bgVideo: asset?.type === 'video' ? asset.url : undefined,
      bgVideoMuted: asset?.type === 'video' ? true : undefined,
      design: {
        box: songLayoutBox(layout.box),
        extraBoxes: layout.subtitleBox ? [{ id: 1, box: songLayoutBox(layout.subtitleBox) }] : [],
      },
    };
  });
};
/** Upgrades song scenes saved before songs used fitted text boxes. */
const upgradeSongScenes = (list: Scene[]) => (list.some((scene) => scene.songId && scene.slides.some((slide) => !slide.design))
  ? list.map((scene) => (scene.songId ? { ...scene, slides: scene.slides.map((slide) => (slide.design ? slide : { ...slide, dim: slide.dim ?? 0, design: { box: songTextBox(slide.text) } })) } : scene))
  : list);
/** Older Scripture scenes stored the reference and verse on one spaced line, unlike the designer's two-line preview. */
const upgradeScriptureScenes = (list: Scene[]) => list.map((scene) => {
  if (!scene.desc?.startsWith('Scripture ·')) return scene;
  let changed = false;
  const slides = scene.slides.map((slide) => {
    const box = slide.design?.box;
    if (!slide.ref || !box?.text.startsWith(`${slide.ref}  `)) return slide;
    const body = box.text.slice(slide.ref.length).trimStart();
    if (!body) return slide;
    const text = `${slide.ref}\n${body}`;
    if (box.text === text && slide.text === text) return slide;
    changed = true;
    return { ...slide, text, design: { ...slide.design!, box: { ...box, text } } };
  });
  return changed ? { ...scene, slides } : scene;
});

type SavedPresentationSlide = {
  id: number;
  title?: string;
  bg?: string;
  canvasAspect?: number;
  canvasWidthPoints?: number;
  canvasHeightPoints?: number;
  dim?: number;
  backgroundOpacity?: number;
  bgImage?: string;
  bgImageFit?: 'cover' | 'contain';
  bgPosition?: { x: number; y: number };
  bgVideo?: string;
  bgVideoMuted?: boolean;
  bgAssetId?: string;
  box?: PresentationTextBox | null;
  extraBoxes?: { id: number; box: PresentationTextBox }[];
  pictures?: PresentationPicture[];
  shapes?: PresentationShape[];
  countdown?: CountdownSettings;
};
type SavedPresentation = { id: string; name: string; slides: SavedPresentationSlide[]; updatedAt?: number; locked?: boolean; deviceOnly?: boolean };
let deviceSavedPresentations: SavedPresentation[] = [];
const readDeviceSavedPresentations = async (): Promise<SavedPresentation[]> => {
  const request = indexedDB.open(getAccountDatabaseName('faithstream.presentation-data'), 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('projects', 'readonly');
    const storeRequest = transaction.objectStore('projects').getAll();
    storeRequest.onsuccess = () => resolve((storeRequest.result as SavedPresentation[]).filter((item) => Array.isArray(item.slides)));
    storeRequest.onerror = () => reject(storeRequest.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
};
type StudioMedia = { id: string; name?: string; type: 'image' | 'video'; blob: Blob; thumbnailBlob?: Blob; originalBlob?: Blob; optimized?: boolean };
type StudioMediaUrlMap = Record<string, { type: 'image' | 'video'; url: string; thumbnailUrl?: string; name?: string; sizeBytes?: number; originalBytes?: number; optimized?: boolean }>;
export const StudioVisibilityContext = createContext(true);
type StudioMusicAsset = { id: string; name: string; path: string; createdAt: number };
type StudioMusicAssetWithUrl = StudioMusicAsset & { url: string; available?: boolean };
const STUDIO_SCENES_KEY = 'faithstream.studio-scenes';
const STUDIO_SLIDESHOW_SCENES_KEY = 'faithstream.studio-slideshow-scenes';
const STUDIO_OUTPUT_REF_KEY = 'faithstream.studio-output-ref';
const STUDIO_STREAM_OUTPUT_REF_KEY = 'faithstream.studio-stream-output-ref';
const STUDIO_QUICK_SHOW_SLIDES_KEY = 'faithstream.studio-quick-show-live-slides';
const STUDIO_DISPLAY_MODE_KEY = 'faithstream.studio-display-mode';
const STUDIO_STREAM_DISPLAYS_KEY = 'faithstream.studio-stream-displays';
// Versioned so first launch after the old default-on behavior opens in direct mode.
const STUDIO_OUTPUT_TAB_KEY = 'faithstream.studio-output-tab';
const STUDIO_SIDEBAR_PANEL_KEY = 'faithstream.studio-sidebar-panel';
const STUDIO_MUSIC_VIEW_KEY = 'faithstream.studio-music-view';
const STUDIO_RESOLUTION_KEY = 'faithstream.studio-resolution';
const STUDIO_FRAME_RATE_KEY = 'faithstream.studio-frame-rate';
const STUDIO_BITRATE_KEY = 'faithstream.studio-bitrate';
const STUDIO_SESSION_KEY = 'faithstream.studio-session';
const STUDIO_MUSIC_FILES_KEY = 'faithstream.studio-music-files';

const markStartupResourceReady = (resource: 'studio-media' | 'studio-music') => {
  window.dispatchEvent(new CustomEvent('faithstream:startup-resource-ready', { detail: resource }));
};

const channelGain = (db: number) => db <= -60 ? 0 : 10 ** (db / 20);

const syncPresentationSlides = (scene: Scene, presentation: SavedPresentation): Scene => {
  const slides = presentation.slides.map((savedSlide, index): StudioSlide => {
    const text = [savedSlide.box?.text, ...(savedSlide.extraBoxes ?? []).map((item) => item.box.text)].filter((value): value is string => !!value?.trim()).join('\n');
    return {
      presentationSlideId: savedSlide.id,
      title: savedSlide.title || `Slide ${index + 1}`,
      text: text || savedSlide.title || '',
      bg: savedSlide.bg ?? 'from-slate-600 to-slate-950',
      canvasAspect: savedSlide.canvasAspect,
      bgImage: savedSlide.bgImage,
      bgImageFit: savedSlide.bgImageFit,
      bgPosition: savedSlide.bgPosition,
      bgVideo: savedSlide.bgVideo,
      bgVideoMuted: savedSlide.bgVideoMuted,
      bgAssetId: savedSlide.bgAssetId,
      dim: savedSlide.dim,
      backgroundOpacity: savedSlide.backgroundOpacity,
      textColor: savedSlide.box?.color,
      countdown: savedSlide.countdown,
      design: { box: savedSlide.box, extraBoxes: savedSlide.extraBoxes, pictures: savedSlide.pictures, shapes: savedSlide.shapes, countdown: savedSlide.countdown },
    };
  });
  return {
    ...scene,
    presentationId: presentation.id,
    name: presentation.name || scene.name,
    desc: `${slides.length} presentation ${slides.length === 1 ? 'slide' : 'slides'}`,
    slides,
  };
};

const serializeScenesForStorage = (scenes: Scene[]) => scenes.map((scene) => ({
  ...scene,
  slides: scene.slides.map((slide) => ({
    ...(slide.bgAssetId ? { ...slide, bgImage: undefined, bgVideo: undefined } : slide),
    design: slide.design ? { ...slide.design, pictures: slide.design.pictures?.map((picture) => picture.assetId ? { ...picture, src: '' } : picture) } : undefined,
  })),
}));

type StoredStudioSceneSnapshot = { key: string; scenes: Scene[]; savedAt: number };
const STUDIO_SCENE_SNAPSHOT_DB = 'faithstream.studio-scene-snapshots';
const STUDIO_SCENE_SNAPSHOT_CHANNEL = 'faithstream-studio-scene-snapshots';
const studioSceneSnapshotTimestampKey = (key: string) => getAccountStorageKey(`${key}:saved-at`);

const openStudioSceneSnapshotDb = async (databaseName = STUDIO_SCENE_SNAPSHOT_DB) => {
  const request = indexedDB.open(databaseName, 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('snapshots')) {
        request.result.createObjectStore('snapshots', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db;
};

const readStudioSceneSnapshotFrom = async (databaseName: string, key: string): Promise<StoredStudioSceneSnapshot | undefined> => {
  const db = await openStudioSceneSnapshotDb(databaseName);
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readonly');
    const request = transaction.objectStore('snapshots').get(key);
    request.onsuccess = () => resolve(request.result as StoredStudioSceneSnapshot | undefined);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
};

const readStudioSceneSnapshot = async (key: string): Promise<StoredStudioSceneSnapshot | undefined> => {
  const accountRecordKey = getAccountStorageKey(key);
  // Keep account scenes separate inside one fixed local database. Read the earlier
  // account-named database once as a migration path for existing installations.
  const localSnapshot = await readStudioSceneSnapshotFrom(STUDIO_SCENE_SNAPSHOT_DB, accountRecordKey);
  if (localSnapshot) return localSnapshot;
  const legacyDatabaseName = getAccountDatabaseName(STUDIO_SCENE_SNAPSHOT_DB);
  return legacyDatabaseName === STUDIO_SCENE_SNAPSHOT_DB
    ? undefined
    : readStudioSceneSnapshotFrom(legacyDatabaseName, key);
};

const writeStudioSceneSnapshot = async (key: string, scenes: Scene[], savedAt: number) => {
  const db = await openStudioSceneSnapshotDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    transaction.objectStore('snapshots').put({ key: getAccountStorageKey(key), scenes, savedAt } satisfies StoredStudioSceneSnapshot);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
};

const readPreferredStudioScenes = async (key: string, fallback: Scene[]) => {
  const snapshot = await readStudioSceneSnapshot(key);
  const localSavedAt = Number(localStorage.getItem(studioSceneSnapshotTimestampKey(key))) || 0;
  if (!snapshot || !Array.isArray(snapshot.scenes) || snapshot.savedAt < localSavedAt) return fallback;
  return upgradeScriptureScenes(snapshot.scenes.filter((scene) => Number.isFinite(scene?.id) && scene.name && scene.bg && Array.isArray(scene.slides)));
};

const persistScenesImmediately = (scenes: Scene[], key: string) => {
  const serialized = serializeScenesForStorage(scenes);
  const timestampKey = studioSceneSnapshotTimestampKey(key);
  const previousTimestamp = Number(localStorage.getItem(timestampKey)) || 0;
  const savedAt = Math.max(Date.now(), previousTimestamp + 1);
  try { localStorage.setItem(getAccountStorageKey(key), JSON.stringify(serialized)); } catch { /* IndexedDB below remains the durable copy if local storage is full. */ }
  try { localStorage.setItem(timestampKey, String(savedAt)); } catch { /* IndexedDB still receives the timestamp. */ }
  void writeStudioSceneSnapshot(key, serialized, savedAt).then(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(STUDIO_SCENE_SNAPSHOT_CHANNEL);
    channel.postMessage({ key: getAccountStorageKey(key), savedAt });
    channel.close();
  }).catch(() => {
    window.dispatchEvent(new CustomEvent('faithstream:studio-scene-save-error', { detail: { key } }));
  });
};

const restoreImportedSlideForStudio = (slide: StudioSlide, mediaUrls: StudioMediaUrlMap): StudioSlide => {
  const pictures = slide.design?.pictures?.map((picture) => {
    const asset = picture.assetId ? mediaUrls[picture.assetId] : undefined;
    return asset ? { ...picture, src: asset.url, poster: asset.thumbnailUrl } : picture;
  });
  const isImportedVectorDeck = (slide.design?.pictures ?? []).some((picture) => {
    const asset = picture.assetId ? mediaUrls[picture.assetId] : undefined;
    return asset?.type === 'image' && /-item-\d+\.svg$/i.test(asset.name ?? '');
  });
  let restored: StudioSlide = { ...slide, design: slide.design ? { ...slide.design, pictures } : undefined };

  // Older imported decks stored coordinates before their original slide aspect ratio was
  // saved. Match Presentation's one-time restore so the artwork stays in the right positions.
  const backgroundPicture = (restored.design?.pictures ?? []).find((picture) => {
    const asset = picture.assetId ? mediaUrls[picture.assetId] : undefined;
    return asset?.type === 'image' && /-item-0\.svg$/i.test(asset.name ?? '');
  });
  const aspect = backgroundPicture?.aspectRatio;
  if (!(restored.canvasAspect && restored.canvasWidthPoints) && aspect && Number.isFinite(aspect) && aspect > 0) {
    const scaleX = Math.min(1, aspect / (16 / 9));
    const scaleY = Math.min(1, (16 / 9) / aspect);
    const offsetX = (1 - scaleX) / 2;
    const offsetY = (1 - scaleY) / 2;
    const estimatedWidthPoints = aspect * 540;
    const fontScale = Math.min(1920, 1080 * aspect) / estimatedWidthPoints;
    const restorePosition = <T extends { x: number; y: number; w: number; h: number }>(item: T): T => ({
      ...item,
      x: ((item.x / 100 - offsetX) / scaleX) * 100,
      y: ((item.y / 100 - offsetY) / scaleY) * 100,
      w: item.w / scaleX,
      h: item.h / scaleY,
    });
    const restoreBox = (box: PresentationTextBox): PresentationTextBox => ({
      ...restorePosition({ ...box, size: box.size * fontScale }),
      importedRuns: box.importedRuns?.map((run) => ({ ...run, size: run.size * fontScale, letterSpacing: (run.letterSpacing ?? 0) * fontScale })),
      importedPadding: box.importedPadding ? {
        top: box.importedPadding.top * fontScale,
        right: box.importedPadding.right * fontScale,
        bottom: box.importedPadding.bottom * fontScale,
        left: box.importedPadding.left * fontScale,
      } : undefined,
    });
    restored = {
      ...restored,
      canvasAspect: aspect,
      canvasWidthPoints: estimatedWidthPoints,
      canvasHeightPoints: 540,
      design: restored.design ? {
        ...restored.design,
        box: restored.design.box ? restoreBox(restored.design.box) : restored.design.box,
        extraBoxes: restored.design.extraBoxes?.map((item) => ({ ...item, box: restoreBox(item.box) })),
        pictures: restored.design.pictures?.map(restorePosition),
        shapes: restored.design.shapes?.map(restorePosition),
      } : restored.design,
    };
  }

  if (isImportedVectorDeck && restored.design) {
    const markImported = (box: PresentationTextBox): PresentationTextBox => ({
      ...box,
      autoSize: typeof box.powerPointTextFit === 'boolean' ? box.autoSize : false,
      powerPointImported: true,
    });
    restored = {
      ...restored,
      design: {
        ...restored.design,
        box: restored.design.box ? markImported(restored.design.box) : restored.design.box,
        extraBoxes: restored.design.extraBoxes?.map((item) => ({ ...item, box: markImported(item.box) })),
      },
    };
  }

  const backgroundAsset = restored.bgAssetId ? mediaUrls[restored.bgAssetId] : undefined;
  if (backgroundAsset) {
    restored = {
      ...restored,
      // Keep a still frame visible while the video decoder starts on the next slide.
      bgImage: backgroundAsset.type === 'image' ? backgroundAsset.url : backgroundAsset.thumbnailUrl,
      bgVideo: backgroundAsset.type === 'video' ? backgroundAsset.url : undefined,
    };
  }
  return restored;
};

const hydrateSceneMedia = (scene: Scene, mediaUrls: StudioMediaUrlMap): Scene => ({
  ...scene,
  slides: scene.slides.map((slide) => restoreImportedSlideForStudio(slide, mediaUrls)),
});

const loadStudioScenes = (): Scene[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(getAccountStorageKey(STUDIO_SCENES_KEY)) ?? '[]') as Scene[];
    if (!Array.isArray(saved)) return [];
    // Scene snapshots are the durable copy of what the operator arranged. Do not rebuild them
    // from localStorage presentation metadata here: imported decks keep their full slides in IDB.
    return upgradeScriptureScenes(saved.filter((scene) => Number.isFinite(scene?.id) && scene.name && scene.bg && Array.isArray(scene.slides)));
  } catch { return []; }
};

const loadSlideshowScenes = (): Scene[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(getAccountStorageKey(STUDIO_SLIDESHOW_SCENES_KEY)) ?? 'null') as Scene[] | null;
    if (Array.isArray(saved)) {
      return upgradeScriptureScenes(saved.filter((scene) => Number.isFinite(scene?.id) && scene.name && scene.bg && Array.isArray(scene.slides)));
    }
  } catch { /* Migrate existing Studio scenes below. */ }
  // Preserve existing projects while giving Slideshow its own editable scene copy.
  return loadStudioScenes().map((scene) => ({ ...scene, slides: scene.slides.map((slide) => ({ ...slide, design: slide.design ? { ...slide.design } : undefined })) }));
};

const readSavedPresentations = (): SavedPresentation[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(getAccountStorageKey('faithstream.presentations')) ?? '[]') as SavedPresentation[];
    const combined = new Map<string, SavedPresentation>();
    if (Array.isArray(saved)) saved.filter((presentation) => presentation?.id && Array.isArray(presentation.slides)).forEach((presentation) => combined.set(presentation.id, presentation));
    deviceSavedPresentations.forEach((presentation) => combined.set(presentation.id, presentation));
    // When localStorage had to fall back to card metadata, wait for the IndexedDB copy before
    // exposing imported decks to Studio. Reconstructing a scene from just id/title loses content.
    return [...combined.values()].filter((presentation) => !presentation.deviceOnly || !presentation.slides.length
      || presentation.slides.some((slide) => Object.keys(slide).some((key) => key !== 'id' && key !== 'title')));
  } catch { return []; }
};

const isPresentationCardOnly = (presentation: SavedPresentation) => presentation.deviceOnly
  && presentation.slides.length > 0
  && presentation.slides.every((slide) => Object.keys(slide).every((key) => key === 'id' || key === 'title'));

const presentationBackgroundIds = (presentations: SavedPresentation[]) => [...new Set(presentations
  .flatMap((presentation) => presentation.slides.map((slide) => slide.bgAssetId))
  .filter((id): id is string => typeof id === 'string' && id.startsWith('folder-default-')))];

const readStudioMedia = async (): Promise<StudioMedia[]> => {
  const request = indexedDB.open(getAccountDatabaseName('faithstream.media'), 1);
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

/** Resolve slide backgrounds from the same library used by the Presentation and Songbook designers. */
const readStudioMediaUrlMap = async () => {
  const [mediaResult, backgroundResult] = await Promise.allSettled([readStudioMedia(), readBackgroundLibrary()]);
  const urls: string[] = [];
  const mediaUrls: StudioMediaUrlMap = {};
  if (mediaResult.status === 'fulfilled') {
    for (const asset of mediaResult.value) {
      const url = URL.createObjectURL(asset.blob);
      urls.push(url);
      const thumbnailUrl = asset.thumbnailBlob ? URL.createObjectURL(asset.thumbnailBlob) : undefined;
      if (thumbnailUrl) urls.push(thumbnailUrl);
      mediaUrls[asset.id] = { type: asset.type, url, thumbnailUrl, name: asset.name, sizeBytes: asset.blob.size, originalBytes: asset.originalBlob?.size, optimized: asset.optimized };
    }
  }
  let releaseBackgrounds: () => void = () => {};
  if (backgroundResult.status === 'fulfilled') {
    releaseBackgrounds = backgroundResult.value.release;
    for (const item of backgroundResult.value.items) {
      // Use the exact background URL selected in the Presentation/Songbook design library.
      mediaUrls[item.id] = { type: item.type, url: item.url, thumbnailUrl: item.thumbnailUrl };
    }
  }
  return {
    mediaUrls,
    release: () => { urls.forEach(URL.revokeObjectURL); releaseBackgrounds(); },
  };
};

const saveStudioMedia = async (asset: StudioMedia) => {
  const request = indexedDB.open(getAccountDatabaseName('faithstream.media'), 1);
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

const readSavedStudioMusicFiles = (): StudioMusicAsset[] => {
  try {
    const saved = JSON.parse(localStorage.getItem(getAccountStorageKey(STUDIO_MUSIC_FILES_KEY)) ?? '[]') as StudioMusicAsset[];
    return Array.isArray(saved) ? saved.filter((asset) => typeof asset?.id === 'string' && typeof asset?.name === 'string' && typeof asset?.path === 'string' && Number.isFinite(asset?.createdAt)) : [];
  } catch { return []; }
};

const saveStudioMusicFiles = (assets: StudioMusicAsset[]) => {
  localStorage.setItem(getAccountStorageKey(STUDIO_MUSIC_FILES_KEY), JSON.stringify(assets));
};

type Ref = { sceneId: number; slideIdx: number };

const same = (a: Ref, b: Ref) => a.sceneId === b.sceneId && a.slideIdx === b.slideIdx;

type SourceKind = 'camera' | 'mobile-camera' | 'screen' | 'media' | 'presentation' | 'text' | 'microphone' | 'desktop-audio' | 'music';
type CameraOrientationMode = 'auto' | 'portrait-up' | 'landscape-left' | 'portrait-down' | 'landscape-right' | 'portrait' | 'upside-down';
type CameraRotation = 'auto' | '0' | '90' | '180' | '270';
type MobileCamSlot = 1 | 2 | 3;
type MobileCamPairing = { sourceId: number; slot: MobileCamSlot; port: number; code: string; addresses: string[]; expiresAt: number; connected: boolean; reconnecting?: boolean; remainingSeconds?: number; refreshError?: string };
type Source = {
  id: number;
  sceneId: number;
  shared?: boolean;
  name: string;
  kind: SourceKind;
  visible: boolean;
  stream?: MediaStream;
  mobileCamSlot?: MobileCamSlot;
  phoneOrientation?: 'portrait' | 'landscape';
  cameraOrientation?: CameraOrientationMode;
  cameraRotation?: Exclude<CameraRotation, 'auto'>;
  connectionStatus?: 'connected' | 'disconnected';
  deviceId?: string;
  mobileCamSourceId?: number;
  /** Legacy auto-created phone-audio channels are discarded during source restore. */
  mobileCamAudioAuto?: boolean;
  mediaAssetId?: string;
  loop?: boolean;
  text?: string;
  noiseSuppression?: boolean;
  layout?: { x: number; y: number; width: number; height: number };
};
const cameraRotationFor = (source: Source, videoWidth: number, videoHeight: number) => {
  if (source.cameraRotation !== undefined) return Number(source.cameraRotation);
  const legacyRotation: Partial<Record<CameraOrientationMode, number>> = {
    'portrait-up': 0,
    'landscape-left': 270,
    'portrait-down': 180,
    'landscape-right': 90,
    portrait: 0,
    'upside-down': 180,
  };
  if (source.cameraOrientation && source.cameraOrientation !== 'auto') return legacyRotation[source.cameraOrientation] ?? 0;
  return source.kind === 'mobile-camera' && source.phoneOrientation === 'landscape' && videoHeight > videoWidth ? 90 : 0;
};
const drawVideoCover = (context: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, width: number, height: number, rotation: number) => {
  if (!video.videoWidth || !video.videoHeight || width <= 0 || height <= 0) return;
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.translate(x + width / 2, y + height / 2);
  context.rotate((rotation === 270 ? -90 : rotation) * Math.PI / 180);
  const quarterTurn = rotation === 90 || rotation === 270;
  const targetWidth = quarterTurn ? height : width;
  const targetHeight = quarterTurn ? width : height;
  const scale = Math.max(targetWidth / video.videoWidth, targetHeight / video.videoHeight);
  const drawWidth = video.videoWidth * scale;
  const drawHeight = video.videoHeight * scale;
  context.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  context.restore();
};
const STUDIO_SOURCES_KEY = 'faithstream.studio-sources';
const STUDIO_AUDIO_CHANNELS_KEY = 'faithstream.studio-audio-channels';
const SOURCE_OPTIONS: { kind: SourceKind; name: string; icon: LucideIcon; group: string }[] = [
  { kind: 'camera', name: 'Camera', icon: Camera, group: 'Video' },
  { kind: 'mobile-camera', name: 'FaithStream Cam', icon: Camera, group: 'Video' },
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
    const saved = JSON.parse(localStorage.getItem(getAccountStorageKey(STUDIO_SOURCES_KEY)) ?? '[]') as Source[];
    if (!Array.isArray(saved)) return [];
    const validSources = saved.filter((source) => Number.isFinite(source?.id) && Number.isFinite(source?.sceneId) && !!source.name && !source.mobileCamAudioAuto && SOURCE_OPTIONS.some((option) => option.kind === source.kind));
    const mobileSources = validSources.filter((source) => source.kind === 'mobile-camera');
    const mobileSlots = new Map<number, MobileCamSlot>(mobileSources.map((source, index) => [source.id, (source.mobileCamSlot ?? Math.min(index + 1, 3)) as MobileCamSlot] as const));
    return validSources.map((source) => {
      if (source.kind === 'mobile-camera') {
        const mobileCamSlot = mobileSlots.get(source.id) ?? 1;
        return { ...source, name: `FaithStream Cam ${mobileCamSlot}`, mobileCamSlot, shared: true, stream: undefined, connectionStatus: 'disconnected' as const };
      }
      if (source.kind !== 'camera' || (source.layout && source.layout.width <= 25)) return { ...source, shared: true, stream: undefined };
      const cameraIndex = validSources.filter((item) => item.sceneId === source.sceneId && item.kind === 'camera').findIndex((item) => item.id === source.id);
      return { ...source, shared: true, stream: undefined, layout: { x: 100 - (cameraIndex + 1) * 24, y: 72, width: 22, height: 22 } };
    });
  } catch { return []; }
};

type Channel = { id: number; sceneId: number; name: string; icon: LucideIcon; db: number; muted: boolean; pan: number; compressor: boolean; compressorThreshold: number };

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

function MobileCamPairingQr({ pairing }: { pairing: MobileCamPairing }) {
  const [qrImage, setQrImage] = useState('');
  const payload = JSON.stringify({
    app: 'faithstream-cam-pairing',
    version: 1,
    addresses: pairing.addresses.map((address) => `${address}:${pairing.port}`),
    code: pairing.code,
  });

  useEffect(() => {
    let active = true;
    setQrImage('');
    void QRCode.toDataURL(payload, { width: 256, margin: 1, errorCorrectionLevel: 'M' })
      .then((image) => { if (active) setQrImage(image); })
      .catch(() => { if (active) setQrImage(''); });
    return () => { active = false; };
  }, [payload]);

  return qrImage
    ? <img src={qrImage} alt="FaithStream Cam pairing QR code" className="h-32 w-32 rounded-lg bg-white p-1" />
    : <div aria-label="Preparing pairing QR code" className="flex h-32 w-32 items-center justify-center rounded-lg bg-white text-center text-xs text-slate-600">Preparing QR…</div>;
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

function ProgramTextBox({ box, defaultLayerOrder = 3000, animate = false }: { box: PresentationTextBox; defaultLayerOrder?: number; animate?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    loadStudioFont(box.font);
    box.importedRuns?.forEach((run) => loadStudioFont(run.font));
    const fit = () => {
      if (!wrap.current || !inner.current || !inner.current.offsetHeight) {
        setFitScale(1);
        return;
      }
      if (box.powerPointImported) {
        setFitScale(1);
        return;
      }
      if (!box.autoSize) {
        setFitScale(1);
        return;
      }
      setFitScale(Math.min(1, wrap.current.clientHeight / inner.current.offsetHeight));
    };
    fit();
    const observer = new ResizeObserver(fit);
    const fontSet = document.fonts;
    fontSet?.addEventListener('loadingdone', fit);
    if (wrap.current) observer.observe(wrap.current);
    if (inner.current) observer.observe(inner.current);
    return () => {
      observer.disconnect();
      fontSet?.removeEventListener('loadingdone', fit);
    };
  }, [box]);
  return (
    <div ref={wrap} className={`absolute flex ${box.valign === 'top' ? 'items-start' : box.valign === 'bottom' ? 'items-end' : 'items-center'} ${box.powerPointImported ? 'overflow-visible' : 'overflow-hidden'} ${animate && box.animation && box.animation !== 'none' ? `slide-content-${box.animation}` : ''}`} style={{ ...(animate && box.animation && box.animation !== 'none' ? studioAnimationStyle(box) : {}), left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, zIndex: typeof box.layerOrder === 'number' ? box.layerOrder : box.layerOrder === 'front' ? 5000 : box.layerOrder === 'back' ? 0 : defaultLayerOrder, background: box.boxBgOn ? box.boxBg : undefined, borderRadius: '1cqw' }}>
      <div ref={inner} className={`w-full whitespace-pre-wrap ${box.powerPointImported ? '' : 'wrap-break-word'}`} style={{ textAlign: box.align, textAlignLast: box.align === 'justify' ? 'left' : undefined, transform: `scale(${fitScale})`, transformOrigin: box.valign === 'top' ? 'top center' : box.valign === 'bottom' ? 'bottom center' : 'center', lineHeight: box.lineHeight, letterSpacing: `${(box.letterSpacing / 1280) * 100}cqw`, ...(box.importedPadding ? { padding: `${(box.importedPadding.top / 1280) * 100}cqw ${(box.importedPadding.right / 1280) * 100}cqw ${(box.importedPadding.bottom / 1280) * 100}cqw ${(box.importedPadding.left / 1280) * 100}cqw` } : {}) }}>
        <div className="whitespace-pre-wrap" style={{ fontFamily: `"${resolveStudioFont(box.font).replaceAll('"', '')}", sans-serif`, fontSize: `${(box.size / 1280) * 100}cqw`, fontWeight: box.bold ? (box.powerPointImported ? 700 : 800) : 500, fontStyle: box.italic ? 'italic' : 'normal', textDecoration: box.underline ? 'underline' : 'none', textTransform: box.uppercase ? 'uppercase' : undefined, color: box.color, textShadow: box.shadow ? '0 0.3cqw 1.2cqw rgba(0,0,0,0.65)' : undefined }}>{box.importedRuns?.length
          ? box.importedRuns.map((run, index) => <span key={index} style={{ fontFamily: `"${resolveStudioFont(run.font).replaceAll('"', '')}", sans-serif`, fontSize: `${(run.size / 1280) * 100}cqw`, letterSpacing: `${((run.letterSpacing ?? box.letterSpacing) / 1280) * 100}cqw`, color: run.color, fontWeight: run.bold ? 700 : 500, fontStyle: run.italic ? 'italic' : 'normal', textDecoration: run.underline ? 'underline' : 'none' }}>{run.text}</span>)
          : hasLineAligns(box.lineAligns)
          ? box.text.split('\n').map((line, lineIndex) => {
            const lineAlign = lineAlignAt(box.align, box.lineAligns, lineIndex);
            return <div key={lineIndex} style={{ textAlign: lineAlign, textAlignLast: lineAlign === 'justify' ? 'left' : undefined }}>{line || ' '}</div>;
          })
          : box.text}</div>
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
  animate = false,
  seamlessBackground = false,
  deferMedia = false,
}: {
  bg: string;
  slide?: StudioSlide;
  scale?: number;
  minRem?: number;
  maxRem?: number;
  animate?: boolean;
  seamlessBackground?: boolean;
  deferMedia?: boolean;
}) {
  const animationSlideKey = slide?.presentationSlideId ?? slide?.title ?? slide?.ref ?? slide?.text ?? 'empty';
  if (slide?.design) {
    const boxes = [slide.design.box, ...(slide.design.extraBoxes ?? []).map((item) => item.box)]
      .filter((box): box is PresentationTextBox => !!box);
    const canvasAspect = slide.canvasAspect ?? 16 / 9;
    const canvasFrameStyle = {
      width: `${Math.min(1, canvasAspect / (16 / 9)) * 100}%`,
      height: `${Math.min(1, (16 / 9) / canvasAspect) * 100}%`,
      aspectRatio: `${canvasAspect}`,
    };
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black">
       <div className={`relative isolate overflow-hidden bg-linear-to-br ${backgroundClasses(slide.bg ?? bg)}`} style={{ ...canvasFrameStyle, containerType: 'inline-size', ...backgroundStyle(slide.bg ?? bg) }}>
        <SlideBackgroundLayer imageUrl={slide.bgImage} videoUrl={slide.bgVideo} posterUrl={slide.bgImage} opacity={slide.backgroundOpacity ?? 100} dim={slide.dim ?? 0} muted={slide.bgVideoMuted ?? true} position={`${slide.bgPosition?.x ?? 50}% ${slide.bgPosition?.y ?? 50}%`} imageFit={slide.bgImageFit} seamless={seamlessBackground} eager={!deferMedia} />
        {slide.design.pictures?.map((picture, index) => {
          const zIndex = typeof picture.layerOrder === 'number' ? picture.layerOrder : picture.layerOrder === 'front' ? 5000 : picture.layerOrder === 'back' ? 0 : 1000 + index;
          const style = { ...(animate && picture.animation && picture.animation !== 'none' ? studioAnimationStyle(picture) : {}), left: `${picture.x}%`, top: `${picture.y}%`, width: `${picture.w}%`, height: `${picture.h}%`, zIndex };
          return picture.mediaType === 'video'
            ? <video key={`${animationSlideKey}:${picture.id}`} src={picture.src} poster={picture.poster} controls playsInline muted={picture.muted ?? false} className={`absolute object-contain ${animate && picture.animation && picture.animation !== 'none' ? `slide-content-${picture.animation}` : ''}`} style={style} />
            : <img key={`${animationSlideKey}:${picture.id}`} src={picture.src} alt="" loading={deferMedia ? 'lazy' : 'eager'} decoding="async" draggable={false} className={`absolute ${picture.fitToBox ? 'object-fill' : 'object-contain'} ${animate && picture.animation && picture.animation !== 'none' ? `slide-content-${picture.animation}` : ''}`} style={style} />;
        })}
        {slide.design.shapes?.map((shape, index) => <div key={`${animationSlideKey}:${shape.id}`} className={`absolute ${animate && shape.animation && shape.animation !== 'none' ? `slide-content-${shape.animation}` : ''}`} style={{ ...(animate && shape.animation && shape.animation !== 'none' ? studioAnimationStyle(shape) : {}), left: `${shape.x}%`, top: `${shape.y}%`, width: `${shape.w}%`, height: `${shape.h}%`, zIndex: shape.layerOrder ?? 2000 + index, backgroundColor: shape.fill, borderRadius: shape.kind === 'circle' ? '50%' : undefined, clipPath: shape.kind === 'triangle' ? 'polygon(50% 0, 0 100%, 100% 100%)' : shape.kind === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 93%, 50% 72%, 21% 93%, 32% 57%, 2% 35%, 39% 35%)' : shape.kind === 'arrow' ? 'polygon(0 30%, 65% 30%, 65% 0, 100% 50%, 65% 100%, 65% 70%, 0 70%)' : undefined }} />)}
        {boxes.map((box, index) => <ProgramTextBox key={`${animationSlideKey}:${index}`} box={box} defaultLayerOrder={3000 + index} animate={animate} />)}
        {!boxes.length && !!(slide.text || slide.title) && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-[6%] text-center text-white" style={{ fontSize: `clamp(${minRem}rem, ${scale ?? 8}cqw, ${maxRem}rem)` }}><p className="whitespace-pre-line font-bold leading-snug drop-shadow">{slide.text || slide.title}</p>{slide.ref && <p className="absolute bottom-[6%] text-[0.6em] opacity-90">{slide.ref}</p>}</div>}
        {slide.countdown && <CountdownDisplay countdown={slide.countdown} />}
       </div>
      </div>
    );
  }
  return (
    <div
       className={`relative isolate flex h-full w-full flex-col items-center justify-center overflow-hidden bg-linear-to-br p-2 text-center text-white ${backgroundClasses(slide?.bg ?? bg)}`}
      style={backgroundStyle(slide?.bg ?? bg)}
    >
      <SlideBackgroundLayer imageUrl={slide?.bgImage} videoUrl={slide?.bgVideo} posterUrl={slide?.bgImage} opacity={slide?.backgroundOpacity ?? 100} dim={slide ? slide.dim ?? 20 : 0} muted={slide?.bgVideoMuted ?? true} imageFit={slide?.bgImageFit} seamless={seamlessBackground} eager={!deferMedia} />
      {slide?.countdown && <CountdownDisplay countdown={slide.countdown} />}
      {slide && scale && (
        <div className="relative z-10" style={{ fontSize: `clamp(${minRem}rem, ${scale}cqw, ${maxRem}rem)`, color: slide.textColor ?? '#fff' }}>
          <p className="whitespace-pre-line font-bold leading-snug drop-shadow">{slide.text}</p>
          {slide.ref && <p className="mt-1 text-[0.6em] opacity-90">{slide.ref}</p>}
        </div>
      )}
    </div>
  );
}

/** Lightweight slide card: use poster images for video layers so a long deck does not
 * start a video decoder for every thumbnail in Studio. Actual slide/output views still play video. */
const StudioSlideThumbnail = memo(function StudioSlideThumbnail({ bg, slide, mediaUrls, scale = 8, minRem = 0.5 }: {
  bg: string;
  slide?: StudioSlide;
  mediaUrls: StudioMediaUrlMap;
  scale?: number;
  minRem?: number;
}) {
  if (!slide) return <SlideView bg={bg} slide={slide} scale={scale} minRem={minRem} deferMedia />;
  const restoredSlide = restoreImportedSlideForStudio(slide, mediaUrls);
  const background = restoredSlide.bgAssetId ? mediaUrls[restoredSlide.bgAssetId] : undefined;
  const hasVideo = background?.type === 'video' || !!restoredSlide.bgVideo
    || (restoredSlide.design?.pictures ?? []).some((picture) => picture.mediaType === 'video');
  const pictures = restoredSlide.design?.pictures?.flatMap((picture) => {
    if (picture.mediaType !== 'video') return [picture];
    const poster = picture.assetId ? mediaUrls[picture.assetId]?.thumbnailUrl : undefined;
    return poster ? [{ ...picture, src: poster, mediaType: 'image' as const }] : [];
  });
  const thumbnailSlide: StudioSlide = {
    ...restoredSlide,
    bgImage: background?.type === 'video' ? background.thumbnailUrl : background?.type === 'image' ? background.url : restoredSlide.bgImage,
    bgVideo: undefined,
    design: restoredSlide.design ? { ...restoredSlide.design, pictures } : restoredSlide.design,
  };
  return <div className="relative h-full w-full">
    <SlideView bg={bg} slide={thumbnailSlide} scale={scale} minRem={minRem} deferMedia />
    {hasVideo && <span className="absolute bottom-1 right-1 z-20 rounded bg-black/70 p-1 text-white/90" aria-label="Contains video"><Play size={10} /></span>}
  </div>;
});

function ScriptureDesignModal({
  reference,
  verses,
  initialStyle,
  editing = false,
  onClose,
  onAdd,
}: {
  reference: string;
  verses: SelectedScriptureVerse[];
  initialStyle?: SongStyle;
  editing?: boolean;
  onClose: () => void;
  onAdd: (style: SongStyle, verses: SelectedScriptureVerse[]) => void;
}) {
  const [style, setStyle] = useState<SongStyle>(() => ({ ...(initialStyle ?? loadSongSlideSettings()), titleSlide: false }));
  const [editedVerses, setEditedVerses] = useState(verses);
  const song = useMemo(() => ({
    title: reference,
    author: '',
    copyright: '',
    lyrics: editedVerses.map((verse) => `${verse.reference}\n${verse.text}`).join('\n\n'),
  }), [reference, editedVerses]);
  const updateVerseText = useCallback(({ index, text }: { index: number; text: string }) => setEditedVerses((current) => current.map((verse, verseIndex) => {
    if (verseIndex !== index) return verse;
    const [typedReference, ...verseLines] = text.split('\n');
    return { ...verse, reference: typedReference.trim() || verse.reference, text: verseLines.join('\n').replace(/\s+$/, '') };
  })), []);
  const updateScriptureStyle = useCallback((patch: Partial<SongStyle>) => setStyle((current) => ({ ...current, ...patch })), []);
  useEffect(() => registerModalEscape(onClose), [onClose]);

  return createPortal(
     <div className="fixed inset-0 z-1100 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="scripture-design-title" className="flex h-[min(900px,94vh)] w-full max-w-[1440px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101d2a] shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div><h2 id="scripture-design-title" className="text-base font-bold text-white">Design Scripture slides</h2><p className="mt-0.5 text-xs text-warm-white/50">{reference} · {verses.length} verses, one slide per verse</p></div>
          <button type="button" onClick={onClose} aria-label="Back to Scripture selection" className="rounded-lg p-2 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
        </header>
        <SongScriptureDesignPanel
          song={song}
          style={style}
          ownDesign
          designLabel="scripture passage"
          showDefaultActions={false}
          rememberStyle
          fixedVerseSlides
          fixedVerseTexts={editedVerses}
          onTextChange={updateVerseText}
          onChange={updateScriptureStyle}
          onUseDefault={() => undefined}
          onMakeDefault={() => undefined}
        />
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/70 hover:bg-white/5">{editing ? 'Cancel' : 'Back to Scripture'}</button>
          <button type="button" onClick={() => onAdd(style, editedVerses)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110">{editing ? 'Save design' : `Add ${editedVerses.length} slides to scene`}</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function SourcePreview({
  source,
  media,
  slide,
  bg,
  showLabel = true,
  className = 'aspect-video',
  rounded = true,
}: {
  source: Source;
  media?: { type: 'image' | 'video'; url: string };
  slide: StudioSlide;
  bg: string;
  showLabel?: boolean;
  className?: string;
  rounded?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (videoRef.current && source.stream) videoRef.current.srcObject = source.stream;
  }, [source.stream]);
  const cameraRotation = cameraRotationFor(source, videoSize.width, videoSize.height);
  const rotateCameraFrame = cameraRotation === 90 || cameraRotation === 270;

  return (
    <div className={`relative h-full w-full overflow-hidden ${rounded ? 'rounded-lg' : ''} bg-slate-950 ${className}`} style={{ containerType: 'size' }}>
      {(source.kind === 'camera' || source.kind === 'mobile-camera' || source.kind === 'screen') && source.stream?.getVideoTracks().length ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onLoadedMetadata={(event) => setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
          onResize={(event) => setVideoSize({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
          className="h-full w-full object-cover"
          style={cameraRotation === 180 ? { transform: 'rotate(180deg)' } : rotateCameraFrame ? {
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '100cqh',
            height: '100cqw',
            transform: `translate(-50%, -50%) rotate(${cameraRotation === 270 ? -90 : 90}deg)`,
          } : undefined}
        />
      ) : source.kind === 'media' && media?.type === 'video' ? (
        <video src={media.url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
      ) : source.kind === 'media' && media?.type === 'image' ? (
        <img src={media.url} alt={source.name} className="h-full w-full object-cover" />
      ) : source.kind === 'presentation' ? (
        <div data-program-slide-view className="h-full w-full"><SlideView bg={bg} slide={slide} scale={8} minRem={0.5} animate /></div>
      ) : source.kind === 'text' ? (
         <div className="flex h-full items-center justify-center bg-linear-to-br from-slate-800 to-slate-950 p-3 text-center text-sm font-semibold text-white">{source.text || 'Text overlay'}</div>
      ) : (
         <div className="flex h-full flex-col items-center justify-center gap-1 bg-linear-to-br from-slate-800 to-slate-950 text-xs text-warm-white/65">
          {source.kind === 'media' ? <Image size={18} /> : source.kind === 'camera' || source.kind === 'mobile-camera' ? <Camera size={18} /> : <Monitor size={18} />}
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
  description = 'Live input level after the volume control',
}: {
  stream?: MediaStream;
  db: number;
  muted: boolean;
  enabled: boolean;
  onLevel: (level: number) => void;
  description?: string;
}) {
  const studioVisible = useContext(StudioVisibilityContext);
  const [level, setLevel] = useState(0);
  const [contextState, setContextState] = useState<AudioContextState | 'unavailable'>('closed');
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;

  useEffect(() => {
    if (!enabled || !studioVisible) {
      setLevel(0);
      setContextState('closed');
      onLevelRef.current(0);
      return;
    }
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
    let lastReport = 0;
    const readLevel = (time: number) => {
      analyser.getFloatTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) total += sample * sample;
      const rms = Math.sqrt(total / samples.length);
      if (time - lastUpdate >= 100) {
        const visibleLevel = rms;
        setLevel(visibleLevel);
        lastUpdate = time;
      }
      if (time - lastReport >= 400) {
        onLevelRef.current(rms);
        lastReport = time;
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
  }, [stream, enabled, studioVisible]);

  useEffect(() => {
    const gain = gainRef.current;
    if (!gain) return;
    const target = muted || !enabled ? 0 : channelGain(db);
    gain.gain.setTargetAtTime(target, gain.context.currentTime, 0.02);
  }, [db, muted, enabled, stream]);

  const active = level > 0.002;
  const hasAudio = !!stream?.getAudioTracks().some((track) => track.readyState === 'live');
  const status = !hasAudio ? 'Disconnected' : muted || !enabled ? 'Muted' : contextState === 'suspended' ? 'Click to enable' : contextState === 'unavailable' ? 'Unavailable' : active ? 'Signal' : 'No signal';
  const dbLevel = level > 0 ? Math.max(0, Math.min(100, ((20 * Math.log10(level) + 60) / 60) * 100)) : 0;
  return (
    <button type="button" disabled={!stream || contextState !== 'suspended'} onClick={() => { void contextRef.current?.resume().then(() => setContextState(contextRef.current?.state ?? 'running')); }} className="mt-1 flex w-full items-center gap-1.5 text-left disabled:cursor-default" title={description}>
       <span className="w-18 shrink-0 truncate text-[9px] text-warm-white/50">{status}</span>
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

type MonitorOption = { id: number; name: string; primary: boolean };

/**
 * Compact multi-monitor chooser. It stays one button wide however many monitors are
 * connected; the checklist opens in a floating layer so the Program panel never stretches.
 */
function MonitorPicker({ displays, selectedIds, liveIds, onToggle, onSetAll }: {
  displays: MonitorOption[];
  selectedIds: number[];
  liveIds: number[];
  onToggle: (id: number) => void;
  onSetAll: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 260);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      setPosition({ top: rect.bottom + 6, left, width });
    };
    place();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selected = displays.filter((display) => selectedIds.includes(display.id));
  const liveCount = displays.filter((display) => liveIds.includes(display.id)).length;
  const summary = !displays.length ? 'No monitors found'
    : !selected.length ? 'Choose monitors'
    : selected.length <= 2 ? selected.map((display) => display.name.replace(' (Primary)', '')).join(', ')
    : `${selected.length} monitors`;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose output monitors"
        disabled={!displays.length}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-slate-950 px-2.5 text-left text-[11px] text-warm-white outline-none transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-40 ${open ? 'border-brand' : 'border-white/15'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected.length ? '' : 'text-warm-white/50'}`}>{summary}</span>
        {liveCount > 0 && <span className="flex shrink-0 items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{liveCount} live</span>}
        <ChevronDown size={13} className={`shrink-0 text-warm-white/50 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && position && createPortal(
        <div
          ref={popover}
          role="listbox"
          aria-multiselectable="true"
          aria-label="Output monitors"
          style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
           className="z-200 overflow-hidden rounded-xl border border-white/10 bg-panel shadow-2xl shadow-black/50"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-warm-white/50">Show output on</span>
            <div className="flex items-center gap-2 text-[10px] font-semibold">
              <button type="button" onClick={() => onSetAll(displays.map((display) => display.id))} className="text-brand hover:underline">All</button>
              <span className="text-white/20">·</span>
              <button type="button" onClick={() => onSetAll([])} className="text-warm-white/60 hover:text-warm-white hover:underline">None</button>
            </div>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1">
            {displays.map((display) => {
              const checked = selectedIds.includes(display.id);
              const live = liveIds.includes(display.id);
              return (
                <li key={display.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => onToggle(display.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs transition ${checked ? 'bg-brand/10 text-white' : 'text-warm-white/70 hover:bg-white/5'}`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand bg-brand text-white' : 'border-white/25'}`}>{checked && <Check size={11} strokeWidth={3} />}</span>
                    <Monitor size={14} className="shrink-0 text-warm-white/40" />
                    <span className="min-w-0 flex-1 truncate">{display.name.replace(' (Primary)', '')}</span>
                    {display.primary && <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-warm-white/50">Primary</span>}
                    {live && <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Live</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-white/10 px-3 py-2 text-[10px] text-warm-white/40">Then press <span className="font-semibold text-warm-white/60">Show slides</span> to apply.</p>
        </div>,
        document.body,
      )}
    </>
  );
}

const selectClass =
  'rounded-lg border border-white/10 bg-navy px-3 py-1.5 text-sm text-warm-white outline-none focus:border-brand';

const exportedMediaCache = new Map<string, Promise<string | null>>();
const exportSafeMediaUrl = (url: string) => {
  if (!url || url.startsWith('data:')) return Promise.resolve(url || null);
  const cached = exportedMediaCache.get(url);
  if (cached) {
    exportedMediaCache.delete(url);
    exportedMediaCache.set(url, cached);
    return cached;
  }
  const result = fetch(url, { mode: 'cors' }).then(async (response) => {
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Media could not be embedded.'));
      reader.onerror = () => reject(reader.error ?? new Error('Media could not be embedded.'));
      reader.readAsDataURL(blob);
    });
  }).catch(() => null);
  exportedMediaCache.set(url, result);
  if (exportedMediaCache.size > 16) exportedMediaCache.delete(exportedMediaCache.keys().next().value!);
  return result;
};

type ProgramLayer = { source: Source; layout: NonNullable<Source['layout']> };
type ProgramMediaUrls = Record<string, { type: 'image' | 'video'; url: string; thumbnailUrl?: string }>;
type ProgramTransition = { kind: 'Fade' | 'Slide' | 'Wipe' | 'Zoom' | 'Cut'; startedAt: number; duration: number; from: StudioSlide; fromBg: string; to: StudioSlide; toBg: string };
const safeStreamImages = new Map<string, Promise<HTMLImageElement | null>>();
const safeStreamVideos = new Map<string, Promise<HTMLVideoElement | null>>();
type StreamVideoLoop = { front: HTMLVideoElement; back: HTMLVideoElement; fadeStart: number | null; duration: number; swapping: boolean; callback?: number; timer?: number };
const seamlessStreamLoops = new WeakMap<HTMLVideoElement, StreamVideoLoop>();
const startSeamlessStreamLoop = (video: HTMLVideoElement) => {
  if (seamlessStreamLoops.has(video)) return;
  const back = document.createElement('video');
  back.crossOrigin = 'anonymous'; back.muted = true; back.playsInline = true; back.preload = 'auto'; back.src = video.currentSrc || video.src; back.load();
  const loop: StreamVideoLoop = { front: video, back, fadeStart: null, duration: 1500, swapping: false };
  seamlessStreamLoops.set(video, loop);
  video.loop = false;
  const frameVideo = (target: HTMLVideoElement) => target as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number };
  const schedule = () => {
    const current = loop.front;
    const requestFrame = frameVideo(current).requestVideoFrameCallback;
    const advance = () => {
      const remaining = loop.front.duration - loop.front.currentTime;
      if (!loop.swapping && loop.fadeStart === null && loop.front.duration > loop.duration / 1000 + 0.25 && remaining <= loop.duration / 1000 + 0.15) {
        loop.swapping = true;
        loop.back.pause(); loop.back.currentTime = 0;
        void loop.back.play().then(() => {
          const reveal = () => { loop.fadeStart = performance.now(); schedule(); };
          const requestBackFrame = frameVideo(loop.back).requestVideoFrameCallback;
          if (requestBackFrame) requestBackFrame.call(loop.back, reveal); else window.setTimeout(reveal, 40);
        }).catch(() => {
          loop.front.currentTime = 0;
          void loop.front.play().catch(() => undefined);
          loop.swapping = false;
        });
        return;
      }
      if (loop.fadeStart !== null && performance.now() - loop.fadeStart >= loop.duration) {
        const previous = loop.front;
        loop.front = loop.back; loop.back = previous;
        loop.fadeStart = null; loop.swapping = false;
        previous.pause(); previous.currentTime = 0;
      }
      schedule();
    };
    if (requestFrame) loop.callback = requestFrame.call(current, advance);
    else loop.timer = window.setTimeout(advance, 40);
  };
  schedule();
};
const drawSeamlessStreamVideo = (ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, width: number, height: number) => {
  const loop = seamlessStreamLoops.get(video);
  if (!loop || loop.fadeStart === null) { ctx.drawImage(loop?.front ?? video, x, y, width, height); return; }
  const progress = Math.min(1, Math.max(0, (performance.now() - loop.fadeStart) / loop.duration));
  if (progress >= 1) {
    const previous = loop.front; loop.front = loop.back; loop.back = previous;
    loop.fadeStart = null; loop.swapping = false;
    previous.pause(); previous.currentTime = 0;
    ctx.drawImage(loop.front, x, y, width, height);
    return;
  }
  ctx.save(); const opacity = ctx.globalAlpha; ctx.globalAlpha = opacity * (1 - progress); ctx.drawImage(loop.front, x, y, width, height);
  ctx.globalAlpha = opacity * progress; ctx.drawImage(loop.back, x, y, width, height); ctx.restore();
};
const loadSafeStreamImage = (url: string) => {
  let pending = safeStreamImages.get(url);
  if (!pending) {
    pending = exportSafeMediaUrl(url).then((safeUrl) => new Promise<HTMLImageElement | null>((resolve) => {
      if (!safeUrl) return resolve(null);
      const image = document.createElement('img');
      image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = safeUrl;
    }));
    safeStreamImages.set(url, pending);
    if (safeStreamImages.size > 16) safeStreamImages.delete(safeStreamImages.keys().next().value!);
  }
  return pending;
};
const loadSafeStreamVideo = (url: string) => {
  let pending = safeStreamVideos.get(url);
  if (!pending) {
    pending = exportSafeMediaUrl(url).then((safeUrl) => new Promise<HTMLVideoElement | null>((resolve) => {
      if (!safeUrl) return resolve(null);
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous'; video.muted = true; video.loop = true; video.playsInline = true;
      video.onloadeddata = () => { void video.play().catch(() => undefined); resolve(video); };
      video.onerror = () => resolve(null); video.src = safeUrl; video.load();
    }));
    safeStreamVideos.set(url, pending);
    if (safeStreamVideos.size > 8) safeStreamVideos.delete(safeStreamVideos.keys().next().value!);
  }
  return pending;
};
const streamPalette: Record<string, string> = { black: '#000', white: '#fff', slate: '#475569', gray: '#6b7280', zinc: '#71717a', blue: '#2563eb', indigo: '#4f46e5', sky: '#0284c7', cyan: '#0891b2', teal: '#0f766e', emerald: '#059669', green: '#16a34a', red: '#dc2626', rose: '#e11d48', orange: '#ea580c', amber: '#d97706', yellow: '#ca8a04', purple: '#9333ea', violet: '#7c3aed', pink: '#db2777' };
const streamGradientColor = (bg: string, from: boolean) => {
  const custom = customBackgroundStops(bg);
  if (custom) return from ? custom[0] : custom[1];
  const token = bg.split(/\s+/).find((part) => part.startsWith(from ? 'from-' : 'to-')) ?? '';
  return streamPalette[token.slice(from ? 5 : 3).split('-')[0]] ?? '#111827';
};
const streamTextLines = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => streamTextRows(context, text, maxWidth).map((row) => row.text);
/** Wraps text into lines; `last` marks the final line of a paragraph (justify leaves that one unstretched). */
const streamTextRows = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const rows: { text: string; last: boolean; paragraph: number }[] = [];
  for (const [paragraphIndex, paragraph] of text.split('\n').entries()) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) { rows.push({ text: line, last: false, paragraph: paragraphIndex }); line = word; } else line = next;
    }
    rows.push({ text: line, last: true, paragraph: paragraphIndex });
  }
  return rows;
};
/** Draws one line stretched to the full width by spreading the gaps between words. */
const fillJustifiedLine = (context: CanvasRenderingContext2D, line: string, x: number, y: number, width: number) => {
  const words = line.split(' ').filter(Boolean);
  const wordsWidth = words.reduce((total, word) => total + context.measureText(word).width, 0);
  if (words.length < 2 || wordsWidth >= width) { context.fillText(line, x, y, width); return; }
  const gap = (width - wordsWidth) / (words.length - 1);
  let cursor = x;
  for (const word of words) { context.fillText(word, cursor, y); cursor += context.measureText(word).width + gap; }
};
const paintProgramSlide = async (ctx: CanvasRenderingContext2D, slide: StudioSlide, bg: string, w: number, h: number, assets: ProgramMediaUrls, fontScale: number, animationElapsed = Number.POSITIVE_INFINITY) => {
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, streamGradientColor(slide.bg ?? bg, true)); gradient.addColorStop(1, streamGradientColor(slide.bg ?? bg, false));
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  const bgAsset = slide.bgAssetId ? assets[slide.bgAssetId] : undefined;
  ctx.save();
  ctx.globalAlpha *= (slide.backgroundOpacity ?? 100) / 100;
  if (bgAsset?.type === 'video' || slide.bgVideo) {
    const poster = bgAsset?.thumbnailUrl ?? slide.bgImage;
    if (poster) {
      const image = await loadSafeStreamImage(poster);
      if (image) ctx.drawImage(image, 0, 0, w, h);
    }
    const video = await loadSafeStreamVideo(bgAsset?.type === 'video' ? bgAsset.url : slide.bgVideo!);
    if (video?.readyState && video.videoWidth) { startSeamlessStreamLoop(video); drawSeamlessStreamVideo(ctx, video, 0, 0, w, h); }
  } else if (bgAsset?.url ?? slide.bgImage) {
    const bgUrl = bgAsset?.url ?? slide.bgImage!;
    const image = await loadSafeStreamImage(bgUrl);
    if (image) ctx.drawImage(image, 0, 0, w, h);
  }
  ctx.restore();
  if (slide.dim) { ctx.fillStyle = `rgba(0,0,0,${slide.dim / 100})`; ctx.fillRect(0, 0, w, h); }
  if (slide.design) {
    const pictures = slide.design.pictures ?? [];
    const shapes = slide.design.shapes ?? [];
    const boxes = [slide.design.box, ...(slide.design.extraBoxes ?? []).map((item) => item.box)].filter((box): box is PresentationTextBox => !!box);
    const ordered = [
      ...pictures.map((item, index) => ({ order: typeof item.layerOrder === 'number' ? item.layerOrder : item.layerOrder === 'front' ? 5000 : item.layerOrder === 'back' ? 0 : 1000 + index, type: 'picture' as const, index })),
      ...shapes.map((item, index) => ({ order: item.layerOrder ?? 2000 + index, type: 'shape' as const, index })),
      ...boxes.map((item, index) => ({ order: typeof item.layerOrder === 'number' ? item.layerOrder : item.layerOrder === 'front' ? 5000 : item.layerOrder === 'back' ? 0 : 3000 + index, type: 'box' as const, index })),
    ].sort((a, b) => a.order - b.order);
    for (const layer of ordered) {
      ctx.save();
      try {
      const item = layer.type === 'picture' ? pictures[layer.index] : layer.type === 'shape' ? shapes[layer.index] : boxes[layer.index];
      const animation = item?.animation ?? 'none';
      const duration = Math.max(150, item?.animationDuration ?? (animation === 'typewriter' ? 1500 : 700));
      const rawProgress = animation === 'none' ? 1 : Math.min(1, Math.max(0, (animationElapsed - (item?.animationDelay ?? 0)) / duration));
      const progress = item?.animationEasing === 'linear' ? rawProgress : item?.animationEasing === 'snappy' ? 1 - (1 - rawProgress) ** 3 : rawProgress * rawProgress * (3 - 2 * rawProgress);
      const ix = (item?.x ?? 0) / 100 * w; const iy = (item?.y ?? 0) / 100 * h; const iw = (item?.w ?? 0) / 100 * w; const ih = (item?.h ?? 0) / 100 * h;
      if (animation !== 'none') {
        ctx.globalAlpha *= progress;
        if (animation === 'rise') ctx.translate(0, (1 - progress) * ih * .18);
        if (animation === 'drift') ctx.translate(0, (1 - progress) * ih * .14);
        if (animation === 'slide-left') ctx.translate(-(1 - progress) * iw, 0);
        if (animation === 'slide-right') ctx.translate((1 - progress) * iw, 0);
        if (animation === 'slide-up') ctx.translate(0, (1 - progress) * ih);
        if (animation === 'slide-down') ctx.translate(0, -(1 - progress) * ih);
        if (animation === 'pop' || animation === 'zoom' || animation === 'bounce' || animation === 'spin') {
          const scale = animation === 'zoom' ? .25 + progress * .75 : animation === 'bounce' ? .72 + progress * .28 + Math.sin(progress * Math.PI * 3) * .12 * (1 - progress) : .78 + progress * .22;
          ctx.translate(ix + iw / 2, iy + ih / 2);
          if (animation === 'spin') ctx.rotate((1 - progress) * -Math.PI * 2);
          ctx.scale(scale, scale);
          ctx.translate(-(ix + iw / 2), -(iy + ih / 2));
        }
        if (animation === 'blur') ctx.filter = `blur(${(1 - progress) * 14}px)`;
        if (animation === 'typewriter') { ctx.beginPath(); ctx.rect(ix, iy, iw * progress, ih); ctx.clip(); }
      }
      if (animation !== 'none' && progress <= 0) continue;
      if (layer.type === 'picture') {
        const picture = pictures[layer.index]; if (!picture) continue;
        const x = picture.x / 100 * w; const y = picture.y / 100 * h; const pw = picture.w / 100 * w; const ph = picture.h / 100 * h;
        if (picture.mediaType === 'video') {
          const url = picture.assetId ? assets[picture.assetId]?.url : picture.src;
          const posterUrl = picture.poster ?? (picture.assetId ? assets[picture.assetId]?.thumbnailUrl : undefined);
          if (posterUrl) { const poster = await loadSafeStreamImage(posterUrl); if (poster) ctx.drawImage(poster, x, y, pw, ph); }
          if (url) { const video = await loadSafeStreamVideo(url); if (video?.readyState && video.videoWidth) ctx.drawImage(video, x, y, pw, ph); }
        } else {
          const url = picture.assetId ? assets[picture.assetId]?.url : picture.src;
          if (url) { const image = await loadSafeStreamImage(url); if (image) ctx.drawImage(image, x, y, pw, ph); }
        }
      } else if (layer.type === 'shape') {
        const shape = shapes[layer.index]; if (!shape) continue;
        const x = shape.x / 100 * w; const y = shape.y / 100 * h; const sw = shape.w / 100 * w; const sh = shape.h / 100 * h;
        ctx.fillStyle = shape.fill; ctx.beginPath();
        if (shape.kind === 'circle') ctx.ellipse(x + sw / 2, y + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
        else if (shape.kind === 'triangle') { ctx.moveTo(x + sw / 2, y); ctx.lineTo(x + sw, y + sh); ctx.lineTo(x, y + sh); ctx.closePath(); }
        else if (shape.kind === 'arrow') { ctx.moveTo(x, y + sh * .3); ctx.lineTo(x + sw * .65, y + sh * .3); ctx.lineTo(x + sw * .65, y); ctx.lineTo(x + sw, y + sh / 2); ctx.lineTo(x + sw * .65, y + sh); ctx.lineTo(x + sw * .65, y + sh * .7); ctx.lineTo(x, y + sh * .7); ctx.closePath(); }
        else ctx.rect(x, y, sw, sh); ctx.fill();
      } else {
        const box = boxes[layer.index]; if (!box) continue;
        const x = box.x / 100 * w; const y = box.y / 100 * h; const bw = box.w / 100 * w; const bh = box.h / 100 * h;
        if (box.boxBgOn) { ctx.fillStyle = box.boxBg; ctx.fillRect(x, y, bw, bh); }
        let size = box.size / 1280 * w; const font = () => `${box.italic ? 'italic ' : ''}${box.bold ? '800' : '500'} ${size}px "${box.font.replaceAll('"', '')}", sans-serif`;
        const boxText = box.uppercase ? box.text.toLocaleUpperCase() : box.text;
        ctx.font = font(); let rows = streamTextRows(ctx, boxText, bw); let lineHeight = box.lineHeight * size;
        if (box.autoSize && rows.length * lineHeight > bh) {
          size *= bh / (rows.length * lineHeight);
          ctx.font = font();
          rows = streamTextRows(ctx, boxText, bw);
          lineHeight = box.lineHeight * size;
        }
        ctx.textBaseline = 'middle'; ctx.fillStyle = box.color; ctx.shadowColor = box.shadow ? 'rgba(0,0,0,.65)' : 'transparent'; ctx.shadowBlur = box.shadow ? size * .12 : 0;
        const totalHeight = rows.length * lineHeight;
        const top = box.valign === 'top' ? y : box.valign === 'bottom' ? y + bh - totalHeight : y + (bh - totalHeight) / 2;
        rows.forEach((row, index) => {
          const ly = top + (index + .5) * lineHeight;
          const rowAlign = lineAlignAt(box.align, box.lineAligns, row.paragraph);
          const justify = rowAlign === 'justify';
          ctx.textAlign = justify ? 'left' : rowAlign;
          const tx = rowAlign === 'left' || justify ? x : rowAlign === 'right' ? x + bw : x + bw / 2;
          if (justify && !row.last) fillJustifiedLine(ctx, row.text, x, ly, bw); else ctx.fillText(row.text, tx, ly, bw);
        }); ctx.shadowBlur = 0;
      }
      } finally { ctx.restore(); }
    }
    const countdown = slide.countdown ?? slide.design.countdown;
    if (countdown) paintCountdown(ctx, countdown, w, h);
    if (!boxes.length && (slide.text || slide.title)) {
      const text = slide.text || slide.title || '';
      ctx.fillStyle = slide.textColor ?? '#fff';
      ctx.font = `800 ${Math.max(24, 36 * fontScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.65)';
      ctx.shadowBlur = w * .01;
      const lines = streamTextLines(ctx, text, w * .86);
      const lineHeight = Math.max(24, 36 * fontScale) * 1.2;
      lines.forEach((line, index) => ctx.fillText(line, w / 2, h / 2 - (lines.length - 1) * lineHeight / 2 + index * lineHeight, w * .9));
      ctx.shadowBlur = 0;
      if (slide.ref) {
        ctx.font = `500 ${Math.max(14, 20 * fontScale)}px sans-serif`;
        ctx.fillText(slide.ref, w / 2, h / 2 + lines.length * lineHeight / 2, w * .9);
      }
    }
  } else {
    const text = slide.text || slide.title || '';
    ctx.fillStyle = slide.textColor ?? '#fff'; ctx.font = `800 ${Math.max(24, 36 * fontScale)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = w * .01;
    const lines = streamTextLines(ctx, text, w * .86); const lineHeight = Math.max(24, 36 * fontScale) * 1.2;
    lines.forEach((line, index) => ctx.fillText(line, w / 2, h / 2 - (lines.length - 1) * lineHeight / 2 + index * lineHeight, w * .9)); ctx.shadowBlur = 0;
    if (slide.ref) { ctx.font = `500 ${Math.max(14, 20 * fontScale)}px sans-serif`; ctx.fillText(slide.ref, w / 2, h / 2 + lines.length * lineHeight / 2, w * .9); }
  }
};
const renderProgramFrame = async (canvas: HTMLCanvasElement, stage: HTMLElement, composition: { slide: StudioSlide; bg: string; layers: ProgramLayer[]; mediaUrls: ProgramMediaUrls; transition: ProgramTransition | null; animationStartedAt: number }) => {
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not create the stream render canvas.');
  const w = canvas.width; const h = canvas.height; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const animationElapsed = performance.now() - composition.animationStartedAt;
  const stageWidth = Math.max(1, stage.getBoundingClientRect().width);
  const fontScale = w / stageWidth;
  const paintLayerSlide = async (slide: StudioSlide, bg: string, x: number, y: number, layerWidth: number, layerHeight: number, opacity = 1, offset = 0, layerAnimationElapsed = animationElapsed, reveal = 1, scale = 1) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, layerWidth * reveal, layerHeight); ctx.clip();
    ctx.translate(x + offset, y);
    if (scale !== 1) { ctx.translate(layerWidth / 2, layerHeight / 2); ctx.scale(scale, scale); ctx.translate(-layerWidth / 2, -layerHeight / 2); }
    ctx.globalAlpha *= opacity;
    await paintProgramSlide(ctx, slide, bg, layerWidth, layerHeight, composition.mediaUrls, fontScale * layerWidth / w, layerAnimationElapsed);
    ctx.restore();
  };
  for (const { source, layout } of [...composition.layers].reverse()) {
    const x = layout.x / 100 * w; const y = layout.y / 100 * h; const lw = layout.width / 100 * w; const lh = layout.height / 100 * h;
    const node = stage.querySelector<HTMLElement>(`[data-program-source-id="${source.id}"]`);
    if (source.kind === 'presentation') {
      const transition = composition.transition;
      const progress = transition ? Math.min(1, Math.max(0, (performance.now() - transition.startedAt) / transition.duration)) : 1;
      if (transition && progress < 1 && transition.kind === 'Fade') {
        await paintLayerSlide(transition.from, transition.fromBg, x, y, lw, lh, 1 - progress, 0, Number.POSITIVE_INFINITY);
        await paintLayerSlide(transition.to, transition.toBg, x, y, lw, lh, progress);
      } else if (transition && progress < 1 && transition.kind === 'Slide') {
        await paintLayerSlide(transition.from, transition.fromBg, x, y, lw, lh, 1, -progress * lw, Number.POSITIVE_INFINITY);
        await paintLayerSlide(transition.to, transition.toBg, x, y, lw, lh, 1, (1 - progress) * lw);
      } else if (transition && progress < 1 && transition.kind === 'Wipe') {
        await paintLayerSlide(transition.from, transition.fromBg, x, y, lw, lh, 1, 0, Number.POSITIVE_INFINITY);
        await paintLayerSlide(transition.to, transition.toBg, x, y, lw, lh, 1, 0, animationElapsed, progress);
      } else if (transition && progress < 1 && transition.kind === 'Zoom') {
        await paintLayerSlide(transition.from, transition.fromBg, x, y, lw, lh, 1 - progress, 0, Number.POSITIVE_INFINITY, 1, 1.06 - progress * 0.06);
        await paintLayerSlide(transition.to, transition.toBg, x, y, lw, lh, 1, 0, animationElapsed, 1, 0.94 + progress * 0.06);
      } else {
        await paintLayerSlide(composition.slide, composition.bg, x, y, lw, lh);
      }
    } else if (source.kind === 'camera' || source.kind === 'mobile-camera' || source.kind === 'screen') {
      const video = node?.querySelector('video');
      if (video?.srcObject instanceof MediaStream && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
        try { drawVideoCover(ctx, video, x, y, lw, lh, cameraRotationFor(source, video.videoWidth, video.videoHeight)); } catch { /* Skip an unavailable camera frame. */ }
      }
    } else if (source.kind === 'media') {
      const asset = source.mediaAssetId ? composition.mediaUrls[source.mediaAssetId] : undefined;
      if (asset?.type === 'video') {
        const video = await loadSafeStreamVideo(asset.url); if (video?.readyState && video.videoWidth) ctx.drawImage(video, x, y, lw, lh);
      } else if (asset?.url) {
        const image = await loadSafeStreamImage(asset.url); if (image) ctx.drawImage(image, x, y, lw, lh);
      }
    } else if (source.kind === 'text') {
      const text = source.text || 'Text overlay'; const nodeStyle = node ? getComputedStyle(node) : null;
      ctx.fillStyle = nodeStyle?.color ?? '#fff'; ctx.font = `700 ${Math.max(14, 14 * fontScale)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lines = streamTextLines(ctx, text, lw * .92); const lineHeight = Math.max(14, 14 * fontScale) * 1.25;
      lines.forEach((line, index) => ctx.fillText(line, x + lw / 2, y + lh / 2 - (lines.length - 1) * lineHeight / 2 + index * lineHeight, lw * .92));
    }
  }
  // A slightly lower JPEG quality keeps the renderer-to-FFmpeg frame pipe light;
  // the final stream quality is still controlled by the selected video bitrate.
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not encode the stream frame.')), 'image/jpeg', 0.92));
  return blob.arrayBuffer();
};

/* ---------- Page ---------- */

export default function Studio() {
  const [scenes, setScenes] = useState<Scene[]>(loadStudioScenes);
  const [slideshowScenes, setSlideshowScenes] = useState<Scene[]>(loadSlideshowScenes);
  const [sceneSnapshotsReady, setSceneSnapshotsReady] = useState(false);
  const [savedPresentations, setSavedPresentations] = useState<SavedPresentation[]>(readSavedPresentations);
  const savedPresentationsRef = useRef(savedPresentations);
  const savedPresentationSignaturesRef = useRef(new Map<string, string>());
  const syncedScenePresentationSignaturesRef = useRef(new Map<number, string>());

  useEffect(() => {
    let active = true;
    const restoreSnapshots = async () => {
      try {
        const [streamSnapshot, slideshowSnapshot] = await Promise.all([
          readStudioSceneSnapshot(STUDIO_SCENES_KEY),
          readStudioSceneSnapshot(STUDIO_SLIDESHOW_SCENES_KEY),
        ]);
        if (!active) return;
        const chooseSnapshot = (key: string, snapshot: StoredStudioSceneSnapshot | undefined, fallback: Scene[]) => {
          const localSavedAt = Number(localStorage.getItem(studioSceneSnapshotTimestampKey(key))) || 0;
          // Prefer the database on a timestamp tie: localStorage may have rejected an
          // oversized scene even though the small timestamp update succeeded.
          if (!snapshot || !Array.isArray(snapshot.scenes) || snapshot.savedAt < localSavedAt) return fallback;
          return upgradeScriptureScenes(snapshot.scenes.filter((scene) => Number.isFinite(scene?.id) && scene.name && scene.bg && Array.isArray(scene.slides)));
        };
        const streamScenes = chooseSnapshot(STUDIO_SCENES_KEY, streamSnapshot, loadStudioScenes());
        const offlineScenes = chooseSnapshot(STUDIO_SLIDESHOW_SCENES_KEY, slideshowSnapshot, loadSlideshowScenes());
        setScenes(streamScenes);
        setSlideshowScenes(offlineScenes);
        // Migrate existing local scene snapshots to IndexedDB on first use.
        if (!streamSnapshot) persistScenesImmediately(streamScenes, STUDIO_SCENES_KEY);
        if (!slideshowSnapshot) persistScenesImmediately(offlineScenes, STUDIO_SLIDESHOW_SCENES_KEY);
      } catch {
        // The existing localStorage snapshot remains available if IndexedDB cannot be opened.
      } finally {
        if (active) setSceneSnapshotsReady(true);
      }
    };
    void restoreSnapshots();
    return () => { active = false; };
  }, []);
  const rememberSavedPresentations = (presentations: SavedPresentation[]) => {
    const previousSize = savedPresentationSignaturesRef.current.size;
    const nextSignatures = new Map(presentations.map((item) => [item.id, `${item.updatedAt ?? 0}:${item.name}:${item.slides.length}:${item.locked ? 1 : 0}`]));
    const changedIds = new Set<string>();
    for (const [id, signature] of nextSignatures) {
      if (savedPresentationSignaturesRef.current.get(id) !== signature) changedIds.add(id);
    }
    savedPresentationsRef.current = presentations;
    savedPresentationSignaturesRef.current = nextSignatures;
    if (changedIds.size || nextSignatures.size !== previousSize) setSavedPresentations(presentations);
    return changedIds;
  };
  const [mediaUrls, setMediaUrls] = useState<StudioMediaUrlMap>({});
  const mediaUrlsRef = useRef(mediaUrls);
  const backgroundThumbnailRequestKey = useMemo(() => [...new Set([
    ...presentationBackgroundIds(savedPresentations),
    ...[...scenes, ...slideshowScenes].flatMap((scene) => scene.slides.map((slide) => slide.bgAssetId)
      .filter((id): id is string => typeof id === 'string' && id.startsWith('folder-default-'))),
  ])].sort().join('|'), [savedPresentations, scenes, slideshowScenes]);
  const [addSceneOpen, setAddSceneOpen] = useState(false);
  const [scripturePickerOpen, setScripturePickerOpen] = useState(false);
  const [pendingScriptureDesign, setPendingScriptureDesign] = useState<{ reference: string; verses: SelectedScriptureVerse[] } | null>(null);
  const [editingScriptureSceneId, setEditingScriptureSceneId] = useState<number | null>(null);
  const [editingStudioSong, setEditingStudioSong] = useState<Song | null>(null);
  const [studioSongBooks, setStudioSongBooks] = useState<Songbook[]>([]);
  const [selectedPresentationId, setSelectedPresentationId] = useState('');
  // The Add scene window offers presentations or songs from the songbooks.
  const [addSceneKind, setAddSceneKind] = useState<'presentation' | 'song'>('presentation');
  const [addSceneSongs, setAddSceneSongs] = useState<Song[]>([]);
  const [addSceneSongQuery, setAddSceneSongQuery] = useState('');
  const [selectedSongId, setSelectedSongId] = useState('');
  const [sceneToDelete, setSceneToDelete] = useState<Scene | null>(null);
  const [sceneDeleteTab, setSceneDeleteTab] = useState<'stream' | 'slideshow'>('stream');
  const [clearScenesTab, setClearScenesTab] = useState<'stream' | 'slideshow' | null>(null);
  const [addSceneTab, setAddSceneTab] = useState<'stream' | 'slideshow'>('stream');
  const [sceneId, setSceneId] = useState(() => scenes[0]?.id ?? 0); // scene whose slides are listed (Scenes panel)
  const [sidebarPanel, setSidebarPanel] = useState<'scenes' | 'music'>(() => localStorage.getItem(getAccountStorageKey(STUDIO_SIDEBAR_PANEL_KEY)) === 'music' ? 'music' : 'scenes');
  const [musicView, setMusicView] = useState<'songs' | 'tracks'>(() => localStorage.getItem(getAccountStorageKey(STUDIO_MUSIC_VIEW_KEY)) === 'tracks' ? 'tracks' : 'songs');
  const [selected, setSelected] = useState<Ref>(() => ({ sceneId: scenes[0]?.id ?? 0, slideIdx: 0 }));
  const slideCardRefs = useRef(new Map<string, HTMLDivElement>());
  const [preview, setPreview] = useState<Ref>(() => ({ sceneId: scenes[0]?.id ?? 0, slideIdx: 0 }));
  const [onAir, setOnAir] = useState<Ref>(() => ({ sceneId: scenes[0]?.id ?? 0, slideIdx: 0 }));
  const [quickShowLiveSlides, setQuickShowLiveSlides] = useState(() => localStorage.getItem(STUDIO_QUICK_SHOW_SLIDES_KEY) === 'true');

  // Scene snapshots can arrive from IndexedDB after the first render. Reconcile every
  // active reference as soon as those scenes arrive so outputs never stay on scene 0.
  useEffect(() => {
    if (!scenes.length) {
      if (sceneId !== 0) setSceneId(0);
      return;
    }
    const fallback = scenes[0];
    const selectedScene = scenes.find((item) => item.id === sceneId) ?? fallback;
    if (selectedScene.id !== sceneId) setSceneId(selectedScene.id);
    const normalize = (reference: Ref): Ref => {
      const targetScene = scenes.find((item) => item.id === reference.sceneId) ?? fallback;
      if (targetScene.id !== reference.sceneId) return { sceneId: targetScene.id, slideIdx: 0 };
      return { sceneId: targetScene.id, slideIdx: Math.min(Math.max(0, reference.slideIdx), Math.max(0, targetScene.slides.length - 1)) };
    };
    setSelected((current) => normalize(current));
    setPreview((current) => normalize(current));
    setOnAir((current) => normalize(current));
  }, [scenes, sceneId]);

  const [transitionEnabled, setTransitionEnabled] = useState(() => localStorage.getItem('faithstream.studio-transition-enabled') !== 'false');
  const transitionOptions = ['Fade', 'Slide', 'Wipe', 'Zoom', 'Cut'] as const;
  type TransitionStyle = typeof transitionOptions[number];
  const [transition, setTransition] = useState<TransitionStyle>(() => {
    const saved = localStorage.getItem('faithstream.studio-transition');
    return transitionOptions.includes(saved as TransitionStyle) ? saved as TransitionStyle : 'Fade';
  });
  const [duration, setDuration] = useState(() => {
    const saved = Number(localStorage.getItem('faithstream.studio-transition-duration'));
    return Number.isFinite(saved) && saved >= 0.2 && saved <= 2 ? saved : 1;
  });
  const [streamTransition, setStreamTransition] = useState<ProgramTransition | null>(null);
  const previousOnAirTransition = useRef<{ key: string; slide: StudioSlide; bg: string } | null>(null);
  const visualTransitionKey = useRef('');
  const onAirSlideRef = useRef<HTMLDivElement>(null);
  const transitionSettings = useRef({ transition, duration, enabled: transitionEnabled });

  useEffect(() => {
    transitionSettings.current = { transition, duration, enabled: transitionEnabled };
    try {
      localStorage.setItem('faithstream.studio-transition-enabled', String(transitionEnabled));
      localStorage.setItem('faithstream.studio-transition', transition);
      localStorage.setItem('faithstream.studio-transition-duration', String(duration));
    } catch { /* Keep transition controls usable if local storage is unavailable. */ }
  }, [transition, duration, transitionEnabled]);

  useEffect(() => {
    const key = `${onAir.sceneId}:${onAir.slideIdx}`;
    if (visualTransitionKey.current === key) return;
    visualTransitionKey.current = key;
    const elements = Array.from(onAirSlideRef.current?.querySelectorAll<HTMLElement>('[data-program-slide-view]') ?? []);
    const settings = transitionSettings.current;
    if (!elements.length || !settings.enabled || settings.transition === 'Cut') return;
    const durationMs = settings.duration * 1000;
    const frames: Keyframe[] = settings.transition === 'Slide'
      ? [{ opacity: 0, transform: 'translateX(5%)' }, { opacity: 1, transform: 'translateX(0)' }]
      : settings.transition === 'Wipe'
        ? [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]
        : settings.transition === 'Zoom'
          ? [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }]
          : [{ opacity: 0 }, { opacity: 1 }];
    const animations = elements.map((element) => element.animate(frames, { duration: durationMs, easing: 'ease-out' }));
    return () => animations.forEach((animation) => animation.cancel());
  }, [onAir.sceneId, onAir.slideIdx, transitionEnabled]);

  const [sources, setSources] = useState<Source[]>(loadStudioSources);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const [musicAssets, setMusicAssets] = useState<StudioMusicAssetWithUrl[]>([]);
  const [musicPlaying, setMusicPlaying] = useState<Record<number, boolean>>({});
  const [previewingMusicId, setPreviewingMusicId] = useState<string | null>(null);
  const [addSourceOpen, setAddSourceOpen] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [mobileCamPairing, setMobileCamPairing] = useState<MobileCamPairing | null>(null);
  const [reconnectingSourceId, setReconnectingSourceId] = useState<number | null>(null);
  const [mediaPreparing, setMediaPreparing] = useState('');
  const [audioError, setAudioError] = useState('');
  const [sourceEditor, setSourceEditor] = useState<Source | null>(null);
  const [sourceDraft, setSourceDraft] = useState('');
  const [selectedProgramSource, setSelectedProgramSource] = useState<number | null>(null);
  const [previewSetupLayouts, setPreviewSetupLayouts] = useState<Record<number, NonNullable<Source['layout']>>>({});
  const [previewSetupVisibility, setPreviewSetupVisibility] = useState<Record<number, boolean>>({});
  const [cameraOnlySnapshot, setCameraOnlySnapshot] = useState<{ sceneId: number; sources: { id: number; visible: boolean; layout?: Source['layout'] }[] } | null>(null);
  const programCanvasRef = useRef<HTMLDivElement>(null);
  const streamCompositionRef = useRef<{ slide: StudioSlide; bg: string; layers: ProgramLayer[]; mediaUrls: ProgramMediaUrls; transition: ProgramTransition | null; animationStartedAt: number } | null>(null);
  const streamAnimationStartedAt = useRef(performance.now());
  const streamFrameBusy = useRef(false);
  const previewSetupCanvasRef = useRef<HTMLDivElement>(null);
  const previewSetupDrag = useRef<{ id: number; mode: 'move' | 'resize'; startX: number; startY: number; layout: { x: number; y: number; width: number; height: number } } | null>(null);
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const musicFileRef = useRef<HTMLInputElement>(null);
  const musicElements = useRef(new Map<number, HTMLAudioElement>());
  const musicStreams = useRef(new Map<number, MediaStream>());
  const musicPreviewElement = useRef<HTMLAudioElement | null>(null);
  const sourceStreams = useRef(new Map<number, MediaStream>());
  const sourceCleanups = useRef(new Map<number, () => void>());
  const mobileCamPairingDetails = useRef(new Map<number, Omit<MobileCamPairing, 'connected' | 'reconnecting' | 'remainingSeconds' | 'refreshError'>>());
  const mobileCamPendingSlots = useRef(new Set<MobileCamSlot>());
  const mobileCamCodeRenewalInFlight = useRef(false);
  const lastMobileCamCodeRenewalAttempt = useRef(0);
  const mobileCamConnectedState = useRef(new Map<number, boolean>());
  const sourceObjectUrls = useRef<string[]>([]);
  const sourceMediaReleases = useRef<Array<() => void>>([]);
  const sourceMenuRef = useRef<HTMLDivElement>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);
  const [channels, setChannels] = useState<Channel[]>(() => {
    let saved: { id: number; db?: number; muted?: boolean; pan?: number; compressor?: boolean; compressorThreshold?: number }[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(getAccountStorageKey(STUDIO_AUDIO_CHANNELS_KEY)) ?? '[]');
      if (Array.isArray(parsed)) saved = parsed;
    } catch { /* Use safe mixer defaults if saved settings are invalid. */ }
    return sources
      .filter((source) => source.kind === 'microphone' || source.kind === 'desktop-audio' || source.kind === 'music')
      .map((source) => {
        const prefs = saved.find((channel) => channel.id === source.id);
        return { id: source.id, sceneId: source.sceneId, name: source.name, icon: source.kind === 'microphone' ? Mic : source.kind === 'music' ? Music2 : Volume2, db: prefs?.db ?? -6, muted: prefs?.muted ?? false, pan: prefs?.pan ?? 0, compressor: prefs?.compressor ?? false, compressorThreshold: prefs?.compressorThreshold ?? -18 };
      });
  });
  const [audioLevels, setAudioLevels] = useState<Record<number, number>>({});
  const [audioSettingsChannelId, setAudioSettingsChannelId] = useState<number | null>(null);
  const [microphoneSwitchingId, setMicrophoneSwitchingId] = useState<number | null>(null);

  const [live, setLive] = useState(false);
  const [startingStream, setStartingStream] = useState(false);
  const [recording, setRecording] = useState(false);
  const [goLiveSetupOpen, setGoLiveSetupOpen] = useState(false);
  const [streamResolution, setStreamResolution] = useState(() => localStorage.getItem(STUDIO_RESOLUTION_KEY) || '720p');
  const [streamFrameRate, setStreamFrameRate] = useState(() => localStorage.getItem(STUDIO_FRAME_RATE_KEY) || '30');
  const [streamBitrate, setStreamBitrate] = useState(() => localStorage.getItem(STUDIO_BITRATE_KEY) || '4500');
  const [streamServerUrl, setStreamServerUrl] = useState('');
  const [streamKey, setStreamKey] = useState('');
  const [streamSettingsLoaded, setStreamSettingsLoaded] = useState(false);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [streamStatus, setStreamStatus] = useState<StreamStatus | 'idle'>('idle');
  const studioSessionStartedAt = useRef<number | null>(null);
  const [streamConnectError, setStreamConnectError] = useState('');
  const streamRenderErrorNotified = useRef(false);
  const [audioMonitor, setAudioMonitor] = useState(false);
  const startingStreamRef = useRef(false);
  const liveAudioContext = useRef<AudioContext | null>(null);
  const liveAudioProcessor = useRef<ScriptProcessorNode | null>(null);
  const liveAudioDestination = useRef<GainNode | null>(null);
  const liveAudioInputs = useRef(new Map<number, MediaStreamAudioSourceNode>());
  const liveAudioGains = useRef(new Map<number, GainNode>());
  const liveAudioPanners = useRef(new Map<number, StereoPannerNode>());
  const liveAudioCompressors = useRef(new Map<number, DynamicsCompressorNode>());
  const recordingAudioContext = useRef<AudioContext | null>(null);
  const recordingAudioRecorder = useRef<MediaRecorder | null>(null);
  const recordingAudioDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recordingAudioInputs = useRef(new Map<number, MediaStreamAudioSourceNode>());
  const recordingAudioGains = useRef(new Map<number, GainNode>());
  const recordingAudioPanners = useRef(new Map<number, StereoPannerNode>());
  const recordingAudioCompressors = useRef(new Map<number, DynamicsCompressorNode>());
  const [studioOutputTab, setStudioOutputTab] = useState<'slideshow' | 'stream'>(() => localStorage.getItem(getAccountStorageKey(STUDIO_OUTPUT_TAB_KEY)) === 'slideshow' ? 'slideshow' : 'stream');
  const [slidesExpanded, setSlidesExpanded] = useState(false);
  const [offlineSlide, setOfflineSlide] = useState<Ref>(() => ({ sceneId: slideshowScenes[0]?.id ?? 0, slideIdx: 0 }));
  useEffect(() => {
    if (!slideshowScenes.length) {
      if (offlineSlide.sceneId !== 0) setOfflineSlide({ sceneId: 0, slideIdx: 0 });
      return;
    }
    const first = slideshowScenes[0];
    const currentScene = slideshowScenes.find((item) => item.id === offlineSlide.sceneId);
    const scene = currentScene ?? first;
    const slideIdx = currentScene
      ? Math.min(Math.max(0, offlineSlide.slideIdx), Math.max(0, scene.slides.length - 1))
      : 0;
    if (scene.id !== offlineSlide.sceneId || slideIdx !== offlineSlide.slideIdx) {
      setOfflineSlide({ sceneId: scene.id, slideIdx });
    }
  }, [slideshowScenes, offlineSlide]);
  const [studioDisplays, setStudioDisplays] = useState<{ id: number; name: string; primary: boolean }[]>([]);
  // Program output can go to several monitors at once (e.g. a projector and a confidence TV).
  const [streamDisplayIds, setStreamDisplayIds] = useState<number[] | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STUDIO_STREAM_DISPLAYS_KEY) ?? 'null') as unknown;
      return Array.isArray(saved) ? saved.filter((id): id is number => typeof id === 'number') : null;
    } catch { return null; }
  });
  const [openDisplayIds, setOpenDisplayIds] = useState<number[]>([]);
  const [displayError, setDisplayError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmEndStream, setConfirmEndStream] = useState(() => localStorage.getItem('faithstream.studio-confirm-end') !== 'false');
  const [endStreamConfirmOpen, setEndStreamConfirmOpen] = useState(false);

  useEffect(() => {
    if (!mobileCamPairing || mobileCamPairing.connected) return;
    let active = true;
    const refreshCode = async () => {
      if (mobileCamCodeRenewalInFlight.current || Date.now() - lastMobileCamCodeRenewalAttempt.current < 5000) return;
      mobileCamCodeRenewalInFlight.current = true;
      lastMobileCamCodeRenewalAttempt.current = Date.now();
      try {
        const result = await window.faithstreamWindow?.renewMobileCamPairingCode(mobileCamPairing.sourceId);
        if (!active || !result?.ok || !result.code || !result.expiresAt) {
          if (active) setMobileCamPairing((current) => current ? { ...current, refreshError: result?.message || 'Could not refresh the pairing code. Retrying…' } : null);
          return;
        }
        const details = mobileCamPairingDetails.current.get(mobileCamPairing.sourceId);
        if (details) mobileCamPairingDetails.current.set(mobileCamPairing.sourceId, { ...details, code: result.code, expiresAt: result.expiresAt });
        setMobileCamPairing((current) => current ? { ...current, code: result.code!, expiresAt: result.expiresAt!, remainingSeconds: 180, refreshError: undefined } : null);
      } catch {
        if (active) setMobileCamPairing((current) => current ? { ...current, refreshError: 'Could not refresh the pairing code. Retrying…' } : null);
      } finally {
        mobileCamCodeRenewalInFlight.current = false;
      }
    };
    const tick = () => {
      const remainingSeconds = Math.max(0, Math.ceil((mobileCamPairing.expiresAt - Date.now()) / 1000));
      setMobileCamPairing((current) => current ? { ...current, remainingSeconds } : null);
      if (!remainingSeconds) void refreshCode();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [mobileCamPairing?.sourceId, mobileCamPairing?.expiresAt, mobileCamPairing?.connected]);

  useEffect(() => {
    let active = true;
    void window.faithstreamWindow?.getStreamSettings().then((settings) => {
      if (!active) return;
      if (settings) {
        setStreamServerUrl((current) => current || settings.serverUrl);
        setStreamKey((current) => current || settings.streamKey);
      }
      setStreamSettingsLoaded(true);
    }).catch(() => {
      if (active) setStreamSettingsLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!streamSettingsLoaded) return;
    const timeout = window.setTimeout(() => {
      void window.faithstreamWindow?.saveStreamSettings({ serverUrl: streamServerUrl, streamKey });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [streamSettingsLoaded, streamServerUrl, streamKey]);

  useEffect(() => {
    const bridge = window.faithstreamWindow;
    if (!live || !programCanvasRef.current || !bridge?.sendStreamVideoFrame) return;
    let active = true;
    let timer = 0;
    const width = streamResolution === '1080p' ? 1920 : 1280;
    const height = streamResolution === '1080p' ? 1080 : 720;
    const frameDelay = 1000 / Number(streamFrameRate);
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width; frameCanvas.height = height;
    const sendFrame = async () => {
      const startedAt = performance.now();
      if (!streamFrameBusy.current) {
        streamFrameBusy.current = true;
        try {
          const output = programCanvasRef.current;
          if (!output) throw new Error('The On-air canvas is unavailable.');
          const composition = streamCompositionRef.current;
          if (!composition) throw new Error('The On-air composition is unavailable.');
          const frame = await renderProgramFrame(frameCanvas, output, composition);
          if (active) bridge.sendStreamVideoFrame(frame);
        } catch (error) {
          if (active && !streamRenderErrorNotified.current) {
            streamRenderErrorNotified.current = true;
            window.dispatchEvent(new CustomEvent('faithstream:stream-error', {
              detail: { message: error instanceof Error ? error.message : 'Could not render the On-air output.' },
            }));
          }
        } finally {
          streamFrameBusy.current = false;
        }
      }
      if (active) timer = window.setTimeout(() => { void sendFrame(); }, Math.max(0, frameDelay - (performance.now() - startedAt)));
    };
    void sendFrame();
    return () => { active = false; window.clearTimeout(timer); };
  }, [live, streamResolution, streamFrameRate]);

  useEffect(() => {
    try {
      localStorage.setItem(getAccountStorageKey(STUDIO_OUTPUT_TAB_KEY), studioOutputTab);
      localStorage.setItem(getAccountStorageKey(STUDIO_SIDEBAR_PANEL_KEY), sidebarPanel);
      localStorage.setItem(getAccountStorageKey(STUDIO_MUSIC_VIEW_KEY), musicView);
    } catch { /* Keep the current panel selection for this session if storage is unavailable. */ }
  }, [studioOutputTab, sidebarPanel, musicView]);
  useEffect(() => {
    try { localStorage.setItem(STUDIO_QUICK_SHOW_SLIDES_KEY, String(quickShowLiveSlides)); } catch { /* Keep the current setting for this session. */ }
  }, [quickShowLiveSlides]);
  // Studio stays loaded in the background, so pick up changes made on the Settings page right away.
  // Stream quality is fixed while live (the encoder was started with it); a change made during a
  // stream is picked up when the stream ends, for the next one.
  const liveRef = useRef(live);
  const syncFromSettings = useCallback(() => {
    try {
      setConfirmEndStream(localStorage.getItem('faithstream.studio-confirm-end') !== 'false');
      if (liveRef.current) return;
      setStreamResolution(localStorage.getItem(STUDIO_RESOLUTION_KEY) || '720p');
      setStreamFrameRate(localStorage.getItem(STUDIO_FRAME_RATE_KEY) || '30');
      setStreamBitrate(localStorage.getItem(STUDIO_BITRATE_KEY) || '4500');
    } catch { /* Keep Studio's current settings. */ }
  }, []);
  useEffect(() => {
    liveRef.current = live;
    if (!live) syncFromSettings();
  }, [live, syncFromSettings]);
  useEffect(() => {
    window.addEventListener('faithstream:studio-settings', syncFromSettings);
    return () => window.removeEventListener('faithstream:studio-settings', syncFromSettings);
  }, [syncFromSettings]);
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


  useEffect(() => {
    if (!sceneSnapshotsReady) return;
    persistScenesImmediately(scenes, STUDIO_SCENES_KEY);
  }, [scenes, sceneSnapshotsReady]);

  useEffect(() => {
    if (!sceneSnapshotsReady) return;
    persistScenesImmediately(slideshowScenes, STUDIO_SLIDESHOW_SCENES_KEY);
  }, [slideshowScenes, sceneSnapshotsReady]);

  useEffect(() => {
    const refreshLinkedPresentationTitles = async (event?: Event) => {
      const eventProjects = event instanceof CustomEvent && Array.isArray(event.detail?.projects)
        ? event.detail.projects as SavedPresentation[]
        : null;
      const changedProjectId = event instanceof CustomEvent && typeof event.detail?.changedProjectId === 'string'
        ? event.detail.changedProjectId as string
        : null;
      let presentations: SavedPresentation[];
      let presentationLibraryReady = false;
      if (eventProjects) {
        // Presentation localStorage can fall back to id/title-only cards when an imported deck
        // is large. Never sync those into a Studio scene: reload the full device-only records.
        const needsDeviceReload = eventProjects.some(isPresentationCardOnly);
        if (needsDeviceReload) {
          try {
            deviceSavedPresentations = await readDeviceSavedPresentations();
            presentationLibraryReady = true;
          }
          catch { /* Keep the previous full IndexedDB snapshot if a read is temporarily blocked. */ }
        } else {
          deviceSavedPresentations = eventProjects.filter((item) => item.deviceOnly);
          presentationLibraryReady = true;
        }
        presentations = [...eventProjects.filter((item) => !item.deviceOnly), ...deviceSavedPresentations];
      } else {
        try {
          deviceSavedPresentations = await readDeviceSavedPresentations();
          presentationLibraryReady = true;
        }
        catch { /* Keep scene snapshots if the device library is briefly unavailable. */ }
        presentations = readSavedPresentations();
      }
      const changedIds = rememberSavedPresentations(presentations);
      if (changedProjectId) changedIds.add(changedProjectId);
      const byId = new Map(presentations.map((presentation) => [presentation.id, presentation]));
      const refresh = (current: Scene[]) => {
        let changed = false;
        const next: Scene[] = [];
        for (const scene of current) {
          const linkedById = scene.presentationId ? byId.get(scene.presentationId) : undefined;
          // Older scene snapshots may predate presentationId. Recover the link only when
          // both the title and at least one original slide ID uniquely identify a deck.
          const sceneSlideIds = new Set(scene.slides
            .map((slide) => slide.presentationSlideId)
            .filter((id): id is number => Number.isFinite(id)));
          const legacyMatches = !scene.presentationId && !scene.songId && sceneSlideIds.size
            ? presentations.filter((item) => item.name.trim().toLocaleLowerCase() === scene.name.trim().toLocaleLowerCase()
              && item.slides.some((slide) => sceneSlideIds.has(slide.id)))
            : [];
          const presentation = linkedById ?? (legacyMatches.length === 1 ? legacyMatches[0] : undefined);
          if (!presentation) {
            const isLinkedPresentationScene = !!scene.presentationId
              || (!scene.songId && sceneSlideIds.size > 0 && /^\d+ presentation slides?$/.test(scene.desc.trim()));
            if (presentationLibraryReady && isLinkedPresentationScene) {
              // The source deck was deleted from Presentations. Remove its stale Studio card.
              changed = true;
              continue;
            }
            next.push(scene);
            continue;
          }
          const signature = savedPresentationSignaturesRef.current.get(presentation.id);
          const recoveredLink = !scene.presentationId;
          if (!signature || (!recoveredLink && !changedIds.has(presentation.id) && syncedScenePresentationSignaturesRef.current.get(scene.id) === signature)) {
            next.push(scene);
            continue;
          }
          syncedScenePresentationSignaturesRef.current.set(scene.id, signature);
          next.push(hydrateSceneMedia(syncPresentationSlides(scene, presentation), mediaUrlsRef.current));
          changed = true;
        }
        return changed ? next : current;
      };
      setScenes((current) => refresh(current));
      setSlideshowScenes((current) => refresh(current));
    };
    const onMediaUpdated = () => {
      void refreshStudioMediaUrls().then((assets) => {
        setScenes((current) => current.map((scene) => hydrateSceneMedia(scene, assets)));
        setSlideshowScenes((current) => current.map((scene) => hydrateSceneMedia(scene, assets)));
      }).catch(() => setSourceError('Could not refresh presentation images.'));
    };
    const onPresentationsStorage = (event: StorageEvent) => {
      if (event.key === getAccountStorageKey('faithstream.presentations')) void refreshLinkedPresentationTitles();
    };
    window.addEventListener('faithstream:presentations-updated', refreshLinkedPresentationTitles);
    window.addEventListener('faithstream:media-updated', onMediaUpdated);
    window.addEventListener('storage', onPresentationsStorage);
    void refreshLinkedPresentationTitles();
    return () => {
      window.removeEventListener('faithstream:presentations-updated', refreshLinkedPresentationTitles);
      window.removeEventListener('faithstream:media-updated', onMediaUpdated);
      window.removeEventListener('storage', onPresentationsStorage);
    };
  }, []);

  // A linked deck needs a presentation source in the Program composition. Without it,
  // changing the on-air slide reference updates state but the output canvas stays empty.
  // Mark each linked scene once so a user can still intentionally remove its source later.
  useEffect(() => {
    const pendingScenes = scenes.filter((item) => (item.presentationId || item.songId) && !item.presentationSourceInitialized);
    if (!pendingScenes.length) return;

    const pendingIds = new Set(pendingScenes.map((item) => item.id));
    setSources((current) => {
      const next = [...current];
      let nextId = Math.max(0, ...next.map((source) => source.id)) + 1;
      for (const item of pendingScenes) {
        const alreadyAvailable = next.some((source) => source.kind === 'presentation' && (source.shared || source.sceneId === item.id));
        if (alreadyAvailable) continue;
        next.push({
          id: nextId++, sceneId: item.id, shared: false, name: 'Presentation slides', kind: 'presentation', visible: true,
          layout: { x: 0, y: 0, width: 100, height: 100 },
        });
      }
      return next;
    });
    setScenes((current) => current.map((item) => pendingIds.has(item.id) ? { ...item, presentationSourceInitialized: true } : item));
  }, [scenes]);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_OUTPUT_REF_KEY, JSON.stringify(offlineSlide)); } catch { /* Output window can still follow the current Studio session. */ }
  }, [offlineSlide]);

  useEffect(() => {
    try { localStorage.setItem(STUDIO_STREAM_OUTPUT_REF_KEY, JSON.stringify(onAir)); } catch { /* Keep stream monitor output in sync when storage is unavailable. */ }
  }, [onAir]);

  useEffect(() => {
    let active = true;
    const loadDisplays = () => window.faithstreamWindow?.getStudioDisplays().then((displays) => {
      if (!active) return;
      setStudioDisplays(displays.map(({ id, name, primary }) => ({ id, name, primary })));
      // First run: pre-select every secondary monitor (or the only monitor, if there is just one).
      setStreamDisplayIds((current) => {
        // Keep the saved choice (including a deliberate "None") unless none of the saved monitors
        // are connected any more, e.g. after moving to another church's projector setup.
        if (current !== null && (current.length === 0 || current.some((id) => displays.some((display) => display.id === id)))) return current;
        const secondary = displays.filter((display) => !display.primary).map((display) => display.id);
        return secondary.length ? secondary : displays.slice(0, 1).map((display) => display.id);
      });
    }).catch(() => {
      if (active) setDisplayError('Could not read the connected monitors.');
    });
    void loadDisplays();
    void window.faithstreamWindow?.getOpenStudioDisplays?.().then((ids) => { if (active) setOpenDisplayIds(ids); }).catch(() => undefined);
    const stopWatchingDisplays = window.faithstreamWindow?.onStudioDisplaysChanged?.((ids) => {
      if (!active) return;
      setOpenDisplayIds(ids);
      void loadDisplays();
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
      stopWatchingDisplays?.();
      window.removeEventListener('storage', onOutputChange);
    };
  }, []);

  useEffect(() => {
    if (streamDisplayIds === null) return;
    try { localStorage.setItem(STUDIO_STREAM_DISPLAYS_KEY, JSON.stringify(streamDisplayIds)); } catch { /* Keep the monitor choice for this session if storage is unavailable. */ }
  }, [streamDisplayIds]);

  useEffect(() => {
    return window.faithstreamWindow?.onStreamStatus((event) => {
      const status = event.status;
      setStreamStatus(status);
      if (status === 'error' || status === 'stopped') {
        setLive(false);
        liveAudioProcessor.current?.disconnect();
        liveAudioProcessor.current = null;
        void liveAudioContext.current?.close();
        liveAudioContext.current = null;
        liveAudioDestination.current = null;
        liveAudioInputs.current.forEach((input) => input.disconnect());
        liveAudioInputs.current.clear();
        liveAudioGains.current.clear();
        liveAudioPanners.current.clear();
        liveAudioCompressors.current.clear();
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
      liveAudioPanners.current.get(id)?.disconnect();
      liveAudioCompressors.current.get(id)?.disconnect();
      liveAudioInputs.current.delete(id);
      liveAudioGains.current.delete(id);
      liveAudioPanners.current.delete(id);
      liveAudioCompressors.current.delete(id);
    });
    mixerChannels.forEach((channel) => {
      const source = sources.find((item) => item.id === channel.id);
      if (!liveAudioGains.current.has(channel.id)) {
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (tracks.length) {
          const input = context.createMediaStreamSource(new MediaStream(tracks));
          const compressor = context.createDynamicsCompressor();
          const newGain = context.createGain();
          const panner = context.createStereoPanner();
          compressor.threshold.value = channel.compressor ? channel.compressorThreshold : 0;
          compressor.ratio.value = channel.compressor ? 3 : 1;
          compressor.knee.value = channel.compressor ? 12 : 0;
          panner.pan.value = channel.pan;
          input.connect(compressor).connect(newGain).connect(panner).connect(destination);
          liveAudioInputs.current.set(channel.id, input);
          liveAudioGains.current.set(channel.id, newGain);
          liveAudioPanners.current.set(channel.id, panner);
          liveAudioCompressors.current.set(channel.id, compressor);
        }
      }
      const gain = liveAudioGains.current.get(channel.id);
      if (!gain) return;
      const value = source?.visible && !channel.muted ? channelGain(channel.db) : 0;
      gain.gain.setTargetAtTime(value, context.currentTime, 0.025);
      const panner = liveAudioPanners.current.get(channel.id);
      if (panner) panner.pan.setTargetAtTime(channel.pan, context.currentTime, 0.025);
      const compressor = liveAudioCompressors.current.get(channel.id);
      if (compressor) {
        compressor.threshold.setTargetAtTime(channel.compressor ? channel.compressorThreshold : 0, context.currentTime, 0.025);
        compressor.ratio.setTargetAtTime(channel.compressor ? 3 : 1, context.currentTime, 0.025);
        compressor.knee.setTargetAtTime(channel.compressor ? 12 : 0, context.currentTime, 0.025);
      }
    });
  }, [channels, sources, onAir.sceneId]);

  // captureStream() intentionally ignores an audio element's volume and muted
  // properties, so apply the same fader to its local speaker output separately.
  useEffect(() => {
    for (const channel of channels) {
      const source = sources.find((item) => item.id === channel.id);
      if (source?.kind !== 'music') continue;
      const audio = musicElements.current.get(channel.id);
      if (audio) {
        audio.volume = Math.max(0, Math.min(1, channelGain(channel.db)));
        audio.muted = channel.muted || !source.visible;
      }
    }
    const preview = musicPreviewElement.current;
    if (preview && previewingMusicId) {
      const source = sources.find((item) => item.kind === 'music' && item.mediaAssetId === previewingMusicId);
      const channel = source ? channels.find((item) => item.id === source.id) : undefined;
      preview.volume = channel ? Math.max(0, Math.min(1, channelGain(channel.db))) : 1;
      preview.muted = !!channel && (channel.muted || !source?.visible);
    }
  }, [channels, sources, previewingMusicId]);

  useEffect(() => {
    const context = recordingAudioContext.current;
    const destination = recordingAudioDestination.current;
    if (!context || !destination || !recordingAudioRecorder.current || recordingAudioRecorder.current.state === 'inactive') return;
    const activeIds = new Set(mixerChannels.map((channel) => channel.id));
    recordingAudioInputs.current.forEach((input, id) => {
      if (activeIds.has(id)) return;
      input.disconnect();
      recordingAudioGains.current.get(id)?.disconnect();
      recordingAudioPanners.current.get(id)?.disconnect();
      recordingAudioCompressors.current.get(id)?.disconnect();
      recordingAudioInputs.current.delete(id);
      recordingAudioGains.current.delete(id);
      recordingAudioPanners.current.delete(id);
      recordingAudioCompressors.current.delete(id);
    });
    mixerChannels.forEach((channel) => {
      const source = sources.find((item) => item.id === channel.id);
      if (!recordingAudioGains.current.has(channel.id)) {
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (tracks.length) {
          const input = context.createMediaStreamSource(new MediaStream(tracks));
          const compressor = context.createDynamicsCompressor();
          const gain = context.createGain();
          const panner = context.createStereoPanner();
          compressor.threshold.value = channel.compressor ? channel.compressorThreshold : 0;
          compressor.ratio.value = channel.compressor ? 3 : 1;
          compressor.knee.value = channel.compressor ? 12 : 0;
          panner.pan.value = channel.pan;
          input.connect(compressor).connect(gain).connect(panner).connect(destination);
          recordingAudioInputs.current.set(channel.id, input);
          recordingAudioGains.current.set(channel.id, gain);
          recordingAudioPanners.current.set(channel.id, panner);
          recordingAudioCompressors.current.set(channel.id, compressor);
        }
      }
      const gain = recordingAudioGains.current.get(channel.id);
      if (!gain) return;
      gain.gain.setTargetAtTime(source?.visible && !channel.muted ? channelGain(channel.db) : 0, context.currentTime, 0.025);
      const panner = recordingAudioPanners.current.get(channel.id);
      if (panner) panner.pan.setTargetAtTime(channel.pan, context.currentTime, 0.025);
      const compressor = recordingAudioCompressors.current.get(channel.id);
      if (compressor) {
        compressor.threshold.setTargetAtTime(channel.compressor ? channel.compressorThreshold : 0, context.currentTime, 0.025);
        compressor.ratio.setTargetAtTime(channel.compressor ? 3 : 1, context.currentTime, 0.025);
        compressor.knee.setTargetAtTime(channel.compressor ? 12 : 0, context.currentTime, 0.025);
      }
    });
  }, [channels, sources, onAir.sceneId]);

  useEffect(() => {
    try { localStorage.setItem(getAccountStorageKey(STUDIO_SOURCES_KEY), JSON.stringify(sources.map(({ stream: _stream, ...source }) => source))); } catch { /* Keep the current source list usable if storage is unavailable. */ }
  }, [sources]);

  useEffect(() => {
    try { localStorage.setItem(getAccountStorageKey(STUDIO_AUDIO_CHANNELS_KEY), JSON.stringify(channels.map(({ id, db, muted, pan, compressor, compressorThreshold }) => ({ id, db, muted, pan, compressor, compressorThreshold })))); } catch { /* Keep mixer changes active for this session if storage is unavailable. */ }
  }, [channels]);

  useEffect(() => () => {
    sourceStreams.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    sourceCleanups.current.forEach((cleanup) => cleanup());
    musicElements.current.forEach((audio) => audio.pause());
    musicPreviewElement.current?.pause();
    sourceObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    sourceMediaReleases.current.forEach((release) => release());
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
      if (target instanceof Element && target.closest('[data-program-control]')) return;
      setSelectedProgramSource(null);
    };
    document.addEventListener('pointerdown', clearSelectionOutsideOutput);
    return () => document.removeEventListener('pointerdown', clearSelectionOutsideOutput);
  }, [selectedProgramSource]);

  useEffect(() => {
    let cancelled = false;
    let release: () => void = () => {};
    const bridge = window.faithstreamWindow;
    void readStudioMediaUrlMap().then((result) => {
      release = result.release;
      if (cancelled) { release(); return; }
      sourceMediaReleases.current.push(release);
      const loadedUrls = result.mediaUrls;
      mediaUrlsRef.current = loadedUrls;
      setMediaUrls(loadedUrls);
      setScenes((current) => current.map((scene) => hydrateSceneMedia(scene, loadedUrls)));
      setSlideshowScenes((current) => current.map((scene) => hydrateSceneMedia(scene, loadedUrls)));
      markStartupResourceReady('studio-media');
    }).catch(() => {
      if (!cancelled) markStartupResourceReady('studio-media');
      /* Scenes can still use presentation slides without local media. */
    });
    const unsubscribe = bridge?.onPresentationBackgroundsChanged(() => {
      void readStudioMediaUrlMap().then((result) => {
        if (cancelled) { result.release(); return; }
        sourceMediaReleases.current.push(result.release);
        mediaUrlsRef.current = result.mediaUrls;
        setMediaUrls(result.mediaUrls);
        setScenes((current) => current.map((scene) => hydrateSceneMedia(scene, result.mediaUrls)));
        setSlideshowScenes((current) => current.map((scene) => hydrateSceneMedia(scene, result.mediaUrls)));
      }).catch(() => { /* Keep existing previews if the thumbnail refresh fails. */ });
    });
    return () => { cancelled = true; release(); unsubscribe?.(); };
  }, []);

  // Built-in video previews are cached per computer. Generate only backgrounds in saved decks
  // and scenes, then refresh the cards above after the thumbnails are ready.
  useEffect(() => {
    if (!backgroundThumbnailRequestKey) return;
    const ids = backgroundThumbnailRequestKey.split('|');
    void window.faithstreamWindow?.preparePresentationBackgroundThumbnails(ids);
  }, [backgroundThumbnailRequestKey]);

  useEffect(() => {
    let cancelled = false;
    const bridge = window.faithstreamWindow;
    if (!bridge) { markStartupResourceReady('studio-music'); return () => { cancelled = true; }; }
    void bridge.resolveStudioMusicFiles(readSavedStudioMusicFiles()).then((assets) => {
      if (cancelled) return;
      saveStudioMusicFiles(assets.map(({ url: _url, ...asset }) => asset));
      setMusicAssets(assets);
      markStartupResourceReady('studio-music');
    }).catch(() => {
      if (!cancelled) markStartupResourceReady('studio-music');
      if (!cancelled) setSourceError('Could not load saved music tracks.');
    });
    return () => { cancelled = true; };
  }, []);

  const refreshStudioMediaUrls = async () => {
    const result = await readStudioMediaUrlMap();
    sourceMediaReleases.current.push(result.release);
    const refreshed = { ...mediaUrlsRef.current, ...result.mediaUrls };
    mediaUrlsRef.current = refreshed;
    setMediaUrls(refreshed);
    setScenes((current) => current.map((scene) => hydrateSceneMedia(scene, refreshed)));
    setSlideshowScenes((current) => current.map((scene) => hydrateSceneMedia(scene, refreshed)));
    return refreshed;
  };

  const beginAddScene = async () => {
    try {
      await refreshStudioMediaUrls();
    } catch {
      setSourceError('Could not load presentation images. Try again.');
    }
    try { deviceSavedPresentations = await readDeviceSavedPresentations(); }
    catch { /* Use the current in-memory library if IndexedDB is temporarily unavailable. */ }
    const available = readSavedPresentations();
    setAddSceneTab(studioOutputTab);
    rememberSavedPresentations(available);
    setSelectedPresentationId(available[0]?.id ?? '');
    setAddSceneSongQuery('');
    setAddSceneOpen(true);
    void loadLibrary().then(({ songs }) => setAddSceneSongs([...songs].sort(compareSongs))).catch(() => setAddSceneSongs([]));
  };

  const makePresentationScene = (presentation: SavedPresentation, id: number): Scene => {
    const importedSlides: StudioSlide[] = presentation.slides.map((slide) => {
      const textParts = [slide.box?.text, ...(slide.extraBoxes ?? []).map((item) => item.box?.text)]
        .filter((text): text is string => !!text?.trim());
      const mapped: StudioSlide = {
        presentationSlideId: slide.id,
        title: slide.title,
        text: textParts.join('\n') || slide.title || '',
        bg: slide.bg ?? 'from-slate-600 to-slate-950',
        canvasAspect: slide.canvasAspect,
        canvasWidthPoints: slide.canvasWidthPoints,
        canvasHeightPoints: slide.canvasHeightPoints,
        bgAssetId: slide.bgAssetId,
        bgImage: slide.bgImage,
        bgImageFit: slide.bgImageFit,
        bgPosition: slide.bgPosition,
        bgVideo: slide.bgVideo,
        bgVideoMuted: slide.bgVideoMuted ?? true,
        dim: slide.dim,
        backgroundOpacity: slide.backgroundOpacity,
        textColor: slide.box?.color,
        countdown: slide.countdown,
        design: {
          box: slide.box,
          extraBoxes: slide.extraBoxes,
          pictures: slide.pictures?.map((picture) => {
            const pictureAsset = picture.assetId ? mediaUrlsRef.current[picture.assetId] : undefined;
            return pictureAsset ? { ...picture, src: pictureAsset.url, poster: pictureAsset.thumbnailUrl } : picture;
          }),
          shapes: slide.shapes,
          countdown: slide.countdown,
        },
      };
      return restoreImportedSlideForStudio(mapped, mediaUrlsRef.current);
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

  const addAllPresentationScenes = async (destinationTab: 'stream' | 'slideshow' = studioOutputTab) => {
    try { deviceSavedPresentations = await readDeviceSavedPresentations(); }
    catch { /* Use the current in-memory library if IndexedDB is temporarily unavailable. */ }
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
      const next = [...slideshowScenes, ...newScenes];
      persistScenesImmediately(next, STUDIO_SLIDESHOW_SCENES_KEY);
      setSlideshowScenes(next);
      setOfflineSlide({ sceneId: newScenes[0].id, slideIdx: 0 });
    } else {
      const next = [...scenes, ...newScenes];
      persistScenesImmediately(next, STUDIO_SCENES_KEY);
      setScenes(next);
      setSceneId(newScenes[0].id);
      setSelected({ sceneId: newScenes[0].id, slideIdx: 0 });
      setPreview({ sceneId: newScenes[0].id, slideIdx: 0 });
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
      const next = [...slideshowScenes, newScene];
      persistScenesImmediately(next, STUDIO_SLIDESHOW_SCENES_KEY);
      setSlideshowScenes(next);
      setOfflineSlide({ sceneId: id, slideIdx: 0 });
    } else {
      const next = [...scenes, newScene];
      persistScenesImmediately(next, STUDIO_SCENES_KEY);
      setScenes(next);
      setSceneId(id);
      setSelected({ sceneId: id, slideIdx: 0 });
      setPreview({ sceneId: id, slideIdx: 0 });
    }
    setAddSceneOpen(false);
  };

  const removeSlideshowScene = (scene: Scene) => {
    const fallback = slideshowScenes.find((item) => item.id !== scene.id);
    const fallbackRef = { sceneId: fallback?.id ?? 0, slideIdx: 0 };
    const next = slideshowScenes.filter((item) => item.id !== scene.id);
    persistScenesImmediately(next, STUDIO_SLIDESHOW_SCENES_KEY);
    setSlideshowScenes(next);
    if (offlineSlide.sceneId === scene.id) setOfflineSlide(fallbackRef);
    setSceneToDelete(null);
  };

  const askDeleteScene = (scene: Scene, tab: 'stream' | 'slideshow') => {
    setSceneDeleteTab(tab);
    setSceneToDelete(scene);
  };

  const clearAllScenes = (tab: 'stream' | 'slideshow') => {
    if (tab === 'slideshow') {
      persistScenesImmediately([], STUDIO_SLIDESHOW_SCENES_KEY);
      setSlideshowScenes([]);
      setOfflineSlide({ sceneId: 0, slideIdx: 0 });
    } else {
      persistScenesImmediately([], STUDIO_SCENES_KEY);
      sourceStreams.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      sourceStreams.current.clear();
      setSources((current) => current.map((source) => ({ ...source, sceneId: 0, stream: undefined })));
      setChannels((current) => current.map((channel) => ({ ...channel, sceneId: 0 })));
      setScenes([]);
      setSceneId(0);
      setSelected({ sceneId: 0, slideIdx: 0 });
      setPreview({ sceneId: 0, slideIdx: 0 });
      setOnAir({ sceneId: 0, slideIdx: 0 });
      setSelectedProgramSource(null);
      setCameraOnlySnapshot(null);
    }
    setClearScenesTab(null);
  };

  const removeScene = (scene: Scene) => {
    const fallback = scenes.find((item) => item.id !== scene.id);
    const fallbackRef = { sceneId: fallback?.id ?? 0, slideIdx: 0 };
    const nextScenes = scenes.filter((item) => item.id !== scene.id);
    persistScenesImmediately(nextScenes, STUDIO_SCENES_KEY);
    setScenes(nextScenes);
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

  useEffect(() => {
    const key = `${onAir.sceneId}:${onAir.slideIdx}`;
    const current = resolve(onAir);
    const previous = previousOnAirTransition.current;
    if (!previous || previous.key !== key) streamAnimationStartedAt.current = performance.now();
    const durationMs = duration * 1000;
    if (!transitionEnabled || transition === 'Cut') {
      setStreamTransition(null);
    } else if (previous && previous.key !== key) {
      setStreamTransition({ kind: transition, startedAt: performance.now(), duration: durationMs, from: previous.slide, fromBg: previous.bg, to: current.slide, toBg: current.bg });
    }
    previousOnAirTransition.current = { key, slide: current.slide, bg: current.bg };
  }, [onAir.sceneId, onAir.slideIdx, scenes, transition, duration, transitionEnabled]);

  useEffect(() => {
    if (!streamTransition) return;
    const timer = window.setTimeout(() => setStreamTransition(null), streamTransition.duration);
    return () => window.clearTimeout(timer);
  }, [streamTransition]);

  const offlineScene = slideshowScenes.find((item) => item.id === offlineSlide.sceneId) ?? emptyScene;
  const offlineCurrent = (() => {
    const sc = offlineScene;
    const sourceSlide = sc.slides[offlineSlide.slideIdx] ?? { text: 'Add a presentation to create a scene' };
    const slide = restoreImportedSlideForStudio(sourceSlide, mediaUrls);
    return { bg: sc.bg, slide };
  })();
  const setOfflineScene = (id: number) => {
    const target = { sceneId: id, slideIdx: 0 };
    setOfflineSlide(target);
  };
  const openOfflineDisplay = async () => {
    if (!selectedStreamDisplayIds.length) {
      setDisplayError('Select at least one monitor first.');
      return;
    }
    try {
      localStorage.setItem(STUDIO_OUTPUT_REF_KEY, JSON.stringify(offlineSlide));
      localStorage.setItem(STUDIO_DISPLAY_MODE_KEY, 'slideshow');
    } catch { /* Keep the selected displays usable if storage is unavailable. */ }
    const deselected = openDisplayIds.filter((id) => !selectedStreamDisplayIds.includes(id));
    if (deselected.length) await window.faithstreamWindow?.closeStudioDisplays(deselected);
    const failures: string[] = [];
    for (const displayId of selectedStreamDisplayIds) {
      const result = await window.faithstreamWindow?.openStudioDisplay(displayId);
      if (!result?.ok) failures.push(`${studioDisplays.find((display) => display.id === displayId)?.name ?? 'A monitor'}: ${result?.message ?? 'could not open'}`);
    }
    setDisplayError(failures.join(' '));
  };
  const selectedStreamDisplayIds = (streamDisplayIds ?? []).filter((id) => studioDisplays.some((display) => display.id === id));
  const toggleStreamDisplay = (displayId: number) => {
    setStreamDisplayIds((current) => {
      const list = (current ?? []).filter((id) => studioDisplays.some((display) => display.id === id));
      return list.includes(displayId) ? list.filter((id) => id !== displayId) : [...list, displayId];
    });
  };
  const openStreamDisplay = async () => {
    if (!selectedStreamDisplayIds.length) {
      setDisplayError('Select at least one monitor first.');
      return;
    }
    try {
      localStorage.setItem(STUDIO_STREAM_OUTPUT_REF_KEY, JSON.stringify(onAir));
      localStorage.setItem(STUDIO_DISPLAY_MODE_KEY, 'stream');
    } catch { /* Keep the selected display usable if storage is unavailable. */ }
    // Turn off monitors that were deselected, then open every selected one.
    const deselected = openDisplayIds.filter((id) => !selectedStreamDisplayIds.includes(id));
    if (deselected.length) await window.faithstreamWindow?.closeStudioDisplays(deselected);
    const failures: string[] = [];
    for (const displayId of selectedStreamDisplayIds) {
      const result = await window.faithstreamWindow?.openStudioDisplay(displayId);
      if (!result?.ok) failures.push(`${studioDisplays.find((display) => display.id === displayId)?.name ?? 'A monitor'}: ${result?.message ?? 'could not open'}`);
    }
    setDisplayError(failures.join(' '));
  };
  const closeAllStreamDisplays = async () => {
    await window.faithstreamWindow?.closeStudioDisplays();
    setDisplayError('');
  };
  const stepOfflineSlide = (direction: -1 | 1) => {
    const count = offlineScene.slides.length;
    if (count < 1) return;
    const nextIndex = (offlineSlide.slideIdx + direction + count) % count;
    const target = { ...offlineSlide, slideIdx: nextIndex };
    setOfflineSlide(target);
  };

  const scene = scenes.find((x) => x.id === sceneId) ?? emptyScene;
  const selectedDesignScene = studioOutputTab === 'stream'
    ? scenes.find((item) => item.id === selected.sceneId)
    : slideshowScenes.find((item) => item.id === offlineSlide.sceneId);
  const canEditSelectedDesign = !!(selectedDesignScene?.songId || (selectedDesignScene && scriptureDesignForScene(selectedDesignScene)));
  const editingScriptureScene = editingScriptureSceneId === null ? undefined
    : (studioOutputTab === 'stream' ? scenes : slideshowScenes).find((item) => item.id === editingScriptureSceneId);
  const editingScriptureData = editingScriptureScene ? scriptureDesignForScene(editingScriptureScene) : null;
  const previewSetupRef = preview;
  const previewSetupSlide = resolve(previewSetupRef);
  const previewSlide = restoreImportedSlideForStudio(previewSetupSlide.slide, mediaUrls);
  const airingSource = resolve(onAir);
  const airing = { ...airingSource, slide: restoreImportedSlideForStudio(airingSource.slide, mediaUrls) };
  // Keep sources available when switching slides/scenes, like reusable OBS sources.
  const sourcesForScene = (id: number) => sources.filter((source) => source.shared || source.sceneId === id);
  const sceneSources = sourcesForScene(sceneId);
  const onAirSceneSources = sourcesForScene(onAir.sceneId);
  const previewSceneSources = sourcesForScene(previewSetupRef.sceneId);
  const isPreviewSourceVisible = (source: Source) => previewSetupVisibility[source.id] ?? source.visible;
  const orientationControlCamera = previewSceneSources.find((source) => source.id === selectedProgramSource && (source.kind === 'camera' || source.kind === 'mobile-camera'));
  const programOverlaySources = onAirSceneSources.filter((source) => source.visible && ['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind));
  const previewSetupOverlays = previewSceneSources.filter((source) => isPreviewSourceVisible(source) && ['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind));
  const visibleProgramOverlays = studioOutputTab === 'stream' ? programOverlaySources : [];
  const getProgramLayout = (source: Source) => {
    if (source.kind === 'presentation') {
      const layout = source.layout;
      const isOldGenericLayout = layout && layout.x === 8 && layout.y === 8 && layout.width === 42 && layout.height === 42;
      return layout && !isOldGenericLayout ? layout : { x: 0, y: 0, width: 100, height: 100 };
    }
    if (source.layout) return source.layout;
    if (source.kind === 'camera' || source.kind === 'mobile-camera') {
      const cameraIndex = sourcesForScene(source.sceneId).filter((item) => item.kind === 'camera' || item.kind === 'mobile-camera').findIndex((camera) => camera.id === source.id);
      return { x: 100 - (cameraIndex + 1) * 24, y: 72, width: 22, height: 22 };
    }
    return source.kind === 'text' ? { x: 10, y: 68, width: 80, height: 24 } : { x: 8, y: 8, width: 42, height: 42 };
  };
  const getPreviewSetupLayout = (source: Source) => previewSetupLayouts[source.id] ?? getProgramLayout(source);
  streamCompositionRef.current = {
    slide: airing.slide ?? { text: '', bg: airing.bg },
    bg: airing.bg,
    layers: visibleProgramOverlays.map((source) => ({ source, layout: getProgramLayout(source)! })),
    mediaUrls,
    transition: streamTransition,
    animationStartedAt: streamAnimationStartedAt.current,
  };
  const selectedProgramOverlay = previewSetupOverlays.find((source) => source.id === selectedProgramSource);
  const selectedProgramLayout = selectedProgramOverlay ? getPreviewSetupLayout(selectedProgramOverlay) : null;
  const cameraLimitReached = sceneSources.filter((source) => source.kind === 'camera').length >= 3;
  const mobileCamLimitReached = sources.filter((source) => source.kind === 'mobile-camera').length + mobileCamPendingSlots.current.size >= 3;
  const mixerChannels = channels.filter((channel) => onAirSceneSources.some((source) => source.id === channel.id));
  const audioSettingsChannel = channels.find((channel) => channel.id === audioSettingsChannelId);
  const audioSettingsSource = audioSettingsChannel ? sources.find((source) => source.id === audioSettingsChannel.id) : undefined;
  const connectedMixerChannels = mixerChannels.filter((channel) => sources.find((source) => source.id === channel.id)?.stream?.getAudioTracks().some((track) => track.readyState === 'live'));
  const audibleMixerChannels = connectedMixerChannels.filter((channel) => !channel.muted && sources.find((source) => source.id === channel.id)?.visible);
  const streamAudioPeak = Math.max(0, ...audibleMixerChannels.map((channel) => audioLevels[channel.id] ?? 0));
  const streamAudioStatus = !mixerChannels.length ? 'No inputs' : !connectedMixerChannels.length ? 'Disconnected' : !audibleMixerChannels.length ? 'Muted' : streamAudioPeak > 0.002 ? 'Signal' : 'No signal';
  const streamAudioPercent = streamAudioPeak > 0 ? Math.max(0, Math.min(100, ((20 * Math.log10(streamAudioPeak) + 60) / 60) * 100)) : 0;

  const refreshSceneFromSavedPresentations = (sceneId: number, readLatest = false) => {
    if (readLatest) rememberSavedPresentations(readSavedPresentations());
    const scene = scenes.find((item) => item.id === sceneId);
    const presentation = scene?.presentationId
      ? savedPresentationsRef.current.find((item) => item.id === scene.presentationId)
      : undefined;
    if (!scene || !presentation) return scene;

    const signature = savedPresentationSignaturesRef.current.get(presentation.id) ?? JSON.stringify(presentation);
    savedPresentationSignaturesRef.current.set(presentation.id, signature);
    if (syncedScenePresentationSignaturesRef.current.get(scene.id) === signature) return scene;

    const refreshed = hydrateSceneMedia(syncPresentationSlides(scene, presentation), mediaUrlsRef.current);
    syncedScenePresentationSignaturesRef.current.set(scene.id, signature);
    setScenes((current) => current.map((item) => item.id === scene.id ? refreshed : item));
    return refreshed;
  };

  // Scene selections always stage. Slide selections can quick-show only inside the live scene.
  const prepareSlide = (target: Ref) => {
    setSelected(target);
    setPreview(target);
    if (quickShowLiveSlides && target.sceneId === onAir.sceneId) setOnAir(target);
  };

  const selectSlide = (i: number) => {
    const target = { sceneId, slideIdx: i };
    const latestScene = refreshSceneFromSavedPresentations(target.sceneId);
    const readyTarget = latestScene
      ? { sceneId: target.sceneId, slideIdx: Math.min(target.slideIdx, Math.max(0, latestScene.slides.length - 1)) }
      : target;
    prepareSlide(readyTarget);
  };

  const selectScene = (id: number) => {
    const target = { sceneId: id, slideIdx: 0 };
    setSceneId(id);
    setSelected(target);
    setPreview(target);
    refreshSceneFromSavedPresentations(id);
    setAddSourceOpen(false);
  };

  /**
   * Adds a song from the songbooks to the Scenes list (one slide per part), or refreshes it if
   * it is already there, and opens it in the slide list. It never goes on air by itself.
   */
  const addSongScene = async (song: Song) => {
    const slideshow = studioOutputTab === 'slideshow';
    // A song can be added from the Songbooks panel before Studio has finished loading the
    // selected background library. Resolve the asset at the moment the scene is created so
    // both the in-app preview and the separate monitor have a usable media URL immediately.
    try { await refreshStudioMediaUrls(); } catch { /* Keep the selected asset ID for later hydration. */ }
    const list = slideshow ? slideshowScenes : scenes;
    const existing = list.find((scene) => scene.songId === song.id);
    // Adding an existing song must not refresh or replace its scene while it may be on air.
    if (existing) return;
    // A new id is also kept clear of any on-air / preview reference left by a deleted scene,
    // so a freshly added song can never appear on air by itself.
    const id = Math.max(0, ...list.map((scene) => scene.id), onAir.sceneId, preview.sceneId, selected.sceneId, offlineSlide.sceneId) + 1;
    const slides = songSceneSlides(song, mediaUrlsRef.current);
    const bg = slides[0]?.bg ?? SONG_SCENE_BG;
    const scene: Scene = { bg, id, name: song.number ? `${song.number}. ${song.title}` : song.title, desc: `Song · ${slides.length} ${slides.length === 1 ? 'part' : 'parts'}`, slides, songId: song.id };
    if (slideshow) {
      persistScenesImmediately([...slideshowScenes, scene], STUDIO_SLIDESHOW_SCENES_KEY);
      setSlideshowScenes((current) => [...current, scene]);
      return;
    }
    // Keep the operator on the current scene. Adding a song only makes it available in Scenes.
    persistScenesImmediately([...scenes, scene], STUDIO_SCENES_KEY);
    setScenes((current) => [...current, scene]);
  };

  /** Add the designed passage as a scene, one slide per verse; it is not sent on air automatically. */
  const beginScriptureDesign = (reference: string, text: string, selectedVerses?: SelectedScriptureVerse[]) => {
    setScripturePickerOpen(false);
    setPendingScriptureDesign({ reference, verses: selectedVerses?.length ? selectedVerses : [{ reference, text }] });
  };

  const addScriptureScene = async (reference: string, verses: SelectedScriptureVerse[], style: SongStyle, presentNow = false, editSceneId?: number) => {
    const slideshow = studioOutputTab === 'slideshow';
    const list = slideshow ? slideshowScenes : scenes;
    const existingScene = editSceneId === undefined ? undefined : list.find((scene) => scene.id === editSceneId);
    const id = existingScene?.id ?? Math.max(0, ...list.map((scene) => scene.id), onAir.sceneId, preview.sceneId, selected.sceneId, offlineSlide.sceneId) + 1;
    let urls = mediaUrlsRef.current;
    if (style.backgroundAssetId && !urls[style.backgroundAssetId]) {
      try { urls = await refreshStudioMediaUrls(); } catch { /* The asset ID remains saved and will hydrate on reload. */ }
    }
    const lyrics = verses.map((verse) => `${verse.reference}\n${verse.text.replace(/\s+$/, '')}`).join('\n\n');
    const layouts = songSlideLayouts({ title: reference, author: '', copyright: '', lyrics, style }, style);
    const template = layouts[0];
    const slides: StudioSlide[] = verses.map((verse) => {
      const layout = template;
      if (!layout) return { title: verse.reference, ref: verse.reference, text: `${verse.reference}\n${verse.text}`, bg: style.background, design: { box: songTextBox(`${verse.reference}\n${verse.text}`) } };
      const text = `${verse.reference}\n${verse.text.replace(/\s+$/, '')}`;
      const asset = style.backgroundAssetId ? urls[style.backgroundAssetId] : undefined;
      return {
        title: verse.reference,
        ref: verse.reference,
        text,
        bg: layout.background,
        dim: layout.dim,
        backgroundOpacity: layout.backgroundOpacity,
        bgAssetId: layout.backgroundAssetId,
        bgImage: asset?.type === 'image' ? asset.url : undefined,
        bgVideo: asset?.type === 'video' ? asset.url : undefined,
        bgVideoMuted: asset?.type === 'video' ? true : undefined,
        design: { box: { ...songLayoutBox(layout.box), text, lineAligns: style.lineAligns?.[songLineKey(text)] } },
      };
    });
    const bg = slides[0]?.bg ?? style.background;
    const scene: Scene = { ...existingScene, id, name: reference, desc: `Scripture · ${slides.length} verses`, bg, slides, scriptureReference: reference, scriptureVerses: verses, scriptureStyle: style };
    const target = { sceneId: id, slideIdx: 0 };
    if (existingScene) {
      const next = list.map((item) => item.id === id ? scene : item);
      if (slideshow) {
        persistScenesImmediately(next, STUDIO_SLIDESHOW_SCENES_KEY);
        setSlideshowScenes(next);
      } else {
        persistScenesImmediately(next, STUDIO_SCENES_KEY);
        setScenes(next);
      }
      setEditingScriptureSceneId(null);
      return;
    }
    if (slideshow) {
      persistScenesImmediately([...slideshowScenes, scene], STUDIO_SLIDESHOW_SCENES_KEY);
      setSlideshowScenes((current) => [...current, scene]);
      setOfflineSlide(target);
    } else {
      persistScenesImmediately([...scenes, scene], STUDIO_SCENES_KEY);
      setScenes((current) => [...current, scene]);
      setSceneId(id);
      setSelected(target);
      setPreview(target);
      if (presentNow) setOnAir(target);
    }
    setPendingScriptureDesign(null);
  };

  const presentScriptureNow = (reference: string, text: string, selectedVerses?: SelectedScriptureVerse[]) => {
    setScripturePickerOpen(false);
    const verses = selectedVerses?.length ? selectedVerses : [{ reference, text }];
    void addScriptureScene(reference, verses, { ...loadSongSlideSettings(), titleSlide: false }, true);
  };

  const openScripturePicker = () => {
    preloadBible();
    setScripturePickerOpen(true);
  };

  const openSelectedSceneDesign = async () => {
    const target = studioOutputTab === 'stream'
      ? scenes.find((item) => item.id === selected.sceneId)
      : slideshowScenes.find((item) => item.id === offlineSlide.sceneId);
    if (target && scriptureDesignForScene(target)) {
      setEditingScriptureSceneId(target.id);
      return;
    }
    if (target?.songId) {
      try {
        const library = await loadLibrary();
        const song = library.songs.find((item) => item.id === target.songId);
        if (!song) { setSourceError('This song is no longer in your songbooks. Open Songbooks to restore or re-add it.'); return; }
        setStudioSongBooks(library.books);
        setEditingStudioSong(song);
      } catch {
        setSourceError('Could not open this song for design. Try again.');
      }
    }
  };


  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  // "Show in Studio" from the songbook library (Studio keeps running in the background).
  const addSongSceneRef = useRef(addSongScene);
  addSongSceneRef.current = addSongScene;
  useEffect(() => {
    const onShowSong = (event: Event) => {
      const detail = (event as CustomEvent<{ song: Song; screenIndex?: number }>).detail;
      // "Add to Studio" from the songbook library: add the scene only, nothing goes on air.
      if (detail?.song?.id) addSongSceneRef.current(detail.song);
    };
    window.addEventListener(SHOW_SONG_EVENT, onShowSong);
    return () => window.removeEventListener(SHOW_SONG_EVENT, onShowSong);
  }, []);

  // A song was corrected (possibly while on screen): refresh every scene showing it.
  useEffect(() => {
    /**
     * Rebuilds the scenes of the given songs. The on-air, preview and selected slide stay on the
     * same words: adding or removing the title slide shifts every slide by one, and fewer lines
     * per slide changes the count.
     */
    const rebuildSongScenes = (songFor: (scene: Scene) => Song | undefined) => {
      const rebuild = (current: Scene[]) => current.map((scene) => {
        const song = scene.songId ? songFor(scene) : undefined;
        if (!song) return scene;
        const slides = songSceneSlides(song, mediaUrlsRef.current);
        return { ...scene, bg: slides[0]?.bg ?? scene.bg, name: song.number ? `${song.number}. ${song.title}` : song.title, slides, desc: `Song · ${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}` };
      });
      const before = new Map(scenesRef.current.filter((scene) => scene.songId).map((scene) => [scene.id, scene]));
      const after = new Map(rebuild(scenesRef.current).filter((scene) => scene.songId).map((scene) => [scene.id, scene]));
      const follow = (ref: Ref): Ref => {
        const oldScene = before.get(ref.sceneId);
        const newScene = after.get(ref.sceneId);
        if (!oldScene || !newScene || !newScene.slides.length) return ref;
        const hadTitle = oldScene.slides[0]?.title === 'Title';
        const hasTitle = newScene.slides[0]?.title === 'Title';
        const shifted = ref.slideIdx + (hasTitle && !hadTitle ? 1 : !hasTitle && hadTitle ? -1 : 0);
        const slideIdx = Math.min(Math.max(0, shifted), newScene.slides.length - 1);
        return slideIdx === ref.slideIdx ? ref : { ...ref, slideIdx };
      };
      setScenes(rebuild);
      setSlideshowScenes(rebuild);
      setOnAir(follow);
      setPreview(follow);
      setSelected(follow);
    };
    // A song was corrected or redesigned (possibly while on screen).
    const onSongSaved = (event: Event) => {
      const song = (event as CustomEvent<Song>).detail;
      if (song?.id) rebuildSongScenes((scene) => (scene.songId === song.id ? song : undefined));
    };
    // The default song style changed: rebuild every song scene.
    const onSettingsChanged = () => {
      void loadLibrary().then(({ songs }) => {
        const byId = new Map(songs.map((song) => [song.id, song]));
        rebuildSongScenes((scene) => (scene.songId ? byId.get(scene.songId) : undefined));
      }).catch(() => setSourceError('Could not apply the song style.'));
    };
    window.addEventListener(SONG_SAVED_EVENT, onSongSaved);
    window.addEventListener(SONG_SLIDE_SETTINGS_EVENT, onSettingsChanged);
    setScenes(upgradeSongScenes);
    setSlideshowScenes(upgradeSongScenes);
    return () => {
      window.removeEventListener(SONG_SAVED_EVENT, onSongSaved);
      window.removeEventListener(SONG_SLIDE_SETTINGS_EVENT, onSettingsChanged);
    };
  }, []);

  // Fix typos in the slide that is in Preview, before it goes on air.
  useEffect(() => {
    if (studioOutputTab !== 'stream') return;
    slideCardRefs.current.get(`${selected.sceneId}:${selected.slideIdx}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected.sceneId, selected.slideIdx, studioOutputTab]);

  // Keyboard navigation prepares the next slide. Enter sends it to the audience.
  const step = (dir: 1 | -1) => {
    const count = scenes.find((x) => x.id === selected.sceneId)?.slides.length ?? 0;
    if (count < 1) return;
    const i = (selected.slideIdx + dir + count) % count;
    if (i === selected.slideIdx) return;
    const target = { sceneId: selected.sceneId, slideIdx: i };
    prepareSlide(target);
  };

  const stepPreview = (dir: 1 | -1) => {
    const count = scenes.find((item) => item.id === preview.sceneId)?.slides.length ?? 0;
    if (count < 1) return;
    const slideIdx = (preview.slideIdx + dir + count) % count;
    if (slideIdx === preview.slideIdx) return;
    const target = { sceneId: preview.sceneId, slideIdx };
    prepareSlide(target);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')
        || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return; // Keep typing and slider keys inside their controls.
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLocaleLowerCase() === 'b') {
        e.preventDefault();
        openScripturePicker();
        return;
      }
      if (e.key === 'Escape' && slidesExpanded) {
        e.preventDefault();
        setSlidesExpanded(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLocaleLowerCase() === 'e') {
        e.preventDefault();
        setSlidesExpanded((expanded) => !expanded);
        return;
      }
      if (studioOutputTab === 'stream' && e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'A') {
        e.preventDefault();
        setOnAir(preview);
        return;
      }
      if (studioOutputTab === 'stream' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        stepPreview(direction);
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
  }, [studioOutputTab, selected, scenes, preview, onAir, quickShowLiveSlides, sceneId, offlineSlide, slidesExpanded]);

  const toggleSource = (id: number) => {
    const source = sources.find((item) => item.id === id);
    if (!source) return;
    if (['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind)) {
      setPreviewSetupVisibility((current) => ({ ...current, [id]: !(current[id] ?? source.visible) }));
      return;
    }
    const visible = !source.visible;
    if (source.mobileCamSourceId !== undefined) setPreviewSetupVisibility((current) => ({ ...current, [id]: visible }));
    if (source.kind === 'microphone' || source.kind === 'desktop-audio' || source.kind === 'music') {
      const muted = channels.find((channel) => channel.id === id)?.muted ?? false;
      source.stream?.getAudioTracks().forEach((track) => { track.enabled = visible && !muted; });
    }
    setSources((list) => list.map((item) => (item.id === id ? { ...item, visible } : item)));
  };

  const createSource = (kind: SourceKind, details: Partial<Source> = {}) => {
    const option = SOURCE_OPTIONS.find((item) => item.kind === kind);
    if (!option) return null;
    const stageVisualSource = ['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(kind);
    const count = sceneSources.filter((source) => source.kind === kind).length + 1;
    const newSource: Source = {
      id: Math.max(0, ...sources.map((source) => source.id)) + 1,
      sceneId,
      shared: true,
      kind,
      name: details.name ?? (count > 1 && kind !== 'text' && kind !== 'presentation' ? `${option.name} ${count}` : option.name),
      layout: kind === 'camera' || kind === 'mobile-camera'
        ? { x: 100 - count * 24, y: 72, width: 22, height: 22 }
        : kind === 'presentation'
        ? { x: 0, y: 0, width: 100, height: 100 }
        : kind === 'text'
        ? { x: 10, y: 68, width: 80, height: 24 }
        : kind === 'screen'
          ? { x: 0, y: 0, width: 100, height: 100 }
          : { x: 8 + ((count - 1) % 3) * 8, y: 8 + ((count - 1) % 3) * 8, width: 42, height: 42 },
      ...details,
      // New picture layers are staged in Preview; they must not alter Program until Take.
      visible: stageVisualSource ? false : details.visible ?? true,
    };
    setSources((list) => stageVisualSource ? [newSource, ...list] : [...list, newSource]);
    if (stageVisualSource) setPreviewSetupVisibility((current) => ({ ...current, [newSource.id]: true }));
    if (kind === 'microphone' || kind === 'desktop-audio' || kind === 'music') {
      setChannels((list) => [...list, {
        id: newSource.id,
        sceneId,
        name: newSource.name,
        icon: kind === 'microphone' ? Mic : kind === 'music' ? Music2 : Volume2,
        db: -6,
        muted: false,
        pan: 0,
        compressor: false,
        compressorThreshold: -18,
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
    // Read the selected saved deck at take time to cover route changes and missed events.
    const targetScene = refreshSceneFromSavedPresentations(previewSetupRef.sceneId, true);
    const targetRef = targetScene
      ? { sceneId: targetScene.id, slideIdx: Math.min(previewSetupRef.slideIdx, Math.max(0, targetScene.slides.length - 1)) }
      : previewSetupRef;
    setSources((current) => current.map((source) => {
      const linkedCamera = source.mobileCamSourceId === undefined ? undefined : current.find((item) => item.id === source.mobileCamSourceId);
      const linkedCameraVisible = linkedCamera ? (previewSetupVisibility[linkedCamera.id] ?? linkedCamera.visible) : undefined;
      return {
        ...source,
        ...(previewSetupLayouts[source.id] ? { layout: previewSetupLayouts[source.id] } : {}),
        ...(previewSetupVisibility[source.id] !== undefined ? { visible: previewSetupVisibility[source.id] } : linkedCameraVisible !== undefined ? { visible: linkedCameraVisible } : {}),
      };
    }));
    setPreview(targetRef);
    setOnAir(targetRef);
    setSelectedProgramSource(null);
  };

  const showCameraOnly = (cameraId?: number) => {
    const availableCameras = previewSceneSources.filter((source) => source.kind === 'camera' || source.kind === 'mobile-camera');
    const targetCameraId = cameraId ?? selectedProgramSource;
    const camera = availableCameras.find((source) => source.id === targetCameraId);
    if (!camera) return;
    setCameraOnlySnapshot((current) => current?.sceneId === previewSetupRef.sceneId ? current : {
      sceneId: previewSetupRef.sceneId,
      sources: previewSceneSources
        .filter((source) => ['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind))
        .map((source) => ({ id: source.id, visible: isPreviewSourceVisible(source), layout: getPreviewSetupLayout(source) })),
    });
    setPreviewSetupVisibility((current) => Object.fromEntries(previewSceneSources
      .filter((source) => ['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind))
      .map((source) => [source.id, source.id === camera.id])));
    setPreviewSetupLayouts((current) => ({ ...current, [camera.id]: { x: 0, y: 0, width: 100, height: 100 } }));
    setSelectedProgramSource(camera.id);
  };

  const undoCameraOnly = () => {
    if (!cameraOnlySnapshot) return;
    setPreviewSetupVisibility((current) => ({ ...current, ...Object.fromEntries(cameraOnlySnapshot.sources.map((item) => [item.id, item.visible])) }));
    setPreviewSetupLayouts((current) => ({ ...current, ...Object.fromEntries(cameraOnlySnapshot.sources.filter((item) => item.layout).map((item) => [item.id, item.layout!])) }));
    setSelectedProgramSource(null);
    setCameraOnlySnapshot(null);
  };

  const showCameraWithCurrentLayers = (cameraId: number) => {
    if (cameraOnlySnapshot?.sceneId === previewSetupRef.sceneId) {
      const visualSources = previewSceneSources.filter((source) => ['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(source.kind));
      setPreviewSetupVisibility((current) => Object.fromEntries(visualSources.map((source) => [source.id, source.id === cameraId])));
      setPreviewSetupLayouts((current) => ({ ...current, [cameraId]: { x: 0, y: 0, width: 100, height: 100 } }));
      setSelectedProgramSource(cameraId);
      return;
    }
    setPreviewSetupVisibility((current) => ({ ...current, [cameraId]: true }));
    setSelectedProgramSource(cameraId);
  };

  const publishStudioNotification = (title: string, message: string, kind: 'info' | 'error' = 'info') => {
    const notification = { id: crypto.randomUUID(), title, message, createdAt: Date.now(), read: false, kind };
    try {
      const saved = JSON.parse(localStorage.getItem('faithstream.notifications') ?? '[]') as Array<typeof notification>;
      localStorage.setItem('faithstream.notifications', JSON.stringify([notification, ...saved].slice(0, 30)));
    } catch { /* The in-app event below still delivers the notification. */ }
    window.dispatchEvent(new CustomEvent('faithstream:notification', { detail: notification }));
  };

  const notifyMobileCamStatus = (connected: boolean, sourceId?: number) => {
    if (sourceId !== undefined) {
      setSources((list) => list.map((source) => source.id === sourceId ? { ...source, connectionStatus: connected ? 'connected' : 'disconnected' } : source));
    }
    const statusKey = sourceId ?? 0;
    const previous = mobileCamConnectedState.current.get(statusKey);
    if (previous === connected) return;
    mobileCamConnectedState.current.set(statusKey, connected);
    if (!connected && previous !== true) return;
    publishStudioNotification(
      connected ? 'FaithStream Cam connected' : 'FaithStream Cam disconnected',
      connected ? 'The phone camera is connected and ready in Studio.' : 'The phone camera lost its connection. Use Reconnect in Sources to pair it again.',
      connected ? 'info' : 'error',
    );
  };

  const captureStream = async (
    kind: SourceKind,
    sourceId?: number,
    preferredDeviceId?: string,
    onPhoneOrientation?: (orientation: 'portrait' | 'landscape') => void,
    mobileCamSlot?: MobileCamSlot,
  ): Promise<{ stream: MediaStream; deviceId?: string; deviceName?: string; cleanup?: () => void; phoneOrientation?: 'portrait' | 'landscape' } | undefined> => {
    if (!navigator.mediaDevices) throw new Error('Media capture is unavailable in this window.');
    if (kind === 'mobile-camera') {
      if (sourceId === undefined || mobileCamSlot === undefined) throw new Error('Could not identify this FaithStream Cam source.');
      const pairing = await window.faithstreamWindow?.startMobileCamPairing(sourceId);
      if (!pairing?.ok || !pairing.port || !pairing.code || !pairing.expiresAt) throw new Error(pairing?.message || 'Could not start local camera pairing.');
      if (!pairing.addresses?.length) {
        void window.faithstreamWindow?.stopMobileCamPairing(sourceId);
        throw new Error('No local Wi-Fi address was found. Connect this computer to the same Wi-Fi as your phone and try again.');
      }
      const pairingDetails = { sourceId, slot: mobileCamSlot, port: pairing.port, code: pairing.code, addresses: pairing.addresses, expiresAt: pairing.expiresAt };
      mobileCamPairingDetails.current.set(sourceId, pairingDetails);
      setMobileCamPairing({ ...pairingDetails, connected: false, remainingSeconds: 180 });
      return await new Promise<{ stream: MediaStream; deviceName: string; cleanup: () => void; phoneOrientation?: 'portrait' | 'landscape' }>((resolve, reject) => {
        const pairingStartedAt = Date.now();
        const socket = new WebSocket(`ws://127.0.0.1:${pairing.port}/?code=${pairing.code}&role=studio`);
        const peer = new RTCPeerConnection({ iceServers: [] });
        const queuedIce: RTCIceCandidateInit[] = [];
        let hasRemoteDescription = false;
        let finished = false;
        let intentionallyClosed = false;
        let remoteStream: MediaStream | null = null;
        let phoneOrientation: 'portrait' | 'landscape' = 'portrait';
        let readyTimer: number | undefined;
        let readyScheduled = false;
        const discardPairing = () => {
          mobileCamPairingDetails.current.delete(sourceId);
          void window.faithstreamWindow?.stopMobileCamPairing(sourceId);
          setMobileCamPairing((current) => current?.sourceId === sourceId ? null : current);
        };
        const cleanup = () => {
          intentionallyClosed = true;
          window.clearTimeout(timeout); if (readyTimer !== undefined) window.clearTimeout(readyTimer); peer.close(); socket.close();
          void window.faithstreamWindow?.stopMobileCamPairing(sourceId);
        };
        const timeout = window.setTimeout(() => {
          if (finished) return;
          finished = true; if (readyTimer !== undefined) window.clearTimeout(readyTimer); peer.close(); socket.close();
          discardPairing();
          reject(new Error('Phone camera did not connect. Check both devices are on the same Wi-Fi and the computer firewall allows FaithStream Studio.'));
        }, 120_000);
        peer.addTransceiver('video', { direction: 'recvonly' });
        peer.addTransceiver('audio', { direction: 'recvonly' });
        peer.onicecandidate = (event) => { if (event.candidate && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ice', candidate: event.candidate.toJSON() })); };
        peer.onconnectionstatechange = () => {
          if (intentionallyClosed) return;
          if (peer.connectionState === 'connected') notifyMobileCamStatus(true, sourceId);
          else if (remoteStream && ['disconnected', 'failed'].includes(peer.connectionState)) notifyMobileCamStatus(false, sourceId);
        };
        peer.ontrack = (event) => {
          const incoming = event.streams[0] ?? new MediaStream([event.track]);
          if (!remoteStream) remoteStream = incoming;
          else if (incoming !== remoteStream) {
            incoming.getTracks().forEach((track) => {
              if (!remoteStream?.getTracks().some((current) => current.id === track.id)) remoteStream?.addTrack(track);
            });
          }
          const activeRemoteStream = remoteStream;
          const refreshSourceHealth = () => {
            if (intentionallyClosed || !activeRemoteStream || !activeRemoteStream.getTracks().includes(event.track)) return;
            const connected = activeRemoteStream.getVideoTracks().some((track) => track.readyState === 'live' && !track.muted);
            notifyMobileCamStatus(connected, sourceId);
            if (sourceId !== undefined) setSources((list) => list.map((item) => item.id === sourceId && activeRemoteStream ? { ...item, stream: activeRemoteStream } : item));
          };
          event.track.addEventListener('mute', refreshSourceHealth);
          event.track.addEventListener('unmute', refreshSourceHealth);
          event.track.addEventListener('ended', refreshSourceHealth);
          if (!finished && activeRemoteStream?.getVideoTracks().some((track) => track.readyState === 'live')) {
            if (!readyScheduled) {
              readyScheduled = true;
              setMobileCamPairing((current) => current?.sourceId === sourceId ? { ...current, connected: true } : current);
              readyTimer = window.setTimeout(() => {
                const readyStream = remoteStream;
                if (intentionallyClosed || !readyStream?.getVideoTracks().some((track) => track.readyState === 'live')) {
                  readyScheduled = false;
                  setMobileCamPairing((current) => current?.sourceId === sourceId ? { ...current, connected: false } : current);
                  return;
                }
                finished = true; window.clearTimeout(timeout);
                notifyMobileCamStatus(true, sourceId);
                setMobileCamPairing(null);
                resolve({ stream: readyStream, deviceName: `FaithStream Cam ${mobileCamSlot}`, cleanup, phoneOrientation });
              }, Math.max(0, 1000 - (Date.now() - pairingStartedAt)));
            }
            return;
          }
          const hasLiveVideo = activeRemoteStream.getVideoTracks().some((track) => track.readyState === 'live');
          if (!hasLiveVideo) return;
          notifyMobileCamStatus(true, sourceId);
          if (finished && sourceId !== undefined && activeRemoteStream) {
            sourceStreams.current.set(sourceId, activeRemoteStream);
            setSources((list) => list.map((item) => item.id === sourceId ? { ...item, stream: activeRemoteStream } : item));
          }
        };
        socket.onerror = () => {
          if (finished) return;
          finished = true; window.clearTimeout(timeout); if (readyTimer !== undefined) window.clearTimeout(readyTimer); peer.close();
          discardPairing();
          reject(new Error('Could not open the local camera connection. Allow FaithStream Studio through the computer firewall.'));
        };
        socket.onclose = () => {
          if (!finished) {
            finished = true; window.clearTimeout(timeout); if (readyTimer !== undefined) window.clearTimeout(readyTimer); peer.close();
            discardPairing();
            reject(new Error('Phone camera pairing was canceled or disconnected.'));
          } else {
            setMobileCamPairing((value) => value ? { ...value, connected: false } : value);
            if (remoteStream && !intentionallyClosed) notifyMobileCamStatus(false, sourceId);
          }
        };
        socket.onmessage = async (event) => {
          let message: { type?: string; sdp?: string; candidate?: RTCIceCandidateInit; orientation?: 'portrait' | 'landscape' };
          try { message = JSON.parse(String(event.data)); } catch { return; }
          if (message.type === 'phone-disconnected') {
            notifyMobileCamStatus(false, sourceId);
          } else if (message.type === 'orientation' && (message.orientation === 'portrait' || message.orientation === 'landscape')) {
            phoneOrientation = message.orientation;
            onPhoneOrientation?.(phoneOrientation);
            if (sourceId !== undefined) {
              setSources((list) => list.map((item) => item.id === sourceId ? { ...item, phoneOrientation } : item));
            }
          } else if (message.type === 'peer-ready') {
            queuedIce.length = 0;
            hasRemoteDescription = false;
            const offer = await peer.createOffer({ iceRestart: remoteStream !== null }); await peer.setLocalDescription(offer);
            socket.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
          } else if (message.type === 'answer' && message.sdp) {
            await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp });
            hasRemoteDescription = true;
            for (const candidate of queuedIce.splice(0)) { try { await peer.addIceCandidate(candidate); } catch { /* Ignore stale ICE candidates. */ } }
          } else if (message.type === 'ice' && message.candidate) {
            if (!hasRemoteDescription) queuedIce.push(message.candidate);
            else { try { await peer.addIceCandidate(message.candidate); } catch { /* Ignore stale ICE candidates. */ } }
          }
        };
      });
    }
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
      const microphoneSource = sources.find((source) => source.id === sourceId);
      const noiseSuppression = microphoneSource?.mobileCamSourceId !== undefined ? true : microphoneSource?.noiseSuppression ?? true;
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput');
      const device = preferredDeviceId ? devices.find((item) => item.deviceId === preferredDeviceId) : undefined;
      if (preferredDeviceId && !device) throw new Error('That microphone is no longer available. Choose another input device.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { ...(device ? { deviceId: { exact: device.deviceId } } : {}), noiseSuppression, echoCancellation: true, autoGainControl: true },
      });
      const track = stream.getAudioTracks()[0];
      return { stream, deviceId: track?.getSettings().deviceId || device?.deviceId, deviceName: track?.label || device?.label };
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
    let mobileCamSlot: MobileCamSlot | undefined;
    if (kind === 'mobile-camera') {
      mobileCamSlot = ([1, 2, 3] as const).find((slot) =>
        !sources.some((source) => source.kind === 'mobile-camera' && source.mobileCamSlot === slot) && !mobileCamPendingSlots.current.has(slot),
      );
      if (!mobileCamSlot) {
        setSourceError('You can connect up to 3 FaithStream Cam phones. Remove a phone source to add another.');
        return;
      }
      mobileCamPendingSlots.current.add(mobileCamSlot);
    }
    try {
      const sourceId = Math.max(0, ...sources.map((source) => source.id)) + 1;
      const captured = await captureStream(kind, sourceId, undefined, (orientation) => {
        setSources((list) => list.map((item) => item.id === sourceId ? { ...item, phoneOrientation: orientation } : item));
      }, mobileCamSlot);
      const stream = captured?.stream;
      const source = createSource(kind, {
        id: sourceId,
        ...(mobileCamSlot ? { mobileCamSlot, name: `FaithStream Cam ${mobileCamSlot}` } : {}),
        ...(stream ? { stream } : {}),
        ...(captured?.deviceId ? { deviceId: captured.deviceId } : {}),
        ...(captured?.deviceName ? { name: captured.deviceName } : {}),
        ...(captured && 'phoneOrientation' in captured && captured.phoneOrientation ? { phoneOrientation: captured.phoneOrientation } : {}),
        ...(kind === 'mobile-camera' && stream ? { connectionStatus: 'connected' as const } : {}),
        ...(kind === 'text' ? { text: 'Text overlay' } : {}),
        ...(kind === 'microphone' ? { noiseSuppression: true } : {}),
      });
      if (source && stream) {
        sourceStreams.current.set(source.id, stream);
        if (captured?.cleanup) sourceCleanups.current.set(source.id, captured.cleanup);
        stream.getTracks().forEach((track) => {
          const refreshSourceHealth = () => {
            if (sourceStreams.current.get(source.id) !== stream) return;
            setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream } : item));
          };
          track.addEventListener('mute', refreshSourceHealth);
          track.addEventListener('unmute', refreshSourceHealth);
          track.addEventListener('ended', () => {
            if (sourceStreams.current.get(source.id) !== stream) return;
            if (stream.getTracks().some((item) => item.readyState === 'live')) return;
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
      if (kind === 'mobile-camera') publishStudioNotification('FaithStream Cam pairing failed', message, 'error');
      else setSourceError(message);
    } finally {
      if (mobileCamSlot) mobileCamPendingSlots.current.delete(mobileCamSlot);
    }
  };

  const addMediaSource = async (file?: File) => {
    if (!file) return;
    setSourceError('');
    setMediaPreparing(file.name);
    const id = Math.max(0, ...sources.map((source) => source.id)) + 1;
    const mediaAssetId = `studio-source-${id}-${Date.now()}`;
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    try {
      const prepared = await prepareMediaFile(file);
      await saveStudioMedia({ id: mediaAssetId, type, blob: prepared.file, originalBlob: prepared.originalFile, optimized: !!prepared.originalFile });
      const url = URL.createObjectURL(prepared.file);
      sourceObjectUrls.current.push(url);
      setMediaUrls((current) => ({ ...current, [mediaAssetId]: { type, url, sizeBytes: prepared.file.size, originalBytes: prepared.originalFile?.size, optimized: !!prepared.originalFile } }));
      createSource('media', { id, name: file.name, mediaAssetId, loop: true });
      setMediaPreparing('');
    } catch {
      setMediaPreparing('');
      setSourceError('Could not save that media file locally. Please try another file.');
    }
  };

  const addMusicAssetAsSource = (asset: StudioMusicAssetWithUrl) => {
    if (asset.available === false) return;
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
      const result = await window.faithstreamWindow?.registerStudioMusicFile(file);
      if (!result?.ok || !result.asset) throw new Error(result?.message ?? 'Could not access this audio file.');
      const asset: StudioMusicAssetWithUrl = { ...result.asset, createdAt: Date.now() };
      saveStudioMusicFiles([asset, ...readSavedStudioMusicFiles().filter((item) => item.id !== asset.id)]);
      setMusicAssets((current) => [asset, ...current]);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'Could not add this audio file. Check that it still exists.');
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
    audio.crossOrigin = 'anonymous';
    const source = sources.find((item) => item.kind === 'music' && item.mediaAssetId === asset.id);
    const channel = source ? channels.find((item) => item.id === source.id) : undefined;
    audio.volume = channel ? Math.max(0, Math.min(1, channelGain(channel.db))) : 1;
    audio.muted = !!channel && (channel.muted || !source?.visible);
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
    setSourceError('');
    if (source.kind === 'microphone' && source.mobileCamSourceId !== undefined) {
      const cameraSource = sourcesRef.current.find((item) => item.id === source.mobileCamSourceId && item.kind === 'mobile-camera');
      if (cameraSource) await reconnectSource(cameraSource);
      else setSourceError('The FaithStream Cam source for this microphone was removed. Re-add the phone camera to reconnect its audio.');
      return;
    }
    const pairingDetails = source.kind === 'mobile-camera' ? mobileCamPairingDetails.current.get(source.id) : undefined;
    if (source.kind === 'mobile-camera' && pairingDetails) {
      setMobileCamPairing({ ...pairingDetails, connected: false, reconnecting: true, remainingSeconds: Math.max(0, Math.ceil((pairingDetails.expiresAt - Date.now()) / 1000)) });
      return;
    }
    setReconnectingSourceId(source.id);
    try {
      const captured = await captureStream(source.kind, source.id, source.deviceId, undefined, source.mobileCamSlot);
      const stream = captured?.stream;
      if (!stream) return;
      sourceStreams.current.set(source.id, stream);
      if (captured.cleanup) sourceCleanups.current.set(source.id, captured.cleanup);
      stream.getTracks().forEach((track) => {
        const refreshSourceHealth = () => {
          if (sourceStreams.current.get(source.id) !== stream) return;
          setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream } : item));
        };
        track.addEventListener('mute', refreshSourceHealth);
        track.addEventListener('unmute', refreshSourceHealth);
        track.addEventListener('ended', () => {
          if (sourceStreams.current.get(source.id) !== stream) return;
          if (stream.getTracks().some((item) => item.readyState === 'live')) return;
          sourceStreams.current.delete(source.id);
          setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream: undefined } : item));
        }, { once: true });
      });
      setSources((list) => list.map((item) => item.id === source.id ? { ...item, stream, ...(captured.deviceId ? { deviceId: captured.deviceId } : {}) } : item));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reconnect this source.';
      if (error instanceof DOMException && error.name === 'NotAllowedError') return;
      if (source.kind === 'mobile-camera') publishStudioNotification('FaithStream Cam pairing failed', message, 'error');
      else setSourceError(message);
    } finally {
      setReconnectingSourceId(null);
    }
  };

  const selectMicrophoneDevice = async (sourceId: number, requestedDeviceId: string) => {
    const source = sources.find((item) => item.id === sourceId && item.kind === 'microphone');
    if (!source || microphoneSwitchingId !== null) return;
    setAudioError('');
    setMicrophoneSwitchingId(sourceId);
    let replacement: MediaStream | undefined;
    let replacementUsesRemoteTrack = false;
    try {
      if (requestedDeviceId === source.deviceId) return;
      let selectedDeviceId = requestedDeviceId;
      let selectedDeviceName = '';
      let selectedMobileCamSourceId: number | undefined;
      if (requestedDeviceId.startsWith('faithstream-cam-audio:')) {
        const cameraSourceId = Number(requestedDeviceId.slice('faithstream-cam-audio:'.length));
        const cameraSource = sources.find((item) => item.kind === 'mobile-camera' && item.id === cameraSourceId);
        const liveTracks = cameraSource?.stream?.getAudioTracks().filter((item) => item.readyState === 'live') ?? [];
        if (!cameraSource || liveTracks.length === 0) throw new Error('That FaithStream Cam microphone is disconnected. Reconnect the phone and try again.');
        replacement = new MediaStream(liveTracks);
        replacementUsesRemoteTrack = true;
        selectedMobileCamSourceId = cameraSourceId;
        selectedDeviceName = `${cameraSource.name} audio`;
      } else {
        const captured = await captureStream('microphone', sourceId, requestedDeviceId || undefined);
        if (!captured?.stream) throw new Error('Could not open the selected microphone. Choose another input device.');
        replacement = captured.stream;
        selectedDeviceId = captured.deviceId ?? requestedDeviceId;
        selectedDeviceName = captured.deviceName ?? '';
      }
      const track = replacement?.getAudioTracks().find((item) => item.readyState === 'live');
      if (!track) throw new Error('The selected device did not provide an audio signal. Choose another microphone.');

      const oldStream = sourceStreams.current.get(sourceId) ?? source.stream;
      const channel = channels.find((item) => item.id === sourceId);
      replacement.getAudioTracks().forEach((item) => { item.enabled = source.visible && !(channel?.muted ?? false); });
      const disconnect = (input: Map<number, MediaStreamAudioSourceNode>, gain: Map<number, GainNode>, panner: Map<number, StereoPannerNode>, compressor: Map<number, DynamicsCompressorNode>) => {
        input.get(sourceId)?.disconnect(); input.delete(sourceId);
        gain.get(sourceId)?.disconnect(); gain.delete(sourceId);
        panner.get(sourceId)?.disconnect(); panner.delete(sourceId);
        compressor.get(sourceId)?.disconnect(); compressor.delete(sourceId);
      };
      disconnect(liveAudioInputs.current, liveAudioGains.current, liveAudioPanners.current, liveAudioCompressors.current);
      disconnect(recordingAudioInputs.current, recordingAudioGains.current, recordingAudioPanners.current, recordingAudioCompressors.current);
      sourceStreams.current.set(sourceId, replacement);
      replacement.getTracks().forEach((item) => {
        item.addEventListener('ended', () => {
          if (sourceStreams.current.get(sourceId) !== replacement) return;
          if (replacement?.getTracks().some((liveTrack) => liveTrack.readyState === 'live')) return;
          sourceStreams.current.delete(sourceId);
          setSources((list) => list.map((entry) => entry.id === sourceId ? { ...entry, stream: undefined } : entry));
        }, { once: true });
      });
      setSources((list) => list.map((item) => item.id === sourceId ? { ...item, stream: replacement!, deviceId: selectedDeviceId || undefined, mobileCamSourceId: selectedMobileCamSourceId, noiseSuppression: selectedMobileCamSourceId === undefined, ...(selectedDeviceName ? { name: selectedDeviceName } : {}) } : item));
      if (selectedDeviceName) setChannels((list) => list.map((item) => item.id === sourceId ? { ...item, name: selectedDeviceName } : item));
      if (!source.mobileCamSourceId) oldStream?.getTracks().forEach((item) => item.stop());
    } catch (error) {
      if (!replacementUsesRemoteTrack) replacement?.getTracks().forEach((item) => item.stop());
      setAudioError(error instanceof Error ? error.message : 'Could not switch the microphone input.');
    } finally {
      setMicrophoneSwitchingId(null);
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
    const source = sources.find((item) => item.id === id);
    const removingIds = new Set([id]);
    musicElements.current.get(id)?.pause();
    musicElements.current.delete(id);
    musicStreams.current.delete(id);
    setMusicPlaying((current) => { const next = { ...current }; delete next[id]; return next; });
    if (!source?.mobileCamSourceId) sourceStreams.current.get(id)?.getTracks().forEach((track) => track.stop());
    removingIds.forEach((sourceId) => sourceStreams.current.delete(sourceId));
    sourceCleanups.current.get(id)?.();
    sourceCleanups.current.delete(id);
    if (source?.kind === 'mobile-camera') {
      mobileCamPairingDetails.current.delete(id);
      mobileCamConnectedState.current.delete(id);
      setMobileCamPairing((current) => current?.sourceId === id ? null : current);
      sources.filter((item) => item.kind === 'microphone' && item.mobileCamSourceId === id).forEach((item) => sourceStreams.current.delete(item.id));
    }
    setChannels((list) => list.filter((channel) => !removingIds.has(channel.id)));
    setSources((list) => list.filter((item) => !removingIds.has(item.id)).map((item) => item.kind === 'microphone' && item.mobileCamSourceId === id ? { ...item, stream: undefined } : item));
  };

  const deleteMusicAsset = async (asset: StudioMusicAssetWithUrl) => {
    try {
      await window.faithstreamWindow?.removeStudioMusicFile(asset.id);
      saveStudioMusicFiles(readSavedStudioMusicFiles().filter((item) => item.id !== asset.id));
      if (previewingMusicId === asset.id) {
        musicPreviewElement.current?.pause();
        musicPreviewElement.current = null;
        setPreviewingMusicId(null);
      }
      sources.filter((source) => source.kind === 'music' && source.mediaAssetId === asset.id).forEach((source) => removeSource(source.id));
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
    liveAudioProcessor.current?.disconnect();
    liveAudioProcessor.current = null;
    void liveAudioContext.current?.close();
    liveAudioContext.current = null;
    liveAudioDestination.current = null;
    liveAudioInputs.current.forEach((input) => input.disconnect());
    liveAudioInputs.current.clear();
    liveAudioGains.current.clear();
    liveAudioPanners.current.clear();
    liveAudioCompressors.current.clear();
  };

  const clearRecordingAudio = () => {
    recordingAudioRecorder.current = null;
    recordingAudioInputs.current.forEach((input) => input.disconnect());
    recordingAudioInputs.current.clear();
    recordingAudioGains.current.clear();
    recordingAudioPanners.current.clear();
    recordingAudioCompressors.current.clear();
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
      // Keep the WebM audio input valid even when no mixer channel is active.
      // FFmpeg still expects a complete audio stream when finalizing the MP4.
      const silence = context.createOscillator();
      const silenceGain = context.createGain();
      silenceGain.gain.value = 0;
      silence.connect(silenceGain).connect(destination);
      silence.start();
      mixerChannels.forEach((channel) => {
        const source = sources.find((item) => item.id === channel.id);
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (!tracks.length) return;
        const input = context!.createMediaStreamSource(new MediaStream(tracks));
        const compressor = context!.createDynamicsCompressor();
        const gain = context!.createGain();
        const panner = context!.createStereoPanner();
        gain.gain.value = source?.visible && !channel.muted ? channelGain(channel.db) : 0;
        compressor.threshold.value = channel.compressor ? channel.compressorThreshold : 0;
        compressor.ratio.value = channel.compressor ? 3 : 1;
        compressor.knee.value = channel.compressor ? 12 : 0;
        panner.pan.value = channel.pan;
        input.connect(compressor).connect(gain).connect(panner).connect(destination);
        recordingAudioInputs.current.set(channel.id, input);
        recordingAudioGains.current.set(channel.id, gain);
        recordingAudioPanners.current.set(channel.id, panner);
        recordingAudioCompressors.current.set(channel.id, compressor);
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
    else {
      void window.faithstreamWindow?.stopStream();
      stopLiveAudio();
      setGoLiveSetupOpen(true);
    }
  };

  const startLive = async () => {
    const bridge = window.faithstreamWindow;
    if (!bridge) {
      setStreamConnectError('Live streaming is only available in the FaithStream Studio desktop app.');
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
    if (startingStreamRef.current || live) return;

    startingStreamRef.current = true;
    setStartingStream(true);
    setStreamConnectError('');
    streamRenderErrorNotified.current = false;
    setSelectedProgramSource(null);
    let context: AudioContext | null = null;
    try {
      context = new AudioContext({ sampleRate: 48_000 });
      await context.resume();
      const mixedAudio = context.createGain();
      liveAudioDestination.current = mixedAudio;
      // Keep the mixed audio signal active when no audio sources are present.
      const silentSource = context.createOscillator();
      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      silentSource.connect(silentGain).connect(mixedAudio);
      silentSource.start();
      mixerChannels.forEach((channel) => {
        const source = sources.find((item) => item.id === channel.id);
        const tracks = source?.stream?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
        if (!tracks.length) return;
        const input = context!.createMediaStreamSource(new MediaStream(tracks));
        const compressor = context!.createDynamicsCompressor();
        const gain = context!.createGain();
        const panner = context!.createStereoPanner();
        gain.gain.value = source?.visible && !channel.muted ? channelGain(channel.db) : 0;
        compressor.threshold.value = channel.compressor ? channel.compressorThreshold : 0;
        compressor.ratio.value = channel.compressor ? 3 : 1;
        compressor.knee.value = channel.compressor ? 12 : 0;
        panner.pan.value = channel.pan;
        input.connect(compressor).connect(gain).connect(panner).connect(mixedAudio);
        liveAudioInputs.current.set(channel.id, input);
        liveAudioGains.current.set(channel.id, gain);
        liveAudioPanners.current.set(channel.id, panner);
        liveAudioCompressors.current.set(channel.id, compressor);
      });
      const output = programCanvasRef.current;
      if (!output) throw new Error('The On-air output is not ready.');
      const is1080 = streamResolution === '1080p';
      const width = is1080 ? 1920 : 1280;
      const height = is1080 ? 1080 : 720;
      const frameRate = Number(streamFrameRate);
      const result = await bridge.startStream({
        serverUrl: streamServerUrl.trim(),
        streamKey: streamKey.trim(),
        width,
        height,
        frameRate,
        bitrate: Number(streamBitrate),
      });
      if (!result.ok) throw new Error(result.message || 'Could not start the Facebook stream.');
      liveAudioContext.current = context;
      const processor = context.createScriptProcessor(4096, 2, 2);
      const silentOutput = context.createGain();
      silentOutput.gain.value = 0;
      mixedAudio.connect(processor);
      processor.connect(silentOutput).connect(context.destination);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer;
        const left = input.getChannelData(0);
        const right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
        const pcm = new Int16Array(left.length * 2);
        for (let index = 0; index < left.length; index += 1) {
          const leftSample = Math.max(-1, Math.min(1, left[index]));
          const rightSample = Math.max(-1, Math.min(1, right[index]));
          pcm[index * 2] = Math.round(leftSample * (leftSample < 0 ? 0x8000 : 0x7fff));
          pcm[index * 2 + 1] = Math.round(rightSample * (rightSample < 0 ? 0x8000 : 0x7fff));
        }
        bridge.sendStreamAudio(pcm.buffer);
      };
      liveAudioProcessor.current = processor;
      setStreamStatus('connecting');
      setLive(true);
      setGoLiveSetupOpen(false);
      setAudioMonitor(false);
    } catch (error) {
      try { await bridge.stopStream(); } catch { /* Release any process that did start before setup failed. */ }
      stopLiveAudio();
      void context?.close();
      setStreamStatus('error');
      const message = error instanceof Error ? error.message : 'Could not start streaming. Check the URL and stream key.';
      setStreamConnectError(message);
      setGoLiveSetupOpen(true);
    } finally {
      startingStreamRef.current = false;
      setStartingStream(false);
    }
  };

  /**
   * The Output display bar: monitor checklist, Close all and Show slides. The Streaming and
   * Slideshow tabs use this same bar, so they always look and work alike.
   */
  const outputDisplayBar = (mode: 'stream' | 'slideshow') => (
    <div className={`flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2 ${mode === 'stream' ? 'mb-2' : ''}`}>
      <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-500/15 px-2 py-1.5 text-[11px] font-semibold text-sky-200"><Monitor size={13} /> Output display</span>
      <MonitorPicker
        displays={studioDisplays}
        selectedIds={selectedStreamDisplayIds}
        liveIds={openDisplayIds}
        onToggle={toggleStreamDisplay}
        onSetAll={(ids) => setStreamDisplayIds(ids)}
      />
      {openDisplayIds.length > 0 && <button type="button" title="Close the output on every monitor" onClick={() => { void closeAllStreamDisplays(); }} className="flex h-8 shrink-0 items-center rounded-md border border-white/15 px-2.5 text-[11px] font-semibold text-warm-white/80 hover:bg-white/5">Close all</button>}
      <button
        type="button"
        aria-label="Show slides on selected monitors"
        title={mode === 'stream' ? 'Show the on-air slide on every selected monitor' : 'Show the slideshow on every selected monitor'}
        onClick={() => { void (mode === 'stream' ? openStreamDisplay() : openOfflineDisplay()); }}
        disabled={!selectedStreamDisplayIds.length}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-brand px-2.5 text-[11px] font-bold text-white shadow-lg shadow-brand/15 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Monitor size={13} /> Show slides{selectedStreamDisplayIds.length > 1 ? ` (${selectedStreamDisplayIds.length})` : ''}
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10">
        <UnderlineTabs
          label="Studio output"
          value={studioOutputTab}
          options={[
            { value: 'stream', label: 'Streaming' },
            { value: 'slideshow', label: 'Slideshow', disabled: live, title: live ? 'End the stream before switching to offline slideshow' : undefined },
          ]}
          onChange={(tab) => {
            setStudioOutputTab(tab);
            if (tab === 'slideshow') setSelectedProgramSource(null);
          }}
        />
        <div className="mb-1 flex shrink-0 items-center gap-1.5">
          <button type="button" onPointerEnter={() => preloadBible()} onFocus={() => preloadBible()} onClick={openScripturePicker} title="Open Scripture picker · Ctrl+Alt+B" aria-label="Open Scripture picker" className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-warm-white/75 transition hover:border-brand/40 hover:bg-brand/10 hover:text-brand">
            <BookOpen size={14} /> <span>Scripture</span>
          </button>
          <button type="button" onClick={() => { void openSelectedSceneDesign(); }} disabled={!canEditSelectedDesign} title={canEditSelectedDesign ? selectedDesignScene?.songId ? 'Edit this song’s design' : 'Edit this Scripture passage’s design' : 'Select a song or Scripture scene to edit its design'} className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-warm-white/75 transition hover:border-brand/40 hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-white/10 disabled:hover:bg-transparent disabled:hover:text-warm-white/75">
            <Pencil size={13} /> <span>Design</span>
          </button>
        </div>
      </div>
      {studioOutputTab === 'stream' ? (
      <>
      {/* Top row: takes all the leftover height */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(0,1.4fr)_minmax(190px,0.8fr)_minmax(180px,0.7fr)] gap-3">
        {/* On-air output remains separate from the Program setup and staging controls. */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="flex shrink-0 items-center justify-between px-1">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-warm-white/55">On air</span>
            <span className={`flex items-center gap-1.5 text-[10px] font-bold ${live ? 'text-red-300' : 'text-warm-white/40'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'animate-pulse bg-red-400' : 'bg-warm-white/30'}`} />{live ? 'LIVE' : 'STANDBY'}
            </span>
          </div>
          <Fit grow={3} className="border border-white/15 bg-black">
            <div
              ref={(element) => { programCanvasRef.current = element; onAirSlideRef.current = element; }}
              className="absolute isolate inset-0 overflow-hidden bg-black"
              style={{ containerType: 'inline-size' }}
            >
              <div className="absolute inset-0 bg-black" />
              <div aria-label={`On-air preview: ${live ? streamStatus === 'live' ? 'Live' : 'Connecting' : 'Standby'}`} className="pointer-events-none absolute left-2 top-2 z-30 flex items-center gap-1.5 rounded-md border border-white/20 bg-slate-950/90 px-2 py-1.5 text-white shadow-lg shadow-black/40 backdrop-blur-sm">
                <span className={`h-1.5 w-1.5 rounded-full ${live ? streamStatus === 'live' ? 'animate-pulse bg-red-400 shadow-[0_0_10px_rgba(248,113,113,.8)]' : 'animate-pulse bg-amber-300' : 'bg-slate-300'}`} />
                 <span className="text-[8px] font-extrabold uppercase tracking-widest">On Air</span>
                <span className={`rounded px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider ${live && streamStatus === 'live' ? 'bg-red-500 text-white' : live ? 'bg-amber-400/20 text-amber-100' : 'bg-white/15 text-white/90'}`}>
                  {live ? streamStatus === 'live' ? 'Live' : 'Connecting' : 'Standby'}
                </span>
              </div>
              {visibleProgramOverlays.map((source) => {
                const layout = getProgramLayout(source);
                const zIndex = onAirSceneSources.length - onAirSceneSources.findIndex((item) => item.id === source.id);
                return <div key={source.id} data-program-source-id={source.id} className="absolute" style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%`, zIndex }}>
                  <SourcePreview source={source} media={source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined} slide={airing.slide} bg={airing.bg} showLabel={false} rounded={false} />
                </div>;
              })}
            </div>
          </Fit>

          <section aria-label="On-air transition controls" className="shrink-0 rounded-xl border border-white/10 bg-panel p-3 shadow-inner shadow-black/10">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5"><span className="text-[11px] font-semibold text-warm-white/85">Transition</span><span className={`rounded px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${transitionEnabled ? 'bg-brand/10 text-brand/80' : 'bg-white/5 text-warm-white/40'}`}>{transitionEnabled ? 'On' : 'Off'}</span></div>
                <p className="mt-0.5 text-[9px] text-warm-white/40">Effect between on-air slides</p>
              </div>
              <button type="button" role="switch" aria-checked={transitionEnabled} aria-label="Apply transition on air" onClick={() => setTransitionEnabled((enabled) => !enabled)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${transitionEnabled ? 'bg-brand/70' : 'bg-white/15'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${transitionEnabled ? 'translate-x-[18px]' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className={`mt-2 grid grid-cols-[minmax(0,1fr)_minmax(92px,0.8fr)] items-end gap-3 ${transitionEnabled ? '' : 'opacity-55'}`}>
              <label className="block text-[9px] text-warm-white/45">Style
                <select aria-label="Transition style" value={transition} onChange={(event) => setTransition(event.target.value as TransitionStyle)} className="mt-1 w-full rounded-md border border-white/10 bg-[#0b1520] px-2 py-1.5 text-[10px] text-warm-white/80 outline-none focus:border-white/25">
                  {transitionOptions.map((kind) => <option key={kind} value={kind}>{kind === 'Wipe' ? 'Wipe · left to right' : kind === 'Zoom' ? 'Zoom · soft push' : kind}</option>)}
                </select>
              </label>
              <label className="block text-[9px] text-warm-white/45">
                <span className="flex items-center justify-between">Duration <span className="font-semibold tabular-nums text-warm-white/65">{duration.toFixed(1)}s</span></span>
                <input aria-label="Transition duration" type="range" min={0.2} max={2} step={0.1} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-2 w-full accent-brand/70" />
              </label>
            </div>
          </section>

          <section aria-label="Choose camera" className="shrink-0 rounded-xl border border-white/10 bg-panel p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-[10px] font-semibold text-warm-white/75">Cameras</h3>
              <span className="text-[10px] text-warm-white/45">{previewSceneSources.filter((source) => source.kind === 'camera' || source.kind === 'mobile-camera').length}</span>
            </div>
            {previewSceneSources.some((source) => source.kind === 'camera' || source.kind === 'mobile-camera') ? <div className="grid grid-cols-3 gap-2">
              {previewSceneSources.filter((source) => source.kind === 'camera' || source.kind === 'mobile-camera').map((source) => <button key={source.id} type="button" aria-pressed={isPreviewSourceVisible(source)} onClick={() => showCameraWithCurrentLayers(source.id)} title={`Add ${source.name} to the staged output`} className={`min-w-0 overflow-hidden rounded-lg border text-left ${selectedProgramSource === source.id ? 'border-sky-400 ring-1 ring-sky-400' : 'border-white/10 hover:border-white/30'}`}>
                <div className="aspect-video"><SourcePreview source={source} slide={previewSlide} bg={previewSetupSlide.bg} showLabel={false} rounded={false} /></div>
                <span className="block truncate px-1 py-0.5 text-[8px] text-warm-white/80">{source.name}</span>
              </button>)}
            </div> : <p className="rounded-lg border border-dashed border-white/10 p-1.5 text-center text-[9px] text-warm-white/45">Add a camera from Sources to choose it here.</p>}
          </section>
        </div>

        {/* Program shows the visual sources that will make up this scene. */}
        <Panel
          title="Program"
          className="min-w-0 overflow-hidden"
          action={<span className="rounded bg-sky-500/15 px-2 py-1 text-[10px] font-bold text-sky-200">NEXT UP</span>}
        >
          {outputDisplayBar('stream')}
          {displayError && studioOutputTab === 'stream' && <p role="alert" className="mb-2 shrink-0 text-[11px] text-amber-200">{displayError}</p>}
          <div data-program-control className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <p className="min-w-0 text-[10px] text-warm-white/50">Prepare what the audience will see next.</p>
            <div className="flex shrink-0 items-center gap-1">
              {orientationControlCamera && <select
                aria-label={`${orientationControlCamera.name} rotation`}
                title={`Rotate only ${orientationControlCamera.name} in the desktop output`}
                value={orientationControlCamera.cameraRotation ?? (orientationControlCamera.cameraOrientation === 'portrait' || orientationControlCamera.cameraOrientation === 'portrait-up' ? '0' : orientationControlCamera.cameraOrientation === 'upside-down' || orientationControlCamera.cameraOrientation === 'portrait-down' ? '180' : orientationControlCamera.cameraOrientation === 'landscape-left' ? '270' : orientationControlCamera.cameraOrientation === 'landscape-right' ? '90' : 'auto')}
                onChange={(event) => {
                  const value = event.currentTarget.value as CameraRotation;
                  setSources((list) => list.map((source) => source.id === orientationControlCamera.id
                    ? { ...source, cameraRotation: value === 'auto' ? undefined : value, cameraOrientation: undefined }
                    : source));
                }}
                 className="max-w-32.5 rounded border border-white/10 bg-slate-950 px-1.5 py-1 text-[10px] text-warm-white/75 outline-none focus:border-brand"
              >
                <option value="auto">Rotation: Auto</option>
                <option value="0">Upright · 0°</option>
                <option value="90">Clockwise · 90°</option>
                <option value="180">Upside down · 180°</option>
                <option value="270">Counterclockwise · 90°</option>
              </select>}
              {previewSceneSources.some((source) => source.kind === 'camera' || source.kind === 'mobile-camera') && (cameraOnlySnapshot
                ? <button type="button" aria-pressed="true" onClick={undoCameraOnly} className="rounded border border-white/10 px-2 py-1 text-[10px] text-warm-white/70 hover:border-brand">Exit camera only</button>
                : <button type="button" aria-pressed="false" disabled={!orientationControlCamera} title={orientationControlCamera ? `Show only ${orientationControlCamera.name}` : 'Select a camera first'} onClick={() => showCameraOnly(orientationControlCamera?.id)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-warm-white/70 hover:border-brand disabled:cursor-not-allowed disabled:opacity-40">Camera only</button>)}
            </div>
          </div>
          <div
            ref={previewSetupCanvasRef}
            className="relative mx-auto aspect-video w-full max-w-full shrink-0 overflow-hidden border border-white/15 bg-black touch-none"
            style={{ containerType: 'inline-size', width: 'min(100%, 45vh)' }}
            onPointerMove={moveProgramSource}
            onPointerUp={() => { previewSetupDrag.current = null; }}
            onPointerCancel={() => { previewSetupDrag.current = null; }}
            onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedProgramSource(null); }}
          >
            <div className="absolute inset-0 bg-black" />
            {previewSetupOverlays.map((source) => {
              const layout = getPreviewSetupLayout(source);
              const selectedLayer = selectedProgramSource === source.id;
              const zIndex = previewSceneSources.length - previewSceneSources.findIndex((item) => item.id === source.id);
              return <div key={source.id} role="button" tabIndex={0}
                aria-label={`${source.name}. Drag to position; drag the corner to resize in Program setup.`}
                onPointerDown={(event) => beginProgramSourceDrag(event, source, 'move')}
                onClick={() => setSelectedProgramSource(source.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedProgramSource(source.id); }}
                 className={`absolute cursor-move touch-none ${selectedLayer ? 'outline-2 outline-solid outline-sky-400' : 'hover:outline-1 hover:outline-solid hover:outline-white/60'}`}
                style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%`, zIndex }}>
                <SourcePreview source={source} media={source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined} slide={previewSlide} bg={previewSetupSlide.bg} showLabel={false} rounded={false} />
                {selectedLayer && <button type="button" aria-label={`Resize ${source.name}`} title="Drag to resize" onPointerDown={(event) => beginProgramSourceDrag(event, source, 'resize')} className="absolute -bottom-1.5 -right-1.5 z-30 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-sky-500 shadow" />}
              </div>;
            })}
          </div>
          <div className="mt-1.5 flex shrink-0 flex-col gap-1.5 rounded-md border border-white/10 bg-black/25 p-1.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold text-warm-white/80">Quick show slides</p>
                <p className="text-[9px] leading-snug text-warm-white/45">Only affects slides in the live scene. Other scenes wait.</p>
              </div>
              <button type="button" role="switch" aria-label="Quick show slides in the live scene" aria-checked={quickShowLiveSlides} onClick={() => setQuickShowLiveSlides((enabled) => !enabled)} title="When on, choosing a slide in the live scene shows it immediately. Other scenes still need Show to audience." className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${quickShowLiveSlides ? 'bg-sky-500' : 'bg-white/15'}`}>
                <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${quickShowLiveSlides ? 'translate-x-4' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2 rounded bg-white/[0.03] px-1.5 py-1">
              <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[10px] font-semibold ${same(preview, onAir) ? 'text-red-200' : 'text-sky-100'}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${same(preview, onAir) ? 'bg-red-400' : 'bg-sky-400'}`} />{same(preview, onAir) ? 'Live now' : 'Ready next'}</span>
              <button type="button" onClick={takePreviewSetupOnAir} title="Show the prepared scene and slide to the audience" className="flex min-h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded bg-brand px-2 py-1.5 text-xs font-bold text-white transition hover:brightness-110"><ArrowRight size={14} />Show to audience</button>
            </div>
          </div>
          {selectedProgramOverlay && selectedProgramLayout && <div data-program-layout-controls className="mt-1.5 flex shrink-0 items-end gap-1 rounded-lg border border-white/10 bg-black/20 p-1.5">
            <div className="mr-auto min-w-0 pb-1"><p className="truncate text-[9px] font-semibold text-warm-white">{selectedProgramOverlay.name}</p><p className="text-[8px] text-warm-white/45">Position and size</p></div>
            {([['X', 'x', 100 - selectedProgramLayout.width], ['Y', 'y', 100 - selectedProgramLayout.height], ['W', 'width', 100 - selectedProgramLayout.x], ['H', 'height', 100 - selectedProgramLayout.y]] as const).map(([label, key, max]) => <label key={key} className="flex w-10 shrink-0 flex-col gap-1 text-[8px] text-warm-white/55">{label}<input type="number" min={key === 'width' || key === 'height' ? 8 : 0} max={max} value={selectedProgramLayout[key]} onChange={(event) => updateProgramLayout(selectedProgramOverlay.id, { [key]: Number(event.currentTarget.value) })} className="w-full rounded border border-white/10 bg-slate-950 px-0.5 py-1 text-center text-[9px] text-white outline-none focus:border-sky-400" /></label>)}
          </div>}
        </Panel>

        <Panel title="Slides" className="min-w-0" action={<button type="button" onClick={() => setSlidesExpanded(true)} aria-label="Expand slides" title="Expand slides · Ctrl+Shift+E" className="rounded-md p-1.5 text-warm-white/60 transition hover:bg-white/10 hover:text-white"><Maximize2 size={15} /></button>}>
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
              return <div key={i} ref={(element) => { if (element) slideCardRefs.current.set(cardKey, element); else slideCardRefs.current.delete(cardKey); }} className="min-w-0 shrink-0" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }}>
                <button
                  onClick={() => selectSlide(i)}
                  title="Select to prepare. Quick show slides can show slides immediately in the scene that is already live."
                  aria-pressed={isSelected}
                  className={`relative block aspect-video w-full overflow-hidden rounded-lg border-2 transition ${isSelected ? 'border-brand ring-2 ring-brand/40' : 'border-white/10 hover:border-white/40'}`}
                >
                  <StudioSlideThumbnail bg={scene.bg} slide={sl} mediaUrls={mediaUrls} scale={8} minRem={0.5} />
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 text-[10px] font-semibold text-white">{i + 1}</span>
                  <div className="absolute right-1 top-1 flex flex-col items-end gap-0.5">
                    {isOnAir && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">Live now</span>}
                    {inPreview && !isOnAir && <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold text-white">Ready next</span>}
                  </div>
                </button>
                <p className="mt-1 truncate px-0.5 text-[11px] font-medium text-warm-white/80" title={sl.title?.trim() || `Slide ${i + 1}`}>{sl.title?.trim() || `Slide ${i + 1}`}</p>
              </div>;
            })}
          </div>
        </Panel>

        {/* Sidebar keeps Scenes and Music together while the active list uses the full height. */}
        <Panel
          title={sidebarPanel === 'scenes' ? 'Scenes' : musicView === 'songs' ? 'Songs' : 'Music'}
          className="min-w-0"
          action={
            sidebarPanel === 'scenes' ? (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setClearScenesTab('stream')} disabled={!scenes.length} title="Remove all scenes" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-red-300/80 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={12} />Clear all</button>
                <button aria-label="Add scene" onClick={beginAddScene} className="rounded p-1 text-warm-white/70 hover:bg-white/5 hover:text-brand"><Plus size={18} /></button>
              </div>
            ) : musicView === 'songs' ? null : (
              <button type="button" onClick={() => musicFileRef.current?.click()} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-warm-white/75 hover:bg-white/5 hover:text-white"><Plus size={14} /> Upload</button>
            )
          }
        >
          <input ref={musicFileRef} type="file" accept="audio/*" className="hidden" onChange={(event) => { void importMusicFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
          <SegmentedTabs
            label="Studio sidebar panels"
            value={sidebarPanel}
            options={[{ value: 'scenes', label: 'Scenes' }, { value: 'music', label: 'Music' }]}
            onChange={setSidebarPanel}
            className="mb-2"
          />
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
                    <StudioSlideThumbnail bg={s.bg} slide={s.slides[0]} mediaUrls={mediaUrls} scale={4} minRem={0.4} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-medium text-warm-white">
                      {s.songId ? <Music2 size={13} aria-label="Song" className="shrink-0 text-sky-300" /> : null}
                      <span className="truncate">{s.songId ? s.name : `${s.id} ${s.name}`}</span>
                    </p>
                    <p className="truncate text-xs text-warm-white/50">{s.desc}</p>
                  </div>
                  {onAir.sceneId === s.id && (
                    <span aria-label="Live now" title="Live now" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                  )}
                  {sceneId === s.id && onAir.sceneId !== s.id && (
                    <span aria-label="Ready next" className="shrink-0 rounded bg-sky-600 px-1.5 py-0.5 text-[9px] font-bold text-white">NEXT</span>
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
          <UnderlineTabs
            label="Music"
            value={musicView}
            options={[{ value: 'songs', label: 'Songbooks' }, { value: 'tracks', label: 'Audio tracks' }]}
            onChange={setMusicView}
            className="mb-2 gap-3 px-1"
            buttonClassName="-mb-px px-0 pb-1.5 pt-0 text-[11px]"
          />
          {musicView === 'songs' ? (() => {
            const liveScene = scenes.find((item) => item.id === onAir.sceneId);
            const liveSong = liveScene?.songId ? { id: liveScene.songId, index: onAir.slideIdx } : null;
            return <StudioSongsPanel liveSongId={liveSong?.id} liveScreenIndex={liveSong?.index} sceneSongIds={scenes.map((scene) => scene.songId).filter((id): id is string => !!id)} onAddToScenes={addSongScene} />;
          })() : <>
          {musicAssets.length ? (
            <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
              {musicAssets.map((asset) => {
                const added = sceneSources.some((source) => source.kind === 'music' && source.mediaAssetId === asset.id);
                return <li key={asset.id} className="flex min-w-0 items-center gap-1 rounded-lg px-1 py-1 hover:bg-white/5">
                  <button type="button" disabled={asset.available === false} onClick={() => previewMusic(asset)} title={asset.available === false ? 'Original file is unavailable' : previewingMusicId === asset.id ? 'Stop preview' : `Preview ${asset.name}`} aria-label={previewingMusicId === asset.id ? `Stop preview of ${asset.name}` : `Preview ${asset.name}`} className="shrink-0 rounded p-1.5 text-brand hover:bg-white/10 disabled:text-warm-white/25">{previewingMusicId === asset.id ? <Pause size={13} /> : <Play size={13} />}</button>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-warm-white/75" title={asset.path}>{asset.name}{asset.available === false && <span className="ml-1 text-red-300">· File unavailable</span>}</span>
                  <button type="button" disabled={added || asset.available === false} onClick={() => addMusicAssetAsSource(asset)} className="shrink-0 rounded px-2 py-1 text-[10px] font-semibold text-brand hover:bg-brand/10 disabled:text-warm-white/35">{added ? 'Added' : 'Add'}</button>
                  <button type="button" aria-label={`Delete ${asset.name}`} title="Delete track" onClick={() => { void deleteMusicAsset(asset); }} className="shrink-0 rounded p-1.5 text-warm-white/40 hover:bg-red-500/10 hover:text-red-300"><Trash2 size={13} /></button>
                </li>;
              })}
            </ul>
          ) : <button type="button" onClick={() => musicFileRef.current?.click()} className="flex min-h-20 flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 px-3 text-center text-xs text-warm-white/45 hover:border-brand/40 hover:text-warm-white/70">Upload a track to build your music library.</button>}
          </>}
          </>}
        </Panel>
      </div>

      {/* Bottom row: natural height */}
      <div className="grid h-[min(14rem,30vh)] shrink-0 grid-cols-4 gap-3">
        {/* Sources stay in the original lower row; the Add menu opens upward to stay clear of the footer. */}
        <Panel
          title="Sources"
          className="h-full min-h-0"
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
                      const disabled = (kind === 'camera' && cameraLimitReached) || (kind === 'mobile-camera' && mobileCamLimitReached);
                      return (
                        <button key={kind} disabled={disabled} onClick={() => { void addSource(kind); }} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs text-warm-white/80 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
                          <span className="flex items-center gap-2"><Icon size={14} className="text-warm-white/60" />{name}</span>
                          {kind === 'camera' && <span className="text-[10px] text-warm-white/45">{sceneSources.filter((source) => source.kind === 'camera').length}/3</span>}
                          {kind === 'mobile-camera' && <span className="text-[10px] text-warm-white/45">{sources.filter((source) => source.kind === 'mobile-camera').length + mobileCamPendingSlots.current.size}/3</span>}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            {sceneSources.length > 0 && <p className="mb-1 px-1 text-[9px] uppercase tracking-wide text-warm-white/35">Drag to reorder · top is front</p>}
            {sceneSources.length > 0 ? (
              <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
                {sceneSources.map((source) => {
                  const { id, name, kind, mobileCamSlot } = source;
                  const visible = isPreviewSourceVisible(source);
                  const reconnectable = ['camera', 'mobile-camera', 'screen', 'microphone', 'desktop-audio'].includes(kind);
                  const hasLiveTrack = !!source.stream?.getTracks().some((track) => track.readyState === 'live' && !track.muted);
                  const sourceConnected = kind === 'mobile-camera' ? source.connectionStatus ? source.connectionStatus === 'connected' : hasLiveTrack : hasLiveTrack;
                  const disconnected = reconnectable && !sourceConnected;
                  const Icon = SOURCE_OPTIONS.find((option) => option.kind === kind)?.icon ?? Type;
                  const musicAsset = kind === 'music' ? musicAssets.find((asset) => asset.id === source.mediaAssetId) : undefined;
                  const mediaAsset = kind === 'media' && source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined;
                  return (
                    <li
                      key={id}
                      draggable
                      onDragStart={(event) => { event.dataTransfer.setData('text/source-id', String(id)); event.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => { event.preventDefault(); reorderSources(Number(event.dataTransfer.getData('text/source-id')), id); }}
                       className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm text-warm-white ${selectedProgramSource === id ? 'border-sky-400/50 bg-sky-400/5' : 'border-white/5 bg-white/2'}`}
                    >
                      {kind === 'music' && musicAsset?.available !== false && musicAsset?.url && <audio
                        ref={(element) => { if (element) musicElements.current.set(id, element); else musicElements.current.delete(id); }}
                        src={musicAsset.url}
                        crossOrigin="anonymous"
                        loop={source.loop ?? false}
                        onPlay={(event) => { setMusicPlaying((current) => ({ ...current, [id]: true })); attachMusicStream(id, event.currentTarget); }}
                        onPause={() => setMusicPlaying((current) => ({ ...current, [id]: false }))}
                        onEnded={() => setMusicPlaying((current) => ({ ...current, [id]: false }))}
                        className="hidden"
                      />}
                      <span title="Drag to reorder layers; items higher in the list appear in front"><GripVertical size={14} className="shrink-0 cursor-grab text-warm-white/35" /></span>
                      <Icon size={15} className="shrink-0 text-warm-white/70" />
                      <button type="button" disabled={!['camera', 'mobile-camera', 'screen', 'media', 'presentation', 'text'].includes(kind)} aria-pressed={selectedProgramSource === id} onClick={() => setSelectedProgramSource(id)} title="Select this layer in Program setup" className="flex min-w-0 flex-1 flex-col truncate text-left disabled:cursor-default"><span className="flex min-w-0 items-center gap-1.5 truncate">{kind === 'mobile-camera' && mobileCamSlot && <span className="shrink-0 rounded bg-sky-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-200">Cam {mobileCamSlot}</span>}<span className="truncate">{name}</span></span>{kind === 'music' && (!musicAsset || musicAsset.available === false) && <span className="truncate text-[9px] font-semibold text-red-300">Original file unavailable</span>}{kind !== 'mobile-camera' && kind !== 'music' && disconnected && <span className="truncate text-[9px] font-semibold text-red-300">Disconnected</span>}{mediaAsset?.sizeBytes !== undefined && <span className="truncate text-[9px] text-warm-white/40">{mediaAsset.optimized && mediaAsset.originalBytes ? `${formatMediaSizeInKb(mediaAsset.originalBytes)} → ` : ''}{formatMediaSizeInKb(mediaAsset.sizeBytes)}{mediaAsset.optimized ? ' · optimized' : ''}</span>}</button>
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
                      {disconnected && (
                        <button type="button" aria-label={`Reconnect ${name}`} title={`Reconnect ${name}`} disabled={reconnectingSourceId === id} onClick={() => void reconnectSource(source)} className="flex shrink-0 items-center gap-1 rounded-md border border-red-300/25 bg-red-400/10 px-1.5 py-1 text-[9px] font-semibold text-red-100 hover:bg-red-400/20 disabled:cursor-wait disabled:opacity-50">
                          {reconnectingSourceId === id ? <Loader2 size={11} className="animate-spin" /> : <Radio size={11} />} Reconnect
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
            {mediaPreparing && <p role="status" aria-live="polite" className="mt-2 flex items-center gap-2 rounded-md bg-brand/5 px-2 py-1.5 text-[11px] text-warm-white/70"><Loader2 size={13} className="animate-spin text-brand" /> Optimizing {mediaPreparing}…</p>}
          </div>
          <input ref={sourceFileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(event) => { void addMediaSource(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
        </Panel>

        {/* Audio mixer */}
        <Panel title="Audio Mixer" className="h-full min-h-0">
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
            {mixerChannels.map(({ id, name, icon: Icon, db, muted }) => {
              const source = sources.find((item) => item.id === id);
              return (
                 <li key={id} className="rounded-lg border border-white/5 bg-white/2 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon size={15} className="shrink-0 text-warm-white/70" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-[11px] text-warm-white">
                        <span className="truncate">{name}</span>
                        <span className="ml-2 shrink-0 tabular-nums text-warm-white/60">{db.toFixed(1)} dB</span>
                      </div>
                      <input type="range" min={-60} max={12} step={0.5} value={db} aria-label={`${name} volume`} onChange={(e) => updateChannel(id, { db: Number(e.target.value) })} className="mt-1 w-full accent-brand" />
                    </div>
                    <button type="button" aria-label={`Open ${name} mixer settings`} title={`Mixer settings for ${name}`} onClick={() => setAudioSettingsChannelId(id)} className="rounded p-1 text-warm-white/55 hover:bg-white/10 hover:text-brand"><Settings size={14} /></button>
                    <button type="button" aria-pressed={muted} aria-label={muted ? `Unmute ${name}` : `Mute ${name}`} onClick={() => updateChannel(id, { muted: !muted })} className={`rounded p-1 ${muted ? 'text-red-400' : 'text-warm-white/70 hover:text-brand'}`}>
                      {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                  </div>
                  <AudioChannelMeter stream={source?.stream} db={db} muted={muted} enabled={source?.visible ?? false} onLevel={(level) => setAudioLevels((current) => Math.abs((current[id] ?? 0) - level) < 0.005 ? current : { ...current, [id]: level })} />
                </li>
              );
            })}
            {!mixerChannels.length && <li className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-warm-white/45">Add a microphone or desktop audio source to control it here.</li>}
          </ul>
          {audioError && <p role="alert" className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">{audioError}</p>}
        </Panel>

        {/* Stream status */}
        <Panel title="Stream Status" className="h-full min-h-0">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
              f
            </div>
            <div>
              <p className="text-sm font-medium text-warm-white">Facebook Live</p>
              <p className="text-xs text-warm-white/50">
                {live ? streamStatus === 'live' ? 'Connected' : 'Connecting' : 'Not connected'}
              </p>
            </div>
          </div>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-warm-white/70">Stream Health</dt>
              <dd className={`flex items-center gap-1 ${streamStatus === 'live' ? 'text-emerald-400' : live ? 'text-amber-300' : 'text-warm-white/40'}`}>
                <Wifi size={16} /> {live ? streamStatus === 'live' ? 'Connected' : 'Connecting' : 'Not connected'}
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
          className="h-full min-h-0"
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
            {/* Same length as the bar in the Streaming tab's Program panel (1.4 of the 4.25 grid columns, less gaps and padding). */}
            <div className="w-full min-w-0 shrink-0 md:w-[calc((100%-2px)*0.3294-26px)]">{outputDisplayBar('slideshow')}</div>
          </div>
          {displayError && <p role="alert" className="shrink-0 text-xs text-amber-200">{displayError}</p>}
          <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_280px_280px]">
            <div className="flex min-h-0 flex-col gap-3 rounded-xl border border-white/10 bg-panel p-3">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-black" style={{ containerType: 'inline-size' }}>
                <SlideView bg={offlineCurrent.bg} slide={offlineCurrent.slide} scale={8} minRem={0.55} />
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
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setClearScenesTab('slideshow')} disabled={!slideshowScenes.length} title="Remove all scenes" className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-red-300/80 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={12} />Clear all</button>
                    <button type="button" aria-label="Add scene" title="Add scene" onClick={beginAddScene} className="rounded p-1 text-warm-white/60 hover:bg-white/10 hover:text-white"><Plus size={15} /></button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1">
                  {slideshowScenes.map((item) => <div key={item.id} className="group relative">
                    <button type="button" onClick={() => setOfflineScene(item.id)} aria-pressed={offlineSlide.sceneId === item.id} className={`flex w-full items-center gap-3 rounded-lg border p-1.5 pr-9 text-left transition-colors ${offlineSlide.sceneId === item.id ? 'border-brand bg-brand/10 text-white' : 'border-white/10 text-warm-white/70 hover:border-white/25 hover:text-white'}`}>
                      <div className="h-10 w-16 shrink-0 overflow-hidden rounded bg-black">
                        <StudioSlideThumbnail bg={item.bg} slide={item.slides[0]} mediaUrls={mediaUrls} scale={4} minRem={0.4} />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 truncate text-xs font-semibold text-warm-white">
                          {item.songId && <Music2 size={12} aria-label="Song" className="shrink-0 text-sky-300" />}
                          <span className="truncate">{item.songId ? item.name : `${item.id} ${item.name}`}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-warm-white/45">{item.desc || `${item.slides.length} ${item.slides.length === 1 ? 'slide' : 'slides'}`}</span>
                      </span>
                      {offlineSlide.sceneId === item.id && <span title="Selected scene" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />}
                    </button>
                    <button type="button" aria-label={`Delete scene ${item.name}`} title={`Delete ${item.name}`} onClick={() => askDeleteScene(item, 'slideshow')} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-warm-white/45 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 focus:opacity-100 group-hover:opacity-100"><Trash2 size={13} /></button>
                  </div>)}
                  {!slideshowScenes.length && <p className="rounded-lg border border-dashed border-white/10 p-3 text-xs text-warm-white/45">Add a scene to get started.</p>}
                </div>
                <button type="button" onClick={beginAddScene} className="mt-2 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-1.5 text-xs text-warm-white hover:bg-white/5"><Plus size={14} />Add Scene</button>
            </div>
            <div className="order-2 flex min-h-0 flex-col rounded-xl border border-white/10 bg-panel p-3">
                <div className="mb-2 flex shrink-0 items-center justify-between gap-2"><h3 className="min-w-0 truncate text-sm font-semibold text-white">Slides <span className="font-normal text-warm-white/45">· {offlineScene.name}</span></h3><button type="button" onClick={() => setSlidesExpanded(true)} aria-label="Expand slides" title="Expand slides · Ctrl+Shift+E" className="rounded-md p-1.5 text-warm-white/60 transition hover:bg-white/10 hover:text-white"><Maximize2 size={15} /></button></div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
                  {offlineScene.slides.map((slide, index) => (
                    <button key={`${offlineScene.id}-${index}`} type="button" onClick={() => setOfflineSlide({ sceneId: offlineScene.id, slideIdx: index })} aria-pressed={offlineSlide.slideIdx === index} className={`flex items-center gap-2 rounded-lg border p-2 text-left transition ${offlineSlide.slideIdx === index ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/25'}`}>
                      <span className="relative block aspect-video w-24 shrink-0 overflow-hidden rounded bg-black" style={{ containerType: 'inline-size' }}><StudioSlideThumbnail bg={offlineScene.bg} slide={slide} mediaUrls={mediaUrls} scale={4} minRem={0.4} /></span>
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
         createPortal(<div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setAddSceneOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="add-scene-title" className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="add-scene-title" className="text-lg font-bold text-warm-white">Add a scene</h2>
                <p className="mt-1 text-sm text-warm-white/55">{addSceneKind === 'presentation' ? 'Add the slides of a saved presentation.' : 'Add a song from your songbooks. Each verse becomes a slide.'}</p>
              </div>
              <button aria-label="Close" onClick={() => setAddSceneOpen(false)} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </div>
            <SegmentedTabs
              label="Scene type"
              value={addSceneKind}
              options={[{ value: 'presentation', label: 'Presentation', icon: <Image size={14} /> }, { value: 'song', label: 'Song', icon: <Music2 size={14} /> }]}
              onChange={setAddSceneKind}
              className="mt-4 bg-black/25"
              buttonClassName="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm"
            />
            {addSceneKind === 'song' ? (() => {
              const songResults = (addSceneSongQuery.trim() ? searchSongs(addSceneSongs, addSceneSongQuery) : addSceneSongs).slice(0, 200);
              const chosen = songResults.find((song) => song.id === selectedSongId) ?? songResults[0];
              return <>
                <input autoFocus value={addSceneSongQuery} onChange={(event) => setAddSceneSongQuery(event.target.value)} placeholder="Search by number, title or words" aria-label="Search songs" className="mt-4 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-warm-white outline-none placeholder:text-warm-white/35 focus:border-brand" />
                <div role="radiogroup" aria-label="Songs" className="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1">
                  {!songResults.length && <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-warm-white/55">{addSceneSongs.length ? 'No songs match.' : 'No songs yet. Add songs in Presentations → Songbooks.'}</p>}
                  {songResults.map((song) => {
                    const checked = chosen?.id === song.id;
                    return <button key={song.id} type="button" role="radio" aria-checked={checked} onClick={() => setSelectedSongId(song.id)} onDoubleClick={() => { addSongScene(song); setAddSceneOpen(false); }} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${checked ? 'border-brand bg-brand/10' : 'border-white/10 hover:bg-white/5'}`}>
                      <Music2 size={13} className="shrink-0 text-sky-300" />
                      {song.number && <span className="shrink-0 text-xs tabular-nums text-warm-white/55">{song.number}</span>}
                      <span className="min-w-0"><span className="block truncate text-sm text-warm-white">{song.title}</span><span className="block truncate text-[11px] text-warm-white/40">{firstLine(song)}</span></span>
                    </button>;
                  })}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={() => setAddSceneOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
                  <button disabled={!chosen} onClick={() => { if (chosen) { addSongScene(chosen); setAddSceneOpen(false); } }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:opacity-40">Add song</button>
                </div>
              </>;
            })() : (<>
            {savedPresentations.filter((presentation) => presentation.slides.length > 0).length > 0 ? (
              <>
                <div role="radiogroup" aria-label="Saved presentations" className="mt-5 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {savedPresentations.filter((presentation) => presentation.slides.length > 0).map((presentation) => (
                     <button key={presentation.id} type="button" role="radio" aria-checked={selectedPresentationId === presentation.id} onClick={() => setSelectedPresentationId(presentation.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selectedPresentationId === presentation.id ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/25 hover:bg-white/3'}`}>
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
               <div className="mt-5 rounded-xl border border-dashed border-white/15 bg-white/3 p-4 text-sm text-warm-white/60">No saved presentations with slides yet. Create and save a presentation first, then return here to add it as a scene.</div>
            )}
            </>)}
          </section>
        </div>, document.body)
      )}
      {goLiveSetupOpen && createPortal(
         <div className="fixed inset-0 z-200 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (!startingStream && event.target === event.currentTarget) setGoLiveSetupOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="go-live-setup-title" className="my-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="go-live-setup-title" className="text-lg font-bold text-warm-white">Go live setup</h2>
                <p className="mt-1 text-sm text-warm-white/55">Check the program and audio, then choose your stream quality.</p>
              </div>
              <button type="button" aria-label="Close go live setup" disabled={startingStream} onClick={() => { setGoLiveSetupOpen(false); setAudioMonitor(false); }} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white disabled:opacity-40"><X size={17} /></button>
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-warm-white">What viewers will see</h3>
                  <span className="flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400" />Program preview</span>
                </div>
                <div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-black" style={{ containerType: 'inline-size' }}>
                  <div className="absolute inset-0 bg-black" />
                  {visibleProgramOverlays.map((source) => {
                    const layout = getProgramLayout(source);
                    const zIndex = onAirSceneSources.length - onAirSceneSources.findIndex((item) => item.id === source.id);
                    return <div key={source.id} className="pointer-events-none absolute overflow-hidden" style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.width}%`, height: `${layout.height}%`, zIndex }}>
                      <SourcePreview source={source} media={source.mediaAssetId ? mediaUrls[source.mediaAssetId] : undefined} slide={airing.slide} bg={airing.bg} showLabel={false} rounded={false} className="" />
                    </div>;
                  })}
                  {visibleProgramOverlays.length === 0 && <p className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-white/55">No visible sources. Add a slide, camera, or media source in Studio.</p>}
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
                  <p className="mt-2 text-[10px] text-warm-white/40">Your server URL and stream key are encrypted and saved on this device for your next session.</p>
                </div>
                <div className="rounded-xl border border-white/10 p-4">
                  <h3 className="text-sm font-semibold text-warm-white">Video quality</h3>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="text-xs text-warm-white/60">Resolution
                      <select value={streamResolution} disabled={live} onChange={(event) => setStreamResolution(event.target.value)} className={`${selectClass} mt-1.5 w-full disabled:opacity-50`}>
                        <option value="720p">720p · 1280 × 720</option>
                        <option value="1080p">1080p · 1920 × 1080</option>
                      </select>
                    </label>
                    <label className="text-xs text-warm-white/60">Frame rate
                      <select value={streamFrameRate} disabled={live} onChange={(event) => setStreamFrameRate(event.target.value)} className={`${selectClass} mt-1.5 w-full disabled:opacity-50`}>
                        <option value="30">30 fps</option>
                        <option value="60">60 fps</option>
                      </select>
                    </label>
                    <label className="col-span-2 text-xs text-warm-white/60">Video bitrate
                      <select value={streamBitrate} disabled={live} onChange={(event) => setStreamBitrate(event.target.value)} className={`${selectClass} mt-1.5 w-full disabled:opacity-50`}>
                        <option value="2500">2,500 kbps · Lower bandwidth</option>
                        <option value="4500">4,500 kbps · Balanced</option>
                        <option value="6000">6,000 kbps · Higher quality</option>
                        <option value="8000">8,000 kbps · 1080p high detail</option>
                      </select>
                    </label>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-warm-white/40">{live ? 'These are locked while you are live. End the stream to change them for the next one.' : 'Used when you go live. You can also set your defaults in Settings → Default stream quality.'}</p>
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
                        {source?.stream && <MonitorAudioTrack stream={source.stream} enabled={audioMonitor && liveTrack && source.visible && !channel.muted} volume={channelGain(channel.db)} />}
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
                {streamConnectError ? <p role="alert" className="text-red-300">{streamConnectError}</p> : startingStream ? <p role="status" className="text-amber-200">Preparing the full-resolution program output…</p> : <p className="text-warm-white/45">FaithStream Studio will send the On-air program and enabled audio sources to Facebook over RTMPS.</p>}
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={startingStream} onClick={() => { setGoLiveSetupOpen(false); setAudioMonitor(false); }} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5 disabled:opacity-40">Cancel</button>
                <button type="button" disabled={startingStream} onClick={() => { void startLive(); }} className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110 disabled:cursor-wait disabled:opacity-60"><Radio size={16} />{startingStream ? 'Starting…' : 'Go Live'}</button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {settingsOpen && (
         createPortal(<div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
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
                <div className="flex justify-between text-warm-white/65"><dt>Open Scripture picker</dt><dd className="text-warm-white">Ctrl + Alt + B</dd></div>
                <div className="flex justify-between text-warm-white/65"><dt>Expand slide navigator</dt><dd className="text-warm-white">Ctrl + Shift + E</dd></div>
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
        </div>, document.body)
      )}
      {sourceEditor && (
         createPortal(<div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourceEditor(null); }}>
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
        </div>, document.body)
      )}
      {mobileCamPairing && (
         createPortal(<div className="fixed inset-0 z-1000 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="mobile-cam-title" className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="mobile-cam-title" className="text-lg font-bold text-warm-white">{mobileCamPairing.reconnecting ? `Reconnect Cam ${mobileCamPairing.slot}` : `Connect Cam ${mobileCamPairing.slot}`}</h2><p className="mt-1 text-sm text-warm-white/55">{mobileCamPairing.reconnecting ? 'Tap Reconnect camera on your phone and use the current code below.' : 'Install and open FaithStream Cam on your phone. Both devices must use the same Wi-Fi.'}</p></div>
              <button aria-label="Close pairing details" onClick={() => { if (!mobileCamPairing.connected && !mobileCamPairing.reconnecting) { void window.faithstreamWindow?.stopMobileCamPairing(mobileCamPairing.sourceId); mobileCamPairingDetails.current.delete(mobileCamPairing.sourceId); } setMobileCamPairing(null); }} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={17} /></button>
            </div>
            <div className="mt-5 grid grid-cols-[136px_minmax(0,1fr)] gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-col items-center gap-2">
                {mobileCamPairing.connected
                  ? <div className="flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-center text-xs font-semibold text-emerald-200"><Loader2 size={18} className="animate-spin" />Preparing camera…</div>
                  : <MobileCamPairingQr pairing={mobileCamPairing} />}
                {!mobileCamPairing.connected && <span className="text-center text-[10px] font-semibold text-warm-white/65">Scan with FaithStream Cam</span>}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-warm-white/50">Studio address</p>
                <div className="mt-2 space-y-1 font-mono text-xs text-white">{mobileCamPairing.addresses.map((address) => <p key={address} className="break-all">{address}:{mobileCamPairing.port}</p>)}</div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-warm-white/50">Pairing code</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-brand">{mobileCamPairing.code}</p>
                {!mobileCamPairing.connected && <p className="mt-2 text-[11px] leading-relaxed text-warm-white/55">Code refreshes in {Math.floor((mobileCamPairing.remainingSeconds ?? 180) / 60)}:{String((mobileCamPairing.remainingSeconds ?? 180) % 60).padStart(2, '0')}. The QR updates with it.</p>}
              </div>
            </div>
            <p role="status" className={`mt-4 flex items-center gap-2 text-sm ${mobileCamPairing.connected ? 'text-emerald-300' : mobileCamPairing.reconnecting ? 'text-amber-200' : 'text-warm-white/70'}`}>{mobileCamPairing.connected ? <><Loader2 size={14} className="animate-spin" /> Preparing the camera feed…</> : mobileCamPairing.reconnecting ? 'Disconnected · waiting for the phone to reconnect…' : 'Waiting for your phone to connect…'}</p>
            {mobileCamPairing.refreshError && <p role="alert" className="mt-2 text-xs text-amber-200">{mobileCamPairing.refreshError}</p>}
            <div className="mt-5 flex justify-end"><button onClick={() => { if (!mobileCamPairing.connected && !mobileCamPairing.reconnecting) { void window.faithstreamWindow?.stopMobileCamPairing(mobileCamPairing.sourceId); mobileCamPairingDetails.current.delete(mobileCamPairing.sourceId); } setMobileCamPairing(null); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy">{mobileCamPairing.connected || mobileCamPairing.reconnecting ? 'Close' : 'Cancel pairing'}</button></div>
          </section>
        </div>, document.body)
      )}
      <AudioMixerSettingsModal
        channel={audioSettingsChannel ?? null}
        source={audioSettingsSource}
        noiseSuppressionSupported={typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getSupportedConstraints?.().noiseSuppression}
        microphoneSwitching={microphoneSwitchingId === audioSettingsChannel?.id}
        remoteMicrophoneDevices={sources.filter((item) => item.kind === 'mobile-camera' && item.stream?.getAudioTracks().some((track) => track.readyState === 'live')).map((item) => ({ deviceId: `faithstream-cam-audio:${item.id}`, label: `${item.name} audio` }))}
        error={audioError}
        onChange={(patch) => { if (audioSettingsChannel) updateChannel(audioSettingsChannel.id, patch); }}
        onSelectMicrophoneDevice={(deviceId) => { if (audioSettingsChannel) void selectMicrophoneDevice(audioSettingsChannel.id, deviceId); }}
        onToggleNoiseSuppression={() => { if (audioSettingsChannel) void toggleNoiseSuppression(audioSettingsChannel.id); }}
        onClose={() => setAudioSettingsChannelId(null)}
        meter={audioSettingsChannel && <AudioChannelMeter
          stream={audioSettingsSource?.stream}
          db={audioSettingsChannel.db}
          muted={audioSettingsChannel.muted}
          enabled={audioSettingsSource?.visible ?? false}
          onLevel={(level) => setAudioLevels((current) => Math.abs((current[audioSettingsChannel.id] ?? 0) - level) < 0.005 ? current : { ...current, [audioSettingsChannel.id]: level })}
        />}
        inputMeter={audioSettingsChannel && audioSettingsSource?.kind === 'microphone' && <AudioChannelMeter
          stream={audioSettingsSource.stream}
          db={0}
          muted={false}
          enabled
          onLevel={() => undefined}
          description="Live microphone level before the mixer volume control"
        />}
      />
      <ConfirmationModal
        open={endStreamConfirmOpen}
        title="End the live stream?"
        message="This will stop the current stream. You can go live again afterward."
        confirmLabel="End stream"
        tone="soft-danger"
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
      <ConfirmationModal
        open={clearScenesTab !== null}
        title="Remove all scenes?"
        message={clearScenesTab === 'slideshow'
          ? `Remove all ${slideshowScenes.length} scenes from Slideshow? Your saved presentations will remain in Presentations.`
          : `Remove all ${scenes.length} scenes from Streaming? The streaming output will go blank. Your saved presentations will remain in Presentations.`}
        confirmLabel="Remove all"
        onCancel={() => setClearScenesTab(null)}
        onConfirm={() => { if (clearScenesTab) clearAllScenes(clearScenesTab); }}
      />
      <ScripturePickerModal
        open={scripturePickerOpen}
        onClose={() => setScripturePickerOpen(false)}
        onAdd={beginScriptureDesign}
        onPresent={presentScriptureNow}
      />
      {pendingScriptureDesign && <ScriptureDesignModal
        key="new-scripture-design"
        reference={pendingScriptureDesign.reference}
        verses={pendingScriptureDesign.verses}
        onClose={() => { setPendingScriptureDesign(null); setScripturePickerOpen(true); }}
        onAdd={(style, verses) => { void addScriptureScene(pendingScriptureDesign.reference, verses, style); }}
      />}
      {editingScriptureScene && editingScriptureData && <ScriptureDesignModal
        key={`edit-scripture-${editingScriptureScene.id}`}
        reference={editingScriptureData.reference}
        verses={editingScriptureData.verses}
        initialStyle={editingScriptureData.style}
        editing
        onClose={() => setEditingScriptureSceneId(null)}
        onAdd={(style, verses) => { void addScriptureScene(editingScriptureData.reference, verses, style, false, editingScriptureScene.id); }}
      />}
      <SongEditorModal
        open={editingStudioSong !== null}
        song={editingStudioSong}
        books={studioSongBooks}
        live={!!editingStudioSong && live && scenes.find((item) => item.songId === editingStudioSong.id)?.id === onAir.sceneId}
        initialTab="lyrics"
        onClose={() => setEditingStudioSong(null)}
        onSave={async (song) => { await saveSong(song); setEditingStudioSong(null); }}
      />
      {slidesExpanded && (() => {
        const slidesScene = studioOutputTab === 'stream' ? scene : offlineScene;
        const activeIndex = studioOutputTab === 'stream' ? selected.slideIdx : offlineSlide.slideIdx;
        return <ExpandedSlidesModal
          title={slidesScene.name}
          slides={slidesScene.slides.map((slide, index) => ({
            key: `${slidesScene.id}-${slide.presentationSlideId ?? index}`,
            title: slide.title?.trim() || `Slide ${index + 1}`,
            thumbnail: <div className="absolute inset-0" style={{ containerType: 'inline-size' }}><StudioSlideThumbnail bg={slidesScene.bg} slide={slide} mediaUrls={mediaUrls} scale={8} minRem={0.5} /></div>,
            active: index === activeIndex,
            onAir: studioOutputTab === 'stream' && onAir.sceneId === slidesScene.id && index === onAir.slideIdx,
            preview: studioOutputTab === 'stream' && preview.sceneId === slidesScene.id && index === preview.slideIdx,
          }))}
          onSelect={(index) => {
            if (studioOutputTab === 'stream') selectSlide(index);
            else setOfflineSlide({ sceneId: offlineScene.id, slideIdx: index });
          }}
          onClose={() => setSlidesExpanded(false)}
        />;
      })()}
    </div>
  );
}

/** Full-screen, control-free slideshow output rendered in a separate monitor window. */
export function StudioDisplayOutput() {
  const [outputMode, setOutputMode] = useState<'stream' | 'slideshow'>(() => localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? 'stream' : 'slideshow');
  const [scenes, setScenes] = useState<Scene[]>(() => outputMode === 'stream' ? loadStudioScenes() : loadSlideshowScenes());
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const [currentRef, setCurrentRef] = useState<Ref>(() => {
    try {
      const key = localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as Ref | null;
      if (saved && Number.isFinite(saved.sceneId) && Number.isFinite(saved.slideIdx)) return saved;
    } catch { /* Start from the first available slide. */ }
    const firstScene = (localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? loadStudioScenes() : loadSlideshowScenes())[0];
    return { sceneId: firstScene?.id ?? 0, slideIdx: 0 };
  });
  const [assets, setAssets] = useState<StudioMediaUrlMap>({});

  useEffect(() => {
    let active = true;
    const releases: Array<() => void> = [];
    let currentAssets: StudioMediaUrlMap = {};
    const scenesKeyForMode = (mode: 'stream' | 'slideshow') => mode === 'stream' ? STUDIO_SCENES_KEY : STUDIO_SLIDESHOW_SCENES_KEY;
    const localScenesForMode = (mode: 'stream' | 'slideshow') => mode === 'stream' ? loadStudioScenes() : loadSlideshowScenes();
    const refreshScenes = async (mode: 'stream' | 'slideshow') => {
      const key = scenesKeyForMode(mode);
      const fallback = localScenesForMode(mode);
      setScenes(fallback);
      try {
        const latest = await readPreferredStudioScenes(key, fallback);
        if (active && localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === mode) setScenes(latest);
      } catch { /* Keep the localStorage copy visible if the scene database is unavailable. */ }
    };
    const refreshAssets = async () => {
      const result = await readStudioMediaUrlMap();
      if (!active) { result.release(); return; }
      releases.push(result.release);
      const next = { ...currentAssets, ...result.mediaUrls };
      currentAssets = next;
      setAssets(next);
    };
    void refreshAssets();
    const onStorage = (event: StorageEvent) => {
      if (event.key === STUDIO_DISPLAY_MODE_KEY) {
        const mode = event.newValue === 'stream' ? 'stream' : 'slideshow';
        setOutputMode(mode);
        void refreshScenes(mode);
        void refreshAssets();
        const key = mode === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
        try {
          const next = JSON.parse(localStorage.getItem(key) ?? 'null') as Ref | null;
          if (next && Number.isFinite(next.sceneId) && Number.isFinite(next.slideIdx)) setCurrentRef(next);
        } catch { /* Keep the current output while a new mode initializes. */ }
      }
      if (event.key === getAccountStorageKey(STUDIO_SLIDESHOW_SCENES_KEY) && localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) !== 'stream') {
        void refreshScenes('slideshow');
        void refreshAssets();
      }
      if (event.key === getAccountStorageKey(STUDIO_SCENES_KEY) && localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream') {
        void refreshScenes('stream');
        void refreshAssets();
      }
      const activeRefKey = localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
      if (event.key === activeRefKey && event.newValue) {
        try {
          const next = JSON.parse(event.newValue) as Ref;
          if (Number.isFinite(next.sceneId) && Number.isFinite(next.slideIdx)) setCurrentRef(next);
        } catch { /* Ignore incomplete updates. */ }
      }
    };
    const snapshotChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(STUDIO_SCENE_SNAPSHOT_CHANNEL);
    if (snapshotChannel) snapshotChannel.onmessage = (event: MessageEvent<{ key?: string }>) => {
      const mode = localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? 'stream' : 'slideshow';
      if (event.data?.key === getAccountStorageKey(scenesKeyForMode(mode))) {
        void refreshScenes(mode);
        void refreshAssets();
      }
    };
    window.addEventListener('storage', onStorage);
    void refreshScenes(localStorage.getItem(STUDIO_DISPLAY_MODE_KEY) === 'stream' ? 'stream' : 'slideshow');
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.isContentEditable || target.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')
        || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
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
        const scene = scenesRef.current.find((item) => item.id === current.sceneId) ?? localScenesForMode(mode).find((item) => item.id === current.sceneId);
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
      snapshotChannel?.close();
      releases.forEach((release) => release());
    };
  }, []);

  useEffect(() => {
    if (!scenes.length) return;
    const currentScene = scenes.find((item) => item.id === currentRef.sceneId);
    const scene = currentScene ?? scenes[0];
    const slideIdx = currentScene
      ? Math.min(Math.max(0, currentRef.slideIdx), Math.max(0, scene.slides.length - 1))
      : 0;
    if (scene.id === currentRef.sceneId && slideIdx === currentRef.slideIdx) return;
    const next = { sceneId: scene.id, slideIdx };
    setCurrentRef(next);
    const outputKey = outputMode === 'stream' ? STUDIO_STREAM_OUTPUT_REF_KEY : STUDIO_OUTPUT_REF_KEY;
    try { localStorage.setItem(outputKey, JSON.stringify(next)); } catch { /* Keep the restored first slide visible. */ }
  }, [scenes, currentRef, outputMode]);

  const scene = scenes.find((item) => item.id === currentRef.sceneId) ?? scenes[0];
  const slide = scene?.slides[currentRef.slideIdx];
  const outputSlide = slide ? restoreImportedSlideForStudio(slide, assets) : undefined;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black" style={{ containerType: 'inline-size' }} aria-label="Slideshow output">
      <SlideView bg={scene?.bg ?? 'from-black to-black'} slide={outputSlide} scale={10} minRem={0.75} maxRem={8} animate seamlessBackground />
    </main>
  );
}
