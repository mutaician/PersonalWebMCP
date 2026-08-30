export type InvoiceStatus = 'Unpaid' | 'Paid' | 'Overdue';

export interface DemoInvoice {
  id: string;
  vendor: string;
  issuedAt: string;
  dueAt: string;
  amount: number;
  status: InvoiceStatus;
  reference: string;
}

export const demoInvoices: DemoInvoice[] = [
  { id: 'INV-2048', vendor: 'Northstar Paper Co.', issuedAt: '2026-08-21', dueAt: '2026-09-20', amount: 4280, status: 'Unpaid', reference: 'Monthly stock' },
  { id: 'INV-2041', vendor: 'Acme Industrial Supply', issuedAt: '2026-08-18', dueAt: '2026-09-17', amount: 6850, status: 'Unpaid', reference: 'Safety equipment' },
  { id: 'INV-2034', vendor: 'Kestrel Office Works', issuedAt: '2026-08-10', dueAt: '2026-09-09', amount: 1190, status: 'Paid', reference: 'Workspace supplies' },
  { id: 'INV-2022', vendor: 'Acme Industrial Supply', issuedAt: '2026-07-29', dueAt: '2026-08-28', amount: 3240, status: 'Overdue', reference: 'Warehouse fittings' },
  { id: 'INV-2015', vendor: 'Northstar Paper Co.', issuedAt: '2026-07-23', dueAt: '2026-08-22', amount: 780, status: 'Paid', reference: 'Paper and labels' },
  { id: 'INV-2009', vendor: 'Harborline Logistics', issuedAt: '2026-07-14', dueAt: '2026-08-13', amount: 9120, status: 'Unpaid', reference: 'Regional freight' },
];

export const configuratorProducts = [
  { id: 'focus-desk', name: 'Focus Desk', basePrice: 640 },
  { id: 'studio-table', name: 'Studio Table', basePrice: 780 },
  { id: 'compact-console', name: 'Compact Console', basePrice: 520 },
] as const;

export const configuratorSizes = [
  { id: '120', label: '120 cm', price: 0 },
  { id: '150', label: '150 cm', price: 90 },
  { id: '180', label: '180 cm', price: 170 },
] as const;

export const configuratorFinishes = [
  { id: 'ash', label: 'Natural ash', swatch: '#d8bd8d', price: 0 },
  { id: 'walnut', label: 'Dark walnut', swatch: '#6e4b35', price: 120 },
  { id: 'graphite', label: 'Graphite', swatch: '#454c49', price: 70 },
] as const;

export const configuratorOptions = [
  { id: 'cable-tray', label: 'Cable tray', price: 45 },
  { id: 'monitor-shelf', label: 'Monitor shelf', price: 85 },
  { id: 'drawer', label: 'Slim drawer', price: 110 },
] as const;

export interface DemoTrip {
  id: string;
  carrier: string;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  duration: string;
  stops: number;
  price: number;
}

export const demoTrips: DemoTrip[] = [
  { id: 'SKY-142', carrier: 'Skyward Air', from: 'Nairobi', to: 'Lisbon', departAt: '08:20', arriveAt: '18:10', duration: '11h 50m', stops: 1, price: 684 },
  { id: 'MER-508', carrier: 'Meridian', from: 'Nairobi', to: 'Lisbon', departAt: '11:45', arriveAt: '22:05', duration: '12h 20m', stops: 1, price: 612 },
  { id: 'AUR-271', carrier: 'Aurora Lines', from: 'Nairobi', to: 'Lisbon', departAt: '19:10', arriveAt: '09:40', duration: '16h 30m', stops: 2, price: 548 },
];
