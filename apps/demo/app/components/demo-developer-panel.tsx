'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEMO_INVOCATION_EVENT,
  DEMO_RESET_EVENT,
  type DemoInvocationDetail,
} from './developer-events';

interface RegisteredToolSummary {
  name: string;
  origin: string;
}

interface ModelContextLike extends EventTarget {
  getTools: () => Promise<Array<{ name: string; origin?: string }>>;
}

export function DemoDeveloperPanel() {
  const [supported, setSupported] = useState(false);
  const [tools, setTools] = useState<RegisteredToolSummary[]>([]);
  const [lastInvocation, setLastInvocation] = useState<DemoInvocationDetail>();

  const refreshTools = useCallback(async () => {
    const modelContext = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    setSupported(Boolean(modelContext));
    if (!modelContext) {
      setTools([]);
      return;
    }
    try {
      const current = await modelContext.getTools();
      setTools(current.map((tool) => ({
        name: tool.name,
        origin: tool.origin ?? window.location.origin,
      })).sort((left, right) => left.name.localeCompare(right.name)));
    } catch {
      setTools([]);
    }
  }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    const onToolChange = () => void refreshTools();
    const onInvocation = (event: Event) => {
      setLastInvocation((event as CustomEvent<DemoInvocationDetail>).detail);
    };
    const onReset = () => setLastInvocation(undefined);

    void refreshTools();
    const refreshTimer = window.setInterval(() => void refreshTools(), 1500);
    modelContext?.addEventListener('toolchange', onToolChange);
    window.addEventListener(DEMO_INVOCATION_EVENT, onInvocation);
    window.addEventListener(DEMO_RESET_EVENT, onReset);
    return () => {
      window.clearInterval(refreshTimer);
      modelContext?.removeEventListener('toolchange', onToolChange);
      window.removeEventListener(DEMO_INVOCATION_EVENT, onInvocation);
      window.removeEventListener(DEMO_RESET_EVENT, onReset);
    };
  }, [refreshTools]);

  return (
    <aside className="developer-panel" aria-label="WebMCP developer status">
      <div className="developer-heading">
        <div><span>WEBMCP INSPECTOR</span><strong>Runtime state</strong></div>
        <span className={supported ? 'runtime-dot available' : 'runtime-dot'}>
          {supported ? 'Available' : 'Unavailable'}
        </span>
      </div>
      <div className="developer-grid">
        <section>
          <span className="developer-label">REGISTERED TOOLS · {tools.length}</span>
          {tools.length > 0 ? (
            <ul>{tools.map((tool) => <li key={`${tool.origin}:${tool.name}`}><code>{tool.name}</code><small>{tool.origin}</small></li>)}</ul>
          ) : <p>No tools registered in this page.</p>}
        </section>
        <section>
          <span className="developer-label">LAST DEMO INVOCATION</span>
          {lastInvocation ? (
            <div className="invocation-result">
              <code>{lastInvocation.toolName}</code>
              <pre>{JSON.stringify(lastInvocation.result, null, 2)}</pre>
            </div>
          ) : <p>No demo-native tool invoked yet.</p>}
        </section>
      </div>
    </aside>
  );
}
