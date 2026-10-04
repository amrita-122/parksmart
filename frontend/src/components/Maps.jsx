import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
  useAdvancedMarkerRef,
  MapControl,
  ControlPosition,
} from "@vis.gl/react-google-maps";
import { io } from "socket.io-client";
import { useNavigate } from "react-router-dom";

const API_KEY = import.meta.env.VITE_MAPS_API;
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/* ═══════════════════════════════════════════════════════════
   Root component
═══════════════════════════════════════════════════════════ */
export const Maps = ({ nearestSpot }) => {
  const [allSpots, setAllSpots]           = useState([]);
  const [filteredSpots, setFilteredSpots] = useState(null);
  const [selectedSpot, setSelectedSpot]   = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [directions, setDirections]       = useState(null);
  const [routeInfo, setRouteInfo]         = useState(null);
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [markerRef, marker]               = useAdvancedMarkerRef();
  const mapsLib                           = useMapsLibrary("routes"); // ensures library loads
  const navigate                          = useNavigate();

  const visibleSpots = filteredSpots ?? allSpots;
  const availableCount = allSpots.filter((s) => s.isAvailable).length;

  /* ── Geolocation ───────────────────────────────────────── */
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.error("Geolocation:", err),
      { enableHighAccuracy: true }
    );
  }, []);

  /* ── Load all spots on mount ───────────────────────────── */
  useEffect(() => {
    fetch(`${API_URL}/api/parking/all`)
      .then((r) => r.json())
      .then(setAllSpots)
      .catch(console.error);
  }, []);

  /* ── Socket.io live updates ────────────────────────────── */
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket"], reconnectionAttempts: 5 });
    socket.on("connect_error", () => {});
    socket.on("spot:updated", (updated) => {
      const patch = (arr) => arr.map((s) => (s._id === updated._id ? updated : s));
      setAllSpots(patch);
      setFilteredSpots((p) => (p ? patch(p) : null));
      setSelectedSpot((p) => (p?._id === updated._id ? updated : p));
    });
    return () => socket.disconnect();
  }, []);

  /* ── Filter nearby when searching ─────────────────────── */
  useEffect(() => {
    if (!selectedPlace) { setFilteredSpots(null); return; }
    const lat = selectedPlace.geometry.location.lat();
    const lng = selectedPlace.geometry.location.lng();
    fetch(`${API_URL}/api/parking/nearby?lat=${lat}&lng=${lng}&radius=0.6`)
      .then((r) => r.json())
      .then(setFilteredSpots)
      .catch(console.error);
  }, [selectedPlace]);

  useEffect(() => {
    if (marker && selectedPlace?.geometry?.location)
      marker.position = selectedPlace.geometry.location;
  }, [selectedPlace, marker]);

  /* ── Compute driving route using google.maps directly ──── */
  const getDirections = useCallback((destination) => {
    if (!currentLocation || !window.google?.maps) return;
    const service = new window.google.maps.DirectionsService();
    service.route(
      {
        origin: currentLocation,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== "OK") { console.error("Directions:", status); return; }
        const leg = result.routes[0].legs[0];
        setDirections(result);
        setRouteInfo({
          distance: leg.distance.text,
          duration: leg.duration.text,
          steps: leg.steps.map((s) => ({
            instructions: s.instructions,
            distance: s.distance.text,
          })),
        });
      }
    );
  }, [currentLocation]);

  /* ── Auto-route to nearest spot ────────────────────────── */
  useEffect(() => {
    if (!nearestSpot || !currentLocation || !window.google?.maps) return;
    setSelectedSpot(nearestSpot);
    setSidebarOpen(true);
    getDirections({ lat: nearestSpot.lat, lng: nearestSpot.lng });
  }, [nearestSpot, currentLocation, getDirections]);

  /* ── Spot marker click — stable reference so markers
        don't rebuild every render ─────────────────────────── */
  const handleSpotClick = useCallback((spot) => {
    setSelectedSpot(spot);
    setDirections(null);
    setRouteInfo(null);
    setSidebarOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setSidebarOpen(false);
    setSelectedSpot(null);
    setDirections(null);
    setRouteInfo(null);
  }, []);

  /* ─────────────────────────────────────────────────────── */
  return (
    /* Map is always full-screen; sidebar overlays on the left */
    <div className="relative h-screen w-full">
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId="bf51a910020fa25a"
          defaultZoom={15}
          defaultCenter={currentLocation || { lat: 49.0239, lng: -122.2847 }}
          gestureHandling="greedy"
          mapTypeId="roadmap"
          className="h-full w-full"
        >
          {/* Blue user-dot */}
          {currentLocation && (
            <AdvancedMarker position={currentLocation} title="You">
              <div className="relative flex items-center justify-center">
                <div className="absolute w-8 h-8 rounded-full bg-blue-400 opacity-25 animate-ping" />
                <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md z-10" />
              </div>
            </AdvancedMarker>
          )}

          {/* Nearest spot pulse */}
          {nearestSpot && (
            <AdvancedMarker position={{ lat: nearestSpot.lat, lng: nearestSpot.lng }}>
              <PulseMarker />
            </AdvancedMarker>
          )}

          {selectedPlace && (
            <AdvancedMarker ref={markerRef} position={selectedPlace.geometry?.location} />
          )}

          {/* Pill search bar */}
          <MapControl position={ControlPosition.TOP_CENTER}>
            <div className="mt-3 bg-white shadow-xl rounded-full px-4 py-2.5 flex items-center gap-2 w-80">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <PlaceAutocomplete onPlaceSelect={setSelectedPlace} />
              {selectedPlace && (
                <button onClick={() => { setSelectedPlace(null); setFilteredSpots(null); }}
                  className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </MapControl>

          {/* Spot legend */}
          <MapControl position={ControlPosition.BOTTOM_RIGHT}>
            <div className="m-4 bg-white shadow-md rounded-xl px-4 py-2.5 flex items-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-green-500" /> Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" /> Occupied
              </span>
              <span className="w-px h-4 bg-gray-200" />
              <span className="font-semibold text-gray-800">{availableCount}/{allSpots.length} free</span>
            </div>
          </MapControl>

          {/* Map internals — markers + route renderer + resize trigger */}
          <MapHandler
            place={selectedPlace}
            marker={marker}
            spots={visibleSpots}
            directions={directions}
            sidebarOpen={sidebarOpen}
            onSpotClick={handleSpotClick}
          />
        </Map>
      </APIProvider>

      {/* ── Sidebar overlay (absolute, doesn't push the map) ── */}
      <div
        className={`absolute top-0 left-0 h-full bg-white shadow-2xl z-20 flex flex-col
          transition-all duration-300 ease-in-out overflow-hidden
          ${sidebarOpen ? "w-80 opacity-100" : "w-0 opacity-0 pointer-events-none"}`}
      >
        {selectedSpot && (
          <Sidebar
            spot={selectedSpot}
            routeInfo={routeInfo}
            onClose={handleClose}
            onDirections={() => getDirections({ lat: selectedSpot.lat, lng: selectedSpot.lng })}
            onReserve={() => navigate(`/reserve?spotId=${selectedSpot._id}`)}
          />
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Sidebar — spot details + step-by-step route
═══════════════════════════════════════════════════════════ */
function Sidebar({ spot, routeInfo, onClose, onDirections, onReserve }) {
  return (
    <div className="flex flex-col h-full select-none">

      {/* Header */}
      <div className="p-5 border-b flex items-start justify-between flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Parking Spot</p>
          <h2 className="text-xl font-bold text-gray-900 leading-tight">
            Lot {spot.lotNumber} · #{spot.spotNumber}
          </h2>
          <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold
            ${spot.isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
            {spot.isAvailable ? "● Available" : "● Occupied"}
          </span>
        </div>
        <button onClick={onClose}
          className="ml-2 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 flex gap-2 border-b flex-shrink-0">
        <button onClick={onDirections}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span className="text-xs">Directions</span>
        </button>
        <button onClick={onReserve} disabled={!spot.isAvailable}
          className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl font-semibold transition
            ${spot.isAvailable
              ? "bg-green-50 hover:bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-xs">{spot.isAvailable ? "Reserve" : "Unavailable"}</span>
        </button>
      </div>

      {/* Route summary bar */}
      {routeInfo && (
        <div className="flex-shrink-0 bg-blue-600 text-white px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold leading-none">{routeInfo.duration}</p>
            <p className="text-sm text-blue-200 mt-0.5">{routeInfo.distance} · Driving</p>
          </div>
          <svg className="w-8 h-8 text-blue-300 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
      )}

      {/* Step-by-step or empty prompt */}
      {routeInfo?.steps?.length > 0 ? (
        <div className="flex-1 overflow-y-auto">
          <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            Turn-by-turn
          </p>
          {routeInfo.steps.map((step, i) => (
            <div key={i} className="flex gap-3 px-5 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug"
                  dangerouslySetInnerHTML={{ __html: step.instructions }} />
                <p className="text-xs text-gray-400 mt-0.5">{step.distance}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 text-gray-400">
          <svg className="w-12 h-12 mb-3 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm font-medium text-gray-500">Tap Directions</p>
          <p className="text-xs mt-1">to see turn-by-turn route to this spot</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Pulsing nearest-spot marker
═══════════════════════════════════════════════════════════ */
function PulseMarker() {
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute w-12 h-12 rounded-full bg-blue-400 opacity-25 animate-ping" />
      <div className="w-6 h-6 rounded-full bg-blue-600 border-2 border-white shadow-lg z-10 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-white" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Map internals — markers, route renderer, resize trigger
═══════════════════════════════════════════════════════════ */
const MapHandler = ({ place, marker, spots, directions, sidebarOpen, onSpotClick }) => {
  const map = useMap();

  /* Trigger map resize when sidebar animates in/out */
  useEffect(() => {
    if (!map || !window.google) return;
    const timer = setTimeout(() => {
      window.google.maps.event.trigger(map, "resize");
    }, 320); // just after the 300ms CSS transition
    return () => clearTimeout(timer);
  }, [map, sidebarOpen]);

  /* Pan to searched place */
  useEffect(() => {
    if (!map || !place || !marker) return;
    if (place.geometry?.viewport) map.fitBounds(place.geometry.viewport);
    marker.position = place.geometry?.location;
  }, [map, place, marker]);

  /* Spot markers — stable because onSpotClick is useCallback([]) */
  useEffect(() => {
    if (!map || !window.google) return;
    const markers = spots.map((spot) => {
      const m = new window.google.maps.Marker({
        position: { lat: spot.lat, lng: spot.lng },
        map,
        title: `Spot ${spot.spotNumber}`,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: spot.isAvailable ? "#22c55e" : "#f87171",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
        optimized: true,
      });
      m.addListener("click", () => onSpotClick(spot));
      return m;
    });
    return () => markers.forEach((m) => m.setMap(null));
  }, [map, spots, onSpotClick]);

  /* Route polyline — auto-fits map to show full route */
  useEffect(() => {
    if (!map || !directions || !window.google) return;
    const renderer = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      preserveViewport: false, // let it zoom to fit the route
      polylineOptions: {
        strokeColor: "#1d4ed8",
        strokeWeight: 5,
        strokeOpacity: 0.9,
      },
    });
    renderer.setDirections(directions);
    return () => renderer.setMap(null);
  }, [map, directions]);

  return null;
};

/* ═══════════════════════════════════════════════════════════
   Place autocomplete input
═══════════════════════════════════════════════════════════ */
const PlaceAutocomplete = ({ onPlaceSelect }) => {
  const inputRef = useRef(null);
  const places   = useMapsLibrary("places");

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const ac = new places.Autocomplete(inputRef.current, {
      fields: ["geometry", "name", "formatted_address"],
    });
    ac.addListener("place_changed", () => onPlaceSelect(ac.getPlace()));
  }, [places, onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      className="flex-1 text-sm py-0.5 focus:outline-none bg-transparent placeholder-gray-400"
      placeholder="Search for parking near..."
    />
  );
};

export default Maps;
