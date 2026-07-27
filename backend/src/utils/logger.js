/**
 * utils/logger.js
 * ---------------
 * Tiny structured logger. Could be swapped for winston/pino later, but this is
 * enough for the Render logs without adding extra deps.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const MIN_LEVEL = LEVELS[process.env.LOG_LEVEL ?? 'info'];

function fmt(level, msg, meta) {
  const ts = new Date().toISOString();
  const base = `[${ts}] ${level.toUpperCase()} ${msg}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

export const logger = {
  error: (msg, meta) => { if (LEVELS.error <= MIN_LEVEL) console.error(fmt('error', msg, meta)); },
  warn:  (msg, meta) => { if (LEVELS.warn  <= MIN_LEVEL) console.warn (fmt('warn',  msg, meta)); },
  info:  (msg, meta) => { if (LEVELS.info  <= MIN_LEVEL) console.log  (fmt('info',  msg, meta)); },
  debug: (msg, meta) => { if (LEVELS.debug <= MIN_LEVEL) console.log  (fmt('debug', msg, meta)); },
};
