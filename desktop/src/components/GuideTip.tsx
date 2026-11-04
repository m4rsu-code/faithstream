import { useState, type ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';

/**
 * A short "how to" hint with numbered steps. Normally it can be closed (remembered on this
 * computer, per id); a permanent tip always shows and has no close button.
 */
export default function GuideTip({ id, title, steps, compact = false, permanent = false }: { id: string; title: string; steps: ReactNode[]; compact?: boolean; permanent?: boolean }) {
  const key = `faithstream.tip-hidden.${id}`;
  const [hidden, setHidden] = useState(() => {
    if (permanent) return false;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  if (hidden && !permanent) return null;
  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(key, '1'); } catch { /* hide for this session only */ }
  };
  return (
    <div className={`relative shrink-0 rounded-xl border border-sky-400/20 bg-sky-500/[0.07] text-warm-white/80 ${compact ? 'mb-1.5 p-2 pr-6 text-[10px]' : 'p-3 pr-9 text-xs'}`}>
      {!permanent && <button type="button" aria-label="Hide this tip" title="Hide this tip" onClick={hide} className={`absolute rounded p-0.5 text-warm-white/40 hover:bg-white/10 hover:text-white ${compact ? 'right-1 top-1' : 'right-2 top-2'}`}><X size={compact ? 11 : 14} /></button>}
      <p className={`flex items-center gap-1.5 font-semibold text-sky-100 ${compact ? 'mb-1' : 'mb-1.5'}`}><Lightbulb size={compact ? 11 : 14} className="text-sky-300" /> {title}</p>
      <ol className={`flex ${compact ? 'flex-col gap-0.5' : 'flex-wrap gap-x-5 gap-y-1'}`}>
        {steps.map((step, index) => (
          <li key={index} className="flex items-baseline gap-1.5">
            <span className={`flex shrink-0 items-center justify-center rounded-full bg-sky-400/20 font-bold text-sky-100 ${compact ? 'h-3.5 w-3.5 text-[8px]' : 'h-4 w-4 text-[10px]'}`}>{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
