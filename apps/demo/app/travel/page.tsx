'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DemoDeveloperPanel } from '../components/demo-developer-panel';
import { resetDemoDeveloperState } from '../components/developer-events';
import { demoAirports, demoTrips, type DemoAirport, type DemoTrip } from '../demo-data';
import { useTravelWebMcp } from './use-travel-webmcp';

const defaultFrom = demoAirports.find((airport) => airport.code === 'NBO') ?? demoAirports[0];
const defaultTo = demoAirports.find((airport) => airport.code === 'LIS') ?? demoAirports[1];
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface AirportAutocompleteProps {
  id: string;
  label: string;
  value: DemoAirport;
  onChange: (airport: DemoAirport) => void;
}

function AirportAutocomplete({ id, label, value, onChange }: AirportAutocompleteProps) {
  const [query, setQuery] = useState(value.city);
  const [open, setOpen] = useState(false);
  useEffect(() => setQuery(value.city), [value.city]);
  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return demoAirports.slice(0, 6);
    return demoAirports.filter((airport) => (
      [airport.city, airport.code, airport.name, airport.country].join(' ').toLowerCase().includes(needle)
    )).slice(0, 6);
  }, [query]);

  const select = (airport: DemoAirport) => {
    onChange(airport);
    setQuery(airport.city);
    setOpen(false);
  };

  return (
    <div className="airport-field">
      <label htmlFor={id}>{label}</label>
      <div className="airport-input-wrap">
        <span>{value.code}</span>
        <input
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id + '-suggestions'}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        />
        <small>{value.country}</small>
      </div>
      {open && (
        <div className="airport-suggestions" id={id + '-suggestions'} role="listbox">
          {suggestions.map((airport) => (
            <button type="button" role="option" aria-selected={airport.code === value.code} onMouseDown={(event) => event.preventDefault()} onClick={() => select(airport)} key={airport.code}>
              <span>{airport.code}</span><div><strong>{airport.city}</strong><small>{airport.name} · {airport.country}</small></div>
            </button>
          ))}
          {suggestions.length === 0 && <p>No matching airports</p>}
        </div>
      )}
    </div>
  );
}

export default function TravelPage() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [departure, setDeparture] = useState('2026-10-14');
  const [returnDate, setReturnDate] = useState('2026-10-22');
  const [roundTrip, setRoundTrip] = useState(true);
  const [travelers, setTravelers] = useState(1);
  const [cabin, setCabin] = useState('Economy');
  const [seat, setSeat] = useState('Window');
  const [searchedRoute, setSearchedRoute] = useState({ from: defaultFrom, to: defaultTo });
  const [selected, setSelected] = useState<DemoTrip>();
  const [savedTripId, setSavedTripId] = useState<string>();
  const [sort, setSort] = useState<'recommended' | 'price' | 'duration'>('recommended');
  const [stops, setStops] = useState<'any' | 'one'>('any');
  const [maxPrice, setMaxPrice] = useState(800);
  const [fare, setFare] = useState<'Light' | 'Standard' | 'Flex'>('Standard');

  const searchFromTool = useCallback((input: {
    from: DemoAirport;
    to: DemoAirport;
    departure: string;
    returnDate?: string;
    travelers: number;
    cabin: string;
  }) => {
    setFrom(input.from);
    setTo(input.to);
    setDeparture(input.departure);
    setReturnDate(input.returnDate ?? '');
    setRoundTrip(Boolean(input.returnDate));
    setTravelers(input.travelers);
    setCabin(input.cabin);
    setSearchedRoute({ from: input.from, to: input.to });
    setSelected(undefined);
    return demoTrips.map((trip) => ({ ...trip, from: input.from.city, to: input.to.city, fromCode: input.from.code, toCode: input.to.code }));
  }, []);
  const showTripFromTool = useCallback((trip: DemoTrip) => {
    setSelected(trip);
    setFare('Standard');
  }, []);
  useTravelWebMcp({ search: searchFromTool, showTrip: showTripFromTool });

  const routeTrips = useMemo(() => demoTrips.map((trip) => ({
    ...trip,
    from: searchedRoute.from.city,
    to: searchedRoute.to.city,
    fromCode: searchedRoute.from.code,
    toCode: searchedRoute.to.code,
  })), [searchedRoute]);

  const visibleTrips = useMemo(() => routeTrips
    .filter((trip) => trip.price <= maxPrice && (stops === 'any' || trip.stops === 1))
    .sort((left, right) => {
      if (sort === 'price') return left.price - right.price;
      if (sort === 'duration') return Number.parseInt(left.duration) - Number.parseInt(right.duration);
      return (left.price + left.stops * 70) - (right.price + right.stops * 70);
    }), [maxPrice, routeTrips, sort, stops]);

  const reset = () => {
    setFrom(defaultFrom);
    setTo(defaultTo);
    setDeparture('2026-10-14');
    setReturnDate('2026-10-22');
    setRoundTrip(true);
    setTravelers(1);
    setCabin('Economy');
    setSeat('Window');
    setSearchedRoute({ from: defaultFrom, to: defaultTo });
    setSelected(undefined);
    setSavedTripId(undefined);
    setSort('recommended');
    setStops('any');
    setMaxPrice(800);
    setFare('Standard');
    resetDemoDeveloperState();
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setSearchedRoute({ from, to });
    setSelected(undefined);
  };

  const swapAirports = () => {
    const nextFrom = to;
    setTo(from);
    setFrom(nextFrom);
  };

  const farePrice = selected ? selected.price + (fare === 'Flex' ? 148 : fare === 'Standard' ? 62 : 0) : 0;

  return (
    <main className="flight-app">
      <header className="flight-header">
        <a className="flight-brand" href="/"><span>W</span><strong>wayfinder</strong></a>
        <nav><a className="active" href="#flights">Flights</a><a href="#stays">Stays</a><a href="#trips">My trips</a></nav>
        <div><button type="button">Help</button><button className="trip-shortlist" type="button">Shortlist <span>{savedTripId ? 1 : 0}</span></button><span className="flight-avatar">MM</span></div>
      </header>

      <section className="flight-search-zone" id="flights">
        <div className="flight-search-heading">
          <div><span>WHERE NEXT?</span><h1>Compare flights without the clutter.</h1></div>
          <button type="button" onClick={reset}>Reset search</button>
        </div>
        <form className="flight-search-card" onSubmit={submitSearch}>
          <div className="flight-trip-types">
            <label><input type="radio" checked={roundTrip} onChange={() => setRoundTrip(true)} />Round trip</label>
            <label><input type="radio" checked={!roundTrip} onChange={() => setRoundTrip(false)} />One way</label>
          </div>
          <div className="flight-route-fields">
            <AirportAutocomplete id="flight-from" label="From" value={from} onChange={setFrom} />
            <button className="airport-swap" type="button" aria-label="Swap airports" onClick={swapAirports}>⇄</button>
            <AirportAutocomplete id="flight-to" label="To" value={to} onChange={setTo} />
            <label className="flight-date">Depart<input type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} /></label>
            {roundTrip && <label className="flight-date">Return<input type="date" value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label>}
            <label className="flight-select">Travelers<input type="number" min="1" max="8" value={travelers} onChange={(event) => setTravelers(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
            <label className="flight-select">Cabin<select value={cabin} onChange={(event) => setCabin(event.target.value)}><option>Economy</option><option>Premium economy</option><option>Business</option></select></label>
            <button className="flight-search-submit" type="submit">Search flights</button>
          </div>
        </form>
      </section>

      <section className="flight-results-shell">
        <aside className="flight-filters">
          <div><strong>Filter results</strong><button type="button" onClick={() => { setStops('any'); setMaxPrice(800); }}>Clear</button></div>
          <fieldset><legend>Stops</legend><label><input type="radio" checked={stops === 'any'} onChange={() => setStops('any')} />Any number of stops</label><label><input type="radio" checked={stops === 'one'} onChange={() => setStops('one')} />1 stop only</label></fieldset>
          <fieldset><legend>Maximum price <span>{currency.format(maxPrice)}</span></legend><input type="range" min="500" max="800" step="10" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} /><div className="range-labels"><span>$500</span><span>$800+</span></div></fieldset>
          <fieldset><legend>Departure time</legend><label><input type="checkbox" defaultChecked />Morning</label><label><input type="checkbox" defaultChecked />Afternoon</label><label><input type="checkbox" defaultChecked />Evening</label></fieldset>
          <div className="fare-watch"><span>↘</span><strong>Prices are typical</strong><p>Fares on this route are within their usual range.</p></div>
        </aside>

        <section className="flight-results">
          <div className="flight-results-heading">
            <div><span>{departure}{roundTrip ? ' — ' + returnDate : ''}</span><h2>{searchedRoute.from.city} <i>→</i> {searchedRoute.to.city}</h2><p>{travelers} traveler · {cabin} · {visibleTrips.length} itineraries</p></div>
            <label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="recommended">Recommended</option><option value="price">Lowest price</option><option value="duration">Shortest duration</option></select></label>
          </div>

          <div className="flight-card-list">
            {visibleTrips.map((trip, index) => (
              <article className={selected?.id === trip.id ? 'flight-card selected' : 'flight-card'} key={trip.id}>
                <div className={'airline-badge airline-' + (index % 4)}>{trip.carrierCode}</div>
                <div className="airline-name"><strong>{trip.carrier}</strong><span>{trip.id} · {trip.cabin}</span></div>
                <div className="flight-time"><strong>{trip.departAt}</strong><span>{trip.fromCode}</span></div>
                <div className="flight-path"><span>{trip.duration}</span><i><b /></i><small>{trip.stopLabel}</small></div>
                <div className="flight-time"><strong>{trip.arriveAt}</strong><span>{trip.toCode} <sup>+1</sup></span></div>
                <div className="flight-impact"><span>{trip.emissionsKg} kg CO₂</span><small>{trip.baggage}</small></div>
                <div className="flight-price"><small>round trip</small><strong>{currency.format(trip.price)}</strong><span>per traveler</span></div>
                <button className="flight-select-button" type="button" onClick={() => { setSelected(trip); setFare('Standard'); }}>View fares</button>
              </article>
            ))}
            {visibleTrips.length === 0 && <div className="no-flights"><strong>No flights match these filters</strong><p>Raise the maximum price or include more stops.</p></div>}
          </div>
        </section>

        {selected && (
          <aside className="flight-drawer" aria-label="Selected flight details">
            <div className="flight-drawer-head"><div><span>SELECTED ITINERARY</span><strong>{selected.carrier} · {selected.id}</strong></div><button type="button" onClick={() => setSelected(undefined)}>×</button></div>
            <div className="drawer-route"><div><strong>{selected.departAt}</strong><span>{selected.fromCode}</span><small>{searchedRoute.from.city}</small></div><i><span>{selected.duration}</span><b /></i><div><strong>{selected.arriveAt}</strong><span>{selected.toCode}</span><small>{searchedRoute.to.city} · next day</small></div></div>
            <div className="drawer-amenities">{selected.amenities.map((amenity) => <span key={amenity}>✓ {amenity}</span>)}</div>
            <fieldset className="fare-options"><legend>Choose a fare</legend>
              {(['Light', 'Standard', 'Flex'] as const).map((option) => {
                const extra = option === 'Flex' ? 148 : option === 'Standard' ? 62 : 0;
                return <label className={fare === option ? 'selected' : ''} key={option}><input type="radio" checked={fare === option} onChange={() => setFare(option)} /><span><strong>{option}</strong><small>{option === 'Light' ? 'Cabin bag only' : option === 'Standard' ? 'Checked bag · changes for a fee' : '2 bags · free changes'}</small></span><b>{currency.format(selected.price + extra)}</b></label>;
              })}
            </fieldset>
            <label className="seat-preference">Seat preference<select value={seat} onChange={(event) => setSeat(event.target.value)}><option>Window</option><option>Aisle</option><option>No preference</option></select></label>
            <button className={savedTripId === selected.id ? 'drawer-save saved' : 'drawer-save'} type="button" onClick={() => setSavedTripId(selected.id)}>{savedTripId === selected.id ? '✓ Saved to shortlist' : 'Save itinerary · ' + currency.format(farePrice)}</button>
            <div className="drawer-boundary"><span>HUMAN CHECKPOINT</span><p>Booking remains a deliberate human action. PersonalWebMCP can prepare this itinerary but cannot confirm purchase yet.</p></div>
          </aside>
        )}
      </section>

      <div className="flight-inspector"><DemoDeveloperPanel /></div>
    </main>
  );
}
