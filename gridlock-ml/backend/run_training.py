import pandas as pd
import numpy as np
import joblib
import json
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import cross_val_score, KFold

# Also import Flask and CORS components for the api layer
from flask import Flask, request, jsonify
from flask_cors import CORS

# ==========================================
# 1. Load data (Looking up one folder to gridlock-ml)
# ==========================================
print("Loading data from dataset folder...")
train = pd.read_csv('../dataset/train.csv')
test = pd.read_csv('../dataset/test.csv')

# ==========================================
# 2. Preprocessing function
# ==========================================
def preprocess(df, is_train=True, impute_stats=None):
    df = df.copy()
    
    # Extract hour and minute
    df[['hour', 'minute']] = df['timestamp'].str.split(':', expand=True).astype(int)
    df = df.drop(columns=['timestamp'])
    
    # Cyclic time features
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['minute_sin'] = np.sin(2 * np.pi * df['minute'] / 60)
    df['minute_cos'] = np.cos(2 * np.pi * df['minute'] / 60)
    df = df.drop(columns=['hour', 'minute'])
    
    # Fill Missing Values
    if is_train:
        road_type_mode = df['RoadType'].mode()[0]
        weather_mode = df['Weather'].mode()[0]
        temp_median = df['Temperature'].median()
        
        df['RoadType'] = df['RoadType'].fillna(road_type_mode)
        df['Weather'] = df['Weather'].fillna(weather_mode)
        df['Temperature'] = df['Temperature'].fillna(temp_median)
        
        impute_stats = {
            'road_type_mode': road_type_mode,
            'weather_mode': weather_mode,
            'temp_median': temp_median
        }
        return df, impute_stats
    else:
        df['RoadType'] = df['RoadType'].fillna(impute_stats['road_type_mode'])
        df['Weather'] = df['Weather'].fillna(impute_stats['weather_mode'])
        df['Temperature'] = df['Temperature'].fillna(impute_stats['temp_median'])
        return df

print("Preprocessing data...")
train_proc, impute_stats = preprocess(train, is_train=True)
test_proc = preprocess(test, is_train=False, impute_stats=impute_stats)

# ==========================================
# 3. Categorical Encoding (Track and Save)
# ==========================================
print("Encoding categorical features...")
cat_cols = ['geohash', 'RoadType', 'LargeVehicles', 'Landmarks', 'Weather']
encoders = {}

for col in cat_cols:
    le = LabelEncoder()
    le.fit(list(train_proc[col].astype(str)) + list(test_proc[col].astype(str)))
    train_proc[col] = le.transform(train_proc[col].astype(str))
    test_proc[col] = le.transform(test_proc[col].astype(str))
    encoders[col] = le

# ==========================================
# 4. Advanced Aggregation Features
# ==========================================
print("Adding advanced aggregation features...")

# 4a. Geohash mean
geohash_mean = train_proc.groupby('geohash')['demand'].mean()
train_proc['geohash_demand_mean'] = train_proc['geohash'].map(geohash_mean).fillna(0)
test_proc['geohash_demand_mean'] = test_proc['geohash'].map(geohash_mean).fillna(0)

# 4b. Geohash × Hour mean
train_proc['hour_temp'] = train['timestamp'].str.split(':').str[0].astype(int)
test_proc['hour_temp'] = test['timestamp'].str.split(':').str[0].astype(int)

geohash_hour_mean = train_proc.groupby(['geohash', 'hour_temp'])['demand'].mean()
train_proc['geohash_hour_demand_mean'] = train_proc.groupby(['geohash', 'hour_temp'])['demand'].transform('mean')

test_proc['geohash_hour_demand_mean'] = test_proc.merge(
    geohash_hour_mean.reset_index(), on=['geohash', 'hour_temp'], how='left', suffixes=('', '_test')
)['demand'].fillna(0)

train_proc = train_proc.drop(columns=['hour_temp'])
test_proc = test_proc.drop(columns=['hour_temp'])

# 4c. Day × Hour mean
train_proc['day_hour_key'] = train_proc['day'].astype(str) + '_' + train_proc['hour_sin'].round(2).astype(str)
test_proc['day_hour_key'] = test_proc['day'].astype(str) + '_' + test_proc['hour_sin'].round(2).astype(str)

day_hour_mean = train_proc.groupby('day_hour_key')['demand'].mean()
train_proc['day_hour_demand_mean'] = train_proc['day_hour_key'].map(day_hour_mean).fillna(0)
test_proc['day_hour_demand_mean'] = test_proc['day_hour_key'].map(day_hour_mean).fillna(0)

train_proc = train_proc.drop(columns=['day_hour_key'])
test_proc = test_proc.drop(columns=['day_hour_key'])

# 4d. RoadType mean
roadtype_mean = train_proc.groupby('RoadType')['demand'].mean()
train_proc['roadtype_demand_mean'] = train_proc['RoadType'].map(roadtype_mean).fillna(0)
test_proc['roadtype_demand_mean'] = test_proc['RoadType'].map(roadtype_mean).fillna(0)

# ==========================================
# 5. Prepare Train/Test sets
# ==========================================
X_train = train_proc.drop(columns=['Index', 'demand'])
y_train = train_proc['demand']
X_test = test_proc.drop(columns=['Index'])

# Debug: Show what columns the model expects
print(f"\n🔍 Model expects these {len(X_train.columns)} features: {X_train.columns.tolist()}")

# ==========================================
# 6. Train HistGradientBoostingRegressor Model
# ==========================================
print("\nTraining HistGradientBoostingRegressor model with 1000 iterations...")
model = HistGradientBoostingRegressor(
    random_state=42, 
    max_iter=1000,
    learning_rate=0.05,
    early_stopping=True,
    validation_fraction=0.1,
    n_iter_no_change=10,
    verbose=0
)

# 5-Fold Cross-Validation
kf = KFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(model, X_train, y_train, cv=kf, scoring='r2')

print(f"\n✅ 5-Fold CV R² Scores: {cv_scores}")
print(f"Mean CV R²: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
print(f"Estimated Leaderboard Score: {max(0, 100 * cv_scores.mean()):.2f}")

# Train final model
model.fit(X_train, y_train)

# ==========================================
# 7. Predict & Save Submission CSV
# ==========================================
print("\nPredicting on test set...")
preds = model.predict(X_test)

sub = pd.DataFrame({'Index': test['Index'], 'demand': preds})
sub.to_csv('../baseline_submission.csv', index=False)
print("\n✅ DONE! Saved to '../baseline_submission.csv'")

# ==========================================
# 8. Export Components Locally
# ==========================================
print("\nExporting fresh model components locally into the backend directory...")
joblib.dump(model, 'model.pkl')
joblib.dump(encoders, 'label_encoders.pkl')

with open('impute_stats.json', 'w') as f:
    json.dump(impute_stats, f, indent=4)

geohash_mean.to_csv('geohash_mean.csv')
geohash_hour_mean.to_csv('geohash_hour_mean.csv')
roadtype_mean.to_csv('roadtype_mean.csv')
day_hour_mean.to_csv('day_hour_mean.csv')

print("✅ Backend sync complete!")

# ==========================================
# 9. LIVE WEB SERVER MIDDLEWARE LAYER (Flask App Execution)
# ==========================================
app = Flask(__name__)
CORS(app)  # Prevents browser security blocks

# ---- Diagnostic endpoint ----
@app.route('/debug/features', methods=['GET'])
def debug_features():
    # Return what the model expects
    if hasattr(model, 'feature_names_in_'):
        features = model.feature_names_in_.tolist()
    else:
        features = X_train.columns.tolist()
    return jsonify({
        'features': features,
        'count': len(features),
        'model_has_feature_names': hasattr(model, 'feature_names_in_')
    })

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # FORCE Flask to read raw body payload, ignoring empty/missing content-type headers from React
        data = request.get_json(force=True)
        if not data:
            return jsonify({'error': 'No payload provided', 'status': 'failed'}), 400

        # 1. Flexible Variable Interception (Maps dynamic frontend property formats)
        geohash_val = data.get('geohash', data.get('Geohash', ''))
        road_type_val = data.get('RoadType', data.get('roadType', data.get('road_type', '')))
        large_vehicles_val = data.get('LargeVehicles', data.get('largeVehicles', 'No'))
        landmarks_val = data.get('Landmarks', data.get('landmarks', 'None'))
        weather_val = data.get('Weather', data.get('weather', 'Clear'))
        temp_val = data.get('Temperature', data.get('temperature', 30.0))
        day_val = data.get('day', data.get('Day', 'Monday'))
        ts = data.get('timestamp', data.get('Timestamp', '12:00'))
        number_of_lanes_val = data.get('NumberofLanes', data.get('numberOfLanes', data.get('lanes', 2)))

        # Debug: Print what we received
        print(f"\n📨 Received request:")
        print(f"   geohash: {geohash_val}")
        print(f"   RoadType: {road_type_val}")
        print(f"   LargeVehicles: {large_vehicles_val}")
        print(f"   Landmarks: {landmarks_val}")
        print(f"   Weather: {weather_val}")
        print(f"   Temperature: {temp_val}")
        print(f"   day: {day_val}")
        print(f"   timestamp: {ts}")
        print(f"   NumberofLanes: {number_of_lanes_val}")

        # 2. Handle Timestamp String Splits safely
        try:
            hour, minute = map(int, str(ts).split(':'))
        except Exception:
            hour, minute = 12, 0
        
        hour_sin = float(np.sin(2 * np.pi * hour / 24))
        hour_cos = float(np.cos(2 * np.pi * hour / 24))
        minute_sin = float(np.sin(2 * np.pi * minute / 60))
        minute_cos = float(np.cos(2 * np.pi * minute / 60))

        # 3. Safe Categorical Encoding Pipeline via saved LabelEncoders
        raw_vals = {
            'geohash': geohash_val,
            'RoadType': road_type_val,
            'LargeVehicles': large_vehicles_val,
            'Landmarks': landmarks_val,
            'Weather': weather_val
        }
        
        encoded_features = {}
        for col in ['geohash', 'RoadType', 'LargeVehicles', 'Landmarks', 'Weather']:
            val = str(raw_vals[col])
            if val in encoders[col].classes_:
                encoded_features[col] = int(encoders[col].transform([val])[0])
            else:
                encoded_features[col] = int(encoders[col].transform([str(encoders[col].classes_[0])])[0])

        # 4. Handle Day tracking type structure dynamically
        if train['day'].dtype != object:
            try:
                day_encoded = int(day_val)
            except ValueError:
                day_mapping = {'Monday':1, 'Tuesday':2, 'Wednesday':3, 'Thursday':4, 'Friday':5, 'Saturday':6, 'Sunday':7}
                day_encoded = day_mapping.get(str(day_val), 1)
        else:
            day_encoded = str(day_val)

        # 5. Extract Historical Aggregate Reference Data Points
        geo_enc = encoded_features['geohash']
        rt_enc = encoded_features['RoadType']
        day_hour_key = f"{str(day_val)}_{round(hour_sin, 2)}"

        g_mean = float(geohash_mean.get(geo_enc, 0.0))
        rt_mean = float(roadtype_mean.get(rt_enc, 0.0))
        dh_mean = float(day_hour_mean.get(day_hour_key, 0.0))
        
        try:
            gh_mean = float(geohash_hour_mean.loc[(geo_enc, hour)])
        except Exception:
            gh_mean = 0.0

        # 6. Generate Single Row Matrix array for Regressor Pipeline
        # Ensure NumberofLanes is included
        input_data = pd.DataFrame([{
            'day': day_encoded,
            'geohash': geo_enc,
            'RoadType': rt_enc,
            'LargeVehicles': encoded_features['LargeVehicles'],
            'Landmarks': encoded_features['Landmarks'],
            'Weather': encoded_features['Weather'],
            'Temperature': float(temp_val),
            'hour_sin': hour_sin,
            'hour_cos': hour_cos,
            'minute_sin': minute_sin,
            'minute_cos': minute_cos,
            'geohash_demand_mean': g_mean,
            'geohash_hour_demand_mean': gh_mean,
            'day_hour_demand_mean': dh_mean,
            'roadtype_demand_mean': rt_mean,
            'NumberofLanes': int(number_of_lanes_val)
        }])

        # Debug: Show what we're sending to the model
        print(f"\n📊 Input DataFrame columns: {input_data.columns.tolist()}")
        print(f"📊 Input data values: {input_data.iloc[0].to_dict()}")

        # Check what the model expects (for debugging)
        if hasattr(model, 'feature_names_in_'):
            expected = model.feature_names_in_.tolist()
            print(f"📊 Model's feature_names_in_: {expected}")
        else:
            expected = X_train.columns.tolist()
            print(f"📊 Model does not have feature_names_in_, using X_train.columns: {expected}")

        # FORCE sequence layout index allocation to avoid training misalignment
        input_data = input_data[expected]

        # Debug: Verify columns match after reordering
        print(f"\n📊 After reordering - columns: {input_data.columns.tolist()}")
        print(f"📊 Expected columns from model: {expected}")
        
        # Check if columns match
        if list(input_data.columns) != expected:
            missing = set(expected) - set(input_data.columns)
            extra = set(input_data.columns) - set(expected)
            print(f"❌ Missing columns: {missing}")
            print(f"❌ Extra columns: {extra}")
            return jsonify({'error': f'Column mismatch. Missing: {missing}', 'status': 'failed'}), 400

        # 7. Compute Model Prediction
        prediction = model.predict(input_data)[0]
        
        print(f"✅ Prediction: {prediction}")
        
        return jsonify({
            'demand_score': round(float(prediction), 2),
            'status': 'success'
        })

    except Exception as e:
        print(f"❌ API RUNTIME ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'status': 'failed'}), 500

if __name__ == '__main__':
    print("\n🚀 ASTRAM Machine Learning Core launching on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=False)