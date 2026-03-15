// vm-lifecycle.js — Krestianstvo VM lifecycle helpers
//
// Sends an application-level 'goodbye' message so the reflector can clean up
// stale clients immediately, without waiting for TCP close frames which the
// browser may never send (especially on bfcache navigation).
//
// Event strategy:
//   beforeunload              — tab close, hard navigation → always goodbye
//   pagehide (persisted=false)— page unloaded, not cached  → always goodbye
//   pagehide (persisted=true) — bfcache freeze (back button)→ goodbye so
//                               reflector doesn't keep stale client
//
//   visibilitychange → hidden — tab switch, minimise, screen lock → NO goodbye
//                               user is coming back; killing the WS would force
//                               a full reconnect + snapshot on return
//
// Child VMs spawned via portals are auto-registered via _registerChildVM,
// set on every registered VM and inherited by children at spawn time.

const _vms = new Set();

function _register(vm) {
    if (!vm || _vms.has(vm)) return;
    _vms.add(vm);

    // Install _registerChildVM so _onJoinedCallback in krestianstvo-vm.js
    // can auto-register children (and their children) without wrapping onSpawn.
    vm._registerChildVM = function(childVM) {
        _register(childVM);
    };

    // When VM closes (portal destroyed), remove from set.
    const _prevOnClose = vm.onClose;
    vm.onClose = function(ev) {
        _vms.delete(vm);
        if (typeof _prevOnClose === 'function') _prevOnClose(ev);
    };
}

export function registerVM(vm) {
    _register(vm);
}

function _sendAllGoodbyes() {
    _vms.forEach(vm => { if (vm && vm._sendGoodbye) vm._sendGoodbye(); });
}

// Tab/window closed or hard navigation away
window.addEventListener('beforeunload', _sendAllGoodbyes);

// pagehide covers both unload and bfcache freeze.
// persisted=true  → page is being frozen into bfcache (back/forward nav)
//                   send goodbye — reflector must not keep stale client
// persisted=false → page is being unloaded (same as beforeunload)
//                   send goodbye — belt-and-suspenders with beforeunload
window.addEventListener('pagehide', _sendAllGoodbyes);

// NOTE: visibilitychange is intentionally NOT used here.
// Firing on hidden would disconnect users who simply switch tabs,
// minimise the window, or lock their screen — all recoverable states
// that should preserve the WS connection.
