// krestianstvo-vm.js
// Krestianstvo - Renkon | SDK 4 — Pure Renkon FRP VM

import { ProgramState } from 'https://cdn.jsdelivr.net/npm/renkon-core/dist/renkon-core.js';
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
    if (ev.type === 'heartbeat')
        return { ...state, time: Math.max(state.time, ev.vTime) };
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
        app._ps.registerEvent(msg.type, val);
        // Notify meta PS if spawned list changed
        if (app.metaPS && next.spawned !== s.spawned)
            app.metaPS.registerEvent('_spawned', next.spawned.slice());
        if (app.viewPS && msg.type !== 'spawnSelo') {
            app.viewPS.registerEvent(msg.type, val);
            if (next.randomResult !== undefined && next.randomResult !== s.randomResult)
                app.viewPS.registerEvent('randomResult', next.randomResult);
            // Push ticking state change — viewPS 60hz evaluator picks it up
            if (next.ticking !== s.ticking)
                app.viewPS.registerEvent('_modelTicking', next.ticking);
            // Push modelStateKeys — read from model PS nodes after drain
            var _mkeys = app.modelStateKeys || [];
            var _mprev = app._modelStatePrev || {};
            for (var _mi = 0; _mi < _mkeys.length; _mi++) {
                var _mk = _mkeys[_mi];
                var _mv = (app._ps.resolved && app._ps.resolved.get(_mk))
                       || (app._ps.scratch  && app._ps.scratch.get(_mk));
                var _mval = _mv && _mv.value;
                if (_mval !== undefined && _mval !== _mprev[_mk]) {
                    app.viewPS.registerEvent(_mk, _mval);
                    _mprev[_mk] = _mval;
                }
            }
            app._modelStatePrev = _mprev;
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
    { time:      app.initialTime || 0,
      queue:     _initialState.queue    || [],
      objects:   _initialObjects,
      spawned:   _initialState.spawned  || [],
      ticking:   _initialState.ticking  || false,
      windows:   _initialState.windows  || {},
      seed:      _initialState.seed     || 0,
      _rngState: _initialState._rngState || _xoroshiroSeed(_initialState.seed || 1) },
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
const vTime = Behaviors.collect(0, Events.change($worldState), (_, s) => s ? s.time : 0);
    });

    const viewPusherSrc = _src(function() {
Behaviors.collect(null, Events.change($worldState), function(prev, s) {
    const _vps = app.viewPS;
    if (_vps && s) {
        console.log("[wsChange] t=" + s.time + " ticking=" + s.ticking + " qlen=" + s.queue.length);
        _vps.registerEvent("objects", s.objects);
        _vps.registerEvent("vTime",   s.time);
        const prevWins = prev && prev.windows;
        if (s.windows && s.windows !== prevWins) {
            Object.entries(s.windows).forEach(function(e) {
                _vps.registerEvent("_moveWindow", { name: e[0], x: (e[1].x||0), y: (e[1].y||0) });
            });
        }
        var _keys = app.viewStateKeys || [];
        for (var _ki = 0; _ki < _keys.length; _ki++) {
            var _k = _keys[_ki];
            if (s[_k] !== (prev && prev[_k]))
                _vps.registerEvent(_k, s[_k]);
        }
    }
    return s;
});
    });

    return [
        'const app             = Renkon.app;',
        'const _initialObjects = app.initialObjects || {};',
        'const _initialState   = app.initialState   || {};',
        'const _raw            = Events.receiver({ queued: true });',
        'const _pendingFutures = [];',
        xoroshiroSeedSrc,
        xoroshiroNextSrc,
        'const _rngRef = _initialState._rngState ? [..._initialState._rngState] : _xoroshiroSeed(_initialState.seed || 1);',
        'const random = () => _xoroshiroNext(_rngRef);',
        futureSrc,
        applyActionSrc,
        enqueueSrc,
        drainSrc,
        worldStateSrc,
        vTimeSrc,
        viewPusherSrc,
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
const clientIdentity = Behaviors.collect({clientId:null,seloId:null}, Events.receiver(), function(_,id){return id;});
const objects        = Behaviors.collect({},   Events.receiver(), function(_,v){return v;});
const vTime          = Behaviors.collect(0,    Events.receiver(), function(_,v){return v;});
const randomResult   = Behaviors.collect(null, Events.receiver(), function(_,v){return v;});
const _modelTicking  = Behaviors.collect(null, Events.receiver(), function(_,v){return v;});
const myObject = Behaviors.collect(null, Events.change($objects), function(_, objs) {
    const id = clientIdentity && clientIdentity.clientId;
    return id ? ((objs && objs[id]) || null) : null;
});
}) + '\n';

// ═══════════════════════════════════════════════════════════════════════════
// KrestianstvoVM
// ═══════════════════════════════════════════════════════════════════════════

class KrestianstvoVM {

    constructor({ wsUrl = 'ws://localhost:3000', seloId = 'default', depth = 0, maxDepth = 5 } = {}) {
        this.wsUrl        = wsUrl;
        this.seloId       = seloId;
        this.depth        = depth;
        this.maxDepth     = maxDepth;
        this.viewStateKeys  = [];  // worldState fields to forward to viewPS on change
        this.modelStateKeys = [];  // model PS node names to include in snapshot + push to viewPS

        this.ws      = null;
        this.ps      = null;      // meta ProgramState — VM as Renkon program
        this.modelPS = null;      // model ProgramState — worldState lives here
        this.viewPS  = null;      // view ProgramState

        this._modelProgram   = '';
        this._viewProgram    = '';
        this._applyAction    = '';

        this.onSeloJoined  = null;
        this.onViewPSReady = null;
        this.onSpawn       = null;
        this.onClose       = null;
        this.onError       = null;
    }

    // ── start ─────────────────────────────────────────────────────────────
    start({ modelProgram, viewProgram, applyAction } = {}) {
        this._modelProgram = modelProgram || '';
        this._viewProgram  = viewProgram  || '';
        this._applyAction  = applyAction  || '';
        this._boot();
    }

    // ── _boot ─────────────────────────────────────────────────────────────
    _boot() {
        const ws   = new WebSocket(this.wsUrl);
        this.ws    = ws;
        const self = this;

        ws.onerror = e  => console.error('[VM] WS error:', e);
        ws.onclose = () => console.log('[VM] WS closed');

        // ── View PS ───────────────────────────────────────────────────────
        const viewApp = {
            ws:    ws,
            depth: this.depth,
            onSpawnSelo: function(ev) {
                const name = (ev && typeof ev === 'object')
                    ? (ev.name || ev.value || '') : String(ev || '');
                self._emitSpawn(name);
            }
        };
        this.viewPS = new ProgramState(Date.now(), viewApp, true);
        this.viewPS.setupProgram([VIEW_PREAMBLE + this._viewProgram]);
        this.viewPS.evaluator(Date.now());
        if (this.onViewPSReady) this.onViewPSReady(this.viewPS);

        // ── Meta PS ───────────────────────────────────────────────────────
        const metaApp = { vm: this, wsStream: _makeWsStream(ws), VM: KrestianstvoVM };
        this.ps       = new ProgramState(Date.now(), metaApp, true);
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
    Events.change($wsMsg),
    function(state, msg) {
        if (!msg) return state;
        var vm = Renkon.app.vm;
        if (msg.type === "selo_joined")                                   return vm._onSeloJoined(state, msg);
        if (msg.type === "snapshot_apply" && state.phase === "buffering") return vm._onSnapshotApply(state, msg);
        if (state.phase === "buffering") return { phase: "buffering", clientId: state.clientId, buffer: state.buffer.concat([msg]) };
        if (state.phase === "live")      return vm._onLiveMsg(state, msg);
        return state;
    }
);

// _spawned: event receiver pushed by _drain when worldState.spawned changes
const _spawned = Events.receiver({ queued: true });

// spawnedNames — latest spawned array, updated from _spawned events
const spawnedNames = Behaviors.collect(
    [],
    _spawned,
    function(prev, namesOrArr) {
        if (!namesOrArr) return prev;
        var arr = Array.isArray(namesOrArr) ? namesOrArr[namesOrArr.length - 1] : namesOrArr;
        if (!arr) return prev;
        return Array.isArray(arr) ? arr : [arr];
    }
);

// children$ — reactive Map<name, KrestianstvoVM> managed by _diffChildren
const children$ = Behaviors.collect(
    new Map(),
    Events.change($spawnedNames),
    function(prev, names) { return Renkon.app.vm._diffChildren(prev, names); }
);
        }) + '\n';
    }

    // _onSeloJoined — called from seloState reducer
    _onSeloJoined(state, msg) {
        this.viewPS.registerEvent('clientIdentity', { clientId: msg.clientId, seloId: msg.seloId });
        if (msg.clientsInSelo === 1) {
            const seed = (Date.now() ^ (Math.random() * 0x100000000)) | 0;
            const selo = this._createModelSelo(0, {}, { seed });
            this.modelPS = selo.ps;
            this.viewPS.registerEvent('objects', {});
            this.viewPS.registerEvent('vTime', 0);
            this._sendJoin();
            if (this.onSeloJoined) this.onSeloJoined({ clientId: msg.clientId, seloId: msg.seloId });
            return { phase: 'live', clientId: msg.clientId, buffer: [], selo };
        } else {
            if (this.onSeloJoined) this.onSeloJoined({ clientId: msg.clientId, seloId: msg.seloId });
            return { phase: 'buffering', clientId: msg.clientId, buffer: [] };
        }
    }

    // _onSnapshotApply — called from seloState reducer
    _onSnapshotApply(state, msg) {
        const snap = msg.snapshot;
        console.log('[SNAP_APPLY] counter=', snap.counter, 'time=', snap.time, 'keys=', Object.keys(snap));
        const selo = this._restoreModelSelo(snap);
        this.modelPS = selo.ps;
        selo.ps.evaluate(snap.time || 0);
        this.viewPS.registerEvent('objects', snap.objects || {});
        this.viewPS.registerEvent('vTime',   snap.time   || 0);
        if (snap.randomResult != null) this.viewPS.registerEvent('randomResult', snap.randomResult);
        if (snap.ticking != null) this.viewPS.registerEvent('_modelTicking', snap.ticking);
        (this.viewStateKeys || []).forEach(k => {
            if (snap[k] != null) this.viewPS.registerEvent(k, snap[k]);
        });
        (this.modelStateKeys || []).forEach(k => {
            if (snap[k] != null) this.viewPS.registerEvent(k, snap[k]);
        });
        if (snap.windows) {
            Object.entries(snap.windows).forEach(([name, pos]) => {
                this.viewPS.registerEvent('_moveWindow', { name, x: pos.x || 0, y: pos.y || 0 });
            });
        }

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
            const wss = this._getModelNode(selo.ps, 'worldState');
            if (wss) {
                this.viewPS.registerEvent('objects', wss.objects);
                this.viewPS.registerEvent('vTime',   wss.time);
            }
            // Re-push modelStateKeys after replay — ensures view has correct values
            // even if drain pushed intermediate values during buffered replay
            var _self = this;
            (_self.modelStateKeys || []).forEach(function(k) {
                var v = _self._getModelNode(selo.ps, k);
                console.log('[POST_REPLAY push]', k, '=', v);
                if (v !== undefined) _self.viewPS.registerEvent(k, v);
            });
            this._sendJoin();
            (snap.spawned || []).forEach(name => this._emitSpawn(name));
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

    // _diffChildren — called from children$ reducer
    _diffChildren(prev, names) {
        const next = new Map(prev);
        names.forEach(name => {
            if (next.has(name)) return;
            console.log('[children$] spawning:', name, 'depth:', this.depth + 1);
            if (this.depth + 1 > this.maxDepth) {
                console.warn('[VM] max depth reached (' + this.maxDepth + '), not spawning:', name);
                return;
            }
            const child = new KrestianstvoVM({ wsUrl: this.ws.url, seloId: name, depth: this.depth + 1, maxDepth: this.maxDepth });
            child.modelStateKeys = this.modelStateKeys || [];
            child.viewStateKeys  = this.viewStateKeys  || [];
            child.onSpawn = this.onSpawn;
            child.onClose = this.onClose;
            child.start({ modelProgram: this._modelProgram, viewProgram: this._viewProgram, applyAction: this._applyAction });
            next.set(name, child);
            if (this.onSpawn) this.onSpawn({ name, vm: child, depth: this.depth + 1 });
        });
        prev.forEach((child, name) => {
            if (names.indexOf(name) === -1) {
                console.log('[children$] closing:', name);
                if (child.ws) child.ws.close();
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
    _emitSpawn(name) {
        if (!name) return;
        if (this.ws && this.ws.readyState === WebSocket.OPEN)
            this.ws.send(JSON.stringify({ type: 'spawnSelo', data: { name: name } }));
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
        var payload = {
            time:         wss.time,
            objects:      wss.objects,
            queue:        wss.queue    || [],
            spawned:      wss.spawned  || [],
            ticking:      wss.ticking  || false,
            windows:      wss.windows  || {},
            seed:         wss.seed     || 0,
            randomResult: wss.randomResult || null,
            _rngState: wss._rngState ? wss._rngState.slice()
                                     : _vm_xoroshiroSeed(wss.seed || 1),
        };
        // Include user-declared viewStateKeys fields in snapshot
        (this.viewStateKeys || []).forEach(k => { if (wss[k] != null) payload[k] = wss[k]; });
        // Include modelStateKeys — read directly from model PS nodes (like old vm's modelNodes)
        (this.modelStateKeys || []).forEach(k => {
            var v = this._getModelNode(selo.ps, k);
            if (v !== undefined) payload[k] = v;
        });
        console.log('SNAP SEND t=' + wss.time + ' queue=' + JSON.stringify(payload.queue));
        this.ws.send(JSON.stringify({ type: 'snapshot_response', targetUser: targetUser, payload: payload }));
    }

    // ── _makeSend ──────────────────────────────────────────────────────────
    _makeSend(psRef) {
        return function(ev) {
            var t = ev.type === 'heartbeat'  ? (ev.vTime || 0)
                  : ev.type === 'client_msg' ? ((ev.data && ev.data.serverTime) || 0) : 0;
            if (!psRef._ps) return;
            psRef._ps.registerEvent('_raw', ev);
            //evaluate(t) call 1 → Events.next gets msg → _raw  → incoming → worldState enqueues
            //evaluate(t) call 2 → Events.change($worldState) → drain → msg processed
            psRef._ps.evaluate(t);
            psRef._ps.evaluate(t);
        };
    }

    // ── _createModelSelo ──────────────────────────────────────────────────
    _createModelSelo(initialTime, initialObjects, initialState) {
        initialTime    = initialTime    || 0;
        initialObjects = initialObjects || {};
        initialState   = initialState   || {};
        var self = this;
        var appRef = {
            viewPS:          this.viewPS,
            metaPS:          this.ps,
            _ps:             null,
            ws:              this.ws,
            initialObjects:  initialObjects,
            initialState:    initialState,
            initialTime:     initialTime,
            viewStateKeys:   this.viewStateKeys  || [],
            modelStateKeys:  this.modelStateKeys || [],
            _modelStatePrev: (function(keys, init) {
                var p = {};
                keys.forEach(function(k) { if (init[k] !== undefined) p[k] = init[k]; });
                return p;
            })(this.modelStateKeys || [], initialState),
        };
        var modelSrc = buildModelPreamble(this._applyAction) + '\n' + this._modelProgram;
        var ps = new ProgramState(initialTime, appRef, true);
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
        return { ps: ps, send: this._makeSend(appRef) };
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
