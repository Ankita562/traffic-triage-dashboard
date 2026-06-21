from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib, json, numpy as np, pandas as pd
from datetime import datetime

app = Flask(__name__)
CORS(app)

# ── Load all artifacts ──────────────────────────────────────────────
model      = joblib.load('model.pkl')
encoders   = joblib.load('label_encoders.pkl')

with open('impute_stats.json') as f:
    impute_stats = json.load(f)

geohash_mean    = pd.read_csv('geohash_mean.csv').set_index('geohash')['geohash_demand_mean']
geohash_hr_mean = pd.read_csv('geohash_hour_mean.csv').set_index(['geohash','hour_temp'])['geohash_hour_demand_mean']
day_hour_mean   = pd.read_csv('day_hour_mean.csv').set_index('day_hour_key')['day_hour_demand_mean']
roadtype_mean   = pd.read_csv('roadtype_mean.csv').set_index('RoadType')['roadtype_demand_mean']

# ── Demand score → priority label ──────────────────────────────────
def score_to_priority(score):
    if score >= 0.7:   return "High"
    elif score >= 0.4: return "Medium"
    else:              return "Low"

@app.route('/predict-priority', methods=['POST'])
def predict():
    body = request.json
    now  = datetime.now()
    hour = now.hour
    minute = now.minute
    day  = body.get('day', now.weekday())

    # Build a single-row dataframe matching training features
    row = {
        'geohash':      body.get('geohash', 'unknown'),
        'RoadType':     body.get('roadType', impute_stats['road_type_mode']),
        'LargeVehicles':body.get('largeVehicles', 'No'),
        'Landmarks':    body.get('landmarks', 'None'),
        'Weather':      body.get('weather', impute_stats['weather_mode']),
        'Temperature':  body.get('temperature', impute_stats['temp_median']),
        'day':          day,
        'hour_sin':     np.sin(2 * np.pi * hour / 24),
        'hour_cos':     np.cos(2 * np.pi * hour / 24),
        'minute_sin':   np.sin(2 * np.pi * minute / 60),
        'minute_cos':   np.cos(2 * np.pi * minute / 60),
    }

    df = pd.DataFrame([row])

    # Encode categoricals (unknown labels fall back to most common)
    for col in ['geohash', 'RoadType', 'LargeVehicles', 'Landmarks', 'Weather']:
        le = encoders[col]
        val = str(df[col].iloc[0])
        df[col] = le.transform([val])[0] if val in le.classes_ else 0

    # Aggregation lookup features
    gh     = df['geohash'].iloc[0]
    rt     = df['RoadType'].iloc[0]
    dh_key = str(day) + '_' + str(round(df['hour_sin'].iloc[0], 2))

    df['geohash_demand_mean']      = geohash_mean.get(gh, geohash_mean.mean())
    df['geohash_hour_demand_mean'] = geohash_hr_mean.get((gh, hour), geohash_mean.mean())
    df['day_hour_demand_mean']     = day_hour_mean.get(dh_key, day_hour_mean.mean())
    df['roadtype_demand_mean']     = roadtype_mean.get(rt, roadtype_mean.mean())

    score    = float(model.predict(df)[0])
    priority = score_to_priority(score)

    return jsonify({ 'priority': priority, 'score': round(score, 3) })


if __name__ == '__main__':
    app.run(port=5000, debug=True)