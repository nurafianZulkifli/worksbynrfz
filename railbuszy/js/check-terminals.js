const data = require('../json/bus-service-data.json');
const codes = require('../json/destination-codes.json');

const getName = code => codes[code] ? codes[code].description : null;

let found = 0;

for (const svc of data) {
    const entries = [];

    if (svc.direction_routes) {
        for (const [dir, route] of Object.entries(svc.direction_routes)) {
            if (route.st && route.st.length > 0) {
                entries.push({ dir, ts: route.ts, te: route.te, st: route.st });
            }
        }
    } else if (svc.st && svc.st.length > 0) {
        entries.push({ dir: null, ts: svc.ts, te: svc.te, st: svc.st });
    }

    for (const e of entries) {
        const fc = e.st[0];
        const lc = e.st[e.st.length - 1];
        const fn = getName(fc);
        const ln = getName(lc);

        // Only flag when the stop IS in the map but the name doesn't match
        const startBad = fn !== null && fn.toLowerCase() !== (e.ts || '').toLowerCase();
        const endBad   = ln !== null && ln.toLowerCase() !== (e.te || '').toLowerCase();

        if (startBad || endBad) {
            found++;
            const dir = e.dir ? ' dir ' + e.dir : '';
            if (startBad) console.log('Service ' + svc.n + dir + '  [START]  ts=' + JSON.stringify(e.ts) + '  but ' + fc + '=' + JSON.stringify(fn));
            if (endBad)   console.log('Service ' + svc.n + dir + '  [END]    te=' + JSON.stringify(e.te) + '  but ' + lc + '=' + JSON.stringify(ln));
        }
    }
}

if (found === 0) console.log('No mismatches found (for stops present in destination-codes.json).');
