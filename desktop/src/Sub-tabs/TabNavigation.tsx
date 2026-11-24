import type { ReactNode } from 'react';

export type TabOption<Value extends string> = {
  value: Value;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
};

export function UnderlineTabs<Value extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
  buttonClassName = '',
}: {
  label: string;
  value: Value;
  options: readonly TabOption<Value>[];
  onChange: (value: Value) => void;
  className?: string;
  buttonClassName?: string;
}) {
  return <div role="tablist" aria-label={label} className={`flex shrink-0 items-end gap-1 border-b border-white/10 ${className}`}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      role="tab"
      aria-selected={value === option.value}
      disabled={option.disabled}
      title={option.title}
      onClick={() => onChange(option.value)}
      className={`border-b-2 px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${value === option.value ? 'border-brand text-white' : 'border-transparent text-warm-white/50 hover:text-white'} ${buttonClassName}`}
    >{option.icon}{option.label}</button>)}
  </div>;
}

export function SegmentedTabs<Value extends string>({
  label,
  value,
  options,
  onChange,
  className = '',
  buttonClassName = '',
}: {
  label: string;
  value: Value;
  options: readonly TabOption<Value>[];
  onChange: (value: Value) => void;
  className?: string;
  buttonClassName?: string;
}) {
  return <div role="tablist" aria-label={label} className={`flex shrink-0 gap-1 rounded-lg bg-black/20 p-1 ${className}`}>
    {options.map((option) => <button
      key={option.value}
      type="button"
      role="tab"
      aria-selected={value === option.value}
      disabled={option.disabled}
      title={option.title}
      onClick={() => onChange(option.value)}
      className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${value === option.value ? 'bg-white/10 text-white' : 'text-warm-white/55 hover:text-white'} ${buttonClassName}`}
    >{option.icon}{option.label}</button>)}
  </div>;
}
