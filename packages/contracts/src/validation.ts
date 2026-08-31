import {
  BRIDGE_MESSAGE_TYPES,
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  type BridgeEnvelope,
} from './bridge';
import { WEBMCP_TEXT_BUDGETS, type JsonSchema, type PersonalToolRecord } from './models';

export interface ContractValidationFailure {
  valid: false;
  errors: string[];
}

export interface ContractValidationSuccess<T> {
  valid: true;
  value: T;
}

export type ContractValidationResult<T> = ContractValidationSuccess<T> | ContractValidationFailure;

export class ContractValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'ContractValidationError';
    this.issues = issues;
  }
}

type UnknownRecord = Record<string, unknown>;

const bridgeMessageTypes = new Set<string>(BRIDGE_MESSAGE_TYPES);
const workflowNodeTypes = new Set([
  'NATIVE_TOOL',
  'DOM_INPUT',
  'DOM_SELECT',
  'DOM_ACTIVATE',
  'NAVIGATE',
  'WAIT_FOR',
  'EXTRACT',
  'ASSERT',
  'BRANCH',
  'PERSONAL_TOOL',
  'HUMAN_CONFIRMATION',
]);
const riskClasses = new Set(['READ_ONLY', 'REVERSIBLE_WRITE', 'CONSEQUENTIAL']);
const provenanceTypes = new Set(['SYSTEM', 'TAUGHT', 'COMPOSITE', 'REPAIRED']);
const healthStates = new Set(['UNVERIFIED', 'HEALTHY', 'NEEDS_REVIEW', 'BROKEN']);
const pathRuleKinds = new Set(['EXACT', 'PREFIX', 'PATTERN']);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[], path: string, errors: string[]) {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}/${key} is not allowed`);
  }
}

function requireRecord(value: unknown, path: string, errors: string[]): UnknownRecord | undefined {
  if (isRecord(value)) return value;
  errors.push(`${path} must be an object`);
  return undefined;
}

function requireString(value: unknown, path: string, errors: string[], pattern?: RegExp) {
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${path} must be a non-empty string`);
  } else if (pattern && !pattern.test(value)) {
    errors.push(`${path} has an invalid format`);
  }
}

function requireStringArray(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  value.forEach((item, index) => {
    if (typeof item !== 'string') errors.push(`${path}/${index} must be a string`);
  });
}

function requireBoolean(value: unknown, path: string, errors: string[]) {
  if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`);
}

function requireEnum(value: unknown, allowed: Set<string>, path: string, errors: string[]) {
  if (typeof value !== 'string' || !allowed.has(value)) errors.push(`${path} has an invalid value`);
}

function successOrFailure<T>(value: unknown, errors: string[]): ContractValidationResult<T> {
  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, value: value as T };
}

export function validateBridgeEnvelope(value: unknown): ContractValidationResult<BridgeEnvelope> {
  const errors: string[] = [];
  const envelope = requireRecord(value, '/', errors);
  if (!envelope) return { valid: false, errors };

  hasOnlyKeys(envelope, ['source', 'version', 'tabSessionId', 'requestId', 'type', 'payload'], '', errors);
  if (envelope.source !== BRIDGE_SOURCE) errors.push('/source has an invalid value');
  if (envelope.version !== BRIDGE_VERSION) errors.push('/version has an invalid value');
  requireString(envelope.tabSessionId, '/tabSessionId', errors);
  requireString(envelope.requestId, '/requestId', errors);
  requireEnum(envelope.type, bridgeMessageTypes, '/type', errors);
  requireRecord(envelope.payload, '/payload', errors);

  return successOrFailure<BridgeEnvelope>(value, errors);
}

export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  return validateBridgeEnvelope(value).valid;
}

export function validatePersonalTool(value: unknown): ContractValidationResult<PersonalToolRecord> {
  const errors: string[] = [];
  const tool = requireRecord(value, '/', errors);
  if (!tool) return { valid: false, errors };

  hasOnlyKeys(tool, [
    'id', 'version', 'webmcpName', 'title', 'description', 'scope', 'inputSchema',
    'annotations', 'provenance', 'workflowGraph', 'health', 'createdAt', 'updatedAt',
  ], '', errors);
  requireString(tool.id, '/id', errors);
  if (!Number.isInteger(tool.version) || (tool.version as number) < 1) {
    errors.push('/version must be an integer greater than zero');
  }
  requireString(tool.webmcpName, '/webmcpName', errors, /^[A-Za-z0-9_.-]+$/);
  if (typeof tool.webmcpName === 'string' && tool.webmcpName.length > WEBMCP_TEXT_BUDGETS.toolName) {
    errors.push(`/webmcpName must contain at most ${WEBMCP_TEXT_BUDGETS.toolName} characters`);
  }
  requireString(tool.title, '/title', errors);
  if (typeof tool.title === 'string' && tool.title.length > WEBMCP_TEXT_BUDGETS.title) {
    errors.push(`/title must contain at most ${WEBMCP_TEXT_BUDGETS.title} characters`);
  }
  requireString(tool.description, '/description', errors);
  if (typeof tool.description === 'string' && tool.description.length > WEBMCP_TEXT_BUDGETS.description) {
    errors.push(`/description must contain at most ${WEBMCP_TEXT_BUDGETS.description} characters`);
  }
  requireRecord(tool.inputSchema, '/inputSchema', errors);
  requireString(tool.createdAt, '/createdAt', errors);
  requireString(tool.updatedAt, '/updatedAt', errors);

  if (isRecord(tool.inputSchema)) {
    const properties = isRecord(tool.inputSchema.properties) ? tool.inputSchema.properties : {};
    for (const [name, schema] of Object.entries(properties)) {
      if (name.length > WEBMCP_TEXT_BUDGETS.parameterName) {
        errors.push(`/inputSchema/properties/${name} name must contain at most ${WEBMCP_TEXT_BUDGETS.parameterName} characters`);
      }
      if (isRecord(schema) && typeof schema.description === 'string' && schema.description.length > WEBMCP_TEXT_BUDGETS.parameterDescription) {
        errors.push(`/inputSchema/properties/${name}/description must contain at most ${WEBMCP_TEXT_BUDGETS.parameterDescription} characters`);
      }
    }
  }

  const scope = requireRecord(tool.scope, '/scope', errors);
  if (scope) {
    hasOnlyKeys(scope, ['origin', 'pathRules', 'prerequisites'], '/scope', errors);
    requireString(scope.origin, '/scope/origin', errors);
    requireStringArray(scope.prerequisites, '/scope/prerequisites', errors);
    if (!Array.isArray(scope.pathRules)) {
      errors.push('/scope/pathRules must be an array');
    } else {
      scope.pathRules.forEach((rule, index) => {
        const path = `/scope/pathRules/${index}`;
        const record = requireRecord(rule, path, errors);
        if (!record) return;
        hasOnlyKeys(record, ['kind', 'value'], path, errors);
        requireEnum(record.kind, pathRuleKinds, `${path}/kind`, errors);
        requireString(record.value, `${path}/value`, errors);
      });
    }
  }

  const annotations = requireRecord(tool.annotations, '/annotations', errors);
  if (annotations) {
    hasOnlyKeys(annotations, ['readOnlyHint', 'untrustedContentHint', 'riskClass'], '/annotations', errors);
    requireBoolean(annotations.readOnlyHint, '/annotations/readOnlyHint', errors);
    requireBoolean(annotations.untrustedContentHint, '/annotations/untrustedContentHint', errors);
    requireEnum(annotations.riskClass, riskClasses, '/annotations/riskClass', errors);
  }

  const provenance = requireRecord(tool.provenance, '/provenance', errors);
  if (provenance) {
    hasOnlyKeys(provenance, ['type', 'createdAt', 'nativeDependencies', 'repairHistory'], '/provenance', errors);
    requireEnum(provenance.type, provenanceTypes, '/provenance/type', errors);
    requireString(provenance.createdAt, '/provenance/createdAt', errors);
    requireStringArray(provenance.nativeDependencies, '/provenance/nativeDependencies', errors);
    requireStringArray(provenance.repairHistory, '/provenance/repairHistory', errors);
  }

  const graph = requireRecord(tool.workflowGraph, '/workflowGraph', errors);
  if (graph) {
    hasOnlyKeys(graph, ['entryNodeId', 'nodes', 'edges'], '/workflowGraph', errors);
    requireString(graph.entryNodeId, '/workflowGraph/entryNodeId', errors);
    if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      errors.push('/workflowGraph/nodes must be a non-empty array');
    } else {
      graph.nodes.forEach((node, index) => {
        const path = `/workflowGraph/nodes/${index}`;
        const record = requireRecord(node, path, errors);
        if (!record) return;
        hasOnlyKeys(record, ['id', 'type', 'label', 'config'], path, errors);
        requireString(record.id, `${path}/id`, errors);
        requireEnum(record.type, workflowNodeTypes, `${path}/type`, errors);
        requireString(record.label, `${path}/label`, errors);
        requireRecord(record.config, `${path}/config`, errors);
      });
    }
    if (!Array.isArray(graph.edges)) {
      errors.push('/workflowGraph/edges must be an array');
    } else {
      graph.edges.forEach((edge, index) => {
        const path = `/workflowGraph/edges/${index}`;
        const record = requireRecord(edge, path, errors);
        if (!record) return;
        hasOnlyKeys(record, ['id', 'source', 'target', 'condition'], path, errors);
        requireString(record.id, `${path}/id`, errors);
        requireString(record.source, `${path}/source`, errors);
        requireString(record.target, `${path}/target`, errors);
        if (record.condition !== undefined && typeof record.condition !== 'string') {
          errors.push(`${path}/condition must be a string`);
        }
      });
    }
  }

  const health = requireRecord(tool.health, '/health', errors);
  if (health) {
    hasOnlyKeys(health, ['state', 'lastVerifiedAt', 'confidence'], '/health', errors);
    requireEnum(health.state, healthStates, '/health/state', errors);
    if (health.lastVerifiedAt !== undefined && typeof health.lastVerifiedAt !== 'string') {
      errors.push('/health/lastVerifiedAt must be a string');
    }
    if (health.confidence !== undefined
      && (typeof health.confidence !== 'number' || health.confidence < 0 || health.confidence > 100)) {
      errors.push('/health/confidence must be a number from 0 to 100');
    }
  }

  return successOrFailure<PersonalToolRecord>(value, errors);
}

export function assertPersonalTool(value: unknown): asserts value is PersonalToolRecord {
  const result = validatePersonalTool(value);
  if (!result.valid) throw new ContractValidationError('Invalid personal tool record.', result.errors);
}

function matchesType(type: unknown, value: unknown): boolean {
  if (Array.isArray(type)) return type.some((candidate) => matchesType(candidate, value));
  switch (type) {
    case undefined: return true;
    case 'null': return value === null;
    case 'object': return isRecord(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isInteger(value);
    case 'boolean': return typeof value === 'boolean';
    default: return false;
  }
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function validateSchemaValue(schema: JsonSchema, value: unknown, path: string, errors: string[]) {
  if (!matchesType(schema.type, value)) {
    errors.push(`${path || '/'} has the wrong type`);
    return;
  }
  if (schema.const !== undefined && !sameJsonValue(schema.const, value)) {
    errors.push(`${path || '/'} must equal the declared constant`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => sameJsonValue(candidate, value))) {
    errors.push(`${path || '/'} must be one of the allowed values`);
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${path || '/'} is shorter than minLength`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      errors.push(`${path || '/'} is longer than maxLength`);
    }
    if (typeof schema.pattern === 'string') {
      try {
        if (!new RegExp(schema.pattern).test(value)) errors.push(`${path || '/'} does not match pattern`);
      } catch {
        errors.push(`${path || '/'} uses an invalid schema pattern`);
      }
    }
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      errors.push(`${path || '/'} is below minimum`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      errors.push(`${path || '/'} is above maximum`);
    }
  }

  if (Array.isArray(value) && isRecord(schema.items)) {
    value.forEach((item, index) => {
      validateSchemaValue(schema.items as JsonSchema, item, `${path}/${index}`, errors);
    });
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [];
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}/${key} is required`);
    }
    for (const [key, item] of Object.entries(value)) {
      const propertySchema = properties[key];
      if (isRecord(propertySchema)) {
        validateSchemaValue(propertySchema, item, `${path}/${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}/${key} is not allowed`);
      } else if (isRecord(schema.additionalProperties)) {
        validateSchemaValue(schema.additionalProperties, item, `${path}/${key}`, errors);
      }
    }
  }
}

export function validateInvocationInput(
  inputSchema: JsonSchema,
  value: unknown,
): ContractValidationResult<Record<string, unknown>> {
  const errors: string[] = [];
  validateSchemaValue(inputSchema, value, '', errors);
  return successOrFailure<Record<string, unknown>>(value, errors);
}
