export const DEMO_INVOCATION_EVENT = 'personal-webmcp:demo-invocation';
export const DEMO_RESET_EVENT = 'personal-webmcp:demo-reset';

export interface DemoInvocationDetail {
  toolName: string;
  result: unknown;
  occurredAt: string;
}

export function reportDemoInvocation(toolName: string, result: unknown) {
  window.dispatchEvent(new CustomEvent<DemoInvocationDetail>(DEMO_INVOCATION_EVENT, {
    detail: { toolName, result, occurredAt: new Date().toISOString() },
  }));
}

export function resetDemoDeveloperState() {
  window.dispatchEvent(new Event(DEMO_RESET_EVENT));
}
