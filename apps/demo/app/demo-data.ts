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
  { id: 'INV-2045', vendor: 'Cobalt Safety Group', issuedAt: '2026-08-20', dueAt: '2026-09-19', amount: 5320, status: 'Unpaid', reference: 'Site safety replenishment' },
  { id: 'INV-2041', vendor: 'Acme Industrial Supply', issuedAt: '2026-08-18', dueAt: '2026-09-17', amount: 6850, status: 'Unpaid', reference: 'Safety equipment' },
  { id: 'INV-2039', vendor: 'Harborline Logistics', issuedAt: '2026-08-16', dueAt: '2026-09-15', amount: 2460, status: 'Unpaid', reference: 'Dock transfer fees' },
  { id: 'INV-2034', vendor: 'Kestrel Office Works', issuedAt: '2026-08-10', dueAt: '2026-09-09', amount: 1190, status: 'Paid', reference: 'Workspace supplies' },
  { id: 'INV-2029', vendor: 'Redwood Components', issuedAt: '2026-08-03', dueAt: '2026-09-02', amount: 5575, status: 'Unpaid', reference: 'Assembly components' },
  { id: 'INV-2022', vendor: 'Acme Industrial Supply', issuedAt: '2026-07-29', dueAt: '2026-08-28', amount: 3240, status: 'Overdue', reference: 'Warehouse fittings' },
  { id: 'INV-2015', vendor: 'Northstar Paper Co.', issuedAt: '2026-07-23', dueAt: '2026-08-22', amount: 780, status: 'Paid', reference: 'Paper and labels' },
  { id: 'INV-2009', vendor: 'Harborline Logistics', issuedAt: '2026-07-14', dueAt: '2026-08-13', amount: 9120, status: 'Unpaid', reference: 'Regional freight' },
  { id: 'INV-1998', vendor: 'Redwood Components', issuedAt: '2026-06-28', dueAt: '2026-07-28', amount: 1840, status: 'Paid', reference: 'Fasteners and brackets' },
  { id: 'INV-1987', vendor: 'Kestrel Office Works', issuedAt: '2026-06-18', dueAt: '2026-07-18', amount: 2680, status: 'Overdue', reference: 'Meeting room fit-out' },
  { id: 'INV-1974', vendor: 'Cobalt Safety Group', issuedAt: '2026-06-02', dueAt: '2026-07-02', amount: 3980, status: 'Paid', reference: 'Protective equipment' },
  { id: 'INV-1966', vendor: 'Cobalt Safety Group', issuedAt: '2026-05-21', dueAt: '2026-06-20', amount: 1460, status: 'Paid', reference: 'Inspection supplies' },
];

export const invoiceWorkflowPostconditions = {
  filterResults: {
    statusMatchesSelection: true,
    vendorMatchesSelection: true,
    amountIsAtLeastMinimum: true,
    textMatchesInvoiceVendorOrReference: true,
    defaultOrder: 'issuedAt descending',
  },
  invoiceDetail: {
    routePattern: '/legacy/invoices/:invoiceId',
    headingMatchesInvoiceId: true,
    vendorMatchesSelectedRecord: true,
    amountMatchesSelectedRecord: true,
    statusMatchesSelectedRecord: true,
  },
} as const;

export const configuratorProducts = [
  { id: 'focus-desk', name: 'Focus Desk', subtitle: 'Airy A-frame workstation', depth: 70, basePrice: 640 },
  { id: 'studio-table', name: 'Studio Workbench', subtitle: 'Deep top with trestle base', depth: 82, basePrice: 780 },
  { id: 'compact-console', name: 'Compact Console', subtitle: 'Slim cabinet-supported desk', depth: 52, basePrice: 520 },
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
  carrierCode: string;
  from: string;
  to: string;
  fromCode: string;
  toCode: string;
  departAt: string;
  arriveAt: string;
  duration: string;
  stops: number;
  stopLabel: string;
  price: number;
  cabin: string;
  baggage: string;
  emissionsKg: number;
  amenities: string[];
}

export const demoTrips: DemoTrip[] = [
  { id: 'SA-142', carrier: 'Savanna Air', carrierCode: 'SA', from: 'Nairobi', to: 'Lisbon', fromCode: 'NBO', toCode: 'LIS', departAt: '08:20', arriveAt: '18:10', duration: '11h 50m', stops: 1, stopLabel: '1h 35m in Madrid', price: 684, cabin: 'Economy Flex', baggage: '1 × 23 kg', emissionsKg: 612, amenities: ['Wi-Fi', 'Power', 'Meal'] },
  { id: 'ME-508', carrier: 'Meridian', carrierCode: 'ME', from: 'Nairobi', to: 'Lisbon', fromCode: 'NBO', toCode: 'LIS', departAt: '11:45', arriveAt: '22:05', duration: '12h 20m', stops: 1, stopLabel: '2h 05m in Rome', price: 612, cabin: 'Economy', baggage: '1 × 20 kg', emissionsKg: 579, amenities: ['Power', 'Meal'] },
  { id: 'AL-271', carrier: 'Aurora Lines', carrierCode: 'AL', from: 'Nairobi', to: 'Lisbon', fromCode: 'NBO', toCode: 'LIS', departAt: '19:10', arriveAt: '09:40', duration: '16h 30m', stops: 2, stopLabel: 'Cairo · Barcelona', price: 548, cabin: 'Economy Light', baggage: 'Cabin bag', emissionsKg: 704, amenities: ['Meal'] },
  { id: 'SU-890', carrier: 'Sundial', carrierCode: 'SU', from: 'Nairobi', to: 'Lisbon', fromCode: 'NBO', toCode: 'LIS', departAt: '22:35', arriveAt: '11:25', duration: '14h 50m', stops: 1, stopLabel: '3h 10m in Istanbul', price: 571, cabin: 'Economy', baggage: '1 × 23 kg', emissionsKg: 635, amenities: ['Wi-Fi', 'Power', 'Meal'] },
  { id: 'VI-404', carrier: 'Vireo', carrierCode: 'VI', from: 'Nairobi', to: 'Lisbon', fromCode: 'NBO', toCode: 'LIS', departAt: '05:55', arriveAt: '16:30', duration: '12h 35m', stops: 1, stopLabel: '1h 50m in Paris', price: 739, cabin: 'Economy Flex', baggage: '2 × 23 kg', emissionsKg: 588, amenities: ['Wi-Fi', 'Power', 'Meal', 'Streaming'] },
  { id: 'CO-118', carrier: 'Coastline Air', carrierCode: 'CO', from: 'Nairobi', to: 'Lisbon', fromCode: 'NBO', toCode: 'LIS', departAt: '14:15', arriveAt: '06:05', duration: '17h 50m', stops: 2, stopLabel: 'Addis Ababa · Madrid', price: 519, cabin: 'Economy Light', baggage: 'Cabin bag', emissionsKg: 748, amenities: ['Meal'] },
];

export interface DemoAirport {
  city: string;
  code: string;
  name: string;
  country: string;
}

export const demoAirports: DemoAirport[] = [
  { city: 'Nairobi', code: 'NBO', name: 'Jomo Kenyatta International', country: 'Kenya' },
  { city: 'Nairobi', code: 'WIL', name: 'Wilson Airport', country: 'Kenya' },
  { city: 'Lisbon', code: 'LIS', name: 'Humberto Delgado', country: 'Portugal' },
  { city: 'London', code: 'LHR', name: 'Heathrow', country: 'United Kingdom' },
  { city: 'London', code: 'LGW', name: 'Gatwick', country: 'United Kingdom' },
  { city: 'Paris', code: 'CDG', name: 'Charles de Gaulle', country: 'France' },
  { city: 'Amsterdam', code: 'AMS', name: 'Schiphol', country: 'Netherlands' },
  { city: 'New York', code: 'JFK', name: 'John F. Kennedy International', country: 'United States' },
  { city: 'Cape Town', code: 'CPT', name: 'Cape Town International', country: 'South Africa' },
  { city: 'Dubai', code: 'DXB', name: 'Dubai International', country: 'United Arab Emirates' },
  { city: 'Tokyo', code: 'HND', name: 'Haneda', country: 'Japan' },
  { city: 'Singapore', code: 'SIN', name: 'Changi', country: 'Singapore' },
];
