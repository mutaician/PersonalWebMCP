# PersonalWebMCP manual verification

This guide is for anyone evaluating the repository or preparing a release. It verifies the product in a real WebMCP-enabled browser; the TypeScript and build checks alone cannot prove tool registration or visible execution.

## Before testing

You need:

- the current PersonalWebMCP extension build loaded unpacked;
- Chrome/Chromium with `chrome://flags/#enable-webmcp-testing` enabled;
- the [live demo](https://personal-webmcp.mutaician.chatgpt.site) or `http://localhost:3000`;
- optionally, Chrome's [Model Context Tool Inspector](https://chromewebstore.google.com/detail/webmcp-model-context-tool/gbpdfapgefenggkahomfgkhfehlcenpd) for natural-language agent calls.

For the quickest evaluation, [download the prebuilt v0.1.0 Chrome extension](https://github.com/mutaician/PersonalWebMCP/releases/download/v0.1.0/personal-webmcp-0.1.0-chrome.zip), extract it, then load the extracted folder containing `manifest.json` from `chrome://extensions` with Developer mode enabled. No login, package installation, API key, or build step is required.

To verify from source instead:

```bash
pnpm install
pnpm typecheck
pnpm build
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions`. After changing extension code, reload the extension and the tested page.

## 1. Installation and connection

1. Open the demo homepage and the PersonalWebMCP side panel.
2. Grant access only to the displayed origin.
3. Reload the page once if Chrome requests it.
4. Select **Run connection check**.

Pass when the side panel reports that WebMCP is available and `personal_ping` completed. An unrelated origin must request permission separately.

Result: [ ] Pass  [ ] Fail

## 2. Teach a capability on a legacy site

1. Open `/legacy?module=invoices&variant=classic`.
2. Confirm the side panel reports zero website-owned native tools.
3. Start teaching and perform this visible workflow:
   - Vendor: **Cobalt Safety Group**
   - Status: **Unpaid**
   - Minimum Amount: `1000`
   - Sort: change to **Oldest First**, then back to **Newest First**
   - Select the first result and open the record
4. Finish teaching.
5. Set `vendor` and `min_amount` to **Ask each run**. Keep status and sort remembered.
6. Save the tool as `personal_open_latest_unpaid_invoice`.
7. Navigate to another legacy module, such as Document Archive.
8. Run the saved tool with Vendor `Acme Industrial Supply` and Minimum Amount `5000`.

Pass when PersonalWebMCP restores the Invoice Register context, applies the new values, and opens `INV-2041`. The generated schema must contain the two agent inputs and must not hard-code a currency amount, invoice ID, or recorded result row.

Agent check:

> Open the newest unpaid invoice from Acme Industrial Supply above $5,000.

Pass when the agent selects the personal tool and the invocation supplies structured `vendor` and `min_amount` arguments.

Result: [ ] Pass  [ ] Fail

## 3. Personalize and extend native WebMCP tools

1. Open `/configurator` and reset the design.
2. Confirm five website-owned `configurator_*` tools appear.
3. Run at least one native tool from the side panel and confirm its typed input changes the visible design.
4. Confirm the website has no native tool for **Add to project**.
5. Teach only the **Add to project** action and save it as `personal_add_design_to_project`.
6. Change the design so its price differs, then run the taught tool again.

Pass when the taught action still finds the button without depending on its changing price and the page reports `Design added to project board`.

Now create a composite:

1. Select **Start with all configurator tools**.
2. Remember these values:
   - Product: `studio-table`
   - Size: `180`
   - Finish: `walnut`
   - Options: `cable-tray` and `monitor-shelf`
3. Set Quantity to **Agent input** with input name `quantity`.
4. Add the personal **Add current design to project** tool as the final step.
5. Save as `personal_prepare_my_studio_workspace`.
6. Reset the configurator and run it with Quantity `3`.

Pass when the composite visibly applies every preference, sets quantity to three, and completes the taught project action. Its schema should expose only `quantity`, while its provenance lists native and personal dependencies.

Agent check:

> Prepare my usual studio workspace for three people and add it to my project.

Pass when the agent invokes the composite with `{ "quantity": 3 }` and the complete visible workflow succeeds.

Result: [ ] Pass  [ ] Fail

## 4. Persistence, scope, and refresh

1. Reload the current page and confirm saved personal tools remain available.
2. Save a new taught or composite tool and confirm it becomes runnable without manually reloading the page.
3. Move between `/legacy`, `/configurator`, and `/travel`.
4. Confirm tools register only where their origin, path, health, and native prerequisites match.

Pass when saved tools persist locally, the catalog refreshes after saving, and tools from one demo do not appear as executable on an unrelated path.

Result: [ ] Pass  [ ] Fail

## 5. Semantic repair

1. Save a working invoice capability in the classic portal.
2. Switch to **New Portal** and run it against the equivalent invoice workflow.
3. Inspect the tool's version/repair information.

Pass when a high-confidence semantic match executes only after its outcome is verified. Ambiguous targets must wait for approval or guided selection; unresolved targets must stop rather than guess.

Result: [ ] Pass  [ ] Fail

## 6. Safety and failure behavior

Verify that:

- missing required inputs are rejected before execution;
- cancellation stops remaining workflow steps;
- consequential composites pause at their human confirmation step;
- password, OTP, payment-card, token, and secret-like values are not retained in recorded tools or run summaries;
- successful and failed runs produce readable side-panel feedback.

Result: [ ] Pass  [ ] Fail

## 7. Public release check

Use a clean Chrome profile or another machine:

1. Load the final extension build.
2. Open the deployed URL in a fresh window.
3. Grant that deployed origin.
4. Repeat the connection check, one native invocation, and both agent prompts above.
5. Confirm no localhost URL, cached login, existing storage, or private credential is required.

Result: [ ] Pass  [ ] Fail

## Test record

- Chrome version: ______________________________
- Extension revision: __________________________
- Demo URL: ___________________________________
- Tester/date: _________________________________
- Notes: ______________________________________
