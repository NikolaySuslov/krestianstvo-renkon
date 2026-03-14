// vm-lifecycle.js — Krestianstvo VM lifecycle helpers
// Handles clean disconnection on page navigation (back button, tab close, etc.)
// The browser often keeps WebSocket TCP connections alive without sending a
// close frame on navigation, leaving stale clients on the reflector.
// Sending an application-level 'goodbye' message solves this reliably.
//
// Child VMs spawned via portals are auto-registered via _registerChildVM,
// which is set on every registered VM and inherited by children at spawn time.
// This covers the full spawn tree — root, children, grandchildren — without
// relying on onSpawn wrapping (which can be overwritten by app code).

const _vms = new Set();

function _register(vm) {
    if (!vm || _vms.has(vm)) return;
    _vms.add(vm);

    // Install _registerChildVM on this VM so _onJoinedCallback can call it.
    // Children inherit it: _parent._registerChildVM(child) → child gets it too.
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

window.addEventListener('beforeunload',       _sendAllGoodbyes);
window.addEventListener('pagehide',           _sendAllGoodbyes);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _sendAllGoodbyes();
});
