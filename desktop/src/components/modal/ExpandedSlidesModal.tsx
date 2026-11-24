import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type ExpandedSlideItem = {
  key: string;
  title: string;
  thumbnail: ReactNode;
  active?: boolean;
  onAir?: boolean;
  preview?: boolean;
};

export default function ExpandedSlidesModal({
  title,
  slides,
  onSelect,
  onClose,
}: {
  title: string;
  slides: ExpandedSlideItem[];
  onSelect: (index: number) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex flex-col bg-[#0a111b]/95 p-4 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-labelledby="expanded-slides-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <header className="mb-4 flex shrink-0 items-center justify-between gap-4 border-b border-white/10 pb-3">
        <div className="min-w-0">
          <h2 id="expanded-slides-title" className="truncate text-lg font-bold text-white">{title}</h2>
          <p className="mt-1 text-xs text-warm-white/55">{slides.length} slides · Quick show slides can show a selected slide immediately when this scene is already live.</p>
        </div>
        <button type="button" onClick={onClose} className="flex shrink-0 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-warm-white/80 hover:bg-white/10 hover:text-white">
          <X size={16} /> Close <kbd className="ml-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-warm-white/55">Esc</kbd>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {slides.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {slides.map((slide, index) => <button key={slide.key} type="button" onClick={() => onSelect(index)} aria-pressed={!!slide.active} className={`group min-w-0 overflow-hidden rounded-xl border text-left transition ${slide.active ? 'border-brand ring-2 ring-brand/35' : 'border-white/10 hover:border-white/35'}`}>
            <div className="relative aspect-video overflow-hidden bg-black">{slide.thumbnail}
              <span className="absolute bottom-2 left-2 rounded bg-black/75 px-2 py-1 text-xs font-semibold text-white">{index + 1}</span>
              <span className="absolute right-2 top-2 flex flex-col items-end gap-1">
                {slide.onAir && <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white">Live now</span>}
                {slide.preview && !slide.onAir && <span className="rounded bg-sky-600 px-2 py-1 text-[10px] font-bold text-white">Ready next</span>}
                {slide.active && !slide.onAir && !slide.preview && <span className="rounded bg-brand px-2 py-1 text-[10px] font-bold text-white">Selected</span>}
              </span>
            </div>
            <span className="block truncate bg-panel px-3 py-2 text-xs font-medium text-warm-white/85" title={slide.title}>{slide.title}</span>
          </button>)}
        </div> : <p className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-warm-white/55">This scene has no slides.</p>}
      </div>
      <div className="mt-3 flex shrink-0 items-center justify-between border-t border-white/10 pt-3 text-xs text-warm-white/45">
        <span>Keyboard shortcut</span><kbd className="rounded border border-white/15 bg-white/5 px-2 py-1 text-warm-white/75">Ctrl + Shift + E</kbd>
      </div>
    </div>,
    document.body,
  );
}
