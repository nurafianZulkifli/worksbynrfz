const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'train-timings.js'), 'utf8');

async function createPage() {
  let now = Date.parse('2026-11-07T02:00:00Z');
  let nextTimer = 0;
  let headRequests = 0;
  let resolveHead;
  const timers = new Map();
  const listeners = {};
  const elements = new Map();
  const timetable = {
    stops: { NS5_A: 'Yew Tee' },
    tt: { NS5_A: [[0, 'Marina South Pier', '602,2']] },
    services: [{ start: '20260101', end: '20261231', days: [1, 1, 1, 1, 1, 1, 1], add: [], remove: [] }]
  };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      style: {}, classList: { add() {}, toggle() {} },
      addEventListener() {}, querySelector() { return {}; },
      innerHTML: '', textContent: '', hidden: false
    });
    return elements.get(id);
  }
  const document = {
    hidden: false,
    getElementById: element,
    addEventListener(type, fn) { listeners['document:' + type] = fn; }
  };
  const window = {
    location: { pathname: '/rail-buddy/train-timings.html', href: 'https://example.com/rail-buddy/train-timings.html' },
    addEventListener(type, fn) { listeners['window:' + type] = fn; }
  };
  const fetch = (url, options) => {
    if (options && options.method === 'HEAD') {
      headRequests++;
      return new Promise((resolve, reject) => {
        resolveHead = resolve;
        options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }
    const body = url === 'json/train-timetable.json' ? timetable
      : url === 'json/smrt-station-codes.json' ? {} : [];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
  const context = {
    document, window, fetch, AbortController, URL, Intl, Date: FakeDate,
    localStorage: { getItem(key) { return key === 'railbuddy_tt_station' ? 'Yew Tee' : null; }, setItem() {}, removeItem() {} },
    console: { warn() {} },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval() {}
  };
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    element, listeners, timers,
    setTime(value) { now = Date.parse(value); },
    headRequests() { return headRequests; },
    resolveClock(value) {
      resolveHead({ ok: true, headers: { get() { return value; } } });
    },
    async flush() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
  };
}

test('loads and refreshes the selected station while clock synchronization is stalled', async () => {
  const page = await createPage();
  const directions = page.element('directionsContainer');
  assert.match(directions.innerHTML, /2<small> mins<\/small>/);
  assert.equal(page.headRequests(), 1);

  page.setTime('2026-11-07T02:00:30Z');
  page.listeners['window:focus']();
  assert.match(directions.innerHTML, /1<small> min<\/small>/);
  assert.equal(page.headRequests(), 1);

  page.setTime('2026-11-07T02:02:31Z');
  page.listeners['document:visibilitychange']();
  assert.doesNotMatch(directions.innerHTML, /Marina South Pier<\/span><span class="tt-next-hint tt-arr"/);
  assert.match(directions.innerHTML, /1<small> min<\/small>/);

  const clockTimeout = [...page.timers.values()].find(timer => timer.delay === 8000);
  assert.ok(clockTimeout);
  clockTimeout.fn();
  await page.flush();
  page.listeners['window:online']();
  assert.equal(page.headRequests(), 2);
});

test('scheduled refresh updates the countdown without a clock response', async () => {
  const page = await createPage();
  page.setTime('2026-11-07T02:00:30Z');
  const tick = [...page.timers.values()].find(timer => timer.delay === 30250);
  assert.ok(tick);
  tick.fn();
  assert.match(page.element('directionsContainer').innerHTML, /1<small> min<\/small>/);
});

test('a successful clock synchronization immediately corrects the countdown', async () => {
  const page = await createPage();
  page.resolveClock('Sat, 07 Nov 2026 02:01:00 GMT');
  await page.flush();
  assert.match(page.element('directionsContainer').innerHTML, /1<small> min<\/small>/);
});
