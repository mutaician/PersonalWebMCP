export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="PersonalWebMCP home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>PersonalWebMCP</span>
        </a>
        <nav aria-label="Demo navigation">
          <a href="#how-it-works">Legacy portal</a>
          <a href="#how-it-works">Native tools</a>
          <a href="#how-it-works">Hybrid workflow</a>
        </nav>
        <span className="status-pill">Local build</span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A user-owned capability layer for the agentic web</p>
          <h1>Teach the web once.<br />Reuse it as a tool.</h1>
          <p className="lede">
            Demonstrate the browser workflow you repeat, choose what should vary,
            and PersonalWebMCP turns it into a typed capability your agent can use.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#how-it-works">Teach a workflow</a>
            <a className="secondary-action" href="#how-it-works">See how it works</a>
          </div>
          <dl className="proof-row">
            <div><dt>Legacy sites</dt><dd>Teach missing actions</dd></div>
            <div><dt>Native sites</dt><dd>Compose existing tools</dd></div>
            <div><dt>Changing sites</dt><dd>Repair semantically</dd></div>
          </dl>
        </div>

        <div className="panel-preview" aria-label="PersonalWebMCP side panel preview">
          <div className="panel-topline">
            <span className="panel-title">PersonalWebMCP</span>
            <span className="health-dot">Available</span>
          </div>
          <div className="origin-block">
            <span className="origin-label">CURRENT SITE</span>
            <strong>supplier.local</strong>
            <span className="native-count">0 native tools</span>
          </div>
          <div className="tool-list-heading">
            <span>PERSONAL TOOLS</span><span>1</span>
          </div>
          <article className="tool-card">
            <div className="tool-card-heading">
              <span className="tool-icon" aria-hidden="true">01</span>
              <div><strong>Open latest unpaid invoice</strong><span>Healthy</span></div>
            </div>
            <p>Find the newest unpaid invoice for a vendor above an amount.</p>
            <div className="tool-meta"><span>PERSONAL</span><span>2 parameters</span></div>
            <div className="tool-actions"><button type="button">Test</button><button type="button">Edit</button></div>
          </article>
          <button className="teach-button" type="button">+ Teach new capability</button>
          <div className="activity-line"><span className="activity-pulse" /><span>Last run completed visibly</span><time>now</time></div>
        </div>
      </section>

      <section className="capability-strip" id="how-it-works" aria-label="How PersonalWebMCP works">
        <span>01</span><p><strong>Demonstrate</strong> a workflow in the visible site.</p>
        <span>02</span><p><strong>Compile</strong> it into a named, typed capability.</p>
        <span>03</span><p><strong>Invoke</strong> it through WebMCP whenever you return.</p>
      </section>
    </main>
  );
}
