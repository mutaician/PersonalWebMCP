# PersonalWebMCP guided manual verification

This is the browser test guide for the current implementation. Automated checks only prove that the TypeScript, demo, and extension packages build; they do not prove WebMCP behavior.

## Test environment

- Chromium 149 or newer.
- `chrome://flags/#enable-webmcp-testing` enabled, followed by a full browser restart.
- Demo running at `http://localhost:3000` with `pnpm dev:demo`, or the current deployed URL.
- Unpacked extension loaded from `apps/extension/.output/chrome-mv3`.
- Chrome DevTools → Application → WebMCP available on the tested page.

Use the DevTools WebMCP panel for deterministic registration and execution checks. Treat a natural-language call from an agent as a separate submission check: the inspector proves the tool works, but it is not itself an agent.

## Clean reset

1. Open `chrome://extensions`.
2. Remove PersonalWebMCP to clear its local registry, revisions, receipts, and granted origins.
3. Run `pnpm build` from the repository root.
4. Select **Load unpacked** and choose `apps/extension/.output/chrome-mv3`.
5. Open a fresh demo tab and grant access only when the side panel asks.

For an ordinary code update that does not require clearing saved tools, use the extension card's **Reload** button and reload the demo tab.

## 1. Installation and permission boundary

1. Open `http://localhost:3000` and the PersonalWebMCP side panel.
2. Confirm the panel offers **Enable this site** before it reports the origin as enabled.
3. Grant access and reload once if Chrome requests it.
4. Confirm **Page API: Detected**, **Registration: Active**, and run **Run connection check**.
5. Open another HTTP(S) origin that has not been enabled. Confirm the extension asks separately and does not expose saved localhost capabilities there.

Expected: `personal_ping` appears in DevTools and returns the visible page title and URL. No broad-origin permission is silently granted.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 2. Native discovery and live refresh

1. Open `/configurator` and reload the page.
2. In side panel → Tools, confirm five website-owned `configurator_*` tools appear.
3. In DevTools → Application → WebMCP, invoke `configurator_set_product`, then size, finish, options, and quantity with valid arguments.
4. Confirm each invocation changes the same visible configurator state as its matching human control.
5. Navigate to `/travel` and confirm the catalog changes to `travel_search_trips` and `travel_get_trip_detail` without reinstalling the extension.

Expected: native tool discovery follows the visible document and `toolchange`/navigation updates do not leave configurator tools registered on the travel page.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 3. Legacy teach, compile, and parameterized run

1. Open `/legacy`, choose **Invoice Register**, and clear all filters.
2. Start teaching in the side panel.
3. Set Vendor to **Cobalt Safety Group**, Status to **Unpaid**, Minimum Amount to `1000`, Sort By to **Newest First**, select the first result, and open it.
4. Finish teaching. Keep Vendor and Minimum Amount as parameters; keep Status and Sort fixed.
5. Name the tool `personal_open_latest_unpaid_invoice`, test the generated contract, and save it.
6. Return to the exact starting surface: `/legacy` with **Invoice Register** visible and filters cleared.
7. Run the saved tool with another vendor and amount that exist in the demo.

Expected: one separately stored personal tool is registered through WebMCP, accepts typed inputs, visibly applies the filters, and opens the matching invoice. Starting from Dashboard or another module is currently expected to fail safely rather than invent navigation.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 4. Persistence and scope

1. Reload `/legacy`; confirm the saved capability remains.
2. Restart Chrome; reopen the permitted origin and confirm it remains available.
3. Navigate to `/configurator`; confirm the legacy capability is not registered there when its path rule does not match.
4. Return to `/legacy`; confirm it re-registers.

Expected: saved definitions persist locally and registration follows origin, path, health, and native prerequisites.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 5. Repair lifecycle

1. Create a short legacy invoice capability in the classic portal.
2. Switch to **New Portal** and run it from the equivalent Invoices surface.
3. Record whether the target is resolved automatically, offered as an approval candidate, or sent to guided selection.
4. For an approval candidate, inspect its score evidence, approve it, and retest.
5. For guided selection, choose the intended visible control, then retest.
6. Restore an earlier revision and confirm a new current version is created.

Expected: high-confidence repair occurs only after validation; ambiguous targets wait for approval; unresolved targets do not click and become Broken/guided. Repair and restore actions appear in revision history.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 6. Native configurator composition

1. Open `/configurator` and side panel → Tools → Compose.
2. Choose **Start with all configurator tools**.
3. Set product, size, finish, and options as remembered values. Expose quantity as a parameter.
4. Save as `personal_make_my_usual`.
5. Reset the visible design, then run the personal capability with quantity `2`.

Expected: the composite is marked COMPOSITE, lists its native dependencies, and visibly applies every saved preference through `document.modelContext.executeTool`.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 7. Hybrid travel and human checkpoint

1. Open `/travel`; confirm the two website-owned travel tools are present.
2. Invoke `travel_search_trips` and `travel_get_trip_detail` once from DevTools. Confirm search state and the detail drawer update visibly.
3. With the drawer open, teach only the missing UI behavior: choose a Seat preference and click **Save itinerary**. Compile it as a separate personal preference capability.
4. In Tools → Compose, choose **Start hybrid trip flow**, add the learned preference capability, move it before **Review before booking**, and save `personal_prepare_my_trip`.
5. Reset the travel page and run the composite.
6. Confirm it pauses with a HUMAN CHECKPOINT in the side panel. Test **Reject** once and **Approve and continue** once.

Expected: native search/detail tools do the site-owned work, only the missing seat/save interaction uses the learned capability, and execution cannot pass the checkpoint without a recorded human decision.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 8. Failure and cancellation behavior

1. Invoke a saved tool with a required argument omitted, a number outside its schema range, and an undeclared argument.
2. Run a legacy tool from the wrong module or path.
3. Start a visible learned workflow and press **Cancel** before it finishes where timing permits.
4. Begin guided repair, press Escape, and confirm page highlighting is removed.

Expected: invalid arguments are rejected before acting; missing targets do not trigger guessed clicks; cancellation stops remaining nodes; temporary overlays are cleaned up.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 9. Activity, provenance, and sensitive fields

1. Review successful, failed, cancelled, approved, and rejected runs in Activity.
2. Confirm tool cards show TAUGHT or COMPOSITE provenance, risk, health, version, and native dependencies.
3. Start teaching on any page containing a password, OTP, or payment-card-style control. Interact with that field, then finish teaching.
4. Confirm it is counted as sensitive/skipped and its value is absent from the captured workflow, generated contract, and activity input summary.

Expected: receipts remain local, human decisions are distinct from run status, and sensitive values never enter durable extension storage.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## 10. Agent-call evidence for submission

1. Use a Chrome agent surface that has WebMCP access; do not use DevTools invocation for this particular check.
2. Keep the PersonalWebMCP side panel visible and open the correct starting page.
3. Ask the agent to perform the capability by intent, without giving it DOM instructions or the tool name first.
4. Capture the agent selecting and calling the personal tool, the visible page changing, and the returned result.
5. For the travel composite, capture the agent waiting while the human approves the checkpoint.

Suggested prompts:

- “Configure my usual workspace for two desks.”
- “Prepare my usual trip from Nairobi to Lisbon, but wait for me before continuing.”
- “Open the latest unpaid Cobalt Safety Group invoice above $1,000.”

Expected: at least one agent selects a registered personal capability from its name, description, and schema and completes it successfully. If Chrome currently exposes only the DevTools inspector in your account, mark this check blocked rather than treating an inspector click as agent evidence.

Result: [ ] Pass  [ ] Fail  [ ] Blocked  Notes: __________________

## 11. Clean-profile and live-link check

1. Build and zip the extension from the final commit.
2. On another Chrome profile or machine, enable WebMCP, install the unpacked build, and open the deployed URL in an incognito/fresh session.
3. Grant the deployed origin, then repeat connection, one native invocation, and one personal invocation.
4. Confirm no localhost URL, cached login, expired tunnel, or pre-existing extension storage is required.

Expected: the public demo loads independently and the packaged extension can enable that exact origin.

Result: [ ] Pass  [ ] Fail  Notes: ______________________________

## Final record

Chrome version: ____________________

Extension commit: __________________

Demo URL: __________________________

Tester/date: ________________________

Known failures to revisit after Step 13:

1. ____________________________________________________________
2. ____________________________________________________________
3. ____________________________________________________________
