// src/TriageEngine.js

export const MOCK_INCIDENTS = [
  {
    id: "FKID000000",
    event_cause: "vehicle_breakdown",
    latitude: 13.040004,
    longitude: 77.518099,
    address: "Jalahalli Cross Junction, Peenya",
    status: "active",
    priority: "High",
    police_station: "Peenya"
  },
  {
    id: "FKID000001",
    event_cause: "water_logging",
    latitude: 12.921876,
    longitude: 77.645158,
    address: "19th Main Road, Agara, HSR Layout",
    status: "active",
    priority: "High",
    police_station: "HSR Layout"
  },
  {
    id: "FKID000002",
    event_cause: "accident",
    latitude: 12.955622,
    longitude: 77.585708,
    address: "Lalbagh Main Road, Mavalli",
    status: "active",
    priority: "High",
    police_station: "Wilson Garden"
  }
];

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