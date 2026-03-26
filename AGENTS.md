# Repository Guidelines

## Project Structure & Module Organization
`run.ts` is the CLI entrypoint. Core logic lives in `src/`, split by responsibility: argument parsing in `src/cli.ts`, config loading in `src/config.ts`, orchestration in `src/main.ts`, SDK integration in `src/opencode.ts`, and output/error helpers in adjacent modules. Tests live in `test/` and mirror source modules with `*.test.ts` files such as `test/cli.test.ts`. Prompt assets live in the repo root `prompt.md` and under `prompts/`.

## Build, Test, and Development Commands
Run `npm install` once to install dependencies. Use `npm run dev -- "your task"` or `npm start -- "your task"` to execute the CLI locally through `ts-node`. Run `npm run typecheck` for strict TypeScript validation with no emit. Run `npm test` to execute the Node test suite (`node --test test/*.test.ts`).

## Coding Style & Naming Conventions
Use TypeScript with ESM imports and explicit `.js` import suffixes in source files. Follow the existing style: 2-space indentation, double quotes, semicolons, and small focused modules. Prefer `camelCase` for variables and functions, `PascalCase` for types/classes/interfaces, and descriptive file names matching the exported concern, for example `src/response.ts`. Keep CLI-facing errors explicit and typed through `AppError`.

## Testing Guidelines
The project uses Node’s built-in test runner from `node:test` with `assert/strict`. Add or update tests whenever behavior changes. Place tests in `test/` with names matching the module under test, for example `test/config.test.ts`. Cover happy paths and validation failures, especially for CLI flags, config precedence, and response normalization.

## Commit & Pull Request Guidelines
Keep commit messages short, imperative, and specific, consistent with history such as `Add .gitignore` and `Remove node_modules from commit`. For pull requests, include a brief summary, note any user-visible CLI changes, list verification steps run (`npm run typecheck`, `npm test`), and include sample command output when flags or prompts change.

## Configuration Notes
Configuration priority is CLI arguments over environment variables over defaults. Document new environment variables in `README.md` and keep examples aligned with `prompt.md` and the CLI help text.
