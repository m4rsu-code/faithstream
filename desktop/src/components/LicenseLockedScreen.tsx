import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  LockKeyhole,
  Minus,
  RefreshCw,
  Square,
  X,
} from 'lucide-react';
import FaithStreamLogo from '../assets/img/Logo.png';
import { PLANS_URL, openPlansPage } from '../utils/license';

const LOCK_THEME_STYLE = {
  '--color-brand': '#CB874C',
  '--color-navy': '#14243A',
  '--color-studio': '#101923',
  '--color-panel': '#192431',
  '--color-warm-white': '#F7F5F0',
  colorScheme: 'dark',
} as CSSProperties;

/**
 * Shown when the signed-in account has no active license, so the app explains the
 * refused sync instead of silently failing. Everything stored on this computer still
 * works; the operator can keep preparing their service offline.
 */
export default function LicenseLockedScreen({
  message,
  onContinue,
}: {
  message: string;
  onContinue: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const openPlans = async () => {
    setBusy(true);
    try {
      await openPlansPage();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={LOCK_THEME_STYLE}
      className="flex h-screen min-h-[560px] flex-col overflow-hidden bg-panel text-warm-white"
    >
      <div
        aria-hidden="true"
        className="h-9 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />
      <div
        className="absolute right-3 top-3 z-30 flex overflow-hidden rounded-lg border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.2)]"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <button
          type="button"
          aria-label="Minimize window"
          onClick={() => void window.faithstreamWindow?.minimize()}
          className="flex h-8 w-9 items-center justify-center text-warm-white/70 hover:bg-white/10 hover:text-warm-white"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          aria-label="Maximize window"
          onClick={() => void window.faithstreamWindow?.toggleMaximize()}
          className="flex h-8 w-9 items-center justify-center text-warm-white/70 hover:bg-white/10 hover:text-warm-white"
        >
          <Square size={11} />
        </button>
        <button
          type="button"
          aria-label="Close window"
          onClick={() => void window.faithstreamWindow?.close()}
          className="flex h-8 w-9 items-center justify-center text-warm-white/70 hover:bg-red-600 hover:text-warm-white"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-lg">
          <img
            src={FaithStreamLogo}
            alt="FaithStream Studio"
            className="h-12 w-auto object-contain"
          />
          <div className="mt-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.2em] text-brand">
            <LockKeyhole size={14} /> License needed
          </div>
          <h1 className="mt-3 text-3xl font-bold leading-tight">
            Activate your license to sync this account.
          </h1>
          <p className="mt-4 text-sm leading-6 text-warm-white/60">{message}</p>

          <div className="mt-6 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-studio/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-warm-white/45">
              What still works
            </p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-warm-white/70">
              <li>
                Studio, presentations, songbooks and media stored on this
                computer.
              </li>
              <li>Livestreaming and recording.</li>
              <li>Opening the Plans page to pay and submit your receipt.</li>
            </ul>
          </div>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void openPlans();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-navy transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Opening…' : 'Open the Plans page'}{' '}
              {!busy && <ArrowRight size={16} />}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 rounded-xl border border-[rgba(255,255,255,0.12)] px-4 py-3 text-sm font-semibold text-warm-white/80 transition hover:bg-white/5 hover:text-warm-white"
            >
              <RefreshCw size={15} /> Check again
            </button>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="mt-4 w-full text-center text-xs font-semibold text-warm-white/45 hover:text-warm-white/80 hover:underline"
          >
            Continue on this computer without account sync
          </button>

          <p className="mt-6 break-all text-[11px] leading-relaxed text-warm-white/30">
            Plans page: {PLANS_URL}. Your license activates after the payment is
            verified.
          </p>
        </div>
      </div>
    </div>
  );
}
