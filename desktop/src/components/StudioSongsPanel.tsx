import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, Music, Pencil, Plus, Radio, Search, X } from 'lucide-react';
import SongEditorModal from './modal/SongEditorModal';
import SongSlideSettingsButton, { useSongSlideSettings } from './SongSlideSettingsButton';
import {
  SONGBOOKS_PATH,
  SONGS_CHANGED_EVENT,
  compareSongs,
  createSongbook,
  firstLine,
  loadLibrary,
  restoreStandardSong,
  saveSong,
  searchSongs,
  songScreens,
  songStyleFor,
  synchronizeAccountSongbooks,
  type Song,
  type Songbook,
} from '../utils/songbooks';

const SELECTED_BOOKS_KEY = 'faithstream.studio-song-books';
const EXPANDED_BOOKS_KEY = 'faithstream.studio-song-tree';

const readSelectedBooks = (): string[] | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTED_BOOKS_KEY) ?? 'null') as unknown;
    return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : null;
  } catch { return null; }
};

/** Chooses which songbooks Studio searches. Opens as a floating checklist so the narrow panel never stretches. */
function BookPicker({ books, selected, onChange }: { books: Songbook[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), width: Math.max(rect.width, 260) });
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popover.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const chosen = books.filter((book) => selected.includes(book.id));
  const label = !chosen.length ? 'No songbooks' : chosen.length === books.length ? 'All songbooks' : chosen.length === 1 ? chosen[0].name : `${chosen.length} songbooks`;
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  const group = (kind: Songbook['kind'], title: string) => {
    const list = books.filter((book) => book.kind === kind);
    if (!list.length) return null;
    return <>
      <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-warm-white/40">{title}</p>
      {list.map((book) => {
        const checked = selected.includes(book.id);
        return <button key={book.id} type="button" role="option" aria-selected={checked} onClick={() => toggle(book.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs ${checked ? 'text-white' : 'text-warm-white/65 hover:bg-white/5'}`}>
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-brand bg-brand text-white' : 'border-white/25'}`}>{checked && <Check size={11} strokeWidth={3} />}</span>
          <span className="truncate">{book.name}</span>
        </button>;
      })}
    </>;
  };
  return <>
    <button ref={trigger} type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)} title="Choose which songbooks to search" className={`flex h-7 min-w-0 items-center gap-1 rounded-md border bg-slate-950 px-2 text-[11px] text-warm-white/85 hover:border-white/30 ${open ? 'border-brand' : 'border-white/15'}`}>
      <span className="truncate">{label}</span><ChevronDown size={12} className="shrink-0 text-warm-white/50" />
    </button>
    {open && position && createPortal(
      <div ref={popover} role="listbox" aria-multiselectable="true" aria-label="Songbooks to search" style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }} className="z-[200] max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-panel p-1.5 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-warm-white/50">Search in</span>
          <span className="flex gap-2 text-[10px] font-semibold"><button type="button" onClick={() => onChange(books.map((book) => book.id))} className="text-brand hover:underline">All</button><button type="button" onClick={() => onChange([])} className="text-warm-white/60 hover:underline">None</button></span>
        </div>
        {group('standard', 'Standard')}
        {group('personal', 'My songbooks')}
      </div>,
      document.body,
    )}
  </>;
}

/**
 * Studio → Music → Songs. Pick a song, then click a verse or chorus to show it. Edit the words
 * at any time, even while the song is on screen; Studio updates the projection on save.
 */
export default function StudioSongsPanel({
  liveSongId,
  liveScreenIndex,
  sceneSongIds,
  onAddToScenes,
}: {
  /** Song showing on air right now, if any. */
  liveSongId?: string;
  liveScreenIndex?: number;
  /** Songs that are already in the Scenes list. */
  sceneSongIds: string[];
  /** Add the song to the Scenes list. It never goes on air from here. */
  onAddToScenes: (song: Song) => void;
}) {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Songbook[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [selectedBooks, setSelectedBooks] = useState<string[] | null>(readSelectedBooks);
  const [query, setQuery] = useState('');
  const [openSongId, setOpenSongId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ song: Song | null } | null>(null);
  const [error, setError] = useState('');
  const slideSettings = useSongSlideSettings();
  const [expanded, setExpanded] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(EXPANDED_BOOKS_KEY) ?? '[]') as unknown;
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  });
  const toggleBook = (id: string) => setExpanded((current) => {
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    try { localStorage.setItem(EXPANDED_BOOKS_KEY, JSON.stringify(next)); } catch { /* keep for this session */ }
    return next;
  });

  const reload = useCallback(() => {
    void loadLibrary().then((library) => { setBooks(library.books); setSongs(library.songs); setError(''); }).catch(() => setError('Could not open the songbooks.'));
  }, []);
  useEffect(() => {
    reload();
    void synchronizeAccountSongbooks().then(reload).catch(() => undefined);
    window.addEventListener(SONGS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(SONGS_CHANGED_EVENT, reload);
  }, [reload]);

  // Default: search every songbook. Remember the choice, and include new songbooks automatically.
  const activeBooks = useMemo(() => selectedBooks ?? books.map((book) => book.id), [selectedBooks, books]);
  const setActiveBooks = (ids: string[]) => {
    setSelectedBooks(ids);
    try { localStorage.setItem(SELECTED_BOOKS_KEY, JSON.stringify(ids)); } catch { /* keep for this session */ }
  };

  // The tree: each chosen songbook with its songs. While searching, only matching songs show
  // and every songbook with a match opens automatically.
  const searching = query.trim().length > 0;
  const tree = useMemo(() => books.filter((book) => activeBooks.includes(book.id)).map((book) => {
    const inBook = songs.filter((song) => song.bookId === book.id);
    return { book, total: inBook.length, songs: searching ? searchSongs(inBook, query) : [...inBook].sort(compareSongs) };
  }).filter((node) => !searching || node.songs.length > 0), [books, songs, activeBooks, query, searching]);
  const matchCount = tree.reduce((sum, node) => sum + node.songs.length, 0);
  const openSong = songs.find((song) => song.id === openSongId) ?? null;
  // Each song uses its own design, or the default song style (re-read when the default changes).
  const openStyle = openSong ? songStyleFor(openSong) : slideSettings;
  const screens = openSong ? songScreens(openSong, openStyle) : [];
  const bookName = (id: string) => books.find((book) => book.id === id)?.name ?? '';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!openSong ? <>
        <div className="mb-1.5 flex shrink-0 items-center gap-1">
          <label className="relative min-w-0 flex-1">
            <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-brand/80" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }} placeholder="Keywords or number to search" aria-label="Search songs" className="h-7 w-full rounded-md border border-white/15 bg-slate-950 pl-7 pr-6 text-[11px] text-warm-white outline-none placeholder:text-warm-white/35 focus:border-brand" />
            {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-warm-white/50 hover:bg-white/10 hover:text-white"><X size={12} /></button>}
          </label>
          <SongSlideSettingsButton compact />
          <button type="button" aria-label="New song" title="Type in a new song" onClick={() => setEditing({ song: null })} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/15 text-warm-white/70 hover:border-brand/50 hover:text-brand"><Plus size={14} /></button>
        </div>
        <div className="mb-1.5 flex shrink-0 items-center justify-between gap-1.5">
          <BookPicker books={books} selected={activeBooks} onChange={setActiveBooks} />
          {searching
            ? <span className="shrink-0 text-[10px] text-warm-white/45">{matchCount} {matchCount === 1 ? 'match' : 'matches'}</span>
            : <button type="button" onClick={() => navigate(SONGBOOKS_PATH)} className="shrink-0 text-[10px] font-semibold text-warm-white/50 hover:text-brand">Manage</button>}
        </div>
        {error && <p className="text-[11px] text-amber-200">{error}</p>}
        <ul role="tree" aria-label="Songbooks" className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 py-1" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
          {!tree.length && <li className="p-3 text-center text-[11px] leading-relaxed text-warm-white/45">{!activeBooks.length ? 'Choose at least one songbook to search.' : searching ? 'No songs match.' : 'No songbooks yet.'}</li>}
          {tree.map(({ book, total, songs: bookSongs }) => {
            const open = searching || expanded.includes(book.id);
            return (
              <li key={book.id} role="treeitem" aria-expanded={open}>
                <button type="button" onClick={() => { if (!searching) toggleBook(book.id); }} title={book.kind === 'standard' ? 'Standard songbook (read-only)' : 'Your songbook'} className="flex w-full items-center gap-1 px-1.5 py-1 text-left hover:bg-white/5">
                  {open ? <ChevronDown size={12} className="shrink-0 text-warm-white/50" /> : <ChevronRight size={12} className="shrink-0 text-warm-white/50" />}
                  <BookOpen size={13} className={`shrink-0 ${book.kind === 'standard' ? 'text-amber-300/90' : 'text-sky-300/90'}`} />
                  <span className="min-w-0 truncate text-[11px] font-semibold text-warm-white/90">{book.name}{book.deviceOnly && <span className="ml-1 font-normal text-warm-white/40">· This device</span>}</span>
                  <span className="shrink-0 text-[10px] text-warm-white/40">({searching ? `${bookSongs.length} of ${total}` : `${total} ${total === 1 ? 'song' : 'songs'}`})</span>
                </button>
                {open && <ul role="group">
                  {!bookSongs.length && <li className="py-1 pl-9 text-[10px] text-warm-white/35">Empty</li>}
                  {bookSongs.map((song) => {
                    const live = liveSongId === song.id;
                    return (
                      <li key={song.id} role="treeitem">
                        <button type="button" onClick={() => setOpenSongId(song.id)} title={`${song.title}${firstLine(song) ? ` — ${firstLine(song)}` : ''}`} className={`flex w-full items-center gap-1.5 py-[3px] pl-6 pr-1.5 text-left ${live ? 'bg-red-500/15' : 'hover:bg-white/5'}`}>
                          <Music size={11} className={`shrink-0 ${live ? 'text-red-300' : 'text-sky-300/80'}`} />
                          {song.number && <span className="shrink-0 text-[10px] tabular-nums text-warm-white/55">{song.number}</span>}
                          <span className={`min-w-0 truncate text-[11px] ${live ? 'font-semibold text-white' : 'text-warm-white/85'}`}>{song.title}</span>
                          {live ? <Radio size={10} className="ml-auto shrink-0 text-red-300" /> : sceneSongIds.includes(song.id) && <Check size={10} aria-label="In scenes" className="ml-auto shrink-0 text-emerald-300/80" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>}
              </li>
            );
          })}
        </ul>
      </> : <>
        <div className="mb-1.5 flex shrink-0 items-center gap-1">
          <button type="button" aria-label="Back to songs" onClick={() => setOpenSongId(null)} className="rounded-md p-1 text-warm-white/60 hover:bg-white/10 hover:text-white"><ArrowLeft size={14} /></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white" title={openSong.title}>{openSong.number ? `${openSong.number}. ` : ''}{openSong.title}</p>
            <p className="truncate text-[10px] text-warm-white/40">{bookName(openSong.bookId)}</p>
          </div>
          {sceneSongIds.includes(openSong.id)
            ? <span title="This song is in the Scenes list" className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-1 text-[10px] font-semibold text-emerald-200"><Check size={11} /> In scenes</span>
            : <button type="button" onClick={() => onAddToScenes(openSong)} title="Add this song to the Scenes list" className="flex shrink-0 items-center gap-1 rounded-md bg-brand px-1.5 py-1 text-[10px] font-bold text-navy hover:brightness-110"><Plus size={11} /> Add to scenes</button>}
          <button type="button" onClick={() => setEditing({ song: openSong })} title={liveSongId === openSong.id ? 'Correct the words; the screen updates when you save' : 'Edit the words'} className="flex shrink-0 items-center gap-1 rounded-md border border-white/15 px-1.5 py-1 text-[10px] font-semibold text-warm-white/75 hover:border-brand/50 hover:text-white"><Pencil size={11} /> Edit</button>
        </div>
        <ol className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,.35) transparent' }}>
          {screens.map((screen, index) => {
            const live = liveSongId === openSong.id && liveScreenIndex === index;
            // A read-only preview of the parts: songs are shown from the slide row like any scene.
            return (
              <li key={index}>
                <div className={`w-full rounded-lg border px-2 py-1.5 text-left ${live ? 'border-red-400/70 bg-red-500/10' : 'border-white/10'}`}>
                  <span className="flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-bold ${live ? 'text-red-200' : 'text-brand'}`}>{screen.label ?? `Part ${index + 1}`}</span>
                    {live && <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-red-200"><Radio size={9} /> On air</span>}
                  </span>
                  <span className={`mt-0.5 line-clamp-4 block whitespace-pre-line text-[10px] leading-snug ${screen.kind === 'title' ? 'font-semibold text-white/85' : 'text-warm-white/70'} ${openStyle.caps ? 'uppercase' : ''}`}>{screen.text}{screen.kind === 'title' && screen.subtitle ? <span className="block font-normal normal-case text-warm-white/45">{screen.subtitle}</span> : null}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </>}

      <SongEditorModal
        open={editing !== null}
        song={editing?.song ?? null}
        books={books}
        defaultBookId={books.find((book) => book.kind === 'personal' && activeBooks.includes(book.id))?.id}
        live={!!editing?.song && editing.song.id === liveSongId}
        onClose={() => setEditing(null)}
        onSave={async (song) => {
          const target = song.bookId === 'new' ? await createSongbook('My songs') : null;
          const saved = await saveSong(target ? { ...song, bookId: target.id } : song);
          if (target && selectedBooks) setActiveBooks([...selectedBooks, target.id]);
          setEditing(null);
          setOpenSongId(saved.id);
        }}
        onRestore={(song) => { void restoreStandardSong(song.id).then(() => setEditing(null)); }}
      />
    </div>
  );
}
