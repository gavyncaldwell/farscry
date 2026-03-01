type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[minLevel];
}

function format(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase()}] ${msg}`;
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

export const logger = {
  setLevel(level: LogLevel) {
    minLevel = level;
  },

  debug(msg: string, data?: Record<string, unknown>) {
    if (shouldLog('debug')) console.debug(format('debug', msg, data));
  },

  info(msg: string, data?: Record<string, unknown>) {
    if (shouldLog('info')) console.info(format('info', msg, data));
  },

  warn(msg: string, data?: Record<string, unknown>) {
    if (shouldLog('warn')) console.warn(format('warn', msg, data));
  },

  error(msg: string, data?: Record<string, unknown>) {
    if (shouldLog('error')) console.error(format('error', msg, data));
  },
};
