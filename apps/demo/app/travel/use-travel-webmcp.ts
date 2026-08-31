'use client';

import { useEffect } from 'react';
import { demoAirports, demoTrips, type DemoAirport, type DemoTrip } from '../demo-data';
import { reportDemoInvocation } from '../components/developer-events';

interface ModelContextLike {
  registerTool: (tool: {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
    execute: (input?: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
  }, options?: { signal?: AbortSignal }) => Promise<void>;
}

interface TravelActions {
  search: (input: {
    from: DemoAirport;
    to: DemoAirport;
    departure: string;
    returnDate?: string;
    travelers: number;
    cabin: string;
  }) => DemoTrip[];
  showTrip: (trip: DemoTrip) => void;
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') return inputRecord(JSON.parse(input));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object.');
  return input as Record<string, unknown>;
}

function requiredString(input: Record<string, unknown>, name: string): string {
  const value = input[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`);
  return value;
}

export function useTravelWebMcp(actions: TravelActions): void {
  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContextLike }).modelContext;
    if (!modelContext) return;
    const controller = new AbortController();
    const airportCodes = demoAirports.map((airport) => airport.code);
    const tripIds = demoTrips.map((trip) => trip.id);
    const cabins = ['Economy', 'Premium economy', 'Business'];

    const register = async () => {
      await Promise.all([
        modelContext.registerTool({
          name: 'travel_search_trips',
          title: 'Search available trips',
          description: 'Searches the visible travel site and returns matching fictional itineraries.',
          inputSchema: {
            type: 'object',
            properties: {
              from: { type: 'string', enum: airportCodes, default: 'NBO', description: 'Departure airport code.' },
              to: { type: 'string', enum: airportCodes, default: 'LIS', description: 'Arrival airport code.' },
              departure: { type: 'string', format: 'date', default: '2026-10-14', description: 'Departure date.' },
              return_date: { type: 'string', format: 'date', default: '2026-10-22', description: 'Optional return date.' },
              travelers: { type: 'integer', minimum: 1, maximum: 8, default: 1, description: 'Number of travelers.' },
              cabin: { type: 'string', enum: cabins, default: 'Economy', description: 'Cabin class.' },
            },
            required: ['from', 'to', 'departure', 'travelers', 'cabin'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: async (rawInput, options) => {
            options?.signal?.throwIfAborted();
            const input = inputRecord(rawInput ?? {});
            const fromCode = requiredString(input, 'from');
            const toCode = requiredString(input, 'to');
            const from = demoAirports.find((airport) => airport.code === fromCode);
            const to = demoAirports.find((airport) => airport.code === toCode);
            if (!from || !to || from.code === to.code) throw new Error('Choose two different supported airports.');
            const departure = requiredString(input, 'departure');
            const returnDate = typeof input.return_date === 'string' && input.return_date ? input.return_date : undefined;
            const travelers = input.travelers;
            if (!Number.isInteger(travelers) || (travelers as number) < 1 || (travelers as number) > 8) throw new Error('travelers must be an integer from 1 to 8.');
            const cabin = requiredString(input, 'cabin');
            if (!cabins.includes(cabin)) throw new Error(`cabin must be one of: ${cabins.join(', ')}.`);
            const trips = actions.search({ from, to, departure, returnDate, travelers: travelers as number, cabin });
            const result = {
              ok: true,
              route: `${from.code}-${to.code}`,
              departure,
              returnDate: returnDate ?? null,
              trips: trips.map(({ id, carrier, departAt, arriveAt, duration, stops, price }) => ({ id, carrier, departAt, arriveAt, duration, stops, price })),
            };
            reportDemoInvocation('travel_search_trips', result);
            return result;
          },
        }, { signal: controller.signal }),
        modelContext.registerTool({
          name: 'travel_get_trip_detail',
          title: 'Open trip details',
          description: 'Opens one fictional itinerary in the visible detail drawer and returns its fare details.',
          inputSchema: {
            type: 'object',
            properties: { trip_id: { type: 'string', enum: tripIds, default: tripIds[0], description: 'Itinerary identifier from trip search.' } },
            required: ['trip_id'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: async (rawInput, options) => {
            options?.signal?.throwIfAborted();
            const input = inputRecord(rawInput ?? {});
            const tripId = requiredString(input, 'trip_id');
            const trip = demoTrips.find((candidate) => candidate.id === tripId);
            if (!trip) throw new Error(`Unknown trip: ${tripId}.`);
            actions.showTrip(trip);
            const result = { ok: true, trip };
            reportDemoInvocation('travel_get_trip_detail', result);
            return result;
          },
        }, { signal: controller.signal }),
      ]);
    };

    void register().catch((error) => reportDemoInvocation('travel_registration', {
      ok: false,
      error: error instanceof Error ? error.message : 'Travel tool registration failed.',
    }));
    return () => controller.abort();
  }, [actions.search, actions.showTrip]);
}
