export function formatNumber(value: number | string | null | undefined): string {
  return new Intl.NumberFormat().format(Number(value || 0));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return 'Waiting for data';
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value))}`;
}

export function initials(name: string | null | undefined): string {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
}
