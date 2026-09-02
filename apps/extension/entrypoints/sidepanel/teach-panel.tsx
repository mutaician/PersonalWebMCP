import { useEffect, useMemo, useState } from 'react';
import type {
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
            <div className="value-mode-field"><span>Use value as</span><div className="value-mode-buttons" role="group" aria-label="How this captured value should be used"><button className={(choice.valueMode ?? 'FIXED') === 'FIXED' ? 'active' : ''} type="button" onClick={() => onChange({ ...choice, valueMode: 'FIXED' })}>Remember this value</button><button className={choice.valueMode === 'PARAMETER' ? 'active' : ''} type="button" onClick={() => onChange({ ...choice, valueMode: 'PARAMETER' })}>Ask each run</button></div></div>
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
    setChoices(nextChoices);
    setDraft(nextDraft);
    setPreparedTraceId(trace.id);
    setTestResult('');
    setError('');
  }, [preparedTraceId, trace]);

  const includedStepCount = useMemo(
    () => choices.filter((choice) => choice.include).length,
    [choices],
  );
  const generatedTool = useMemo(() => {
    if (!trace || trace.status !== 'COMPLETED') return undefined;
    try {
      return compileTaughtWorkflow(trace, choices, draft);
    } catch {
      return undefined;
    }
  }, [choices, draft, trace]);
  const schemaText = JSON.stringify(generatedTool?.inputSchema ?? {}, null, 2);
  const previewNodes = generatedTool?.workflowGraph.nodes ?? [];
  const compiledActions = previewNodes.filter((node) => node.type !== 'ASSERT');
  const inferredIntents = compiledActions
    .map((node) => node.config.intent)
    .filter((intent): intent is string => typeof intent === 'string')
    .map((intent) => intent === 'APPLY_FILTERS' ? 'Apply filters' : intent === 'OPEN_FIRST_MATCHING_RESULT' ? 'Open first matching result' : intent);

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
    const tool = compileTaughtWorkflow(trace, choices, draft);
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

      <div className="compiler-heading"><p className="overline">GENERATED CONTRACT</p><h2>Independent personal tool</h2><p>This recording has its own unique name. Edit what the agent sees, which values vary, and which remain fixed.</p></div>
      {generatedTool && <div className="compiler-insight"><strong>{includedStepCount} recorded events → {compiledActions.length} reusable actions</strong><span>{inferredIntents.length > 0 ? `Inferred intent: ${inferredIntents.join(' · ')}` : 'Stable semantic controls compiled from the recording.'}</span></div>}
      <div className="contract-form">
        <label>Tool name<input value={draft.webmcpName} onChange={(event) => updateDraft('webmcpName', event.target.value)} /></label>
        <label>Display title<input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} /></label>
        <label className="wide-field">Description<textarea rows={3} value={draft.description} onChange={(event) => updateDraft('description', event.target.value)} /></label>
        <label>Path scope<input value={draft.pathPrefix} onChange={(event) => updateDraft('pathPrefix', event.target.value)} /></label>
        <div className="risk-choice-field"><span>Risk class</span><div className="value-mode-buttons risk-options" role="radiogroup" aria-label="Risk class">{([['READ_ONLY', 'Read only'], ['REVERSIBLE_WRITE', 'Reversible'], ['CONSEQUENTIAL', 'Consequential']] as const).map(([value, label]) => <button className={draft.riskClass === value ? 'active' : ''} type="button" role="radio" aria-checked={draft.riskClass === value} onClick={() => updateDraft('riskClass', value as RiskClass)} key={value}>{label}</button>)}</div></div>
        <label className="wide-field">Generated JSON Schema<textarea className="schema-editor" rows={12} spellCheck={false} value={schemaText} readOnly /></label>
      </div>
      <dl className="contract-summary"><div><dt>Origin scope</dt><dd>{trace?.origin}</dd></div><div><dt>Prerequisite</dt><dd>document.modelContext</dd></div><div><dt>Read-only hint</dt><dd>{draft.riskClass === 'READ_ONLY' ? 'Yes' : 'No'}</dd></div><div><dt>Untrusted content</dt><dd>No</dd></div></dl>
      <details className="workflow-preview"><summary>Compiled capability · {previewNodes.length} nodes</summary><ol>{previewNodes.map((node) => <li key={node.id}><code>{node.type}</code><span>{node.label}</span></li>)}</ol></details>
      {error && <p className="notice error" role="alert">{error}</p>}
      {testResult && <p className="notice success-notice" role="status">{testResult}</p>}
      <div className="compile-actions"><button type="button" onClick={() => void testDraft()} disabled={busy}>Validate contract</button><button className="primary-button" type="button" onClick={() => void saveTool()} disabled={busy || !testResult}>{busy ? 'Working…' : 'Save personal tool'}</button></div>
      <p className="hint">Validation checks the schema, scope, and workflow structure only. It does not click or run anything on the page. Save the tool, then run it from Tools for the real test.</p>
    </section>
  );
}
