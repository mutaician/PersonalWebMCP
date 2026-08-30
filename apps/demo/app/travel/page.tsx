'use client';

import { useState } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { DemoHeader } from '../components/demo-header';
import { resetDemoDeveloperState } from '../components/developer-events';
import { demoTrips, type DemoTrip } from '../demo-data';

const defaults = {
  from: 'Nairobi',
  to: 'Lisbon',
  departure: '2026-10-14',
  travelers: 1,
  seat: 'Window',
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function TravelPage() {
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [departure, setDeparture] = useState(defaults.departure);
  const [travelers, setTravelers] = useState(defaults.travelers);
  const [seat, setSeat] = useState(defaults.seat);
  const [searched, setSearched] = useState(true);
  const [selected, setSelected] = useState<DemoTrip>();
  const [savedTripId, setSavedTripId] = useState<string>();

  const reset = () => {
    setFrom(defaults.from);
    setTo(defaults.to);
    setDeparture(defaults.departure);
    setTravelers(defaults.travelers);
    setSeat(defaults.seat);
    setSearched(true);
    setSelected(undefined);
    setSavedTripId(undefined);
    resetDemoDeveloperState();
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSelected(undefined);
    setSearched(true);
  };

  return (
    <main className="demo-page travel-demo">
      <DemoHeader current="travel" productName="Wayfinder Travel" />
      <section className="travel-hero">
        <div>
          <p className="eyebrow">Hybrid workflow foundation</p>
          <h1>Find a journey worth saving.</h1>
          <p>Search and detail become native capabilities later; seat preference and shortlist remain visible UI-only actions.</p>
        </div>
        <button className="reset-button light" type="button" onClick={reset}>Reset demo</button>
      </section>

      <section className="travel-workspace">
        <form className="trip-search" onSubmit={submitSearch}>
          <label>From<input value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <button className="swap-button" type="button" aria-label="Swap origin and destination" onClick={() => { setFrom(to); setTo(from); }}>⇄</button>
          <label>To<input value={to} onChange={(event) => setTo(event.target.value)} /></label>
          <label>Depart<input type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} /></label>
          <label>Travelers<input type="number" min="1" max="6" value={travelers} onChange={(event) => setTravelers(Math.max(1, Math.min(6, Number(event.target.value) || 1)))} /></label>
          <button className="search-button" type="submit">Search trips</button>
        </form>

        <div className="travel-columns">
          <section className="trip-results">
            <div className="surface-heading">
              <div><span className="section-label">AVAILABLE JOURNEYS</span><h2>{from} to {to}</h2></div>
              <span>{searched ? `${demoTrips.length} results` : 'Run search'}</span>
            </div>
            {searched && demoTrips.map((trip) => (
              <article className={selected?.id === trip.id ? 'trip-card selected' : 'trip-card'} key={trip.id}>
                <div className="carrier-mark">{trip.carrier.slice(0, 2).toUpperCase()}</div>
                <div className="trip-route">
                  <strong>{trip.departAt}</strong><span>{trip.from}</span>
                  <div><span>{trip.duration}</span><i /></div>
                  <strong>{trip.arriveAt}</strong><span>{trip.to}</span>
                </div>
                <div className="trip-price"><small>{trip.stops} {trip.stops === 1 ? 'stop' : 'stops'}</small><strong>{currency.format(trip.price)}</strong><button type="button" onClick={() => setSelected(trip)}>View trip</button></div>
              </article>
            ))}
          </section>

          <aside className="trip-detail">
            {selected ? (
              <>
                <span className="section-label">TRIP DETAIL</span>
                <h2>{selected.carrier} · {selected.id}</h2>
                <p>{selected.from} → {selected.to}, departing {departure} at {selected.departAt}.</p>
                <fieldset>
                  <legend>Seat preference</legend>
                  {['Window', 'Aisle', 'No preference'].map((choice) => (
                    <label className={seat === choice ? 'selected' : ''} key={choice}>
                      <input type="radio" name="seat" checked={seat === choice} onChange={() => setSeat(choice)} />{choice}
                    </label>
                  ))}
                </fieldset>
                <button className={savedTripId === selected.id ? 'save-button saved' : 'save-button'} type="button" onClick={() => setSavedTripId(selected.id)}>
                  {savedTripId === selected.id ? 'Saved to shortlist' : 'Save this trip'}
                </button>
                <div className="human-boundary"><span>HUMAN REVIEW</span><p>Booking remains unavailable until the later confirmation workflow is implemented.</p></div>
              </>
            ) : (
              <div className="detail-empty"><span>✦</span><strong>Select a trip</strong><p>Trip details and personal preferences appear here.</p></div>
            )}
          </aside>
        </div>
      </section>
      <DemoDeveloperPanel />
    </main>
  );
}
