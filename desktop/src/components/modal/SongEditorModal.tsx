import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Radio, RotateCcw, Trash2, X } from 'lucide-react';
import { splitLyrics } from '../../utils/slideLibrary';
import { cleanSongStyle, newId, saveSongSlideSettings, type Song, type Songbook, type SongStyle } from '../../utils/songbooks';
import SongDesignPanel from '../SongDesignPanel';
import { useSongSlideSettings } from '../SongSlideSettingsButton';

const PART_LABELS = ['Verse', 'Chorus', 'Bridge', 'Pre-chorus', 'Ending'];

/**
 * Create or correct a song. Used from the Songbooks page and from Studio, where it can be
 * opened while the song is on screen: saving updates the projection straight away.
 */
export default function SongEditorModal({
  open,
  song,
  books,
  defaultBookId,
  live,
  onClose,
  onSave,
  onDelete,
  onRestore,
}: {
  open: boolean;
  /** The song to edit, or null to create a new one. */
  song: Song | null;
  books: Songbook[];
  defaultBookId?: string;
  /** True when this song is currently showing in Studio. */
  live?: boolean;
  onClose: () => void;
  onSave: (song: Song) => Promise<void> | void;
  onDelete?: (song: Song) => void;
  onRestore?: (song: Song) => void;
}) {
  const personalBooks = books.filter((book) => book.kind === 'personal');
  const isStandard = !!song && books.find((book) => book.id === song.bookId)?.kind === 'standard';
  const [bookId, setBookId] = useState('');
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [copyright, setCopyright] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'lyrics' | 'design'>('lyrics');
  /** This song's own design, or null when it follows the default song style. */
  const [ownStyle, setOwnStyle] = useState<SongStyle | null>(null);
  const defaultStyle = useSongSlideSettings();
  const effectiveStyle = ownStyle ?? defaultStyle;
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    const fallbackBook = personalBooks.some((book) => book.id === defaultBookId) ? defaultBookId : personalBooks[0]?.id;
    setBookId(song?.bookId ?? fallbackBook ?? '');
    setNumber(song?.number ?? '');
    setTitle(song?.title ?? '');
    setAuthor(song?.author ?? '');
    setCopyright(song?.copyright ?? '');
    setLyrics(song?.lyrics ?? '');
    setOwnStyle(song?.style ? cleanSongStyle(song.style) : null);
    setTab('lyrics');
    setError('');
    setSaving(false);
    // Only reset when a different song is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, song?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 's' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const parts = useMemo(() => splitLyrics(lyrics, 99), [lyrics]);

  const insertLabel = (label: string) => {
    const area = lyricsRef.current;
    const used = lyrics.split('\n').filter((line) => new RegExp(`^${label}(\\s+\\d+)?$`, 'i').test(line.trim())).length;
    const text = label === 'Verse' ? `Verse ${used + 1}` : label;
    const position = area?.selectionStart ?? lyrics.length;
    const before = lyrics.slice(0, position).replace(/\s*$/, '');
    const after = lyrics.slice(position).replace(/^\s*/, '');
    const next = `${before}${before ? '\n\n' : ''}${text}\n${after}`;
    setLyrics(next);
    requestAnimationFrame(() => {
      const caret = `${before}${before ? '\n\n' : ''}${text}\n`.length;
      area?.focus();
      area?.setSelectionRange(caret, caret);
    });
  };

  const submit = async () => {
    if (saving) return;
    if (!title.trim()) { setError('Give the song a title.'); return; }
    if (!lyrics.trim()) { setError('Type or paste the lyrics.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: song?.id ?? newId('song'),
        // 'new' asks the page to create a first personal songbook ("My songs").
        bookId: bookId || 'new',
        number: number.trim() || undefined,
        title: title.trim(),
        author: author.trim() || undefined,
        copyright: copyright.trim() || undefined,
        lyrics,
        style: ownStyle ?? undefined,
        createdAt: song?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this song.');
      setSaving(false);
    }
  };

  if (!open) return null;

  const field = 'mt-1 w-full rounded-lg border border-white/10 bg-[#091521] px-3 py-2 text-sm font-normal text-white outline-none focus:border-brand';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="song-editor-title" className={`flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101d2a] shadow-2xl ${tab === 'design' ? 'h-[min(900px,94vh)] max-w-[1280px]' : 'max-h-[min(880px,94vh)] max-w-[880px]'}`}>
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand"><BookOpen size={20} /></span>
            <div className="min-w-0">
              <h2 id="song-editor-title" className="truncate text-base font-bold text-warm-white">{song ? `Edit “${song.title}”` : 'New song'}</h2>
              <p className="mt-0.5 text-xs text-warm-white/50">{tab === 'lyrics' ? 'Leave a blank line between parts. A line like “Verse 1” or “Chorus” names the part.' : 'Design how this song looks on screen. The preview shows every slide.'}</p>
            </div>
          </div>
          <div role="tablist" aria-label="Song editor" className="ml-auto flex shrink-0 gap-1 rounded-lg bg-black/25 p-1">
            {(['lyrics', 'design'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-md px-3 py-1 text-xs font-semibold ${tab === key ? 'bg-brand text-navy' : 'text-warm-white/65 hover:bg-white/10 hover:text-white'}`}>{key === 'lyrics' ? 'Lyrics' : 'Design'}</button>)}
          </div>
          <button onClick={onClose} aria-label="Close song editor" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>

        {live && <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-5 py-2 text-xs text-red-100"><Radio size={14} className="text-red-300" /> This song is on screen now. Saving updates the projection right away.</div>}
        {isStandard && <div className="border-b border-white/10 bg-white/[0.03] px-5 py-2 text-xs text-warm-white/60">This song is in a standard songbook. Your corrections are saved on this computer only, and you can restore the original at any time.</div>}

        {tab === 'design' ? (
          <SongDesignPanel
            song={{ title, author, copyright, lyrics }}
            style={effectiveStyle}
            ownDesign={ownStyle !== null}
            onTextChange={({ kind, oldText, occurrence, text }) => {
              if (kind === 'title') {
                setTitle(text);
                return;
              }
              setLyrics((current) => {
                if (!oldText) return current;
                let from = 0;
                let start = -1;
                for (let match = 0; match <= occurrence; match += 1) {
                  start = current.indexOf(oldText, from);
                  if (start < 0) return current;
                  from = start + oldText.length;
                }
                return `${current.slice(0, start)}${text}${current.slice(start + oldText.length)}`;
              });
            }}
            onChange={(patch) => setOwnStyle(cleanSongStyle({ ...effectiveStyle, ...patch }))}
            onUseDefault={() => setOwnStyle(null)}
            onMakeDefault={() => { saveSongSlideSettings(effectiveStyle); setOwnStyle(null); }}
          />
        ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
            <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
              <label className="text-xs font-semibold text-warm-white/70">No.
                <input value={number} onChange={(event) => setNumber(event.target.value.slice(0, 12))} placeholder="—" className={field} />
              </label>
              <label className="text-xs font-semibold text-warm-white/70">Title
                <input autoFocus={!song} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Song title" className={field} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-warm-white/45">Insert:</span>
              {PART_LABELS.map((label) => <button key={label} type="button" onClick={() => insertLabel(label)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-warm-white/75 hover:border-brand/50 hover:bg-white/5">{label}</button>)}
            </div>
            <label className="flex min-h-0 flex-1 flex-col text-xs font-semibold text-warm-white/70">Lyrics
              <textarea ref={lyricsRef} value={lyrics} onChange={(event) => setLyrics(event.target.value)} spellCheck placeholder={'Verse 1\nType the first verse here\n\nChorus\nType the chorus here'} className="mt-1 min-h-[300px] w-full flex-1 resize-none rounded-lg border border-white/10 bg-[#091521] px-3 py-2.5 font-mono text-[13px] font-normal leading-relaxed text-white outline-none focus:border-brand" />
            </label>
          </div>

          <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-white/10 bg-black/15 p-5 md:border-l md:border-t-0">
            <label className="text-xs font-semibold text-warm-white/70">Songbook
              {isStandard
                ? <p className="mt-1 rounded-lg border border-white/10 px-3 py-2 text-sm font-normal text-warm-white/60">{books.find((book) => book.id === song?.bookId)?.name}</p>
                : personalBooks.length
                  ? <select value={bookId} onChange={(event) => setBookId(event.target.value)} className={field}>{personalBooks.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select>
                  : <p className="mt-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-normal text-warm-white/60">A new songbook, “My songs”, will be created for it.</p>}
            </label>
            <label className="text-xs font-semibold text-warm-white/70">Author <span className="font-normal text-warm-white/40">(optional)</span>
              <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={160} className={field} />
            </label>
            <label className="text-xs font-semibold text-warm-white/70">Copyright / CCLI <span className="font-normal text-warm-white/40">(optional)</span>
              <input value={copyright} onChange={(event) => setCopyright(event.target.value)} maxLength={200} className={field} />
            </label>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-warm-white/45">Parts</p>
              {parts.length ? <ol className="mt-1.5 flex flex-col gap-1">
                {parts.map((part, index) => <li key={index} className="flex items-baseline gap-2 rounded-md bg-white/[0.04] px-2 py-1.5 text-[11px]"><span className="shrink-0 font-semibold text-brand">{part.label ?? `Part ${index + 1}`}</span><span className="truncate text-warm-white/55">{part.text.split('\n')[0]}</span></li>)}
              </ol> : <p className="mt-1.5 text-[11px] text-warm-white/40">Parts appear here as you type.</p>}
            </div>
          </aside>
        </div>

        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-white/10 px-5 py-3">
          {song && isStandard && song.edited && onRestore && <button type="button" onClick={() => onRestore(song)} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-warm-white/75 hover:bg-white/5"><RotateCcw size={14} /> Restore original</button>}
          {song && !isStandard && onDelete && <button type="button" onClick={() => onDelete(song)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Delete song</button>}
          {error && <p role="alert" className="text-xs text-amber-200">{error}</p>}
          <span className="ml-auto text-[10px] text-warm-white/35">Ctrl+S to save</span>
          <button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
          <button onClick={() => { void submit(); }} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy transition hover:brightness-110 disabled:opacity-50">{saving ? 'Saving…' : 'Save song'}</button>
        </footer>
      </section>
    </div>
  );
}
