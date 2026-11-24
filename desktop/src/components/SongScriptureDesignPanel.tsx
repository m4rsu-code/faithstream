import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Bold, ChevronLeft, ChevronRight, Film, Image as ImageIcon, Italic, Search, Underline, X } from 'lucide-react';
import { readBackgroundLibrary, type BackgroundItem } from '../utils/mediaLibrary';
import { registerModalEscape } from './modal/modalEscape';
import SlideBackgroundLayer from './SlideBackgroundLayer';
import { PRESERVED_BLANK_LINE } from '../utils/slideLibrary';
import { backgroundClasses, backgroundStyle, customBackground, parseCustomBackground } from '../utils/slideBackground';
import { activeAlign, alignText, hasLineAligns, lineAlignAt, remapLineAligns } from '../utils/lineAlign';
import GOOGLE_FONT_FAMILIES from '../data/google-font-families.json';
import { loadSongSlideSettings, rememberSongBackground, saveSongSlideSettings, SONG_BACKGROUNDS, SONG_FONTS, songLineKey, songSlideLayouts, songTextArea, withSlideLineAligns, type Song, type SongTextAlign, type SongSlideLayout, type SongStyle, type SongTextLayout } from '../utils/songbooks';

/** One text area of a song slide, sized like Studio's text boxes (and shrunk if it would overflow). */
const PreviewText = memo(function PreviewText({ layout }: { layout: SongTextLayout }) {
  return (
    <div className={`absolute flex ${layout.valign === 'top' ? 'items-start' : layout.valign === 'bottom' ? 'items-end' : 'items-center'} overflow-hidden`} style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.w}%`, height: `${layout.h}%`, background: layout.boxBgOn ? layout.boxBg : undefined, borderRadius: '1cqw' }}>
      <div className="w-full whitespace-pre-wrap break-words" style={{ textAlign: layout.align, textAlignLast: layout.align === 'justify' ? 'left' : undefined, lineHeight: layout.lineHeight, letterSpacing: `${((layout.letterSpacing ?? 0) / 1280) * 100}cqw` }}>
        <div style={{ fontFamily: `"${layout.font}", sans-serif`, fontSize: `${(layout.size / 1280) * 100}cqw`, fontWeight: layout.bold ? 800 : 500, fontStyle: layout.italic ? 'italic' : 'normal', textDecoration: layout.underline ? 'underline' : 'none', textTransform: layout.uppercase ? 'uppercase' : undefined, color: layout.color, textShadow: layout.shadow ? '0 0.3cqw 1.2cqw rgba(0,0,0,0.65)' : undefined }}>{hasLineAligns(layout.lineAligns)
          ? layout.text.split('\n').map((line, lineIndex) => {
            const lineAlign = lineAlignAt(layout.align, layout.lineAligns, lineIndex);
            return <div key={lineIndex} style={{ textAlign: lineAlign, textAlignLast: lineAlign === 'justify' ? 'left' : undefined }}>{line || ' '}</div>;
          })
          : layout.text}</div>
      </div>
    </div>
  );
});

function BackgroundChoiceCard({ item, selected, onSelect }: { item: BackgroundItem; selected: boolean; onSelect: () => void }) {
  const [previewing, setPreviewing] = useState(false);
  return <button type="button" aria-label={`Use ${item.type} background${item.collection ? ` from ${item.collection}` : ''}`} aria-pressed={selected} onClick={onSelect} onMouseEnter={() => setPreviewing(true)} onMouseLeave={() => setPreviewing(false)} onFocus={() => setPreviewing(true)} onBlur={() => setPreviewing(false)} className={`group block w-full overflow-hidden rounded-xl border-2 bg-[#0b1520] text-left transition ${selected ? 'border-brand shadow-[0_0_0_2px_rgba(203,135,68,0.2)]' : 'border-white/10 hover:border-white/30'}`}>
    <div className="relative w-full overflow-hidden bg-gradient-to-br from-slate-700 to-slate-950" style={{ height: 260, minHeight: 260 }}>
      {item.type === 'image'
        ? <img src={item.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
        : previewing
          ? <video src={item.url} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          : item.thumbnailUrl
          ? <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
            : <div className="flex h-full w-full items-center justify-center text-white/45"><Film size={24} /></div>}
      <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">{item.type === 'video' ? <><Film size={11} className="mr-1 inline" />Video</> : <><ImageIcon size={11} className="mr-1 inline" />Image</>}</span>
      {selected && <span className="absolute right-2 top-2 rounded-md bg-brand px-2 py-1 text-[10px] font-semibold text-white">Selected</span>}
    </div>
    <div className="px-3 py-2.5"><p className="truncate text-xs font-medium text-white" title={item.name}>{item.name}</p><p className="mt-1 truncate text-[10px] text-warm-white/45">{item.collection || 'Imported background'}</p></div>
  </button>;
}

/** A song slide drawn like Studio draws it. Thumbnails pass still, so video backgrounds show a still frame. */
export const SongSlidePreview = memo(function SongSlidePreview({ layout, background, still = false }: { layout: SongSlideLayout; background?: BackgroundItem; still?: boolean }) {
  return (
    <div className={`relative isolate aspect-video w-full overflow-hidden bg-gradient-to-br ${backgroundClasses(layout.background)}`} style={{ containerType: 'inline-size', ...backgroundStyle(layout.background) }}>
      <SlideBackgroundLayer media={background} opacity={layout.backgroundOpacity} dim={layout.dim} still={still} eager={!still} />
      <PreviewText layout={layout.box} />
      {layout.subtitleBox && <PreviewText layout={layout.subtitleBox} />}
    </div>
  );
});

/** Defer off-screen thumbnails so opening a long song or Scripture passage stays light. */
const LazySongSlidePreview = memo(function LazySongSlidePreview({ layout, background }: { layout: SongSlideLayout; background?: BackgroundItem }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '180px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={host} className="relative aspect-video w-full overflow-hidden rounded bg-gradient-to-br from-slate-800 to-slate-950">
    {visible && <SongSlidePreview layout={layout} background={background} still />}
  </div>;
});

type Area = { x: number; y: number; w: number; h: number };
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w';
const HANDLE_CLASS: Record<Exclude<Handle, 'move'>, string> = {
  nw: '-left-1.5 -top-1.5 h-3 w-3 rounded-sm cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 h-3 w-3 rounded-sm cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 h-3 w-3 rounded-sm cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 h-3 w-3 rounded-sm cursor-nwse-resize',
  n: 'left-1/2 -top-1 h-2 w-6 -translate-x-1/2 rounded-full cursor-ns-resize',
  s: 'left-1/2 -bottom-1 h-2 w-6 -translate-x-1/2 rounded-full cursor-ns-resize',
  e: 'top-1/2 -right-1 h-6 w-2 -translate-y-1/2 rounded-full cursor-ew-resize',
  w: 'top-1/2 -left-1 h-6 w-2 -translate-y-1/2 rounded-full cursor-ew-resize',
};
// Blank lines typed in the design editor are soft spacing within a slide. The song library
// normally treats a blank line as a new slide, so retain it as an invisible line marker.
const encodeSlideText = (text: string) => text.replace(/\n[ \t]*\n/g, `\n${PRESERVED_BLANK_LINE}\n`);
const decodeSlideText = (text: string) => text.replaceAll(PRESERVED_BLANK_LINE, '');
const SONG_FONT_CATALOG = [...new Set([...SONG_FONTS, ...(GOOGLE_FONT_FAMILIES as string[])])].sort((a, b) => a.localeCompare(b));
const resolveSongFont = (font: string) => SONG_FONT_CATALOG.find((candidate) => candidate.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '') === font.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '')) ?? font;
const DESIGN_THUMBNAIL_ROW_HEIGHT = 92;

/** Keep the large font catalogue mounted across slide changes. */
const SongFontPicker = memo(function SongFontPicker({ font, onChange, className }: { font: string; onChange: (font: string) => void; className: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(60);
  const fonts = useMemo(() => {
    const matches = SONG_FONT_CATALOG.filter((family) => family.toLowerCase().includes(query.trim().toLowerCase()));
    return matches.includes(font) || !font.toLowerCase().includes(query.trim().toLowerCase()) ? matches : [font, ...matches];
  }, [font, query]);
  return <div className="relative">
    <input aria-label="Search fonts" role="combobox" aria-expanded={open} aria-controls="song-font-options" aria-autocomplete="list" value={open ? query : font} onFocus={() => { setQuery(''); setVisibleCount(60); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); setVisibleCount(60); setOpen(true); }} onBlur={() => setOpen(false)} placeholder="Search 1,900+ fonts" className={className} style={{ fontFamily: `"${resolveSongFont(font)}", sans-serif` }} />
    {open && <div id="song-font-options" role="listbox" aria-label="Font choices" className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#101d2a] p-1 shadow-2xl">
      {fonts.length ? fonts.slice(0, visibleCount).map((family) => <button key={family} type="button" role="option" aria-selected={family === font} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(family); setQuery(''); setOpen(false); }} className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-white/10 ${family === font ? 'bg-brand/15 text-brand' : 'text-warm-white/80'}`} style={{ fontFamily: `"${resolveSongFont(family)}", sans-serif` }}>{family}</button>) : <p className="px-2 py-2 text-xs text-warm-white/45">No fonts found.</p>}
      {fonts.length > visibleCount && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setVisibleCount((current) => current + 60)} className="block w-full rounded px-2 py-2 text-left text-xs text-brand hover:bg-white/10">Show more ({fonts.length - visibleCount} remaining)</button>}
    </div>}
  </div>;
});

/**
 * The lyrics area drawn over the preview, resized like a Canva text box:
 * - drag inside to move it (it snaps to the slide's centre lines);
 * - drag the left / right side to change the width: the words keep their size and rewrap;
 * - drag a corner to make the words bigger or smaller with the box;
 * - in both cases the height follows the text, sized for the longest slide, so nothing is
 *   squeezed and there is no empty space. The top / bottom side sets a height by hand.
 */
const AreaEditor = memo(function AreaEditor({ area, style, texts, textSize, onChange }: { area: Area; style: SongStyle; texts: string[]; /** The size the lyrics are shown at now (after any shrink-to-fit). */ textSize: number; onChange: (patch: Partial<SongStyle>) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const start = (handle: Handle) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || !frame.current?.parentElement) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = frame.current.parentElement.getBoundingClientRect();
    const origin = { px: event.clientX, py: event.clientY, ...area, fontSize: textSize };
    const MIN_W = 10;
    const MIN_H = 8;
    const fitsText = handle !== 'move' && handle !== 'n' && handle !== 's';
    const corner = handle.length === 2;
    // An off-screen copy of the lyrics, styled like the slide, to measure how tall the text is.
    const measure = fitsText ? document.createElement('div') : null;
    if (measure) {
      Object.assign(measure.style, {
        position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', fontFamily: `"${style.font}", sans-serif`,
        fontWeight: style.bold ? '800' : '500', fontStyle: style.italic ? 'italic' : 'normal',
        textTransform: style.caps ? 'uppercase' : 'none', lineHeight: String(style.lineHeight),
      });
      document.body.appendChild(measure);
    }
    const textHeight = (width: number, size: number) => {
      if (!measure || !texts.length) return 0;
      measure.style.width = `${(width / 100) * rect.width}px`;
      measure.style.fontSize = `${(size / 1280) * rect.width}px`;
      measure.style.letterSpacing = `${((style.letterSpacing ?? 0) / 1280) * rect.width}px`;
      let tallest = 0;
      for (const text of texts) { measure.textContent = text || ' '; tallest = Math.max(tallest, measure.offsetHeight); }
      return (tallest / rect.height) * 100;
    };
    const move = (moveEvent: PointerEvent) => {
      const dx = ((moveEvent.clientX - origin.px) / rect.width) * 100;
      const dy = ((moveEvent.clientY - origin.py) / rect.height) * 100;
      let { x, y, w, h } = origin;
      if (handle === 'move') {
        x = Math.min(Math.max(0, origin.x + dx), 100 - w);
        y = Math.min(Math.max(0, origin.y + dy), 100 - h);
      } else {
        if (handle.includes('w')) { x = Math.min(Math.max(0, origin.x + dx), origin.x + origin.w - MIN_W); w = origin.x + origin.w - x; }
        if (handle.includes('e')) { w = Math.min(Math.max(MIN_W, origin.w + dx), 100 - origin.x); }
        if (handle === 'n') { y = Math.min(Math.max(0, origin.y + dy), origin.y + origin.h - MIN_H); h = origin.y + origin.h - y; }
        if (handle === 's') { h = Math.min(Math.max(MIN_H, origin.h + dy), 100 - origin.y); }
      }
      if (fitsText) {
        const fontSize = corner ? Math.min(140, Math.max(24, Math.round(origin.fontSize * (w / origin.w)))) : origin.fontSize;
        const needed = Math.max(MIN_H, Math.ceil(textHeight(w, fontSize) + 1));
        // Keep the edge that isn't being dragged still: top corners keep the bottom; sides keep the
        // top, middle or bottom, following where the text sits in the box.
        const bottom = origin.y + origin.h;
        const middle = origin.y + origin.h / 2;
        const anchor = handle === 'nw' || handle === 'ne' ? 'bottom' : handle === 'sw' || handle === 'se' ? 'top' : style.valign ?? 'middle';
        if (anchor === 'top') { h = Math.min(needed, 100 - origin.y); y = origin.y; }
        else if (anchor === 'bottom') { h = Math.min(needed, bottom); y = bottom - h; }
        else { h = Math.min(needed, 2 * Math.min(middle, 100 - middle)); y = middle - h / 2; }
        setGuides({ x: false, y: false });
        // The area now fits the longest slide, so "shrink to fit" isn't needed (and would fight the resize).
        onChange({ area: { x, y, w, h }, fontSize, autoFit: false });
        return;
      }
      // Snap the box's centre to the slide's centre lines.
      const snapX = handle === 'move' && Math.abs(x + w / 2 - 50) < 1.5;
      const snapY = handle === 'move' && Math.abs(y + h / 2 - 50) < 1.5;
      if (snapX) x = 50 - w / 2;
      if (snapY) y = 50 - h / 2;
      setGuides({ x: snapX, y: snapY });
      onChange({ area: { x, y, w, h } });
    };
    const end = () => {
      measure?.remove();
      setGuides({ x: false, y: false });
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };
  return <>
    {guides.x && <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-px bg-sky-400" />}
    {guides.y && <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-px bg-sky-400" />}
    <div
      ref={frame}
      onPointerDown={start('move')}
      title="Drag to move · drag a side to rewrap the words · drag a corner to resize the words"
      className="absolute z-10 cursor-move rounded-sm border-2 border-dashed border-brand/90 bg-brand/5 hover:bg-brand/10"
      style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}
    >
      {(Object.keys(HANDLE_CLASS) as Exclude<Handle, 'move'>[]).map((handle) => (
        <span key={handle} onPointerDown={start(handle)} className={`absolute border-2 border-brand bg-white ${HANDLE_CLASS[handle]}`} />
      ))}
    </div>
  </>;
});

/** Keeps a 16:9 slide as large as the space allows, without cropping or scrolling. */
function FitStage({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(160, Math.floor(Math.min(element.clientWidth, (element.clientHeight * 16) / 9))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={box} className="flex min-h-0 w-full flex-1 items-center justify-center">{width > 0 && <div style={{ width }}>{children}</div>}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-white/10 pb-3 last:border-b-0"><p className="text-[10px] font-bold uppercase tracking-wider text-warm-white/45">{title}</p>{children}</div>;
}

function ToggleIcon({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${active ? 'bg-white/15 text-brand' : 'text-warm-white/70 hover:bg-white/10'}`}>{children}</button>;
}

function Choice<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-lg bg-black/25 p-1">
      {options.map((option) => <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${value === option.value ? 'bg-brand text-navy' : 'text-warm-white/65 hover:bg-white/10 hover:text-white'}`}>{option.label}</button>)}
    </div>
  );
}

/**
 * A small presentation designer for one song: font, size, line spacing, bold / italic /
 * underline / ALL CAPS, alignment, colour, position, lines per slide, title slide and
 * background, with a live preview of every slide.
 */
const SongScriptureDesignPanel = memo(function SongScriptureDesignPanel({
  song,
  style,
  ownDesign,
  onChange,
  onTextChange,
  onUseDefault,
  onMakeDefault,
  designLabel = 'song',
  showDefaultActions = true,
  rememberStyle = false,
  fixedVerseSlides = false,
  fixedVerseTexts,
}: {
  song: Pick<Song, 'title' | 'author' | 'copyright' | 'lyrics'>;
  style: SongStyle;
  /** True when the song has its own design (false = it follows the default song style). */
  ownDesign: boolean;
  onChange: (patch: Partial<SongStyle>) => void;
  /** Updates the words on the currently selected slide. */
  onTextChange?: (change: { index: number; kind: SongSlideLayout['kind']; oldText: string; occurrence: number; text: string }) => void;
  onUseDefault: () => void;
  onMakeDefault: () => void;
  /** Allows the same designer to be reused for scripture passages. */
  designLabel?: string;
  showDefaultActions?: boolean;
  /** Persist this design as the shared Scripture/Songbook style while it is being edited. */
  rememberStyle?: boolean;
  /** Keep Scripture passages as exactly one slide per verse. */
  fixedVerseSlides?: boolean;
  /** Structured verse data lets the designer preserve intentional blank lines inside a verse. */
  fixedVerseTexts?: { reference: string; text: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [library, setLibrary] = useState<BackgroundItem[]>([]);
  const [collection, setCollection] = useState('All');
  const [backgroundBrowserOpen, setBackgroundBrowserOpen] = useState(false);
  useEffect(() => {
    if (!backgroundBrowserOpen) return;
    return registerModalEscape(() => setBackgroundBrowserOpen(false));
  }, [backgroundBrowserOpen]);
  useEffect(() => {
    const family = resolveSongFont(style.font);
    if (!(GOOGLE_FONT_FAMILIES as string[]).includes(family)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [style.font]);
  useEffect(() => {
    let release: (() => void) | undefined;
    let alive = true;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const load = () => {
      void readBackgroundLibrary().then((result) => {
        if (!alive) { result.release(); return; }
        release = result.release;
        setLibrary(result.items);
      }).catch(() => undefined);
    };
    const idleHandle = idleWindow.requestIdleCallback?.(load, { timeout: 2500 });
    const timeoutHandle = idleHandle === undefined ? window.setTimeout(load, 900) : undefined;
    return () => {
      alive = false;
      if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle);
      release?.();
    };
  }, []);

  const layouts = useMemo(() => {
    const generated = songSlideLayouts({ ...song, style }, style);
    if (!fixedVerseSlides || !fixedVerseTexts?.length || !generated[0]) return generated;
    const template = generated[0];
    return fixedVerseTexts.map((verse) => {
      const text = `${verse.reference}\n${verse.text}`;
      return { ...template, label: verse.reference, text, box: { ...template.box, text, lineAligns: style.lineAligns?.[songLineKey(text)] } };
    });
  }, [song, style, fixedVerseSlides, fixedVerseTexts]);
  const lyricTexts = useMemo(() => layouts.filter((layout) => layout.kind === 'lyrics').map((layout) => layout.box.text), [layouts]);
  const thumbnailRail = useRef<HTMLElement>(null);
  const [thumbnailWindow, setThumbnailWindow] = useState({ start: 0, end: 10 });
  const syncThumbnailWindow = useCallback(() => {
    const rail = thumbnailRail.current;
    if (!rail || !layouts.length) return;
    const start = Math.max(0, Math.floor(rail.scrollTop / DESIGN_THUMBNAIL_ROW_HEIGHT) - 2);
    const end = Math.min(layouts.length, Math.ceil((rail.scrollTop + rail.clientHeight) / DESIGN_THUMBNAIL_ROW_HEIGHT) + 2);
    setThumbnailWindow((current) => current.start === start && current.end === end ? current : { start, end });
  }, [layouts.length]);
  useEffect(() => {
    const rail = thumbnailRail.current;
    if (!rail) return;
    syncThumbnailWindow();
    const observer = new ResizeObserver(syncThumbnailWindow);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [syncThumbnailWindow]);
  // Keep the selected slide in view without mounting a button for every slide.
  useEffect(() => {
    const rail = thumbnailRail.current;
    if (!rail) return;
    if (index < thumbnailWindow.start || index >= thumbnailWindow.end) {
      rail.scrollTop = index * DESIGN_THUMBNAIL_ROW_HEIGHT;
      syncThumbnailWindow();
    }
  }, [index, thumbnailWindow, syncThumbnailWindow]);
  const current = layouts[Math.min(index, Math.max(0, layouts.length - 1))];
  const [textDraft, setTextDraft] = useState(decodeSlideText(current?.text ?? ''));
  // Do not reset the editor draft on content updates while typing; reload it only when changing slides.
  // Highlighted lines in "Text on this slide": the align buttons then change only those lines on this slide.
  const [textRange, setTextRange] = useState<{ start: number; end: number } | null>(null);
  const goToSlide = useCallback((nextIndex: number) => {
    const next = Math.max(0, Math.min(layouts.length - 1, nextIndex));
    // Update the active slide and its editor text in one event, avoiding a stale-frame
    // render followed by an effect-driven second render on every navigation click.
    setIndex(next);
    setTextDraft(decodeSlideText(layouts[next]?.text ?? ''));
    setTextRange(null);
  }, [layouts]);
  useEffect(() => { setTextDraft(decodeSlideText(current?.text ?? '')); setTextRange(null); }, [index]);
  const lineEditable = current?.kind === 'lyrics';
  const slideLineAligns = current?.kind === 'lyrics' ? current.box.lineAligns : undefined;
  const lineRange = lineEditable && textRange && textRange.end <= textDraft.length ? textRange : null;
  const shownAlign = activeAlign(textDraft, style.align, slideLineAligns, lineRange);
  const chooseAlign = (value: SongTextAlign) => {
    if (!current || !lineRange) { changeStyle({ align: value }); return; }
    const result = alignText(textDraft, style.align, slideLineAligns, value, lineRange);
    // Everything highlighted: align the whole design, as before.
    if (!result.lineAligns && result.align === value && value !== style.align) { changeStyle({ align: value, lineAligns: withSlideLineAligns(style.lineAligns, current.text, undefined) }); return; }
    changeStyle({ lineAligns: withSlideLineAligns(style.lineAligns, current.text, result.lineAligns) });
  };
  const backgroundItem = style.backgroundAssetId ? library.find((item) => item.id === style.backgroundAssetId) : undefined;
  const collections = ['All', ...[...new Set(library.map((item) => item.collection || 'Uploads'))].sort()];
  const visibleLibrary = collection === 'All' ? library : library.filter((item) => (item.collection || 'Uploads') === collection);
  const changeStyle = useCallback((patch: Partial<SongStyle>) => {
    onChange(patch);
    if (rememberStyle || !ownDesign) {
      saveSongSlideSettings({ ...loadSongSlideSettings(), ...style, ...patch });
    }
    if (!('background' in patch) && !('backgroundAssetId' in patch) && !('dim' in patch) && !('backgroundOpacity' in patch)) return;
    rememberSongBackground({
      background: patch.background ?? style.background,
      backgroundAssetId: 'backgroundAssetId' in patch ? patch.backgroundAssetId : style.backgroundAssetId,
      dim: patch.dim ?? style.dim,
      backgroundOpacity: patch.backgroundOpacity ?? style.backgroundOpacity,
    });
  }, [onChange, rememberStyle, ownDesign, style]);
  const changeFont = useCallback((font: string) => changeStyle({ font }), [changeStyle]);
  const slideCaption = (layout: SongSlideLayout) => designLabel === 'scripture passage'
    ? layout.text.split(/\r?\n|\s{2,}/, 1)[0] || 'Verse'
    : layout.label ?? 'Lyrics';
  useEffect(() => { if (index >= layouts.length) setIndex(Math.max(0, layouts.length - 1)); }, [index, layouts.length]);

  const slider = 'w-full accent-brand';
  const select = 'w-full rounded-md border border-white/10 bg-[#091521] px-2 py-1.5 text-xs text-white outline-none focus:border-brand';
  const backgroundControls = <Section title="Background">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-warm-white/65">Choose a colour or saved image/video</span>
      <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-warm-white/60">Custom
        <input type="color" aria-label="Custom background colour" value={parseCustomBackground(style.background)?.from ?? '#1E293B'} onChange={(event) => changeStyle({ background: customBackground(event.target.value, parseCustomBackground(style.background)?.to), backgroundAssetId: undefined })} className="h-6 w-8 cursor-pointer rounded border border-white/15 bg-transparent" />
      </label>
    </div>
    <div className="grid grid-cols-4 gap-1.5" aria-label="Colour backgrounds">
      {SONG_BACKGROUNDS.map((background) => {
        const selected = !style.backgroundAssetId && style.background === background;
        return <button key={background} type="button" aria-label="Use this colour background" aria-pressed={selected} onClick={() => changeStyle({ background, backgroundAssetId: undefined })} className={`aspect-video rounded-md border-2 bg-gradient-to-br ${background} ${selected ? 'border-brand' : 'border-white/10 hover:border-white/30'}`} />;
      })}
    </div>
    {library.length > 0 ? <>
      <div className="grid grid-cols-4 gap-1.5" aria-label="Quick background choices">
        {library.slice(0, 8).map((item) => <button key={item.id} type="button" aria-label={`Use background ${item.name}`} aria-pressed={style.backgroundAssetId === item.id} title={item.name} onClick={() => changeStyle({ backgroundAssetId: item.id, dim: style.dim || 30 })} className={`relative aspect-video overflow-hidden rounded-md border-2 bg-[#0b1520] ${style.backgroundAssetId === item.id ? 'border-brand ring-1 ring-brand/40' : 'border-white/10 hover:border-white/35'}`}>
          {item.type === 'image' ? <img src={item.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-white/50"><Film size={13} /></span>}
          {item.type === 'video' && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/75 px-1 text-[8px] text-white">Video</span>}
        </button>)}
      </div>
      <button type="button" onClick={() => setBackgroundBrowserOpen(true)} className="w-full rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-warm-white/75 hover:border-brand/50 hover:text-white">Browse all {library.length} backgrounds</button>
    </> : <p className="rounded-md border border-dashed border-white/10 p-2 text-[10px] leading-snug text-warm-white/45">Add image or video backgrounds in Presentations → Backgrounds.</p>}
    <details className="rounded-md border border-white/10 px-2.5 py-2">
      <summary className="cursor-pointer text-[10px] font-semibold text-warm-white/60">More background adjustments</summary>
      <div className="mt-2 space-y-2">
        <label className="block text-[10px] text-warm-white/65"><span className="flex justify-between">Opacity <span className="tabular-nums text-warm-white/85">{style.backgroundOpacity}%</span></span>
          <input type="range" min={0} max={100} step={5} value={style.backgroundOpacity} onChange={(event) => changeStyle({ backgroundOpacity: Number(event.target.value) })} className={slider} />
        </label>
        <label className="block text-[10px] text-warm-white/65"><span className="flex justify-between">Darken <span className="tabular-nums text-warm-white/85">{style.dim}%</span></span>
          <input type="range" min={0} max={80} step={5} value={style.dim} onChange={(event) => changeStyle({ dim: Number(event.target.value) })} className={slider} />
        </label>
      </div>
    </details>
  </Section>;

  return (
    <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[132px_minmax(0,1fr)_272px]">
      {/* Slides: numbered thumbnails, like the Presentations editor */}
      <nav ref={thumbnailRail} onScroll={syncThumbnailWindow} aria-label="Song slides" className="hidden min-h-0 flex-col overflow-y-auto border-r border-white/10 bg-black/15 p-2.5 md:flex">
        {thumbnailWindow.start > 0 && <div aria-hidden="true" style={{ height: thumbnailWindow.start * DESIGN_THUMBNAIL_ROW_HEIGHT, flex: 'none' }} />}
        {layouts.slice(thumbnailWindow.start, thumbnailWindow.end).map((layout, offset) => {
          const slideIndex = thumbnailWindow.start + offset;
          return (
          <button
            key={slideIndex}
            type="button"
            aria-current={slideIndex === index}
            onClick={() => goToSlide(slideIndex)}
            className={`group h-[92px] shrink-0 rounded-lg p-1 text-left ${slideIndex === index ? 'bg-brand/15 ring-2 ring-brand' : 'hover:bg-white/5'}`}
          >
            <div className="flex items-start gap-1.5">
              <span className={`w-4 shrink-0 pt-0.5 text-right text-[10px] font-semibold tabular-nums ${slideIndex === index ? 'text-brand' : 'text-warm-white/40'}`}>{slideIndex + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="pointer-events-none overflow-hidden rounded border border-white/10"><LazySongSlidePreview layout={layout} background={backgroundItem} /></div>
                <p className={`mt-1 truncate text-[10px] ${slideIndex === index ? 'font-semibold text-white' : 'text-warm-white/55'}`}>{slideCaption(layout)}</p>
              </div>
            </div>
          </button>
          );
        })}
        {thumbnailWindow.end < layouts.length && <div aria-hidden="true" style={{ height: (layouts.length - thumbnailWindow.end) * DESIGN_THUMBNAIL_ROW_HEIGHT, flex: 'none' }} />}
      </nav>

      {/* Selected slide, as large as the space allows */}
      <div
        tabIndex={-1}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); goToSlide(index + 1); }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); goToSlide(index - 1); }
        }}
        className="flex min-h-0 flex-col gap-2.5 bg-[#0b1520] p-3 outline-none"
      >
        {current ? <>
          <FitStage>
            <div className="relative select-none overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/40">
          <SongSlidePreview layout={current} background={backgroundItem} />
              {current.kind === 'lyrics' && <AreaEditor area={songTextArea(style)} style={style} texts={lyricTexts} textSize={current.box.size} onChange={changeStyle} />}
            </div>
          </FitStage>
          <div className="flex shrink-0 items-center justify-between gap-3">
            <button type="button" aria-label="Previous slide" disabled={index === 0} onClick={() => goToSlide(index - 1)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-warm-white/75 hover:bg-white/5 disabled:opacity-30"><ChevronLeft size={14} /> Previous</button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold text-white">{slideCaption(current)}</p>
              <p className="text-[11px] text-warm-white/45">Slide {Math.min(index, layouts.length - 1) + 1} of {layouts.length}</p>
            </div>
            <button type="button" aria-label="Next slide" disabled={index >= layouts.length - 1} onClick={() => goToSlide(index + 1)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-warm-white/75 hover:bg-white/5 disabled:opacity-30">Next <ChevronRight size={14} /></button>
          </div>
          <p className="shrink-0 text-center text-[11px] text-warm-white/45">{fixedVerseSlides
            ? 'Each verse is its own slide. Change the text layout, background, and styling here before adding the passage to Studio.'
            : current.kind === 'lyrics'
            ? 'Drag the dashed box to move the lyrics. Drag a side to rewrap the words, or a corner to make them bigger or smaller — the box fits the longest slide. It applies to every lyric slide. Use ← → to change slides.'
            : 'The title slide keeps a centred layout. Choose a lyric slide to move or resize the lyrics.'}</p>
          {/* Small screens: thumbnails underneath instead of the side rail */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 md:hidden">
            {layouts.slice(Math.max(0, index - 1), Math.min(layouts.length, index + 2)).map((layout, offset) => {
              const slideIndex = Math.max(0, index - 1) + offset;
              return <button key={slideIndex} type="button" onClick={() => goToSlide(slideIndex)} aria-current={slideIndex === index} className={`w-24 shrink-0 overflow-hidden rounded border-2 ${slideIndex === index ? 'border-brand' : 'border-white/10'}`}><LazySongSlidePreview layout={layout} background={backgroundItem} /></button>;
            })}
          </div>
        </> : <p className="m-auto text-sm text-warm-white/45">Type some lyrics on the Lyrics tab to see the slides.</p>}
      </div>

      {/* Controls */}
      <aside className="flex min-h-0 flex-col gap-2.5 overflow-y-auto border-t border-white/10 bg-black/15 p-3 md:border-l md:border-t-0">
        <div className={`rounded-lg px-3 py-2 text-[11px] leading-snug ${ownDesign ? 'bg-brand/10 text-warm-white/80' : 'bg-white/5 text-warm-white/60'}`}>
          {ownDesign ? `This ${designLabel} has its own design.` : `This ${designLabel} uses the default style. Change anything to customize it.`}
          {showDefaultActions && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {ownDesign && <button type="button" onClick={onUseDefault} className="font-semibold text-brand hover:underline">Use default style</button>}
            <button type="button" onClick={onMakeDefault} className="font-semibold text-brand hover:underline">Make this the default for Scripture and songs</button>
          </div>}
        </div>

        {backgroundControls}

        {current && (onTextChange || lineEditable) && <Section title="Text">
          <label className="flex flex-col gap-1 text-[11px] text-warm-white/65">{onTextChange ? 'Text on this slide' : 'Lines on this slide'}
            <textarea aria-label="Text on this slide" readOnly={!onTextChange} value={textDraft} onChange={(event) => {
              if (!onTextChange) return;
              const text = event.target.value;
              // Keep this slide's own line alignments with its new text.
              if (current.kind === 'lyrics' && hasLineAligns(current.box.lineAligns)) {
                const nextText = encodeSlideText(text);
                const moved = remapLineAligns(current.text, nextText, current.box.lineAligns);
                changeStyle({ lineAligns: withSlideLineAligns(withSlideLineAligns(style.lineAligns, current.text, undefined), nextText, moved) });
              }
              setTextDraft(text);
              onTextChange({ index, kind: current.kind, oldText: current.text, occurrence: layouts.slice(0, index).filter((layout) => layout.kind === current.kind && layout.text === current.text).length, text: current.kind === 'lyrics' ? encodeSlideText(text) : text });
            }} onSelect={(event) => setTextRange({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} rows={5} spellCheck className="min-h-24 w-full resize-y rounded-md border border-white/10 bg-[#091521] px-2.5 py-2 text-xs leading-relaxed text-white outline-none focus:border-brand" />
            {lineEditable && <span className="text-[10px] leading-snug text-warm-white/45">Highlight lines here, then pick an alignment to change just those lines on this slide. With nothing highlighted, alignment changes every slide.</span>}
          </label>
        </Section>}

        <Section title="Text style">
          <div className="flex items-center gap-0.5">
            <ToggleIcon label="Bold" active={style.bold} onClick={() => changeStyle({ bold: !style.bold })}><Bold size={15} /></ToggleIcon>
            <ToggleIcon label="Italic" active={style.italic} onClick={() => changeStyle({ italic: !style.italic })}><Italic size={15} /></ToggleIcon>
            <ToggleIcon label="Underline" active={style.underline} onClick={() => changeStyle({ underline: !style.underline })}><Underline size={15} /></ToggleIcon>
            <ToggleIcon label={style.caps ? 'All caps on (click for normal text)' : 'All caps'} active={style.caps} onClick={() => changeStyle({ caps: !style.caps })}><span className="text-[12px] font-bold leading-none tracking-tight">{style.caps ? 'AA' : 'Aa'}</span></ToggleIcon>
            <span className="mx-1 h-5 w-px bg-white/10" />
            <ToggleIcon label="Align left" active={shownAlign === 'left'} onClick={() => chooseAlign('left')}><AlignLeft size={15} /></ToggleIcon>
            <ToggleIcon label="Align center" active={shownAlign === 'center'} onClick={() => chooseAlign('center')}><AlignCenter size={15} /></ToggleIcon>
            <ToggleIcon label="Align right" active={shownAlign === 'right'} onClick={() => chooseAlign('right')}><AlignRight size={15} /></ToggleIcon>
            <ToggleIcon label="Justify" active={shownAlign === 'justify'} onClick={() => chooseAlign('justify')}><AlignJustify size={15} /></ToggleIcon>
          </div>
          <div className="flex items-center gap-0.5 text-[11px] text-warm-white/65">
            <span className="mr-1.5">Position in box</span>
            <ToggleIcon label="Text at top of the box" active={style.valign === 'top'} onClick={() => changeStyle({ valign: 'top' })}><AlignVerticalJustifyStart size={15} /></ToggleIcon>
            <ToggleIcon label="Text in middle of the box" active={(style.valign ?? 'middle') === 'middle'} onClick={() => changeStyle({ valign: 'middle' })}><AlignVerticalJustifyCenter size={15} /></ToggleIcon>
            <ToggleIcon label="Text at bottom of the box" active={style.valign === 'bottom'} onClick={() => changeStyle({ valign: 'bottom' })}><AlignVerticalJustifyEnd size={15} /></ToggleIcon>
          </div>
          <SongFontPicker font={style.font} onChange={changeFont} className={select} />
          <label className="flex items-center justify-between gap-2 text-[11px] text-warm-white/65">Text size
            <input type="number" min={1} max={1000} step={1} value={style.fontSize} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) changeStyle({ fontSize: value }); }} className="w-24 rounded-md border border-white/10 bg-[#091521] px-2 py-1.5 text-right text-xs text-white outline-none focus:border-brand" />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-warm-white/70">
            <input type="checkbox" checked={style.autoFit} onChange={(event) => changeStyle({ autoFit: event.target.checked })} className="h-3.5 w-3.5 accent-brand" />
            Shrink long parts to fit (same size on every slide)
          </label>
        </Section>

        <Section title="Spacing">
          <label className="text-[11px] text-warm-white/65"><span className="flex justify-between">Line spacing <span className="tabular-nums text-warm-white/85">{style.lineHeight.toFixed(2)}</span></span>
            <input type="range" min={0.8} max={2.2} step={0.05} value={style.lineHeight} onChange={(event) => changeStyle({ lineHeight: Number(event.target.value) })} className={slider} />
          </label>
          <label className="text-[11px] text-warm-white/65"><span className="flex justify-between">Letter spacing <span className="tabular-nums text-warm-white/85">{style.letterSpacing ?? 0}px</span></span>
            <input type="range" min={-4} max={20} step={1} value={style.letterSpacing ?? 0} onChange={(event) => changeStyle({ letterSpacing: Number(event.target.value) })} className={slider} />
          </label>
        </Section>

        <Section title="Look">
          <div className="flex items-center gap-3 text-[11px] text-warm-white/70">
            <label className="flex items-center gap-2">Colour <input type="color" value={style.color} onChange={(event) => changeStyle({ color: event.target.value.toUpperCase() })} className="h-7 w-10 cursor-pointer rounded border border-white/15 bg-transparent" /></label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={style.shadow} onChange={(event) => changeStyle({ shadow: event.target.checked })} className="h-3.5 w-3.5 accent-brand" /> Shadow</label>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-warm-white/70">
            <label className="flex items-center gap-2">Box background <input type="color" aria-label="Box background color" value={style.boxBg ?? '#000000'} onChange={(event) => changeStyle({ boxBg: event.target.value.toUpperCase(), boxBgOn: true })} className="h-7 w-10 cursor-pointer rounded border border-white/15 bg-transparent" /></label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={style.boxBgOn ?? false} onChange={(event) => changeStyle({ boxBgOn: event.target.checked })} className="h-3.5 w-3.5 accent-brand" /> Show</label>
          </div>
        </Section>

        <Section title="Layout">
          <div className="-mb-1 flex items-center justify-between">
            <p className="text-[11px] text-warm-white/55">Position {style.area && <span className="text-brand">· placed by hand</span>}</p>
            {style.area && <button type="button" onClick={() => changeStyle({ area: undefined })} className="text-[10px] font-semibold text-brand hover:underline">Reset position</button>}
          </div>
          <Choice label="Text position" value={style.area ? 'custom' : style.position} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} onChange={(value) => { if (value !== 'custom') changeStyle({ position: value as SongStyle['position'], area: undefined }); }} />
          {!fixedVerseSlides && <>
            <p className="-mb-1 text-[11px] text-warm-white/55">Lines per slide</p>
            <Choice label="Lines per slide" value={style.linesPerSlide} options={[2, 3, 4, 5, 6, 8].map((value) => ({ value, label: String(value) }))} onChange={(value) => changeStyle({ linesPerSlide: value })} />
            <p className="-mb-1 text-[11px] text-warm-white/55">Title slide</p>
            <Choice label="Title slide" value={style.titleSlide ? 'on' : 'off'} options={[{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }]} onChange={(value) => changeStyle({ titleSlide: value === 'on' })} />
          </>}
        </Section>

      </aside>
      {backgroundBrowserOpen && <div className="fixed inset-0 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" style={{ zIndex: 1200 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setBackgroundBrowserOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="song-backgrounds-title" className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101d2a] shadow-2xl">
          <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
            <div><h3 id="song-backgrounds-title" className="text-base font-bold text-white">Choose a background</h3><p className="mt-1 text-xs text-warm-white/50">Select an image or video from your saved background library.</p></div>
            <button type="button" onClick={() => setBackgroundBrowserOpen(false)} aria-label="Close background library" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
          </header>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <span className="text-xs text-warm-white/55">{visibleLibrary.length} backgrounds</span>
            {collections.length > 2 && <label className="flex items-center gap-2 text-xs text-warm-white/60"><Search size={14} /><select aria-label="Filter background collection" value={collection} onChange={(event) => setCollection(event.target.value)} className="rounded-md border border-white/10 bg-[#091521] px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand">{collections.map((name) => <option key={name}>{name}</option>)}</select></label>}
          </div>
          <div className="grid min-h-0 gap-6 overflow-y-auto p-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 430px), 1fr))', gridAutoRows: 'max-content' }}>
            {visibleLibrary.map((item) => {
              const selected = style.backgroundAssetId === item.id;
              return <BackgroundChoiceCard key={item.id} item={item} selected={selected} onSelect={() => { changeStyle({ backgroundAssetId: item.id, dim: style.dim || 30 }); setBackgroundBrowserOpen(false); }} />;
            })}
          </div>
        </section>
      </div>}
    </div>
  );
});

export default SongScriptureDesignPanel;
