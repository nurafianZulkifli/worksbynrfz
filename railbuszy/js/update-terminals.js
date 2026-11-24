/**
 * update-terminals.js
 *
 * Fetches all bus stops from the LTA API proxy, then updates every ts/te in
 * bus-service-data.json so they always match the API Description of the
 * first/last stop code in each direction's st array.
 *
 * Usage:  node js/update-terminals.js
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const DATA_FILE = path.join(__dirname, '../json/bus-service-data.json');
const API_URL   = 'https://bat-lta-9eb7bbf231a2.herokuapp.com/bus-stops';
const BATCH     = 500;

async function fetchAllStops() {
    const map = {};
    let skip = 0;

    while (true) {
        const res   = await axios.get(`${API_URL}?$skip=${skip}&$top=${BATCH}`, { timeout: 15000 });
        const stops = res.data.value || [];

        for (const s of stops) {
            if (s.BusStopCode && s.Description) {
                map[s.BusStopCode] = s.Description;
            }
        }

        console.log(`  Fetched ${stops.length} stops (total so far: ${Object.keys(map).length})`);

        if (stops.length < BATCH) break;
        skip += BATCH;
    }

    return map;
}

function updateEntry(entry, stopMap) {
    if (!entry.st || entry.st.length === 0) return 0;

    const firstCode = entry.st[0];
    const lastCode  = entry.st[entry.st.length - 1];
    let changes = 0;

    const firstName = stopMap[firstCode];
    const lastName  = stopMap[lastCode];

    if (firstName && entry.ts !== firstName) {
        console.log(`  ts: "${entry.ts}" → "${firstName}"  (stop ${firstCode})`);
        entry.ts = firstName;
        changes++;
    }

    if (lastName && entry.te !== lastName) {
        console.log(`  te: "${entry.te}" → "${lastName}"  (stop ${lastCode})`);
        entry.te = lastName;
        changes++;
    }

    return changes;
}

async function main() {
    console.log('Fetching bus stops from LTA API...');
    const stopMap = await fetchAllStops();
    console.log(`Loaded ${Object.keys(stopMap).length} stop descriptions.\n`);

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    let total = 0;

    for (const svc of data) {
        const prefix = `Service ${svc.n}`;

        if (svc.direction_routes) {
            for (const [dir, route] of Object.entries(svc.direction_routes)) {
                process.stdout.write(`${prefix} dir ${dir}: `);
                const n = updateEntry(route, stopMap);
                // Sync top-level ts/te with dir 1 values
                if (dir === '1' && svc.directions && svc.directions[0] === 1) {
                    if (stopMap[route.st[0]])                         svc.ts = route.ts;
                    if (stopMap[route.st[route.st.length - 1]])       svc.te = route.te;
                }
                if (n === 0) console.log('ok');
                total += n;
            }
        } else if (svc.st && svc.st.length > 0) {
            process.stdout.write(`${prefix}: `);
            total += updateEntry(svc, stopMap);
            if (total === 0) console.log('ok');
        }
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`\nDone. ${total} field(s) updated. Saved to ${DATA_FILE}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
