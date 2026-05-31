/**
 * Buszy — Bus Service Alert Push Notifications
 * Handles the opt-in/opt-out toggle button on alerts.html.
 * Auto-subscription for all pages is handled by buszy-subp.js.
 */
(function () {
  'use strict';

  const PUSH_SERVER = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
  const STORAGE_KEY = 'buszy_alert_notif_subscribed';

  // ── Buszy SW registration ──────────────────────────────────────────

  async function getBuszyRegistration() {
    if (!('serviceWorker' in navigator)) throw new Error('SW not supported');
    const basePath = window.location.pathname.includes('/nrfz-dev/') ? '/nrfz-dev/' : '/';
    const swPath = basePath + 'buszy/service-worker.js';
    const scope  = basePath + 'buszy/';
    const regs = await navigator.serviceWorker.getRegistrations();
    let reg = regs.find(r => r.scope.includes('/buszy/'));
    if (!reg) reg = await navigator.serviceWorker.register(swPath, { scope });
    if (reg.active) return reg;
    return new Promise((resolve, reject) => {
      const sw = reg.installing || reg.waiting;
      if (!sw) { reject(new Error('No SW to wait on')); return; }
      sw.addEventListener('statechange', function handler() {
        if (this.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(reg); }
        if (this.state === 'redundant') { sw.removeEventListener('statechange', handler); reject(new Error('SW became redundant')); }
      });
    });
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  // ── State helpers ──────────────────────────────────────────────────
  // Default is subscribed (localStorage !== 'false').
  // Only an explicit opt-out (button click → 'false') disables alerts.

  function isSubscribed() {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  }

  function setSubscribed(val) {
    localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
  }

  // ── Subscribe / Unsubscribe ────────────────────────────────────────

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported on this browser.\n\niOS users: add Buszy to your Home Screen first.');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission was denied. Enable it in your browser or app settings.');
      return false;
    }
    let reg;
    try { reg = await getBuszyRegistration(); } catch { return false; }
    let vapidKey;
    try {
      const res = await fetch(PUSH_SERVER + '/push/vapid-public-key');
      if (!res.ok) throw new Error('vapid fetch failed');
      vapidKey = await res.text();
    } catch {
      alert('Could not connect to the notification server. Please try again later.');
      return false;
    }
    let subscription;
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    } catch {
      alert('Failed to set up push notifications. Please try again.');
      return false;
    }
    try {
      const res = await fetch(PUSH_SERVER + '/push/subscribe-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
      if (!res.ok) throw new Error('server rejected');
    } catch {
      alert('Failed to register with the notification server. Please try again.');
      return false;
    }
    setSubscribed(true);
    return true;
  }

  async function unsubscribe() {
    try {
      const reg = await getBuszyRegistration();
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await fetch(PUSH_SERVER + '/push/unsubscribe-alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() })
        });
      }
    } catch { /* best-effort */ }
    setSubscribed(false);
  }

  // ── Button helpers ─────────────────────────────────────────────────

  function updateButton(btn) {
    if (isSubscribed()) {
      btn.classList.add('notif-active');
      const label = btn.querySelector('.notif-label');
      if (label) label.innerHTML = '<i class="fa-solid fa-check"></i>';
    } else {
      btn.classList.remove('notif-active');
      const label = btn.querySelector('.notif-label');
      if (label) label.textContent = '';
    }
  }

  async function toggle(btn) {
    btn.disabled = true;
    if (isSubscribed()) {
      await unsubscribe();
    } else {
      await subscribe();
    }
    updateButton(btn);
    btn.disabled = false;
  }

  // ── Re-register on page load ───────────────────────────────────────
  // Restores the server-side subscription after a Heroku restart.

  async function reRegister() {
    if (!isSubscribed()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await getBuszyRegistration();
      const subscription = await reg.pushManager.getSubscription();
      if (!subscription) return;
      await fetch(PUSH_SERVER + '/push/subscribe-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
    } catch { /* network unavailable — will retry on next load */ }
  }

  // ── Init ───────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('alert-notif-btn');
    if (btn) {
      updateButton(btn);
      btn.addEventListener('click', () => toggle(btn));
    }
    reRegister();
  });

  // Re-register when the SW reports a subscription rotation
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        reRegister().catch(() => {});
      }
    });
  }

})();
