import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, ChevronLeft, ChevronRight, Italic, Underline } from 'lucide-react';
import { readBackgroundLibrary, type BackgroundItem } from '../utils/mediaLibrary';
import { PRESERVED_BLANK_LINE } from '../utils/slideLibrary';
import { SONG_BACKGROUNDS, SONG_FONTS, songSlideLayouts, songTextArea, type Song, type SongSlideLayout, type SongStyle, type SongTextLayout } from '../utils/songbooks';

/** One text area of a song slide, sized like Studio's text boxes (and shrunk if it would overflow). */
function PreviewText({ layout }: { layout: SongTextLayout }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const measure = () => {
      if (!wrap.current || !inner.current || !inner.current.offsetHeight) return setFit(1);
      setFit(Math.min(1, wrap.current.clientHeight / inner.current.offsetHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (wrap.current) observer.observe(wrap.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [layout]);
  return (
    <div ref={wrap} className="absolute flex items-center overflow-hidden" style={{ left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.w}%`, height: `${layout.h}%` }}>
      <div ref={inner} className="w-full whitespace-pre-wrap break-words" style={{ transform: `scale(${fit})`, transformOrigin: 'center', textAlign: layout.align, lineHeight: layout.lineHeight }}>
        <div style={{ fontFamily: `"${layout.font}", sans-serif`, fontSize: `${(layout.size / 1280) * 100}cqw`, fontWeight: layout.bold ? 800 : 500, fontStyle: layout.italic ? 'italic' : 'normal', textDecoration: layout.underline ? 'underline' : 'none', textTransform: layout.uppercase ? 'uppercase' : undefined, color: layout.color, textShadow: layout.shadow ? '0 0.3cqw 1.2cqw rgba(0,0,0,0.65)' : undefined }}>{layout.text}</div>
      </div>
    </div>
  );
}

/** A song slide drawn like Studio draws it. Thumbnails pass still, so video backgrounds show a still frame. */
export function SongSlidePreview({ layout, background, still = false }: { layout: SongSlideLayout; background?: BackgroundItem; still?: boolean }) {
  return (
    <div className={`relative isolate aspect-video w-full overflow-hidden bg-gradient-to-br ${layout.background}`} style={{ containerType: 'inline-size' }}>
      {background?.type === 'image' && <img src={background.url} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />}
      {background?.type === 'video' && (still
        ? <video src={`${background.url}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
        : <video src={background.url} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />)}
      <div className="absolute inset-0 bg-black" style={{ opacity: layout.dim / 100 }} />
      <PreviewText layout={layout.box} />
      {layout.subtitleBox && <PreviewText layout={layout.subtitleBox} />}
    </div>
  );
}

type Area = { x: number; y: number; w: number; h: number };
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';
const HANDLE_CLASS: Record<Exclude<Handle, 'move'>, string> = {
  nw: '-left-1.5 -top-1.5 cursor-nwse-resize',
  ne: '-right-1.5 -top-1.5 cursor-nesw-resize',
  sw: '-bottom-1.5 -left-1.5 cursor-nesw-resize',
  se: '-bottom-1.5 -right-1.5 cursor-nwse-resize',
};
// Blank lines typed in the design editor are soft spacing within a slide. The song library
// normally treats a blank line as a new slide, so retain it as an invisible line marker.
const encodeSlideText = (text: string) => text.replace(/\n[ \t]*\n/g, `\n${PRESERVED_BLANK_LINE}\n`);
const decodeSlideText = (text: string) => text.replaceAll(PRESERVED_BLANK_LINE, '');

/**
 * The lyrics area drawn over the preview: drag inside to move it, drag a corner to resize it.
 * It snaps to the centre of the slide (a guide line shows) and stays inside the slide.
 */
function AreaEditor({ area, onChange }: { area: Area; onChange: (area: Area) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const start = (handle: Handle) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || !frame.current?.parentElement) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = frame.current.parentElement.getBoundingClientRect();
    const origin = { px: event.clientX, py: event.clientY, ...area };
    const MIN_W = 15;
    const MIN_H = 10;
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
        if (handle.includes('n')) { y = Math.min(Math.max(0, origin.y + dy), origin.y + origin.h - MIN_H); h = origin.y + origin.h - y; }
        if (handle.includes('s')) { h = Math.min(Math.max(MIN_H, origin.h + dy), 100 - origin.y); }
      }
      // Snap the box's centre to the slide's centre lines.
      const snapX = handle === 'move' && Math.abs(x + w / 2 - 50) < 1.5;
      const snapY = handle === 'move' && Math.abs(y + h / 2 - 50) < 1.5;
      if (snapX) x = 50 - w / 2;
      if (snapY) y = 50 - h / 2;
      setGuides({ x: snapX, y: snapY });
      onChange({ x, y, w, h });
    };
    const end = () => {
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
      title="Drag to move the lyrics · drag a corner to resize"
      className="absolute z-10 cursor-move rounded-sm border-2 border-dashed border-brand/90 bg-brand/5 hover:bg-brand/10"
      style={{ left: `${area.x}%`, top: `${area.y}%`, width: `${area.w}%`, height: `${area.h}%` }}
    >
      {(Object.keys(HANDLE_CLASS) as Exclude<Handle, 'move'>[]).map((handle) => (
        <span key={handle} onPointerDown={start(handle)} className={`absolute h-3 w-3 rounded-sm border-2 border-brand bg-white ${HANDLE_CLASS[handle]}`} />
      ))}
    </div>
  </>;
}

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
export default function SongDesignPanel({
  song,
  style,
  ownDesign,
  onChange,
  onTextChange,
  onUseDefault,
  onMakeDefault,
  designLabel = 'song',
  showDefaultActions = true,
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
  /** Keep Scripture passages as exactly one slide per verse. */
  fixedVerseSlides?: boolean;
  /** Structured verse data lets the designer preserve intentional blank lines inside a verse. */
  fixedVerseTexts?: { reference: string; text: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [library, setLibrary] = useState<BackgroundItem[]>([]);
  const [collection, setCollection] = useState('All');
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  // Keep the selected slide's thumbnail in view when moving between slides.
  useEffect(() => { thumbs.current[index]?.scrollIntoView({ block: 'nearest' }); }, [index]);

  useEffect(() => {
    let release: (() => void) | undefined;
    let alive = true;
    void readBackgroundLibrary().then((result) => {
      if (!alive) { result.release(); return; }
      release = result.release;
      setLibrary(result.items);
    }).catch(() => undefined);
    return () => { alive = false; release?.(); };
  }, []);

  const layouts = useMemo(() => {
    const generated = songSlideLayouts({ ...song, style }, style);
    if (!fixedVerseSlides || !fixedVerseTexts?.length || !generated[0]) return generated;
    const template = generated[0];
    return fixedVerseTexts.map((verse) => {
      const text = `${verse.reference}\n${verse.text}`;
      return { ...template, label: verse.reference, text, box: { ...template.box, text } };
    });
  }, [song, style, fixedVerseSlides, fixedVerseTexts]);
  const current = layouts[Math.min(index, Math.max(0, layouts.length - 1))];
  const [textDraft, setTextDraft] = useState(decodeSlideText(current?.text ?? ''));
  // Do not reset the editor draft on content updates while typing; reload it only when changing slides.
  useEffect(() => { setTextDraft(decodeSlideText(current?.text ?? '')); }, [index]);
  const backgroundItem = style.backgroundAssetId ? library.find((item) => item.id === style.backgroundAssetId) : undefined;
  const collections = ['All', ...[...new Set(library.map((item) => item.collection || 'Uploads'))].sort()];
  const visibleLibrary = collection === 'All' ? library : library.filter((item) => (item.collection || 'Uploads') === collection);
  const slideCaption = (layout: SongSlideLayout) => designLabel === 'scripture passage'
    ? layout.text.split(/\r?\n|\s{2,}/, 1)[0] || 'Verse'
    : layout.label ?? 'Lyrics';
  useEffect(() => { if (index >= layouts.length) setIndex(Math.max(0, layouts.length - 1)); }, [index, layouts.length]);

  const slider = 'w-full accent-brand';
  const select = 'w-full rounded-md border border-white/10 bg-[#091521] px-2 py-1.5 text-xs text-white outline-none focus:border-brand';

  return (
    <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[150px_minmax(0,1fr)_300px]">
      {/* Slides: numbered thumbnails, like the Presentations editor */}
      <nav aria-label="Song slides" className="hidden min-h-0 flex-col gap-2 overflow-y-auto border-r border-white/10 bg-black/15 p-2.5 md:flex">
        {layouts.map((layout, slideIndex) => (
          <button
            key={slideIndex}
            ref={(element) => { thumbs.current[slideIndex] = element; }}
            type="button"
            aria-current={slideIndex === index}
            onClick={() => setIndex(slideIndex)}
            className={`group shrink-0 rounded-lg p-1 text-left transition ${slideIndex === index ? 'bg-brand/15 ring-2 ring-brand' : 'hover:bg-white/5'}`}
          >
            <div className="flex items-start gap-1.5">
              <span className={`w-4 shrink-0 pt-0.5 text-right text-[10px] font-semibold tabular-nums ${slideIndex === index ? 'text-brand' : 'text-warm-white/40'}`}>{slideIndex + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="pointer-events-none overflow-hidden rounded border border-white/10"><SongSlidePreview layout={layout} background={backgroundItem} still /></div>
                <p className={`mt-1 truncate text-[10px] ${slideIndex === index ? 'font-semibold text-white' : 'text-warm-white/55'}`}>{slideCaption(layout)}</p>
              </div>
            </div>
          </button>
        ))}
      </nav>

      {/* Selected slide, as large as the space allows */}
      <div
        tabIndex={-1}
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
          if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') { event.preventDefault(); setIndex((value) => Math.min(layouts.length - 1, value + 1)); }
          if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
        }}
        className="flex min-h-0 flex-col gap-3 bg-[#0b1520] p-4 outline-none"
      >
        {current ? <>
          <FitStage>
            <div className="relative select-none overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black/40">
              <SongSlidePreview layout={current} background={backgroundItem} />
              {current.kind === 'lyrics' && <AreaEditor area={songTextArea(style)} onChange={(area) => onChange({ area })} />}
            </div>
          </FitStage>
          <div className="flex shrink-0 items-center justify-between gap-3">
            <button type="button" aria-label="Previous slide" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-warm-white/75 hover:bg-white/5 disabled:opacity-30"><ChevronLeft size={14} /> Previous</button>
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold text-white">{slideCaption(current)}</p>
              <p className="text-[11px] text-warm-white/45">Slide {Math.min(index, layouts.length - 1) + 1} of {layouts.length}</p>
            </div>
            <button type="button" aria-label="Next slide" disabled={index >= layouts.length - 1} onClick={() => setIndex((value) => Math.min(layouts.length - 1, value + 1))} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-warm-white/75 hover:bg-white/5 disabled:opacity-30">Next <ChevronRight size={14} /></button>
          </div>
          <p className="shrink-0 text-center text-[11px] text-warm-white/45">{fixedVerseSlides
            ? 'Each verse is its own slide. Change the text layout, background, and styling here before adding the passage to Studio.'
            : current.kind === 'lyrics'
            ? 'Drag the dashed box to move the lyrics, or a corner to resize. It applies to every lyric slide. Use ← → to change slides.'
            : 'The title slide keeps a centred layout. Choose a lyric slide to move or resize the lyrics.'}</p>
          {/* Small screens: thumbnails underneath instead of the side rail */}
          <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-1 md:hidden">
            {layouts.map((layout, slideIndex) => <button key={slideIndex} type="button" onClick={() => setIndex(slideIndex)} className={`w-24 shrink-0 overflow-hidden rounded border-2 ${slideIndex === index ? 'border-brand' : 'border-white/10'}`}><SongSlidePreview layout={layout} background={backgroundItem} still /></button>)}
          </div>
        </> : <p className="m-auto text-sm text-warm-white/45">Type some lyrics on the Lyrics tab to see the slides.</p>}
      </div>

      {/* Controls */}
      <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-black/15 p-4 md:border-l md:border-t-0">
        <div className={`rounded-lg px-3 py-2 text-[11px] leading-snug ${ownDesign ? 'bg-brand/10 text-warm-white/80' : 'bg-white/5 text-warm-white/60'}`}>
          {ownDesign ? `This ${designLabel} has its own design.` : `This ${designLabel} uses the default style. Change anything to customize it.`}
          {showDefaultActions && <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {ownDesign && <button type="button" onClick={onUseDefault} className="font-semibold text-brand hover:underline">Use default style</button>}
            <button type="button" onClick={onMakeDefault} className="font-semibold text-brand hover:underline">Make this the default for all songs</button>
          </div>}
        </div>

        <Section title="Text">
          {current && onTextChange && <label className="flex flex-col gap-1 text-[11px] text-warm-white/65">Text on this slide
            <textarea aria-label="Text on this slide" value={textDraft} onChange={(event) => {
              const text = event.target.value;
              setTextDraft(text);
              onTextChange({ index, kind: current.kind, oldText: current.text, occurrence: layouts.slice(0, index).filter((layout) => layout.kind === current.kind && layout.text === current.text).length, text: current.kind === 'lyrics' ? encodeSlideText(text) : text });
            }} rows={5} spellCheck className="min-h-24 w-full resize-y rounded-md border border-white/10 bg-[#091521] px-2.5 py-2 text-xs leading-relaxed text-white outline-none focus:border-brand" />
          </label>}
          <select aria-label="Font" value={style.font} onChange={(event) => onChange({ font: event.target.value })} className={select} style={{ fontFamily: `"${style.font}", sans-serif` }}>
            {[...new Set([style.font, ...SONG_FONTS])].map((font) => <option key={font} value={font} style={{ fontFamily: `"${font}", sans-serif` }}>{font}</option>)}
          </select>
          <label className="text-[11px] text-warm-white/65"><span className="flex justify-between">Text size <span className="tabular-nums text-warm-white/85">{style.fontSize}</span></span>
            <input type="range" min={24} max={120} step={2} value={style.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} className={slider} />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-warm-white/70">
            <input type="checkbox" checked={style.autoFit} onChange={(event) => onChange({ autoFit: event.target.checked })} className="h-3.5 w-3.5 accent-brand" />
            Shrink long parts to fit (same size on every slide)
          </label>
          <label className="text-[11px] text-warm-white/65"><span className="flex justify-between">Line spacing <span className="tabular-nums text-warm-white/85">{style.lineHeight.toFixed(2)}</span></span>
            <input type="range" min={0.8} max={2.2} step={0.05} value={style.lineHeight} onChange={(event) => onChange({ lineHeight: Number(event.target.value) })} className={slider} />
          </label>
          <div className="flex items-center gap-0.5">
            <ToggleIcon label="Bold" active={style.bold} onClick={() => onChange({ bold: !style.bold })}><Bold size={15} /></ToggleIcon>
            <ToggleIcon label="Italic" active={style.italic} onClick={() => onChange({ italic: !style.italic })}><Italic size={15} /></ToggleIcon>
            <ToggleIcon label="Underline" active={style.underline} onClick={() => onChange({ underline: !style.underline })}><Underline size={15} /></ToggleIcon>
            <ToggleIcon label={style.caps ? 'All caps on (click for normal text)' : 'All caps'} active={style.caps} onClick={() => onChange({ caps: !style.caps })}><span className="text-[12px] font-bold leading-none tracking-tight">{style.caps ? 'AA' : 'Aa'}</span></ToggleIcon>
            <span className="mx-1 h-5 w-px bg-white/10" />
            <ToggleIcon label="Align left" active={style.align === 'left'} onClick={() => onChange({ align: 'left' })}><AlignLeft size={15} /></ToggleIcon>
            <ToggleIcon label="Align center" active={style.align === 'center'} onClick={() => onChange({ align: 'center' })}><AlignCenter size={15} /></ToggleIcon>
            <ToggleIcon label="Align right" active={style.align === 'right'} onClick={() => onChange({ align: 'right' })}><AlignRight size={15} /></ToggleIcon>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-warm-white/70">
            <label className="flex items-center gap-2">Colour <input type="color" value={style.color} onChange={(event) => onChange({ color: event.target.value.toUpperCase() })} className="h-7 w-10 cursor-pointer rounded border border-white/15 bg-transparent" /></label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={style.shadow} onChange={(event) => onChange({ shadow: event.target.checked })} className="h-3.5 w-3.5 accent-brand" /> Shadow</label>
          </div>
        </Section>

        <Section title="Layout">
          <div className="-mb-1 flex items-center justify-between">
            <p className="text-[11px] text-warm-white/55">Position {style.area && <span className="text-brand">· placed by hand</span>}</p>
            {style.area && <button type="button" onClick={() => onChange({ area: undefined })} className="text-[10px] font-semibold text-brand hover:underline">Reset position</button>}
          </div>
          <Choice label="Text position" value={style.area ? 'custom' : style.position} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} onChange={(value) => { if (value !== 'custom') onChange({ position: value as SongStyle['position'], area: undefined }); }} />
          {!fixedVerseSlides && <>
            <p className="-mb-1 text-[11px] text-warm-white/55">Lines per slide</p>
            <Choice label="Lines per slide" value={style.linesPerSlide} options={[2, 3, 4, 5, 6, 8].map((value) => ({ value, label: String(value) }))} onChange={(value) => onChange({ linesPerSlide: value })} />
            <p className="-mb-1 text-[11px] text-warm-white/55">Title slide</p>
            <Choice label="Title slide" value={style.titleSlide ? 'on' : 'off'} options={[{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }]} onChange={(value) => onChange({ titleSlide: value === 'on' })} />
          </>}
        </Section>

        <Section title="Background">
          <div className="grid grid-cols-4 gap-1.5">
            {SONG_BACKGROUNDS.map((background) => {
              const selected = !style.backgroundAssetId && style.background === background;
              return <button key={background} type="button" aria-label="Use this colour background" aria-pressed={selected} onClick={() => onChange({ background, backgroundAssetId: undefined })} className={`aspect-video rounded-md border-2 bg-gradient-to-br ${background} ${selected ? 'border-brand' : 'border-white/10 hover:border-white/30'}`} />;
            })}
          </div>
          {library.length > 0 && <>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-warm-white/55">Pictures and videos</p>
              {collections.length > 2 && <select aria-label="Background collection" value={collection} onChange={(event) => setCollection(event.target.value)} className="max-w-36 rounded-md border border-white/10 bg-[#091521] px-1.5 py-1 text-[11px] text-white outline-none focus:border-brand">{collections.map((name) => <option key={name}>{name}</option>)}</select>}
            </div>
            <div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
              {visibleLibrary.map((item) => {
                const selected = style.backgroundAssetId === item.id;
                return <button key={item.id} type="button" title={item.name} aria-pressed={selected} onClick={() => onChange({ backgroundAssetId: item.id, dim: style.dim || 30 })} className={`relative aspect-video overflow-hidden rounded-md border-2 bg-navy ${selected ? 'border-brand' : 'border-white/10 hover:border-white/30'}`}>
                  {item.type === 'image' ? <img src={item.url} alt="" className="h-full w-full object-cover" /> : <video src={item.url} muted className="h-full w-full object-cover" />}
                  {item.type === 'video' && <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[8px] text-white">VIDEO</span>}
                </button>;
              })}
            </div>
          </>}
          {!library.length && <p className="text-[10px] leading-snug text-warm-white/40">Add pictures or videos in Presentations → Backgrounds (Import folder or Add files) to use them here.</p>}
          <label className="text-[11px] text-warm-white/65"><span className="flex justify-between">Darken background <span className="tabular-nums text-warm-white/85">{style.dim}%</span></span>
            <input type="range" min={0} max={80} step={5} value={style.dim} onChange={(event) => onChange({ dim: Number(event.target.value) })} className={slider} />
          </label>
        </Section>
      </aside>
    </div>
  );
}
