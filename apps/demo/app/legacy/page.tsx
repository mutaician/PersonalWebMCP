'use client';

import { useMemo, useState } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { DemoHeader } from '../components/demo-header';
import { resetDemoDeveloperState } from '../components/developer-events';
import { demoInvoices, type DemoInvoice, type InvoiceStatus } from '../demo-data';

const defaultFilters = {
  vendor: 'Acme Industrial Supply',
  minimum: '2000',
  status: 'Unpaid' as InvoiceStatus,
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function LegacyPortalPage() {
  const [vendor, setVendor] = useState(defaultFilters.vendor);
  const [minimum, setMinimum] = useState(defaultFilters.minimum);
  const [status, setStatus] = useState<InvoiceStatus>(defaultFilters.status);
  const [selected, setSelected] = useState<DemoInvoice>();

  const vendors = useMemo(() => [...new Set(demoInvoices.map((invoice) => invoice.vendor))].sort(), []);
  const visibleInvoices = useMemo(() => {
    const threshold = Number(minimum) || 0;
    return demoInvoices
      .filter((invoice) => (!vendor || invoice.vendor === vendor)
        && invoice.amount >= threshold
        && invoice.status === status)
      .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
  }, [minimum, status, vendor]);

  const reset = () => {
    setVendor(defaultFilters.vendor);
    setMinimum(defaultFilters.minimum);
    setStatus(defaultFilters.status);
    setSelected(undefined);
    resetDemoDeveloperState();
  };

  return (
    <main className="demo-page legacy-demo">
      <DemoHeader current="legacy" productName="Atlas Supplier Portal" />
      <section className="demo-titlebar">
        <div>
          <p className="eyebrow">Legacy environment · No native WebMCP tools</p>
          <h1>Invoice workspace</h1>
          <p>Review supplier balances and open the latest invoice that needs attention.</p>
        </div>
        <button className="reset-button" type="button" onClick={reset}>Reset demo</button>
      </section>

      <div className="workspace-layout">
        <aside className="portal-sidebar" aria-label="Supplier portal sections">
          <strong>Atlas Operations</strong>
          <nav>
            <a href="#summary">Dashboard</a>
            <a className="current" href="#invoices">Invoices <span>6</span></a>
            <a href="#purchase-orders">Purchase orders</a>
            <a href="#documents">Documents</a>
            <a href="#support">Support</a>
          </nav>
          <div className="account-chip"><span>MM</span><div><strong>Maya M.</strong><small>Operations lead</small></div></div>
        </aside>

        <section className="portal-content" id="invoices">
          <div className="metric-row" id="summary">
            <article><span>Outstanding</span><strong>$23,490</strong><small>4 open invoices</small></article>
            <article><span>Due this month</span><strong>$14,370</strong><small>Across 3 suppliers</small></article>
            <article><span>Overdue</span><strong>$3,240</strong><small>1 action required</small></article>
          </div>

          <section className="data-surface">
            <div className="surface-heading">
              <div><span className="section-label">INVOICES</span><h2>Supplier records</h2></div>
              <span>{visibleInvoices.length} matching</span>
            </div>
            <form className="filter-row" onSubmit={(event) => event.preventDefault()}>
              <label>Vendor
                <select value={vendor} onChange={(event) => setVendor(event.target.value)}>
                  <option value="">All vendors</option>
                  {vendors.map((item) => <option value={item} key={item}>{item}</option>)}
                </select>
              </label>
              <label>Minimum amount
                <input type="number" min="0" step="100" value={minimum} onChange={(event) => setMinimum(event.target.value)} />
              </label>
              <label>Status
                <select value={status} onChange={(event) => setStatus(event.target.value as InvoiceStatus)}>
                  <option>Unpaid</option><option>Overdue</option><option>Paid</option>
                </select>
              </label>
            </form>

            <div className="invoice-table" role="table" aria-label="Filtered invoices">
              <div className="invoice-row invoice-head" role="row">
                <span>Invoice</span><span>Vendor</span><span>Issued</span><span>Status</span><span>Amount</span><span />
              </div>
              {visibleInvoices.map((invoice) => (
                <div className="invoice-row" role="row" key={invoice.id}>
                  <strong>{invoice.id}<small>{invoice.reference}</small></strong>
                  <span>{invoice.vendor}</span>
                  <time dateTime={invoice.issuedAt}>{invoice.issuedAt}</time>
                  <span><mark className={`invoice-status ${invoice.status.toLowerCase()}`}>{invoice.status}</mark></span>
                  <strong>{currency.format(invoice.amount)}</strong>
                  <button type="button" onClick={() => setSelected(invoice)}>Open</button>
                </div>
              ))}
              {visibleInvoices.length === 0 && <p className="table-empty">No invoices match these filters.</p>}
            </div>
          </section>

          {selected && (
            <section className="invoice-detail" aria-live="polite">
              <div><span className="section-label">OPEN INVOICE</span><h2>{selected.id}</h2></div>
              <dl>
                <div><dt>Vendor</dt><dd>{selected.vendor}</dd></div>
                <div><dt>Reference</dt><dd>{selected.reference}</dd></div>
                <div><dt>Due</dt><dd>{selected.dueAt}</dd></div>
                <div><dt>Balance</dt><dd>{currency.format(selected.amount)}</dd></div>
              </dl>
              <button type="button" onClick={() => setSelected(undefined)}>Close details</button>
            </section>
          )}
        </section>
      </div>
      <DemoDeveloperPanel />
    </main>
  );
}
