# PersonalWebMCP extension

The Chromium Manifest V3 extension runtime for PersonalWebMCP. It uses WXT,
React, a side panel, an isolated content script, and a MAIN-world script that
talks to `document.modelContext`.

Run it from the repository root with `pnpm dev:extension`, or create an
unpacked build with `pnpm --filter @personal-webmcp/extension build`.
