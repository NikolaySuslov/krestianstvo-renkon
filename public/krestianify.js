// krestianify.js
// Krestianstvo SDK 4 — Compiler
//
// Converts a unified Renkon app (single source string) into the
// model/view split that KrestianstvoVM.start() expects.
//
// ── What it does ───────────────────────────────────────────────────────────
//
//   Given a plain Renkon program and a set of node names declared as
//   "model" (shared, deterministic, replicated):
//
//   1. Splits declarations into modelCode + viewCode
//   2. Detects cross-boundary dependencies:
//        modelToView — model nodes the view reads
//        viewToModel — view nodes the model reads (user actions)
//   3. Generates receiver stubs so each side compiles cleanly
//   4. Generates auto-send wiring on the view side for viewToModel nodes
//   5. Returns { modelProgram, viewProgram, modelStateKeys }
//      — ready to pass directly into vm.start() / vm.modelStateKeys
//
// ── Usage ──────────────────────────────────────────────────────────────────
//
//   // 1. Write a unified Renkon app:
//   const APP = `
//     // MODEL nodes (shared, deterministic)
//     const counter = Behaviors.collect(0, tick, (n) => n + 1);
//     const tick    = Events.receiver();
//
//     // VIEW nodes (local per-client)
//     const btn = document.querySelector('#tick-btn');
//     const _clickTick = Events.listener(btn, 'click', () => 'tick');
//   `;
//
//   // 2. Declare which nodes belong to the model:
//   const MODEL_NODES = ['counter', 'tick'];
//
//   // 3. Compile:
//   const { modelProgram, viewProgram, modelStateKeys } =
//       krestianify(APP, MODEL_NODES);
//
//   // 4. Boot VM as usual:
//   const vm = new KrestianstvoVM({ seloId, wsUrl });
//   vm.modelStateKeys = modelStateKeys;
//   vm.start({ modelProgram, viewProgram, applyAction: MY_APPLY_ACTION });
//
// ── Conventions ────────────────────────────────────────────────────────────
//
//   • Model nodes  — Behaviors/Events that live in worldState / applyAction.
//     They are deterministic and must be the same on all peers.
//
//   • View nodes   — DOM reads/writes, local state, UI reactions.
//     They run only on the local client.
//
//   • viewToModel  — A view node whose value the model reads (user action).
//     krestianify generates an Events.receiver() stub in the model and
//     an auto-send snippet in the view: whenever the node fires it sends
//     a WebSocket message to the reflector which routes it to applyAction.
//
//   • modelToView  — A model node the view reads.
//     krestianify generates a Behaviors/Events.receiver() stub in the view.
//     The VM already pushes all modelStateKeys to viewPS via registerEvent,
//     so no extra plumbing is needed on the model side.
//
// ── This file is a pure compiler — no runtime dependency on krestianstvo-vm.js
// ═══════════════════════════════════════════════════════════════════════════

import { _getProgramState } from './krestianstvo-core.js';

// ── toFuncStr ──────────────────────────────────────────────────────────────
// Wrap user code in a dummy function so ProgramState.getFunctionBody / findDecls
// can parse it for static dependency analysis.

function _kfy_toFuncStr(code, name) {
    name = name || '_app';
    return 'function ' + name + '({}) {\n' + code + '\nreturn {}\n}';
}

// ── _probeDecls ────────────────────────────────────────────────────────────
// Parse userCode with ProgramState, return { allDecls, types }
//   allDecls — array of { name, code }  (one per top-level declaration)
//   types    — Map<name, 'Event'|'Behavior'>

function _kfy_probeDecls(userCode) {
    var probe = new (_getProgramState())(0);
    probe.setLog(function() {});
    var parsed = probe.getFunctionBody(_kfy_toFuncStr(userCode));
    probe.setupProgram([parsed.output]);

    var allDecls = [];
    var types    = new Map();

    // findDecls returns objects with .decls (array of bound names) and .code
    var rawDecls = probe.findDecls(parsed.output);
    rawDecls.forEach(function(d) {
        if (!d.decls || d.decls.length === 0) return;
        var name = d.decls[0];
        if (/^_?\d/.test(name)) return;   // skip anonymous / numeric
        allDecls.push({ name: name, code: d.code });
        // Infer type from source: does this node use Events.* ?
        var isEvent = /\bEvents\.(next|listener|or|change|receiver)\b/.test(d.code)
                   && !/\bBehaviors\.collect\b/.test(d.code);
        types.set(name, isEvent ? 'Event' : 'Behavior');
    });

    return { allDecls: allDecls, types: types, probe: probe };
}

// ── _kfy_findCrossDeps ────────────────────────────────────────────────────
// Find cross-boundary dependencies by scanning declaration source text.
// probe.nodes is unreliable when view nodes reference DOM (Renkon.app.rootEl etc.)
// and fail to evaluate during static analysis. Source text is always available.

function _kfy_findCrossDeps(allDecls, modelSet, viewSet) {
    var modelToView = new Set();
    var viewToModel = new Set();
    // Simple identifier regex — matches JS identifiers
    var idRe = /\b([a-zA-Z_$][\w$]*)\b/g;

    allDecls.forEach(function(d) {
        var inModel = modelSet.has(d.name);
        var inView  = viewSet.has(d.name);
        if (!inModel && !inView) return;
        // Collect all identifiers referenced in this declaration's source
        var refs = new Set();
        var m;
        idRe.lastIndex = 0;
        while ((m = idRe.exec(d.code)) !== null) {
            if (m[1] !== d.name) refs.add(m[1]);
        }
        refs.forEach(function(ref) {
            if (_KFY_VIEW_PREAMBLE_NAMES.has(ref)) return; // always available in view, not cross-boundary
            if (inModel && viewSet.has(ref))  viewToModel.add(ref);
            if (inView  && modelSet.has(ref)) modelToView.add(ref);
        });
    });

    return { modelToView: modelToView, viewToModel: viewToModel };
}

// ── krestianify ────────────────────────────────────────────────────────────
// Main entry point.
//
// Parameters:
//   userCode     — unified Renkon source string
//   modelNodes   — array of node names that belong to the model
//
// Returns:
//   {
//     modelProgram,   — string, ready for vm.start({ modelProgram })
//     viewProgram,    — string, ready for vm.start({ viewProgram })
//     modelStateKeys, — string[], ready for vm.modelStateKeys = ...
//     modelToView,    — Set<string>  (informational)
//     viewToModel,    — Set<string>  (informational)
//     types,          — Map<string,'Event'|'Behavior'>  (informational)
//   }

// Names always provided by VIEW_PREAMBLE — never cross-boundary stubs.
// krestianify must not treat these as undefined view references when they
// appear in model code, nor generate receiver stubs for them in the view.
// Names always pre-declared by VM preambles — compiler must not generate
// receiver stubs or cross-boundary wiring for these.
// Model preamble: vTime, objects, clients (pushed to view after each drain)
// View preamble:  clientIdentity, myObject, _kfy_send, Renkon
var _KFY_VIEW_PREAMBLE_NAMES = new Set([
    'vTime', 'objects', 'clients',                   // model→view, pushed directly by VM
    'clientJoined', 'clientLeft', '_clientDiff',     // join/exit events, model→view
    'clientIdentity', 'myObject',                    // view-only, per-client identity
    '_kfy_send', 'Renkon', 'rootEl', 'UI', 'vm',     // view utilities
    'uid', 'random', 'now', 'future',                  // model builtins — available everywhere
]);

function krestianify(userCode, modelNodes) {
    var modelSet = new Set(modelNodes);

    // ── 1. Parse full program ──────────────────────────────────────────────
    var parsed = _kfy_probeDecls(userCode);
    var allDecls = parsed.allDecls;
    var types    = parsed.types;
    var probe    = parsed.probe;

    // ── 2. Split into model / view decl lists ──────────────────────────────
    var viewSet = new Set();
    allDecls.forEach(function(d) {
        if (!modelSet.has(d.name)) viewSet.add(d.name);
    });
    // Preamble names are always in the view — remove from viewSet so they
    // don't get auto-generated receiver stubs (they already exist in VIEW_PREAMBLE).
    _KFY_VIEW_PREAMBLE_NAMES.forEach(function(n) { viewSet.delete(n); });

    var modelDecls = allDecls.filter(function(d) { return modelSet.has(d.name); });
    var viewDecls  = allDecls.filter(function(d) { return viewSet.has(d.name); });

    // ── 3. Find cross-boundary dependencies ───────────────────────────────
    var cross = _kfy_findCrossDeps(allDecls, modelSet, viewSet);
    var modelToView = cross.modelToView;
    var viewToModel = cross.viewToModel;

    // ── 4. Generate receiver stubs ─────────────────────────────────────────
    //
    // MODEL side: for each viewToModel node, inject Events.receiver() so
    //   the model program compiles without referencing undefined view names.
    //   The VM delivers incoming ws messages via applyAction → registerEvent.
    //
    // VIEW side: for each modelToView node, inject a Behaviors/Events.receiver()
    //   so the view program compiles.  The VM pushes values via registerEvent
    //   (modelStateKeys path) on every model state change.

    var modelReceiverLines = [];
    viewToModel.forEach(function(name) {
        // Always Events.receiver() — cross-boundary signals are point-in-time
        modelReceiverLines.push('const ' + name + ' = Events.receiver();');
    });

    var viewReceiverLines = [];
    modelToView.forEach(function(name) {
        var t = types.get(name) || 'Behavior';
        var ns = (t === 'Event') ? 'Events' : 'Behaviors';
        viewReceiverLines.push(
            'const ' + name + ' = ' + ns + '.receiver();'
        );
    });

    // ── 5. Generate auto-send wiring (view → model) ────────────────────────
    //
    // For each viewToModel node, generate a Behaviors.collect node that
    // watches the node and sends a ws message to the reflector whenever it
    // fires.  The reflector routes it back as a client_msg; applyAction
    // receives it under msg.type === name.
    //
    // Convention: the sent message is { type: name, data: value }.
    // applyAction can read msg.type and msg.data as usual.

    var viewSenderLines = [];
    viewToModel.forEach(function(name) {
        // Behaviors need Events.change() to convert to event stream;
        // Events can be used directly as triggers.
        var t = types.get(name) || 'Behavior';
        var trigger = (t === 'Event') ? name : 'Events.change(' + name + ')';
        // _kfy_send is provided by VIEW_PREAMBLE in krestianstvo-vm.js.
        viewSenderLines.push(
            'const _kfy_send_' + name + ' = Behaviors.collect(null, ' + trigger + ', function(_, v) {\n' +
            '    if (v === undefined || v === null) return null;\n' +
            '    _kfy_send("' + name + '", v);\n' +
            '    return null;\n' +
            '});'
        );
    });

    // ── 5b. Detect model-side Events.timer(N) nodes ─────────────────────────
    // Events.timer(N) in the model is non-deterministic (browser clock) and
    // must be replaced with a future()-based self-chaining receiver — same
    // pattern as the balls demo _tick.
    //
    // For each model timer node named e.g. "timer" with interval N:
    //   - Replace declaration with Events.receiver()
    //   - Inject a _kfy_timerloop_<name> Behaviors.collect that:
    //       • On first fire (any event that could start things): seeds the future
    //       • On each timer fire: reschedules future(now(), N, name, 1)
    //
    // The node fires exactly as Events.timer would — any model node depending
    // on it just works. The value delivered is 1 each tick (truthy counter).

    var modelTimerLines = [];

    modelDecls = modelDecls.map(function(d) {
        var m = d.code.match(/=\s*Events\.timer\s*\(\s*(\d+)\s*\)/);
        if (!m) return d;
        var interval = parseInt(m[1], 10);
        var dn = JSON.stringify(d.name);
        var rn = '_kfy_timerstart_' + d.name;
        // Seed: fires once at model startup to kick off the chain.
        // Uses Events.receiver() with no sender — fires on model PS init (initial value).
        // Guard: checks queue so joiners don't double-seed.
        modelTimerLines.push(
            '// kfy: Events.timer(' + interval + ') → future() self-chain\n' +
            'const _kfy_timerseed_' + d.name + ' = Behaviors.collect(false, Events.change(worldState), function(started, ws) {\n' +
            '    if (started || !ws) return started;\n' +
            '    var queued = (ws.queue || []).some(function(q) { return q.type === ' + dn + '; });\n' +
            '    if (!queued) future(now(), ' + interval + ', ' + dn + ', 1);\n' +
            '    return true;\n' +
            '});\n' +
            'const ' + rn + ' = Behaviors.collect(false, ' + d.name + ', function(_, __) {\n' +
            '    future(now(), ' + interval + ', ' + dn + ', 1);\n' +
            '    return true;\n' +
            '});'
        );
        // Replace with receiver stub — future() delivers the tick
        return Object.assign({}, d, { code: 'const ' + d.name + ' = Events.receiver();' });
    });

    var timerApplyLines = [];  // empty — no applyAction needed for timers

    // ── 6. Assemble final strings ──────────────────────────────────────────
    // Rewrite Behaviors.collect(INIT, ...) in model decls so the model PS restores
    // from snapshot — e.g. counter starts at 10 (from _initialState) not 0.
    // Strategy: find the first top-level comma after the opening paren, extract INIT,
    // replace with (_initialState["name"] !== undefined ? _initialState["name"] : INIT).
    var modelNodeStr = modelDecls.map(function(d) {
        if (d.type === 'Event') return d.code;
        var code = d.code;
        var match = code.match(/Behaviors\.collect\s*\(/);
        if (!match) return code;
        var start = match.index + match[0].length;
        var depth = 0;
        for (var ci = start; ci < code.length; ci++) {
            var ch = code[ci];
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            else if (ch === ')' || ch === ']' || ch === '}') { if (depth === 0) break; depth--; }
            else if (ch === ',' && depth === 0) {
                var initExpr = code.slice(start, ci).trim();
                var key = JSON.stringify(d.name);
                var replacement = '(_initialState[' + key + '] !== undefined ? _initialState[' + key + '] : ' + initExpr + ')';
                return code.slice(0, start) + replacement + code.slice(ci);
            }
        }
        return code;
    }).join('\n');
    var viewNodeStr  = viewDecls.map(function(d)  { return d.code; }).join('\n');

    var modelProgram =
        (modelReceiverLines.length ? modelReceiverLines.join('\n') + '\n\n' : '') +
        modelNodeStr +
        (modelTimerLines.length ? '\n\n// ── kfy timers ──\n' + modelTimerLines.join('\n') : '');

    var viewProgram =
        (viewReceiverLines.length  ? viewReceiverLines.join('\n')  + '\n\n' : '') +
        viewNodeStr +
        (viewSenderLines.length ? '\n\n// ── auto-send: view→model ──\n' + viewSenderLines.join('\n') : '');

    // modelStateKeys = all model node names (they are the projection nodes the
    // VM must snapshot and push to viewPS).
    // Caller can override / trim this list if needed.
    var modelStateKeys = modelDecls.map(function(d) { return d.name; });

    return {
        modelProgram:    modelProgram,
        viewProgram:     viewProgram,
        modelStateKeys:  modelStateKeys,
        modelToView:     modelToView,
        viewToModel:     viewToModel,
        types:           types,
        applyAction:     '',  // timers handled via future() in modelProgram, no applyAction needed
    };
}

// ── krestianifyBoot ────────────────────────────────────────────────────────
// Convenience: compile + boot in one call.
//
//   krestianifyBoot({
//     userCode,        — unified Renkon source string
//     modelNodes,      — string[]  names of model nodes
//     applyAction,     — string    applyAction body (required for model mutations)
//     rootEl,          — HTMLElement  root element for the VM
//     seloId,          — string
//     wsUrl,           — string
//     initialState,    — object (optional)
//     installHandlers, — function(vm, rootEl) called after vm is created
//     onViewPSReady,   — function(viewPS)
//   })
//   → KrestianstvoVM instance

function krestianifyBoot(opts) {
    opts = opts || {};
    var compiled = krestianify(opts.userCode || '', opts.modelNodes || []);

    var vm = new KrestianstvoVM({
        seloId:   opts.seloId  || 'default',
        wsUrl:    opts.wsUrl   || 'ws://localhost:3000',
        depth:    opts.depth   || 0,
    });

    vm.modelStateKeys   = compiled.modelStateKeys;
    vm.viewEchoExclude  = compiled.viewToModel;  // don't echo these back to viewPS

    if (opts.initialState)  vm.initialState  = opts.initialState;
    if (opts.onViewPSReady) vm.onViewPSReady = opts.onViewPSReady;

    if (opts.installHandlers && opts.rootEl)
        opts.installHandlers(vm, opts.rootEl);

    vm.start({
        modelProgram: compiled.modelProgram,
        viewProgram:  compiled.viewProgram,
        applyAction:  opts.applyAction || '',
    });

    return vm;
}

// ── exports ────────────────────────────────────────────────────────────────
export { krestianify, krestianifyBoot };
