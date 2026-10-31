// Builds rail-buddy/json/train-timetable.json from LTA DataMall's GTFSScheduleTrain dataset.
//
//   LTA_API_KEY=xxxx node scripts/build-train-timetable.js          (downloads the GTFS zip)
//   node scripts/build-train-timetable.js --zip path\to\gtfs.zip    (uses a local zip)
//
// Output (compact, delta-encoded so the browser can compute "next trains" offline):
// {
//   generated: ISO string,
//   services: [{ id, days: [mon..sun as 0/1], start: 'YYYYMMDD', end: 'YYYYMMDD', add: [...], remove: [...] }],
//   stops: { [stop_id]: stop_name },
//   tt: { [stop_id]: [[serviceIndex, destinationName, 'first,delta,delta,...'], ...] }  // minutes after 00:00 (can exceed 1440)
// }
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');

const OUT = path.join(__dirname, '..', 'rail-buddy', 'json', 'train-timetable.json');

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function getZip() {
  const i = process.argv.indexOf('--zip');
  if (i > -1) return fs.readFileSync(process.argv[i + 1]);
  const key = (process.env.LTA_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('Set LTA_API_KEY or pass --zip <file>');
  const link = await axios.get('https://datamall2.mytransport.sg/ltaodataservice/GTFSScheduleTrain', {
    headers: { AccountKey: key, accept: 'application/json' }
  }).catch(e => {
    if (e.response && e.response.status === 401) {
      throw new Error(`LTA rejected the AccountKey (401). Key length seen: ${key.length}. Check it is the full DataMall key with no extra characters.`);
    }
    throw e;
  });
  // LTA's field is lowercase "link" for this endpoint
  const first = link.data && link.data.value && link.data.value[0];
  const url = first && (first.link || first.Link);
  if (!url) throw new Error('No download link in response: ' + JSON.stringify(link.data));
  const zip = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(zip.data);
}

(async () => {
  const zip = new AdmZip(await getZip());
  const read = name => {
    const e = zip.getEntries().find(x => x.entryName === name || x.entryName.endsWith('/' + name));
    return e ? parseCSV(e.getData().toString('utf8')) : [];
  };

  const stopsRaw = read('stops.txt');
  const trips = read('trips.txt');
  const calendar = read('calendar.txt');
  const calendarDates = read('calendar_dates.txt');
  const stopTimes = read('stop_times.txt');
  if (!stopTimes.length) throw new Error('stop_times.txt missing or empty');
  console.log(`stops=${stopsRaw.length} trips=${trips.length} stop_times=${stopTimes.length}`);

  const stops = {};
  stopsRaw.forEach(s => { stops[s.stop_id] = s.stop_name; });

  const serviceIdx = new Map();
  const services = [];
  const svc = id => {
    if (!serviceIdx.has(id)) {
      serviceIdx.set(id, services.length);
      services.push({ id, days: [0, 0, 0, 0, 0, 0, 0], start: '', end: '', add: [], remove: [] });
    }
    return serviceIdx.get(id);
  };
  calendar.forEach(c => {
    const s = services[svc(c.service_id)];
    s.days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(d => +c[d] || 0);
    s.start = c.start_date; s.end = c.end_date;
  });
  calendarDates.forEach(c => {
    const s = services[svc(c.service_id)];
    (c.exception_type === '1' ? s.add : s.remove).push(c.date);
  });

  const tripService = new Map(trips.map(t => [t.trip_id, t.service_id]));

  const byTrip = new Map();
  for (const st of stopTimes) {
    if (!byTrip.has(st.trip_id)) byTrip.set(st.trip_id, []);
    byTrip.get(st.trip_id).push(st);
  }

  const groups = new Map(); // stopId -> Map(`${svcIdx}|${dest}` -> Set(minutes))
  for (const [tripId, list] of byTrip) {
    const sid = tripService.get(tripId);
    if (sid === undefined || list.length < 2) continue;
    list.sort((a, b) => +a.stop_sequence - +b.stop_sequence);
    const last = list[list.length - 1];
    const dest = stops[last.stop_id] || last.stop_id;
    const si = svc(sid);
    for (let i = 0; i < list.length - 1; i++) {
      const st = list[i];
      const time = st.departure_time || st.arrival_time;
      if (!time) continue;
      if (!groups.has(st.stop_id)) groups.set(st.stop_id, new Map());
      const g = groups.get(st.stop_id);
      const k = `${si}|${dest}`;
      if (!g.has(k)) g.set(k, new Set());
      g.get(k).add(toMinutes(time));
    }
  }

  const tt = {};
  for (const [stopId, g] of groups) {
    tt[stopId] = [...g].map(([k, set]) => {
      const sep = k.indexOf('|');
      const arr = [...set].sort((a, b) => a - b);
      const deltas = arr.map((v, i) => (i === 0 ? v : v - arr[i - 1]));
      return [+k.slice(0, sep), k.slice(sep + 1), deltas.join(',')];
    });
  }

  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), services, stops, tt }));
  console.log(`Wrote ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${Object.keys(tt).length} stops)`);
})().catch(e => { console.error(e.message); process.exit(1); });
