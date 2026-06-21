import React, { useState, useEffect } from 'react';
import { AlertTriangle, MapPin, ShieldAlert, Truck, ChevronRight, Bell, CheckCircle, Radio } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MOCK_INCIDENTS, getTriageRecommendation } from './TriageEngine';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const ESCALATION_CHAIN = [
  { label: 'Traffic Police', color: 'bg-blue-600' },
  { label: 'Hoysala Unit',   color: 'bg-yellow-500' },
  { label: 'Central Control', color: 'bg-red-600' },
];

// Smoothly flies the map to whichever incident is selected
function MapController({ incident }) {
  const map = useMap();
  useEffect(() => {
    if (incident) {
      map.flyTo([incident.latitude, incident.longitude], 15, { duration: 1.2 });
    }
  }, [incident, map]);
  return null;
}

function App() {
  const [selectedIncident, setSelectedIncident]   = useState(null);
  const [escalationLevel, setEscalationLevel]     = useState(0);
  const [dispatchedIncidents, setDispatchedIncidents] = useState(new Set());
  const [dispatchedAtLevel, setDispatchedAtLevel] = useState({});   // { incidentId: levelDispatchedAt }

  const MAP_CENTER = [12.9716, 77.5946];

  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident);
    setEscalationLevel(0);
    // NOTE: do NOT reset dispatch state here — cards keep their "Sent" badge
  };

  const handleEscalation = () => {
    if (escalationLevel < 2) {
      setEscalationLevel(prev => prev + 1);
      // Escalating means the current dispatch is void — clear so they can re-dispatch
      if (selectedIncident) {
        setDispatchedAtLevel(prev => {
          const next = { ...prev };
          delete next[selectedIncident.id];
          return next;
        });
      }
    }
  };

  const handleConfirmDispatch = () => {
    if (!selectedIncident) return;
    setDispatchedIncidents(prev => new Set([...prev, selectedIncident.id]));
    setDispatchedAtLevel(prev => ({ ...prev, [selectedIncident.id]: escalationLevel }));
  };

  // True only when THIS incident is dispatched AND at the CURRENT escalation level
  const isCurrentDispatched =
    selectedIncident !== null &&
    dispatchedAtLevel[selectedIncident?.id] === escalationLevel;

  const getDispatchTarget = () => {
    if (!selectedIncident) return '';
    if (escalationLevel === 0) return `${selectedIncident.police_station} Traffic Police`;
    if (escalationLevel === 1) return 'Hoysala Mobile Unit';
    return 'Central Control Room — Geo-Alert Active';
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">

      {/* ── LEFT PANEL ── */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg">
        <div className="p-4 bg-slate-800 text-white flex items-center gap-2">
          <ShieldAlert className="text-red-400" />
          <h1 className="text-xl font-bold tracking-wide">ASTRAM TRIAGE</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Live Incident Feed
          </h2>

          {MOCK_INCIDENTS.map((incident) => (
            <div
              key={incident.id}
              onClick={() => handleIncidentSelect(incident)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedIncident?.id === incident.id
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-gray-800 capitalize">
                  {incident.event_cause.replace('_', ' ')}
                </span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {dispatchedIncidents.has(incident.id) && (
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle size={10} /> Sent
                    </span>
                  )}
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">
                    {incident.priority}
                  </span>
                </div>
              </div>
              <div className="flex items-center text-gray-500 text-sm">
                <MapPin size={13} className="mr-1 flex-shrink-0" />
                {incident.address}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="w-2/3 flex flex-col relative bg-slate-50">

        {/* Push Notification — Level 2 only */}
        {selectedIncident && escalationLevel === 2 && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-11/12 max-w-md animate-bounce">
            <div className="bg-red-600 text-white p-4 rounded-lg shadow-2xl border-2 border-red-400 flex items-start gap-3">
              <Bell className="animate-pulse flex-shrink-0 mt-1" size={22} />
              <div>
                <p className="font-bold text-base uppercase tracking-wide">Public Safety Alert</p>
                <p className="text-sm text-red-100 mt-1 leading-snug">
                  <span className="font-bold">Avoid Area:</span>{' '}
                  Severe {selectedIncident.event_cause.replace('_', ' ')} near{' '}
                  {selectedIncident.address}. Use alternate routes immediately.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Map */}
        <div className="absolute inset-0 z-0">
          <MapContainer
            center={MAP_CENTER}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <MapController incident={selectedIncident} />

            {MOCK_INCIDENTS.map((incident) => (
              <Marker
                key={incident.id}
                position={[incident.latitude, incident.longitude]}
                eventHandlers={{ click: () => handleIncidentSelect(incident) }}
              >
                <Popup>
                  <strong className="capitalize">
                    {incident.event_cause.replace('_', ' ')}
                  </strong>
                  <br />
                  {incident.address}
                </Popup>
              </Marker>
            ))}

            {selectedIncident && escalationLevel === 2 && (
              <Circle
                center={[selectedIncident.latitude, selectedIncident.longitude]}
                radius={2000}
                pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.2 }}
              />
            )}
          </MapContainer>
        </div>

        {/* ── Triage Action Panel ── */}
        {selectedIncident && (
          <div className="absolute bottom-0 w-full z-10 bg-white border-t-2 border-gray-200 shadow-2xl p-5">

            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <AlertTriangle className="text-orange-500" size={18} />
                  <h2 className="text-lg font-bold capitalize">
                    Action Required: {selectedIncident.event_cause.replace('_', ' ')}
                  </h2>
                </div>
                <p className="text-sm text-gray-500 ml-6">{selectedIncident.address}</p>
              </div>

              {/* Escalation stepper */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {ESCALATION_CHAIN.map((step, i) => (
                  <React.Fragment key={i}>
                    <div className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 transition-all duration-300 ${
                      i < escalationLevel
                        ? 'bg-gray-200 text-gray-400 line-through'
                        : i === escalationLevel
                        ? `${step.color} text-white shadow-md`
                        : 'bg-gray-100 text-gray-300'
                    }`}>
                      {i < escalationLevel ? '✓' : <Radio size={10} />}
                      {step.label}
                    </div>
                    {i < 2 && <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Recommended action */}
            <div className="bg-orange-50 border border-orange-200 p-3 rounded-md flex items-center gap-3 mb-4">
              <Truck className="text-orange-600 flex-shrink-0" size={18} />
              <div>
                <p className="font-semibold text-orange-900 text-sm">Recommended Action</p>
                <p className="text-orange-800 text-sm">
                  {getTriageRecommendation(selectedIncident.event_cause).action}
                </p>
              </div>
            </div>

            {/* Dispatch row */}
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-gray-400">Routing to: </span>
                <span className={`font-bold ${escalationLevel === 2 ? 'text-red-700' : 'text-slate-800'}`}>
                  {getDispatchTarget()}
                </span>
              </div>

              <div className="flex gap-2">
                {isCurrentDispatched ? (
                  /* ── DISPATCHED STATE ── */
                  <div className="px-4 py-2 bg-green-100 text-green-700 font-bold rounded-md flex items-center gap-2 text-sm">
                    <CheckCircle size={15} /> Dispatch Confirmed
                  </div>
                ) : (
                  /* ── CONFIRM BUTTON ── */
                  <button
                    onClick={handleConfirmDispatch}
                    className="px-4 py-2 bg-slate-800 text-white font-bold rounded-md hover:bg-slate-700 active:scale-95 transition text-sm shadow"
                  >
                    Confirm Dispatch
                  </button>
                )}

                {/* Primary Busy — hidden once dispatched OR at max level */}
                {escalationLevel < 2 && !isCurrentDispatched && (
                  <button
                    onClick={handleEscalation}
                    className="px-4 py-2 bg-red-100 text-red-700 font-bold rounded-md flex items-center hover:bg-red-200 active:scale-95 transition text-sm shadow"
                  >
                    Primary Busy <ChevronRight size={15} className="ml-1" />
                  </button>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default App;