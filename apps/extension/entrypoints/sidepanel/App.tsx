import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActiveTabSnapshot,
  ActivityReceipt,
  DiscoveredWebMcpTool,
  JsonValue,
  PersonalToolRecord,
  TabCapabilityStatus,
  ToolCatalogPayload,
  ToolExecutionState,
} from '@personal-webmcp/contracts';
import { createIdleTeachSession } from '@personal-webmcp/contracts';
import { TeachPanel } from './teach-panel';

type PanelSection = 'overview' | 'teach' | 'tools' | 'activity' | 'repair';

const panelLabels: Record<PanelSection, string> = {
  overview: 'Overview',
  teach: 'Teach',
  tools: 'Tools',
  activity: 'Activity',
  repair: 'Repair',
};

const emptyStatus: TabCapabilityStatus = {
  supported: false,
  registered: false,
  pageTitle: '',
  url: '',
  updatedAt: 0,
};

const emptyCatalog: ToolCatalogPayload = {
  supported: false,
  pageTitle: '',
  url: '',
  tools: [],
};

const emptySnapshot: ActiveTabSnapshot = {
  status: emptyStatus,
  catalog: emptyCatalog,
  personalTools: [],
  receipts: [],
  teachSession: createIdleTeachSession(),
  enabled: false,
};

function DiscoveredToolCard({ tool }: { tool: DiscoveredWebMcpTool }) {
  return (
    <details className="tool-card">
      <summary>
        <div>
          <span className={`provenance ${tool.provenance.toLowerCase()}`}>{tool.provenance}</span>
          <strong>{tool.title}</strong>
          <code>{tool.name}</code>
        </div>
        <span aria-hidden="true">＋</span>
      </summary>
      <p>{tool.description}</p>
      <dl className="compact-list">
        <div><dt>Origin</dt><dd>{tool.origin}</dd></div>
        <div><dt>Read only</dt><dd>{tool.annotations?.readOnlyHint ? 'Yes' : 'No / unspecified'}</dd></div>
      </dl>
      <pre>{JSON.stringify(tool.inputSchema ?? {}, null, 2)}</pre>
    </details>
  );
}

interface PersonalToolCardProps {
  tool: PersonalToolRecord;
  registered: boolean;
  execution?: ToolExecutionState;
  onRun: (tool: PersonalToolRecord, input: Record<string, JsonValue>) => Promise<void>;
  onCancel: (invocationId: string) => Promise<void>;
}

function schemaProperties(tool: PersonalToolRecord): Record<string, Record<string, unknown>> {
  const properties = tool.inputSchema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  return Object.fromEntries(
    Object.entries(properties).filter((entry): entry is [string, Record<string, unknown>] => (
      Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1])
    )),
  );
}

function resultMessage(result: JsonValue | undefined): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  return typeof result.message === 'string' ? result.message : undefined;
}

function PersonalToolCard({ tool, registered, execution, onRun, onCancel }: PersonalToolCardProps) {
  const properties = schemaProperties(tool);
  const required = new Set(Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required.filter((name): name is string => typeof name === 'string') : []);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(
    Object.entries(properties).map(([name, schema]) => [name, typeof schema.default === 'boolean' ? schema.default : String(schema.default ?? '')]),
  ));
  const [localError, setLocalError] = useState('');
  const running = execution?.status === 'RUNNING';
  const fixedPreferences = tool.workflowGraph.nodes.filter((node) => node.config.valueSource === 'FIXED' && node.config.value !== undefined);

  const submit = async () => {
    const input: Record<string, JsonValue> = {};
    for (const [name, schema] of Object.entries(properties)) {
      const value = values[name];
      if ((value === '' || value === undefined) && required.has(name)) {
        setLocalError(`${name.replaceAll('_', ' ')} is required.`);
        return;
      }
      if (value === '' || value === undefined) continue;
      input[name] = schema.type === 'number' || schema.type === 'integer' ? Number(value) : value;
    }
    setLocalError('');
    try {
      await onRun(tool, input);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Tool execution failed.');
    }
  };

  return (
    <details className="tool-card personal-runner" open={true}>
      <summary>
        <div>
          <span className="provenance personal">{tool.provenance.type}</span>
          <strong>{tool.title}</strong>
          <code>{tool.webmcpName}</code>
        </div>
        <span aria-hidden="true">＋</span>
      </summary>
      <p>{tool.description}</p>
      {fixedPreferences.length > 0 && (
        <div className="runner-fixed">
          <span>REMEMBERED</span>
          {fixedPreferences.map((node) => (
            <p key={node.id}><strong>{node.label}:</strong> {String(node.config.value)}</p>
          ))}
        </div>
      )}
      {Object.keys(properties).length > 0 && (
        <div className="runner-fields">
          {Object.entries(properties).map(([name, schema]) => (
            <label key={name}>
              <span>{name.replaceAll('_', ' ')} {required.has(name) && <em>required</em>}</span>
              <input
                type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'}
                min={typeof schema.minimum === 'number' ? schema.minimum : undefined}
                value={String(values[name] ?? '')}
                placeholder={name === 'vendor' ? 'Try a different vendor' : 'Optional'}
                onChange={(event) => setValues((current) => ({ ...current, [name]: event.target.value }))}
                disabled={running}
              />
            </label>
          ))}
        </div>
      )}
      <div className="runner-actions">
        <button className="primary-button" type="button" onClick={() => void submit()} disabled={!registered || running}>
          {running ? 'Running visible steps…' : 'Run on visible page'}
        </button>
        {running && execution && (
          <button className="cancel-button" type="button" onClick={() => void onCancel(execution.invocationId)}>Cancel</button>
        )}
      </div>
      {!registered && <p className="runner-note">Open this tool’s starting page in a WebMCP-enabled Chrome tab to run it.</p>}
      {execution && execution.status !== 'RUNNING' && (
        <p className={`run-result ${execution.status.toLowerCase()}`}>
          {execution.status === 'SUCCEEDED' ? resultMessage(execution.result) || 'Workflow completed.' : execution.error || execution.status}
        </p>
      )}
      {localError && <p className="error runner-note" role="alert">{localError}</p>}
      <dl className="compact-list">
        <div><dt>Scope</dt><dd>{tool.scope.origin}</dd></div>
        <div><dt>Version</dt><dd>{tool.version}</dd></div>
        <div><dt>Workflow nodes</dt><dd>{tool.workflowGraph.nodes.length}</dd></div>
        <div><dt>Health</dt><dd>{tool.health.state.replaceAll('_', ' ')}</dd></div>
      </dl>
      <details className="contract-details">
        <summary>View generated contract</summary>
        <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
      </details>
    </details>
  );
}

function ReceiptRow({ receipt }: { receipt: ActivityReceipt }) {
  return (
    <article className="receipt">
      <div>
        <span className={`receipt-status ${receipt.status.toLowerCase()}`}>{receipt.status}</span>
        <strong>{receipt.toolId}</strong>
      </div>
      <p>{new Date(receipt.finishedAt).toLocaleString()} · {receipt.durationMs} ms</p>
      {receipt.selectedLocators.length > 0 && <p>{receipt.selectedLocators.length} visible targets resolved</p>}
      {resultMessage(receipt.result) && <p>{resultMessage(receipt.result)}</p>}
      {receipt.error && <p className="error">{receipt.error}</p>}
    </article>
  );
}

export default function App() {
  const [section, setSection] = useState<PanelSection>('overview');
  const [snapshot, setSnapshot] = useState<ActiveTabSnapshot>(emptySnapshot);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const next = await browser.runtime.sendMessage({ type: 'GET_PANEL_SNAPSHOT' }) as ActiveTabSnapshot;
      setSnapshot(next ?? emptySnapshot);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not read the active tab.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 1500);
    const onMessage = (message: { type?: string }) => {
      if (['WEBMCP_STATUS', 'WEBMCP_CATALOG', 'TEACH_STATE_CHANGED', 'TOOL_EXECUTION_CHANGED', 'PERSONAL_TOOLS_CHANGED'].includes(message.type ?? '')) void refresh();
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => {
      window.clearInterval(intervalId);
      browser.runtime.onMessage.removeListener(onMessage);
    };
  }, [refresh]);

  const nativeTools = useMemo(
    () => snapshot.catalog.tools.filter((tool) => tool.provenance === 'NATIVE'),
    [snapshot.catalog.tools],
  );
  const registeredPersonalTools = useMemo(
    () => snapshot.catalog.tools.filter((tool) => tool.provenance === 'PERSONAL'),
    [snapshot.catalog.tools],
  );
  const personalTools = useMemo(
    () => snapshot.personalTools.filter((tool) => tool.provenance.type !== 'SYSTEM'),
    [snapshot.personalTools],
  );

  const isRegistered = (tool: PersonalToolRecord) => registeredPersonalTools.some((registered) => registered.name === tool.webmcpName);

  const runPersonalTool = async (tool: PersonalToolRecord, input: Record<string, JsonValue>) => {
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'RUN_PERSONAL_TOOL', toolId: tool.id, input });
      await refresh();
    } catch (error) {
      await refresh();
      throw error;
    }
  };

  const cancelPersonalTool = async (invocationId: string) => {
    setActionError('');
    await browser.runtime.sendMessage({ type: 'CANCEL_PERSONAL_TOOL', invocationId });
    window.setTimeout(() => void refresh(), 150);
  };

  const runSelfTest = async () => {
    setBusy(true);
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'RUN_PING_SELF_TEST' });
      window.setTimeout(() => void refresh(), 500);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Connection check failed.');
    } finally {
      setBusy(false);
    }
  };

  const enableOrigin = async () => {
    if (!snapshot.origin) return;
    setBusy(true);
    setActionError('');
    try {
      const granted = await browser.permissions.request({ origins: [`${snapshot.origin}/*`] });
      if (!granted) {
        setActionError('Site access was not granted.');
        return;
      }
      await browser.runtime.sendMessage({ type: 'ENABLE_ORIGIN', origin: snapshot.origin });
      window.setTimeout(() => void refresh(), 500);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not enable this site.');
    } finally {
      setBusy(false);
    }
  };

  const clearActivity = async () => {
    setBusy(true);
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'CLEAR_ACTIVITY_HISTORY' });
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not clear activity.');
    } finally {
      setBusy(false);
    }
  };

  let host = 'Open a web page';
  try {
    host = snapshot.status.url ? new URL(snapshot.status.url).host : host;
  } catch {
    // Keep the readable fallback for malformed or unavailable tab URLs.
  }

  const totalTools = nativeTools.length + personalTools.length;

  return (
    <main>
      <header>
        <div className="brand-mark" aria-hidden="true">P</div>
        <div>
          <p className="overline">CAPABILITY LAYER</p>
          <h1>PersonalWebMCP</h1>
        </div>
        <span className={snapshot.status.supported ? 'support supported' : 'support'}>
          {snapshot.status.supported ? 'Available' : 'Unavailable'}
        </span>
      </header>

      <nav aria-label="PersonalWebMCP sections">
        {(['overview', 'teach', 'tools', 'activity', 'repair'] as const).map((item) => (
          <button
            className={section === item ? 'active' : ''}
            type="button"
            aria-current={section === item ? 'page' : undefined}
            onClick={() => setSection(item)}
            key={item}
          >
            {panelLabels[item]}
          </button>
        ))}
      </nav>

      <section className="site-summary">
        <p className="overline">CURRENT SITE</p>
        <div className="site-row">
          <div>
            <strong>{host}</strong>
            <span>{snapshot.path || snapshot.status.pageTitle || 'No permitted page is active'}</span>
          </div>
          <span className="tool-count">{totalTools} {totalTools === 1 ? 'tool' : 'tools'}</span>
        </div>
      </section>

      {actionError && <p className="notice error" role="alert">{actionError}</p>}

      {!snapshot.enabled && snapshot.origin && (
        <section className="permission-card">
          <p className="overline">SITE ACCESS</p>
          <h2>Enable PersonalWebMCP here</h2>
          <p>Grant access only to <strong>{snapshot.origin}</strong>. Other sites remain inaccessible.</p>
          <button className="primary-button" type="button" onClick={enableOrigin} disabled={busy}>
            {busy ? 'Enabling…' : 'Enable this site'}
          </button>
        </section>
      )}

      {section === 'overview' && (
        <>
          <section className="bridge-card">
            <div className="bridge-heading">
              <span className="number">01</span>
              <div>
                <h2>WebMCP bridge</h2>
                <p>
                  {snapshot.status.registered
                    ? 'Personal tools are registered in the visible page.'
                    : 'Waiting for a permitted WebMCP-enabled page.'}
                </p>
              </div>
            </div>

            <dl>
              <div><dt>Page API</dt><dd>{snapshot.status.supported ? 'Detected' : 'Not detected'}</dd></div>
              <div><dt>Native tools</dt><dd>{nativeTools.length}</dd></div>
              <div><dt>Personal tools</dt><dd>{personalTools.length}</dd></div>
              <div><dt>Registration</dt><dd>{snapshot.status.registered ? 'Active' : 'Inactive'}</dd></div>
            </dl>

            {snapshot.status.error && <p className="error" role="alert">{snapshot.status.error}</p>}

            <button
              className="primary-button"
              type="button"
              onClick={runSelfTest}
              disabled={!snapshot.status.registered || busy}
            >
              {busy ? 'Running…' : 'Run connection check'}
            </button>
          </section>

          <section className="section-block">
            <div className="section-heading">
              <div><p className="overline">PERSONAL</p><h2>Available capabilities</h2></div>
              <button className="text-button" type="button" onClick={() => setSection('teach')}>Teach new</button>
            </div>
            {personalTools.length > 0
              ? personalTools.map((tool) => (
                <PersonalToolCard
                  tool={tool}
                  registered={isRegistered(tool)}
                  execution={snapshot.activeExecution?.toolId === tool.id ? snapshot.activeExecution : undefined}
                  onRun={runPersonalTool}
                  onCancel={cancelPersonalTool}
                  key={tool.id}
                />
              ))
              : <p className="empty-copy">No personal capabilities are scoped to this origin.</p>}
          </section>
        </>
      )}

      {section === 'teach' && (
        <TeachPanel
          session={snapshot.teachSession}
          enabled={snapshot.enabled}
          onSessionChange={(teachSession) => setSnapshot((current) => ({ ...current, teachSession }))}
          onSaved={async () => { await refresh(); setSection('tools'); }}
        />
      )}

      {section === 'tools' && (
        <section className="section-block flush">
          <div className="section-heading">
            <div><p className="overline">WEBSITE-OWNED</p><h2>Native tools · {nativeTools.length}</h2></div>
          </div>
          {nativeTools.length > 0
            ? nativeTools.map((tool) => <DiscoveredToolCard tool={tool} key={`${tool.origin}:${tool.name}`} />)
            : <p className="empty-copy">This page currently exposes no native WebMCP tools.</p>}

          <div className="section-heading divided">
            <div><p className="overline">USER-OWNED</p><h2>Personal tools · {personalTools.length}</h2></div>
          </div>
          {personalTools.map((tool) => (
            <PersonalToolCard
              tool={tool}
              registered={isRegistered(tool)}
              execution={snapshot.activeExecution?.toolId === tool.id ? snapshot.activeExecution : undefined}
              onRun={runPersonalTool}
              onCancel={cancelPersonalTool}
              key={tool.id}
            />
          ))}
          {personalTools.length === 0 && (
            <p className="empty-copy">No saved personal tools match this origin.</p>
          )}
          {registeredPersonalTools.filter((tool) => tool.name !== 'personal_ping').length !== personalTools.length && (
            <p className="hint">Registered and stored counts may briefly differ while the page catalog refreshes.</p>
          )}
        </section>
      )}

      {section === 'activity' && (
        <section className="section-block flush">
          <div className="section-heading">
            <div><p className="overline">LOCAL RECEIPTS</p><h2>Recent activity · {snapshot.receipts.length}</h2></div>
            {snapshot.receipts.length > 0 && (
              <button className="text-button danger-button" type="button" onClick={clearActivity} disabled={busy}>
                Clear
              </button>
            )}
          </div>
          {snapshot.receipts.length > 0
            ? snapshot.receipts.map((receipt) => <ReceiptRow receipt={receipt} key={receipt.id} />)
            : <p className="empty-copy">Successful and failed tool runs will appear here.</p>}
        </section>
      )}

      {section === 'repair' && (
        <section className="section-block flush">
          <div className="section-heading">
            <div><p className="overline">HEALTH</p><h2>Capability repair</h2></div>
          </div>
          {personalTools.map((tool) => (
            <article className="health-row" key={tool.id}>
              <span className={`health-dot ${tool.health.state.toLowerCase()}`} />
              <div><strong>{tool.title}</strong><p>{tool.health.state.replaceAll('_', ' ')}</p></div>
              <span>{tool.health.confidence ?? '—'}{tool.health.confidence !== undefined ? '%' : ''}</span>
            </article>
          ))}
          <p className="hint">Repair proposals and revision restore controls arrive with semantic execution in Step 9.</p>
        </section>
      )}

      <p className="hint">
        Tool metadata stays local. Site access is granted one origin at a time.
      </p>
    </main>
  );
}
