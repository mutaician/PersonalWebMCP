import { DemoHeader } from './components/demo-header';

export default function Home() {
  return (
    <main>
      <DemoHeader productName="PersonalWebMCP" />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A user-owned capability layer for the agentic web</p>
          <h1>Teach the web once.<br />Reuse it as a tool.</h1>
          <p className="lede">
            Demonstrate the browser workflow you repeat, choose what should vary,
            and PersonalWebMCP turns it into a typed capability your agent can use.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/legacy">Open legacy demo</a>
            <a className="secondary-action" href="#controlled-demos">Explore all demos</a>
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

      <section className="demo-directory" id="controlled-demos">
        <div className="directory-heading">
          <p className="eyebrow">Controlled environments</p>
          <h2>Three sites. One capability layer.</h2>
          <p>Every route uses fictional, deterministic data and resets to a known starting state.</p>
        </div>
        <div className="demo-grid">
          <a className="demo-card legacy" href="/legacy">
            <span>01 · NO NATIVE TOOLS</span>
            <h3>Supplier Portal</h3>
            <p>Teach a missing invoice workflow on a realistic legacy interface.</p>
            <strong>Open portal →</strong>
          </a>
          <a className="demo-card configurator" href="/configurator">
            <span>02 · NATIVE FOUNDATION</span>
            <h3>Forma Configurator</h3>
            <p>Build a preferred desk from fine-grained site capabilities.</p>
            <strong>Open configurator →</strong>
          </a>
          <a className="demo-card travel" href="/travel">
            <span>03 · HYBRID FOUNDATION</span>
            <h3>Wayfinder Travel</h3>
            <p>Combine native trip search with personal interface preferences.</p>
            <strong>Open travel →</strong>
          </a>
        </div>
      </section>
    </main>
  );
}
