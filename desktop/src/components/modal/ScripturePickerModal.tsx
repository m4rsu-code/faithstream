import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Search, X } from 'lucide-react';
import BodyPortal from '../BodyPortal';

type Verse = { reference: string; text: string };
export type SelectedScriptureVerse = Verse;
type BibleData = {
  books: {
    englishName: string;
    chapters: { chapter: number; verses: { number: number; text: string }[] }[];
  }[];
};
type BibleBook = { name: string; testament: 'old' | 'new'; chapters: { number: number; verses: Verse[] }[] };
const NEW_TESTAMENT_BOOKS = new Set(['Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation']);

const selectionReference = (selected: Verse[]) => {
  if (!selected.length) return '';
  const first = selected[0].reference;
  const last = selected[selected.length - 1].reference;
  if (first === last) return first;
  const startChapter = first.replace(/:\d+$/, '');
  const endChapter = last.replace(/:\d+$/, '');
  if (startChapter === endChapter) {
    const verseNumbers = selected.map((verse) => Number(verse.reference.split(':').at(-1)));
    const isContinuous = verseNumbers.every((number, index) => index === 0 || number === verseNumbers[index - 1] + 1);
    return isContinuous ? `${first}–${last.split(':')[1]}` : selected.map((verse) => verse.reference).join(', ');
  }
  return selected.map((verse) => verse.reference).join(', ');
};

type BibleLanguage = 'en' | 'ceb';
/** A Bible ready to browse: every verse, grouped by book and chapter, with a quick position lookup. */
type BibleIndex = { verses: Verse[]; catalog: BibleBook[]; position: Map<string, number> };

const buildBibleIndex = (verses: Verse[]): BibleIndex => {
  const books = new Map<string, Map<number, Verse[]>>();
  const position = new Map<string, number>();
  verses.forEach((verse, index) => {
    position.set(verse.reference, index);
    const match = /^(.*)\s+(\d+):(\d+)$/.exec(verse.reference);
    if (!match) return;
    const [, name, chapter, verseNumber] = match;
    const chapters = books.get(name) ?? new Map<number, Verse[]>();
    const chapterVerses = chapters.get(Number(chapter)) ?? [];
    chapterVerses[Number(verseNumber) - 1] = verse;
    chapters.set(Number(chapter), chapterVerses);
    books.set(name, chapters);
  });
  const catalog: BibleBook[] = [...books.entries()].map(([name, chapters]) => ({
    name,
    testament: NEW_TESTAMENT_BOOKS.has(name) ? 'new' : 'old',
    chapters: [...chapters.entries()].sort(([a], [b]) => a - b).map(([number, chapterVerses]) => ({ number, verses: chapterVerses.filter((verse): verse is Verse => !!verse) })),
  }));
  return { verses, catalog, position };
};

// Each Bible is read and organised once, then kept in memory, so the window opens instantly
// every time after the first.
const loadingBibles = new Map<BibleLanguage, Promise<BibleIndex>>();
const readyBibles = new Map<BibleLanguage, BibleIndex>();

const loadBible = (language: BibleLanguage) => {
  let pending = loadingBibles.get(language);
  if (!pending) {
    pending = (language === 'en'
      ? import('../../data/kjv.json').then(({ default: bible }) => (bible as BibleData).books.flatMap((book) => book.chapters.flatMap((chapter) =>
        chapter.verses.map((verse) => ({ reference: `${book.englishName} ${chapter.chapter}:${verse.number}`, text: verse.text })))))
      : import('../../data/ceb.json').then(({ default: data }) => data as Verse[]))
      .then((verses) => {
        const index = buildBibleIndex(verses);
        readyBibles.set(language, index);
        return index;
      });
    pending.catch(() => loadingBibles.delete(language));
    loadingBibles.set(language, pending);
  }
  return pending;
};

/** Start preparing a Bible in the background (e.g. when the pointer reaches the Bible button). */
export const preloadBible = (language: BibleLanguage = 'en') => { void loadBible(language).catch(() => undefined); };

const NO_VERSES: Verse[] = [];
const NO_BOOKS: BibleBook[] = [];
const NO_POSITIONS = new Map<string, number>();

export default function ScripturePickerModal({
  open,
  onClose,
  onAdd,
  onPresent,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (reference: string, text: string, verses?: SelectedScriptureVerse[]) => void;
  onPresent?: (reference: string, text: string, verses?: SelectedScriptureVerse[]) => void;
}) {
  const [language, setLanguage] = useState<BibleLanguage>('en');
  const [bible, setBible] = useState<BibleIndex | null>(() => readyBibles.get('en') ?? null);
  const verses = bible?.verses ?? NO_VERSES;
  const position = bible?.position ?? NO_POSITIONS;
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  // Search runs just after typing, so the search box never stutters.
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<Verse[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [hoveredVerseReference, setHoveredVerseReference] = useState<string | null>(null);
  const [testament, setTestament] = useState<'old' | 'new'>('old');
  const [bookName, setBookName] = useState('Genesis');
  const [chapterNumber, setChapterNumber] = useState(1);

  const catalog = bible?.catalog ?? NO_BOOKS;
  const testamentBooks = useMemo(() => catalog.filter((book) => book.testament === testament), [catalog, testament]);
  const activeBook = testamentBooks.find((book) => book.name === bookName) ?? testamentBooks[0];
  const activeChapter = activeBook?.chapters.find((chapter) => chapter.number === chapterNumber) ?? activeBook?.chapters[0];

  // Uses each verse's position instead of searching the whole Bible on every mouse move.
  const selectedForAdd = useMemo(() => {
    const indexes = new Set<number>();
    for (const verse of selected) {
      const at = position.get(verse.reference);
      if (at !== undefined) indexes.add(at);
    }
    if (selectionAnchor && hoveredVerseReference) {
      const first = position.get(selectionAnchor);
      const last = position.get(hoveredVerseReference);
      if (first !== undefined && last !== undefined) {
        for (let at = Math.min(first, last); at <= Math.max(first, last); at += 1) indexes.add(at);
      }
    }
    return [...indexes].sort((a, b) => a - b).map((at) => verses[at]);
  }, [hoveredVerseReference, selected, selectionAnchor, verses, position]);

  useEffect(() => {
    if (!testamentBooks.length) return;
    if (!testamentBooks.some((book) => book.name === bookName)) {
      const firstBook = testamentBooks[0];
      setBookName(firstBook.name);
      setChapterNumber(firstBook.chapters[0]?.number ?? 1);
    }
  }, [testamentBooks, bookName]);

  const selectVerse = (verse: Verse) => {
    if (selectionAnchor) {
      const first = position.get(selectionAnchor) ?? -1;
      const last = position.get(verse.reference) ?? -1;
      if (first >= 0 && last >= 0) {
        const range = verses.slice(Math.min(first, last), Math.max(first, last) + 1);
        setSelected((current) => {
          const indexes = new Set<number>();
          for (const item of [...current, ...range]) {
            const at = position.get(item.reference);
            if (at !== undefined) indexes.add(at);
          }
          return [...indexes].sort((a, b) => a - b).map((at) => verses[at]);
        });
        setSelectionAnchor(null);
        setHoveredVerseReference(null);
        return;
      }
    }
    if (selected.some((item) => item.reference === verse.reference)) {
      const orderedIndexes = selected.map((item) => position.get(item.reference) ?? -1).sort((a, b) => a - b);
      const isContinuousRange = orderedIndexes.length > 1 && orderedIndexes.every((item, index) => index === 0 || item === orderedIndexes[index - 1] + 1);
      const isRangeEndpoint = verse.reference === selected[0]?.reference || verse.reference === selected[selected.length - 1]?.reference;
      if (isContinuousRange && isRangeEndpoint) {
        const remaining = selected.filter((item) => item.reference !== verse.reference);
        if (remaining.length > 1) {
          setSelected([]);
          setSelectionAnchor(remaining[0].reference);
          setHoveredVerseReference(remaining[remaining.length - 1].reference);
          return;
        }
      }
      setSelected((current) => current.filter((item) => item.reference !== verse.reference));
      setSelectionAnchor(null);
      setHoveredVerseReference(null);
      return;
    }
    setSelectionAnchor(verse.reference);
    setHoveredVerseReference(verse.reference);
  };

  const addSelected = () => {
    if (!selectedForAdd.length) return;
    onAdd(selectionReference(selectedForAdd), selectedForAdd.map((verse) => verse.text).join('\n'), selectedForAdd);
  };
  const presentSelected = () => {
    if (!selectedForAdd.length || !onPresent) return;
    onPresent(selectionReference(selectedForAdd), selectedForAdd.map((verse) => verse.text).join('\n'), selectedForAdd);
  };

  useEffect(() => {
    if (!open) return;
    const ready = readyBibles.get(language);
    if (ready) {
      // Already prepared: show it straight away.
      setBible(ready);
      setLoading(false);
      setLoadError(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setLoadError(false);
    loadBible(language)
      .then((index) => { if (alive) setBible(index); })
      .catch(() => { if (alive) setLoadError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, language]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    const terms = deferredQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return verses.filter((verse) => {
      const searchable = `${verse.reference} ${verse.text}`.toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    }).slice(0, 100);
  }, [deferredQuery, verses]);

  const chooseTestament = (value: 'old' | 'new') => {
    setTestament(value);
    const firstBook = catalog.find((book) => book.testament === value);
    if (firstBook) {
      setBookName(firstBook.name);
      setChapterNumber(firstBook.chapters[0]?.number ?? 1);
    }
    setSelected([]);
    setSelectionAnchor(null);
  };

  const chooseBook = (book: BibleBook) => {
    setBookName(book.name);
    setChapterNumber(book.chapters[0]?.number ?? 1);
    setSelected([]);
    setSelectionAnchor(null);
  };

  const chooseChapter = (number: number) => {
    setChapterNumber(number);
    setSelected([]);
    setSelectionAnchor(null);
  };

  if (!open) return null;

  return (
    <BodyPortal><div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="scripture-picker-title" className="flex max-h-[min(760px,90vh)] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101d2a] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand"><BookOpen size={20} /></span>
            <div><h2 id="scripture-picker-title" className="text-base font-bold text-warm-white">Add Scripture</h2><p className="mt-0.5 text-xs text-warm-white/50">Choose a book, chapter, and verse · {language === 'en' ? 'King James Version' : 'Cebuano'}</p></div>
          </div>
          <button onClick={onClose} aria-label="Close scripture picker" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>

        <div className="border-b border-white/10 p-4">
          <label className="mb-3 flex items-center justify-between gap-3 text-xs text-white/60">
            Scripture language
            <select value={language} onChange={(event) => { setLanguage(event.target.value as 'en' | 'ceb'); setQuery(''); setSelected([]); setSelectionAnchor(null); setHoveredVerseReference(null); setBible(readyBibles.get(event.target.value as BibleLanguage) ?? null); }} className="rounded-lg border border-white/10 bg-[#091521] px-3 py-2 text-sm text-white outline-none focus:border-brand">
              <option value="en">English · King James Version</option>
              <option value="ceb">Bisaya · Cebuano</option>
            </select>
          </label>
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelected([]); setSelectionAnchor(null); setHoveredVerseReference(null); }} placeholder="Search words or a reference, e.g. John 3:16" className="w-full rounded-xl border border-white/10 bg-[#091521] py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-brand" />
          </label>
          <p className="mt-2 text-[11px] text-white/45">Click a starting verse, then hover the ending verse. To adjust a selected range, click its endpoint again and hover the new endpoint.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? <div className="flex h-36 items-center justify-center gap-2 text-sm text-white/55"><LoaderCircle size={17} className="animate-spin" />Loading the Bible…</div>
            : loadError ? <div className="flex h-36 items-center justify-center text-sm text-white/55">The scripture library could not be loaded. Close and reopen the picker to try again.</div>
            : query.trim() ? results.length === 0 ? <div className="flex h-36 items-center justify-center text-sm text-white/50">No matching verses found.</div>
              : <div className="space-y-1.5">{results.map((verse) => <button key={verse.reference} onMouseEnter={() => { if (selectionAnchor) setHoveredVerseReference(verse.reference); }} onClick={() => selectVerse(verse)} aria-pressed={selectedForAdd.some((item) => item.reference === verse.reference)} className={`w-full rounded-xl border p-3 text-left transition ${selectedForAdd.some((item) => item.reference === verse.reference) ? 'border-brand bg-brand/10' : 'border-transparent bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]'}`}>
                <span className="mb-1 flex items-center justify-between text-xs font-semibold text-brand">{verse.reference}{selected.some((item) => item.reference === verse.reference) && <Check size={14} />}</span>
                <span className="block text-sm leading-relaxed text-warm-white/85">{verse.text}</span>
              </button>)}</div>
              : <div className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b1723]">
                <div className="flex shrink-0 items-center gap-1 border-b border-white/10 p-2">
                  {([['old', 'Old Testament'], ['new', 'New Testament']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={testament === value} onClick={() => chooseTestament(value)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${testament === value ? 'bg-brand/15 text-brand' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><span className={`h-3 w-3 rounded-full border ${testament === value ? 'border-brand' : 'border-white/35'}`}>{testament === value && <span className="m-[2px] block h-1.5 w-1.5 rounded-full bg-brand" />}</span>{label}</button>)}
                  <span className="ml-auto hidden text-[10px] text-white/40 sm:block">{language === 'en' ? 'King James Version' : 'Cebuano'}</span>
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(88px,1fr)_minmax(72px,0.75fr)_minmax(92px,1fr)] divide-x divide-white/10 sm:grid-cols-[minmax(110px,1.1fr)_minmax(105px,0.8fr)_minmax(130px,1fr)]">
                  <section className="flex min-h-0 flex-col">
                    <h3 className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/45">Book</h3>
                    <div role="listbox" aria-label={`${testament === 'old' ? 'Old' : 'New'} Testament books`} className="min-h-0 flex-1 overflow-y-auto p-1.5">
                      {testamentBooks.map((book) => <button key={book.name} type="button" role="option" aria-selected={activeBook?.name === book.name} onClick={() => chooseBook(book)} className={`block w-full truncate rounded px-2 py-1.5 text-left text-xs ${activeBook?.name === book.name ? 'bg-brand text-navy font-semibold' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>{book.name}</button>)}
                    </div>
                  </section>
                  <section className="flex min-h-0 flex-col">
                    <h3 className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/45">Chapter</h3>
                    <div role="listbox" aria-label="Chapters" className="min-h-0 flex-1 content-start overflow-y-auto p-2 grid grid-cols-3 gap-1 sm:grid-cols-5">
                      {activeBook?.chapters.map((chapter) => <button key={chapter.number} type="button" role="option" aria-selected={activeChapter?.number === chapter.number} onClick={() => chooseChapter(chapter.number)} className={`h-7 rounded text-[11px] tabular-nums ${activeChapter?.number === chapter.number ? 'bg-brand text-navy font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{chapter.number}</button>)}
                    </div>
                  </section>
                  <section className="flex min-h-0 flex-col">
                    <h3 className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/45">Verse <span className="normal-case tracking-normal">· {activeBook?.name} {activeChapter?.number}</span></h3>
                    <div role="listbox" aria-label="Verses" className="min-h-0 flex-1 content-start overflow-y-auto p-2 grid grid-cols-4 gap-1 sm:grid-cols-6">
                      {activeChapter?.verses.map((verse, index) => <button key={verse.reference} type="button" role="option" aria-selected={selectedForAdd.some((item) => item.reference === verse.reference)} onMouseEnter={() => { if (selectionAnchor) setHoveredVerseReference(verse.reference); }} onClick={() => selectVerse(verse)} title={verse.text} className={`h-7 rounded text-[11px] tabular-nums ${selectedForAdd.some((item) => item.reference === verse.reference) ? 'bg-brand text-navy font-bold' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>{index + 1}</button>)}
                    </div>
                  </section>
                </div>
                {!!selectedForAdd.length && <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-xs"><span className="truncate font-semibold text-brand">{selectionReference(selectedForAdd)}</span><span className="shrink-0 text-white/45">{selectedForAdd.length} {selectedForAdd.length === 1 ? 'verse' : 'verses'} selected</span></div>}
              </div>}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <span className="text-xs text-warm-white/45">{query.trim() && !loading ? `${results.length}${results.length === 100 ? '+' : ''} results` : language === 'en' ? 'Full KJV text is available offline' : 'Full Cebuano text is available offline'}</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-[11px] text-white/45">{selectedForAdd.length > 1 ? `${selectedForAdd.length} verses selected` : ''}</span>
            {onPresent ? <>
              <button type="button" disabled={!selectedForAdd.length} onClick={addSelected} title="Review and design the selected verse slides before adding them" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">Review / design</button>
              <button type="button" disabled={!selectedForAdd.length} onClick={presentSelected} title="Add these verses as slides and send the first one to the current Studio output" className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-40">Present now</button>
            </> : <button type="button" disabled={!selectedForAdd.length} onClick={addSelected} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{selectedForAdd.length > 1 ? 'Add verses to slide' : 'Add to slide'}</button>}
            <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button>
          </div>
        </footer>
      </section>
    </div></BodyPortal>
  );
}
