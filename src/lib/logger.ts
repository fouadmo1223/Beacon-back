type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const TOKEN_PATTERN = /(Expo(?:nent)?PushToken)\[([A-Za-z0-9_-]+)\]/g;

/** Push tokens are credentials for a device — never write them to logs in full. */
function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(TOKEN_PATTERN, (_, prefix: string, inner: string) => `${prefix}[${inner.slice(0, 4)}…]`);
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value instanceof Error) return { name: value.name, message: redact(value.message) };
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redact(entry)]));
  }
  return value;
}

let minLevel: Level = 'info';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[minLevel] || process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message: redact(message),
    ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
  });
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const logger = {
  setLevel(level: Level) {
    minLevel = level;
  },
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
