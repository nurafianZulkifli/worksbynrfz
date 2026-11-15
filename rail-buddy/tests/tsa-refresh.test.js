const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'tsa.js'), 'utf8');

async function createPage(responses, hour = 12) {
  const boxes = [];
  const icon = { style: {}, innerHTML: '<i class="fa-regular fa-check"></i>' };
  const item = {
    querySelector(selector) {
      return selector === 'img' ? { alt: 'NSL' } : selector === '.status-icon' ? icon : null;
    },
    parentNode: { insertBefore(box) { boxes.push(box); } }
  };
  const updated = { textContent: '' };
  const timers = [];
  const warnings = [];
  let requests = 0;
  let onReady;
  class FakeDate extends Date {
    constructor() { super(2026, 10, 15, hour); }
  }
  const document = {
    addEventListener(type, fn) { if (type === 'DOMContentLoaded') onReady = fn; },
    querySelector() { return updated; },
    querySelectorAll(selector) {
      if (selector === '.alert-message-box') return [...boxes];
      if (selector === '.custom-list-item .status-icon') return [icon];
      if (selector === '.custom-list-item') return [item];
      return [];
    },
    createElement() {
      return { remove() { boxes.splice(boxes.indexOf(this), 1); } };
    },
    head: { appendChild() {} }
  };
  const fetch = url => {
    if (url === 'json/ft-lt.json') {
      const hours = { firstTrain: '05:00', lastTrain: '01:00' };
      return Promise.resolve({ json: () => Promise.resolve([{ line: 'NSL', weekdays: hours, weekends: hours }]) });
    }
    requests++;
    const response = responses.shift();
    return response instanceof Error
      ? Promise.reject(response)
      : Promise.resolve({ ok: true, json: () => Promise.resolve(response) });
  };
  vm.runInNewContext(source, {
    document, fetch, URL, Date: FakeDate,
    window: { location: { href: 'https://example.com/rail-buddy/' } },
    localStorage: { getItem() { throw new Error('stale cache must not be used'); } },
    console: { warn(...args) { warnings.push(args); } },
    setInterval(fn, delay) { timers.push({ fn, delay }); }
  });
  onReady();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  return { boxes, icon, updated, timers, warnings, requests: () => requests, flush };
}

test('fetches immediately and removes resolved alerts on the five-minute refresh', async () => {
  const page = await createPage([
    { value: [{ Status: 2, Message: [{ Content: 'NSL minor delay' }] }] },
    { value: [{ Status: 1, Message: [] }] }
  ]);
  assert.equal(page.requests(), 1);
  assert.equal(page.boxes.length, 1);
  assert.equal(page.icon.style.background, '#ffb300');
  assert.equal(page.timers[0].delay, 5 * 60 * 1000);

  page.timers[0].fn();
  await page.flush();
  assert.equal(page.requests(), 2);
  assert.equal(page.boxes.length, 0);
  assert.equal(page.icon.style.background, '');
  assert.match(page.icon.innerHTML, /fa-check/);
});

test('empty responses clear alerts and restore out-of-hours status', async () => {
  const page = await createPage([
    [{ Status: 2, Message: ['NSL major delay'] }],
    []
  ], 3);
  assert.equal(page.icon.style.background, '#e53935');
  page.timers[0].fn();
  await page.flush();
  assert.equal(page.boxes.length, 0);
  assert.equal(page.icon.style.background, '#888');
  assert.match(page.icon.innerHTML, /fa-dash/);
});

test('failed or invalid refreshes retain the last successful status and report the error', async () => {
  const page = await createPage([
    { value: [{ Status: 2, Message: ['NSL minor delay'] }] },
    new Error('offline'),
    { unexpected: true }
  ]);
  const lastUpdated = page.updated.textContent;
  page.timers[0].fn();
  await page.flush();
  page.timers[0].fn();
  await page.flush();
  assert.equal(page.boxes.length, 1);
  assert.equal(page.icon.style.background, '#ffb300');
  assert.equal(page.updated.textContent, lastUpdated);
  assert.equal(page.warnings.length, 2);
});
