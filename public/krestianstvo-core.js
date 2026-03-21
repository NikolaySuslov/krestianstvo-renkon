// krestianstvo-core.js — Krestianstvo SDK 4
//
// Dependency injection for ProgramState (renkon-core).
//
// Users call init() once before creating any VMs or calling krestianify():
//
//   import { ProgramState } from 'https://cdn.jsdelivr.net/npm/renkon-core/dist/renkon-core.js';
//   import { init }         from './krestianstvo-core.js';
//   init({ ProgramState });
//
// Both krestianstvo-vm.js and krestianify.js import _getProgramState() from
// this file instead of importing renkon-core directly.

let _ProgramState = null;

export function init({ ProgramState }) {
    if (!ProgramState) throw new Error('[Krestianstvo] init(): ProgramState is required');
    _ProgramState = ProgramState;
}

export function _getProgramState() {
    if (!_ProgramState) throw new Error(
        '[Krestianstvo] ProgramState not initialised. Call init({ ProgramState }) first.'
    );
    return _ProgramState;
}

// ── selo ───────────────────────────────────────────────────────────────
//
// Single function — compiles the app, optionally reads ?k= and ?r= from URL,
// builds the DOM, and boots the VM.
//
// Usage:
//   selo({ app: APP, modelNodes: MODEL_NODES,
//              seloId: 'my-app', reflector: 'ws://localhost:3000',
//              rootEl: elA, label: 'peer A', buildUI });
//   selo({ app: APP, modelNodes: MODEL_NODES,
//              seloId: 'my-app', reflector: 'ws://localhost:3000',
//              rootEl: elB, label: 'peer B', delay: 350, buildUI });
//
// ?k= and ?r= URL params override seloId and reflector if present.
//
// Parameters:
//   app        — Renkon program string                         (required)
//   modelNodes — array of model node names                     (required)
//   seloId     — session id                                    (required)
//   reflector  — WebSocket reflector URL                       (required)
//   rootEl     — DOM element to mount into                     (required)
//   label      — peer label string passed to buildUI           (default: '')
//   delay       — ms before WS connect                         (default: 0)
//   buildUI     — (rootEl, label) => void — DOM setup callback  (optional)
//   applyAction — extra applyAction body string                  (optional)
//                 merged with any compiler-generated applyAction
//                 use for manual future() scheduling or custom state mutations
//
// Returns: Promise<KrestianstvoVM>

let _KrestianstvoVM  = null;
let _registerVM      = null;
let _krestianify     = null;
let _parseUrlParams  = null;

// Called internally by index.js to inject dependencies.
export function _injectDeps(deps) {
    _KrestianstvoVM = deps.KrestianstvoVM;
    _registerVM     = deps.registerVM;
    _krestianify    = deps.krestianify;
    _parseUrlParams = deps.parseUrlParams;
}

export function selo({
    app, modelNodes,
    seloId, reflector,
    rootEl, label, buildUI,
    applyAction = '',
    delay = 0,
}) {
    if (!_KrestianstvoVM) throw new Error(
        '[Krestianstvo] selo: call init() and import from index.js first.'
    );
    if (!seloId)    throw new Error('[Krestianstvo] selo: seloId is required.');
    if (!reflector) throw new Error('[Krestianstvo] selo: reflector is required.');

    // Compile
    const compiled = _krestianify(app, modelNodes);

    // Allow ?k= and ?r= URL params to override seloId / reflector
    const parsed   = _parseUrlParams(seloId, reflector);
    seloId         = parsed.seloId;
    const wsUrl    = parsed.reflector;

    // Build DOM before VM starts
    if (typeof buildUI === 'function') buildUI(rootEl, label || '');

    // Boot VM after optional delay
    return new Promise(resolve => {
        setTimeout(() => {
            const vm = new _KrestianstvoVM({ seloId, wsUrl });
            vm.modelStateKeys  = compiled.modelStateKeys;
            vm.viewEchoExclude = compiled.viewToModel;
            vm.viewAppExtra    = { rootEl, _buildUI: buildUI || null };
            // Merge compiler-generated applyAction (e.g. timer seeds) with user-supplied
            const _applyAction = [compiled.applyAction, applyAction].filter(Boolean).join('\n');
            vm.start({
                modelProgram: compiled.modelProgram,
                viewProgram:  compiled.viewProgram,
                applyAction:  _applyAction,
            });
            if (_registerVM) _registerVM(vm);
            resolve(vm);
        }, delay);
    });
}
