import { CircleHelp, Info } from 'lucide-react';

export default function StatusFooter({ message = 'Ready.' }: { message?: string }) {
  return (
    <footer className="flex items-center justify-between border-t border-white/10 bg-panel px-6 py-3 text-sm text-warm-white/80">
      <div className="flex items-center gap-3">
        <Info size={22} className="rounded-full bg-brand p-0.5 text-navy" />
        <span>{message}</span>
      </div>
      <div className="flex items-center gap-6">
        <button className="flex items-center gap-1.5 text-xs hover:text-brand">
          <CircleHelp size={16} /> Need help?
        </button>
        <button className="flex items-center gap-1.5 text-xs hover:text-brand">
          <CircleHelp size={16} /> Help
        </button>
      </div>
    </footer>
  );
}