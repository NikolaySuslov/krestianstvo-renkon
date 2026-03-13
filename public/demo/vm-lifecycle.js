// vm-lifecycle.js — Krestianstvo VM lifecycle helpers
// Handles clean disconnection on page navigation (back button, tab close, etc.)
// The browser often keeps WebSocket TCP connections alive without sending a
// close frame on navigation, leaving stale clients on the reflector.
// Sending an application-level 'goodbye' message solves this reliably.

const _vms = [];

export function registerVM(vm) {
    _vms.push(vm);
}

function _sendAllGoodbyes() {
    _vms.forEach(vm => { if (vm && vm._sendGoodbye) vm._sendGoodbye(); });
}

window.addEventListener('beforeunload',       _sendAllGoodbyes);
window.addEventListener('pagehide',           _sendAllGoodbyes);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _sendAllGoodbyes();
});
