'use client';

import { useEffect, useMemo, useState } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { resetDemoDeveloperState } from '../components/developer-events';
import { demoInvoices, type DemoInvoice, type InvoiceStatus } from '../demo-data';

type LegacyModule = 'dashboard' | 'invoices' | 'orders' | 'documents' | 'support' | 'account';
type InvoiceStatusFilter = 'All' | InvoiceStatus;
type InvoiceSort = 'newest' | 'oldest' | 'amount-desc' | 'amount-asc';
type PortalVariant = 'classic' | 'redesigned';

const purchaseOrders = [
  { id: 'PO-8814', supplier: 'Redwood Components', created: '2026-08-24', owner: 'M. Mugo', total: 12480, status: 'Awaiting approval' },
  { id: 'PO-8807', supplier: 'Northstar Paper Co.', created: '2026-08-20', owner: 'J. Otieno', total: 4280, status: 'Issued' },
  { id: 'PO-8792', supplier: 'Cobalt Safety Group', created: '2026-08-12', owner: 'M. Mugo', total: 7960, status: 'Part received' },
  { id: 'PO-8775', supplier: 'Harborline Logistics', created: '2026-07-30', owner: 'R. Shah', total: 9120, status: 'Closed' },
  { id: 'PO-8751', supplier: 'Kestrel Office Works', created: '2026-07-18', owner: 'J. Otieno', total: 3870, status: 'Closed' },
];

const portalDocuments = [
  { id: 'DOC-401', name: 'Q3 supplier insurance register.xls', type: 'Spreadsheet', updated: '2026-08-25 14:32', size: '184 KB', owner: 'M. Mugo' },
  { id: 'DOC-397', name: 'Warehouse safety inspection.pdf', type: 'PDF Document', updated: '2026-08-21 09:08', size: '2.4 MB', owner: 'R. Shah' },
  { id: 'DOC-390', name: 'Approved vendor list - August.csv', type: 'CSV File', updated: '2026-08-18 16:44', size: '76 KB', owner: 'System' },
  { id: 'DOC-384', name: 'Freight contract amendment.doc', type: 'Word Document', updated: '2026-08-11 11:27', size: '312 KB', owner: 'M. Mugo' },
  { id: 'DOC-371', name: 'Purchase policy v6.pdf', type: 'PDF Document', updated: '2026-07-29 08:15', size: '1.1 MB', owner: 'J. Otieno' },
];

const initialTickets = [
  { id: 'SR-1902', subject: 'Invoice import rejected', priority: 'High', state: 'In progress', updated: 'Today 10:42' },
  { id: 'SR-1881', subject: 'New approver access', priority: 'Normal', state: 'Waiting for you', updated: 'Yesterday 15:10' },
  { id: 'SR-1844', subject: 'Vendor record duplicate', priority: 'Low', state: 'Resolved', updated: '21 Aug 2026' },
];

const modules: Array<{ id: LegacyModule; label: string; key: string }> = [
  { id: 'dashboard', label: 'Control Center', key: 'F2' },
  { id: 'invoices', label: 'Invoice Register', key: 'F3' },
  { id: 'orders', label: 'Purchase Orders', key: 'F4' },
  { id: 'documents', label: 'Document Archive', key: 'F5' },
  { id: 'support', label: 'Service Desk', key: 'F6' },
  { id: 'account', label: 'User Account', key: 'F7' },
];

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function LegacyPortalPage() {
  const [variant, setVariant] = useState<PortalVariant>('classic');
  const [activeModule, setActiveModule] = useState<LegacyModule>('dashboard');
  const [vendor, setVendor] = useState('');
  const [minimum, setMinimum] = useState('0');
  const [status, setStatus] = useState<InvoiceStatusFilter>('All');
  const [sort, setSort] = useState<InvoiceSort>('newest');
  const [query, setQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<DemoInvoice>();
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const [tickets, setTickets] = useState(initialTickets);
  const [ticketSubject, setTicketSubject] = useState('');
  const [accountName, setAccountName] = useState('Maya Mugo');
  const [systemMessage, setSystemMessage] = useState('Ready');

  useEffect(() => {
    const syncFromLocation = () => {
      const search = new URLSearchParams(window.location.search);
      const requestedVariant = search.get('variant');
      const requestedModule = search.get('module');
      setVariant(requestedVariant === 'redesigned' ? 'redesigned' : 'classic');
      if (modules.some((module) => module.id === requestedModule)) setActiveModule(requestedModule as LegacyModule);
      else if (requestedVariant === 'redesigned' || requestedVariant === 'classic') setActiveModule('invoices');
      else setActiveModule('dashboard');
    };
    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const vendors = useMemo(() => [...new Set(demoInvoices.map((invoice) => invoice.vendor))].sort(), []);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleInvoices = useMemo(() => {
    const threshold = Number(minimum) || 0;
    const matching = demoInvoices
      .filter((invoice) => (!vendor || invoice.vendor === vendor)
        && invoice.amount >= threshold
        && (status === 'All' || invoice.status === status)
        && (!normalizedQuery || [invoice.id, invoice.vendor, invoice.reference].join(' ').toLowerCase().includes(normalizedQuery)));

    return matching.sort((left, right) => {
      if (sort === 'oldest') return left.issuedAt.localeCompare(right.issuedAt);
      if (sort === 'amount-desc') return right.amount - left.amount;
      if (sort === 'amount-asc') return left.amount - right.amount;
      return right.issuedAt.localeCompare(left.issuedAt);
    });
  }, [minimum, normalizedQuery, sort, status, vendor]);

  const matchingOrders = purchaseOrders.filter((order) => (
    !normalizedQuery || [order.id, order.supplier, order.status].join(' ').toLowerCase().includes(normalizedQuery)
  ));
  const matchingDocuments = portalDocuments.filter((document) => (
    !normalizedQuery || [document.id, document.name, document.type].join(' ').toLowerCase().includes(normalizedQuery)
  ));
  const selectedOrder = purchaseOrders.find((order) => order.id === selectedOrderId);
  const selectedDocument = portalDocuments.find((document) => document.id === selectedDocumentId);

  const openModule = (module: LegacyModule) => {
    setActiveModule(module);
    const url = new URL(window.location.href);
    url.searchParams.set('module', module);
    window.history.pushState(null, '', `${url.pathname}${url.search}`);
    setSystemMessage((modules.find((item) => item.id === module)?.label ?? module) + ' loaded');
  };

  const changeVariant = (nextVariant: PortalVariant) => {
    setVariant(nextVariant);
    const url = new URL(window.location.href);
    url.searchParams.set('module', activeModule);
    url.searchParams.set('variant', nextVariant);
    window.history.pushState(null, '', `${url.pathname}${url.search}`);
  };

  const reset = () => {
    setActiveModule('dashboard');
    setVendor('');
    setMinimum('0');
    setStatus('All');
    setSort('newest');
    setQuery('');
    setSelectedInvoice(undefined);
    setSelectedOrderId(undefined);
    setSelectedDocumentId(undefined);
    setTickets(initialTickets);
    setTicketSubject('');
    setAccountName('Maya Mugo');
    setSystemMessage('Application state reset');
    window.history.replaceState(null, '', '/legacy');
    resetDemoDeveloperState();
  };

  const createTicket = () => {
    const subject = ticketSubject.trim();
    if (!subject) return;
    setTickets((current) => [{
      id: 'SR-' + (1903 + current.length),
      subject,
      priority: 'Normal',
      state: 'New',
      updated: 'Just now',
    }, ...current]);
    setTicketSubject('');
    setSystemMessage('Service request created');
  };

  const clearInvoiceFilters = () => {
    setVendor('');
    setMinimum('0');
    setStatus('All');
    setSort('newest');
  };

  const invoiceHref = (invoice: DemoInvoice, destinationVariant: PortalVariant = variant) => (
    `/legacy/invoices/${invoice.id}?variant=${destinationVariant}`
  );

  if (variant === 'redesigned') {
    return (
      <main className="atlas-portal" data-dom-variant="redesigned">
        <header className="atlas-topbar">
          <a className="atlas-brand" href="/"><span>A</span><div><strong>Atlas</strong><small>Supplier workspace</small></div></a>
          <label className="atlas-global-search"><span>Search workspace</span><input id="redesigned-global-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoices, suppliers, documents…" /></label>
          <div className="atlas-top-actions"><button type="button" onClick={() => changeVariant('classic')}>Use classic console</button><span className="atlas-avatar">MM</span></div>
        </header>

        <div className="atlas-frame">
          <aside className="atlas-sidebar">
            <div className="atlas-workspace-label">PROCUREMENT / EAST AFRICA</div>
            <nav aria-label="Application modules">
              {modules.map((module) => (
                <button className={activeModule === module.id ? 'active' : ''} type="button" onClick={() => openModule(module.id)} key={module.id}>
                  <span aria-hidden="true">{module.id === 'dashboard' ? '⌂' : module.id === 'invoices' ? '▤' : module.id === 'orders' ? '◫' : module.id === 'documents' ? '□' : module.id === 'support' ? '?' : '○'}</span>
                  {module.id === 'dashboard' ? 'Overview' : module.id === 'invoices' ? 'Invoices' : module.id === 'orders' ? 'Purchase orders' : module.id === 'documents' ? 'Documents' : module.id === 'support' ? 'Support' : 'Account'}
                  {module.id === 'invoices' && <b>{demoInvoices.filter((invoice) => invoice.status !== 'Paid').length}</b>}
                </button>
              ))}
            </nav>
            <div className="atlas-sidebar-foot"><span className="online-dot" />All systems operational<small>Last synced moments ago</small></div>
          </aside>

          <section className="atlas-content">
            <div className="atlas-page-heading">
              <div><span>ATLAS PROCUREMENT</span><h1>{activeModule === 'dashboard' ? 'Overview' : modules.find((module) => module.id === activeModule)?.label.replace(' Register', '').replace(' Archive', '').replace('User ', '')}</h1></div>
              <button type="button" className="atlas-secondary" onClick={reset}>Reset demo</button>
            </div>

            {activeModule === 'dashboard' && (
              <div className="atlas-dashboard">
                <section className="atlas-welcome"><div><span>Wednesday, 30 August</span><h2>Good morning, Maya.</h2><p>Here is what needs attention across procurement today.</p></div><button type="button" onClick={() => openModule('invoices')}>Review open invoices →</button></section>
                <div className="atlas-metric-grid">
                  <button type="button" onClick={() => openModule('invoices')}><span>Outstanding balance</span><strong>{currency.format(demoInvoices.filter((invoice) => invoice.status !== 'Paid').reduce((sum, invoice) => sum + invoice.amount, 0))}</strong><small>7 open invoices</small></button>
                  <button type="button" onClick={() => openModule('orders')}><span>Purchase orders</span><strong>5</strong><small>1 awaiting approval</small></button>
                  <button type="button" onClick={() => openModule('documents')}><span>Documents updated</span><strong>3</strong><small>During the last 7 days</small></button>
                  <button type="button" onClick={() => openModule('support')}><span>Support requests</span><strong>2</strong><small>Need your response</small></button>
                </div>
                <div className="atlas-dashboard-columns">
                  <section className="atlas-surface"><div className="atlas-section-heading"><div><span>PRIORITY QUEUE</span><h2>Needs your attention</h2></div><button type="button">View all</button></div>
                    {[['Approval', 'PO-8814', 'Redwood Components order', '2 days'], ['Overdue', 'INV-2022', 'Acme warehouse fittings', '2 days'], ['Support', 'SR-1881', 'New approver access', '1 day']].map((item) => <button type="button" className="atlas-attention-row" key={item[1]}><span>{item[0]}</span><div><strong>{item[1]}</strong><small>{item[2]}</small></div><time>{item[3]}</time></button>)}
                  </section>
                  <section className="atlas-surface atlas-activity"><div className="atlas-section-heading"><div><span>RECENT ACTIVITY</span><h2>Workspace updates</h2></div></div><p><i />Invoice INV-2048 imported <time>12 min ago</time></p><p><i />PO-8807 issued to supplier <time>2 hr ago</time></p><p><i />Insurance register updated <time>Yesterday</time></p></section>
                </div>
              </div>
            )}

            {activeModule === 'invoices' && (
              <div className="atlas-invoices">
                <section className="atlas-surface atlas-filter-panel" aria-label="Invoice filters">
                  <div className="atlas-filter-heading"><div><span>FIND INVOICES</span><strong>Filter the register</strong></div><button type="button" onClick={clearInvoiceFilters}>Clear all</button></div>
                  <div className="atlas-filter-fields">
                    <label htmlFor="redesigned-invoice-status">Status<select id="redesigned-invoice-status" value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatusFilter)}><option>All</option><option>Unpaid</option><option>Overdue</option><option>Paid</option></select></label>
                    <label htmlFor="redesigned-invoice-vendor">Vendor<select id="redesigned-invoice-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">All vendors</option>{vendors.map((item) => <option key={item}>{item}</option>)}</select></label>
                    <label htmlFor="redesigned-invoice-sort">Sort by<select id="redesigned-invoice-sort" value={sort} onChange={(event) => setSort(event.target.value as InvoiceSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-desc">Highest amount</option><option value="amount-asc">Lowest amount</option></select></label>
                    <label htmlFor="redesigned-invoice-minimum">Minimum amount<input id="redesigned-invoice-minimum" type="number" min="0" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
                  </div>
                </section>
                <div className="atlas-results-summary"><div><strong>{visibleInvoices.length} invoices</strong><span>Matching the current view</span></div><button type="button" onClick={() => setSystemMessage('Invoice register exported')}>Export CSV</button></div>
                <div className="atlas-invoice-cards">
                  {visibleInvoices.map((invoice) => (
                    <article className="atlas-invoice-card" key={invoice.id}>
                      <div className="atlas-invoice-state"><span className={'atlas-status ' + invoice.status.toLowerCase()}>{invoice.status}</span><strong>{currency.format(invoice.amount)}</strong></div>
                      <div className="atlas-invoice-identity"><small>{invoice.id}</small><h2>{invoice.vendor}</h2><p>{invoice.reference}</p></div>
                      <dl><div><dt>Issued</dt><dd>{invoice.issuedAt}</dd></div><div><dt>Due</dt><dd>{invoice.dueAt}</dd></div></dl>
                      <a href={invoiceHref(invoice, 'redesigned')} aria-label={`Open invoice ${invoice.id}`}>Open invoice <span>→</span></a>
                    </article>
                  ))}
                </div>
                {visibleInvoices.length === 0 && <div className="atlas-empty"><strong>No matching invoices</strong><p>Clear a filter or lower the minimum amount.</p></div>}
              </div>
            )}

            {activeModule === 'orders' && (
              <section className="atlas-surface atlas-list-page"><div className="atlas-section-heading"><div><span>ORDER PIPELINE</span><h2>Purchase orders</h2></div><button type="button" onClick={() => setSystemMessage('New purchase order draft created')}>+ New order</button></div>
                {matchingOrders.map((order) => <button type="button" className={selectedOrderId === order.id ? 'selected' : ''} onClick={() => setSelectedOrderId(order.id)} key={order.id}><div><small>{order.id}</small><strong>{order.supplier}</strong></div><span>{order.owner}</span><span>{order.created}</span><span>{order.status}</span><b>{currency.format(order.total)}</b></button>)}
              </section>
            )}

            {activeModule === 'documents' && (
              <section className="atlas-document-page"><div className="atlas-document-toolbar"><div><button className="active" type="button">All files</button><button type="button">Contracts</button><button type="button">Policies</button><button type="button">Supplier records</button></div><button type="button" onClick={() => setSystemMessage('Upload dialog opened')}>Upload document</button></div><div className="atlas-document-grid">{matchingDocuments.map((document) => <button type="button" className={selectedDocumentId === document.id ? 'selected' : ''} onClick={() => setSelectedDocumentId(document.id)} key={document.id}><span>DOC</span><strong>{document.name}</strong><small>{document.type} · {document.size}</small><time>{document.updated}</time></button>)}</div></section>
            )}

            {activeModule === 'support' && (
              <div className="atlas-support-grid"><section className="atlas-surface"><div className="atlas-section-heading"><div><span>NEW REQUEST</span><h2>How can we help?</h2></div></div><label>Short description<input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder="Describe the issue" /></label><label>Category<select><option>Application problem</option><option>Access request</option><option>Data correction</option></select></label><button className="atlas-primary" type="button" onClick={createTicket}>Submit request</button></section><section className="atlas-surface atlas-ticket-list"><div className="atlas-section-heading"><div><span>YOUR REQUESTS</span><h2>Recent tickets</h2></div></div>{tickets.map((ticket) => <div key={ticket.id}><span>{ticket.priority}</span><p><strong>{ticket.subject}</strong><small>{ticket.id} · {ticket.updated}</small></p><b>{ticket.state}</b></div>)}</section></div>
            )}

            {activeModule === 'account' && (
              <section className="atlas-surface atlas-profile"><div className="atlas-profile-head"><span>MM</span><div><h2>{accountName}</h2><p>Operations Lead · Procurement</p></div></div><div className="atlas-profile-fields"><label>Display name<input value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label><label>Email address<input defaultValue="maya.mugo@atlas.example" /></label><label>Default cost center<select defaultValue="OPS-100"><option>OPS-100 — Operations</option><option>WH-210 — Warehouse</option></select></label><label>Interface language<select defaultValue="English"><option>English</option><option>French</option></select></label></div><button className="atlas-primary" type="button" onClick={() => setSystemMessage('User profile saved')}>Save profile</button></section>
            )}

            <div className="atlas-system-note"><span className="online-dot" />{systemMessage}</div>
          </section>
        </div>
        <div className="atlas-inspector"><DemoDeveloperPanel /></div>
      </main>
    );
  }

  return (
    <main className="legacy-os" data-dom-variant="original">
      <div className="legacy-titlebar">
        <span className="legacy-app-icon">A</span>
        <strong>Atlas Procurement Console 6.2 — [PRODUCTION]</strong>
        <div><button aria-label="Minimize">_</button><button aria-label="Maximize">□</button><a href="/" aria-label="Close and return home">×</a></div>
      </div>
      <div className="legacy-menubar" role="menubar">
        {['File', 'Edit', 'View', 'Records', 'Reports', 'Tools', 'Window', 'Help'].map((item) => <button role="menuitem" type="button" key={item}>{item}</button>)}
      </div>
      <div className="legacy-toolbar">
        <button type="button" onClick={() => openModule('dashboard')}><span>⌂</span>Home</button>
        <button type="button" onClick={() => setSystemMessage('New-record wizard opened')}><span>▤</span>New</button>
        <button type="button" onClick={() => setSystemMessage('Current record saved')}><span>▣</span>Save</button>
        <i />
        <button type="button" onClick={() => setSystemMessage('Records refreshed at ' + new Date().toLocaleTimeString())}><span>↻</span>Refresh</button>
        <button type="button" onClick={() => window.print()}><span>▧</span>Print</button>
        <i />
        <label>Quick Find:<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="button" onClick={reset}><span>↺</span>Reset</button>
        <button type="button" onClick={() => changeVariant('redesigned')}><span>↗</span>New Portal</button>
      </div>

      <div className="legacy-shell">
        <aside className="legacy-tree">
          <div className="legacy-pane-title">Navigator</div>
          <div className="legacy-tree-root">▾ <strong>Atlas Operations</strong></div>
          <nav aria-label="Application modules">
            {modules.map((module) => (
              <button className={activeModule === module.id ? 'active' : ''} type="button" onClick={() => openModule(module.id)} key={module.id}>
                <span className={'legacy-nav-icon ' + module.id} aria-hidden="true" />
                <span>{module.label}<small>{module.key}</small></span>
              </button>
            ))}
          </nav>
          <div className="legacy-server"><span>SERVER</span><strong>ATLAS-SQL-02</strong><small>● Connected · 18 ms</small></div>
        </aside>

        <section className="legacy-workarea">
          <div className="legacy-window-title">
            <span>{modules.find((module) => module.id === activeModule)?.label}</span>
            <div><button type="button">_</button><button type="button">□</button><button type="button">×</button></div>
          </div>

          {activeModule === 'dashboard' && (
            <div className="legacy-module dashboard-module">
              <div className="legacy-welcome"><strong>Good morning, Maya</strong><span>Wednesday, 30 August 2026 · Financial period 08/2026</span></div>
              <div className="legacy-groupbox summary-box"><span>Period Summary</span>
                <div className="legacy-kpis">
                  <button type="button" onClick={() => openModule('invoices')}><span>Open invoices</span><strong>7</strong><small>$33,305 outstanding</small></button>
                  <button type="button" onClick={() => openModule('orders')}><span>Purchase orders</span><strong>5</strong><small>1 awaiting approval</small></button>
                  <button type="button" onClick={() => openModule('documents')}><span>New documents</span><strong>3</strong><small>Updated this week</small></button>
                  <button type="button" onClick={() => openModule('support')}><span>Service requests</span><strong>2</strong><small>Need your response</small></button>
                </div>
              </div>
              <div className="legacy-dashboard-grid">
                <div className="legacy-groupbox"><span>Items Requiring Attention</span>
                  <table><thead><tr><th>Type</th><th>Reference</th><th>Description</th><th>Age</th></tr></thead><tbody>
                    <tr><td>Approval</td><td>PO-8814</td><td>Redwood Components order</td><td>2 days</td></tr>
                    <tr><td>Overdue</td><td>INV-2022</td><td>Acme warehouse fittings</td><td>2 days</td></tr>
                    <tr><td>Support</td><td>SR-1881</td><td>New approver access</td><td>1 day</td></tr>
                  </tbody></table>
                </div>
                <div className="legacy-groupbox"><span>Common Tasks</span><div className="legacy-task-list">
                  <button type="button" onClick={() => openModule('invoices')}>Find supplier invoice</button>
                  <button type="button" onClick={() => openModule('orders')}>Review pending orders</button>
                  <button type="button" onClick={() => openModule('documents')}>Open document archive</button>
                  <button type="button" onClick={() => openModule('support')}>Create service request</button>
                </div></div>
              </div>
            </div>
          )}

          {activeModule === 'invoices' && (
            <div className="legacy-module">
              <div className="legacy-groupbox"><span>Invoice Selection Criteria</span><div className="legacy-form-grid">
                <label htmlFor="classic-invoice-vendor">Vendor:<select id="classic-invoice-vendor" value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">(All Vendors)</option>{vendors.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label htmlFor="classic-invoice-status">Status:<select id="classic-invoice-status" value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatusFilter)}><option>All</option><option>Unpaid</option><option>Overdue</option><option>Paid</option></select></label>
                <label htmlFor="classic-invoice-minimum">Minimum Amount:<input id="classic-invoice-minimum" type="number" min="0" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
                <label htmlFor="classic-invoice-sort">Sort By:<select id="classic-invoice-sort" value={sort} onChange={(event) => setSort(event.target.value as InvoiceSort)}><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="amount-desc">Amount: High to Low</option><option value="amount-asc">Amount: Low to High</option></select></label>
                <button type="button" onClick={() => setSystemMessage(visibleInvoices.length + ' invoice records found')}>Run Query</button>
                <button type="button" onClick={clearInvoiceFilters}>Clear</button>
              </div></div>
              <div className="legacy-record-caption">Invoice Register — {visibleInvoices.length} record(s)</div>
              <div className="legacy-table-wrap"><table className="legacy-data-table"><thead><tr><th>Invoice No.</th><th>Vendor Name</th><th>Reference</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th className="numeric">Amount</th></tr></thead><tbody>
                {visibleInvoices.map((invoice) => <tr className={selectedInvoice?.id === invoice.id ? 'selected' : ''} onDoubleClick={() => window.location.assign(invoiceHref(invoice, 'classic'))} onClick={() => setSelectedInvoice(invoice)} key={invoice.id}><td>{invoice.id}</td><td>{invoice.vendor}</td><td>{invoice.reference}</td><td>{invoice.issuedAt}</td><td>{invoice.dueAt}</td><td>{invoice.status}</td><td className="numeric">{currency.format(invoice.amount)}</td></tr>)}
              </tbody></table></div>
              <div className="legacy-record-actions"><span>Double-click a row to open the invoice detail page.</span>{selectedInvoice ? <a className="legacy-button-link" href={invoiceHref(selectedInvoice, 'classic')}>Open Record</a> : <button type="button" disabled>Open Record</button>}</div>
            </div>
          )}

          {activeModule === 'orders' && (
            <div className="legacy-module">
              <div className="legacy-split-header"><div><strong>Purchase Order Register</strong><span>Fiscal year 2026 · All departments</span></div><button type="button" onClick={() => setSystemMessage('New purchase order wizard opened')}>New Purchase Order...</button></div>
              <div className="legacy-table-wrap"><table className="legacy-data-table"><thead><tr><th>PO Number</th><th>Supplier</th><th>Created</th><th>Owner</th><th>Status</th><th className="numeric">Total</th></tr></thead><tbody>
                {matchingOrders.map((order) => <tr className={selectedOrderId === order.id ? 'selected' : ''} onClick={() => setSelectedOrderId(order.id)} key={order.id}><td>{order.id}</td><td>{order.supplier}</td><td>{order.created}</td><td>{order.owner}</td><td>{order.status}</td><td className="numeric">{currency.format(order.total)}</td></tr>)}
              </tbody></table></div>
              {selectedOrder && <div className="legacy-properties"><strong>Order Properties</strong><dl><div><dt>Reference:</dt><dd>{selectedOrder.id}</dd></div><div><dt>Supplier:</dt><dd>{selectedOrder.supplier}</dd></div><div><dt>Current state:</dt><dd>{selectedOrder.status}</dd></div><div><dt>Order total:</dt><dd>{currency.format(selectedOrder.total)}</dd></div></dl><button type="button" onClick={() => setSystemMessage(selectedOrder.id + ' sent to printer')}>Print Order</button></div>}
            </div>
          )}

          {activeModule === 'documents' && (
            <div className="legacy-module legacy-document-module">
              <div className="legacy-folder-list"><strong>Archive Folders</strong>{['All Documents', 'Contracts', 'Policies', 'Supplier Records', 'Inspections', 'Exports'].map((folder, index) => <button className={index === 0 ? 'active' : ''} type="button" key={folder}>▰ {folder}</button>)}</div>
              <div className="legacy-files"><div className="legacy-record-caption">\\\\ATLAS-FILE-01\\Procurement\\Shared</div><table className="legacy-data-table"><thead><tr><th>Name</th><th>Type</th><th>Modified</th><th>Owner</th><th>Size</th></tr></thead><tbody>
                {matchingDocuments.map((document) => <tr className={selectedDocumentId === document.id ? 'selected' : ''} onDoubleClick={() => setSystemMessage(document.name + ' opened read-only')} onClick={() => setSelectedDocumentId(document.id)} key={document.id}><td>▤ {document.name}</td><td>{document.type}</td><td>{document.updated}</td><td>{document.owner}</td><td>{document.size}</td></tr>)}
              </tbody></table>{selectedDocument && <div className="legacy-file-preview"><strong>{selectedDocument.name}</strong><span>{selectedDocument.type} · {selectedDocument.size}</span><button type="button" onClick={() => setSystemMessage(selectedDocument.name + ' opened read-only')}>Open</button><button type="button" onClick={() => setSystemMessage('Document copied to Downloads')}>Save Copy...</button></div>}</div>
            </div>
          )}

          {activeModule === 'support' && (
            <div className="legacy-module">
              <div className="legacy-support-banner"><strong>Atlas Service Desk</strong><span>Support hours: Mon–Fri, 07:00–18:00 EAT · Average response: 42 minutes</span></div>
              <div className="legacy-groupbox"><span>Create Service Request</span><div className="legacy-ticket-form"><label>Short description:<input value={ticketSubject} onChange={(event) => setTicketSubject(event.target.value)} placeholder="Describe the issue" /></label><label>Category:<select><option>Application problem</option><option>Access request</option><option>Data correction</option></select></label><button type="button" onClick={createTicket}>Submit Request</button></div></div>
              <div className="legacy-record-caption">My Service Requests</div><table className="legacy-data-table"><thead><tr><th>Request</th><th>Subject</th><th>Priority</th><th>Status</th><th>Last Updated</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td>{ticket.id}</td><td>{ticket.subject}</td><td>{ticket.priority}</td><td>{ticket.state}</td><td>{ticket.updated}</td></tr>)}</tbody></table>
            </div>
          )}

          {activeModule === 'account' && (
            <div className="legacy-module">
              <div className="legacy-account-card"><div className="legacy-avatar">MM</div><div><strong>{accountName}</strong><span>Operations Lead · Procurement</span><small>User ID: MMUGO01</small></div></div>
              <div className="legacy-groupbox"><span>User Profile</span><div className="legacy-account-form"><label>Display Name:<input value={accountName} onChange={(event) => setAccountName(event.target.value)} /></label><label>E-mail Address:<input defaultValue="maya.mugo@atlas.example" /></label><label>Default Cost Center:<select defaultValue="OPS-100"><option>OPS-100 — Operations</option><option>WH-210 — Warehouse</option></select></label><label>Interface Language:<select defaultValue="English"><option>English</option><option>French</option></select></label><button type="button" onClick={() => setSystemMessage('User profile saved')}>Apply</button></div></div>
            </div>
          )}
        </section>
      </div>

      <div className="legacy-statusbar"><span>{systemMessage}</span><span>NUM</span><span>CAPS</span><span>ATLAS\\MMUGO01</span></div>
      <div className="legacy-inspector-wrap"><DemoDeveloperPanel /></div>
    </main>
  );
}
