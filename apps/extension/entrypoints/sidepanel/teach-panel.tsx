import { useEffect, useMemo, useState } from 'react';
import type {
  JsonSchema,
  PersonalToolRecord,
  RiskClass,
  TeachSessionSnapshot,
  TraceStep,
} from '@personal-webmcp/contracts';
import {
  compileTaughtWorkflow,
  suggestStepCompilationChoice,
  suggestTaughtToolIdentity,
  validateCompiledTool,
  type StepCompilationChoice,
} from '@personal-webmcp/engine';

interface TeachPanelProps {
  session: TeachSessionSnapshot;
  enabled: boolean;
  onSessionChange: (session: TeachSessionSnapshot) => void;
  onSaved: () => Promise<void>;
}

interface DraftFields {
  id: string;
  webmcpName: string;
  title: string;
  description: string;
  pathPrefix: string;
  riskClass: RiskClass;
}

const emptyDraft: DraftFields = {
  id: '',
  webmcpName: '',
  title: '',
  description: '',
  pathPrefix: '/',
  riskClass: 'READ_ONLY',
};

function stepTitle(step: TraceStep): string {
  if (step.type === 'SKIPPED_SENSITIVE') return 'Sensitive control skipped';
  const target = step.locator?.accessibleName || step.locator?.label || step.locator?.placeholder;
  return target ? `${step.type.toLowerCase()} · ${target}` : step.type.toLowerCase();
}

function readableValue(step: TraceStep): string | undefined {
  if (step.value === undefined) return undefined;
  if (typeof step.value === 'string') return step.value;
  return JSON.stringify(step.value);
}

function CapturedStepRow({
  step,
  number,
  choice,
  onChange,
}: {
  step: TraceStep;
  number: number;
  choice: StepCompilationChoice;
  onChange: (next: StepCompilationChoice) => void;
}) {
  const hasValue = step.value !== undefined && ['INPUT', 'SELECT'].includes(step.type);
  if (step.type === 'SKIPPED_SENSITIVE') {
    return (
      <article className="capture-step skipped-step">
        <span className="capture-number">—</span>
        <div><strong>{stepTitle(step)}</strong><p>No locator or value was stored.</p></div>
        <span className="safe-badge">EXCLUDED</span>
      </article>
    );
  }

  return (
    <article className={`capture-step${choice.include ? '' : ' removed'}`}>
      <span className="capture-number">{number}</span>
      <div className="capture-step-main">
        <div className="capture-step-title"><strong>{stepTitle(step)}</strong><code>{step.locator?.role ?? step.locator?.tagName ?? 'page'}</code></div>
        {readableValue(step) !== undefined && <p className="captured-value">Captured: <span>{readableValue(step)}</span></p>}
        {step.locator?.landmark && <p className="capture-context">Inside {step.locator.landmark} · {step.locator.path}</p>}
        {choice.include && hasValue && (
          <div className="value-choice">
            <label>Use value as
              <select value={choice.valueMode ?? 'FIXED'} onChange={(event) => onChange({ ...choice, valueMode: event.target.value as 'FIXED' | 'PARAMETER' })}>
                <option value="FIXED">Fixed preference</option>
                <option value="PARAMETER">Tool parameter</option>
              </select>
            </label>
            {choice.valueMode === 'PARAMETER' && (
              <>
                <label>Parameter name<input value={choice.parameterName ?? ''} onChange={(event) => onChange({ ...choice, parameterName: event.target.value })} /></label>
                <label className="required-toggle"><input type="checkbox" checked={Boolean(choice.required)} onChange={(event) => onChange({ ...choice, required: event.target.checked })} />Required</label>
              </>
            )}
          </div>
        )}
      </div>
      <button className="remove-step" type="button" onClick={() => onChange({ ...choice, include: !choice.include })}>{choice.include ? 'Remove' : 'Restore'}</button>
    </article>
  );
}

export function TeachPanel({ session, enabled, onSessionChange, onSaved }: TeachPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preparedTraceId, setPreparedTraceId] = useState('');
  const [choices, setChoices] = useState<StepCompilationChoice[]>([]);
  const [draft, setDraft] = useState<DraftFields>(emptyDraft);
  const [schemaText, setSchemaText] = useState('{}');
  const [testResult, setTestResult] = useState('');
  const trace = session.trace;

  useEffect(() => {
    if (trace?.status !== 'COMPLETED' || trace.id === preparedTraceId) return;
    const nextChoices = trace.steps.map(suggestStepCompilationChoice);
    const identity = suggestTaughtToolIdentity(trace);
    const nextDraft: DraftFields = {
      id: crypto.randomUUID(),
      ...identity,
      riskClass: 'READ_ONLY',
    };
    const compiled = compileTaughtWorkflow(trace, nextChoices, nextDraft);
    setChoices(nextChoices);
    setDraft(nextDraft);
    setSchemaText(JSON.stringify(compiled.inputSchema, null, 2));
    setPreparedTraceId(trace.id);
    setTestResult('');
    setError('');
  }, [preparedTraceId, trace]);

  const includedStepCount = useMemo(
    () => choices.filter((choice) => choice.include).length,
    [choices],
  );
  const previewNodes = useMemo(() => {
    if (!trace || trace.status !== 'COMPLETED') return [];
    try {
      const inputSchema = JSON.parse(schemaText) as JsonSchema;
      return compileTaughtWorkflow(trace, choices, { ...draft, inputSchema }).workflowGraph.nodes;
    } catch {
      return [];
    }
  }, [choices, draft, schemaText, trace]);

  const runRecorderCommand = async (type: 'START_TEACHING' | 'PAUSE_TEACHING' | 'RESUME_TEACHING' | 'CANCEL_TEACHING' | 'FINISH_TEACHING') => {
    setBusy(true);
    setError('');
    try {
      const next = await browser.runtime.sendMessage({ type }) as TeachSessionSnapshot;
      onSessionChange(next);
      if (type === 'START_TEACHING') {
        setPreparedTraceId('');
        setTestResult('');
      }
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : 'The teaching command failed.');
    } finally {
      setBusy(false);
    }
  };

  const markDraftDirty = () => {
    setTestResult('');
    setError('');
  };

  const updateChoice = (stepId: string, next: StepCompilationChoice) => {
    setChoices((current) => current.map((choice) => choice.stepId === stepId ? next : choice));
    markDraftDirty();
  };

  const updateDraft = <K extends keyof DraftFields>(key: K, value: DraftFields[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    markDraftDirty();
  };

  const buildTool = (): PersonalToolRecord => {
    if (!trace || trace.status !== 'COMPLETED') throw new Error('Finish the teaching session before compiling.');
    let inputSchema: JsonSchema;
    try {
      inputSchema = JSON.parse(schemaText) as JsonSchema;
    } catch {
      throw new Error('Input schema is not valid JSON.');
    }
    const tool = compileTaughtWorkflow(trace, choices, { ...draft, inputSchema });
    const validation = validateCompiledTool(tool);
    if (!validation.valid) throw new Error(validation.errors.join(' · '));
    return tool;
  };

  const testDraft = async () => {
    setBusy(true);
    setError('');
    setTestResult('');
    try {
      const tool = buildTool();
      const result = await browser.runtime.sendMessage({ type: 'TEST_COMPILED_TOOL', tool }) as { message?: string };
      setTestResult(result.message ?? 'Draft is valid.');
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Draft validation failed.');
    } finally {
      setBusy(false);
    }
  };

  const saveTool = async () => {
    if (!testResult) return;
    setBusy(true);
    setError('');
    try {
      const tool = buildTool();
      await browser.runtime.sendMessage({ type: 'SAVE_COMPILED_TOOL', tool });
      setTestResult('Saved locally with its first revision.');
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the personal tool.');
    } finally {
      setBusy(false);
    }
  };

  if (session.state === 'IDLE') {
    return (
      <section className="bridge-card teach-card">
        <div className="bridge-heading"><span className="number">02</span><div><h2>Teach a workflow</h2><p>Perform the task normally in the visible page. PersonalWebMCP captures semantic steps, not a video.</p></div></div>
        <div className="teach-safety"><span>PRIVATE BY DEFAULT</span><strong>Sensitive controls are excluded before storage.</strong><p>Passwords, payment-card fields, OTP inputs, hidden inputs and blocked autocomplete categories are never captured.</p></div>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="primary-button" type="button" disabled={!enabled || busy} onClick={() => void runRecorderCommand('START_TEACHING')}>{busy ? 'Starting…' : 'Start teaching'}</button>
        {!enabled && <p className="hint">Enable PersonalWebMCP for the current site before recording.</p>}
      </section>
    );
  }

  if (session.state === 'RECORDING' || session.state === 'PAUSED') {
    const steps = trace?.steps ?? [];
    return (
      <section className="section-block flush teach-live">
        <div className="recording-banner"><span className={session.state === 'RECORDING' ? 'recording-pulse' : 'paused-dot'} /><div><strong>{session.state === 'RECORDING' ? 'Recording the visible page' : 'Recording paused'}</strong><p>{steps.length} captured {steps.length === 1 ? 'step' : 'steps'} · {session.sensitiveSkipCount} sensitive skipped</p></div></div>
        <div className="recording-actions">
          {session.state === 'RECORDING'
            ? <button type="button" onClick={() => void runRecorderCommand('PAUSE_TEACHING')} disabled={busy}>Pause</button>
            : <button type="button" onClick={() => void runRecorderCommand('RESUME_TEACHING')} disabled={busy}>Resume</button>}
          <button type="button" onClick={() => void runRecorderCommand('CANCEL_TEACHING')} disabled={busy}>Cancel</button>
          <button className="finish-button" type="button" onClick={() => void runRecorderCommand('FINISH_TEACHING')} disabled={busy || steps.filter((step) => step.type !== 'SKIPPED_SENSITIVE').length === 0}>Finish</button>
        </div>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="capture-list live-list">
          {steps.length > 0 ? steps.map((step, index) => (
            <article className={`capture-step${step.type === 'SKIPPED_SENSITIVE' ? ' skipped-step' : ''}`} key={step.id}><span className="capture-number">{step.type === 'SKIPPED_SENSITIVE' ? '—' : index + 1}</span><div><strong>{stepTitle(step)}</strong><p>{step.type === 'SKIPPED_SENSITIVE' ? 'No value stored.' : step.locator?.expectedOutcome}</p></div></article>
          )) : <p className="empty-copy">Use the website normally. Captured controls will receive numbered orange outlines.</p>}
        </div>
      </section>
    );
  }

  const steps = trace?.steps ?? [];
  return (
    <section className="section-block flush teach-review">
      <div className="review-heading"><div><p className="overline">CAPTURE COMPLETE</p><h2>Review the workflow</h2><span>{includedStepCount} steps retained · {session.sensitiveSkipCount} sensitive excluded</span></div><button className="text-button" type="button" onClick={() => void runRecorderCommand('START_TEACHING')} disabled={busy}>Record again</button></div>
      <div className="capture-list">
        {steps.map((step, index) => {
          const choice = choices.find((item) => item.stepId === step.id) ?? suggestStepCompilationChoice(step);
          return <CapturedStepRow step={step} number={index + 1} choice={choice} onChange={(next) => updateChoice(step.id, next)} key={step.id} />;
        })}
      </div>

      <div className="compiler-heading"><p className="overline">GENERATED CONTRACT</p><h2>Personal tool</h2><p>Edit what the agent will see and what inputs it may provide.</p></div>
      {draft.webmcpName === 'open_latest_unpaid_invoice' && (
        <div className="fixed-preferences"><span>FIXED PREFERENCES</span><p><strong>Status</strong> Unpaid</p><p><strong>Sort</strong> Newest first</p></div>
      )}
      <div className="contract-form">
        <label>Tool name<input value={draft.webmcpName} onChange={(event) => updateDraft('webmcpName', event.target.value)} /></label>
        <label>Display title<input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
        <label className="wide-field">Description<textarea rows={3} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} /></label>
        <label>Path scope<input value={draft.pathPrefix} onChange={(event) => updateDraft('pathPrefix', event.target.value)} /></label>
        <label>Risk class<select value={draft.riskClass} onChange={(event) => updateDraft('riskClass', event.target.value as RiskClass)}><option value="READ_ONLY">Read only</option><option value="REVERSIBLE_WRITE">Reversible write</option><option value="CONSEQUENTIAL">Consequential</option></select></label>
        <label className="wide-field">JSON Schema<textarea className="schema-editor" rows={12} spellCheck={false} value={schemaText} onChange={(event) => { setSchemaText(event.target.value); markDraftDirty(); }} /></label>
      </div>
      <dl className="contract-summary"><div><dt>Origin scope</dt><dd>{trace?.origin}</dd></div><div><dt>Prerequisite</dt><dd>document.modelContext</dd></div><div><dt>Read-only hint</dt><dd>{draft.riskClass === 'READ_ONLY' ? 'Yes' : 'No'}</dd></div><div><dt>Untrusted content</dt><dd>No</dd></div></dl>
      <details className="workflow-preview"><summary>Workflow graph · {previewNodes.length} nodes</summary><ol>{previewNodes.map((node) => <li key={node.id}><code>{node.type}</code><span>{node.label}</span></li>)}</ol></details>
      {error && <p className="notice error" role="alert">{error}</p>}
      {testResult && <p className="notice success-notice" role="status">{testResult}</p>}
      <div className="compile-actions"><button type="button" onClick={() => void testDraft()} disabled={busy}>Test draft</button><button className="primary-button" type="button" onClick={() => void saveTool()} disabled={busy || !testResult}>{busy ? 'Working…' : 'Save personal tool'}</button></div>
      <p className="hint">Draft testing validates the contract, schema, scope and graph. Visible replay starts in Step 8.</p>
    </section>
  );
}
