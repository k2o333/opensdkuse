export interface Logger {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  error(...args: unknown[]): void;
  separator(char?: string, count?: number): void;
}

export function createLogger(debug: boolean, info: boolean): Logger {
  return {
    log(...args: unknown[]): void {
      console.log(...args);
    },
    info(...args: unknown[]): void {
      if (info || debug) {
        console.error("[INFO]", ...args);
      }
    },
    debug(...args: unknown[]): void {
      if (debug) {
        console.error("[DEBUG]", ...args);
      }
    },
    error(...args: unknown[]): void {
      console.error("[ERROR]", ...args);
    },
    separator(char = "-", count = 40): void {
      console.error(char.repeat(count));
    },
  };
}
