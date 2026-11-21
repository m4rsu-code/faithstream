import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type AudioMixerSettingsChannel = {
  id: number;
  name: string;
  icon: LucideIcon;
  db: number;
  muted: boolean;
  pan: number;
  compressor: boolean;
  compressorThreshold: number;
};

export type AudioMixerSettingsSource = {
  kind: string;
  stream?: MediaStream;
  deviceId?: string;
  mobileCamSourceId?: number;
  visible: boolean;
  noiseSuppression?: boolean;
};

type Props = {
  channel: AudioMixerSettingsChannel | null;
  source?: AudioMixerSettingsSource;
  noiseSuppressionSupported: boolean;
  meter?: ReactNode;
  inputMeter?: ReactNode;
  microphoneSwitching?: boolean;
  remoteMicrophoneDevices?: { deviceId: string; label: string }[];
  error?: string;
  onChange: (patch: Partial<AudioMixerSettingsChannel>) => void;
  onSelectMicrophoneDevice?: (deviceId: string) => void;
  onToggleNoiseSuppression: () => void;
  onClose: () => void;
};

export default function AudioMixerSettingsModal({
  channel,
  source,
  noiseSuppressionSupported,
  meter,
  inputMeter,
  microphoneSwitching = false,
  remoteMicrophoneDevices = [],
  error,
  onChange,
  onSelectMicrophoneDevice,
  onToggleNoiseSuppression,
  onClose,
}: Props) {
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  useEffect(() => {
    if (!channel) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [channel, onClose]);

  useEffect(() => {
    if (!channel || source?.kind !== 'microphone' || !navigator.mediaDevices?.enumerateDevices) {
      setMicrophoneDevices([]);
      return;
    }
    let active = true;
    const refreshDevices = async () => {
      setDevicesLoading(true);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (active) setMicrophoneDevices(devices.filter((device) => device.kind === 'audioinput'));
      } catch {
        if (active) setMicrophoneDevices([]);
      } finally {
        if (active) setDevicesLoading(false);
      }
    };
    void refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [channel?.id, source?.kind]);

  if (!channel) return null;

  const Icon = channel.icon;
  const micTrackIsLive = source?.kind === 'microphone' && source.stream?.getAudioTracks().some((track) => track.readyState === 'live');
  const noiseSuppressionOn = source?.noiseSuppression ?? true;
  const selectedDeviceIsMissing = !!source?.deviceId
    && !microphoneDevices.some((device) => device.deviceId === source.deviceId)
    && !remoteMicrophoneDevices.some((device) => device.deviceId === source.deviceId);
  const hasAnyMicrophoneInput = microphoneDevices.length > 0 || remoteMicrophoneDevices.length > 0;
  const switchClass = (enabled: boolean, disabled = false) => `relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${enabled ? 'bg-brand' : 'bg-white/20'} ${disabled ? 'opacity-40' : ''}`;
  const switchThumb = (enabled: boolean) => `absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-6' : 'left-1'}`;

  return createPortal(<div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onPointerDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="audio-settings-title" onPointerDown={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#101d2a] p-5 shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"><Icon size={19} /></span>
          <div><h2 id="audio-settings-title" className="text-lg font-bold text-white">{channel.name}</h2><p className="mt-0.5 text-xs text-warm-white/50">Audio mixer settings · adjustments affect the stream and recording</p></div>
        </div>
        <button type="button" aria-label="Close mixer settings" onClick={onClose} className="rounded-lg p-1.5 text-warm-white/55 hover:bg-white/10 hover:text-white"><X size={18} /></button>
      </header>
      <div className="mt-4 space-y-5">
        <section className="rounded-xl border border-white/10 bg-black/15 p-4">
          <div className="flex items-center justify-between text-sm font-semibold text-warm-white"><h3>Output volume</h3><span className="tabular-nums text-brand">{channel.db.toFixed(1)} dB</span></div>
          <input type="range" min={-60} max={12} step={0.5} value={channel.db} aria-label={`${channel.name} output volume`} onChange={(event) => onChange({ db: Number(event.target.value) })} className="mt-3 w-full accent-brand" />
          <div className="mt-1 flex justify-between text-[10px] text-warm-white/40"><span>−60 dB</span><span>0 dB</span><span>+12 dB</span></div>
          {meter}
        </section>
        <section className="rounded-xl border border-white/10 bg-black/15 p-4">
          <div className="flex items-center justify-between text-sm font-semibold text-warm-white"><h3>Stereo balance</h3><span className="text-xs font-medium text-brand">{channel.pan === 0 ? 'Center' : channel.pan < 0 ? `${Math.abs(Math.round(channel.pan * 100))}% left` : `${Math.round(channel.pan * 100)}% right`}</span></div>
          <input type="range" min={-1} max={1} step={0.01} value={channel.pan} aria-label={`${channel.name} stereo balance`} onChange={(event) => onChange({ pan: Number(event.target.value) })} className="mt-3 w-full accent-brand" />
          <div className="mt-1 flex justify-between text-[10px] text-warm-white/40"><span>Left</span><span>Center</span><span>Right</span></div>
        </section>
        <section className="rounded-xl border border-white/10 bg-black/15 p-4">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-sm font-semibold text-warm-white">Compressor</h3><p className="mt-1 text-xs leading-relaxed text-warm-white/50">Gently reduces loud peaks to keep this source more even.</p></div>
            <button type="button" role="switch" aria-checked={channel.compressor} aria-label="Compressor" onClick={() => onChange({ compressor: !channel.compressor })} className={switchClass(channel.compressor)}><span className={switchThumb(channel.compressor)} /></button>
          </div>
          {channel.compressor && <label className="mt-4 block text-xs text-warm-white/70">Threshold <span className="float-right tabular-nums text-brand">{channel.compressorThreshold} dB</span><input type="range" min={-36} max={0} step={1} value={channel.compressorThreshold} aria-label="Compressor threshold" onChange={(event) => onChange({ compressorThreshold: Number(event.target.value) })} className="mt-2 w-full accent-brand" /><span className="mt-1 flex justify-between text-[10px] text-warm-white/40"><span>More compression</span><span>Less compression</span></span></label>}
        </section>
        {source?.kind === 'microphone' && <section className="rounded-xl border border-white/10 bg-black/15 p-4">
          <label className="block text-sm font-semibold text-warm-white" htmlFor="audio-input-device">Microphone input</label>
          <p className="mt-1 text-xs leading-relaxed text-warm-white/50">Choose a physical microphone or connected FaithStream Cam phone audio. Desktop audio is a separate source.</p>
          <select id="audio-input-device" value={source.deviceId ?? ''} disabled={microphoneSwitching || (devicesLoading && remoteMicrophoneDevices.length === 0) || !hasAnyMicrophoneInput} onChange={(event) => onSelectMicrophoneDevice?.(event.target.value)} className="mt-3 w-full rounded-lg border border-white/10 bg-[#0b1621] px-3 py-2.5 text-sm text-warm-white outline-none focus:border-brand disabled:opacity-50">
            <option value="">System default microphone</option>
            {selectedDeviceIsMissing && <option value={source.deviceId}>Current microphone (disconnected)</option>}
            {microphoneDevices.map((device, index) => <option key={device.deviceId || `audio-input-${index}`} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
            {remoteMicrophoneDevices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
          </select>
          {microphoneSwitching && <p className="mt-2 text-xs text-brand">Switching microphone…</p>}
          {!hasAnyMicrophoneInput && !devicesLoading && <p className="mt-2 text-xs text-amber-200/80">No microphone inputs found. Enable Share phone microphone in FaithStream Cam and connect it, or check microphone permission on this computer.</p>}
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-warm-white/45">Input signal</p>
            {inputMeter}
            {!micTrackIsLive && <p className="mt-2 text-xs text-amber-200/80">Connect the microphone to see its live input level.</p>}
          </div>
        </section>}
        {source?.kind === 'microphone' && source.mobileCamSourceId !== undefined && <p className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-warm-white/55">Phone microphone noise processing is controlled by FaithStream Cam.</p>}
        {source?.kind === 'microphone' && !source.mobileCamSourceId && <section className="rounded-xl border border-white/10 bg-black/15 p-4">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="text-sm font-semibold text-warm-white">Noise suppression</h3><p className="mt-1 text-xs leading-relaxed text-warm-white/50">Reduces steady background noise from this microphone.</p></div>
            <button type="button" role="switch" aria-checked={noiseSuppressionOn} aria-label="Microphone noise suppression" disabled={!noiseSuppressionSupported || !micTrackIsLive} onClick={onToggleNoiseSuppression} className={switchClass(noiseSuppressionOn, !noiseSuppressionSupported || !micTrackIsLive)}><span className={switchThumb(noiseSuppressionOn)} /></button>
          </div>
          {!noiseSuppressionSupported && <p className="mt-3 text-xs text-amber-200/80">Noise suppression isn’t supported by this microphone or device.</p>}
          {noiseSuppressionSupported && !micTrackIsLive && <p className="mt-3 text-xs text-amber-200/80">Connect the microphone to change this setting.</p>}
        </section>}
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-amber-300/15 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{error}</p>}
      <footer className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
        <button type="button" onClick={() => onChange({ db: -6, muted: false, pan: 0, compressor: false, compressorThreshold: -18 })} className="rounded-lg px-3 py-2 text-xs font-medium text-warm-white/55 hover:bg-white/5 hover:text-white">Reset audio</button>
        <button type="button" onClick={onClose} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-navy hover:brightness-110">Done</button>
      </footer>
    </section>
  </div>, document.body);
}
