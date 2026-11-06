/**
 * Structured logger (ENV-10). Debug output only in development builds. Callers must never pass
 * tokens, emails, URLs or hosts of non-tracked sites (SEC-06): log codes and counts instead.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null>;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

export function createLogger(options: {
  debug: boolean;
  sink?: (level: LogLevel, line: string) => void;
}): Logger {
  const sink =
    options.sink ??
    ((level: LogLevel, line: string) => {
      // The logger is the single place allowed to write to the console (ENV-10).
      // biome-ignore lint/suspicious/noConsole: debug/info are the logger's own output levels
      const write = level === "debug" || level === "info" ? console.info : console[level];
      write(line);
    });
  const log =
    (level: LogLevel) =>
    (event: string, fields: LogFields = {}) => {
      if (level === "debug" && !options.debug) return;
      sink(level, `[careeros] ${level} ${event} ${JSON.stringify(fields)}`);
    };
  return { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") };
}
