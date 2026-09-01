'use client';

import { useEffect } from 'react';
import {
  configuratorFinishes,
  configuratorOptions,
  configuratorProducts,
  configuratorSizes,
} from '../demo-data';
import { reportDemoInvocation } from '../components/developer-events';

interface ModelContextLike {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input?: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => Promise<void>;
}

interface ConfiguratorActions {
  setProduct: (value: string) => void;
  setSize: (value: string) => void;
  setFinish: (value: string) => void;
  setOptions: (value: string[]) => void;
  setQuantity: (value: number) => void;
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') return inputRecord(JSON.parse(input));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object.');
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, name: string, allowed: readonly string[]): string {
  const value = input[name];
  if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}.`);
  return value;
}

export function useConfiguratorWebMcp(actions: ConfiguratorActions): void {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    if (!modelContext) return;
    const controllers: AbortController[] = [];
    const register = async () => {
      const productIds = configuratorProducts.map((item) => item.id);
      const sizeIds = configuratorSizes.map((item) => item.id);
      const finishIds = configuratorFinishes.map((item) => item.id);
      const optionIds: string[] = configuratorOptions.map((item) => item.id);
      const definitions = [
        {
          name: 'configurator_set_product', title: 'Choose furniture form', description: 'Changes the visible furniture model.',
          inputSchema: { type: 'object', properties: { product: { type: 'string', enum: productIds, default: 'focus-desk' } }, required: ['product'], additionalProperties: false },
          run: (input: Record<string, unknown>) => { const product = requiredString(input, 'product', productIds); actions.setProduct(product); return { product }; },
        },
        {
          name: 'configurator_set_size', title: 'Set workspace size', description: 'Changes the visible furniture width.',
          inputSchema: { type: 'object', properties: { size: { type: 'string', enum: sizeIds, default: '150' } }, required: ['size'], additionalProperties: false },
          run: (input: Record<string, unknown>) => { const size = requiredString(input, 'size', sizeIds); actions.setSize(size); return { size }; },
        },
        {
          name: 'configurator_set_finish', title: 'Set material finish', description: 'Changes the visible material and price.',
          inputSchema: { type: 'object', properties: { finish: { type: 'string', enum: finishIds, default: 'ash' } }, required: ['finish'], additionalProperties: false },
          run: (input: Record<string, unknown>) => { const finish = requiredString(input, 'finish', finishIds); actions.setFinish(finish); return { finish }; },
        },
        {
          name: 'configurator_set_options', title: 'Set workspace options', description: 'Replaces the visible add-on selection.',
          inputSchema: { type: 'object', properties: { options: { type: 'array', items: { type: 'string', enum: optionIds }, default: ['cable-tray'] } }, required: ['options'], additionalProperties: false },
          run: (input: Record<string, unknown>) => {
            const options = input.options;
            if (!Array.isArray(options) || options.some((item) => typeof item !== 'string' || !optionIds.includes(item))) throw new Error(`options must contain only: ${optionIds.join(', ')}.`);
            actions.setOptions(options as string[]);
            return { options };
          },
        },
        {
          name: 'configurator_set_quantity', title: 'Set project quantity', description: 'Changes the visible project quantity and total.',
          inputSchema: { type: 'object', properties: { quantity: { type: 'integer', minimum: 1, maximum: 8, default: 1 } }, required: ['quantity'], additionalProperties: false },
          run: (input: Record<string, unknown>) => {
            const quantity = input.quantity;
            if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 8) throw new Error('quantity must be an integer from 1 to 8.');
            actions.setQuantity(quantity as number);
            return { quantity };
          },
        },
      ];

      await Promise.all(definitions.map((definition) => {
        const controller = new AbortController();
        controllers.push(controller);
        return modelContext.registerTool({
          name: definition.name,
          title: definition.title,
          description: definition.description,
          inputSchema: definition.inputSchema,
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async (rawInput, options) => {
            options?.signal?.throwIfAborted();
            const result = { ok: true, ...definition.run(inputRecord(rawInput ?? {})) };
            reportDemoInvocation(definition.name, result);
            return result;
          },
        }, { signal: controller.signal });
      }));
    };
    void register().catch((error) => reportDemoInvocation('configurator_registration', {
      ok: false,
      error: error instanceof Error ? error.message : 'Native tool registration failed.',
    }));
    return () => controllers.forEach((controller) => controller.abort());
  }, [actions.setFinish, actions.setOptions, actions.setProduct, actions.setQuantity, actions.setSize]);
}
