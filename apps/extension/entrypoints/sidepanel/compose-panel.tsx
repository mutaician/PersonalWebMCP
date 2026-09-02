import { useEffect, useMemo, useState } from 'react';
import type {
  DiscoveredWebMcpTool,
  JsonValue,
  PersonalToolRecord,
  WorkflowNode,
} from '@personal-webmcp/contracts';

type ValueMode = 'FIXED' | 'PARAMETER';

interface ArgumentDraft {
  mode: ValueMode;
  parameterName: string;
  value: JsonValue;
  schema: Record<string, unknown>;
  required: boolean;
}

interface CompositeStepDraft {
  id: string;
  tool: DiscoveredWebMcpTool;
  arguments: Record<string, ArgumentDraft>;
  personalTool?: PersonalToolRecord;
  confirmation?: true;
}

function stepForConfirmation(origin: string): CompositeStepDraft {
  return {
    id: crypto.randomUUID(),
    tool: {
      name: 'human_confirmation',
      title: 'Review before booking',
      description: 'Pauses the capability until the user approves or rejects it in the side panel.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      origin,
      provenance: 'PERSONAL',
    },
    arguments: {},
    confirmation: true,
  };
}

function propertiesFor(tool: DiscoveredWebMcpTool): Record<string, Record<string, unknown>> {
  const properties = tool.inputSchema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  return Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, Record<string, unknown>] => (
    Boolean(entry[1]) && typeof entry[1] === 'object' && !Array.isArray(entry[1])
  )));
}

function defaultFor(schema: Record<string, unknown>): JsonValue {
  if (schema.default !== undefined) return JSON.parse(JSON.stringify(schema.default)) as JsonValue;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0] as JsonValue;
  if (schema.type === 'array') return [];
  if (schema.type === 'number' || schema.type === 'integer') return 1;
  if (schema.type === 'boolean') return false;
  return '';
}

function stepFor(tool: DiscoveredWebMcpTool): CompositeStepDraft {
  const required = new Set(Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required.filter((name): name is string => typeof name === 'string') : []);
  return {
    id: crypto.randomUUID(),
    tool,
    arguments: Object.fromEntries(Object.entries(propertiesFor(tool)).map(([name, schema]) => [name, {
      mode: 'FIXED' as const,
      parameterName: name,
      value: defaultFor(schema),
      schema,
      required: required.has(name),
    }])),
  };
}

function stepForPersonal(tool: PersonalToolRecord): CompositeStepDraft {
  return {
    ...stepFor({
      name: tool.webmcpName,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      origin: tool.scope.origin,
      provenance: 'PERSONAL',
    }),
    personalTool: tool,
  };
}

function parseValue(raw: string, schema: Record<string, unknown>): JsonValue {
  if (schema.type === 'array') return raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (schema.type === 'number' || schema.type === 'integer') return Number(raw);
  if (schema.type === 'boolean') return raw === 'true';
  return raw;
}

function ValueEditor({ argument, onChange }: { argument: ArgumentDraft; onChange: (value: JsonValue) => void }) {
  const choices = Array.isArray(argument.schema.enum) ? argument.schema.enum.filter((value): value is string => typeof value === 'string') : [];
  const itemSchema = argument.schema.items && typeof argument.schema.items === 'object' && !Array.isArray(argument.schema.items) ? argument.schema.items as Record<string, unknown> : undefined;
  const arrayChoices = Array.isArray(itemSchema?.enum) ? itemSchema.enum.filter((value): value is string => typeof value === 'string') : [];
  if (choices.length > 0) {
    return <span className="enum-choices compact-choices" role="radiogroup">{choices.map((choice) => <button className={argument.value === choice ? 'active' : ''} type="button" role="radio" aria-checked={argument.value === choice} onClick={() => onChange(choice)} key={choice}>{choice}</button>)}</span>;
  }
  if (arrayChoices.length > 0) {
    const selected = new Set(Array.isArray(argument.value) ? argument.value.map(String) : []);
    return <span className="enum-choices compact-choices multi-choices">{arrayChoices.map((choice) => <button className={selected.has(choice) ? 'active' : ''} type="button" aria-pressed={selected.has(choice)} onClick={() => { const next = new Set(selected); if (next.has(choice)) next.delete(choice); else next.add(choice); onChange([...next]); }} key={choice}>{choice}</button>)}</span>;
  }
  if (argument.schema.type === 'boolean') {
    return <span className="enum-choices compact-choices" role="radiogroup"><button className={argument.value === true ? 'active' : ''} type="button" role="radio" aria-checked={argument.value === true} onClick={() => onChange(true)}>Yes</button><button className={argument.value === false ? 'active' : ''} type="button" role="radio" aria-checked={argument.value === false} onClick={() => onChange(false)}>No</button></span>;
  }
  return (
    <input
      type={argument.schema.type === 'number' || argument.schema.type === 'integer' ? 'number' : 'text'}
      value={Array.isArray(argument.value) ? argument.value.join(', ') : String(argument.value)}
      onChange={(event) => onChange(parseValue(event.target.value, argument.schema))}
      placeholder={argument.schema.type === 'array' ? 'Comma-separated options' : 'Value'}
    />
  );
}

export function ComposePanel({
  nativeTools,
  personalTools,
  origin,
  path,
  onSaved,
}: {
  nativeTools: DiscoveredWebMcpTool[];
  personalTools: PersonalToolRecord[];
  origin?: string;
  path?: string;
  onSaved: () => Promise<void>;
}) {
  const [steps, setSteps] = useState<CompositeStepDraft[]>([]);
  const [title, setTitle] = useState('Make my usual workspace');
  const [name, setName] = useState('personal_make_my_usual');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const travelMode = useMemo(() => nativeTools.some((tool) => tool.name.startsWith('travel_')), [nativeTools]);
  const available = useMemo(() => nativeTools.filter((tool) => !steps.some((step) => step.tool.name === tool.name)), [nativeTools, steps]);
  const availablePersonal = useMemo(() => personalTools.filter((tool) => !steps.some((step) => step.tool.name === tool.webmcpName)), [personalTools, steps]);
  const hasConfirmation = steps.some((step) => step.confirmation);

  useEffect(() => {
    if (!travelMode || steps.length > 0) return;
    setTitle('Prepare my usual trip');
    setName('personal_prepare_my_trip');
  }, [steps.length, travelMode]);

  const addUsual = () => {
    setSteps([
      ...nativeTools.map(stepFor),
      ...(travelMode && origin ? [stepForConfirmation(origin)] : []),
    ]);
    setMessage('');
  };

  const move = (index: number, direction: -1 | 1) => {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const updateArgument = (stepId: string, argumentName: string, patch: Partial<ArgumentDraft>) => {
    setSteps((current) => current.map((step) => step.id !== stepId ? step : {
      ...step,
      arguments: {
        ...step.arguments,
        [argumentName]: { ...step.arguments[argumentName]!, ...patch },
      },
    }));
  };

  const save = async () => {
    if (!origin || steps.length === 0) return;
    setBusy(true);
    setMessage('');
    try {
      const now = new Date().toISOString();
      const properties: Record<string, Record<string, unknown>> = {};
      const requiredParameters = new Set<string>();
      const nodes: WorkflowNode[] = steps.map((step, index) => {
        const argumentsConfig: Record<string, JsonValue> = {};
        for (const [argumentName, argument] of Object.entries(step.arguments)) {
          const parameterName = argument.parameterName.trim();
          if (argument.mode === 'PARAMETER' && !parameterName) throw new Error(`${step.tool.title}: ${argumentName.replaceAll('_', ' ')} needs an agent input name.`);
          argumentsConfig[argumentName] = argument.mode === 'PARAMETER'
            ? { mode: 'PARAMETER', parameterName, value: argument.value }
            : { mode: 'FIXED', value: argument.value };
          if (argument.mode === 'PARAMETER') {
            properties[parameterName] = { ...argument.schema, default: argument.value };
            if (argument.required) requiredParameters.add(parameterName);
          }
        }
        const config: Record<string, JsonValue> = step.confirmation
          ? { summary: 'Review the selected itinerary, fare, seat preference and shortlist state on the visible page.' }
          : step.personalTool
          ? { toolId: step.personalTool.id, tool: step.personalTool as unknown as JsonValue, arguments: argumentsConfig }
          : { toolName: step.tool.name, arguments: argumentsConfig };
        return {
          id: `step-${index + 1}`,
          type: step.confirmation ? 'HUMAN_CONFIRMATION' : step.personalTool ? 'PERSONAL_TOOL' : 'NATIVE_TOOL',
          label: step.tool.title,
          config,
        };
      });
      const tool: PersonalToolRecord = {
        id: crypto.randomUUID(),
        version: 1,
        webmcpName: name.trim(),
        title: title.trim(),
        description: `Apply ${steps.length} saved steps by composing website-owned and personal WebMCP capabilities.`,
        scope: { origin, pathRules: [{ kind: 'PREFIX', value: path || '/' }], prerequisites: ['document.modelContext', ...steps.filter((step) => !step.personalTool && !step.confirmation).map((step) => step.tool.name)] },
        inputSchema: { type: 'object', properties, required: [...requiredParameters], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false, riskClass: hasConfirmation ? 'CONSEQUENTIAL' : 'REVERSIBLE_WRITE' },
        provenance: { type: 'COMPOSITE', createdAt: now, nativeDependencies: steps.filter((step) => !step.personalTool && !step.confirmation).map((step) => step.tool.name), repairHistory: [] },
        workflowGraph: {
          entryNodeId: nodes[0]!.id,
          nodes,
          edges: nodes.slice(1).map((node, index) => ({ id: `edge-${index + 1}`, source: nodes[index]!.id, target: node.id })),
        },
        health: { state: 'UNVERIFIED' },
        createdAt: now,
        updatedAt: now,
      };
      await browser.runtime.sendMessage({ type: 'SAVE_COMPILED_TOOL', tool });
      setMessage('Composite saved and registered on this page.');
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the composite tool.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="compose-card">
      <div className="section-heading"><div><p className="overline">COMPOSE</p><h2>{travelMode ? 'Prepare a personal trip' : 'My usual configuration'}</h2></div><span>{steps.length} steps</span></div>
      <p>{travelMode ? 'Combine native trip tools with any travel preference you taught, then pause for your review.' : 'Combine website-owned tools into one personal capability. No DOM recording is used here.'}</p>
      {steps.length === 0 && nativeTools.length > 0 && <button className="primary-button" type="button" onClick={addUsual}>{travelMode ? 'Start hybrid trip flow' : 'Start with all configurator tools'}</button>}
      <div className="compose-add-row">{available.map((tool) => <button type="button" onClick={() => setSteps((current) => [...current, stepFor(tool)])} key={tool.name}>+ {tool.title}</button>)}</div>
      {availablePersonal.length > 0 && <div className="compose-add-row personal-add-row">{availablePersonal.map((tool) => <button type="button" onClick={() => setSteps((current) => [...current, stepForPersonal(tool)])} key={tool.id}>+ Personal: {tool.title}</button>)}</div>}
      {travelMode && !hasConfirmation && origin && <div className="compose-add-row"><button type="button" onClick={() => setSteps((current) => [...current, stepForConfirmation(origin)])}>+ Human review checkpoint</button></div>}
      <div className="compose-steps">
        {steps.map((step, index) => (
          <article className="compose-step" key={step.id}>
            <span className="capture-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="compose-step-main">
              <strong>{step.tool.title}</strong><code>{step.tool.name}</code>
              {Object.entries(step.arguments).map(([argumentName, argument]) => (
                <div className="compose-argument" key={argumentName}>
                  <label>{argumentName.replaceAll('_', ' ')}<ValueEditor argument={argument} onChange={(value) => updateArgument(step.id, argumentName, { value })} /></label>
                  <div className="compose-choice-field"><span>Agent control</span><div className="value-mode-buttons"><button className={argument.mode === 'FIXED' ? 'active' : ''} type="button" onClick={() => updateArgument(step.id, argumentName, { mode: 'FIXED' as ValueMode })}>Remember</button><button className={argument.mode === 'PARAMETER' ? 'active' : ''} type="button" onClick={() => updateArgument(step.id, argumentName, { mode: 'PARAMETER' as ValueMode })}>Agent input</button></div></div>
                  {argument.mode === 'PARAMETER' && <label>Agent input name<input value={argument.parameterName} onChange={(event) => updateArgument(step.id, argumentName, { parameterName: event.target.value })} /></label>}
                </div>
              ))}
            </div>
            <div className="compose-order"><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1}>↓</button><button type="button" onClick={() => setSteps((current) => current.filter((item) => item.id !== step.id))}>×</button></div>
          </article>
        ))}
      </div>
      {steps.length > 0 && <div className="compose-contract"><label>Tool name<input value={name} onChange={(event) => setName(event.target.value)} /></label><label>Display title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><button className="primary-button" type="button" onClick={() => void save()} disabled={busy || !name.trim() || !title.trim()}>{busy ? 'Saving…' : 'Save composite tool'}</button></div>}
      {message && <p className={message.startsWith('Composite') ? 'notice success-notice' : 'notice error'}>{message}</p>}
    </section>
  );
}
