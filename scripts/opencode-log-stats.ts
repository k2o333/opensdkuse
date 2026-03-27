import { main } from "../src/opencode-log-stats.js";

main().then((exitCode) => {
  process.exitCode = exitCode;
});
