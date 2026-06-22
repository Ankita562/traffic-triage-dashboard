# 🛡️ ASTRAM TRIAGE
**AI-Powered Traffic Incident Command & Dispatch System — Bengaluru**  
*Built for Flipkart Gridlock Hackathon 2.0 · Round 2 Prototype*

Powered by a Round 1 **HistGradientBoostingRegressor** Traffic Demand Prediction model.

## 🔍 What Problem Does This Solve?
Bengaluru's traffic police face a jurisdictional bottleneck — when a high-priority incident (accident, waterlogging, breakdown) occurs, dispatchers manually call the nearest station, wait for availability, then manually escalate if that unit is busy. This takes 4–12 minutes of dead time.

**ASTRAM TRIAGE** compresses that to under 30 seconds with an automated 3-tier escalation chain, real-time geo-alerting, and live ML-driven priority scoring from our Round 1 model.

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph External ["🌐 External Live Streams"]
        T1[TomTom Traffic API] -->|Live REST Ingestion| D
    end

    subgraph Round1 ["⚙️ Round 1 & Inference — ML Pipeline (Python)"]
        A[Raw Traffic Sensor Data] --> B[In-Memory Fitting<br/>HistGradientBoosting]
        C[.env Secure Key Store] --> D
        B -->|Model Instance| D[run_training.py Flask Engine<br/>Port 5000 /api/live-triage]
    end

    subgraph Round2 ["🖥️ Round 2 — Triage Dashboard (React)"]
        D -->|30-Second Polling Fetch| E[Incident Feed<br/>Dynamic State Array]
        E --> F{Dispatcher<br/>Action}
        F -->|Confirm| G[✅ Dispatch Confirmed]
        F -->|Primary Busy| H[Independent Escalation Engine]
        F -->|Resolve| O[🟢 Lifecycle Status: Resolved]
        H --> I[Level 1: Hoysala Mobile Unit]
        I -->|Still Busy| J[Level 2: Central Control Room]
        J --> K[🔴 Geo-Fence Alert<br/>2km Radius Circle]
        J --> L[📢 Public Safety Push Notification]
        G & H & O -->|Automated Logging Call| P[💾 Live Audit Log Terminal]
    end

    subgraph Map ["🗺️ Leaflet Map Layer"]
        E --> M[Color-Coded Pins<br/>Red / Orange / Blue]
        K --> N[Faded Operational Geofences]
    end
```

---

## 🔁 Escalation Flow

```mermaid
flowchart LR
    A([Incident Detected]) --> B[/Priority Scored by ML API/]
    B --> C[Shown in Incident Feed]
    C --> D{Dispatcher\nReviews}

    D -->|Confirm Dispatch| E[✅ Level 0\nLocal Traffic Police\ne.g. Peenya PS]

    D -->|Primary Busy| F[🟡 Level 1\nHoysala Mobile Unit\nFloating Fallback]

    F -->|Primary Busy Again| G[🔴 Level 2\nCentral Control Room\nFull Escalation]

    G --> H[🗺️ 2km Geo-Fence\nDrawn on Map]
    G --> I[📢 Civilian Push Alert\nAvoid Area Broadcast]

    style E fill:#3b82f6,color:#fff
    style F fill:#eab308,color:#fff
    style G fill:#dc2626,color:#fff
    style H fill:#fca5a5,color:#333
    style I fill:#fca5a5,color:#333
```

---

## 🧠 How Priority Is Determined (Round 1 → Round 2 Link)

```mermaid
sequenceDiagram
    participant Sensor as 🚦 Traffic Sensor
    participant ML as 🤖 HistGradientBoosting
    participant API as 📡 Flask REST API
    participant UI as 🖥️ React Dashboard
    participant Dispatcher as 👮 Dispatcher

    Sensor->>ML: Raw flow data (location, time, volume)
    ML->>ML: Geohash + Cyclic time feature engineering
    ML->>API: Predicted demand score → Priority tag
    API->>UI: Live JSON fetch {cause, coords, priority}
    UI->>Dispatcher: Card shown in Live Feed
    Dispatcher->>UI: Clicks card → Triage panel opens
    Dispatcher->>UI: Confirms dispatch or escalates
    UI->>Dispatcher: Updates stepper + geo-alert if L2
```

---

## ✨ Features

| Feature | Description | Status |
| :--- | :--- | :---: |
| 📋 **Live Incident Feed** | Dynamic card streams matching real-world Bengaluru coordinates and street targets | ✅ Live |
| 🗺️ **Interactive Map** | Dynamic Leaflet engine with custom color-coded pins (Red: Accidents, Orange: Breakdowns, Blue: Jams) | ✅ Live |
| 🤖 **Live ML API** | Real-time demand scoring via integrated Python server (`run_training.py`), eliminating model-version mismatches | ✅ Live |
| ⚡ **Smart Triage Panel** | Rule-based responses combined with independent per-incident state memory across selection switches | ✅ Live |
| 💾 **Live Audit Log** | Downstream terminal tracking timeline changes (Dispatches, Escalations, Resolutions) with microsecond precision | ✅ Live |
| 🔐 **Secure Key Vault** | Total decoupling of sensitive access keys using standard local environment configurations (`.env`) | ✅ Live |

---

## 🛠️ Tech Stack

```mermaid
graph LR
    A[React 18] --> B[Tailwind CSS v3]
    A --> C[Leaflet + React-Leaflet]
    A --> D[Lucide React Icons]
    E[TriageEngine.js] --> F[Rule-Based Action Recommendations]
    G[Python Flask Backend] --> H[HistGradientBoosting API\nLive Priority Scoring]
```

| Layer | Technology |
|---|---|
| Frontend Framework | React 18 |
| Styling | Tailwind CSS v3 |
| Map Engine | Leaflet · react-leaflet |
| Icons | lucide-react |
| Backend API |	Python 3 · Flask · Flask-CORS |
| ML Model (Round 1) | HistGradientBoostingRegressor · scikit-learn |
| Feature Engineering | Geohash · Cyclic Encoding · Target Encoding |
| Data | Live priority scoring via REST API |

---

## 📁 Project Structure

```text
Gridlock/
├── .gitignore                  # Root gitignore for both Node and Python
├── README.md                   # Main project documentation
│
├── traffic-triage-dashboard/   # 🖥️ ROUND 2: React Frontend
│   ├── public/
│   ├── src/
│   │   ├── App.js              # Main layout, state, API fetch logic
│   │   ├── TriageEngine.js     # Recommendation rules & ML integration hook
│   │   ├── index.js            # Entry point
│   │   └── index.css           # Tailwind directives + Leaflet z-index fix
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
│
└── gridlock-ml/                # ⚙️ ROUND 1 & BACKEND SERVER
    ├── backend/
    │   ├── run_training.py     # Integrated model architecture & live Flask endpoint
    │   ├── .env                # [LOCAL ONLY] Secure TomTom API credential storage
    │   └── *.csv / *.json      # Data pipelines and aggregation tables
    ├── dataset/                # Raw traffic training data
    └── source_code.ipynb       # Feature engineering sandbox
```

---

## 🚀 Getting Started

Because this project uses a live Machine Learning backend, you need to run two terminals simultaneously.

### 1. Clone the repo
```bash
git clone [https://github.com/Ankita562/traffic-triage-dashboard.git](https://github.com/Ankita562/traffic-triage-dashboard.git)
cd traffic-triage-dashboard
```

### 2. Configure Environment Variables
Inside the `gridlock-ml/backend` directory, create a secure environment file to manage API access tokens without committing secrets to version control:

1. Create a file named `.env`
2. Add your TomTom developer credential inside it:
```env
TOMTOM_API_KEY=your_copied_api_key_here
```

### 3. Start the ML Backend (Terminal 1)
```bash
cd gridlock-ml/backend
pip install flask flask-cors joblib scikit-learn pandas numpy python-dotenv requests
python run_training.py
# The pipeline will run structural model initialization in memory.
# Once training completes, the server launches on http://localhost:5000
```


### 4. Start the React Frontend (Terminal 2)
```bash
cd traffic-triage-dashboard
npm install
npm start
# The dashboard opens automatically at http://localhost:3000, pulling real-time events.
```

---

## 🖥️ Usage: Triage Workflow

1. **Select an incident** from the left sidebar — the map highlights the location and flies to it.
2. **Review the live ML priority score** and the recommended response unit.
3. **Click "Confirm Dispatch"** — the card gets a green "Sent" badge.
4. **If the primary unit is busy**, click **"Primary Busy"** to escalate:
   * **Level 1** → Routes to **Hoysala Mobile Unit** (floating fallback).
   * **Level 2** → Routes to **Central Control Room** + triggers:
     * 🔴 2km geo-fence circle on the map
     * 📢 Bouncing civilian "Avoid Area" push alert

---

## 🔮 Phase 2 Roadmap

```mermaid
gantt
    title ASTRAM — Phase 2 Development Plan
    dateFormat  YYYY-MM-DD
    section Data
    Live sensor feed integration     :2025-08-01, 30d
    Real-time incident ingestion     :2025-08-15, 30d
    section Dispatch
    GPS tracking of Hoysala units    :2025-09-01, 45d
    Auto-dispatch on ML threshold    :2025-09-15, 30d
    section Public
    SMS geo-alert integration        :2025-10-01, 30d
    CCTV camera feed integration     :2025-10-15, 45d
```

- 📡 **Live sensor data** replacing mock incidents via WebSocket feed
- 🚓 **Real-time GPS tracking** of Hoysala patrol units on the map
- 📱 **SMS geo-alerts** to civilians in the affected radius (Twilio)
- 📷 **CCTV integration** — camera feeds embedded in incident cards
- 🔄 **Auto-dispatch** when ML confidence exceeds threshold, no human needed

---

## 👥 Team

Built for **Flipkart Gridlock Hackathon 2.0** on HackerEarth.

* **Round 1:** Traffic Demand Prediction (`HistGradientBoostingRegressor`)
* **Round 2:** ASTRAM Triage — Real-Time Incident Command Dashboard

**Team Members:**
* Ankita Gupta
* Arushi
* Manaswi

---

## 📄 License

MIT — free to use, fork, and build on.
