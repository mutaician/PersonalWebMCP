# PersonalWebMCP

PersonalWebMCP is a Chromium extension that lets a user teach a browser
workflow once, compile it into a typed personal capability, and expose it to
agents through WebMCP. The local demo covers legacy sites, native WebMCP tool
composition, and a hybrid travel workflow.

The project is under active local development. The current vertical slice
proves the extension boundary: an isolated content script injects a
MAIN-world runtime, registers `personal_ping` with `document.modelContext`,
and reports capability state to the side panel.

## Prerequisites

- Node.js 24 or newer
- pnpm 11.5.1 or newer
- Chrome or Chromium 149 or newer with `chrome://flags/#enable-webmcp-testing`
  enabled for local WebMCP development

## Local setup

```bash
pnpm install
pnpm typecheck
pnpm build
```

Start the demo and extension development builds together:

```bash
pnpm dev
```

The demo is served at `http://localhost:3000`. Load the generated extension
from `apps/extension/.output/chrome-mv3` through `chrome://extensions` with
Developer mode and **Load unpacked**.

Open the demo, click the PersonalWebMCP toolbar action to open the side panel,
and run **Run connection check**. A supported browser reports WebMCP as
available and confirms that `personal_ping` was registered and executed.

## Workspace

- `apps/demo` — controlled demo website and scenarios
- `apps/extension` — WXT Manifest V3 extension and side panel
- `packages/contracts` — typed page/extension bridge messages
- `packages/webmcp` — WebMCP registration and discovery helpers
- `packages/engine` — workflow graph primitives used by taught capabilities

## Checks

The automated baseline intentionally stays small:

```bash
pnpm typecheck
pnpm build
pnpm zip:extension
```

Browser behavior is verified through the guided manual flows documented as
the implementation progresses.
