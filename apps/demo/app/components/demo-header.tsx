interface DemoHeaderProps {
  current?: 'legacy' | 'configurator' | 'travel';
  productName?: string;
}

export function DemoHeader({ current, productName = 'PersonalWebMCP demos' }: DemoHeaderProps) {
  return (
    <header className="demo-header">
      <a className="brand" href="/" aria-label="PersonalWebMCP demo home">
        <span className="brand-mark" aria-hidden="true">P</span>
        <span>{productName}</span>
      </a>
      <nav aria-label="Controlled demos">
        <a className={current === 'legacy' ? 'current' : ''} href="/legacy">Legacy portal</a>
        <a className={current === 'configurator' ? 'current' : ''} href="/configurator">Configurator</a>
        <a className={current === 'travel' ? 'current' : ''} href="/travel">Hybrid travel</a>
      </nav>
      <span className="status-pill">Deterministic · Local</span>
    </header>
  );
}
