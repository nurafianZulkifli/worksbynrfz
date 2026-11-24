// Builds railbuszy/json/rail-station-locations.json from OneMap's public search API.
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const JSON_DIR = path.join(__dirname, '..', 'railbuszy', 'json');
const OUT = path.join(JSON_DIR, 'rail-station-locations.json');
const SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const MAX_CONCURRENCY = 3;

function getStations() {
  const directions = JSON.parse(fs.readFileSync(path.join(JSON_DIR, 'line-directions.json'), 'utf8'));
  const stations = new Map();
  for (const line of directions.lines) {
    const data = JSON.parse(fs.readFileSync(path.join(JSON_DIR, line.stationDataFile), 'utf8'));
    for (const branch of data.branches) {
      for (const station of branch.stations) {
        if (!stations.has(station.name)) {
          stations.set(station.name, { name: station.name, code: String(station.code).replace(/\s+/g, '') });
        }
      }
    }
  }
  return [...stations.values()];
}

async function searchStation(name) {
  let lastError;
  for (const searchVal of [`${name} MRT`, `${name} LRT`, name]) {
    try {
      const response = await axios.get(SEARCH_URL, {
        params: { searchVal, returnGeom: 'Y', getAddrDetails: 'N', pageNum: 1 },
        timeout: 15000
      });
      const results = response.data && response.data.results;
      const match = Array.isArray(results)
        ? results.find(result => /(?:MRT|LRT) STATION(?: \(|$)/i.test(result.SEARCHVAL || '')) || results[0]
        : null;
      const latitude = Number(match && match.LATITUDE);
      const longitude = Number(match && match.LONGITUDE);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    } catch (error) {
      lastError = error;
      const status = error.response && error.response.status;
      if (status && status < 500 && status !== 429) break;
    }
  }
  throw lastError || new Error(`OneMap did not return a location for ${name}`);
}

async function build() {
  const stations = getStations();
  const locations = new Array(stations.length);
  let next = 0;
  let complete = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= stations.length) return;
      const station = stations[index];
      let lastError;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          locations[index] = { ...station, ...(await searchStation(station.name)) };
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        }
      }
      if (lastError) throw new Error(`${station.name}: ${lastError.message}`);
      complete++;
      if (complete % 25 === 0 || complete === stations.length) {
        console.log(`Fetched OneMap locations ${complete}/${stations.length}`);
      }
    }
  }

  const results = await Promise.allSettled(
    Array.from({ length: Math.min(MAX_CONCURRENCY, stations.length) }, worker)
  );
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join('\n'));

  const payload = { source: 'OneMap', updatedAt: new Date().toISOString(), stations: locations };
  if (fs.existsSync(OUT)) {
    const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    if (JSON.stringify(previous.stations) === JSON.stringify(payload.stations)) {
      console.log('Station locations unchanged; leaving the existing file in place.');
      return;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote ${OUT} (${locations.length} stations).`);
}

build().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
