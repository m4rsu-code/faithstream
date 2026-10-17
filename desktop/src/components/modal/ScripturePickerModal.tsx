import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, LoaderCircle, Search, X } from 'lucide-react';

type Verse = { reference: string; text: string };
type BibleData = {
  books: {
    englishName: string;
    chapters: { chapter: number; verses: { number: number; text: string }[] }[];
  }[];
};

export default function ScripturePickerModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (reference: string, text: string) => void;
}) {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [language, setLanguage] = useState<'en' | 'ceb'>('en');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Verse | null>(null);

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="scripture-picker-title" className="flex max-h-[min(760px,90vh)] w-full max-w-[780px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101d2a] shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/15 text-brand"><BookOpen size={20} /></span>
            <div><h2 id="scripture-picker-title" className="text-base font-bold text-warm-white">Add Scripture</h2><p className="mt-0.5 text-xs text-warm-white/50">Search verses by words or reference · {language === 'en' ? 'King James Version' : 'Cebuano'}</p></div>
          </div>
          <button onClick={onClose} aria-label="Close scripture picker" className="rounded-lg p-2 text-warm-white/60 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>

        <div className="border-b border-white/10 p-4">
          <label className="mb-3 flex items-center justify-between gap-3 text-xs text-white/60">
            Scripture language
            <select value={language} onChange={(event) => { setLanguage(event.target.value as 'en' | 'ceb'); setQuery(''); setSelected(null); setVerses([]); }} className="rounded-lg border border-white/10 bg-[#091521] px-3 py-2 text-sm text-white outline-none focus:border-brand">
              <option value="en">English · King James Version</option>
              <option value="ceb">Bisaya · Cebuano</option>
            </select>
          </label>
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Search words or a reference, e.g. John 3:16" className="w-full rounded-xl border border-white/10 bg-[#091521] py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-brand" />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? <div className="flex h-36 items-center justify-center gap-2 text-sm text-white/55"><LoaderCircle size={17} className="animate-spin" />Loading the Bible…</div>
            : loadError ? <div className="flex h-36 items-center justify-center text-sm text-white/55">The scripture library could not be loaded. Close and reopen the picker to try again.</div>
            : !query.trim() ? <div className="flex h-36 flex-col items-center justify-center text-center text-sm text-white/50"><Search size={22} className="mb-2 opacity-50" />Search the full text or enter a verse reference.</div>
              : results.length === 0 ? <div className="flex h-36 items-center justify-center text-sm text-white/50">No matching verses found.</div>
                : <div className="space-y-1.5">{results.map((verse) => <button key={verse.reference} onClick={() => setSelected(verse)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.reference === verse.reference ? 'border-brand bg-brand/10' : 'border-transparent bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]'}`}>
                  <span className="mb-1 flex items-center justify-between text-xs font-semibold text-brand">{verse.reference}{selected?.reference === verse.reference && <Check size={14} />}</span>
                  <span className="block text-sm leading-relaxed text-warm-white/85">{verse.text}</span>
                </button>)}</div>}
        </div>

        <footer className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <span className="text-xs text-warm-white/45">{query.trim() && !loading ? `${results.length}${results.length === 100 ? '+' : ''} results` : language === 'en' ? 'Full KJV text is available offline' : 'Full Cebuano text is available offline'}</span>
          <div className="flex gap-2"><button onClick={onClose} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-warm-white/75 hover:bg-white/5">Cancel</button><button disabled={!selected} onClick={() => { if (selected) onAdd(selected.reference, selected.text); }} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">Add to slide</button></div>
        </footer>
      </section>
    </div>
  );
}
