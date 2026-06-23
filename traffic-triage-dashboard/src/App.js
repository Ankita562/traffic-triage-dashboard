import React, { useState, useEffect } from 'react';
import { AlertTriangle, MapPin, ShieldAlert, Truck, ChevronRight, Bell, CheckCircle, Radio, ChevronUp, ChevronDown, Search, BarChart2, Activity } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MOCK_INCIDENTS, getTriageRecommendation, enrichWithMLPriority } from './TriageEngine';

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

// ── DYNAMIC MAP PIN COLORS ──
const getMarkerIcon = (cause) => {
  let color = 'blue'; // Default
  const causeLower = (cause || '').toLowerCase();
  
  if (causeLower.includes('accident')) color = 'red';
  else if (causeLower.includes('breakdown')) color = 'orange';

  return new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
};

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
  // ── STATE DECLARATIONS ──
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident]   = useState(null);
  const [escalationLevels, setEscalationLevels] = useState({});
  const escalationLevel = selectedIncident ? (escalationLevels[selectedIncident.id] || 0) : 0;
  const [dispatchedIncidents, setDispatchedIncidents] = useState(new Set());
  const [dispatchedAtLevel, setDispatchedAtLevel] = useState({});   // { incidentId: levelDispatchedAt }
  const [auditLog, setAuditLog] = useState([]);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(true);

  // ── NEW: SEARCH & ANALYTICS STATE ──
  const [searchTerm, setSearchTerm] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);

  // ── DYNAMIC FILTERING ──
  const filteredIncidents = incidents.filter(inc => {
    const search = searchTerm.toLowerCase();
    return (
      (inc.address?.toLowerCase().includes(search)) ||
      (inc.event_cause?.toLowerCase().includes(search)) ||
      (inc.police_station?.toLowerCase().includes(search))
    );
  });

  // ── ANALYTICS CALCULATIONS ──
  const activeCount = incidents.filter(i => i.status === 'active' && !dispatchedIncidents.has(i.id)).length;
  const dispatchedCount = incidents.filter(i => i.status === 'active' && dispatchedIncidents.has(i.id)).length;
  const resolvedCount = incidents.filter(i => i.status === 'resolved').length;

  const totalActive = incidents.filter(i => i.status === 'active').length || 1; // Prevent divide by zero
  
  const accidentsCount = incidents.filter(i => i.status === 'active' && i.event_cause.toLowerCase().includes('accident')).length;
  const jamsCount = incidents.filter(i => i.status === 'active' && i.event_cause.toLowerCase().includes('jam')).length;
  const breakdownsCount = incidents.filter(i => i.status === 'active' && i.event_cause.toLowerCase().includes('breakdown')).length;
  const roadWorksCount = incidents.filter(i => i.status === 'active' && i.event_cause.toLowerCase().includes('road')).length;
  const highPriCount = incidents.filter(i => i.status === 'active' && i.priority === 'High').length;
  const medPriCount = incidents.filter(i => i.status === 'active' && i.priority === 'Medium').length;
  const lowPriCount = incidents.filter(i => i.status === 'active' && i.priority === 'Low').length;

  const clearanceRate = incidents.length ? Math.round((resolvedCount / incidents.length) * 100) : 0;
    
  // Helper to easily add new entries to the top of the log
  const logAction = (incidentName, action, colorClass) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" });
    setAuditLog(prev => [{ id: Date.now(), time, incidentName, action, colorClass }, ...prev]);
  };
  const MAP_CENTER = [12.9716, 77.5946];

  // ── CONNECT TO LIVE TOMTOM + ML MIDDLEWARE ──
  useEffect(() => {
    const fetchLiveFeed = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/live-triage`);
        const liveData = await response.json();
        
        setIncidents(prevIncidents => {
          // Keep track of incidents we've already marked as "resolved" 
          // so they don't pop back up as "active" on the next 30-second ping!
          const resolvedIds = prevIncidents.filter(i => i.status === 'resolved').map(i => i.id);
          
          return liveData.map(inc => ({
            ...inc,
            status: resolvedIds.includes(inc.id) ? 'resolved' : 'active'
          }));
        });
      } catch (error) {
        console.error("Live feed offline:", error);
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately on load, then auto-ping every 30 seconds
    fetchLiveFeed();
    const interval = setInterval(fetchLiveFeed, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident);
    // setEscalationLevel(0);
  };

  const handleEscalation = () => {
    if (selectedIncident && escalationLevel < 2) {
      setEscalationLevels(prev => ({
        ...prev,
        [selectedIncident.id]: escalationLevel + 1
      }));
      setDispatchedAtLevel(prev => {
        const next = { ...prev };
        delete next[selectedIncident.id];
        return next;
      });
    const newLevelName = ESCALATION_CHAIN[escalationLevel + 1].label;
      logAction(selectedIncident.event_cause.replace('_', ' '), `Escalated to ${newLevelName}`, 'text-orange-400');
    }
  };

  const handleConfirmDispatch = () => {
    if (!selectedIncident) return;
    setDispatchedIncidents(prev => new Set([...prev, selectedIncident.id]));
    setDispatchedAtLevel(prev => ({ ...prev, [selectedIncident.id]: escalationLevel }));
    logAction(selectedIncident.event_cause.replace('_', ' '), `Dispatched to ${getDispatchTarget()}`, 'text-blue-400');
  };

  const handleResolve = () => {
    if (!selectedIncident) return;
    setIncidents(prev => prev.map(inc => 
      inc.id === selectedIncident.id ? { ...inc, status: 'resolved' } : inc
    ));
    logAction(selectedIncident.event_cause.replace('_', ' '), 'Incident Marked Resolved', 'text-emerald-400');
    setSelectedIncident(null); // Deselect to clear the Triage Panel
  };

  const isCurrentDispatched =
    selectedIncident !== null &&
    dispatchedAtLevel[selectedIncident?.id] === escalationLevel;

  const getDispatchTarget = () => {
    if (!selectedIncident) return '';
    if (escalationLevel === 0) return `${selectedIncident.police_station} Traffic Police`;
    if (escalationLevel === 1) return 'Hoysala Mobile Unit';
    return 'Central Control Room — Geo-Alert Active';
  };


  // ── FULL-SCREEN SCREEN LOADING BACKDROP ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center font-mono">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-t-indigo-500 border-slate-700 mx-auto mb-4"></div>
          <p className="text-sm tracking-widest text-slate-400 uppercase animate-pulse">
            Querying Live Gridlock-ML Regressors...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans overflow-hidden">

      {/* ── LEFT PANEL ── */}
      <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col z-10 shadow-lg">
        <div className="p-4 bg-slate-800 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="text-red-400" />
              <h1 className="text-xl font-bold tracking-wide">ASTRAM TRIAGE</h1>
            </div>
            {/* Analytics Toggle Button */}
            <button 
              onClick={() => setShowAnalytics(!showAnalytics)}
              className={`p-1.5 rounded-md transition-colors ${showAnalytics ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              title="Toggle Area Analytics"
            >
              <BarChart2 size={18} />
            </button>
          </div>
          
          {/* JUDGES VISUAL METRIC: Live Operations Stats Bar */}
          <div className="flex justify-between text-xs font-semibold bg-slate-900 px-4 py-2.5 rounded-md border border-slate-700 shadow-inner mb-3">
            <span className="text-red-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
              {activeCount} Active
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-blue-400">{dispatchedCount} Dispatched</span>
            <span className="text-slate-500">|</span>
            <span className="text-emerald-400">{resolvedCount} Resolved</span>
          </div>

          {/* ── LIVE SEARCH BAR ── */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search locations, stations, or incident types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Live Incident Feed
          </h2>

          {/* CHANGED FROM incidents.map TO filteredIncidents.map */}
          {filteredIncidents.map((incident) => (
            <div
              key={incident.id}
              onClick={() => handleIncidentSelect(incident)}
              className={`p-4 rounded-lg border cursor-pointer transition-all duration-300 ${
                incident.status === 'resolved'
                  ? 'bg-slate-50 opacity-50 grayscale border-slate-200'
                  : selectedIncident?.id === incident.id
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`font-bold capitalize ${incident.status === 'resolved' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                  {incident.event_cause.replace('_', ' ')}
                </span>
                <div className="flex gap-1.5 flex-wrap justify-end items-center">
                  {incident.status === 'resolved' ? (
                    <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-0.5 rounded">
                      Resolved
                    </span>
                  ) : dispatchedIncidents.has(incident.id) ? (
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle size={10} /> Sent
                    </span>
                  ) : null}
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded">
                    {incident.priority}
                  </span>
                </div>
              </div>
              
              <div className="flex items-center text-gray-500 text-sm mb-2">
                <MapPin size={13} className="mr-1 flex-shrink-0" />
                <p className="truncate">{incident.address}</p>
              </div>

              <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100 text-[11px] font-mono">
                <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                  Model Score: <span className="font-bold">{incident.mlScore}</span>
                </div>
                <span className="text-gray-400">Confidence: {incident.confidence}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── COLLAPSIBLE AUDIT LOG TERMINAL ── */}
        <div className={`${isAuditLogOpen ? 'h-48' : 'h-auto'} bg-slate-900 border-t-4 border-slate-700 flex flex-col shadow-[inset_0_4px_6px_-1px_rgba(0,0,0,0.3)] transition-all duration-300`}>
          {/* Clickable Header */}
          <div 
            onClick={() => setIsAuditLogOpen(!isAuditLogOpen)}
            className="px-4 py-2 bg-slate-800 border-b border-slate-700 flex justify-between items-center text-xs font-bold text-slate-300 tracking-wider cursor-pointer hover:bg-slate-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isAuditLogOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronUp size={16} className="text-slate-400" />}
              <span>LIVE AUDIT LOG</span>
            </div>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> REC
            </span>
          </div>

          {/* Hidden/Shown Content */}
          {isAuditLogOpen && (
            <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-2">
              {auditLog.length === 0 ? (
                <p className="text-slate-500 italic">Waiting for dispatcher actions...</p>
              ) : (
                auditLog.map(entry => (
                  <div key={entry.id} className="flex items-start gap-2 border-l-2 border-slate-700 pl-2">
                    <span className="text-slate-500 whitespace-nowrap">[{entry.time}]</span>
                    <div>
                      <span className="text-slate-300 capitalize font-bold">{entry.incidentName}: </span>
                      <span className={entry.colorClass}>{entry.action}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      

      {/* ── RIGHT PANEL ── */}
      <div className="w-2/3 flex flex-col relative bg-slate-50">

        {/* ── VISUAL FLOATING ANALYTICS PANEL ── */}
        {showAnalytics && (
          <div className="absolute top-4 right-4 z-[9999] w-80 bg-white/95 backdrop-blur-md shadow-2xl rounded-xl border border-gray-200 p-5 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
              <Activity className="text-indigo-600" size={18} />
              <h3 className="font-bold text-gray-800 tracking-wide">Live Dashboard Analytics</h3>
            </div>
            
            {/* 1. Progress Bar: Clearance Rate */}
            <div className="mb-5">
              <div className="flex justify-between text-xs mb-1 font-bold">
                <span className="text-gray-600 uppercase tracking-wider text-[10px]">Clearance Rate</span>
                <span className="text-emerald-600">{clearanceRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 shadow-inner">
                <div className="bg-emerald-500 h-2 rounded-full transition-all duration-1000" style={{ width: `${clearanceRate}%` }}></div>
              </div>
            </div>

            {/* 2. Horizontal Bar Chart: Incident Types */}
            <div className="mb-5">
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Active Incident Types</h4>
              <div className="space-y-3">
                
                {/* Accidents Bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1 font-medium text-gray-600">
                    <span>Accidents ({accidentsCount})</span>
                    <span>{Math.round((accidentsCount/totalActive)*100)}%</span>
                  </div>
                  <div className="w-full bg-red-100 rounded-full h-1.5"><div className="bg-red-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(accidentsCount/totalActive)*100}%` }}></div></div>
                </div>
                
                {/* Jams Bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1 font-medium text-gray-600">
                    <span>Traffic Jams ({jamsCount})</span>
                    <span>{Math.round((jamsCount/totalActive)*100)}%</span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(jamsCount/totalActive)*100}%` }}></div></div>
                </div>
                
                {/* Breakdowns Bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1 font-medium text-gray-600">
                    <span>Breakdowns ({breakdownsCount})</span>
                    <span>{Math.round((breakdownsCount/totalActive)*100)}%</span>
                  </div>
                  <div className="w-full bg-orange-100 rounded-full h-1.5"><div className="bg-orange-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(breakdownsCount/totalActive)*100}%` }}></div></div>
                </div>

                {/* Road Works Bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1 font-medium text-gray-600">
                    <span>Road Works ({roadWorksCount})</span>
                    <span>{Math.round((roadWorksCount/totalActive)*100)}%</span>
                  </div>
                  <div className="w-full bg-purple-100 rounded-full h-1.5"><div className="bg-purple-500 h-1.5 rounded-full transition-all duration-1000" style={{ width: `${(roadWorksCount/totalActive)*100}%` }}></div></div>
                </div>

              </div>
            </div>

            {/* 3. Segmented Bar Chart: Priority Distribution */}
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">AI Priority Distribution</h4>
              <div className="flex h-3 w-full rounded-md overflow-hidden flex-row shadow-sm">
                <div className="bg-red-500 transition-all duration-1000" style={{ width: `${(highPriCount/totalActive)*100}%` }}></div>
                <div className="bg-yellow-400 transition-all duration-1000" style={{ width: `${(medPriCount/totalActive)*100}%` }}></div>
                <div className="bg-emerald-500 transition-all duration-1000" style={{ width: `${(lowPriCount/totalActive)*100}%` }}></div>
              </div>
              <div className="flex justify-between text-[10px] mt-1.5 text-gray-500 font-bold">
                <span className="text-red-600">High: {highPriCount}</span>
                <span className="text-yellow-600">Med: {medPriCount}</span>
                <span className="text-emerald-600">Low: {lowPriCount}</span>
              </div>
            </div>
          </div>
        )}

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

        {/* Map Container */}
        <div className="absolute inset-0 z-0">
          <MapContainer center={MAP_CENTER} zoom={12} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <MapController incident={selectedIncident} />

            {filteredIncidents.map((incident) => (
              <Marker
                key={incident.id}
                position={[incident.latitude, incident.longitude]}
                icon={getMarkerIcon(incident.event_cause)}
                eventHandlers={{ click: () => handleIncidentSelect(incident) }}
                opacity={incident.status === 'resolved' ? 0.5 : 1}
              >
                <Popup>
                  <strong className="capitalize">
                    {incident.event_cause.replace('_', ' ')}
                  </strong>
                  <br />
                  <span className="text-xs text-gray-600">{incident.address}</span>
                  <div className="mt-1 text-[10px] font-mono text-indigo-600 font-bold">
                    ML Score: {incident.mlScore}
                  </div>
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
        {selectedIncident && selectedIncident.status !== 'resolved' && (
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
                  <>
                    <div className="px-4 py-2 bg-green-100 text-green-700 font-bold rounded-md flex items-center gap-2 text-sm">
                      <CheckCircle size={15} /> Dispatch Confirmed
                    </div>
                    {/* NEW RESOLVE BUTTON */}
                    <button
                      onClick={handleResolve}
                      className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-md hover:bg-emerald-700 active:scale-95 transition text-sm shadow ml-2"
                    >
                      Mark Resolved
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConfirmDispatch}
                    className="px-4 py-2 bg-slate-800 text-white font-bold rounded-md hover:bg-slate-700 active:scale-95 transition text-sm shadow"
                  >
                    Confirm Dispatch
                  </button>
                )}

                {/* Primary Busy Button */}
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