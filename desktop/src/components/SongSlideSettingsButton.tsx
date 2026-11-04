import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Type } from 'lucide-react';
import { SONG_SLIDE_SETTINGS_EVENT, loadSongSlideSettings, saveSongSlideSettings, type SongSlideSettings } from '../utils/songbooks';

/** Keeps a component in step with the song slide settings, wherever they are changed. */
export const useSongSlideSettings = () => {
  const [settings, setSettings] = useState<SongSlideSettings>(loadSongSlideSettings);
  useEffect(() => {
    const onChange = () => setSettings(loadSongSlideSettings());
    window.addEventListener(SONG_SLIDE_SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(SONG_SLIDE_SETTINGS_EVENT, onChange);
  }, []);
  return settings;
};

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-warm-white/45">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-lg bg-black/25 p-1">
        {options.map((option) => (
          <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)} className={`flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${value === option.value ? 'bg-brand text-navy' : 'text-warm-white/65 hover:bg-white/10 hover:text-white'}`}>{option.label}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * "Aa" button with the song slide settings: normal text or ALL CAPS, lines per slide, text size
 * and title slide. Changes apply at once to songs already in Studio.
 */
export default function SongSlideSettingsButton({ compact = false }: { compact?: boolean }) {
  const settings = useSongSlideSettings();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ top: Math.min(rect.bottom + 6, window.innerHeight - 330), left: Math.max(8, Math.min(rect.right - 264, window.innerWidth - 272)) });
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const update = (patch: Partial<SongSlideSettings>) => saveSongSlideSettings({ ...settings, ...patch });

  return <>
    <button
      ref={trigger}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Default look for all songs: ALL CAPS, lines per slide, text size, title slide"
      onClick={() => setOpen((value) => !value)}
      className={compact
        ? `flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-bold ${open ? 'border-brand text-white' : 'border-white/15 text-warm-white/70 hover:border-brand/50 hover:text-white'}`
        : `flex items-center gap-2 rounded-xl border bg-panel px-3.5 py-2.5 text-sm font-semibold ${open ? 'border-brand text-white' : 'border-white/15 text-warm-white hover:bg-white/5'}`}
    >
      {compact ? <span className="tracking-tight">{settings.caps ? 'AA' : 'Aa'}</span> : <><Type size={16} /> Default look</>}
    </button>
    {open && position && createPortal(
      <div ref={popover} role="dialog" aria-label="Song slide settings" style={{ position: 'fixed', top: position.top, left: position.left, width: 264 }} className="z-[200] flex flex-col gap-3 rounded-xl border border-white/10 bg-panel p-3 shadow-2xl shadow-black/50">
        <div>
          <p className="text-xs font-semibold text-white">Default look for all songs</p>
          <p className="mt-0.5 text-[10px] leading-snug text-warm-white/45">For every song without its own design. To design one song (font, spacing, colours, background), open it and choose the Design tab.</p>
        </div>
        <Segmented label="Text" value={settings.caps ? 'caps' : 'normal'} options={[{ value: 'normal', label: 'Normal' }, { value: 'caps', label: 'ALL CAPS' }]} onChange={(value) => update({ caps: value === 'caps' })} />
        <Segmented label="Lines per slide" value={settings.linesPerSlide} options={[2, 3, 4, 5, 6].map((value) => ({ value, label: String(value) }))} onChange={(value) => update({ linesPerSlide: value })} />
        <Segmented label="Text size" value={settings.fontSize} options={[{ value: 56, label: 'Small' }, { value: 68, label: 'Medium' }, { value: 80, label: 'Large' }]} onChange={(value) => update({ fontSize: value })} />
        <Segmented label="Title slide" value={settings.titleSlide ? 'on' : 'off'} options={[{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }]} onChange={(value) => update({ titleSlide: value === 'on' })} />
        <p className="text-[10px] leading-snug text-warm-white/40">ALL CAPS only changes how lyrics look on screen; your songbook keeps the normal text.</p>
      </div>,
      document.body,
    )}
  </>;
}
