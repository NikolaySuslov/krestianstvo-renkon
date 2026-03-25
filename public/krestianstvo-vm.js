// krestianstvo-vm.js
// Krestianstvo - Renkon | SDK 4 — Pure Renkon FRP VM

import { _getProgramState } from './krestianstvo-core.js';

let _krestianify   = null;

let _appResolver   = null;
export function _setKrestianify(fn)  { _krestianify = fn; }
export function _setAppResolver(fn)  { _appResolver = fn; }
//
// Architecture:
//   KrestianstvoVM.ps  — meta ProgramState; the VM IS a Renkon program:
//     wsMessages   — Events.next(asyncGenerator)  raw WS stream
//     wsMsg        — Behaviors.collect            latest non-null message
//     seloState    — Behaviors.collect FSM        null → buffering → live
//     spawnedNames — Behaviors.collect            string[] from worldState.spawned
//     children$    — Behaviors.collect            Map<name,KrestianstvoVM>
//                    diffs spawnedNames → creates / closes child VMs reactively
//                    recursion is structural: each child runs the same meta-program
//
//   KrestianstvoVM.modelPS — model ProgramState
//     preamble: engine (future/random/_enqueue/_drain/worldState/vTime)
//     + user MODEL_PROGRAM (raw Renkon)
//
//   KrestianstvoVM.viewPS  — view ProgramState
//     preamble: (objects / vTime / clientIdentity / randomResult receivers)
//     + user VIEW_PROGRAM (raw Renkon)
//
// User-facing API:
//   const vm = new KrestianstvoVM({ wsUrl?, seloId?, depth? })
//   vm.start({ modelProgram, viewProgram, applyAction? })
//     modelProgram — raw Renkon string; may reference worldState, vTime,
//                    random(), future(), and any names declared in preamble
//     viewProgram  — raw Renkon string; may reference objects, vTime,
//                    clientIdentity, randomResult
//     applyAction  — JS function-body string (state, msg) → state additions
//
//   vm.ps, vm.modelPS, vm.viewPS   — ProgramState references
//   vm.children$                   — live Map<name,KrestianstvoVM> (read via getNode)
//   vm.onSeloJoined  = ({ clientId, seloId }) => {}
//   vm.onViewPSReady = (viewPS) => {}
//   vm.onSpawn       = ({ name, vm, depth }) => {}
//   vm.onClose       = ({ name }) => {}
//   vm.onError       = err => {}
//
// no compiler step.
// The model/view split is explicit in user code.

// ═══════════════════════════════════════════════════════════════════════════
// STRINGIFY HELPER
// ═══════════════════════════════════════════════════════════════════════════

const _vmFnToConst = (name, fn) => {
    const src = fn.toString();
    if (src.trimStart().startsWith('(') || src.match(/^\w+\s*=>/))
        return 'const ' + name + ' = ' + src + ';';
    const m = src.match(/^(?:function\s+\w*\s*)?\(([^)]*)\)\s*\{([\s\S]*)\}$/);
    if (m) return 'const ' + name + ' = (' + m[1] + ') => {' + m[2] + '};';
    return 'const ' + name + ' = ' + src + ';';
};

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE — stringified into model preamble
// ═══════════════════════════════════════════════════════════════════════════

const _vm_future = (currentTime, ms, type, data) => {
    data = data || {};
    const msg = { type, data, from: '_future',
                  serverTime: currentTime + ms, _future: true };
    _pendingFutures.push(msg);
    console.log('%c⏳ FUTURE scheduled', 'color:#f90;font-weight:bold',
        type, '| fires@' + msg.serverTime, '| now=' + currentTime, '| in+' + ms + 'ms');
};

const _vm_enqueue = (state, ev) => {
    if (!ev) return state;
    if (ev.type === 'heartbeat') {
        const next = { ...state, time: Math.max(state.time, ev.vTime) };
        // Push vTime to viewPS here — _vm_drain only pushes when draining a queued
        // message and returns early (same ref) for empty queue, so heartbeats would
        // never reach the viewPS vTime display without this push.
        if (app.viewPS && next.time !== state.time)
            app.viewPS.registerEvent('vTime', next.time);
        return next;
    }
    if (ev.type === 'disconnect') {
        const objs = { ...state.objects };
        delete objs[ev.from];
        return { ...state, objects: objs };
    }
    if (ev.type === 'client_msg') {
        const m = ev.data;
        const newTime = m._future ? state.time : Math.max(state.time, m.serverTime);
        return { ...state, time: newTime, queue: [...state.queue, m] };
    }
    return state;
};

const _vm_drain = (s) => {
    const ready = s.queue
        .filter(m => m.serverTime <= s.time)
        .sort((a, b) => a.serverTime - b.serverTime);
    if (!ready.length) return s;  // same reference — no change — Events.change won't fire
    const msg = ready[0];
    // Update _vTime to the exact serverTime of the message being drained so
    // now() returns the correct non-quantised time inside applyAction accumulators.
    if (app._vTime !== undefined) app._vTime = msg.serverTime;
    console.log('[drain] msg.type=' + msg.type + ' serverTime=' + msg.serverTime + ' _future=' + !!msg._future + ' now()=' + app._vTime);
    const next = applyAction(s, msg);
    if (!next) { console.error('[drain] applyAction returned null for', msg.type); return s; }
    next._rngState = [_rngRef[0], _rngRef[1], _rngRef[2], _rngRef[3]];
    const scheduled = _pendingFutures.splice(0);
    next.queue = [...s.queue.filter(m => m !== msg), ...scheduled];
    next.time  = s.time;
    if (app._ps) {
        const val = (msg.data && typeof msg.data === 'object')
            ? { ...msg.data, from: msg.from }
            : { value: msg.data, from: msg.from };
        // Feed the model PS receiver for this message so FRP nodes fire.
        // viewToModel types (incr/decr) are handled by _makeSend 3rd-step instead —
        // they must not be double-registered here or they'd fire twice.
        if (!(app.viewEchoExclude && app.viewEchoExclude.has(msg.type))) {
            app._ps.registerEvent(msg.type, msg.data);
        }
        // Notify meta PS if spawned list changed
        if (app.metaPS && next.spawned !== s.spawned) {
            console.log('[_makeSend] spawned changed:', s.spawned, '->', next.spawned);
            app.metaPS.registerEvent('_spawned', next.spawned.slice());
        }
        if (app.viewPS && msg.type !== 'spawnSelo') {
            if (!app.viewEchoExclude || !app.viewEchoExclude.has(msg.type))
                app.viewPS.registerEvent(msg.type, val);
            // Push objects + vTime directly from worldState — always current after drain
            if (next.objects !== s.objects) app.viewPS.registerEvent('objects', next.objects);
            if (next.objects !== s.objects) {
                var _nextClients = Object.keys(next.objects || {}).sort();
                var _prevClients = Object.keys(s.objects || {}).sort();
                app.viewPS.registerEvent('clients',      _nextClients);
                app.viewPS.registerEvent('clientJoined', _nextClients.filter(function(id) { return _prevClients.indexOf(id) === -1; }));
                app.viewPS.registerEvent('clientLeft',   _prevClients.filter(function(id) { return _nextClients.indexOf(id) === -1; }));
            }
            if (next.time   !== s.time)    app.viewPS.registerEvent('vTime',   next.time);
            // modelStateKeys are pushed to viewPS in _makeSend after FRP propagation —
            // not here in drain, to avoid pushing stale PS node initial values (e.g. counter=0)
            // over correct snapshot-restored values.
        }
    }
    return _vm_drain(next);
};

const _vm_applyAction_builtin = (state, msg) => {
    if (!msg) return state;
    if (msg.type === '_join') {
        if (state.objects[msg.from]) return state;
        console.log('[_join] peer joined:', msg.from);
        // Assign deterministic color from shared random() — same result on all peers
        const _palette = ['#e05555','#0077cc','#0a9960','#f87800','#8833ee','#009bbb','#cc4400','#558800','#b05090','#207070'];
        const _color = _palette[Math.floor(random() * _palette.length)];
        return { ...state, objects: { ...state.objects, [msg.from]: { joinedAt: state.time, color: _color, x: 80, y: 80 } } };
    }
    if (msg.type === '_leave') {
        const objs = { ...state.objects };
        delete objs[msg.from];
        return { ...state, objects: objs };
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// XOROSHIRO128+
// ═══════════════════════════════════════════════════════════════════════════

const _vm_xoroshiroSeed = (seed) => {
    let s = seed >>> 0;
    const sm = () => {
        s = (s + 0x9e3779b9) >>> 0;
        let x = s;
        x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
        x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
        return (x ^ (x >>> 16)) >>> 0;
    };
    return [sm(), sm(), sm(), sm()];
};

const _vm_xoroshiroNext = (st) => {
    const s0lo = st[0], s0hi = st[1], s1lo = st[2], s1hi = st[3];
    const rlo  = (s0lo + s1lo) >>> 0;
    const rhi  = (s0hi + s1hi + (rlo < s0lo ? 1 : 0)) >>> 0;
    const r24lo = (s0lo << 24) | (s0hi >>> 8);
    const r24hi = (s0hi << 24) | (s0lo >>> 8);
    let n1lo = s1lo ^ s0lo, n1hi = s1hi ^ s0hi;
    st[0] = (r24lo ^ n1lo ^ (n1lo << 16)) >>> 0;
    st[1] = (r24hi ^ n1hi ^ ((n1hi << 16) | (n1lo >>> 16))) >>> 0;
    st[2] = ((n1lo >>> 27) | (n1hi << 5)) >>> 0;
    st[3] = ((n1hi >>> 27) | (n1lo << 5)) >>> 0;
    return rhi * (1 / 4294967296);
};

// ═══════════════════════════════════════════════════════════════════════════
// WS ASYNC GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

function _makeWsStream(ws) {
    const queue = [], resolvers = [];
    ws.addEventListener('message', ev => {
        try {
            const data = JSON.parse(ev.data);
            if (resolvers.length > 0) resolvers.shift()(data);
            else queue.push(data);
        } catch(e) { console.error('WS parse error:', e); }
    });
    return (async function* () {
        while (true) {
            const data = await new Promise(resolve => {
                if (queue.length > 0) resolve(queue.shift());
                else resolvers.push(resolve);
            });
            if (data.type !== 'heartbeat') console.log('📩 WS:', data.type, data);
            yield data;
        }
    })();
}

// ═══════════════════════════════════════════════════════════════════════════
// MODEL PREAMBLE BUILDER
// ═══════════════════════════════════════════════════════════════════════════
// Returns a Renkon source string that sets up the entire causality engine.
// Appended with the user's modelProgram, this is the complete model PS source.

function buildModelPreamble(applyActionBody) {
    applyActionBody = applyActionBody || '    return state;';

    const xoroshiroSeedSrc = _vmFnToConst('_xoroshiroSeed', _vm_xoroshiroSeed);
    const xoroshiroNextSrc = _vmFnToConst('_xoroshiroNext', _vm_xoroshiroNext);
    const futureSrc  = _vmFnToConst('future',   _vm_future).replace(/_vm_future/g,  'future');
    const enqueueSrc = _vmFnToConst('_enqueue', _vm_enqueue);
    const drainSrc   = _vmFnToConst('_drain',   _vm_drain)
                           .replace(/_vm_drain/g,   '_drain')
                           .replace(/_vm_enqueue/g, '_enqueue');

    const builtinBody = _vm_applyAction_builtin.toString()
        .replace(/^.*?=>\s*\{/, '')
        .replace(/\};\s*$/, '').replace(/\}\s*$/, '');

    const applyActionSrc =
        'const applyAction = (state, msg) => {\n' +
        builtinBody + '\n' +
        applyActionBody + '\n' +
        '    return state;\n' +
        '};';

    // _src(fn): extract function body as a source string for inline Renkon node definitions.
    // Strips the outer `function() { ... }` wrapper — what remains is pasted verbatim.
    const _src = fn => fn.toString().replace(/^[^{]*\{/, '').replace(/\s*\}\s*$/, '');

    const worldStateSrc = _src(function() {
const incoming = _raw;
const worldState = Behaviors.collect(
    Object.assign({}, _initialState, {
      time:      app.initialTime || 0,
      queue:     _initialState.queue    || [],
      objects:   _initialObjects,
      spawned:   _initialState.spawned  || [],
      ticking:   _initialState.ticking  || false,
      windows:   _initialState.windows  || {},
      seed:      _initialState.seed     || 0,
      _rngState: _initialState._rngState || _xoroshiroSeed(_initialState.seed || 1) }),
    Events.or(incoming, Events.change($worldState)),
    (state, ev) => {
        if (!ev) return state;
        if (ev.time !== undefined && ev.queue !== undefined) {
            var drained = _drain(state);
            return drained === state ? state : drained;
        }
        var msgs = Array.isArray(ev) ? ev : [ev];
        return msgs.reduce(function(s, m) { return _enqueue(s, m); }, state);
    }
);
    });

    const vTimeSrc = _src(function() {
// Core projections — seeded from _initialState so snapshot restore reads correctly
const vTime   = Behaviors.collect((_initialState && _initialState.time)    || 0,  Events.change(worldState), (_, s) => s ? s.time    : 0);
const objects = Behaviors.collect((_initialState && _initialState.objects) || {}, Events.change(worldState), (_, s) => s ? s.objects : {});
// clients — sorted array of clientIds currently in the selo, derived from objects
const clients = Behaviors.collect([], Events.change(objects), (_, objs) => objs ? Object.keys(objs).sort() : []);
// clientJoined — array of clientIds that just joined (fires on each objects change)
// clientLeft   — array of clientIds that just left
const _clientDiff = Behaviors.collect(
    { prev: [], joined: [], left: [] },
    Events.change(clients),
    (state, curr) => {
        var joined = curr.filter(function(id) { return state.prev.indexOf(id) === -1; });
        var left   = state.prev.filter(function(id) { return curr.indexOf(id) === -1; });
        return { prev: curr, joined: joined, left: left };
    }
);
const clientJoined = Behaviors.collect([], Events.change(_clientDiff), (_, d) => d.joined);
const clientLeft   = Behaviors.collect([], Events.change(_clientDiff), (_, d) => d.left);
    });



    return [
        'const app             = Renkon.app;',
        'const _initialObjects = app.initialObjects || {};',
        'const _initialState   = app.initialState   || {};',
        'const _raw            = Events.receiver({ queued: true });',
        'const _pendingFutures = []; app._pendingFutures = _pendingFutures;',
        xoroshiroSeedSrc,
        xoroshiroNextSrc,
        'const _rngRef = _initialState._rngState ? [..._initialState._rngState] : _xoroshiroSeed(_initialState.seed || 1);',
        'app._rngRef = _rngRef;',
        'const random = () => _xoroshiroNext(_rngRef);',
        'const now    = () => app._vTime || 0;',
        // uid(prefix?) — deterministic short ID using random(), same on all peers.
        // Uses full 53-bit mantissa of each random() call encoded in base36.
        // 2 × 53 = 106 bits of entropy, 22 chars — close to UUID v4 (122 bits).
        // Deterministic: uses shared PRNG, identical result on all peers.
        // Optional prefix e.g. uid("ball") → "ball_4f7x2m9k1z3p8"
        'const uid = (prefix) => {' +
        '    var a = Math.floor(random() * 0x20000000000000).toString(36).padStart(11, "0");' +
        '    var b = Math.floor(random() * 0x20000000000000).toString(36).padStart(11, "0");' +
        '    return (prefix ? prefix + "_" : "") + a + b;' +
        '};',
        futureSrc,
        applyActionSrc,
        enqueueSrc,
        drainSrc,
        worldStateSrc,
        vTimeSrc,
        '',
    ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW PREAMBLE
// ═══════════════════════════════════════════════════════════════════════════
// Standard receptors that the view always gets for free.

// _src: extract the body of a wrapper function as a literal string for Renkon node definitions.
const _viewSrc = fn => fn.toString().replace(/^[^{]*\{/, '').replace(/\s*\}\s*$/, '');

const VIEW_PREAMBLE = _viewSrc(function() {
// rootEl — the VM's mount element, shorthand for Renkon.app.rootEl
const rootEl = Renkon.app.rootEl;
// UI — KrestianstvoUI helper, set via viewAppExtra.UI or window global
// Indirect lookup via window key avoids Renkon static-analysis false-positive
const UI = Renkon.app.UI || window['KrestianstvoUI'] || null;
// vm — the KrestianstvoVM instance, set by _boot on metaApp then copied to viewApp
const vm = Renkon.app.vm || null;
// Core receivers — always available, pushed by vm after every drain
const clientIdentity = Behaviors.collect({clientId:null,seloId:null}, Events.receiver(), function(_,id){return id;});
const objects        = Behaviors.collect({},   Events.receiver(), function(_,v){return v;});
const vTime          = Behaviors.collect(0,    Events.receiver(), function(_,v){return v;});
// clients — pushed from model alongside objects; sorted array of clientIds in the selo
const clients        = Behaviors.collect([], Events.receiver(), function(_,v){return v || [];});
// clientJoined / clientLeft — arrays of ids that joined/left since last objects change
const clientJoined   = Behaviors.collect([], Events.receiver(), function(_,v){return v || [];});
const clientLeft     = Behaviors.collect([], Events.receiver(), function(_,v){return v || [];});
const myObject = Behaviors.collect(null, Events.change(objects), function(_, objs) {
    const id = clientIdentity && clientIdentity.clientId;
    return id ? ((objs && objs[id]) || null) : null;
});

// _kfy_send(type, data) — send an action to the reflector from any view node.
// krestianify auto-generates calls to this for every viewToModel node.
// Queues messages until VM is fully joined, then flushes — no silent drops
// on slow connections where WS or selo handshake isn't complete yet.
const _kfy_send = function(type, data) {
    var ws = Renkon.app.ws;
    if (!ws) return;
    // Do not send during snapshot restore — VM not fully joined yet.
    // _joined is set to true in _onSeloJoined (first peer) and
    // _onSnapshotApply (joiner) only after full restore completes.
    if (!Renkon.app._joined) return;
    var msg = JSON.stringify({ type: type, data: data });
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
    } else {
        // WS not open yet — queue and flush once open
        if (!ws._kfy_queue) {
            ws._kfy_queue = [];
            var _origOnOpen = ws.onopen;
            ws.onopen = function(e) {
                if (_origOnOpen) _origOnOpen.call(ws, e);
                var q = ws._kfy_queue || [];
                ws._kfy_queue = [];
                q.forEach(function(m) {
                    if (ws.readyState === WebSocket.OPEN) ws.send(m);
                });
            };
        }
        ws._kfy_queue.push(msg);
    }
};
}) + '\n';

// ═══════════════════════════════════════════════════════════════════════════
// KrestianstvoVM
// ═══════════════════════════════════════════════════════════════════════════

class KrestianstvoVM {

    constructor({ wsUrl, seloId = 'default', depth = 0, maxDepth = 5 } = {}) {
        this.wsUrl        = wsUrl;
        this.seloId       = seloId;
        this.depth        = depth;
        this.maxDepth     = maxDepth;
        this.modelStateKeys = [];  // model PS node names: included in snapshot, pushed to viewPS after drain
        this.initialState   = {};  // app-supplied default world state for the first peer (joiners use snapshot)

        this.ws      = null;
        this.ps      = null;      // meta ProgramState — VM as Renkon program
        this.modelPS = null;      // model ProgramState — worldState lives here
        this.viewPS  = null;      // view ProgramState

        this._modelProgram   = '';
        this._viewProgram    = '';
        this._applyAction    = '';

        this.viewAppExtra    = {};       // merged into viewApp before viewPS is created
        this.viewEchoExclude = new Set(); // msg.type names NOT echoed back to viewPS (krestianify sets these)
        this.onSeloJoined  = null;
        this.onViewPSReady = null;
        this.onSpawn       = null;
        this.onClose       = null;
        this.onError       = null;
    }

    _getViewSource() { return VIEW_PREAMBLE + this._viewProgram; }

    // ── start ─────────────────────────────────────────────────────────────
    start({ modelProgram, viewProgram, applyAction } = {}) {
        this._modelProgram = modelProgram || '';
        this._viewProgram  = viewProgram  || '';
        this._applyAction  = applyAction  || '';
        // Track if this VM started blank — blank VMs reset programs on every re-join
        // so _onSnapshotApply can restore fresh programs from the new selo's snapshot.
        this._startsBlank  = !modelProgram && !viewProgram;
        this._boot();
    }

    // ── _boot ─────────────────────────────────────────────────────────────
    _boot() {
        const ws   = new WebSocket(this.wsUrl);
        this.ws    = ws;
        const self = this;

        ws.onerror = e  => console.error('[VM] WS error:', e);
        ws.onclose = () => console.log('[VM] WS closed');

        // Send goodbye synchronously — used by pagehide/visibilitychange
        // so reflector can clean up even if TCP close frame is never sent.
        this._sendGoodbye = () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'goodbye' }));
            }
        };

        // ── View PS ───────────────────────────────────────────────────────
        const viewApp = Object.assign({
            ws:      ws,
            depth:   this.depth,
            vm:      this,           // KrestianstvoVM — accessible as Renkon.app.vm / vm in VIEW
            seloId:  this.seloId,    // accessible as Renkon.app.seloId in VIEW
            onSpawnSelo: function(ev) {
                const name = (ev && typeof ev === 'object')
                    ? (ev.name || ev.value || '') : String(ev || '');
                self._emitSpawn(name);
            }
        }, self.viewAppExtra || {});
        this.viewPS = new (_getProgramState())(Date.now(), viewApp, true);
        this.viewPS.setupProgram([VIEW_PREAMBLE + this._viewProgram]);
        this.viewPS.evaluator(Date.now());
        if (this.onViewPSReady) this.onViewPSReady(this.viewPS);

        // ── Meta PS ───────────────────────────────────────────────────────
        const metaApp = { vm: this, wsStream: _makeWsStream(ws), VM: KrestianstvoVM };
        this.ps       = new (_getProgramState())(Date.now(), metaApp, true);
        this.ps.setupProgram([this._buildMetaProgram()]);

        ws.onopen = function() {
            const join = function() {
                if (ws.readyState === WebSocket.OPEN)
                    ws.send(JSON.stringify({ type: 'join_selo', seloId: self.seloId }));
                else setTimeout(join, 10);
            };
            setTimeout(join, 50);
        };

        this.ps.evaluator(Date.now());
    }

    // ── _buildMetaProgram ─────────────────────────────────────────────────
    // The Renkon source that IS the VM. All protocol logic lives here as FRP.
    _buildMetaProgram() {
        // _src: extract function body as a literal string for Renkon node definitions.
        const _src = fn => fn.toString().replace(/^[^{]*\{/, '').replace(/\s*\}\s*$/, '');

        return _src(function() {
// Raw WS stream — async generator fed by the WebSocket
const wsMessages = Events.next(Renkon.app.wsStream);
const wsMsg = Behaviors.collect(null, wsMessages, function(_, res) {
    return (res && !res.done) ? res.value : null;
});

// Protocol FSM — all imperative work delegated to vm methods;
// no sandbox globals (no Date, Math, queueMicrotask) inside this string.
const seloState = Behaviors.collect(
    { phase: null, clientId: null, buffer: [] },
    Events.change(wsMsg),
    function(state, msg) {
        if (!msg) return state;
        var vm = Renkon.app.vm;
        if (msg.type === "selo_joined")                               return vm._onSeloJoined(state, msg);
        if (msg.type === "snapshot_apply" && state.phase === "buffering") return vm._onSnapshotApply(state, msg);
        if (state.phase === "buffering") return { phase: "buffering", clientId: state.clientId, buffer: state.buffer.concat([msg]) };
        if (state.phase === "live")      return vm._onLiveMsg(state, msg);
        return state;
    }
);

// _spawned: event receiver pushed by _drain when worldState.spawned changes
const _spawned = Events.receiver({ queued: true });

// spawnedNames — latest spawned array, updated from _spawned events.
// _spawned uses queued:true so bursts arrive as arrays-of-arrays.
// We always want the last (most recent) complete spawned[] from worldState.
const spawnedNames = Behaviors.collect(
    [],
    _spawned,
    function(prev, namesOrArr) {
        if (!namesOrArr) return prev;
        // queued burst: array of arrays — take the last complete snapshot.
        // entries may be strings (legacy) or {windowName, seloId} objects.
        if (Array.isArray(namesOrArr) && Array.isArray(namesOrArr[0])) {
            var last = namesOrArr[namesOrArr.length - 1];
            return last || prev;
        }
        // single array push — may contain string or object entries
        return Array.isArray(namesOrArr) ? namesOrArr : prev;
    }
);

// children$ — reactive Map<name, KrestianstvoVM> managed by _diffChildren
const children$ = Behaviors.collect(
    new Map(),
    Events.change(spawnedNames),
    function(prev, names) { return Renkon.app.vm._diffChildren(prev, names); }
);
        }) + '\n';
    }

    // _onSeloJoined — called from seloState reducer
    _onSeloJoined(state, msg) {
        this._clientId = msg.clientId;  // store for blank-joiner viewPS rebuild
        this.viewPS.registerEvent('clientIdentity', { clientId: msg.clientId, seloId: msg.seloId });
        if (msg.clientsInSelo === 1) {
            // If blank VM becomes first peer of a new selo:
            // - use inherited programs from parent if available (portal spawning new child)
            // - otherwise clear programs (truly blank joiner with no parent context)
            if (this._startsBlank) {
                var _inh = this._inheritedPrograms;
                if (_inh && _inh.viewProgram) {
                    // Inherit from parent — this is a new child spawned by a portal
                    this._modelProgram   = _inh.modelProgram;
                    this._viewProgram    = _inh.viewProgram;
                    this._applyAction    = _inh.applyAction;
                    this.modelStateKeys  = _inh.modelStateKeys.slice();
                    this.viewEchoExclude = _inh.viewEchoExclude;
                    if (_inh.buildUI) this.viewAppExtra = Object.assign(
                        this.viewAppExtra || {}, { _buildUI: _inh.buildUI });
                    // Rebuild viewPS with inherited programs — same as blank-joiner
                    // snapshot path. Uses _rebuildViewPSWhenReady to defer until rootEl is set
                    // by makeSpawnHandler (which fires after _onJoinedCallback).
                    this._rebuildViewPSWhenReady({});
                } else {
                    this._viewProgram  = '';
                    this._modelProgram = '';
                    this._applyAction  = '';
                    this.modelStateKeys = [];
                    this.viewEchoExclude = new Set();
                }
            }
            const seed = (Date.now() ^ (Math.random() * 0x100000000)) | 0;
            const selo = this._createModelSelo(0, {}, Object.assign({}, this.initialState || {}, { seed }));
            this.modelPS = selo.ps;
            // Reset spawned children — new selo starts empty
            this.ps.registerEvent('_spawned', []);
            // Reset viewPS time-sensitive receivers so stale values from previous
            // session don't show (e.g. T still showing old vTime after page reload)
            this.viewPS.registerEvent('vTime', 0);
            this.viewPS.registerEvent('objects', {});
            this.viewPS.registerEvent('clients', []);
            this.viewPS.registerEvent('clientJoined', []);
            this.viewPS.registerEvent('clientLeft', []);
            this._sendJoin();
            if (this.onSeloJoined) this.onSeloJoined({ clientId: msg.clientId, seloId: msg.seloId });
            // First peer: goes live immediately without snapshot_apply — fire joined callbacks here
            this._joined = true;
            if (this.viewPS) this.viewPS.app._joined = true;
            console.log('[_onSeloJoined first peer] _onJoinedCallback=', !!this._onJoinedCallback);
            if (this._onJoinedCallback) {
                const cb = this._onJoinedCallback;
                this._onJoinedCallback = null;
                Promise.resolve().then(cb);
            }
            return { phase: 'live', clientId: msg.clientId, buffer: [], selo };
        } else {
            // Joiner: reset stale viewPS state immediately — snapshot will repopulate correctly
            this.viewPS.registerEvent('vTime', 0);
            this.viewPS.registerEvent('objects', {});
            this.viewPS.registerEvent('clients', []);
            this.viewPS.registerEvent('clientJoined', []);
            this.viewPS.registerEvent('clientLeft', []);
            // If this VM started blank, clear programs so _onSnapshotApply restores
            // fresh programs from the new selo's snapshot on every re-join.
            if (this._startsBlank) {
                this._viewProgram  = '';
                this._modelProgram = '';
                this._applyAction  = '';
                this.modelStateKeys = [];
                this.viewEchoExclude = new Set();
                // Mark viewPS as not joined — suppress _kfy_send until restore completes
                if (this.viewPS && this.viewPS.app) this.viewPS.app._joined = false;
            }
            if (this.onSeloJoined) this.onSeloJoined({ clientId: msg.clientId, seloId: msg.seloId });
            return { phase: 'buffering', clientId: msg.clientId, buffer: [] };
        }
    }

    // _onSnapshotApply — called from seloState reducer
    _onSnapshotApply(state, msg) {
        this._joined = true;  // signal: fully joined, safe for tests to proceed
        console.log('[_onSnapshotApply] _onJoinedCallback=', !!this._onJoinedCallback);
        // Fire deferred onSpawn if set — child VM is now ready with snapshot applied
        if (this._onJoinedCallback) {
            const cb = this._onJoinedCallback;
            this._onJoinedCallback = null;
            Promise.resolve().then(cb);  // after current stack so snapshot restore completes first
        }
        const snap = msg.snapshot;
        console.log('[SNAP_APPLY] counter=', snap.counter, 'time=', snap.time, 'keys=', Object.keys(snap));

        // ── Snapshot-driven boot ───────────────────────────────────────────
        // If this VM has no programs of its own (blank joiner), take them from
        // the snapshot and rebuild viewPS with the received view program.
        // This allows a joiner with a bare HTML shell to receive the full app
        // (model + view source) from the leader peer's snapshot.
        if (!this._viewProgram && snap._viewProgram) {
            console.log('[SNAP_APPLY] blank joiner — restoring programs from snapshot');
            this._modelProgram = snap._modelProgram || '';
            this._viewProgram  = snap._viewProgram  || '';
            this._applyAction  = snap._applyAction  || '';
            if (snap._modelStateKeys && snap._modelStateKeys.length) {
                this.modelStateKeys = snap._modelStateKeys.slice();
            }
            if (snap._viewEchoExclude) {
                this.viewEchoExclude = new Set(snap._viewEchoExclude);
            }
            // rootEl may not be set yet — makeSpawnHandler fires after _onJoinedCallback
            // rootEl may not be set yet — _rebuildViewPSWhenReady polls until ready.
            this._rebuildViewPSWhenReady(snap);
        }

        const selo = this._restoreModelSelo(snap);
        this.modelPS = selo.ps;
        selo.ps.evaluate(snap.time || 0);
        // Push objects + vTime directly from snapshot — fundamental, always present
        this.viewPS.registerEvent('objects', snap.objects || {});
        this.viewPS.registerEvent('clients', Object.keys(snap.objects || {}).sort());
        this.viewPS.registerEvent('clientJoined', []);
        this.viewPS.registerEvent('clientLeft', []);
        this.viewPS.registerEvent('vTime',   snap.time   || 0);
        // Push modelStateKeys AFTER restoreModelSelo+evaluate so drain cannot overwrite them
        (this.modelStateKeys || []).forEach(k => {
            console.log('[SNAP_APPLY push]', k, '=', snap[k]);
            if (snap[k] !== undefined) this.viewPS.registerEvent(k, snap[k]);
        });
        // Push again via Promise so any drain triggered by restore cannot overwrite
        var _self2 = this;
        var _snap2 = snap;
        Promise.resolve().then(function() {
            (_self2.modelStateKeys || []).forEach(function(k) {
                if (_snap2[k] !== undefined) {
                    console.log('[SNAP_APPLY re-push]', k, '=', _snap2[k]);
                    _self2.viewPS.registerEvent(k, _snap2[k]);
                }
            });
        });
        const buffered = state.buffer;
        // Replay buffered msgs after current call stack — Promise.resolve() is safe here
        // because it is called from real JS (this method), not from inside Renkon's eval.
        Promise.resolve().then(() => {
            for (const bMsg of buffered) {
                selo.send(bMsg);
                const t = bMsg.type === 'heartbeat'  ? bMsg.vTime
                        : bMsg.type === 'client_msg' ? ((bMsg.data && bMsg.data.serverTime) || 0) : 0;
                if (t) { selo.ps.evaluate(t); selo.ps.evaluate(t); }
            }
            // Re-push modelStateKeys after replay.
            // Use _modelStatePrev (updated by _makeSend FRP step during replay) if available,
            // otherwise fall back to snapshot value — never re-read raw PS node (always 0 for FRP nodes).
            var _self = this;
            var _wss = _self._getModelNode(selo.ps, 'worldState');
            if (_wss) {
                _self.viewPS.registerEvent('objects', _wss.objects || {});
                _self.viewPS.registerEvent('clients', Object.keys(_wss.objects || {}).sort());
                _self.viewPS.registerEvent('clientJoined', []);
                _self.viewPS.registerEvent('clientLeft', []);
                _self.viewPS.registerEvent('vTime',   _wss.time   || 0);
            }
            var _msp = (selo.appRef && selo.appRef._modelStatePrev) || {};
            (_self.modelStateKeys || []).forEach(function(k) {
                var v = (_msp[k] !== undefined) ? _msp[k] : snap[k];
                if (v !== undefined) _self.viewPS.registerEvent(k, v);
            });
            // Reset children$ to snapshot's spawned list — clears stale children from previous selo
            this.ps.registerEvent('_spawned', snap.spawned || []);
            this._sendJoin();
            // Mark viewPS as joined AFTER buffer replay — _kfy_send now allowed to fire
            if (_self.viewPS) _self.viewPS.app._joined = true;
        });
        return { phase: 'live', clientId: state.clientId, buffer: [], selo };
    }

    // _onLiveMsg — called from seloState reducer
    _onLiveMsg(state, msg) {
        const selo = state.selo;
        if (msg.type === 'request_snapshot') { this._sendSnapshot(msg.targetUser, selo); return state; }
        if (msg.type === 'connect')          { this._sendJoin(); return state; }
        if (msg.type === 'error')            { console.warn('[VM] server error:', msg.message); return state; }
        selo.send(msg);
        return state;
    }

    // ── _rebuildViewPSWhenReady ───────────────────────────────────────────
    // Polls until viewAppExtra.rootEl is set (up to 500ms), then:
    //   1. Calls snap._buildUI if present (creates DOM into a content wrapper
    //      if the container already has a titleBar, preserving drag/portal bars)
    //   2. Stops old blank viewPS
    //   3. Creates new viewPS with VIEW_PREAMBLE + this._viewProgram
    //   4. Re-pushes all model state so the new viewPS shows current values
    // snap may be a real snapshot payload (from _onSnapshotApply) or {} (from
    // first-peer inherit path — no state to push yet).
    _rebuildViewPSWhenReady(snap) {
        snap = snap || {};
        const _self = this;
        const _rootEl0 = _self.viewAppExtra && _self.viewAppExtra.rootEl;
        if (_rootEl0) {_self._buildDomFromSnap(_rootEl0, snap)};
        
        const observer = new window.MutationObserver((mutations, obs) => {
            const _rootEl0 = _self.viewAppExtra && _self.viewAppExtra.rootEl;
            if (_rootEl0) {
                console.log("Element is now in the DOM!");
                obs.disconnect(); // Stop looking once found
                 _self._buildDomFromSnap(_rootEl0, snap)
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    _buildDomFromSnap(_rootEl0, snap) {
         const _self = this;

                // ── Build DOM ───────────────────────────────────────────────────────
        // VM is DOM-agnostic: it calls buildUI(rootEl, label) as an opaque callback.
        // buildUI may return a new mount element (e.g. a .vm-content wrapper for
        // portal containers) — if so, viewAppExtra.rootEl is updated to that element.
        // All DOM knowledge (portal detection, wrapper creation) lives in buildUI.
        var _buildUIFn = null;
        var _buildUIStr = snap._buildUI ||
            (_self.viewAppExtra && _self.viewAppExtra._buildUI &&
             typeof _self.viewAppExtra._buildUI === 'function'
                ? _self.viewAppExtra._buildUI.toString() : null);
        if (_buildUIStr) {
            try {
                _buildUIFn = new Function('return (' + _buildUIStr + ')')();
            } catch(e) { console.warn('[VM] buildUI parse failed:', e); }
        } else if (_self.viewAppExtra && typeof _self.viewAppExtra._buildUI === 'function') {
            _buildUIFn = _self.viewAppExtra._buildUI;
        }
        if (typeof _buildUIFn === 'function') {
            try {
                var _label  = (_self.viewAppExtra && _self.viewAppExtra.label) || '';
                // Pass portalMount helper so buildUI doesn't need it in scope
                var _helpers = {};
                var _result = _buildUIFn(_rootEl0, _label, _helpers);
                // buildUI may return a child mount element — update rootEl if so
                if (_result && _result !== _rootEl0 && typeof _result === 'object') {
                    _self.viewAppExtra.rootEl = _result;
                }
            } catch(e) { console.warn('[VM] buildUI failed:', e); }
        }
        // ── Rebuild viewPS ──────────────────────────────────────────────────
        try { if (_self.viewPS && _self.viewPS.stop) _self.viewPS.stop(); } catch(e) {}
        const viewApp = Object.assign({
            ws:     _self.ws,
            depth:  _self.depth,
            vm:     _self,
            seloId: _self.seloId,
            onSpawnSelo: (ev) => {
                const name = (ev && typeof ev === 'object')
                    ? (ev.name || ev.value || '') : String(ev || '');
                _self._emitSpawn(name);
            }
        }, _self.viewAppExtra || {});
        _self.viewPS = new (_getProgramState())(Date.now(), viewApp, true);
        _self.viewPS.setupProgram([VIEW_PREAMBLE + _self._viewProgram]);
        _self.viewPS.evaluator(Date.now());
        if (_self._joined) _self.viewPS.app._joined = true;
        if (_self.modelPS && _self.modelPS.app) _self.modelPS.app.viewPS = _self.viewPS;
        if (_self.onViewPSReady) _self.onViewPSReady(_self.viewPS);
        // ── Re-push model state ─────────────────────────────────────────────
        var _seloState = _self._getModelNode(_self.ps, 'seloState');
        var _clientId  = (_seloState && _seloState.clientId) || null;
        _self.viewPS.registerEvent('clientIdentity', { clientId: _clientId, seloId: _self.seloId });
        _self.viewPS.registerEvent('objects',      snap.objects || {});
        _self.viewPS.registerEvent('clients',      Object.keys(snap.objects || {}).sort());
        _self.viewPS.registerEvent('clientJoined', []);
        _self.viewPS.registerEvent('clientLeft',   []);
        _self.viewPS.registerEvent('vTime',        snap.time || 0);
        (_self.modelStateKeys || []).forEach(function(k) {
            if (snap[k] !== undefined) _self.viewPS.registerEvent(k, snap[k]);
        });
    }

    // _diffChildren — called from children$ reducer
    _diffChildren(prev, names) {
        const next = new Map(prev);
        names.forEach(entry => {
            // entry is either a plain string (legacy) or { windowName, seloId }
            const windowName   = (entry && typeof entry === 'object') ? entry.windowName : entry;
            const targetSeloId = (entry && typeof entry === 'object') ? entry.seloId    : entry;
            const _appName     = (entry && typeof entry === 'object') ? entry.appName   : null;
            const _entryDepth  = (entry && typeof entry === 'object' && entry.maxDepth != null)
                                 ? entry.maxDepth : null;
            // Resolve appDef locally by appName — pass "appName:" so resolveApp finds the colon
            const appDef = _appName && _appResolver
                ? (_appResolver(_appName + ':') || {}).appDef || null : null;
            const name = windowName; // key in the Map
            if (next.has(name)) return;
            console.log('[children$] spawning:', name, '→ seloId:', targetSeloId, 'depth:', this.depth + 1);
            if (this.depth + 1 > this.maxDepth) {
                console.warn('[VM] max depth reached (' + this.maxDepth + '), not spawning:', name);
                return;
            }
            const _childMaxDepth = _entryDepth != null ? _entryDepth : this.maxDepth;
            const child = new KrestianstvoVM({ wsUrl: this.wsUrl, seloId: targetSeloId, depth: this.depth + 1, maxDepth: _childMaxDepth });
            child.modelStateKeys = this.modelStateKeys || [];
            child.onClose = this.onClose;
            const _parent = this;
            const _spawnName = name;
            const _spawnDepth = this.depth + 1;
            // _onJoinedCallback: fires when child is fully joined.
            // Walks up _parent chain to find the root onSpawn handler — set once on root VM.
            child._onJoinedCallback = function() {
                // Auto-register child with vm-lifecycle so goodbye is sent on navigation.
                // Must happen before onSpawn so the wrapper is in place before app code runs.
                if (typeof _parent._registerChildVM === 'function') {
                    _parent._registerChildVM(child);
                }
                // Call parent's onSpawn — parent handler is responsible for
                // setting child.onSpawn for grandchildren (e.g. dom-demo makeSpawnHandler)
                if (typeof _parent.onSpawn === 'function') {
                    _parent.onSpawn({ name: _spawnName, vm: child, depth: _spawnDepth });
                }
            };
            // Child VMs start blank — they receive model+view programs from the
            // snapshot of the target selo (joiner path). If the child becomes the
            // first peer of a new selo (no snapshot), it inherits parent programs.
            var _compiled = null;
            var _useApp   = !!(appDef && appDef.app && _krestianify);
            if (_useApp) {
                try { _compiled = _krestianify(appDef.app, appDef.modelNodes || []); }
                catch(e) { console.error('[_diffChildren] appDef compile failed:', e); _useApp = false; }
            }
            if (_useApp && _compiled) {
                child.modelStateKeys  = _compiled.modelStateKeys;
                child.viewEchoExclude = _compiled.viewToModel;
            } else {
                child.modelStateKeys  = (_parent.modelStateKeys || []).slice();
                child.viewEchoExclude = _parent.viewEchoExclude || new Set();
            }
            // Propagate resolveApp so child portal input can resolve named apps
            if (_parent.viewAppExtra && _parent.viewAppExtra.resolveApp) {
                child.viewAppExtra = Object.assign(child.viewAppExtra || {}, {
                    resolveApp: _parent.viewAppExtra.resolveApp,
                });
            }
            child._inheritedPrograms = {
                modelProgram:    _useApp ? _compiled.modelProgram : (_parent._modelProgram || ''),
                viewProgram:     _useApp ? (appDef.viewProgram || _compiled.viewProgram) : (_parent._viewProgram  || ''),
                applyAction:     _useApp ? (appDef.applyAction || _compiled.applyAction || '') : (_parent._applyAction || ''),
                modelStateKeys:  child.modelStateKeys.slice(),
                viewEchoExclude: child.viewEchoExclude,
                buildUI:         (_useApp && appDef.buildUI) ? appDef.buildUI
                                 : (_parent.viewAppExtra && _parent.viewAppExtra._buildUI || null),
            };
            child.start({});
            next.set(name, child);
        });
        // Build a set of current windowNames for O(1) lookup
        const activeNames = new Set(names.map(e =>
            (e && typeof e === 'object') ? e.windowName : e
        ));
        prev.forEach((child, name) => {
            if (!activeNames.has(name)) {
                console.log('[children$] closing:', name, 'ws?', !!child.ws, 'readyState?', child.ws && child.ws.readyState);
                if (child.ws) { child.ws.close(); child.ws = null; }
                next.delete(name);
                if (this.onClose) this.onClose({ name });
            }
        });
        return next;
    }


    // Convenience: read children$ map from meta PS and return child by name.
    _getChildVM(name) {
        const map = this._getModelNode(this.ps, 'children$');
        return map && map.get(name);
    }

    // ── _sendJoin ──────────────────────────────────────────────────────────
    _sendJoin() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN)
            this.ws.send(JSON.stringify({ type: '_join', data: {} }));
    }

    // ── _emitSpawn ─────────────────────────────────────────────────────────
    // Sends spawnSelo to the reflector. Every peer's model processes it,
    // worldState.spawned updates, spawnedNames changes, children$ diffs → new VM.
    // entry is either a plain string (legacy) or { windowName, seloId }.
    _emitSpawn(entry) {
        if (!entry) return;
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            var data = (entry && typeof entry === 'object')
                ? { seloId: entry.seloId, windowName: entry.windowName }
                : { seloId: entry, windowName: entry };
            this.ws.send(JSON.stringify({ type: 'spawnSelo', data: data }));
        }
    }

    // ── waitJoined ────────────────────────────────────────────────────────
    // Resolves when this VM has fully joined its selo (snapshot applied + replayed).
    // Works for both the first peer (no snapshot) and joiners (snapshot received).
    // Safe to await on any connection speed — polls every 100ms up to `timeout` ms.
    //
    //   await vm.waitJoined();
    //   await vm.waitJoined(30000);  // custom timeout
    //
    waitJoined(timeout) {
        timeout = timeout || 20000;
        const self = this;
        return new Promise(function(resolve, reject) {
            if (self._joined) return resolve(self);
            const start = Date.now();
            const t = setInterval(function() {
                if (self._joined) { clearInterval(t); return resolve(self); }
                if (Date.now() - start > timeout) {
                    clearInterval(t);
                    reject(new Error('waitJoined timeout after ' + timeout + 'ms for selo: ' + self.seloId));
                }
            }, 100);
        });
    }

    // ── _getModelNode ──────────────────────────────────────────────────────
    // Read a node value from a model ProgramState.
    _getModelNode(ps, key) {
        if (!ps) return undefined;
        const n = (ps.resolved && ps.resolved.get(key))
               || (ps.scratch  && ps.scratch.get(key));
        return n && n.value;
    }

    // ── _sendSnapshot ──────────────────────────────────────────────────────
    _sendSnapshot(targetUser, selo) {
        var wss = this._getModelNode(selo.ps, 'worldState') || { time: 0, objects: {}, queue: [] };
        var maxT = (wss.queue || []).reduce(function(mx, m) {
            return Math.max(mx, m.serverTime || 0); }, wss.time);
        selo.ps.evaluate(maxT);
        selo.ps.evaluate(maxT);
        wss = this._getModelNode(selo.ps, 'worldState') || wss;
        // Snapshot the full worldState — all fields preserved for joiner's _restoreModelSelo.
        // modelStateKeys Renkon node values are added below (they may differ from worldState fields).
        // Prefer _postFRPRngState — captured after Renkon FRP propagation where
        // random() may have been called in model Behaviors.collect accumulators.
        // Falls back to wss._rngState (captured in drain after applyAction, pre-FRP).
        var _postFRP = selo.appRef && selo.appRef._postFRPRngState;
        var payload = Object.assign({}, wss, {
            _rngState: _postFRP ? _postFRP.slice()
                     : wss._rngState ? wss._rngState.slice()
                     : _vm_xoroshiroSeed(wss.seed || 1),
        });
        // Include modelStateKeys — prefer _modelStatePrev (updated after FRP propagation
        // in _makeSend) over PS node read (which may be stale if last msg was FRP-driven).
        var _msp = (selo.appRef && selo.appRef._modelStatePrev) || {};
        console.log('[SNAP SEND] _modelStatePrev:', JSON.stringify(_msp));
        (this.modelStateKeys || []).forEach(k => {
            var v = (_msp[k] !== undefined) ? _msp[k] : this._getModelNode(selo.ps, k);
            console.log('[SNAP SEND] key:', k, 'from _msp:', _msp[k], 'from ps:', this._getModelNode(selo.ps, k), '→', v);
            if (v !== undefined) payload[k] = v;
        });
        // Include program source so joiners can reconstruct the full app from snapshot alone.
        // A joiner with no programs (blank HTML) uses these to boot model + view.
        payload._modelProgram   = this._modelProgram  || '';
        payload._viewProgram    = this._viewProgram   || '';
        payload._applyAction    = this._applyAction   || '';
        payload._modelStateKeys = (this.modelStateKeys || []).slice();
        payload._viewEchoExclude = this.viewEchoExclude
            ? Array.from(this.viewEchoExclude)
            : [];
        // Serialize buildUI if available — blank joiners call it to set up DOM
        // before the view program runs, preventing null querySelector errors.
        var _buildUI = this.viewAppExtra && this.viewAppExtra._buildUI;
        if (typeof _buildUI === 'function') {
            try { payload._buildUI = _buildUI.toString(); } catch(e) {}
        }
        console.log('[SNAP SEND] t=' + wss.time + ' counter=' + payload.counter);
        this.ws.send(JSON.stringify({ type: 'snapshot_response', targetUser: targetUser, payload: payload }));
    }

    // ── _makeSend ──────────────────────────────────────────────────────────
    _makeSend(psRef) {
        return function(ev) {
            var t = ev.type === 'heartbeat'  ? (ev.vTime || 0)
                  : ev.type === 'client_msg' ? ((ev.data && ev.data.serverTime) || 0) : 0;
            if (!psRef._ps) return;
            // Snapshot modelStateKey PS values BEFORE any evaluation — baseline for change detection
            var _vps    = psRef.viewPS;
            var _keys   = psRef.modelStateKeys || [];
            var _prev   = psRef._modelStatePrev || {};
            var _before = {};
            for (var _bi = 0; _bi < _keys.length; _bi++) {
                var _bk = _keys[_bi];
                var _bn = (psRef._ps.resolved && psRef._ps.resolved.get(_bk))
                        || (psRef._ps.scratch  && psRef._ps.scratch.get(_bk));
                _before[_bk] = _bn && _bn.value;
            }
            // Keep app._vTime current so now() works in model accumulator bodies
            psRef._vTime = t;
            //console.log('[_makeSend] ev.type=' + ev.type + ' envelope t=' + t);
            psRef._ps.registerEvent('_raw', ev);
            // evaluate x2: (1) enqueue into worldState, (2) drain worldState
            // drain also registerEvent(msg.type) for non-viewToModel types (tick, subTick etc.)
            psRef._ps.evaluate(t);
            psRef._ps.evaluate(t);
            // evaluate x1: propagate any events registered by drain (tick, subTick, etc.)
            // or register viewToModel events (incr/decr) that drain skipped, then propagate
            if (ev.type === 'client_msg' && ev.data && ev.data.type) {
                var _innerType = ev.data.type;
                var _innerData = ev.data.data;
                if (psRef.viewEchoExclude && psRef.viewEchoExclude.has(_innerType)) {
                    psRef._ps.registerEvent(_innerType, _innerData);
                }
            }
            psRef._ps.evaluate(t);
            // Push any modelStateKeys that changed vs baseline
            for (var _j = 0; _j < _keys.length; _j++) {
                var _k2 = _keys[_j];
                var _na = (psRef._ps.resolved && psRef._ps.resolved.get(_k2))
                        || (psRef._ps.scratch  && psRef._ps.scratch.get(_k2));
                var _va = _na && _na.value;
                if (_vps && _va !== undefined && _va !== _before[_k2]) {
                    _vps.registerEvent(_k2, _va);
                    _prev[_k2] = _va;
                }
            }
            psRef._modelStatePrev = _prev;

            // Flush any futures scheduled during FRP (e.g. from Behaviors.collect
            // accumulators calling future()). drain already ran so _pendingFutures were
            // not spliced in — do it now by injecting them into the worldState queue.
            if (psRef._pendingFutures && psRef._pendingFutures.length) {
                var _frpFutures = psRef._pendingFutures.splice(0);  // appRef._pendingFutures
                // Read current worldState node and append futures to its queue
                var _wsNode = (psRef._ps.resolved && psRef._ps.resolved.get('worldState'))
                           || (psRef._ps.scratch  && psRef._ps.scratch.get('worldState'));
                if (_wsNode && _wsNode.value) {
                    _wsNode.value.queue = (_wsNode.value.queue || []).concat(_frpFutures);
                }
            }
            // Capture _rngRef AFTER full FRP — random() may be called in model
            // Behaviors.collect accumulators (e.g. color). The model preamble sets
            // app._rngRef = _rngRef, and app IS appRef (= psRef here). So psRef._rngRef
            // is the live mutated array. Snapshot it now for accurate joiner restore.
            if (psRef._rngRef && Array.isArray(psRef._rngRef)) {
                psRef._postFRPRngState = psRef._rngRef.slice();
            }

        };
    }

    // ── _createModelSelo ──────────────────────────────────────────────────
    _createModelSelo(initialTime, initialObjects, initialState) {
        initialTime    = initialTime    || 0;
        initialObjects = initialObjects || {};
        initialState   = initialState   || {};
        var self = this;
        var appRef = {
            viewPS:           this.viewPS,
            metaPS:           this.ps,
            _ps:              null,
            ws:               this.ws,
            initialObjects:   initialObjects,
            initialState:     initialState,
            initialTime:      initialTime,
            modelStateKeys:   this.modelStateKeys || [],
            viewEchoExclude:  this.viewEchoExclude || new Set(),
            _modelStatePrev: (function(keys, init) {
                var p = {};
                keys.forEach(function(k) { if (init[k] !== undefined) p[k] = init[k]; });
                return p;
            })(this.modelStateKeys || [], initialState),
        };
        var modelSrc = buildModelPreamble(this._applyAction) + '\n' + this._modelProgram;
        var ps = new (_getProgramState())(initialTime, appRef, true);
        appRef._ps = ps;
        ps.setLog((msg, ...args) => { if (msg && (msg.includes('cycle') || msg.includes('undefined') || msg.includes("won't"))) console.warn('[modelPS]', msg, ...args); });
        try {
            ps.setupProgram([modelSrc]);
        } catch(e) {
            console.error('model setupProgram failed:', e);
            if (this.onError) this.onError(e);
            throw e;
        }
        ps.options = { once: true };
        return { ps: ps, send: this._makeSend(appRef), appRef: appRef };
    }

    // ── _restoreModelSelo ─────────────────────────────────────────────────
    _restoreModelSelo(snap) {
        console.log('📸 restoreModelSelo t=', snap.time, 'peers:', Object.keys(snap.objects || {}));
        var objects = snap.objects;
        var rest    = Object.assign({}, snap);
        delete rest.time; delete rest.objects;
        return this._createModelSelo(snap.time, objects, rest);
    }
}

export { KrestianstvoVM };

// ── URL params ─────────────────────────────────────────────────────────────

// parseUrlParams(seloId, reflector) — optionally overrides with ?k= and ?r= from URL.
// seloId and reflector are required — no fallback defaults.
export function parseUrlParams(seloId, reflector) {
    const p = new URLSearchParams(window.location.search);
    const k = p.get('k');
    const r = p.get('r');
    // Support appName:seloId convention — e.g. ?k=balls:1
    // The FULL rawKey is used as the seloId — 'balls:1' is a distinct session from '1'.
    // appName is extracted for app registry lookup only (e.g. blank-joiner booting).
    // e.g. 'balls:1' → seloId='balls:1', appName='balls'
    //      '1'       → seloId='1',        appName=null
    let rawK = k || seloId;
    const colonIdx = rawK.indexOf(':');
    // Parse ?d=N for max portal recursion depth
    const d = p.get('d');
    const maxDepth = d ? Math.max(0, parseInt(d, 10) || 5) : 5;
    return {
        seloId:    rawK,
        appName:   colonIdx >= 0 ? rawK.slice(0, colonIdx) : null,
        rawKey:    rawK,
        maxDepth:  maxDepth,
        reflector: r ? r.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') : reflector,
    };
}
