import { KrestianstvoVM } from '../krestianstvo-vm.js';
import { MODEL_PROGRAM, VIEW_PROGRAM, APPLY_ACTION, installDOMHandlers } from './dom-demo.js';

const cfg = { modelProgram: MODEL_PROGRAM, viewProgram: VIEW_PROGRAM, applyAction: APPLY_ACTION };

// Parse URL params:
//   ?k=seloName          — selo id            (default: 'demo-main')
//   ?r=http://host:port  — reflector base url  (default: ws://localhost:3000)
//   http:// and https:// are auto-converted to ws:// and wss:// respectively
function parseUrlParams() {
    const p = new URLSearchParams(window.location.search);
    const seloId = p.get('k') || 'demo-main';
    let wsUrl = 'ws://localhost:3000';
    const r = p.get('r');
    if (r) wsUrl = r.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    return { seloId, wsUrl };
}

function bootVM(rootEl, seloId, wsUrl, delay) {
    setTimeout(() => {
        const vm = new KrestianstvoVM({ seloId, wsUrl });
        // All model state goes through modelStateKeys — uniform snapshot + viewPS push path
        vm.modelStateKeys = ['ticking', 'windows', 'randomResult', 'counter', 'subCounter'];
        // Default world state for the first peer — joiners restore from snapshot instead
        // vm.initialState = { ticking: false, counter: 0 };  // example — omit to use defaults
        installDOMHandlers(vm, rootEl);
        vm.start(cfg);
    }, delay);
}

const { seloId, wsUrl } = parseUrlParams();
bootVM(document.getElementById('vmA-root'), seloId, wsUrl, 0);
bootVM(document.getElementById('vmB-root'), seloId, wsUrl, 350);
