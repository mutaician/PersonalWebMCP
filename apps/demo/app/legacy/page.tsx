'use client';

import { useMemo, useState } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { resetDemoDeveloperState } from '../components/developer-events';
import { demoInvoices, type DemoInvoice, type InvoiceStatus } from '../demo-data';

type LegacyModule = 'dashboard' | 'invoices' | 'orders' | 'documents' | 'support' | 'account';
type InvoiceStatusFilter = 'All' | InvoiceStatus;

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
  const [activeModule, setActiveModule] = useState<LegacyModule>('dashboard');
  const [vendor, setVendor] = useState('');
  const [minimum, setMinimum] = useState('0');
  const [status, setStatus] = useState<InvoiceStatusFilter>('All');
  const [query, setQuery] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<DemoInvoice>();
  const [openedInvoice, setOpenedInvoice] = useState<DemoInvoice>();
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const [tickets, setTickets] = useState(initialTickets);
  const [ticketSubject, setTicketSubject] = useState('');
  const [accountName, setAccountName] = useState('Maya Mugo');
  const [systemMessage, setSystemMessage] = useState('Ready');

  const vendors = useMemo(() => [...new Set(demoInvoices.map((invoice) => invoice.vendor))].sort(), []);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleInvoices = useMemo(() => {
    const threshold = Number(minimum) || 0;
    return demoInvoices
      .filter((invoice) => (!vendor || invoice.vendor === vendor)
        && invoice.amount >= threshold
        && (status === 'All' || invoice.status === status)
        && (!normalizedQuery || [invoice.id, invoice.vendor, invoice.reference].join(' ').toLowerCase().includes(normalizedQuery)))
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  }, [minimum, normalizedQuery, status, vendor]);

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
    setSystemMessage((modules.find((item) => item.id === module)?.label ?? module) + ' loaded');
  };

  const reset = () => {
    setActiveModule('dashboard');
    setVendor('');
    setMinimum('0');
    setStatus('All');
    setQuery('');
    setSelectedInvoice(undefined);
    setOpenedInvoice(undefined);
    setSelectedOrderId(undefined);
    setSelectedDocumentId(undefined);
    setTickets(initialTickets);
    setTicketSubject('');
    setAccountName('Maya Mugo');
    setSystemMessage('Application state reset');
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

  return (
    <main className="legacy-os">
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
                <label>Vendor:<select value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">(All Vendors)</option>{vendors.map((item) => <option key={item}>{item}</option>)}</select></label>
                <label>Status:<select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatusFilter)}><option>All</option><option>Unpaid</option><option>Overdue</option><option>Paid</option></select></label>
                <label>Minimum Amount:<input type="number" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
                <button type="button" onClick={() => setSystemMessage(visibleInvoices.length + ' invoice records found')}>Run Query</button>
                <button type="button" onClick={() => { setVendor(''); setMinimum('0'); setStatus('All'); }}>Clear</button>
              </div></div>
              <div className="legacy-record-caption">Invoice Register — {visibleInvoices.length} record(s)</div>
              <div className="legacy-table-wrap"><table className="legacy-data-table"><thead><tr><th>Invoice No.</th><th>Vendor Name</th><th>Reference</th><th>Issue Date</th><th>Due Date</th><th>Status</th><th className="numeric">Amount</th></tr></thead><tbody>
                {visibleInvoices.map((invoice) => <tr className={selectedInvoice?.id === invoice.id ? 'selected' : ''} onDoubleClick={() => { setSelectedInvoice(invoice); setOpenedInvoice(invoice); }} onClick={() => setSelectedInvoice(invoice)} key={invoice.id}><td>{invoice.id}</td><td>{invoice.vendor}</td><td>{invoice.reference}</td><td>{invoice.issuedAt}</td><td>{invoice.dueAt}</td><td>{invoice.status}</td><td className="numeric">{currency.format(invoice.amount)}</td></tr>)}
              </tbody></table></div>
              <div className="legacy-record-actions"><span>Double-click a row to open the record.</span><button type="button" disabled={!selectedInvoice} onClick={() => setOpenedInvoice(selectedInvoice)}>Open Record</button></div>
              {openedInvoice && <div className="legacy-detail-dialog"><div className="legacy-window-title"><span>Invoice Detail: {openedInvoice.id}</span><button type="button" onClick={() => setOpenedInvoice(undefined)}>×</button></div><div className="legacy-detail-body"><dl><div><dt>Vendor</dt><dd>{openedInvoice.vendor}</dd></div><div><dt>Reference</dt><dd>{openedInvoice.reference}</dd></div><div><dt>Issued</dt><dd>{openedInvoice.issuedAt}</dd></div><div><dt>Due</dt><dd>{openedInvoice.dueAt}</dd></div><div><dt>Status</dt><dd>{openedInvoice.status}</dd></div><div><dt>Balance</dt><dd>{currency.format(openedInvoice.amount)}</dd></div></dl><div><button type="button">View Lines</button><button type="button">Payment History</button><button type="button" onClick={() => setOpenedInvoice(undefined)}>Close</button></div></div></div>}
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
