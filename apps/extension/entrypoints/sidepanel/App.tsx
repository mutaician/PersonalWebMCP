import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ActiveTabSnapshot,
  DiscoveredWebMcpTool,
  JsonValue,
  PersonalToolRecord,
  RepairProposal,
  TabCapabilityStatus,
  ToolCatalogPayload,
  ToolExecutionState,
  ToolRevision,
} from '@personal-webmcp/contracts';
import { createIdleTeachSession } from '@personal-webmcp/contracts';
import { TeachPanel } from './teach-panel';
import { ComposePanel } from './compose-panel';

type PanelSection = 'overview' | 'teach' | 'tools' | 'repair';

const panelLabels: Record<PanelSection, string> = {
  overview: 'Overview',
  teach: 'Teach',
  tools: 'Tools',
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
  repairs: [],
  revisions: [],
  teachSession: createIdleTeachSession(),
  enabled: false,
};

function propertiesFromSchema(schema: Record<string, unknown> | undefined): Record<string, Record<string, unknown>> {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  return Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, Record<string, unknown>] => (
    Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1])
  )));
}

function initialSchemaValues(schema: Record<string, unknown> | undefined): Record<string, string | boolean> {
  return Object.fromEntries(Object.entries(propertiesFromSchema(schema)).map(([name, property]) => {
    if (typeof property.default === 'boolean') return [name, property.default];
    if (Array.isArray(property.default)) return [name, property.default.join(',')];
    return [name, String(property.default ?? '')];
  }));
}

function buildSchemaInput(
  schema: Record<string, unknown> | undefined,
  values: Record<string, string | boolean>,
): Record<string, JsonValue> {
  const input: Record<string, JsonValue> = {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required.filter((name): name is string => typeof name === 'string') : []);
  for (const [name, property] of Object.entries(propertiesFromSchema(schema))) {
    const value = values[name];
    if ((value === '' || value === undefined) && required.has(name)) throw new Error(`${name.replaceAll('_', ' ')} is required.`);
    if (value === '' || value === undefined) continue;
    input[name] = property.type === 'number' || property.type === 'integer'
      ? Number(value)
      : property.type === 'array'
        ? String(value).split(',').map((item) => item.trim()).filter(Boolean)
        : value;
  }
  return input;
}

function SchemaField({
  name,
  schema,
  value,
  required,
  disabled,
  onChange,
}: {
  name: string;
  schema: Record<string, unknown>;
  value: string | boolean | undefined;
  required: boolean;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const enumValues = Array.isArray(schema.enum) ? schema.enum.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number') : [];
  const itemSchema = schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items) ? schema.items as Record<string, unknown> : undefined;
  const arrayEnum = Array.isArray(itemSchema?.enum) ? itemSchema.enum.filter((item): item is string => typeof item === 'string') : [];
  const selectedArray = new Set(String(value ?? '').split(',').filter(Boolean));
  return (
    <label className={schema.type === 'array' && arrayEnum.length > 0 ? 'wide-field' : undefined}>
      <span>{name.replaceAll('_', ' ')} {required && <em>required</em>}</span>
      {schema.type === 'boolean' ? (
        <input className="runner-checkbox" type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      ) : enumValues.length > 0 ? (
        <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">Select {name.replaceAll('_', ' ')}</option>
          {enumValues.map((option) => <option value={String(option)} key={String(option)}>{String(option)}</option>)}
        </select>
      ) : schema.type === 'array' && arrayEnum.length > 0 ? (
        <span className="enum-checks">{arrayEnum.map((option) => <span key={option}><input type="checkbox" checked={selectedArray.has(option)} onChange={(event) => { const next = new Set(selectedArray); if (event.target.checked) next.add(option); else next.delete(option); onChange([...next].join(',')); }} disabled={disabled} />{option}</span>)}</span>
      ) : (
        <input type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'} min={typeof schema.minimum === 'number' ? schema.minimum : undefined} max={typeof schema.maximum === 'number' ? schema.maximum : undefined} value={String(value ?? '')} placeholder={schema.type === 'array' ? 'Comma-separated values' : `Enter ${name.replaceAll('_', ' ')}`} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
      )}
      {typeof schema.description === 'string' && <small>{schema.description}</small>}
    </label>
  );
}

function DiscoveredToolCard({ tool, onRun }: { tool: DiscoveredWebMcpTool; onRun: (tool: DiscoveredWebMcpTool, input: Record<string, JsonValue>) => Promise<JsonValue> }) {
  const schema = tool.inputSchema ?? {};
  const properties = propertiesFromSchema(schema);
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === 'string') : []);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => initialSchemaValues(schema));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<JsonValue>();
  const [error, setError] = useState('');
  const submit = async () => {
    setRunning(true);
    setError('');
    setResult(undefined);
    try {
      const input = buildSchemaInput(schema, values);
      setResult(await onRun(tool, input));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Native tool execution failed.');
    } finally {
      setRunning(false);
    }
  };
  return (
    <details className="tool-card native-runner">
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
      {Object.keys(properties).length > 0 ? <div className="runner-fields">{Object.entries(properties).map(([name, property]) => <SchemaField name={name} schema={property} value={values[name]} required={required.has(name)} disabled={running} onChange={(value) => setValues((current) => ({ ...current, [name]: value }))} key={name} />)}</div> : <p className="runner-note">This tool does not require input.</p>}
      <div className="runner-actions"><button className="primary-button" type="button" onClick={() => void submit()} disabled={running}>{running ? 'Running native tool…' : 'Run native tool'}</button></div>
      {error && <p className="run-result failed" role="alert">{error}</p>}
      {result !== undefined && <pre className="native-result">{JSON.stringify(result, null, 2)}</pre>}
      <details className="contract-details"><summary>View input schema</summary><pre>{JSON.stringify(schema, null, 2)}</pre></details>
    </details>
  );
}

interface PersonalToolCardProps {
  tool: PersonalToolRecord;
  registered: boolean;
  execution?: ToolExecutionState;
  onRun: (tool: PersonalToolRecord, input: Record<string, JsonValue>) => Promise<void>;
  onCancel: (invocationId: string) => Promise<void>;
  onConfirm: (invocationId: string, approved: boolean) => Promise<void>;
  onDelete: (tool: PersonalToolRecord) => Promise<void>;
}

function schemaProperties(tool: PersonalToolRecord): Record<string, Record<string, unknown>> {
  return propertiesFromSchema(tool.inputSchema);
}

function resultMessage(result: JsonValue | undefined): string | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;
  return typeof result.message === 'string' ? result.message : undefined;
}

function PersonalToolCard({ tool, registered, execution, onRun, onCancel, onConfirm, onDelete }: PersonalToolCardProps) {
  const properties = schemaProperties(tool);
  const required = new Set(Array.isArray(tool.inputSchema.required) ? tool.inputSchema.required.filter((name): name is string => typeof name === 'string') : []);
  const [values, setValues] = useState<Record<string, string | boolean>>(() => initialSchemaValues(tool.inputSchema));
  const [localError, setLocalError] = useState('');
  const running = execution?.status === 'RUNNING' || execution?.status === 'AWAITING_CONFIRMATION';
  const awaitingConfirmation = execution?.status === 'AWAITING_CONFIRMATION';
  const fixedPreferences = tool.workflowGraph.nodes.filter((node) => node.config.valueSource === 'FIXED' && node.config.value !== undefined);

  const submit = async () => {
    setLocalError('');
    try {
      const input = buildSchemaInput(tool.inputSchema, values);
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
          {Object.entries(properties).map(([name, schema]) => <SchemaField name={name} schema={schema} value={values[name]} required={required.has(name)} disabled={running} onChange={(value) => setValues((current) => ({ ...current, [name]: value }))} key={name} />)}
        </div>
      )}
      <div className="runner-actions">
        <button className="primary-button" type="button" onClick={() => void submit()} disabled={!registered || running}>
          {running ? 'Running visible steps…' : 'Run on visible page'}
        </button>
        {execution?.status === 'RUNNING' && (
          <button className="cancel-button" type="button" onClick={() => void onCancel(execution.invocationId)}>Cancel</button>
        )}
      </div>
      {awaitingConfirmation && execution?.confirmation && (
        <div className="confirmation-card" role="alert">
          <span>HUMAN CHECKPOINT</span>
          <strong>{execution.confirmation.label}</strong>
          <p>{execution.confirmation.summary}</p>
          <div><button type="button" onClick={() => void onConfirm(execution.invocationId, false)}>Reject</button><button className="primary-button" type="button" onClick={() => void onConfirm(execution.invocationId, true)}>Approve and continue</button></div>
        </div>
      )}
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
        <div><dt>Risk</dt><dd>{tool.annotations.riskClass.replaceAll('_', ' ')}</dd></div>
        <div><dt>Dependencies</dt><dd>{tool.provenance.nativeDependencies.join(', ') || 'Visible page only'}</dd></div>
      </dl>
      <div className="runner-management">
        <span>Each taught workflow is stored separately.</span>
        <button type="button" onClick={() => void onDelete(tool)} disabled={running}>Delete tool</button>
      </div>
      <details className="contract-details">
        <summary>View generated contract</summary>
        <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
      </details>
    </details>
  );
}

function RepairProposalCard({
  proposal,
  onApprove,
  onReject,
  onGuide,
}: {
  proposal: RepairProposal;
  onApprove: (proposalId: string, candidateIndex: number) => Promise<void>;
  onReject: (proposalId: string) => Promise<void>;
  onGuide: (proposalId: string) => Promise<void>;
}) {
  return (
    <article className="repair-card">
      <div className="repair-card-heading">
        <span className={`repair-state ${proposal.status.toLowerCase()}`}>{proposal.status.replaceAll('_', ' ')}</span>
        <div><strong>{proposal.toolTitle}</strong><p>{proposal.nodeLabel}</p></div>
      </div>
      <p>{proposal.error}</p>
      {proposal.status === 'AWAITING_APPROVAL' && proposal.candidates.map((candidate, index) => (
        <div className="repair-candidate" key={`${proposal.id}:${index}`}>
          <div><strong>{candidate.preview}</strong><span>{candidate.score}/100 confidence</span></div>
          <ul>{candidate.evidence.map((item) => <li key={item.category}>{item.points > 0 ? `+${item.points}` : 'USER'} · {item.detail}</li>)}</ul>
          <button type="button" onClick={() => void onApprove(proposal.id, index)}>Approve this target</button>
        </div>
      ))}
      <div className="repair-actions">
        {proposal.status === 'AWAITING_APPROVAL' && <button type="button" onClick={() => void onReject(proposal.id)}>Reject all</button>}
        {(proposal.status === 'GUIDED_REQUIRED' || proposal.status === 'REJECTED') && (
          <button className="primary-button" type="button" onClick={() => void onGuide(proposal.id)}>Select replacement on page</button>
        )}
      </div>
    </article>
  );
}

function RevisionRow({ revision, currentVersion, onRestore }: { revision: ToolRevision; currentVersion: number; onRestore: (revisionId: string) => Promise<void> }) {
  return (
    <article className="revision-row">
      <div><strong>Version {revision.toolVersion}</strong><span>{revision.reason.replaceAll('_', ' ')} · {new Date(revision.createdAt).toLocaleString()}</span></div>
      <button type="button" onClick={() => void onRestore(revision.id)} disabled={revision.toolVersion === currentVersion}>Restore</button>
    </article>
  );
}

export default function App() {
  const [section, setSection] = useState<PanelSection>('overview');
  const [snapshot, setSnapshot] = useState<ActiveTabSnapshot>(emptySnapshot);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [toast, setToast] = useState<{ tone: 'success' | 'error' | 'info'; message: string }>();
  const [seenConnectionCheckAt, setSeenConnectionCheckAt] = useState(0);

  const pushToast = useCallback((tone: 'success' | 'error' | 'info', message: string) => {
    setToast({ tone, message });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(undefined), 4_500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

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
      if (['WEBMCP_STATUS', 'WEBMCP_CATALOG', 'TEACH_STATE_CHANGED', 'TOOL_EXECUTION_CHANGED', 'PERSONAL_TOOLS_CHANGED', 'REPAIR_STATE_CHANGED'].includes(message.type ?? '')) void refresh();
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

  useEffect(() => {
    const check = snapshot.connectionCheck;
    if (!check || check.checkedAt <= seenConnectionCheckAt || check.state === 'RUNNING') return;
    setSeenConnectionCheckAt(check.checkedAt);
    pushToast(check.state === 'SUCCEEDED' ? 'success' : 'error', check.message);
  }, [pushToast, seenConnectionCheckAt, snapshot.connectionCheck]);

  const runNativeTool = async (tool: DiscoveredWebMcpTool, input: Record<string, JsonValue>): Promise<JsonValue> => {
    try {
      const result = await browser.runtime.sendMessage({ type: 'RUN_NATIVE_TOOL', toolName: tool.name, input }) as JsonValue;
      pushToast('success', `${tool.title} completed on the visible page.`);
      await refresh();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Native tool execution failed.';
      pushToast('error', message);
      throw error;
    }
  };

  const runPersonalTool = async (tool: PersonalToolRecord, input: Record<string, JsonValue>) => {
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'RUN_PERSONAL_TOOL', toolId: tool.id, input });
      pushToast('success', `${tool.title} completed.`);
      await refresh();
    } catch (error) {
      pushToast('error', error instanceof Error ? error.message : 'Personal tool execution failed.');
      await refresh();
      throw error;
    }
  };

  const cancelPersonalTool = async (invocationId: string) => {
    setActionError('');
    await browser.runtime.sendMessage({ type: 'CANCEL_PERSONAL_TOOL', invocationId });
    pushToast('info', 'Tool run cancelled.');
    window.setTimeout(() => void refresh(), 150);
  };

  const resolveHumanConfirmation = async (invocationId: string, approved: boolean) => {
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'RESOLVE_HUMAN_CONFIRMATION', invocationId, approved });
      pushToast('info', approved ? 'Approved. The workflow is continuing.' : 'Rejected. The workflow was stopped.');
      window.setTimeout(() => void refresh(), 150);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not record the confirmation decision.');
    }
  };

  const deletePersonalTool = async (tool: PersonalToolRecord) => {
    if (!window.confirm(`Delete “${tool.title}”? Its existing activity receipts will remain.`)) return;
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'DELETE_PERSONAL_TOOL', toolId: tool.id });
      pushToast('success', `${tool.title} was deleted.`);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not delete the personal tool.');
    }
  };

  const runRepairAction = async (message: Record<string, unknown>) => {
    setBusy(true);
    setActionError('');
    try {
      await browser.runtime.sendMessage(message);
      pushToast('success', 'The capability was updated.');
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The repair action failed.');
    } finally {
      setBusy(false);
    }
  };

  const approveRepair = (proposalId: string, candidateIndex: number) => runRepairAction({ type: 'APPROVE_REPAIR', proposalId, candidateIndex });
  const rejectRepair = (proposalId: string) => runRepairAction({ type: 'REJECT_REPAIR', proposalId });
  const startGuidedRepair = (proposalId: string) => runRepairAction({ type: 'START_GUIDED_REPAIR', proposalId });
  const retestTool = (toolId: string) => runRepairAction({ type: 'RETEST_PERSONAL_TOOL', toolId });
  const restoreRevision = async (revisionId: string) => {
    if (!window.confirm('Restore this workflow revision as a new current version?')) return;
    await runRepairAction({ type: 'RESTORE_TOOL_REVISION', revisionId });
  };

  const runSelfTest = async () => {
    setBusy(true);
    setActionError('');
    try {
      await browser.runtime.sendMessage({ type: 'RUN_PING_SELF_TEST' });
      pushToast('info', 'Running personal_ping on the visible page…');
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
      pushToast('success', `PersonalWebMCP is enabled for ${snapshot.origin}.`);
      window.setTimeout(() => void refresh(), 500);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not enable this site.');
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
        {(['overview', 'teach', 'tools', 'repair'] as const).map((item) => (
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

      {toast && <div className={`toast ${toast.tone}`} role="status"><span>{toast.tone === 'success' ? '✓' : toast.tone === 'error' ? '!' : 'i'}</span><p>{toast.message}</p><button type="button" aria-label="Dismiss notification" onClick={() => setToast(undefined)}>×</button></div>}

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

            {snapshot.connectionCheck && (
              <p className={`connection-status ${snapshot.connectionCheck.state.toLowerCase()}`} role="status">
                <strong>{snapshot.connectionCheck.state === 'RUNNING' ? 'Checking' : snapshot.connectionCheck.state === 'SUCCEEDED' ? 'Connected' : 'Connection failed'}</strong>
                <span>{snapshot.connectionCheck.message}</span>
              </p>
            )}

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
                  onConfirm={resolveHumanConfirmation}
                  onDelete={deletePersonalTool}
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
          onSaved={async () => { pushToast('success', 'Personal tool saved. The teaching canvas is ready for a new workflow.'); await refresh(); setSection('tools'); }}
        />
      )}

      {section === 'tools' && (
        <section className="section-block flush">
          <div className="section-heading">
            <div><p className="overline">WEBSITE-OWNED</p><h2>Native tools · {nativeTools.length}</h2></div>
          </div>
          {nativeTools.length > 0
            ? nativeTools.map((tool) => <DiscoveredToolCard tool={tool} onRun={runNativeTool} key={`${tool.origin}:${tool.name}`} />)
            : <p className="empty-copy">This page currently exposes no native WebMCP tools.</p>}
          {nativeTools.length > 0 && (
            <ComposePanel nativeTools={nativeTools} personalTools={personalTools} origin={snapshot.origin} path={snapshot.path} onSaved={refresh} />
          )}

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
              onConfirm={resolveHumanConfirmation}
              onDelete={deletePersonalTool}
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

      {section === 'repair' && (
        <section className="section-block flush">
          <div className="section-heading">
            <div><p className="overline">SEMANTIC REPAIR</p><h2>Review and recover</h2></div>
          </div>
          {snapshot.repairs.length > 0 ? snapshot.repairs.map((proposal) => (
            <RepairProposalCard
              proposal={proposal}
              onApprove={approveRepair}
              onReject={rejectRepair}
              onGuide={startGuidedRepair}
              key={proposal.id}
            />
          )) : <p className="empty-copy">No repair decisions are waiting. Failed targets appear here instead of being guessed.</p>}

          <div className="section-heading divided"><div><p className="overline">HEALTH</p><h2>Saved capabilities</h2></div></div>
          {personalTools.map((tool) => (
            <article className="health-row" key={tool.id}>
              <span className={`health-dot ${tool.health.state.toLowerCase()}`} />
              <div><strong>{tool.title}</strong><p>{tool.health.state.replaceAll('_', ' ')}</p></div>
              <div className="health-actions"><span>{tool.health.confidence ?? '—'}{tool.health.confidence !== undefined ? '%' : ''}</span><button type="button" onClick={() => void retestTool(tool.id)} disabled={busy || tool.health.state === 'BROKEN'}>Retest</button></div>
            </article>
          ))}

          <div className="section-heading divided"><div><p className="overline">VERSIONS</p><h2>Revision history</h2></div></div>
          {personalTools.flatMap((tool) => snapshot.revisions
            .filter((revision) => revision.toolId === tool.id)
            .slice(0, 5)
            .map((revision) => <RevisionRow revision={revision} currentVersion={tool.version} onRestore={restoreRevision} key={revision.id} />))}
          {snapshot.revisions.length === 0 && <p className="empty-copy">Saved and repaired versions will appear here.</p>}
          <p className="hint">High-confidence matches repair automatically after their postcondition passes. Ambiguous or missing targets always stop for you.</p>
        </section>
      )}

      <p className="hint">
        Tool metadata stays local. Site access is granted one origin at a time.
      </p>
    </main>
  );
}
