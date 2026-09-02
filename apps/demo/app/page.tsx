import { DemoHeader } from './components/demo-header';

const repositoryUrl = 'https://github.com/mutaician/PersonalWebMCP';

export default function Home() {
  return (
    <main>
      <DemoHeader productName="PersonalWebMCP" />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Your capability layer for the agentic web</p>
          <h1>Make any website work your way.</h1>
          <p className="lede">
            WebMCP lets websites define capabilities for agents. PersonalWebMCP lets
            you define capabilities of your own: teach a workflow once, turn it into
            a reusable WebMCP tool, combine it with native site tools, and keep it
            useful as the website evolves.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href={`${repositoryUrl}#install-the-extension`} target="_blank" rel="noreferrer">Get the extension</a>
            <a className="secondary-action" href="/legacy">Try the legacy demo</a>
          </div>
          <dl className="proof-row">
            <div><dt>Teach</dt><dd>Add capabilities a site never exposed</dd></div>
            <div><dt>Personalize</dt><dd>Adapt and compose native WebMCP tools</dd></div>
            <div><dt>Repair</dt><dd>Keep tools useful as interfaces change</dd></div>
          </dl>
        </div>

        <div className="panel-preview" aria-label="PersonalWebMCP side panel preview">
          <div className="panel-topline">
            <span className="panel-title">PersonalWebMCP</span>
            <span className="health-dot">Available</span>
          </div>
          <div className="origin-block">
            <span className="origin-label">CURRENT SITE</span>
            <strong>forma.local</strong>
            <span className="native-count">5 native tools</span>
          </div>
          <div className="tool-list-heading">
            <span>PERSONAL CAPABILITY</span><span>1 agent input</span>
          </div>
          <article className="tool-card">
            <div className="tool-card-heading">
              <span className="tool-icon" aria-hidden="true">01</span>
              <div><strong>Prepare my studio workspace</strong><span>Registered through WebMCP</span></div>
            </div>
            <p>Apply my preferred product, size, finish and options, then add the design to my project.</p>
            <div className="tool-meta"><span>5 NATIVE TOOLS</span><span>1 TAUGHT ACTION</span></div>
            <div className="preview-input"><span>Agent supplies</span><strong>quantity</strong></div>
          </article>
          <button className="teach-button" type="button">+ Teach or compose a capability</button>
          <div className="activity-line"><span className="activity-pulse" /><span>Runs on the visible page</span><time>local-first</time></div>
        </div>
      </section>

      <section className="capability-strip" id="how-it-works" aria-label="How PersonalWebMCP works">
        <span>01</span><p><strong>Demonstrate</strong> the missing workflow.</p>
        <span>02</span><p><strong>Choose</strong> what stays fixed and what the agent supplies.</p>
        <span>03</span><p><strong>Compose</strong> taught actions with native site tools.</p>
        <span>04</span><p><strong>Register</strong> the result as a typed WebMCP capability.</p>
      </section>

      <section className="thesis-section">
        <div className="thesis-heading">
          <p className="eyebrow">One layer, two starting points</p>
          <h2>Use the capabilities a site has. Teach the ones it does not.</h2>
        </div>
        <div className="thesis-grid">
          <article>
            <span>NO NATIVE TOOLS</span>
            <h3>Teach a missing capability</h3>
            <p>Demonstrate a visible workflow, replace changing values with typed inputs, and expose the result to agents through WebMCP.</p>
            <a href="/legacy">Open the legacy portal →</a>
          </article>
          <article>
            <span>NATIVE WEBMCP TOOLS</span>
            <h3>Make existing tools personal</h3>
            <p>Remember your preferences, leave selected values under agent control, and combine native tools with actions you taught yourself.</p>
            <a href="/configurator">Open the configurator →</a>
          </article>
        </div>
      </section>

      <section className="demo-directory" id="controlled-demos">
        <div className="directory-heading">
          <p className="eyebrow">Controlled environments</p>
          <h2>Three ways to make the web yours.</h2>
          <p>Each fictional demo has deterministic data and a reset control, so capabilities can be taught and verified safely.</p>
        </div>
        <div className="demo-grid">
          <a className="demo-card legacy" href="/legacy">
            <span>01 · TEACH</span>
            <h3>Atlas Supplier Portal</h3>
            <p>Turn a multi-step invoice search on a tool-less legacy interface into one typed personal capability.</p>
            <strong>Open portal →</strong>
          </a>
          <a className="demo-card configurator" href="/configurator">
            <span>02 · PERSONALIZE + COMPOSE</span>
            <h3>Forma Configurator</h3>
            <p>Adapt five website-owned tools, add a missing taught action, and expose one personal setup to an agent.</p>
            <strong>Open configurator →</strong>
          </a>
          <a className="demo-card travel" href="/travel">
            <span>03 · HYBRID + REVIEW</span>
            <h3>Wayfinder Travel</h3>
            <p>Combine native trip tools with a personal preference and a human approval checkpoint.</p>
            <strong>Open travel →</strong>
          </a>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <p className="eyebrow">Built for user control</p>
          <h2>Your preferences become capabilities—not instructions you repeat.</h2>
          <p>PersonalWebMCP stores tools locally, scopes them to the site that created them, and registers them through the browser&apos;s WebMCP API. The long-term goal is the same personal capability working with any compatible agent.</p>
        </div>
        <div className="landing-cta-actions">
          <a className="primary-action" href={`${repositoryUrl}#install-the-extension`} target="_blank" rel="noreferrer">Install from source</a>
          <a className="secondary-action" href={repositoryUrl} target="_blank" rel="noreferrer">View on GitHub ↗</a>
        </div>
      </section>
    </main>
  );
}
