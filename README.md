# 空间建图复盘

Private research viewer for recorded Qwen3.8-27B, Gemma-4-31B, and Gemini3.8 Flash experiments. This application performs no model inference and contains no provider API credentials.

The interface separates scripted common-history readouts from real Claude Code autonomous trajectories. A Flash readout contains the complete supplied image/action history and final response, with reported reasoning-token usage but no returned reasoning text. Missing thought content is never synthesized.

Each actual model call exposes its full input messages, image bytes, tool definitions, returned analysis, requested tools, and final text. Environment frames expose actual saved public receipts separately from requested tools. Researcher observations and optional evaluator references are explicitly outside the model input.

User annotations are stored by call/frame scope in a managed D1 database, with local drafts, revision conflict detection, and JSON export. The deployment is owner-private. Do not broaden access without the owner's request.

## Local development

Node 24 is used for browser checks and the SQLite development adapter.

```
npm ci
node scripts/dev-server.mjs
npm test
node tests/browser.mjs
npm run build
```

`scripts/export_evidence.py` reads only selected experiment records from the parent experiment directory. It replaces inline image URLs with byte-identical image assets and losslessly deduplicates repeated input messages into hashed blocks. It never calls models, executes their tool requests, or changes source maps. All image/context references resolve locally; the viewer makes no third-party resource requests.

The site is a timestamped evidence snapshot. Refreshing experiment evidence requires rerunning the exporter and publishing a new source version. Database annotations are independent of deployment assets and persist across versions.

Sites uses `dist/server/index.js`, `dist/client`, and `dist/.openai/hosting.json`. The Worker initializes the annotation table on first API use. `npm run build` packages only static viewer assets and the Worker, not the local database or experiment credential files.

## Trajectory chat and autonomous comparison

`/chat.html?run=<run-id>` renders every actual input message and response per call in chronological order. System/user/tool messages appear on the left; assistant history and new model replies appear on the right. Repeated historical context is retained for request fidelity. `#call=0&focus=reply` jumps directly to a complete answer. Images and text are untruncated; long trajectories load progressively. Call annotations use the same database scopes as the step viewer.

`/compare.html` shows completed autonomous checkpoint maps, the shared evaluator metrics, and exportable SVG curves. Early-stop carry-forward points use open circles. Qwen/Gemma/Flash run Claude Code; Astra runs native Codex. This is a comparison of model plus agent framework, not an isolated weights ranking. API service aliases do not independently prove upstream weight versions.

Astra uses recorded native Responses requests after the explicit last-eight-image transform. The original request JSON remains available in addition to the role-based display. Provider-returned reasoning summaries are labeled as summaries, never as complete internal reasoning. No new inference is performed by the site.
