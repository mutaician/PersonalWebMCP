import type { Metadata } from 'next';
import { demoInvoices } from '../../../demo-data';

interface InvoiceDetailPageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ variant?: string | string[] }>;
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const lineDescriptions: Record<string, string[]> = {
  'Northstar Paper Co.': ['A4 recycled copier paper', 'Thermal shipping labels', 'Archive storage cartons'],
  'Acme Industrial Supply': ['Industrial equipment supply', 'Site delivery and handling', 'Compliance documentation'],
  'Harborline Logistics': ['Regional freight service', 'Dock handling', 'Fuel adjustment'],
  'Kestrel Office Works': ['Workspace furniture and supplies', 'Assembly service', 'Delivery'],
  'Redwood Components': ['Assembly components', 'Quality-control batch inspection', 'Freight'],
  'Cobalt Safety Group': ['Protective equipment', 'Inspection supplies', 'Compliance handling'],
};

function getInvoiceLines(vendor: string, total: number) {
  const descriptions = lineDescriptions[vendor] ?? ['Supplier goods', 'Delivery service', 'Handling'];
  const first = Math.round(total * 0.64 * 100) / 100;
  const second = Math.round(total * 0.28 * 100) / 100;
  const third = Math.round((total - first - second) * 100) / 100;
  return descriptions.map((description, index) => ({
    description,
    quantity: index === 0 ? 4 : 1,
    amount: [first, second, third][index],
  }));
}

export async function generateMetadata({ params }: InvoiceDetailPageProps): Promise<Metadata> {
  const { invoiceId } = await params;
  const invoice = demoInvoices.find((item) => item.id === invoiceId);
  const title = invoice ? `${invoice.id} · ${invoice.vendor}` : 'Invoice not found';
  const description = invoice ? `${invoice.status} supplier invoice for ${currency.format(invoice.amount)}.` : 'The requested supplier invoice does not exist.';

  return {
    title,
    description,
    openGraph: { title, description, images: [] },
    twitter: { title, description, images: [] },
  };
}

export default async function InvoiceDetailPage({ params, searchParams }: InvoiceDetailPageProps) {
  const [{ invoiceId }, query] = await Promise.all([params, searchParams]);
  const invoice = demoInvoices.find((item) => item.id === invoiceId);
  const variantValue = Array.isArray(query.variant) ? query.variant[0] : query.variant;
  const redesigned = variantValue === 'redesigned';

  if (!invoice) {
    return (
      <main className={redesigned ? 'atlas-detail-page' : 'legacy-detail-page'}>
        <section className={redesigned ? 'atlas-detail-shell' : 'legacy-detail-window'}>
          <h1>Invoice not found</h1>
          <p>No supplier invoice has the reference {invoiceId}.</p>
          <a href="/legacy">Return to the invoice register</a>
        </section>
      </main>
    );
  }

  const lines = getInvoiceLines(invoice.vendor, invoice.amount);
  const backHref = `/legacy?module=invoices&variant=${redesigned ? 'redesigned' : 'classic'}`;

  if (redesigned) {
    return (
      <main className="atlas-detail-page" data-dom-variant="redesigned">
        <header className="atlas-detail-header"><a href="/"><span>A</span><strong>Atlas</strong></a><a href={backHref}>← Back to invoices</a></header>
        <article className="atlas-detail-shell">
          <div className="atlas-detail-title"><div><span>SUPPLIER INVOICE</span><h1>{invoice.id}</h1><p>{invoice.vendor}</p></div><div><span className={'atlas-status ' + invoice.status.toLowerCase()}>{invoice.status}</span><strong>{currency.format(invoice.amount)}</strong><small>Balance due</small></div></div>
          <div className="atlas-detail-facts"><dl><div><dt>Reference</dt><dd>{invoice.reference}</dd></div><div><dt>Issued</dt><dd>{invoice.issuedAt}</dd></div><div><dt>Due date</dt><dd>{invoice.dueAt}</dd></div><div><dt>Payment terms</dt><dd>Net 30</dd></div></dl><aside><span>SUPPLIER</span><strong>{invoice.vendor}</strong><p>Verified Atlas supplier<br />Account ending 4028</p></aside></div>
          <section className="atlas-line-items"><div><span>LINE ITEMS</span><h2>Invoice breakdown</h2></div><table><thead><tr><th>Description</th><th>Qty.</th><th>Amount</th></tr></thead><tbody>{lines.map((line) => <tr key={line.description}><td>{line.description}</td><td>{line.quantity}</td><td>{currency.format(line.amount)}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Invoice total</th><td>{currency.format(invoice.amount)}</td></tr></tfoot></table></section>
          <footer><p>Record verified against purchase documentation. No attachments are required.</p><button type="button">Download PDF</button><button type="button" className="atlas-primary">Schedule payment</button></footer>
        </article>
      </main>
    );
  }

  return (
    <main className="legacy-detail-page" data-dom-variant="original">
      <div className="legacy-titlebar"><span className="legacy-app-icon">A</span><strong>Atlas Procurement Console 6.2 — Invoice Maintenance</strong><div><button aria-label="Minimize">_</button><button aria-label="Maximize">□</button><a href="/legacy" aria-label="Close invoice">×</a></div></div>
      <div className="legacy-menubar"><button type="button">File</button><button type="button">Edit</button><button type="button">Record</button><button type="button">Reports</button><button type="button">Help</button></div>
      <article className="legacy-detail-window">
        <div className="legacy-window-title"><span>Invoice Detail: {invoice.id}</span><div><button type="button">_</button><button type="button">□</button><a href={backHref}>×</a></div></div>
        <div className="legacy-detail-commandbar"><a className="legacy-button-link" href={backHref}>← Return to Register</a><button type="button">Print</button><button type="button">Export</button></div>
        <div className="legacy-detail-heading"><span>Record Status: {invoice.status}</span><h1>{invoice.id}</h1><strong>{currency.format(invoice.amount)}</strong></div>
        <div className="legacy-detail-columns"><fieldset><legend>Invoice Information</legend><dl><div><dt>Vendor Name:</dt><dd>{invoice.vendor}</dd></div><div><dt>Description:</dt><dd>{invoice.reference}</dd></div><div><dt>Issue Date:</dt><dd>{invoice.issuedAt}</dd></div><div><dt>Due Date:</dt><dd>{invoice.dueAt}</dd></div><div><dt>Payment Terms:</dt><dd>NET30</dd></div><div><dt>Ledger Status:</dt><dd>{invoice.status.toUpperCase()}</dd></div></dl></fieldset><fieldset><legend>Supplier Master Record</legend><p><strong>{invoice.vendor}</strong><br />Vendor account: SUP-4028<br />Currency: USD<br />Validation: PASSED</p></fieldset></div>
        <div className="legacy-record-caption">Invoice Line Items</div><table className="legacy-data-table"><thead><tr><th>Line</th><th>Description</th><th>Quantity</th><th className="numeric">Line Amount</th></tr></thead><tbody>{lines.map((line, index) => <tr key={line.description}><td>{String(index + 1).padStart(3, '0')}</td><td>{line.description}</td><td>{line.quantity}</td><td className="numeric">{currency.format(line.amount)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>DOCUMENT TOTAL</th><th className="numeric">{currency.format(invoice.amount)}</th></tr></tfoot></table>
        <div className="legacy-record-actions"><span>Record verified against purchase documentation.</span><button type="button">Payment History</button><button type="button">View Attachments</button></div>
      </article>
      <div className="legacy-statusbar"><span>Invoice record loaded</span><span>NUM</span><span>ATLAS\\MMUGO01</span></div>
    </main>
  );
}
