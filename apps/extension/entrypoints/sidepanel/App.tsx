import { useCallback, useEffect, useState } from 'react';
import type { TabCapabilityStatus } from '@personal-webmcp/contracts';

const emptyStatus: TabCapabilityStatus = {
  supported: false,
  registered: false,
  pageTitle: '',
  url: '',
  updatedAt: 0,
};

export default function App() {
  const [status, setStatus] = useState<TabCapabilityStatus>(emptyStatus);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const nextStatus = await browser.runtime.sendMessage({ type: 'GET_ACTIVE_STATUS' }) as TabCapabilityStatus | undefined;
    setStatus(nextStatus ?? emptyStatus);
  }, []);

  useEffect(() => {
    void refresh();
    const intervalId = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  const runSelfTest = async () => {
    setBusy(true);
    try {
      await browser.runtime.sendMessage({ type: 'RUN_PING_SELF_TEST' });
      window.setTimeout(() => void refresh(), 300);
    } finally {
      setBusy(false);
    }
  };

  let host = 'Open the local demo';
  try {
    host = status.url ? new URL(status.url).host : host;
  } catch {
    // Keep the readable fallback for malformed or unavailable tab URLs.
  }

  return (
    <main>
      <header>
        <div className="brand-mark" aria-hidden="true">P</div>
        <div>
          <p className="overline">CAPABILITY LAYER</p>
          <h1>PersonalWebMCP</h1>
        </div>
        <span className={status.supported ? 'support supported' : 'support'}>
          {status.supported ? 'Available' : 'Unavailable'}
        </span>
      </header>

      <nav aria-label="PersonalWebMCP sections">
        <button className="active" type="button">Overview</button>
        <button type="button" disabled>Teach</button>
        <button type="button" disabled>Tools</button>
        <button type="button" disabled>Activity</button>
      </nav>

      <section className="site-summary">
        <p className="overline">CURRENT SITE</p>
        <div className="site-row">
          <div>
            <strong>{host}</strong>
            <span>{status.pageTitle || 'No permitted page is active'}</span>
          </div>
          <span className="tool-count">{status.registered ? '1 tool' : '0 tools'}</span>
        </div>
      </section>

      <section className="bridge-card">
        <div className="bridge-heading">
          <span className="number">01</span>
          <div>
            <h2>WebMCP bridge</h2>
            <p>{status.registered ? 'Personal tool registered in the page context.' : 'Waiting for WebMCP registration.'}</p>
          </div>
        </div>

        <dl>
          <div><dt>Page API</dt><dd>{status.supported ? 'Detected' : 'Not detected'}</dd></div>
          <div><dt>Tool</dt><dd>{status.toolName ?? 'personal_ping'}</dd></div>
          <div><dt>Registration</dt><dd>{status.registered ? 'Active' : 'Inactive'}</dd></div>
        </dl>

        {status.error && <p className="error" role="alert">{status.error}</p>}

        <button className="test-button" type="button" onClick={runSelfTest} disabled={!status.registered || busy}>
          {busy ? 'Running…' : 'Run connection check'}
        </button>
      </section>

      <p className="hint">
        Open <code>http://localhost:3000</code> in WebMCP-enabled Chrome, then reload this panel.
      </p>
    </main>
  );
}
