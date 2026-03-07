// demo-boot.js v20
import { KrestianstvoVM } from '../krestianstvo-vm.js';
import { MODEL_PROGRAM, VIEW_PROGRAM, APPLY_ACTION, installDOMHandlers } from './dom-demo.js?v=22';

const cfg = { modelProgram: MODEL_PROGRAM, viewProgram: VIEW_PROGRAM, applyAction: APPLY_ACTION };

function bootVM(rootEl, seloId, delay) {
    setTimeout(() => {
        const vm = new KrestianstvoVM({ seloId });
        // counter/subCounter are MODEL_PROGRAM nodes — read from PS, included in snapshot,
        // pushed to viewPS (where VIEW_PREAMBLE has matching receivers)
        vm.modelStateKeys = ['counter', 'subCounter'];
        installDOMHandlers(vm, rootEl);
        vm.start(cfg);
    }, delay);
}

bootVM(document.getElementById('vmA-root'), 'demo-main', 0);
bootVM(document.getElementById('vmB-root'), 'demo-main', 350);
