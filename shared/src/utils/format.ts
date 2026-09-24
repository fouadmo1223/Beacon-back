/** Masks a push token so it can be displayed or logged without leaking it. */
export function maskToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const match = /^([A-Za-z]+)\[(.+)\]$/.exec(token);
  const prefix = match?.[1] ?? '';
  const inner = match?.[2] ?? token;
  const visible = inner.length <= 8 ? inner.slice(0, 2) : `${inner.slice(0, 4)}…${inner.slice(-4)}`;
  return prefix ? `${prefix}[${visible}]` : visible;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/** Tiny RFC4122-ish v4 id that works in React Native, browsers and Node. */
export function createId(prefix = ''): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const uuid =
    typeof cryptoRef?.randomUUID === 'function'
      ? cryptoRef.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
  return prefix ? `${prefix}_${uuid}` : uuid;
}
