import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Search, X } from 'lucide-react';

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

export default function ScripturePickerModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (reference: string, text: string, verses?: SelectedScriptureVerse[]) => void;
}) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ceb'>('en');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Verse[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [hoveredVerseReference, setHoveredVerseReference] = useState<string | null>(null);
  const [testament, setTestament] = useState<'old' | 'new'>('old');
  const [bookName, setBookName] = useState('Genesis');
  const [chapterNumber, setChapterNumber] = useState(1);

  const catalog = useMemo<BibleBook[]>(() => {
    const books = new Map<string, Map<number, Verse[]>>();
    for (const verse of verses) {
      const match = /^(.*)\s+(\d+):(\d+)$/.exec(verse.reference);
      if (!match) continue;
      const [, name, chapter, verseNumber] = match;
      const chapters = books.get(name) ?? new Map<number, Verse[]>();
      const chapterVerses = chapters.get(Number(chapter)) ?? [];
      chapterVerses[Number(verseNumber) - 1] = verse;
      chapters.set(Number(chapter), chapterVerses);
      books.set(name, chapters);
    }
    return [...books.entries()].map(([name, chapters]) => ({
      name,
      testament: NEW_TESTAMENT_BOOKS.has(name) ? 'new' : 'old',
      chapters: [...chapters.entries()].sort(([a], [b]) => a - b).map(([number, chapterVerses]) => ({ number, verses: chapterVerses.filter((verse): verse is Verse => !!verse) })),
    }));
  }, [verses]);
  const testamentBooks = useMemo(() => catalog.filter((book) => book.testament === testament), [catalog, testament]);
  const activeBook = testamentBooks.find((book) => book.name === bookName) ?? testamentBooks[0];
  const activeChapter = activeBook?.chapters.find((chapter) => chapter.number === chapterNumber) ?? activeBook?.chapters[0];

  const selectedForAdd = useMemo(() => {
    const selectedReferences = new Set(selected.map((verse) => verse.reference));
    if (selectionAnchor && hoveredVerseReference) {
      const first = verses.findIndex((verse) => verse.reference === selectionAnchor);
      const last = verses.findIndex((verse) => verse.reference === hoveredVerseReference);
      if (first >= 0 && last >= 0) {
        verses.slice(Math.min(first, last), Math.max(first, last) + 1).forEach((verse) => selectedReferences.add(verse.reference));
      }
    }
    return verses.filter((verse) => selectedReferences.has(verse.reference));
  }, [hoveredVerseReference, selected, selectionAnchor, verses]);

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
      const first = verses.findIndex((item) => item.reference === selectionAnchor);
      const last = verses.findIndex((item) => item.reference === verse.reference);
      if (first >= 0 && last >= 0) {
        const range = verses.slice(Math.min(first, last), Math.max(first, last) + 1);
        setSelected((current) => {
          const selectedReferences = new Set([...current, ...range].map((item) => item.reference));
          return verses.filter((item) => selectedReferences.has(item.reference));
        });
        setSelectionAnchor(null);
        setHoveredVerseReference(null);
        return;
      }
    }
    if (selected.some((item) => item.reference === verse.reference)) {
      const orderedIndexes = selected.map((item) => verses.findIndex((candidate) => candidate.reference === item.reference)).sort((a, b) => a - b);
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

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setLoadError(false);
    const load = language === 'en'
      ? import('../../data/kjv.json').then(({ default: bible }) => {
        const data = bible as BibleData;
        return data.books.flatMap((book) => book.chapters.flatMap((chapter) =>
          chapter.verses.map((verse) => ({
            reference: `${book.englishName} ${chapter.chapter}:${verse.number}`,
            text: verse.text,
          })),
        ));
      })
      : import('../../data/ceb.json').then(({ default: data }) => data as Verse[]);
    load.then((allVerses) => { if (alive) setVerses(allVerses); })
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
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return verses.filter((verse) => {
      const searchable = `${verse.reference} ${verse.text}`.toLocaleLowerCase();
      return terms.every((term) => searchable.includes(term));
    }).slice(0, 100);
  }, [query, verses]);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
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
            <select value={language} onChange={(event) => { setLanguage(event.target.value as 'en' | 'ceb'); setQuery(''); setSelected([]); setSelectionAnchor(null); setHoveredVerseReference(null); setVerses([]); }} className="rounded-lg border border-white/10 bg-[#091521] px-3 py-2 text-sm text-white outline-none focus:border-brand">
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

        <footer className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <span className="text-xs text-warm-white/45">{query.trim() && !loading ? `${results.length}${results.length === 100 ? '+' : ''} results` : language === 'en' ? 'Full KJV text is available offline' : 'Full Cebuano text is available offline'}</span>
          <div className="flex items-center gap-2"><span className="text-[11px] text-white/45">{selectedForAdd.length > 1 ? `${selectedForAdd.length} verses selected` : ''}</span><button disabled={!selectedForAdd.length} onClick={addSelected} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{selectedForAdd.length > 1 ? 'Add verses to slide' : 'Add to slide'}</button><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button></div>
        </footer>
      </section>
    </div>
  );
}
