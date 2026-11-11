/**
 * Songbooks: a song library organised into books.
 *
 * - Standard songbooks ship with the app and are read-only. Imports can never go into them.
 *   A correction to a standard song is stored separately as an "override" and can be undone.
 * - Personal songbooks are created by the user and hold typed-in or imported songs.
 * - Everything is stored on this computer in IndexedDB, per signed-in account.
 */
import { getAccountDatabaseName, getAccountStorageKey } from './accountStorage';
import { API_BASE_URL } from './apiConfig';
import { STANDARD_SONGBOOKS } from '../data/standardHymns';
import { splitLyrics } from './slideLibrary';
import { isCustomBackground } from './slideBackground';

export type Songbook = { id: string; name: string; kind: 'standard' | 'personal'; createdAt: number; updatedAt?: number; /** Imported or restored on this computer; excluded from account sync. */ deviceOnly?: boolean };
export type Song = {
  id: string;
  bookId: string;
  number?: string;
  title: string;
  author?: string;
  copyright?: string;
  /** Lyrics as typed: blank lines between parts; lines like "Verse 1" or "Chorus" name the part. */
  lyrics: string;
  createdAt: number;
  updatedAt: number;
  /** True when a standard song has been corrected on this computer. */
  edited?: boolean;
  /** Imported or restored on this computer; excluded from account sync. */
  deviceOnly?: boolean;
  /** This song's own slide design. Without it, the song follows the default song style. */
  style?: SongStyle;
};
type SongOverride = { id: string; title: string; author?: string; copyright?: string; lyrics: string; updatedAt: number; style?: SongStyle };

export const SONGS_CHANGED_EVENT = 'faithstream:songs-changed';
export const SONG_SAVED_EVENT = 'faithstream:song-saved';

const DB_NAME = 'faithstream.songbooks';
const BOOKS = 'books';
const SONGS = 'songs';
const OVERRIDES = 'overrides';

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(getAccountDatabaseName(DB_NAME), 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: 'id' });
    if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: 'id' }).createIndex('bookId', 'bookId');
    if (!db.objectStoreNames.contains(OVERRIDES)) db.createObjectStore(OVERRIDES, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const readAll = async <T>(store: string): Promise<T[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
    request.transaction?.addEventListener('complete', () => db.close(), { once: true });
  });
};

const write = async (changes: { store: string; put?: unknown[]; remove?: string[] }[]) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(changes.map((change) => change.store), 'readwrite');
    for (const change of changes) {
      const store = transaction.objectStore(change.store);
      for (const item of change.put ?? []) store.put(item);
      for (const key of change.remove ?? []) store.delete(key);
    }
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
  window.dispatchEvent(new CustomEvent(SONGS_CHANGED_EVENT));
};

type SyncedSongbook = { id: string; name: string; createdAt: number; updatedAt: number; songs: Song[]; deleted?: boolean };
const accountSyncFlights = new Map<string, Promise<void>>();
const DELETED_SONGBOOKS_KEY = 'faithstream.deleted-songbooks';

const deletedSongbookIds = () => {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(getAccountStorageKey(DELETED_SONGBOOKS_KEY)) ?? '[]');
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
};

const saveDeletedSongbookIds = (ids: string[]) => {
  try { localStorage.setItem(getAccountStorageKey(DELETED_SONGBOOKS_KEY), JSON.stringify([...new Set(ids)])); } catch { /* Retry deletions at next sync when storage is available. */ }
};

const accountSongbookRequest = async (token: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  const data = await response.json().catch(() => ({})) as { message?: string; songbooks?: SyncedSongbook[]; songbook?: SyncedSongbook };
  if (!response.ok) throw new Error(data.message ?? `Songbook sync failed (${response.status}).`);
  return data;
};

const accountToken = async () => window.faithstreamWindow?.getAuthToken() ?? null;

const localSongbookPayload = (book: Songbook, songs: Song[]): SyncedSongbook => {
  const sharedSongs = songs.filter((song) => song.bookId === book.id && !song.deviceOnly).map(({ edited: _edited, deviceOnly: _deviceOnly, ...song }) => song);
  const updatedAt = Math.max(book.updatedAt ?? book.createdAt, ...sharedSongs.map((song) => song.updatedAt));
  return { id: book.id, name: book.name, createdAt: book.createdAt, updatedAt, songs: sharedSongs };
};

const storeSyncedSongbookLocally = async (remote: SyncedSongbook, currentBooks?: Songbook[], currentSongs?: Song[]) => {
  if (remote.deleted) { await removeSyncedSongbookLocally(remote.id); return; }
  const books = currentBooks ?? await readAll<Songbook>(BOOKS);
  const songs = currentSongs ?? await readAll<Song>(SONGS);
  const local = books.find((book) => book.id === remote.id);
  if (local?.deviceOnly) return;
  const keptDeviceSongs = songs.filter((song) => song.bookId === remote.id && song.deviceOnly);
  const sharedSongs = remote.songs.map((song) => ({ ...song, bookId: remote.id, deviceOnly: false }));
  const nextBook: Songbook = { id: remote.id, name: remote.name, kind: 'personal', createdAt: remote.createdAt, updatedAt: remote.updatedAt };
  await write([
    { store: BOOKS, put: [nextBook] },
    { store: SONGS, put: [...sharedSongs, ...keptDeviceSongs], remove: songs.filter((song) => song.bookId === remote.id && !song.deviceOnly && !sharedSongs.some((shared) => shared.id === song.id)).map((song) => song.id) },
  ]);
};

const removeSyncedSongbookLocally = async (bookId: string) => {
  const [books, songs] = await Promise.all([readAll<Songbook>(BOOKS), readAll<Song>(SONGS)]);
  const book = books.find((item) => item.id === bookId);
  if (book?.deviceOnly) return;
  const localSongs = songs.filter((song) => song.bookId === bookId && song.deviceOnly);
  await write([
    { store: BOOKS, ...(localSongs.length && book ? { put: [{ ...book, deviceOnly: true }] } : { remove: [bookId] }) },
    { store: SONGS, remove: songs.filter((song) => song.bookId === bookId && !song.deviceOnly).map((song) => song.id) },
  ]);
};

const syncOneSongbook = async (bookId: string) => {
  try {
    const token = await accountToken();
    if (!token) return;
    const [books, songs] = await Promise.all([readAll<Songbook>(BOOKS), readAll<Song>(SONGS)]);
    const book = books.find((item) => item.id === bookId);
    if (!book || book.deviceOnly || book.kind !== 'personal') return;
    const payload = localSongbookPayload(book, songs);
    const result = await accountSongbookRequest(token, `/songbooks/${encodeURIComponent(book.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (result.songbook?.deleted) await removeSyncedSongbookLocally(book.id);
    else if (result.songbook && result.songbook.updatedAt > payload.updatedAt) await storeSyncedSongbookLocally(result.songbook, books, songs);
  } catch { /* Keep the library usable offline; it will be reconciled on the next signed-in sync. */ }
};

export const synchronizeAccountSongbooks = async () => {
  const token = await accountToken();
  if (!token) return;
  const flight = accountSyncFlights.get(token);
  if (flight) return flight;
  const sync = (async () => {
    const deletedIds = deletedSongbookIds();
    for (const id of deletedIds) {
      await accountSongbookRequest(token, `/songbooks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      saveDeletedSongbookIds(deletedSongbookIds().filter((savedId) => savedId !== id));
    }
    const data = await accountSongbookRequest(token, '/songbooks');
    const remoteBooks = data.songbooks ?? [];
    const [books, songs] = await Promise.all([readAll<Songbook>(BOOKS), readAll<Song>(SONGS)]);
    const remoteById = new Map(remoteBooks.map((book) => [book.id, book]));
    const received: SyncedSongbook[] = [];
    for (const remote of remoteBooks) {
      const local = books.find((book) => book.id === remote.id);
      if (local?.deviceOnly) continue;
      if (remote.deleted) { await removeSyncedSongbookLocally(remote.id); continue; }
      const localSongs = songs.filter((song) => song.bookId === remote.id && !song.deviceOnly);
      const localTime = local ? Math.max(local.updatedAt ?? local.createdAt, ...localSongs.map((song) => song.updatedAt)) : -1;
      if (local && localTime > remote.updatedAt) {
        const result = await accountSongbookRequest(token, `/songbooks/${encodeURIComponent(local.id)}`, { method: 'PUT', body: JSON.stringify(localSongbookPayload(local, songs)) });
        if (result.songbook) received.push(result.songbook);
      } else received.push(remote);
    }
    for (const local of books.filter((book) => book.kind === 'personal' && !book.deviceOnly && !remoteById.has(book.id))) {
      const result = await accountSongbookRequest(token, `/songbooks/${encodeURIComponent(local.id)}`, { method: 'PUT', body: JSON.stringify(localSongbookPayload(local, songs)) });
      if (result.songbook) received.push(result.songbook);
    }
    for (const remote of received) await storeSyncedSongbookLocally(remote, books, songs);
  })();
  accountSyncFlights.set(token, sync);
  try { await sync; } finally { accountSyncFlights.delete(token); }
};

const now = () => Date.now();
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const isStandardBook = (bookId: string) => STANDARD_SONGBOOKS.some((book) => book.id === bookId);

/** Loads every songbook and song (standard + personal), with local corrections applied. */
export const loadLibrary = async (): Promise<{ books: Songbook[]; songs: Song[] }> => {
  const [personalBooks, personalSongs, overrides] = await Promise.all([
    readAll<Songbook>(BOOKS), readAll<Song>(SONGS), readAll<SongOverride>(OVERRIDES),
  ]);
  const overrideById = new Map(overrides.map((item) => [item.id, item]));
  const standardBooks: Songbook[] = STANDARD_SONGBOOKS.map((book) => ({ id: book.id, name: book.name, kind: 'standard', createdAt: 0 }));
  const standardSongs: Song[] = STANDARD_SONGBOOKS.flatMap((book) => book.songs.map((song) => {
    const base: Song = { ...song, bookId: book.id, createdAt: 0, updatedAt: 0 };
    const override = overrideById.get(song.id);
    return override ? { ...base, ...override, bookId: book.id, edited: true } : base;
  }));
  return {
    books: [...standardBooks, ...personalBooks.map((book) => ({ ...book, kind: 'personal' as const })).sort((a, b) => a.name.localeCompare(b.name))],
    songs: [...standardSongs, ...personalSongs],
  };
};

export const createSongbook = async (name: string, options: { deviceOnly?: boolean } = {}): Promise<Songbook> => {
  const createdAt = now();
  const book: Songbook = { id: newId('book'), name: cleanName(name) || 'My songs', kind: 'personal', createdAt, updatedAt: createdAt, ...(options.deviceOnly ? { deviceOnly: true } : {}) };
  await write([{ store: BOOKS, put: [book] }]);
  if (!book.deviceOnly) void syncOneSongbook(book.id);
  return book;
};

export const renameSongbook = async (book: Songbook, name: string) => {
  if (book.kind !== 'personal') throw new Error('Standard songbooks cannot be renamed.');
  const updated = { ...book, name: cleanName(name) || book.name, updatedAt: now() };
  await write([{ store: BOOKS, put: [updated] }]);
  if (!updated.deviceOnly) void syncOneSongbook(updated.id);
};

export const deleteSongbook = async (book: Songbook, songs: Song[]) => {
  if (book.kind !== 'personal') throw new Error('Standard songbooks cannot be deleted.');
  await write([{ store: SONGS, remove: songs.filter((song) => song.bookId === book.id).map((song) => song.id) }, { store: BOOKS, remove: [book.id] }]);
  if (!book.deviceOnly) {
    saveDeletedSongbookIds([...deletedSongbookIds(), book.id]);
    try {
      const token = await accountToken();
      if (token) {
        await accountSongbookRequest(token, `/songbooks/${encodeURIComponent(book.id)}`, { method: 'DELETE' });
        saveDeletedSongbookIds(deletedSongbookIds().filter((id) => id !== book.id));
      }
    } catch { /* The tombstone removes it from the account on the next successful sync. */ }
  }
};

/** Saves a song. Standard songs are saved as a correction, leaving the original untouched. */
export const saveSong = async (song: Song): Promise<Song> => {
  const clean: Song = { ...song, title: cleanName(song.title) || 'Untitled song', lyrics: normalizeLyrics(song.lyrics), updatedAt: now() };
  if (isStandardBook(clean.bookId)) {
    const override: SongOverride = { id: clean.id, title: clean.title, author: clean.author, copyright: clean.copyright, lyrics: clean.lyrics, updatedAt: clean.updatedAt, style: clean.style };
    await write([{ store: OVERRIDES, put: [override] }]);
    clean.edited = true;
  } else {
    const { edited: _edited, ...stored } = clean;
    await write([{ store: SONGS, put: [stored] }]);
    if (!clean.deviceOnly) void syncOneSongbook(clean.bookId);
  }
  window.dispatchEvent(new CustomEvent(SONG_SAVED_EVENT, { detail: clean }));
  return clean;
};

export const restoreStandardSong = async (songId: string) => {
  await write([{ store: OVERRIDES, remove: [songId] }]);
  const original = STANDARD_SONGBOOKS.flatMap((book) => book.songs.map((song) => ({ ...song, bookId: book.id, createdAt: 0, updatedAt: 0 }))).find((song) => song.id === songId);
  if (original) window.dispatchEvent(new CustomEvent(SONG_SAVED_EVENT, { detail: original }));
};

export const deleteSongs = async (ids: string[]) => {
  const personal = ids.filter((id) => !STANDARD_SONGBOOKS.some((book) => book.songs.some((song) => song.id === id)));
  if (personal.length) {
    const [songs, books] = await Promise.all([readAll<Song>(SONGS), readAll<Songbook>(BOOKS)]);
    const syncableBooks = [...new Set(songs.filter((song) => personal.includes(song.id) && !song.deviceOnly).map((song) => song.bookId))];
    const touchedBooks = books.filter((book) => syncableBooks.includes(book.id)).map((book) => ({ ...book, updatedAt: now() }));
    await write([{ store: SONGS, remove: personal }, { store: BOOKS, put: touchedBooks }]);
    syncableBooks.forEach((bookId) => { void syncOneSongbook(bookId); });
  }
};

export const copySongsTo = async (songs: Song[], bookId: string) => {
  if (isStandardBook(bookId)) throw new Error('Songs can only be added to your own songbooks.');
  const books = await readAll<Songbook>(BOOKS);
  const targetIsDeviceOnly = books.find((book) => book.id === bookId)?.deviceOnly ?? false;
  const copies = songs.map((song) => ({ ...song, id: newId('song'), bookId, createdAt: now(), updatedAt: now(), edited: undefined, ...(targetIsDeviceOnly || song.deviceOnly ? { deviceOnly: true } : { deviceOnly: undefined }) }));
  await write([{ store: SONGS, put: copies.map(({ edited: _edited, ...stored }) => stored) }]);
  if (!targetIsDeviceOnly && copies.some((song) => !song.deviceOnly)) void syncOneSongbook(bookId);
  return copies.length;
};

/* ---------- Lyrics helpers ---------- */

const cleanName = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 160);
export const normalizeLyrics = (value: string) => value.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();

export const firstLine = (song: Song) => song.lyrics.split('\n').map((line) => line.trim()).find((line) => line && !/^\s*[[(]?\s*(verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|coda)\b/i.test(line)) ?? '';

/** Lower-case text with accents removed, so "Diyos" also finds "Diyós". */
export const foldText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();

/** Search by number, title, first line, author or any words in the lyrics. Best matches first. */
export const searchSongs = (songs: Song[], query: string) => {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return songs;
  const scored: { song: Song; score: number }[] = [];
  for (const song of songs) {
    const title = foldText(song.title);
    const haystack = `${song.number ?? ''} ${title} ${foldText(song.author ?? '')} ${foldText(song.lyrics)}`;
    if (!terms.every((term) => haystack.includes(term))) continue;
    let score = 0;
    if (song.number && terms.length === 1 && song.number.toLowerCase() === terms[0]) score += 100;
    if (title.startsWith(terms.join(' '))) score += 50;
    if (terms.every((term) => title.includes(term))) score += 20;
    scored.push({ song, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((item) => item.song);
};

export const compareSongs = (a: Song, b: Song) => {
  const an = Number.parseInt(a.number ?? '', 10);
  const bn = Number.parseInt(b.number ?? '', 10);
  if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
  if (Number.isFinite(an) !== Number.isFinite(bn)) return Number.isFinite(an) ? -1 : 1;
  return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
};

/* ---------- Import ---------- */

type ImportedSong = { title: string; number?: string; author?: string; copyright?: string; lyrics: string; style?: unknown };

const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').replace(/^\d+\s*[-_. ]\s*/, '').replace(/[_]+/g, ' ').trim() || 'Untitled song';
const leadingNumber = (name: string) => /^(\d{1,5})\s*[-_. ]/.exec(name)?.[1]?.replace(/^0+(?=\d)/, '');

/** Plain text: the file name is the title (a leading "123 - " becomes the song number). */
export const parsePlainText = (name: string, text: string): ImportedSong => {
  let body = normalizeLyrics(text);
  let title = fileTitle(name);
  const match = /^title\s*:\s*(.+)\n/i.exec(body);
  if (match) { title = match[1].trim(); body = body.slice(match[0].length).trim(); }
  return { title, number: leadingNumber(name), lyrics: body };
};

/** ChordPro (.cho, .chordpro, .chopro, .pro, .crd): chords are removed, directives become titles and part names. */
export const parseChordPro = (name: string, text: string): ImportedSong => {
  const song: ImportedSong = { title: fileTitle(name), number: leadingNumber(name), lyrics: '' };
  const out: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const directive = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(line);
    if (directive) {
      const key = directive[1].toLowerCase();
      const value = directive[2]?.trim() ?? '';
      if (key === 'title' || key === 't') song.title = value || song.title;
      else if (key === 'artist' || key === 'composer' || key === 'lyricist' || key === 'subtitle' || key === 'st') song.author = song.author ?? value;
      else if (key === 'copyright') song.copyright = value;
      else if (['start_of_chorus', 'soc'].includes(key)) out.push('', value || 'Chorus');
      else if (['start_of_verse', 'sov'].includes(key)) out.push('', value || 'Verse');
      else if (['start_of_bridge', 'sob'].includes(key)) out.push('', value || 'Bridge');
      else if (['comment', 'c', 'comment_italic', 'ci', 'comment_box', 'cb'].includes(key) && value) out.push('', value);
      else if (key.startsWith('end_of') || key.startsWith('eo')) out.push('');
      continue;
    }
    const lyric = line.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
    out.push(lyric);
  }
  song.lyrics = normalizeLyrics(out.join('\n'));
  return song;
};

const OPENLYRICS_PARTS: Record<string, string> = { v: 'Verse', c: 'Chorus', b: 'Bridge', p: 'Pre-chorus', e: 'Ending', i: 'Intro', o: 'Outro' };

/** OpenLyrics XML (used by OpenLP, Quelea and others). One file can hold one song. */
export const parseOpenLyrics = (name: string, xml: string): ImportedSong => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('not a valid OpenLyrics file');
  const first = (tag: string) => doc.getElementsByTagNameNS('*', tag)[0] ?? doc.getElementsByTagName(tag)[0];
  const all = (tag: string) => Array.from(doc.getElementsByTagNameNS('*', tag).length ? doc.getElementsByTagNameNS('*', tag) : doc.getElementsByTagName(tag));
  const title = first('title')?.textContent?.trim() || fileTitle(name);
  const author = all('author').map((item) => item.textContent?.trim()).filter(Boolean).join(', ') || undefined;
  const copyright = first('copyright')?.textContent?.trim() || undefined;
  const songbook = first('songbook');
  const number = songbook?.getAttribute('entry') || leadingNumber(name);
  const verses = all('verse');
  const parts: string[] = [];
  for (const verse of verses) {
    const id = verse.getAttribute('name') ?? '';
    const match = /^([a-z]+)(\d*)([a-z]?)$/i.exec(id);
    const label = match ? `${OPENLYRICS_PARTS[match[1].toLowerCase()] ?? match[1]}${match[2] ? ` ${match[2]}` : ''}` : id;
    const lines = Array.from(verse.getElementsByTagNameNS('*', 'lines').length ? verse.getElementsByTagNameNS('*', 'lines') : verse.getElementsByTagName('lines'));
    const text = lines.map((element) => {
      const clone = element.cloneNode(true) as Element;
      clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
      clone.querySelectorAll('comment').forEach((comment) => comment.remove());
      return (clone.textContent ?? '').split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).join('\n');
    }).join('\n');
    if (text.trim()) parts.push(`${label}\n${text.trim()}`);
  }
  return { title, author, copyright, number: number ?? undefined, lyrics: normalizeLyrics(parts.join('\n\n')) };
};

const FAITHSTREAM_FORMAT = 'faithstream-songbook';
const BACKUP_FORMAT = 'faithstream-backup';

export type ImportReport = { added: number; skipped: string[]; booksCreated: string[] };

/**
 * Imports song files into a personal songbook. FaithStream Studio songbook files keep their own
 * book names (a new personal book is created for each). Standard songbooks are never touched.
 */
export const importSongFiles = async (files: File[], targetBookId: string, existing: Song[]): Promise<ImportReport> => {
  if (isStandardBook(targetBookId)) throw new Error('Choose one of your own songbooks to import into.');
  const report: ImportReport = { added: 0, skipped: [], booksCreated: [] };
  const toSave: Song[] = [];
  const known = new Set(existing.filter((song) => song.bookId === targetBookId).map((song) => `${foldText(song.title)}|${foldText(firstLine(song))}`));
  const queue = (bookId: string, item: ImportedSong) => {
    if (!item.lyrics.trim()) return false;
    const key = `${foldText(item.title)}|${foldText(item.lyrics.split('\n').find((line) => line.trim()) ?? '')}`;
    if (bookId === targetBookId && known.has(key)) return false;
    known.add(key);
    toSave.push({ id: newId('song'), bookId, title: cleanName(item.title) || 'Untitled song', number: item.number?.trim() || undefined, author: item.author?.trim() || undefined, copyright: item.copyright?.trim() || undefined, lyrics: normalizeLyrics(item.lyrics), createdAt: now(), updatedAt: now(), deviceOnly: true, ...(item.style ? { style: cleanSongStyle(item.style) } : {}) });
    return true;
  };
  for (const file of files) {
    const lower = file.name.toLowerCase();
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('file is too large');
      const text = await file.text();
      if (lower.endsWith('.fssongbook') || lower.endsWith('.json')) {
        const data = JSON.parse(text) as { format?: string; books?: { id: string; name: string }[]; songs?: (ImportedSong & { bookId?: string })[] };
        if (data.format !== FAITHSTREAM_FORMAT || !Array.isArray(data.songs)) throw new Error('not a FaithStream Studio songbook file');
        const bookIds = new Map<string, string>();
        for (const book of (data.books ?? []).filter((item) => typeof item?.id === 'string' && typeof item.name === 'string')) {
          const created = await createSongbook(book.name, { deviceOnly: true });
          bookIds.set(book.id, created.id);
          report.booksCreated.push(created.name);
        }
        for (const song of data.songs) {
          if (typeof song?.title !== 'string' || typeof song?.lyrics !== 'string') continue;
          if (queue(bookIds.get(song.bookId ?? '') ?? targetBookId, song)) report.added += 1;
        }
        continue;
      }
      let item: ImportedSong;
      if (/\.(cho|chordpro|chopro|crd|pro)$/.test(lower)) item = parseChordPro(file.name, text);
      else if (lower.endsWith('.xml')) item = parseOpenLyrics(file.name, text);
      else if (lower.endsWith('.txt') || file.type.startsWith('text/')) item = parsePlainText(file.name, text);
      else throw new Error('unsupported file type');
      if (queue(targetBookId, item)) report.added += 1;
      else report.skipped.push(`${file.name} (already in this songbook or empty)`);
    } catch (error) {
      report.skipped.push(`${file.name} (${error instanceof Error ? error.message : 'could not be read'})`);
    }
  }
  if (toSave.length) await write([{ store: SONGS, put: toSave }]);
  return report;
};

export const SONG_FILE_ACCEPT = '.txt,.cho,.chordpro,.chopro,.crd,.pro,.xml,.fssongbook,.json,text/plain';

/** A FaithStream Studio songbook file for sharing a book with another computer (USB, email…). */
export const exportSongbooks = (books: Songbook[], songs: Song[]) => JSON.stringify({
  format: FAITHSTREAM_FORMAT,
  version: 1,
  exportedAt: new Date().toISOString(),
  books: books.map((book) => ({ id: book.id, name: book.name })),
  songs: songs.filter((song) => books.some((book) => book.id === song.bookId)).map((song) => ({
    bookId: song.bookId, number: song.number, title: song.title, author: song.author, copyright: song.copyright, lyrics: song.lyrics, style: song.style,
  })),
}, null, 1);

/* ---------- Backup & restore ---------- */

// Never put sign-in details or temporary state into a backup file. Presentations and Studio
// scenes are left out too: they sync through the account, and restoring an old copy would
// replace newer work (their pictures are not in the backup either).
const EXCLUDED_SETTINGS = /^faithstream\.(api-token|user-profile|studio-session|presentations?|studio-scenes|studio-slideshow-scenes|studio-output-ref|studio-stream-output-ref|studio-display-mode)(:|$)/;
const ACCOUNT_SUFFIX = /:account:.*$/;

export const createBackup = async () => {
  const [books, songs, overrides] = await Promise.all([readAll<Songbook>(BOOKS), readAll<Song>(SONGS), readAll<SongOverride>(OVERRIDES)]);
  const currentSuffix = getAccountStorageKey('');
  const settings: Record<string, string> = {};
  const accountSettings: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith('faithstream.') || EXCLUDED_SETTINGS.test(key)) continue;
    const value = localStorage.getItem(key) ?? '';
    if (!ACCOUNT_SUFFIX.test(key)) settings[key] = value;
    // Keep only this account's copy of per-account settings, stored without the account name.
    else if (key.endsWith(currentSuffix)) accountSettings[key.slice(0, -currentSuffix.length)] = value;
  }
  return JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), songbooks: { books, songs, overrides }, settings, accountSettings });
};

/** Restores songbooks (merged with what is here) and settings. Returns counts for the summary. */
export const restoreBackup = async (text: string) => {
  const data = JSON.parse(text) as { format?: string; songbooks?: { books?: Songbook[]; songs?: Song[]; overrides?: SongOverride[] }; settings?: Record<string, string>; accountSettings?: Record<string, string> };
  if (data.format !== BACKUP_FORMAT) throw new Error('This is not a FaithStream Studio backup file.');
  const books = (data.songbooks?.books ?? []).filter((book) => typeof book?.id === 'string' && typeof book.name === 'string' && !isStandardBook(book.id)).map((book) => ({ ...book, kind: 'personal' as const, deviceOnly: true }));
  const songs = (data.songbooks?.songs ?? []).filter((song) => typeof song?.id === 'string' && typeof song.lyrics === 'string' && !isStandardBook(song.bookId)).map((song) => ({ ...song, deviceOnly: true }));
  const overrides = (data.songbooks?.overrides ?? []).filter((item) => typeof item?.id === 'string' && typeof item.lyrics === 'string');
  await write([{ store: BOOKS, put: books }, { store: SONGS, put: songs }, { store: OVERRIDES, put: overrides }]);
  let settingsRestored = 0;
  const restore = (entries: Record<string, string> | undefined, toKey: (key: string) => string) => {
    for (const [key, value] of Object.entries(entries ?? {})) {
      if (typeof value !== 'string' || !key.startsWith('faithstream.') || ACCOUNT_SUFFIX.test(key) || EXCLUDED_SETTINGS.test(key)) continue;
      try { localStorage.setItem(toKey(key), value); settingsRestored += 1; } catch { /* storage full: skip */ }
    }
  };
  restore(data.settings, (key) => key);
  // Per-account settings were saved without the account name; give them this account's name.
  restore(data.accountSettings, (key) => getAccountStorageKey(key));
  return { books: books.length, songs: songs.length, corrections: overrides.length, settings: settingsRestored };
};

export const backupFileName = () => `FaithStream Studio backup ${new Date().toISOString().slice(0, 10)}.fsbackup`;

/** Opens the system Save dialog (desktop app) or falls back to a browser download. */
export const saveTextFile = async (suggestedName: string, content: string, kind: 'backup' | 'songbook'): Promise<{ ok: boolean; canceled?: boolean; filePath?: string; message?: string }> => {
  const bridge = window.faithstreamWindow;
  if (bridge?.saveTextFile) return bridge.saveTextFile(suggestedName, content, kind);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { ok: true };
};

/* ---------- Projection ---------- */

/**
 * How song slides look: a small presentation design applied to every slide of a song.
 * A song can have its own style; otherwise it uses the default song style kept on this computer.
 */
export type SongTextAlign = 'left' | 'center' | 'right' | 'justify';
export type SongLineAligns = (SongTextAlign | null)[];
/** The key a slide's own line alignments are saved under: its text, so they reset when the text changes. */
export const songLineKey = (text: string) => text.replace(/\s+$/, '');
const MAX_LINE_ALIGN_SLIDES = 300;
const cleanLineAligns = (value: unknown): Record<string, SongLineAligns> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, aligns]) => key.length > 0 && key.length < 5000 && Array.isArray(aligns) && aligns.length < 200)
    .map(([key, aligns]) => [key, (aligns as unknown[]).map((align) => (align === 'left' || align === 'center' || align === 'right' || align === 'justify' ? align : null))] as const)
    .filter(([, aligns]) => aligns.some(Boolean))
    .slice(-MAX_LINE_ALIGN_SLIDES);
  return entries.length ? Object.fromEntries(entries) : undefined;
};
/** Sets (or clears) one slide's line alignments. */
export const withSlideLineAligns = (all: Record<string, SongLineAligns> | undefined, slideText: string, aligns: SongLineAligns | undefined) => {
  const next = { ...(all ?? {}) };
  const key = songLineKey(slideText);
  delete next[key];
  if (aligns?.some(Boolean)) next[key] = aligns;
  const keys = Object.keys(next);
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_LINE_ALIGN_SLIDES))) delete next[old];
  return Object.keys(next).length ? next : undefined;
};
export type SongTextVAlign = 'top' | 'middle' | 'bottom';
export type SongStyle = {
  font: string;
  /** Text size in slide units (the slide is 1280 wide). */
  fontSize: number;
  /** Shrink when a part does not fit, keeping every slide of the song the same size. */
  autoFit: boolean;
  lineHeight: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Show lyrics in capital letters. Only the display changes; the songbook keeps normal text. */
  caps: boolean;
  align: SongTextAlign;
  /** Where the lyrics sit inside the text area, top to bottom. Missing means middle (older styles). */
  valign?: SongTextVAlign;
  /** Extra space between letters, in px on a 1280-wide slide (like the Presentations editor). */
  letterSpacing?: number;
  /** A coloured box behind the lyrics (like a text box background in Presentations). */
  boxBg?: string;
  boxBgOn?: boolean;
  /** Single lines aligned differently on one slide, keyed by that slide's text (see songLineKey). */
  lineAligns?: Record<string, SongLineAligns>;
  color: string;
  shadow: boolean;
  position: 'top' | 'middle' | 'bottom';
  /** A text area placed by hand (drag / resize in Design), in % of the slide. Overrides position. */
  area?: { x: number; y: number; w: number; h: number };
  linesPerSlide: number;
  titleSlide: boolean;
  /** Colour background (gradient classes), used when there is no background picture. */
  background: string;
  /** A picture or video from the background library. */
  backgroundAssetId?: string;
  /** Darken the background, 0–80 %. */
  dim: number;
};
/** Kept for older code: the song slide settings are the default song style. */
export type SongSlideSettings = SongStyle;

export const SONG_FONTS = ['Segoe UI', 'Arial', 'Calibri', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Impact'];
export const SONG_BACKGROUNDS = [
  'from-purple-700 via-indigo-900 to-slate-950',
  'from-slate-600 to-slate-950',
  'from-sky-700 to-slate-950',
  'from-indigo-500 to-blue-950',
  'from-emerald-700 to-slate-900',
  'from-rose-500/80 to-amber-900',
  'from-orange-400/80 via-indigo-800 to-slate-900',
  'from-black to-black',
];
export const DEFAULT_SONG_STYLE: SongStyle = {
  font: 'Segoe UI', fontSize: 68, autoFit: true, lineHeight: 1.2, bold: true, italic: false, underline: false, caps: false,
  align: 'center', valign: 'middle', color: '#FFFFFF', shadow: true, position: 'middle', linesPerSlide: 4, titleSlide: true,
  background: SONG_BACKGROUNDS[0], dim: 0,
};
export const DEFAULT_SONG_SLIDE_SETTINGS = DEFAULT_SONG_STYLE;
export const SONG_SLIDE_SETTINGS_EVENT = 'faithstream:song-slide-settings';
const SONG_SLIDE_SETTINGS_KEY = 'faithstream.song-slide-settings';

const pick = <T,>(value: unknown, ok: (value: unknown) => boolean, fallback: T): T => (ok(value) ? value as T : fallback);
const isNum = (min: number, max: number) => (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isBool = (value: unknown) => typeof value === 'boolean';

const cleanArea = (value: unknown): SongStyle['area'] => {
  if (!value || typeof value !== 'object') return undefined;
  const { x, y, w, h } = value as Record<string, unknown>;
  if (![x, y, w, h].every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  const area = { x: x as number, y: y as number, w: w as number, h: h as number };
  if (area.w < 10 || area.h < 8 || area.x < 0 || area.y < 0 || area.x + area.w > 100.01 || area.y + area.h > 100.01) return undefined;
  return { x: Math.round(area.x * 10) / 10, y: Math.round(area.y * 10) / 10, w: Math.round(area.w * 10) / 10, h: Math.round(area.h * 10) / 10 };
};

/** Accepts a stored or imported style and fills anything missing or invalid with the defaults. */
export const cleanSongStyle = (value: unknown, base: SongStyle = DEFAULT_SONG_STYLE): SongStyle => {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  // Older settings stored a size word instead of a number.
  const legacySize = raw.size === 'small' ? 56 : raw.size === 'large' ? 80 : raw.size === 'medium' ? 68 : undefined;
  return {
    font: pick(raw.font, (font) => typeof font === 'string' && font.length > 0 && font.length < 60, base.font),
    fontSize: Math.round(pick(raw.fontSize ?? legacySize, isNum(24, 140), base.fontSize)),
    autoFit: pick(raw.autoFit, isBool, base.autoFit),
    lineHeight: pick(raw.lineHeight, isNum(0.8, 2.5), base.lineHeight),
    bold: pick(raw.bold, isBool, base.bold),
    italic: pick(raw.italic, isBool, base.italic),
    underline: pick(raw.underline, isBool, base.underline),
    caps: pick(raw.caps, isBool, base.caps),
    align: pick(raw.align, (align) => align === 'left' || align === 'center' || align === 'right' || align === 'justify', base.align),
    valign: pick(raw.valign, (valign) => valign === 'top' || valign === 'middle' || valign === 'bottom', base.valign ?? 'middle'),
    letterSpacing: pick(raw.letterSpacing, isNum(-4, 20), base.letterSpacing ?? 0),
    boxBg: pick(raw.boxBg, (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color), base.boxBg ?? '#000000'),
    boxBgOn: pick(raw.boxBgOn, isBool, base.boxBgOn ?? false),
    color: pick(raw.color, (color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color), base.color),
    shadow: pick(raw.shadow, isBool, base.shadow),
    position: pick(raw.position, (position) => position === 'top' || position === 'middle' || position === 'bottom', base.position),
    area: cleanArea(raw.area),
    lineAligns: cleanLineAligns(raw.lineAligns),
    linesPerSlide: Math.round(pick(raw.linesPerSlide, isNum(1, 12), base.linesPerSlide)),
    titleSlide: pick(raw.titleSlide, isBool, base.titleSlide),
    background: pick(raw.background, (bg) => typeof bg === 'string' && (SONG_BACKGROUNDS.includes(bg) || isCustomBackground(bg)), base.background),
    backgroundAssetId: pick(raw.backgroundAssetId, (id) => typeof id === 'string' && id.length > 0 && id.length < 100, undefined),
    dim: Math.round(pick(raw.dim, isNum(0, 80), base.dim)),
  };
};

/** The default song style (the "Aa" / Slide style settings). */
export const loadSongSlideSettings = (): SongStyle => {
  try {
    return cleanSongStyle(JSON.parse(localStorage.getItem(SONG_SLIDE_SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SONG_STYLE };
  }
};

export const saveSongSlideSettings = (settings: SongStyle) => {
  try { localStorage.setItem(SONG_SLIDE_SETTINGS_KEY, JSON.stringify(cleanSongStyle(settings))); } catch { /* keep for this session */ }
  window.dispatchEvent(new CustomEvent(SONG_SLIDE_SETTINGS_EVENT, { detail: settings }));
};

/** The style a song is shown with: its own design, or the default song style. */
export const songStyleFor = (song: Pick<Song, 'style'>): SongStyle => (song.style ? cleanSongStyle(song.style) : loadSongSlideSettings());

export const SONG_TITLE_LABEL = 'Title';
export type SongScreen = { label?: string; text: string; kind: 'title' | 'lyrics'; subtitle?: string };

/** A song's screens: an optional title slide, then each part, with long parts split evenly. */
export const songScreens = (song: Pick<Song, 'lyrics' | 'title' | 'author' | 'copyright' | 'style'>, style: SongStyle = songStyleFor(song)): SongScreen[] => {
  const parts: SongScreen[] = splitLyrics(song.lyrics, style.linesPerSlide).map((part) => ({ label: part.label, text: part.text, kind: 'lyrics' }));
  if (!style.titleSlide || !song.title?.trim()) return parts;
  const subtitle = [song.author, song.copyright].map((item) => item?.trim()).filter(Boolean).join(' · ') || undefined;
  return [{ label: SONG_TITLE_LABEL, text: song.title.trim(), subtitle, kind: 'title' }, ...parts];
};

/** Where the lyrics sit on the slide, in % of the slide. */
export const SONG_TEXT_AREAS: Record<SongStyle['position'], { x: number; y: number; w: number; h: number }> = {
  top: { x: 6, y: 6, w: 88, h: 56 },
  middle: { x: 6, y: 8, w: 88, h: 84 },
  bottom: { x: 6, y: 38, w: 88, h: 56 },
};

/** The lyrics area: placed by hand, or from the Top / Middle / Bottom preset. */
export const songTextArea = (style: SongStyle) => style.area ?? SONG_TEXT_AREAS[style.position];

/**
 * One text size for every lyric slide of a song, so a short chorus does not look bigger than a
 * long verse. With "shrink to fit", the size is the largest (up to the chosen size) that lets
 * every part fit, allowing long lines to wrap. Sizes are in slide units (1280 wide).
 */
export const songTextSize = (screens: SongScreen[], style: SongStyle) => {
  if (!style.autoFit) return style.fontSize;
  const lyrics = screens.filter((screen) => screen.kind === 'lyrics');
  const area = songTextArea(style);
  const charWidth = (style.caps ? 0.68 : 0.56) * (style.bold ? 1 : 0.94);
  const width = 1280 * (area.w / 100) * 0.96;
  const height = 720 * (area.h / 100) * 0.95;
  for (let size = style.fontSize; size > 24; size -= 2) {
    const fits = lyrics.every((screen) => {
      const rows = screen.text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil((line.length * charWidth * size) / width)), 0);
      return rows * style.lineHeight * size <= height;
    });
    if (fits) return size;
  }
  return 24;
};

export type SongTextLayout = {
  text: string; font: string; size: number; lineHeight: number; bold: boolean; italic: boolean; underline: boolean;
  uppercase: boolean; align: SongTextAlign; valign: SongTextVAlign; lineAligns?: SongLineAligns; letterSpacing: number; boxBg: string; boxBgOn: boolean; color: string; shadow: boolean; x: number; y: number; w: number; h: number;
};
export type SongSlideLayout = {
  kind: SongScreen['kind'];
  label?: string;
  text: string;
  box: SongTextLayout;
  subtitleBox?: SongTextLayout;
  background: string;
  backgroundAssetId?: string;
  dim: number;
};

/** Turns a song and its style into slide layouts. Studio, the song editor preview and "Make a presentation" all use this. */
export const songSlideLayouts = (song: Pick<Song, 'lyrics' | 'title' | 'author' | 'copyright' | 'style'>, style: SongStyle = songStyleFor(song)): SongSlideLayout[] => {
  const screens = songScreens(song, style);
  const size = songTextSize(screens, style);
  const text = (value: string, boxSize: number, area: { x: number; y: number; w: number; h: number }): SongTextLayout => ({
    text: value, font: style.font, size: boxSize, lineHeight: style.lineHeight, bold: style.bold, italic: style.italic, underline: style.underline,
    uppercase: style.caps, align: style.align, valign: style.valign ?? 'middle', letterSpacing: style.letterSpacing ?? 0, boxBg: style.boxBg ?? '#000000', boxBgOn: style.boxBgOn ?? false,
    color: style.color, shadow: style.shadow, ...area,
  });
  return screens.map((screen) => {
    const common = { kind: screen.kind, label: screen.label, text: screen.text, background: style.background, backgroundAssetId: style.backgroundAssetId, dim: style.dim };
    if (screen.kind === 'title') {
      const titleSize = Math.min(112, Math.max(72, Math.round(size * 1.5)));
      return {
        ...common,
        box: { ...text(screen.text, titleSize, { x: 6, y: screen.subtitle ? 18 : 8, w: 88, h: screen.subtitle ? 52 : 84 }), align: 'center', valign: 'middle' },
        subtitleBox: screen.subtitle ? { ...text(screen.subtitle, 30, { x: 6, y: 72, w: 88, h: 12 }), bold: false, italic: false, underline: false, uppercase: false, align: 'center', valign: 'middle' } : undefined,
      };
    }
    return { ...common, box: { ...text(screen.text, size, songTextArea(style)), lineAligns: style.lineAligns?.[songLineKey(screen.text)] } };
  });
};

/* ---------- Connections to Studio and Presentations ---------- */

/** Ask Studio (always running in the background) to show a song. Detail: { song, screenIndex }. */
export const SHOW_SONG_EVENT = 'faithstream:show-song';
export const showSongInStudio = (song: Song, screenIndex = 0) => {
  window.dispatchEvent(new CustomEvent(SHOW_SONG_EVENT, { detail: { song, screenIndex } }));
};

/** Where the songbook library lives (a tab of the Presentations page). */
export const SONGBOOKS_PATH = '/presentations?view=songbooks';

const PART_SUFFIX = /\s*\(\d+\/\d+\)$/;

/**
 * Rebuilds a song's lyrics from its screens as edited in Studio. Screens that were split from
 * one part ("Verse 1 (1/2)", "Verse 1 (2/2)") are joined back into that part.
 */
export const lyricsFromScreens = (screens: { label?: string; text: string; kind?: SongScreen['kind'] }[]) => {
  const parts: { label?: string; lines: string[] }[] = [];
  for (const screen of screens) {
    // The title slide is not part of the lyrics.
    if (screen.kind === 'title' || screen.label === SONG_TITLE_LABEL) continue;
    const label = screen.label?.replace(PART_SUFFIX, '').trim();
    const named = label && !/^Part \d+$/.test(label) ? label : undefined;
    const previous = parts[parts.length - 1];
    const continues = !!screen.label && PART_SUFFIX.test(screen.label) && !/\(1\/\d+\)$/.test(screen.label) && previous?.label === named;
    if (continues) previous.lines.push(screen.text.trim());
    else parts.push({ label: named, lines: [screen.text.trim()] });
  }
  return normalizeLyrics(parts.map((part) => `${part.label ? `${part.label}\n` : ''}${part.lines.join('\n')}`).join('\n\n'));
};

/** Saves words corrected on a Studio slide back into the song, so the songbook stays in step. */
export const updateSongFromScreens = async (songId: string, screens: { label?: string; text: string; kind?: SongScreen['kind'] }[]) => {
  const { songs } = await loadLibrary();
  const song = songs.find((item) => item.id === songId);
  if (!song) return null;
  const lyrics = lyricsFromScreens(screens);
  if (!lyrics || lyrics === normalizeLyrics(song.lyrics)) return song;
  return saveSong({ ...song, lyrics });
};
