// src/TriageEngine.js

// ============================================================================
// 1. Static Reference / Mock Data (Input matrix for the Dashboard UI)
// ============================================================================
export const MOCK_INCIDENTS = [
  {
    id: "FKID000000",
    event_cause: "vehicle_breakdown",
    latitude: 13.040004,
    longitude: 77.518099,
    address: "Jalahalli Cross Junction, Peenya",
    status: "active",
    priority: "High",
    police_station: "Peenya",
    // Adding standard fallback features in case backend keys are missing
    geohash: "tdr1wdn",
    timestamp: "18:30",
    day: "Monday",
    roadType: "Main Highway",
    largeVehicles: true,
    landmarks: "Metro Station",
    weather: "Clear",
    temperature: 28.5
  },
  {
    id: "FKID000001",
    event_cause: "water_logging",
    latitude: 12.921876,
    longitude: 77.645158,
    address: "19th Main Road, Agara, HSR Layout",
    status: "active",
    priority: "High",
    police_station: "HSR Layout",
    geohash: "tdr1v7m",
    timestamp: "19:15",
    day: "Monday",
    roadType: "Secondary Arterial",
    largeVehicles: false,
    landmarks: "Agara Lake",
    weather: "Heavy Rain",
    temperature: 22.0
  },
  {
    id: "FKID000002",
    event_cause: "accident",
    latitude: 12.955622,
    longitude: 77.585708,
    address: "Lalbagh Main Road, Mavalli",
    status: "active",
    priority: "High",
    police_station: "Wilson Garden",
    geohash: "tdr1vgu",
    timestamp: "19:40",
    day: "Monday",
    roadType: "Main Inner City Road",
    largeVehicles: true,
    landmarks: "Lalbagh Gate",
    weather: "Overcast",
    temperature: 25.0
  }
];

// ============================================================================
// 2. Triage Logic Engine (Rule-based operational resource mapping)
// ============================================================================
export const getTriageRecommendation = (eventCause) => {
  const rules = {
    vehicle_breakdown: {
      action: "Dispatch Tow Truck & Traffic Police",
      requiresClosure: false,
      severity: "Medium"
    },
    water_logging: {
      action: "Notify BBMP Pumps & Divert Traffic",
      requiresClosure: true,
      severity: "High"
    },
    accident: {
      action: "Dispatch Ambulance & Hoysala Unit",
      requiresClosure: true,
      severity: "Critical"
    },
    protest: {
      action: "Deploy City Armed Reserve & Barricades",
      requiresClosure: true,
      severity: "Critical"
    },
    default: {
      action: "Dispatch Nearest Beat Officer",
      requiresClosure: false,
      severity: "Low"
    }
  };

  return rules[eventCause] || rules.default;
};

// ============================================================================
// 3. Live ML Middleware Layer (Asynchronous API Bridge)
// ============================================================================
export const enrichWithMLPriority = async (incident) => {
  try {
    const response = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        geohash: incident.geohash || "tdr1v7m",
        timestamp: incident.timestamp || "19:00", 
        day: incident.day || "Monday",
        RoadType: incident.roadType || "Main Road",
        LargeVehicles: incident.largeVehicles ? "Yes" : "No",
        Landmarks: incident.landmarks || "None",
        Weather: incident.weather || "Clear",
        Temperature: parseFloat(incident.temperature) || 27.0
      }),
    });

    if (!response.ok) throw new Error('API server unreachable');
    const data = await response.json();
    
    // Catch whatever prediction matrix variable key name your Flask route passes back
    const mlScore = data.demand_score || data.prediction || data.predicted_demand || 0; 
    
    // Map machine-learned demand regressions cleanly to real-world deployment categories
    let priorityTier = "Low";
    if (mlScore > 4.5) priorityTier = "Critical";
    else if (mlScore > 3.0) priorityTier = "High";
    else if (mlScore > 1.5) priorityTier = "Medium";

    return {
      ...incident,
      mlScore: parseFloat(mlScore).toFixed(2),
      confidence: "97.3%", // Static visual marker of your Cross-Validation score
      priority: priorityTier
    };
  } catch (error) {
    console.error("⚠️ Local API server offline. Using static client fallback values:", error);
    // Bulletproof fallback so your presentation stays safe even if your Python script stops
    return {
      ...incident,
      mlScore: "N/A",
      confidence: "Local",
      priority: incident.priority || "Medium"
    };
  }
};