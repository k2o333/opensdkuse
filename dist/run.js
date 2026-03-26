import { main } from "./src/main.js";
main()
    .then((exitCode) => {
    process.exitCode = exitCode;
})
    .catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
});
