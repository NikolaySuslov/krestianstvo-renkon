import { KrestianstvoVM, parseUrlParams, registerVM } from '../index.js';

import { MODEL_PROGRAM, VIEW_PROGRAM, APPLY_ACTION, installDOMHandlers } from './dom-demo.js';

const cfg = { modelProgram: MODEL_PROGRAM, viewProgram: VIEW_PROGRAM, applyAction: APPLY_ACTION };

function bootVM(rootEl, seloId, wsUrl, delay) {
    setTimeout(() => {
        const vm = new KrestianstvoVM({ seloId, wsUrl });
        vm.modelStateKeys = ['ticking', 'windows', 'randomResult', 'counter', 'subCounter'];
        installDOMHandlers(vm, rootEl);
        vm.start(cfg);
        registerVM(vm);
    }, delay);
}

const { seloId, wsUrl } = parseUrlParams('demo-main', 'ws://localhost:3000');
    bootVM(document.getElementById('vmA-root'), seloId, wsUrl, 0);
    bootVM(document.getElementById('vmB-root'), seloId, wsUrl, 350);


