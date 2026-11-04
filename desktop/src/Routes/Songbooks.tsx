import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronDown, Copy, Download, FileText, Monitor, FolderPlus, HardDriveDownload, HardDriveUpload, Library, Lock, MoreHorizontal, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import ConfirmationModal from '../components/modal/ConfirmationModal';
import SongEditorModal from '../components/modal/SongEditorModal';
import SongSlideSettingsButton from '../components/SongSlideSettingsButton';
import GuideTip from '../components/GuideTip';
import {
  SONGS_CHANGED_EVENT,
  SONG_FILE_ACCEPT,
  backupFileName,
  compareSongs,
  copySongsTo,
  createBackup,
  createSongbook,
  deleteSongbook,
  deleteSongs,
  exportSongbooks,
  firstLine,
  importSongFiles,
  loadLibrary,
  renameSongbook,
  restoreBackup,
  restoreStandardSong,
  saveSong,
  saveTextFile,
  searchSongs,
  showSongInStudio,
  type Song,
  type Songbook,
} from '../utils/songbooks';

const ALL = 'all';

/**
 * The songbook library. Shown as the Songbooks tab of the Presentations page (embedded), and
 * connected to Studio: "Show in Studio" puts a song on Studio's screen, and "Make a presentation"
 * turns it into a presentation you can design.
 */
export default function Songbooks({ embedded = false, onMakePresentation }: { embedded?: boolean; onMakePresentation?: (song: Song) => void } = {}) {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Songbook[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBook, setActiveBook] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ song: Song | null } | null>(null);
  const [newBookName, setNewBookName] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ book: Songbook; name: string } | null>(null);
  const [bookMenu, setBookMenu] = useState<string | null>(null);
  const [songMenu, setSongMenu] = useState<string | null>(null);
  const [importMenu, setImportMenu] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: string; label?: string; onConfirm: () => void } | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoredSettings, setRestoredSettings] = useState(false);
  const statusTimer = useRef<number | undefined>(undefined);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);
  const markFolder = useCallback((element: HTMLInputElement | null) => {
    folderInput.current = element;
    if (element) { element.setAttribute('webkitdirectory', ''); element.setAttribute('directory', ''); }
  }, []);

  const flash = (message: string) => {
    setStatus(message);
    window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(''), Math.min(9000, Math.max(3000, message.length * 45)));
  };

  const reload = useCallback(async () => {
    try {
      const library = await loadLibrary();
      setBooks(library.books);
      setSongs(library.songs);
    } catch {
      flash('Could not open the songbooks on this computer.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onChanged = () => { void reload(); };
    window.addEventListener(SONGS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(SONGS_CHANGED_EVENT, onChanged);
  }, [reload]);

  useEffect(() => {
    if (!bookMenu && !songMenu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-songbook-menu]')) { setBookMenu(null); setSongMenu(null); }
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setBookMenu(null); setSongMenu(null); } };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
  }, [bookMenu, songMenu]);

  const standardBooks = books.filter((book) => book.kind === 'standard');
  const personalBooks = books.filter((book) => book.kind === 'personal');
  const current = books.find((book) => book.id === activeBook);
  const countIn = (bookId: string) => songs.filter((song) => song.bookId === bookId).length;
  const visibleSongs = useMemo(() => {
    const scoped = activeBook === ALL ? songs : songs.filter((song) => song.bookId === activeBook);
    return query.trim() ? searchSongs(scoped, query) : [...scoped].sort(compareSongs);
  }, [songs, activeBook, query]);
  const bookName = (bookId: string) => books.find((book) => book.id === bookId)?.name ?? '';

  /** Imports go into the open personal songbook, or the first one, or a new "Imported songs" book. */
  const importTarget = async () => {
    if (current?.kind === 'personal') return current;
    if (personalBooks[0]) return personalBooks[0];
    return createSongbook('Imported songs');
  };

  const runImport = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      const target = await importTarget();
      const report = await importSongFiles(files, target.id, songs);
      await reload();
      if (!report.booksCreated.length) setActiveBook(target.id);
      const where = report.booksCreated.length ? `${report.booksCreated.length === 1 ? `new songbook “${report.booksCreated[0]}”` : `${report.booksCreated.length} new songbooks`}` : `“${target.name}”`;
      flash(`${report.added} ${report.added === 1 ? 'song' : 'songs'} imported into ${where}${report.skipped.length ? ` · skipped ${report.skipped.length}: ${report.skipped.slice(0, 3).join(', ')}${report.skipped.length > 3 ? '…' : ''}` : ''}`);
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not import these songs.');
    } finally {
      setBusy(false);
    }
  };

  const addBook = async () => {
    const name = newBookName?.trim();
    setNewBookName(null);
    if (!name) return;
    const book = await createSongbook(name);
    await reload();
    setActiveBook(book.id);
  };

  const exportBook = async (book: Songbook) => {
    setBookMenu(null);
    const result = await saveTextFile(`${book.name}.fssongbook`, exportSongbooks([book], songs), 'songbook');
    if (result.ok && !result.canceled) flash(`Saved “${book.name}”. Open it on another computer with Import songs.`);
    else if (!result.ok) flash(result.message ?? 'Could not save the songbook file.');
  };

  const backup = async () => {
    setBusy(true);
    try {
      const result = await saveTextFile(backupFileName(), await createBackup(), 'backup');
      if (result.ok && !result.canceled) flash('Backup saved. Keep it somewhere safe, such as a USB drive.');
      else if (!result.ok) flash(result.message ?? 'Could not save the backup.');
    } catch {
      flash('Could not create the backup.');
    } finally {
      setBusy(false);
    }
  };

  const restore = (file: File | undefined) => {
    if (!file) return;
    setConfirm({
      title: 'Restore from backup?',
      message: `Restore songbooks and settings from “${file.name}”? Songs in the backup are added to this computer; songs with the same entry are replaced by the backup’s copy. Your presentations are not changed.`,
      label: 'Restore',
      onConfirm: () => {
        setConfirm(null);
        void (async () => {
          setBusy(true);
          try {
            const result = await restoreBackup(await file.text());
            await reload();
            setRestoredSettings(result.settings > 0);
            flash(`Restored ${result.books} ${result.books === 1 ? 'songbook' : 'songbooks'}, ${result.songs} songs, ${result.corrections} corrections and ${result.settings} settings.`);
          } catch (error) {
            flash(error instanceof Error && error.message.startsWith('This') ? error.message : 'This file could not be restored.');
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  const removeBook = (book: Songbook) => {
    setBookMenu(null);
    const count = countIn(book.id);
    setConfirm({
      title: `Delete “${book.name}”?`,
      message: `This deletes the songbook and its ${count} ${count === 1 ? 'song' : 'songs'} from this computer. Export it first if you may need it again.`,
      onConfirm: () => {
        setConfirm(null);
        void deleteSongbook(book, songs).then(() => { setActiveBook(ALL); flash(`Deleted “${book.name}”.`); });
      },
    });
  };

  const removeSong = (song: Song) => {
    setSongMenu(null);
    setConfirm({
      title: `Delete “${song.title}”?`,
      message: 'This removes the song from your songbook on this computer.',
      onConfirm: () => {
        setConfirm(null);
        setEditing(null);
        void deleteSongs([song.id]).then(() => flash(`Deleted “${song.title}”.`));
      },
    });
  };

  const showInStudio = (song: Song) => {
    setSongMenu(null);
    showSongInStudio(song, 0);
    navigate('/');
  };

  const makePresentation = (song: Song) => {
    setSongMenu(null);
    onMakePresentation?.(song);
  };

  const copyTo = async (song: Song, book: Songbook) => {
    setSongMenu(null);
    await copySongsTo([song], book.id);
    flash(`Copied “${song.title}” to “${book.name}”.`);
  };

  const bookRow = (book: Songbook | null) => {
    const id = book?.id ?? ALL;
    const active = activeBook === id;
    if (book && renaming?.book.id === book.id) {
      return (
        <form key={id} onSubmit={(event) => { event.preventDefault(); const next = renaming; setRenaming(null); void renameSongbook(next.book, next.name); }} className="px-1 py-0.5">
          <input autoFocus value={renaming.name} onChange={(event) => setRenaming({ book, name: event.target.value })} onBlur={() => setRenaming(null)} onKeyDown={(event) => { if (event.key === 'Escape') setRenaming(null); }} aria-label="Songbook name" maxLength={80} className="w-full rounded-md border border-brand bg-black/30 px-2 py-1.5 text-sm text-white outline-none" />
        </form>
      );
    }
    return (
      <div key={id} className={`group relative flex items-center rounded-lg ${active ? 'bg-brand/15' : 'hover:bg-white/5'}`}>
        <button onClick={() => { setActiveBook(id); setQuery(''); }} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-sm">
          {book ? (book.kind === 'standard' ? <Lock size={14} className="shrink-0 text-warm-white/40" /> : <BookOpen size={14} className={`shrink-0 ${active ? 'text-brand' : 'text-warm-white/50'}`} />) : <Library size={14} className={`shrink-0 ${active ? 'text-brand' : 'text-warm-white/50'}`} />}
          <span className={`min-w-0 flex-1 truncate ${active ? 'font-semibold text-white' : 'text-warm-white/80'}`}>{book?.name ?? 'All songs'}</span>
          <span className="shrink-0 text-xs tabular-nums text-warm-white/40">{book ? countIn(book.id) : songs.length}</span>
        </button>
        {book?.kind === 'personal' && <>
          <button data-songbook-menu aria-label={`Options for ${book.name}`} onClick={() => setBookMenu(bookMenu === book.id ? null : book.id)} className="mr-1 rounded-md p-1 text-warm-white/50 opacity-0 hover:bg-white/10 hover:text-white focus:opacity-100 group-hover:opacity-100"><MoreHorizontal size={15} /></button>
          {bookMenu === book.id && <div data-songbook-menu className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-white/10 bg-navy p-1.5 text-sm text-warm-white shadow-xl">
            <button onClick={() => { setBookMenu(null); setRenaming({ book, name: book.name }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"><Pencil size={14} /> Rename</button>
            <button onClick={() => { void exportBook(book); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"><Download size={14} /> Export to file</button>
            <button onClick={() => removeBook(book)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Delete songbook</button>
          </div>}
        </>}
      </div>
    );
  };

  return (
    <div className={`flex h-full min-h-0 flex-col gap-4 ${embedded ? '' : 'p-6 md:p-8'}`}>
      <div className={`flex shrink-0 flex-wrap items-center gap-4 ${embedded ? 'justify-end' : 'justify-between'}`}>
        {!embedded && <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/15 text-brand"><BookOpen size={22} /></span>
          <div>
            <h1 className="text-2xl font-bold text-warm-white">Songbooks</h1>
            <p className="mt-1 text-sm text-warm-white/55">Your song library. Songs appear in Studio under Music → Songbooks.</p>
          </div>
        </div>}
        <div className="flex flex-wrap gap-2">
          <SongSlideSettingsButton />
          <button disabled={busy} onClick={() => { void backup(); }} title="Save songbooks and settings to a file" className="flex items-center gap-2 rounded-xl border border-white/15 bg-panel px-3.5 py-2.5 text-sm font-semibold text-warm-white hover:bg-white/5 disabled:opacity-50"><HardDriveDownload size={16} /> Backup</button>
          <button disabled={busy} onClick={() => restoreInput.current?.click()} title="Restore songbooks and settings from a backup file" className="flex items-center gap-2 rounded-xl border border-white/15 bg-panel px-3.5 py-2.5 text-sm font-semibold text-warm-white hover:bg-white/5 disabled:opacity-50"><HardDriveUpload size={16} /> Restore</button>
          <div className="relative">
            <button disabled={busy} aria-haspopup="menu" aria-expanded={importMenu} onClick={() => setImportMenu((open) => !open)} className="flex items-center gap-2 rounded-xl border border-white/15 bg-panel px-3.5 py-2.5 text-sm font-semibold text-warm-white hover:bg-white/5 disabled:opacity-50"><Upload size={16} /> Import songs <ChevronDown size={14} /></button>
            {importMenu && <>
              <div className="fixed inset-0 z-20" onClick={() => setImportMenu(false)} />
              <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-80 rounded-xl border border-white/10 bg-navy p-1.5 text-sm text-warm-white shadow-xl">
                <button role="menuitem" onClick={() => { setImportMenu(false); filesInput.current?.click(); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/10"><Upload size={16} className="mt-0.5 shrink-0 text-brand" /><span><span className="block font-semibold">Song files</span><span className="block text-xs text-warm-white/50">Text (.txt), ChordPro, OpenLyrics (.xml) or FaithStream songbook files</span></span></button>
                <button role="menuitem" onClick={() => { setImportMenu(false); folderInput.current?.click(); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/10"><FolderPlus size={16} className="mt-0.5 shrink-0 text-brand" /><span><span className="block font-semibold">A folder of songs</span><span className="block text-xs text-warm-white/50">For example, a folder on a USB flash drive</span></span></button>
                <p className="px-3 pb-1 pt-2 text-[11px] text-warm-white/40">Songs go into {current?.kind === 'personal' ? `“${current.name}”` : personalBooks[0] ? `“${personalBooks[0].name}”` : 'a new “Imported songs” songbook'}. Standard songbooks are never changed.</p>
              </div>
            </>}
          </div>
          <button onClick={() => setEditing({ song: null })} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-navy shadow-lg shadow-black/20 hover:brightness-110"><Plus size={17} /> New song</button>
        </div>
      </div>
      <input ref={filesInput} type="file" multiple accept={SONG_FILE_ACCEPT} hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void runImport(files); }} />
      <input ref={markFolder} type="file" multiple hidden onChange={(event) => { const files = Array.from(event.target.files ?? []).filter((file) => /\.(txt|cho|chordpro|chopro|crd|pro|xml|fssongbook)$/i.test(file.name)); event.target.value = ''; void runImport(files); }} />
      <input ref={restoreInput} type="file" accept=".fsbackup,application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; restore(file); }} />

      <GuideTip
        permanent
        id="songbooks-library"
        title="How songs work"
        steps={[
          <>Add songs here: <b>New song</b>, or <b>Import songs</b> from files or a USB drive.</>,
          <>To show one, click <b>Add to Studio</b>, or find it in Studio → Music → <b>Songbooks</b>.</>,
          <>To change how a song looks, click it and open the <b>Design</b> tab. <b>Default look</b> sets the look for every song.</>,
        ]}
      />
      {restoredSettings && <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-2.5 text-sm text-warm-white/80">Settings were restored. Reload FaithStream to apply them everywhere.<button onClick={() => window.location.reload()} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-navy">Reload now</button></div>}

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-white/10 bg-panel p-2">
          {bookRow(null)}
          <p className="mt-3 px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-warm-white/40">Standard</p>
          {standardBooks.map((book) => bookRow(book))}
          <div className="mt-3 flex items-center justify-between px-3 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-warm-white/40">My songbooks</p>
            <button aria-label="New songbook" title="New songbook" onClick={() => setNewBookName('')} className="rounded p-0.5 text-warm-white/50 hover:bg-white/10 hover:text-brand"><Plus size={15} /></button>
          </div>
          {personalBooks.map((book) => bookRow(book))}
          {newBookName !== null
            ? <form onSubmit={(event) => { event.preventDefault(); void addBook(); }} className="px-1 py-0.5"><input autoFocus value={newBookName} onChange={(event) => setNewBookName(event.target.value)} onBlur={() => { void addBook(); }} onKeyDown={(event) => { if (event.key === 'Escape') setNewBookName(null); }} placeholder="Songbook name" aria-label="New songbook name" maxLength={80} className="w-full rounded-md border border-brand bg-black/30 px-2 py-1.5 text-sm text-white outline-none" /></form>
            : !personalBooks.length && <button onClick={() => setNewBookName('')} className="mx-1 mt-1 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-left text-xs text-warm-white/50 hover:border-brand/40 hover:text-warm-white">+ Create your own songbook for your church’s songs</button>}
        </aside>

        <section className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-panel">
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 p-3">
            <label className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-warm-white/40" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${current ? `“${current.name}”` : 'all songbooks'} by number, title or words`} aria-label="Search songs" className="w-full rounded-lg border border-white/10 bg-black/20 py-2 pl-9 pr-3 text-sm text-warm-white outline-none placeholder:text-warm-white/35 focus:border-brand" />
            </label>
            {current?.kind === 'standard' && <span className="flex items-center gap-1.5 text-[11px] text-warm-white/45"><Lock size={12} /> Standard songbook · read-only</span>}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && <li className="p-6 text-center text-sm text-warm-white/45">Loading songs…</li>}
            {!loading && !visibleSongs.length && <li className="p-10 text-center text-sm text-warm-white/50">{query ? 'No songs match your search.' : current?.kind === 'personal' ? 'This songbook is empty. Add a song or import some.' : 'No songs yet.'}</li>}
            {visibleSongs.map((song) => {
              const standard = books.find((book) => book.id === song.bookId)?.kind === 'standard';
              return (
                <li key={song.id} className="group relative">
                  <button onClick={() => setEditing({ song })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5">
                    <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-brand/90">{song.number ?? ''}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-warm-white">{song.title}</span>{song.edited && <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">Corrected</span>}</span>
                      <span className="block truncate text-xs text-warm-white/45">{firstLine(song)}{activeBook === ALL ? ` · ${bookName(song.bookId)}` : ''}</span>
                    </span>
                  </button>
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                    <button onClick={() => showInStudio(song)} title="Add this song to Studio and open it there" className="flex items-center gap-1 rounded-md border border-white/15 bg-panel px-2 py-1 text-[11px] font-semibold text-warm-white/80 hover:border-brand/50 hover:text-white"><Monitor size={12} /> Add to Studio</button>
                    <button data-songbook-menu aria-label={`Options for ${song.title}`} onClick={() => setSongMenu(songMenu === song.id ? null : song.id)} className="rounded-md p-1.5 text-warm-white/50 hover:bg-white/10 hover:text-white"><MoreHorizontal size={15} /></button>
                  </div>
                  {songMenu === song.id && <div data-songbook-menu className="absolute right-2 top-full z-30 mt-1 w-56 rounded-xl border border-white/10 bg-navy p-1.5 text-sm text-warm-white shadow-xl">
                    <button onClick={() => showInStudio(song)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"><Monitor size={14} /> Add to Studio</button>
                    <button onClick={() => { setSongMenu(null); setEditing({ song }); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10"><Pencil size={14} /> {standard ? 'Correct lyrics' : 'Edit'}</button>
                    {personalBooks.filter((book) => book.id !== song.bookId).length > 0 && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-warm-white/40">Copy to</p>}
                    {personalBooks.filter((book) => book.id !== song.bookId).map((book) => <button key={book.id} onClick={() => { void copyTo(song, book); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left hover:bg-white/10"><Copy size={13} /> <span className="truncate">{book.name}</span></button>)}
                    {!standard && <button onClick={() => removeSong(song)} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"><Trash2 size={14} /> Delete song</button>}
                    {onMakePresentation && <>
                      <div className="my-1 border-t border-white/10" />
                      <button onClick={() => makePresentation(song)} title="Makes a separate presentation copy to design slide by slide. Most songs don't need this: use Edit → Design instead." className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-warm-white/60 hover:bg-white/10"><FileText size={14} /> <span>Copy as presentation <span className="text-[10px] text-warm-white/40">(advanced)</span></span></button>
                    </>}
                  </div>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {status && <div role="status" className="pointer-events-none fixed bottom-16 left-1/2 z-50 max-w-[min(680px,90vw)] -translate-x-1/2 rounded-xl border border-white/10 bg-navy/95 px-4 py-2.5 text-center text-sm text-warm-white shadow-2xl backdrop-blur">{status}</div>}

      <SongEditorModal
        open={editing !== null}
        song={editing?.song ?? null}
        books={books}
        defaultBookId={current?.kind === 'personal' ? current.id : undefined}
        onClose={() => setEditing(null)}
        onSave={async (song) => {
          const target = song.bookId === 'new' ? await createSongbook('My songs') : null;
          await saveSong(target ? { ...song, bookId: target.id } : song);
          if (target) setActiveBook(target.id);
          setEditing(null);
          flash(`Saved “${song.title}”.`);
        }}
        onDelete={removeSong}
        onRestore={(song) => {
          void restoreStandardSong(song.id).then(() => { setEditing(null); flash(`Restored the original “${song.title}”.`); });
        }}
      />
      <ConfirmationModal
        open={confirm !== null}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label ?? 'Delete'}
        tone={confirm?.label ? 'soft-danger' : 'default'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm()}
      />
    </div>
  );
}
