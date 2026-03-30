const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const http = require('http');
const https = require('https');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;
const LTA_API_KEY = process.env.LTA_API_KEY;

// Reuse TCP connections to DataMall (avoids TLS handshake on every request)
const ltaApi = axios.create({
  baseURL: 'https://datamall2.mytransport.sg/ltaodataservice',
  headers: {
    AccountKey: LTA_API_KEY,
    accept: 'application/json',
  },
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 10000,
});

// ── Bus Stops Cache ──────────────────────────────────────────────────
let cachedBusStops = null;
let busStopsCacheTime = 0;
const BUS_STOPS_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getAllBusStops() {
  const now = Date.now();
  if (cachedBusStops && now - busStopsCacheTime < BUS_STOPS_TTL) {
    return cachedBusStops;
  }

  let busStops = [];
  let skip = 0;
  let hasMoreData = true;

  while (hasMoreData) {
    const response = await ltaApi.get(`/BusStops?$skip=${skip}`);
    const data = response.data.value;

    if (data.length === 0) {
      hasMoreData = false;
    } else {
      busStops = busStops.concat(data);
      skip += 500;
    }
  }

  cachedBusStops = busStops;
  busStopsCacheTime = now;
  console.log(`Bus stops cache refreshed: ${busStops.length} stops`);
  return busStops;
}

// Pre-warm cache on startup
getAllBusStops().catch(err => console.error('Failed to pre-warm bus stops cache:', err.message));

// Enable gzip compression for all responses
app.use(compression());

// Enable CORS with explicit configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Define all API routes BEFORE static file serving
// Define the /bus-arrivals route
app.get('/bus-arrivals', async (req, res) => {
  try {
    const busStopCode = req.query.BusStopCode;

    if (!busStopCode) {
      return res.status(400).send('BusStopCode is required');
    }

    const response = await ltaApi.get(`/v3/BusArrival?BusStopCode=${busStopCode}`);

    // Real-time data — never cache (auto-refreshes every 2s on client)
    res.set('Cache-Control', 'no-store');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching data from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /bus-stops route with skip support (uses cached bus stops)
app.get('/bus-stops', async (req, res) => {
  try {
    const skip = parseInt(req.query.$skip) || 0;
    const limit = parseInt(req.query.$limit) || 500;
    const end = req.query.$end === 'true';

    const busStops = await getAllBusStops();

    let paginatedBusStops;
    if (end) {
      paginatedBusStops = busStops.slice(-limit);
    } else {
      paginatedBusStops = busStops.slice(skip, skip + limit);
    }

    // Bus stop list is quasi-static — cache for 1 hour client-side
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ value: paginatedBusStops });
  } catch (error) {
    console.error('Error fetching bus stops from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Define the /nearby-bus-stops route (uses cached bus stops)
app.get('/nearby-bus-stops', async (req, res) => {
  try {
    const { latitude, longitude, radius = 2 } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).send('Latitude and Longitude are required');
    }

    const busStops = await getAllBusStops();

    const nearbyBusStops = busStops
      .map((busStop) => {
        const distance = calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          busStop.Latitude,
          busStop.Longitude
        );
        return { ...busStop, distance };
      })
      .filter((busStop) => busStop.distance <= parseFloat(radius))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 4);

    // Nearby results change as user moves, but stops themselves are static
    res.set('Cache-Control', 'public, max-age=60');
    res.json(nearbyBusStops);
  } catch (error) {
    console.error('Error fetching nearby bus stops:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /train-service-alerts route
app.get('/train-service-alerts', async (req, res) => {
  try {
    const response = await ltaApi.get('/TrainServiceAlerts');

    res.set('Cache-Control', 'public, max-age=30');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching train service alerts from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /bus-routes route with skip support
app.get('/bus-routes', async (req, res) => {
  try {
    const skip = parseInt(req.query.$skip) || 0;
    const limit = parseInt(req.query.$limit) || 500;

    const response = await ltaApi.get(`/BusRoutes?$skip=${skip}`);

    // Bus routes are quasi-static — cache for 24 hours client-side
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching bus routes from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Define the /bus-stop-det route (get specific bus stop details)
app.get('/bus-stop-det', async (req, res) => {
  try {
    const busStopCode = req.query.BusStopCode;

    if (!busStopCode) {
      return res.status(400).send('BusStopCode is required');
    }

    const busStops = await getAllBusStops();
    const busStop = busStops.find(stop => stop.BusStopCode === busStopCode);

    if (!busStop) {
      return res.status(404).send('Bus stop not found');
    }

    // Bus stop details are quasi-static — cache for 1 hour client-side
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(busStop);
  } catch (error) {
    console.error('Error fetching bus stop details:', error.message);
    res.status(500).send('Error fetching bus stop details');
  }
});

// Define the /bus-services route with skip support
app.get('/bus-services', async (req, res) => {
  try {
    const skip = parseInt(req.query.$skip) || 0;
    const limit = parseInt(req.query.$limit) || 500;

    const response = await ltaApi.get(`/BusServices?$skip=${skip}`);

    // Bus services are quasi-static — cache for 24 hours client-side
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching bus services from LTA:', error.message);
    res.status(500).send('Error connecting to LTA DataMall');
  }
});

// Serve static files (after all API routes to prevent conflicts)
app.use(express.static(path.join(__dirname))); // Serve all static files from root

// Buszy app routes
app.get('/buszy/', (req, res) => {
  res.sendFile(path.join(__dirname, 'buszy/index.html'));
});

app.get('/buszy/service-worker.js', (req, res) => {
  res.type('application/javascript');
  res.set('Service-Worker-Allowed', '/buszy/');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'buszy/service-worker.js'));
});

// RailBuddy app routes
app.get('/rail-buddy/', (req, res) => {
  res.sendFile(path.join(__dirname, 'rail-buddy/index.html'));
});

app.get('/rail-buddy/service-worker.js', (req, res) => {
  res.type('application/javascript');
  res.set('Service-Worker-Allowed', '/rail-buddy/');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'rail-buddy/service-worker.js'));
});

// Legacy redirects (optional - remove if not needed)
app.get('/buszy.html', (req, res) => {
  res.redirect(301, '/buszy/');
});

app.get('/rail-buddy.html', (req, res) => {
  res.redirect(301, '/rail-buddy/');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});