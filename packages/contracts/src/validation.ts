import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import {
  BRIDGE_MESSAGE_TYPES,
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  type BridgeEnvelope,
} from './bridge';
import type { JsonSchema, PersonalToolRecord } from './models';

const ajv = new Ajv2020({ allErrors: true, strict: true });

const bridgeEnvelopeSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['source', 'version', 'tabSessionId', 'requestId', 'type', 'payload'],
  properties: {
    source: { const: BRIDGE_SOURCE },
    version: { const: BRIDGE_VERSION },
    tabSessionId: { type: 'string', minLength: 1 },
    requestId: { type: 'string', minLength: 1 },
    type: { enum: BRIDGE_MESSAGE_TYPES },
    payload: { type: 'object' },
  },
} as const;

const personalToolSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'version', 'webmcpName', 'title', 'description', 'scope', 'inputSchema',
    'annotations', 'provenance', 'workflowGraph', 'health', 'createdAt', 'updatedAt',
  ],
  properties: {
    id: { type: 'string', minLength: 1 },
    version: { type: 'integer', minimum: 1 },
    webmcpName: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_.-]+$' },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    scope: {
      type: 'object',
      additionalProperties: false,
      required: ['origin', 'pathRules', 'prerequisites'],
      properties: {
        origin: { type: 'string', minLength: 1 },
        pathRules: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'value'],
            properties: {
              kind: { enum: ['EXACT', 'PREFIX', 'PATTERN'] },
              value: { type: 'string', minLength: 1 },
            },
          },
        },
        prerequisites: { type: 'array', items: { type: 'string' } },
      },
    },
    inputSchema: { type: 'object' },
    annotations: {
      type: 'object',
      additionalProperties: false,
      required: ['readOnlyHint', 'untrustedContentHint', 'riskClass'],
      properties: {
        readOnlyHint: { type: 'boolean' },
        untrustedContentHint: { type: 'boolean' },
        riskClass: { enum: ['READ_ONLY', 'REVERSIBLE_WRITE', 'CONSEQUENTIAL'] },
      },
    },
    provenance: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'createdAt', 'nativeDependencies', 'repairHistory'],
      properties: {
        type: { enum: ['SYSTEM', 'TAUGHT', 'COMPOSITE', 'REPAIRED'] },
        createdAt: { type: 'string', minLength: 1 },
        nativeDependencies: { type: 'array', items: { type: 'string' } },
        repairHistory: { type: 'array', items: { type: 'string' } },
      },
    },
    workflowGraph: {
      type: 'object',
      additionalProperties: false,
      required: ['entryNodeId', 'nodes', 'edges'],
      properties: {
        entryNodeId: { type: 'string', minLength: 1 },
        nodes: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'type', 'label', 'config'],
            properties: {
              id: { type: 'string', minLength: 1 },
              type: {
                enum: [
                  'NATIVE_TOOL', 'DOM_INPUT', 'DOM_SELECT', 'DOM_ACTIVATE', 'NAVIGATE',
                  'WAIT_FOR', 'EXTRACT', 'ASSERT', 'BRANCH', 'PERSONAL_TOOL', 'HUMAN_CONFIRMATION',
                ],
              },
              label: { type: 'string', minLength: 1 },
              config: { type: 'object' },
            },
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'source', 'target'],
            properties: {
              id: { type: 'string', minLength: 1 },
              source: { type: 'string', minLength: 1 },
              target: { type: 'string', minLength: 1 },
              condition: { type: 'string' },
            },
          },
        },
      },
    },
    health: {
      type: 'object',
      additionalProperties: false,
      required: ['state'],
      properties: {
        state: { enum: ['UNVERIFIED', 'HEALTHY', 'NEEDS_REVIEW', 'BROKEN'] },
        lastVerifiedAt: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 100 },
      },
    },
    createdAt: { type: 'string', minLength: 1 },
    updatedAt: { type: 'string', minLength: 1 },
  },
} as const;

const bridgeValidator = ajv.compile<BridgeEnvelope>(bridgeEnvelopeSchema);
const personalToolValidator = ajv.compile<PersonalToolRecord>(personalToolSchema);

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

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
}

function resultFromValidator<T>(validator: ValidateFunction<T>, value: unknown): ContractValidationResult<T> {
  if (validator(value)) return { valid: true, value };
  return { valid: false, errors: formatErrors(validator.errors) };
}

export function validateBridgeEnvelope(value: unknown): ContractValidationResult<BridgeEnvelope> {
  return resultFromValidator(bridgeValidator, value);
}

export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  return bridgeValidator(value);
}

export function validatePersonalTool(value: unknown): ContractValidationResult<PersonalToolRecord> {
  return resultFromValidator(personalToolValidator, value);
}

export function assertPersonalTool(value: unknown): asserts value is PersonalToolRecord {
  const result = validatePersonalTool(value);
  if (!result.valid) throw new ContractValidationError('Invalid personal tool record.', result.errors);
}

export function validateInvocationInput(
  inputSchema: JsonSchema,
  value: unknown,
): ContractValidationResult<Record<string, unknown>> {
  let validator: ValidateFunction<Record<string, unknown>>;
  try {
    validator = ajv.compile<Record<string, unknown>>(inputSchema);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Input schema could not be compiled.'],
    };
  }

  return resultFromValidator(validator, value);
}
