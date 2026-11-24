/**
 * Build first/last bus timings per stop from LTA DataMall (BusRoutes + BusStops)
 * via the project's proxy, and save to json/first-last-bus.json.
 * ~50 paged requests in total, so no per-stop scraping or rate limiting.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, '../json/first-last-bus.json');
const API_BASE = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
const PAGE_SIZE = 500;
const MAX_RETRIES = 5;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getWithRetry(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await axios.get(url, { timeout: 30000 });
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      const waitMs = Math.min(30000, 2000 * 2 ** attempt);
      console.log(`\n  ${error.response ? error.response.status : error.code} - retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs / 1000}s`);
      await sleep(waitMs);
    }
  }
}

async function fetchAll(endpoint) {
  const all = [];
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const response = await getWithRetry(`${API_BASE}/${endpoint}?$skip=${skip}`);
    const rows = response.data.value || [];
    all.push(...rows);
    process.stdout.write(`\r  ${endpoint}: ${all.length} rows`);
    if (rows.length === 0) break;
    await sleep(200);
  }
  process.stdout.write('\n');
  return all;
}

// "0530" -> "05:30"; LTA uses "-" or empty when a day has no service
function formatTime(value) {
  const digits = String(value || '').trim();
  return /^\d{4}$/.test(digits) ? `${digits.slice(0, 2)}:${digits.slice(2)}` : null;
}

function buildTimings(route) {
  const days = {
    'Weekdays': ['WD_FirstBus', 'WD_LastBus'],
    'Saturdays': ['SAT_FirstBus', 'SAT_LastBus'],
    'Sundays & Public Holidays': ['SUN_FirstBus', 'SUN_LastBus']
  };
  const timings = {};
  for (const [label, [firstKey, lastKey]] of Object.entries(days)) {
    const firstBus = formatTime(route[firstKey]);
    const lastBus = formatTime(route[lastKey]);
    if (firstBus && lastBus) timings[label] = { firstBus, lastBus };
  }
  return timings;
}

async function main() {
  console.log('Fetching data from LTA...');
  const stops = await fetchAll('bus-stops');
  const routes = await fetchAll('bus-routes');

  if (stops.length === 0 || routes.length === 0) {
    console.error('Missing bus stop or route data. Aborting without writing.');
    process.exitCode = 1;
    return;
  }

  const stopNames = new Map(stops.map(s => [s.BusStopCode, s.Description]));

  // Destination of a service/direction = its highest-sequence stop
  const destinations = new Map();
  for (const r of routes) {
    const key = `${r.ServiceNo}|${r.Direction}`;
    const current = destinations.get(key);
    if (!current || r.StopSequence > current.StopSequence) destinations.set(key, r);
  }

  const byStop = new Map();
  for (const r of routes) {
    const timings = buildTimings(r);
    if (Object.keys(timings).length === 0) continue;

    const destination = destinations.get(`${r.ServiceNo}|${r.Direction}`);
    const service = {
      service: r.ServiceNo,
      routeName: (stopNames.get(destination.BusStopCode) || '').toUpperCase(),
      timings
    };

    if (!byStop.has(r.BusStopCode)) byStop.set(r.BusStopCode, []);
    byStop.get(r.BusStopCode).push(service);
  }

  const scrapedAt = new Date().toISOString();
  const allData = [...byStop.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, services]) => ({
      busStopCode: code,
      description: stopNames.get(code) || '',
      services,
      scrapedAt
    }));

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData, null, 2));

  console.log(`Saved ${allData.length} stops (${routes.length} route rows) to ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error('Failed:', error.message);
  process.exitCode = 1;
});
