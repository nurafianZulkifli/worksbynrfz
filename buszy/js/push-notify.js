/**
 * Buszy Push Notifications
 * Handles subscription, unsubscription, and button state management
 * for bus arrival push notifications.
 *
 * Exposes a single global: window.BuszyPushNotify
 */
(function () {
  'use strict';

  const PUSH_SERVER = 'https://bat-lta-9eb7bbf231a2.herokuapp.com';
  const STORAGE_KEY = 'buszy_push_subs'; // Set<"stopCode:serviceNo">

  // ── LocalStorage helpers ───────────────────────────────────────────

  function getSubs() {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  function saveSubs(set) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  }

  function isTracked(stopCode, serviceNo) {
    return getSubs().has(stopCode + ':' + serviceNo);
  }

  function addTracked(stopCode, serviceNo) {
    const s = getSubs();
    s.add(stopCode + ':' + serviceNo);
    saveSubs(s);
  }

  function removeTracked(stopCode, serviceNo) {
    const s = getSubs();
    s.delete(stopCode + ':' + serviceNo);
    saveSubs(s);
  }

  // ── VAPID helper ───────────────────────────────────────────────────

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  // ── Subscribe ──────────────────────────────────────────────────────

  async function subscribe(stopCode, serviceNo, thresholdMinutes = 1) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported on this browser.\n\niOS users: add Buszy to your Home Screen first.');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission was denied. Enable it in your browser settings to use this feature.');
      return false;
    }

    let reg;
    try {
      reg = await navigator.serviceWorker.ready;
    } catch {
      alert('Service worker is not ready. Please refresh and try again.');
      return false;
    }

    let vapidKey;
    try {
      const res = await fetch(PUSH_SERVER + '/push/vapid-public-key');
      if (!res.ok) throw new Error('Server returned ' + res.status);
      vapidKey = await res.text();
    } catch (e) {
      console.error('[push-notify] VAPID key fetch failed:', e);
      alert('Could not connect to the notification server. Please try again later.');
      return false;
    }

    let subscription;
    try {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });
    } catch (e) {
      console.error('[push-notify] PushManager.subscribe failed:', e);
      alert('Failed to set up push notifications. Please try again.');
      return false;
    }

    try {
      const res = await fetch(PUSH_SERVER + '/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          busStopCode: stopCode,
          serviceNo: serviceNo,
          threshold: thresholdMinutes || 3
        })
      });
      if (!res.ok) throw new Error('Server rejected: ' + res.status);
    } catch (e) {
      console.error('[push-notify] Registration with server failed:', e);
      alert('Failed to register notification with the server. Please try again.');
      return false;
    }

    addTracked(stopCode, serviceNo);
    return true;
  }

  // ── Unsubscribe ────────────────────────────────────────────────────

  async function unsubscribe(stopCode, serviceNo) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();
      if (subscription) {
        await fetch(PUSH_SERVER + '/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            busStopCode: stopCode,
            serviceNo: serviceNo
          })
        });
      }
    } catch (e) {
      console.warn('[push-notify] Unsubscribe request error (ignored):', e);
    }
    removeTracked(stopCode, serviceNo);
  }

  // ── Toggle (called by button click) ───────────────────────────────

  async function toggle(stopCode, serviceNo, btn) {
    if (!stopCode || !serviceNo) return;

    const wasActive = isTracked(stopCode, serviceNo);

    // Optimistically update UI
    btn.disabled = true;

    if (wasActive) {
      await unsubscribe(stopCode, serviceNo);
      setButtonInactive(btn);
    } else {
      const ok = await subscribe(stopCode, serviceNo, 1);
      if (ok) {
        setButtonActive(btn);
      } else {
        setButtonInactive(btn);
      }
    }

    btn.disabled = false;
  }

  // ── Button appearance helpers ──────────────────────────────────────

  function setButtonActive(btn) {
    btn.classList.add('notif-active');
    const label = btn.querySelector('.notif-label');
    if (label) label.textContent = 'Notifying';
  }

  function setButtonInactive(btn) {
    btn.classList.remove('notif-active');
    const label = btn.querySelector('.notif-label');
    if (label) label.textContent = 'Notify';
  }

  // ── Restore button states after DOM rebuild ────────────────────────

  function restoreButtonStates() {
    const subs = getSubs();
    document.querySelectorAll('.notif-toggle-btn').forEach(btn => {
      const stopCode = btn.getAttribute('data-stop');
      const serviceNo = btn.getAttribute('data-service');
      if (subs.has(stopCode + ':' + serviceNo)) {
        setButtonActive(btn);
      } else {
        setButtonInactive(btn);
      }
    });
  }

  // ── Notification permission banners ───────────────────────────────

  const PROMPTED_KEY = 'buszy_notif_prompted';

  function checkAndShowPermissionBanner() {
    if (!('Notification' in window)) return;
    const permission = Notification.permission;
    if (permission === 'denied') {
      const el = document.getElementById('notif-blocked-banner');
      if (el) el.style.display = 'flex';
    } else if (permission === 'default') {
      if (!localStorage.getItem(PROMPTED_KEY)) {
        const el = document.getElementById('notif-prompt-banner');
        if (el) el.style.display = 'flex';
      }
    }
  }

  async function enableFromBanner() {
    localStorage.setItem(PROMPTED_KEY, '1');
    const promptBanner = document.getElementById('notif-prompt-banner');
    if (promptBanner) promptBanner.style.display = 'none';
    const permission = await Notification.requestPermission();
    if (permission === 'denied') {
      const blockedBanner = document.getElementById('notif-blocked-banner');
      if (blockedBanner) blockedBanner.style.display = 'flex';
    }
  }

  function dismissPromptBanner() {
    localStorage.setItem(PROMPTED_KEY, '1');
    const el = document.getElementById('notif-prompt-banner');
    if (el) el.style.display = 'none';
  }

  function dismissBlockedBanner() {
    const el = document.getElementById('notif-blocked-banner');
    if (el) el.style.display = 'none';
  }

  document.addEventListener('DOMContentLoaded', checkAndShowPermissionBanner);

  // ── Re-register all tracked subscriptions with the server ──────────
  // Called on every page load to restore subscriptions lost after a
  // server restart or Heroku dyno wake-up (in-memory state is gone).

  async function reRegisterAll() {
    const subs = getSubs();
    if (subs.size === 0) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let subscription;
    try {
      const reg = await navigator.serviceWorker.ready;
      subscription = await reg.pushManager.getSubscription();
    } catch { return; }

    if (!subscription) return; // not subscribed at browser level — nothing to restore

    for (const key of subs) {
      const [stopCode, serviceNo] = key.split(':');
      try {
        await fetch(PUSH_SERVER + '/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            busStopCode: stopCode,
            serviceNo: serviceNo,
            threshold: 1
          })
        });
      } catch { /* network unavailable — will retry on next load */ }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────

  window.BuszyPushNotify = {
    toggle, restoreButtonStates, isTracked, reRegisterAll,
    enableFromBanner, dismissPromptBanner, dismissBlockedBanner
  };

})();
