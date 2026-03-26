export function createLogger(debug) {
    return {
        log(...args) {
            console.log(...args);
        },
        info(...args) {
            console.error("[INFO]", ...args);
        },
        debug(...args) {
            if (debug) {
                console.error("[DEBUG]", ...args);
            }
        },
        error(...args) {
            console.error("[ERROR]", ...args);
        },
        separator(char = "-", count = 40) {
            console.error(char.repeat(count));
        },
    };
}
