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

const _vm_future = (seconds, type, data) => {
    data = data || {};
    const msg = { type, data, from: '_future',
                  serverTime: (app._vTime || 0) + seconds, _future: true };
    _pendingFutures.push(msg);
    console.log('%c⏳ FUTURE scheduled', 'color:#f90;font-weight:bold',
        type, '| fires@' + msg.serverTime, '| now=' + (app._vTime||0), '| in+' + seconds + 's');
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
        const peers = new Map(state._peers || new Map());
        peers.delete(ev.from);
        const next = { ...state, _peers: peers };
        if (app.viewPS) {
            // Immediately remove from app-level avatar Map so renderer doesn't
            // re-create the ghost between _avatarLeftSync and the _makeSend post-loop.
            var _on = (app._ps && app._ps.resolved && app._ps.resolved.get('objects'))
                   || (app._ps && app._ps.scratch  && app._ps.scratch.get('objects'));
            var _ov = _on && _on.value;
            if (_ov && _ov.map instanceof Map) {
                _ov.map.delete(ev.from);
                app.viewPS.registerEvent('objects', { map: _ov.map });
                if (app._modelStatePrev) app._modelStatePrev['objects'] = { map: _ov.map };
            }
            app.viewPS.registerEvent('clientLeft', [ev.from]);
            const _clients = [...peers.keys()].sort();
            app.viewPS.registerEvent('clients', _clients);
        }
        return next;
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
        // viewToModel types (view-triggered) are handled by _makeSend 3rd-step instead —
        // they must not be double-registered here or they'd fire twice.
        // Exception: future-scheduled messages (_future=true) always register directly —
        // they have a direct type (not wrapped in client_msg) and may target FRP receivers
        // that are in viewToModel (e.g. createNamedPortal, createLink, spawnSelo).
        if (msg._future || !(app.viewEchoExclude && app.viewEchoExclude.has(msg.type))) {
            // Deliver { ...data, from } to model receivers — same shape as view val
            // so model Behaviors can read ev.from (e.g. _move needs msg.from for avatar id)
            app._ps.registerEvent(msg.type, val);
        }
        if (app.viewPS && msg.type !== 'spawnSelo') {
            if (msg._future || !app.viewEchoExclude || !app.viewEchoExclude.has(msg.type))
                app.viewPS.registerEvent(msg.type, val);
            if (next._peers !== s._peers) {
                var _nextClients = [...(next._peers || new Map()).keys()].sort();
                var _prevClients = [...(s._peers    || new Map()).keys()].sort();
                app.viewPS.registerEvent('clients',      _nextClients);
                app.viewPS.registerEvent('clientJoined', _nextClients.filter(function(id) { return _prevClients.indexOf(id) === -1; }));
                app.viewPS.registerEvent('clientLeft',   _prevClients.filter(function(id) { return _nextClients.indexOf(id) === -1; }));
            }
            if (next.time !== s.time) app.viewPS.registerEvent('vTime', next.time);
        }
    }
    return _vm_drain(next);
};

const _vm_applyAction_builtin = (state, msg) => {
    if (!msg) return state;
    if (msg.type === '_join') {
        const peers = new Map(state._peers || new Map());
        if (peers.get(msg.from)) return state;
        console.log('[_join] peer joined:', msg.from);
        peers.set(msg.from, { joinedAt: state.time });
        return { ...state, _peers: peers };
    }
    if (msg.type === '_leave') {
        const peers = new Map(state._peers || new Map());
        peers.delete(msg.from);
        return { ...state, _peers: peers };
    }
};

// ── Built-in portal/link applyAction handlers ────────────────────────────
// These are GENERAL — no 2D window geometry, no app-specific state.
// A portal is just a named anchor { id, name, meta } in the model.
// A portalLink is a directional connection { id, fromPortalId, toSelo, toPortalName }.
// The spawned child VM is what actually connects the two worlds.
// App-specific behavior (2D clipping, 3D viewport, 1D slider, console output)
// is handled in the app's own VIEW/applyAction layer — not here.
const _vm_applyAction_portal = (state, msg) => {
    if (!msg) return state;

    // updatePortal: FRP portals arm handles the map update reactively.
    // applyAction only schedules cross-VM notification future.
    // { id, ...props }  OR  { name, ...props }
    if (msg.type === 'updatePortal') {
        var _d = msg.data || {};
        var _pn = app._ps && ((app._ps.resolved && app._ps.resolved.get('portals'))
                           || (app._ps.scratch  && app._ps.scratch.get('portals')));
        var _pv = _pn && _pn.value;
        var _portalsMap = (_pv && _pv.map instanceof Map) ? _pv.map : new Map();
        var _pid = _d.id || ([..._portalsMap.values()].find(function(p) { return p.name === _d.name; }) || {}).id;
        if (!_pid) return state;
        future(0, '_notifyPortalUpdate', { portalId: _pid });
        return state;
    }

    // ── Cross-world notification (via future + injectModelMessage) ─────
    // _notifyPortalUpdate: finds parent VMs linked to this portal and injects
    // a 'portalUpdated' message. Reads parent FRP portalLinks/spawned nodes directly.
    if (msg.type === '_notifyPortalUpdate') {
        var _d = msg.data || {};
        if (!_d.portalId || !app.vm) return state;
        var _vm    = app.vm;
        var _par   = _vm._parent;
        if (!_par) return state;
        // Read parent FRP nodes (krestianified) — portalLinks is { map: Map }, spawned is []
        var _plNode = _par.modelPS && _par._getModelNode(_par.modelPS, 'portalLinks');
        var _parLinks = (_plNode && _plNode.map) || new Map();
        var _parSpawned = (function() {
            var n = _par.modelPS && _par._getModelNode(_par.modelPS, 'spawned');
            return Array.isArray(n) ? n : [];
        })();
        // Read this VM's FRP portals node
        var _pn2 = app._ps && ((app._ps.resolved && app._ps.resolved.get('portals'))
                            || (app._ps.scratch  && app._ps.scratch.get('portals')));
        var _pv2 = _pn2 && _pn2.value;
        var _portalsMap2 = (_pv2 && _pv2.map instanceof Map) ? _pv2.map : new Map();
        var _portal = _portalsMap2.get(_d.portalId);
        if (!_portal) return state;
        [..._parLinks.values()].forEach(function(lk) {
            if (lk.toSelo !== _vm.seloId || lk.toPortalName !== _portal.name) return;
            var _entry = _parSpawned.find(function(e) { return e && e.linkId === lk.id; });
            if (!_entry) return;
            _par.injectModelMessage('portalUpdated', {
                linkId:       lk.id,
                windowName:   _entry.windowName,
                fromPortalId: lk.fromPortalId,
                toSelo:       _vm.seloId,
                toPortalName: _portal.name,
                meta:         _portal.meta !== undefined ? _portal.meta : _portal,
            }, _vm.seloId);
        });
        return state;
    }

    // portalUpdated: cross-world notification arriving via injectModelMessage.
    // Bridges to VIEW by pushing to viewPS so _portalUpdatedRx receiver fires.
    // Apps declare:  const _portalUpdatedRx = Events.receiver();
    if (msg.type === 'portalUpdated') {
        if (app.viewPS) app.viewPS.registerEvent('_portalUpdatedRx', msg.data);
        return state;
    }
};

// ── Backwards-compat aliases (used by world 2D demo app) ──────────────────
// The world app uses createNamedPortal / movePortal / resizePortal / closePortal
// which have 2D geometry. These are NOT in the VM builtin — they belong in the
// world app's own applyAction. Defined here only for krestianified apps that
// explicitly include the world applyAction.
// (See APPS["world"].applyAction in apps.js)


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
            //if (data.type !== 'heartbeat') console.log('📩 WS:', data.type, data);
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

    // Portal/window/link handlers — auto-included in every app (no manual applyAction needed)
    const portalBody = _vm_applyAction_portal.toString()
        .replace(/^.*?=>\s*\{/, '')
        .replace(/\};\s*$/, '').replace(/\}\s*$/, '');

    const applyActionSrc =
        'const applyAction = (state, msg) => {\n' +
        builtinBody + '\n' +
        portalBody + '\n' +
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
      queue:     _initialState.queue   || [],
      _peers:    _initialObjects,
      seed:      _initialState.seed    || 0,
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
const vTime    = Behaviors.collect((_initialState && _initialState.time) || 0, Events.change(worldState), (_, s) => s ? s.time : 0);
// _vmPeers — VM-internal peer registry: tracks who is connected (clientId → {joinedAt}).
// Avatar data (color, x, y) is app-level concern — defined in the app's model program.
const _vmPeers = Behaviors.collect(new Map(), Events.change(worldState), function(prev, s) {
    if (!s || s._peers === prev) return prev;
    return s._peers || new Map();
});
// clients — sorted array of clientIds currently in the selo, derived from _vmPeers
const clients = Behaviors.collect([], Events.change(_vmPeers), (_, objs) => objs ? [...objs.keys()].sort() : []);
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



    // ── VM-provided portal/link/spawn preamble ────────────────────────────────
    // These nodes are available in EVERY app without any declaration.
    // Apps extend by using: portal_create/portal_link/selo_spawn helper sugar,
    // or direct ws.send of createPortal/createLink/spawnSelo message types.
    // 2D geometry (x,y,w,h,r,s) is stored directly on portal objects — flat schema.
    // 1D apps (portal-minimal) just ignore x/y/w/h fields.
    // 3D apps can add z/quaternion etc. via createPortal({ name, z, ... }).
    const _vmPortalSrc = [
        'const createPortal      = Events.receiver();',
        'const createNamedPortal = Events.receiver();',
        'const updatePortal      = Events.receiver();',
        'const closePortal       = Events.receiver();',
        'const movePortal        = Events.receiver();',
        'const resizePortal      = Events.receiver();',
        'const rotatePortal      = Events.receiver();',
        'const scalePortal       = Events.receiver();',
        'const createLink        = Events.receiver();',
        'const deleteLink        = Events.receiver();',
        'const _rotateLinkPortal = Events.receiver({ queued: true });',
        'const _scaleLinkPortal  = Events.receiver({ queued: true });',
        'const _moveLinkPortal   = Events.receiver({ queued: true });',
        'const _setLinkMirror    = Events.receiver({ queued: true });',
        'const spawnSelo         = Events.receiver();',
        'const _joinWindow       = Events.receiver();',
        'const _closeWindow      = Events.receiver();',
        `const portals = Behaviors.select(
    { map: new Map() },
    Events.once(worldState), function(prev, s) {
        if (!s || !s.portals) return prev;
        var _m = s.portals instanceof Map ? new Map(s.portals) : new Map(Object.entries(s.portals));
        return { map: _m };
    },
    createPortal, function(prev, ev) {
        if (!ev || !ev.name) return prev;
        if ([...prev.map.values()].some(function(p) { return p.name === ev.name; })) return prev;
        var _pid = uid('p');
        prev.map.set(_pid, Object.assign({}, ev, { id: _pid }));
        return { map: prev.map };
    },
    createNamedPortal, function(prev, ev) {
        if (!ev || !ev.name) return prev;
        if ([...prev.map.values()].some(function(p) { return p.name === ev.name; })) return prev;
        var _pid = uid('p');
        prev.map.set(_pid, { id: _pid, name: ev.name,
            x: ev.x != null ? ev.x : 80, y: ev.y != null ? ev.y : 80,
            w: ev.w != null ? ev.w : 100, h: ev.h != null ? ev.h : 100 });
        return { map: prev.map };
    },
    updatePortal, function(prev, ev) {
        if (!ev) return prev;
        var _pid = ev.id || ([...prev.map.values()].find(function(p) { return p.name === ev.name; }) || {}).id;
        if (!_pid || !prev.map.get(_pid)) return prev;
        prev.map.set(_pid, Object.assign({}, prev.map.get(_pid), ev, { id: _pid }));
        return { map: prev.map };
    },
    movePortal, function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { x: ev.x, y: ev.y }));
        return { map: prev.map };
    },
    resizePortal, function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { w: ev.w, h: ev.h }));
        return { map: prev.map };
    },
    rotatePortal, function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { r: ev.r }));
        return { map: prev.map };
    },
    scalePortal, function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { s: ev.s }));
        return { map: prev.map };
    },
    closePortal, function(prev, ev) {
        if (!ev) return prev;
        var _pid = ev.id || ([...prev.map.values()].find(function(p) { return p.name === ev.name; }) || {}).id;
        if (!_pid) return prev;
        prev.map.delete(_pid);
        return { map: prev.map };
    });`,
        `const portalLinks = Behaviors.select(
    { map: new Map() },
    Events.once(worldState), function(prev, s) {
        if (!s || !s.portalLinks) return prev;
        var _m = s.portalLinks instanceof Map ? new Map(s.portalLinks) : new Map(Object.entries(s.portalLinks));
        return { map: _m };
    },
    createLink, function(prev, ev) {
        if (!ev || !ev.toSelo || !ev.toPortalName) return prev;
        var _fromPortalId = ev.fromPortalId;
        if (!_fromPortalId || _fromPortalId === '__pending__') {
            if (!ev.fromPortalName) return prev;
            var _fp = [...portals.map.values()].find(function(p) { return p.name === ev.fromPortalName; });
            if (!_fp) return prev;
            _fromPortalId = _fp.id;
        }
        var _dup = [...prev.map.values()].some(function(l) {
            return l.fromPortalId === _fromPortalId && l.toSelo === ev.toSelo && l.toPortalName === ev.toPortalName;
        });
        if (_dup) return prev;
        var _lid = uid('link');
        prev.map.set(_lid, { id: _lid, fromPortalId: _fromPortalId, toSelo: ev.toSelo, toPortalName: ev.toPortalName });
        return { map: prev.map };
    },
    deleteLink, function(prev, ev) {
        if (!ev || !ev.id) return prev;
        prev.map.delete(ev.id);
        return { map: prev.map };
    },
    closePortal, function(prev, ev) {
        if (!ev) return prev;
        var _pid = ev.id || ([...portals.map.values()].find(function(p) { return p.name === ev.name; }) || {}).id;
        if (!_pid) return prev;
        prev.map.forEach(function(l, lid) { if (l.fromPortalId === _pid) prev.map.delete(lid); });
        return { map: prev.map };
    },
    _rotateLinkPortal, function(prev, ev) {
        var evs = Array.isArray(ev) ? ev : [ev];
        evs.forEach(function(e) {
            if (!e || !e.linkId || !prev.map.get(e.linkId)) return;
            prev.map.set(e.linkId, Object.assign({}, prev.map.get(e.linkId), { r: e.r }));
        });
        return { map: prev.map };
    },
    _scaleLinkPortal, function(prev, ev) {
        var evs = Array.isArray(ev) ? ev : [ev];
        evs.forEach(function(e) {
            if (!e || !e.linkId || !prev.map.get(e.linkId)) return;
            prev.map.set(e.linkId, Object.assign({}, prev.map.get(e.linkId), { s: e.s }));
        });
        return { map: prev.map };
    },
    _moveLinkPortal, function(prev, ev) {
        var evs = Array.isArray(ev) ? ev : [ev];
        evs.forEach(function(e) {
            if (!e || !e.linkId || !prev.map.get(e.linkId)) return;
            prev.map.set(e.linkId, Object.assign({}, prev.map.get(e.linkId), { x: e.x, y: e.y }));
        });
        return { map: prev.map };
    },
    _setLinkMirror, function(prev, ev) {
        var evs = Array.isArray(ev) ? ev : [ev];
        evs.forEach(function(e) {
            if (!e || !e.linkId || !prev.map.get(e.linkId)) return;
            prev.map.set(e.linkId, Object.assign({}, prev.map.get(e.linkId), { hasMirror: e.hasMirror }));
        });
        return { map: prev.map };
    });`,
        `const spawned = Behaviors.select(
    [],
    Events.once(worldState), function(prev, s) {
        if (!s || !s.spawned) return prev;
        return Array.isArray(s.spawned) ? s.spawned.slice() : prev;
    },
    spawnSelo, function(prev, ev) {
        if (!ev || (!ev.seloId && !ev.appName && !ev.name)) return prev;
        var _seloId = ev.seloId || ev.name || uid(ev.appName || 'child');
        var _windowName = ev.windowName || (ev.name ? ev.name : uid('w') + '-' + _seloId);
        if (prev.some(function(e) { return (typeof e === 'object' ? e.windowName : e) === _windowName; })) return prev;
        var _maxDepth = (ev.maxDepth != null) ? ev.maxDepth : null;
        var _next = prev.slice();
        _next.push({ windowName: _windowName, seloId: _seloId, appName: ev.appName || null, maxDepth: _maxDepth, wsUrl: ev.wsUrl || null });
        return _next;
    },
    createLink, function(prev, ev) {
        if (!ev || !ev.toSelo || !ev.toPortalName) return prev;
        var _fromPortalId = ev.fromPortalId;
        if (!_fromPortalId || _fromPortalId === '__pending__') {
            if (!ev.fromPortalName) return prev;
            var _fp2 = [...portals.map.values()].find(function(p) { return p.name === ev.fromPortalName; });
            if (!_fp2) return prev;
            _fromPortalId = _fp2.id;
        }
        var _link = [...portalLinks.map.values()].find(function(l) {
            return l.fromPortalId === _fromPortalId && l.toSelo === ev.toSelo && l.toPortalName === ev.toPortalName;
        });
        if (!_link) return prev;
        var _windowName = _link.id + '-' + ev.toSelo;
        var _maxDepth = (ev.maxDepth != null) ? ev.maxDepth : null;
        var _next = prev.slice();
        _next.push({ windowName: _windowName, seloId: ev.toSelo, linkId: _link.id, fromPortalId: _fromPortalId, isPortal: true, maxDepth: _maxDepth });
        return _next;
    },
    deleteLink, function(prev, ev) {
        if (!ev || !ev.id) return prev;
        return prev.filter(function(e) { return !(e && e.linkId === ev.id); });
    },
    closePortal, function(prev, ev) {
        if (!ev) return prev;
        var _pid = ev.id || ([...portals.map.values()].find(function(p) { return p.name === ev.name; }) || {}).id;
        if (!_pid) return prev;
        return prev.filter(function(e) { return !(e && e.isPortal && e.fromPortalId === _pid); });
    },
    _closeWindow, function(prev, ev) {
        if (!ev || !ev.name) return prev;
        return prev.filter(function(e) {
            var wn = (e && typeof e === 'object') ? e.windowName : e;
            return wn !== ev.name;
        });
    },
    _joinWindow, function(prev, ev) {
        if (!ev || !ev.name || !ev.seloId) return prev;
        return prev.map(function(e) {
            if (!e || (typeof e === 'object' ? e.windowName : e) !== ev.name) return e;
            return Object.assign({}, e, { seloId: ev.seloId });
        });
    });`,
    ].join('\n');

    return [
        'const app             = Renkon.app;',
        'const _initialObjects = app.initialObjects ? new Map(Object.entries(app.initialObjects)) : new Map(); // peer registry seed (_peers)',
        'const _initialState   = app.initialState   || {};',
        'const _raw            = Events.receiver({ queued: true });',
        'const _pendingFutures = []; app._pendingFutures = _pendingFutures;',
        xoroshiroSeedSrc,
        xoroshiroNextSrc,
        'const _rngRef = _initialState._rngState ? [..._initialState._rngState] : _xoroshiroSeed(_initialState.seed || 1);',
        'app._rngRef = _rngRef;',
        'const random  = () => _xoroshiroNext(_rngRef);',
        'const now      = () => app._vTime || 0;',
        'const seloId   = app.vm ? app.vm.seloId : "";',
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

        // ── Portal helper functions ─────────────────────────────────────
        // Syntactic sugar: schedule portal messages via future(0, ...).
        // Callable from any model combinator without knowing the message type.
        // Usage inside Behaviors.collect:
        //   portal_create({ name: "p1", x: 80, y: 80, w: 100, h: 100 })
        //   portal_link({ fromPortalName: "p1", toSelo: "world:2", toPortalName: "p2" })
        //   portal_delete({ name: "p1" })
        //   portal_update({ name: "p1", offset: 42 })
        //   selo_spawn({ seloId: "child:1", appName: "balls" })
        //   inject(targetVM, msgType, data)
        'const portal_create  = function(data) { future(0, "createPortal",  data); };',
        'const portal_update  = function(data) { future(0, "updatePortal",  data); };',
        'const portal_delete  = function(data) { future(0, "closePortal",   data); };',
        'const portal_link    = function(data) { future(0, "createLink",    data); };',
        'const portal_unlink  = function(data) { future(0, "deleteLink",    data); };',
        'const selo_spawn     = function(data) { future(0, "spawnSelo",     data); };',
        'const inject         = function(targetVM, type, data) { injectModelMessage(targetVM, type, data); };',

        // injectModelMessage — cross-world model msg without ws.send
        // Usage in model: injectModelMessage(targetVM, type, data)
        // targetVM: a KrestianstvoVM instance (e.g. app.vm._parent, app.vm._children.get(name))
        'const injectModelMessage = function(targetVM, type, data) {' +
        '    if (targetVM && typeof targetVM.injectModelMessage === "function") {' +
        '        targetVM.injectModelMessage(type, data, app.seloId || "model");' +
        '    }' +
        '};',
        futureSrc,
        applyActionSrc,
        enqueueSrc,
        drainSrc,
        worldStateSrc,
        vTimeSrc,
        _vmPortalSrc,
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
const objects        = Behaviors.collect({ map: new Map() }, Events.receiver(), function(_,v){return v;});
const vTime          = Behaviors.collect(0,    Events.receiver(), function(_,v){return v;});
// clients — pushed from model alongside objects; sorted array of clientIds in the selo
const clients        = Behaviors.collect([], Events.receiver(), function(_,v){return v || [];});
// clientJoined / clientLeft — arrays of ids that joined/left since last objects change
const clientJoined   = Behaviors.collect([], Events.receiver(), function(_,v){return v || [];});
const clientLeft     = Behaviors.collect([], Events.receiver(), function(_,v){return v || [];});
// VM built-in portal/link/spawn view receivers — always available, pushed via _effectiveStateKeys.
const portals     = Behaviors.collect({ map: new Map() }, Events.receiver(), function(_,v){return v || { map: new Map() };});
const portalLinks = Behaviors.collect({ map: new Map() }, Events.receiver(), function(_,v){return v || { map: new Map() };});
const spawned     = Behaviors.collect([], Events.receiver(), function(_,v){return Array.isArray(v)?v:[];});
const myObject = Behaviors.collect(null, Events.change(objects), function(_, objs) {
    const id = clientIdentity && clientIdentity.clientId;
    return id ? ((objs && objs.map && objs.map.get(id)) || null) : null;
});

// send(type, data) — send an action to the reflector from any view node.
// krestianify auto-generates calls to this for every viewToModel node.
// Queues messages until VM is fully joined, then flushes — no silent drops
// on slow connections where WS or selo handshake isn't complete yet.
const send = function(type, data) {
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

    // VM-provided model nodes always included in snapshot/push without app listing them.
    static _builtinStateKeys = ['portals', 'portalLinks', 'spawned'];

    // App-specific modelStateKeys + VM built-ins, deduplicated.
    get _effectiveStateKeys() {
        var base = KrestianstvoVM._builtinStateKeys;
        var seen = new Set(base);
        var extra = (this.modelStateKeys || []).filter(function(k) { return !seen.has(k); });
        return base.concat(extra);
    }

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
            ws:       ws,
            depth:    this.depth,
            maxDepth: this.maxDepth,
            vm:       this,           // KrestianstvoVM — accessible as Renkon.app.vm / vm in VIEW
            seloId:   this.seloId,    // accessible as Renkon.app.seloId in VIEW
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

// spawnedDiff$ — pure diff: which entries were added / removed since last tick
const spawnedDiff$ = Behaviors.collect(
    { added: [], removed: [], names: [] },
    Events.change(spawnedNames),
    function(state, names) {
        var getKey = function(e) { return (e && typeof e === 'object') ? e.windowName : e; };
        var prevKeys = new Set(state.names.map(getKey));
        var curKeys  = new Set(names.map(getKey));
        return {
            added:   names.filter(function(e) { return !prevKeys.has(getKey(e)); }),
            removed: state.names.filter(function(e) { return !curKeys.has(getKey(e)); }),
            names:   names,
        };
    }
);

// children$ — Map<windowName, KrestianstvoVM> updated reactively from spawnedDiff$
const children$ = Behaviors.collect(
    new Map(),
    Events.change(spawnedDiff$),
    function(map, diff) {
        var vm   = Renkon.app.vm;
        var getKey = function(e) { return (e && typeof e === 'object') ? e.windowName : e; };
        var afterClose = diff.removed
            .map(getKey)
            .reduce(function(m, name) {
                var child = m.get(name);
                if (child) {
                    console.log('[children$] closing:', name);
                    child._destroy();
                    if (vm.onClose) vm.onClose({ name: name });
                }
                m.delete(name);
                return m;
            }, new Map(map));
        var next = diff.added
            .map(function(entry) { return vm._spawnChild(entry); })
            .filter(Boolean)
            .reduce(function(m, item) { m.set(item.name, item.child); return m; }, afterClose);
        vm._childrenMap = next;
        return next;
    }
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
            if (this._startsBlank) {
                // Child VM (blank first-peer): evaluate once so CollectStream.created()
                // fills resolved/scratch, then seed _modelStatePrev so _sendSnapshot
                // has correct state before the first heartbeat triggers _makeSend.
                selo.ps.evaluate(0);
                var _self0 = this;
                this._effectiveStateKeys.forEach(function(k) {
                    var v = _self0._getModelNode(selo.ps, k);
                    if (v !== undefined && selo.appRef) {
                        selo.appRef._modelStatePrev = selo.appRef._modelStatePrev || {};
                        selo.appRef._modelStatePrev[k] = v;
                    }
                });
            }
            // Reset spawned children — new selo starts empty
            this.ps.registerEvent('_spawned', []);
            // Reset viewPS time-sensitive receivers so stale values from previous
            // session don't show (e.g. T still showing old vTime after page reload)
            this.viewPS.registerEvent('vTime', 0);
            this.viewPS.registerEvent('objects', { map: new Map() });
            this.viewPS.registerEvent('clients', []);
            this.viewPS.registerEvent('clientJoined', []);
            this.viewPS.registerEvent('clientLeft', []);
            this._sendJoin();
            if (this.onSeloJoined) this.onSeloJoined({ clientId: msg.clientId, seloId: msg.seloId });
            // First peer: goes live immediately without snapshot_apply — fire joined callbacks here
            this._joined = true;
            if (this.viewPS) this.viewPS.app._joined = true;
            if (this._onJoinedCallback) {
                const cb = this._onJoinedCallback;
                this._onJoinedCallback = null;
                Promise.resolve().then(cb);
            }
            return { phase: 'live', clientId: msg.clientId, buffer: [], selo };
        } else {
            // Joiner: reset stale viewPS state immediately — snapshot will repopulate correctly
            this.viewPS.registerEvent('vTime', 0);
            this.viewPS.registerEvent('objects', { map: new Map() });
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
                // Mark viewPS as not joined — suppress send until restore completes
                if (this.viewPS && this.viewPS.app) this.viewPS.app._joined = false;
            }
            if (this.onSeloJoined) this.onSeloJoined({ clientId: msg.clientId, seloId: msg.seloId });
            return { phase: 'buffering', clientId: msg.clientId, buffer: [] };
        }
    }

    // _onSnapshotApply — called from seloState reducer
    _onSnapshotApply(state, msg) {
        this._joined = true;  // signal: fully joined, safe for tests to proceed
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
        // Push vTime + clients from snapshot — avatar objects pushed via modelStateKeys loop below
        this.viewPS.registerEvent('clients', snap._peers ? Object.keys(snap._peers).sort() : []);
        this.viewPS.registerEvent('clientJoined', []);
        this.viewPS.registerEvent('clientLeft', []);
        this.viewPS.registerEvent('vTime',   snap.time   || 0);
        // Push modelStateKeys AFTER restoreModelSelo+evaluate so drain cannot overwrite them
        // Format detected from live model node — works for any krestianified app without VM changes.
        this._effectiveStateKeys.forEach(k => {
            if (snap[k] !== undefined) this.viewPS.registerEvent(k, this._resolveSnapVal(selo.ps, k, snap[k]));
        });
        // Force one synchronous viewPS evaluation cycle so that view nodes like
        // _winSync run and set app.windowPositions before _onJoinedCallback fires.
        // Without this, makeSpawnHandler reads windowPositions as null and creates
        // child windows at default 240x180 instead of the saved dimensions.
        try { this.viewPS.evaluate(Date.now()); } catch(e) {}
        // Push again via Promise so any drain triggered by restore cannot overwrite
        var _self2 = this;
        var _snap2 = snap;
        Promise.resolve().then(function() {
            _self2._effectiveStateKeys.forEach(function(k) {
                if (_snap2[k] !== undefined) _self2.viewPS.registerEvent(k, _self2._resolveSnapVal(selo.ps, k, _snap2[k]));
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
                // objects (avatar map) pushed below via _msp / modelStateKeys loop
                var _peersMap = _wss._peers instanceof Map ? _wss._peers : (_wss._peers ? new Map(Object.entries(_wss._peers)) : new Map());
                _self.viewPS.registerEvent('clients', [..._peersMap.keys()].sort());
                _self.viewPS.registerEvent('clientJoined', []);
                _self.viewPS.registerEvent('clientLeft', []);
                _self.viewPS.registerEvent('vTime',   _wss.time   || 0);
            }
            var _msp = (selo.appRef && selo.appRef._modelStatePrev) || {};
            _self._effectiveStateKeys.forEach(function(k) {
                var _raw = (_msp[k] !== undefined) ? _msp[k] : snap[k];
                var v = _self._resolveSnapVal(_self.modelPS, k, _raw);
                if (v !== undefined) _self.viewPS.registerEvent(k, v);
            });
            // Reset children$ to snapshot's spawned list — clears stale children from previous selo
            this.ps.registerEvent('_spawned', snap.spawned || []);
            this._sendJoin();
            // Mark viewPS as joined AFTER buffer replay — send now allowed to fire
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
        console.log("in rebuildViewPSWhenReady")
        snap = snap || {};
        const _self = this;
        const _rootEl0 = _self.viewAppExtra && _self.viewAppExtra.rootEl;
        if (_rootEl0) {
            console.log("in _rootEl0")
            _self._buildDomFromSnap(_rootEl0, snap);
            //return;  // rootEl already available — no observer needed
        }
        const observer = new window.MutationObserver((mutations, obs) => {
            const _rootEl = _self.viewAppExtra && _self.viewAppExtra.rootEl;
            console.log("in observer")
            if (_rootEl) {
                obs.disconnect();
                console.log("in observer _rootEl")
                _self._buildDomFromSnap(_rootEl, snap);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    _buildDomFromSnap(_rootEl0, snap) {
         const _self = this;
console.log("in _buildDomFromSnap")
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
                // Pass helpers so serialised buildUI (reconstructed via new Function) has them in scope.
                var _helpers = {
                    portalMount: function(rootEl) {
                        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
                            var c = rootEl.querySelector('.vm-content');
                            if (!c) {
                                c = document.createElement('div');
                                c.className = 'vm-content';
                                c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                                rootEl.appendChild(c);
                            }
                            return c;
                        }
                        return rootEl;
                    }
                };
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
            ws:       _self.ws,
            depth:    _self.depth,
            maxDepth: _self.maxDepth,
            vm:       _self,
            seloId:   _self.seloId,
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
        // For first-peer path (snap={}), read live objects from model — _join may have been
        // processed before _buildDomFromSnap ran, and we must not overwrite it with new Map().
        var _liveWS      = _self.modelPS && _self._getModelNode(_self.modelPS, 'worldState');
        var _livePeers = (_liveWS && _liveWS._peers) || null;
        // objects (avatar map) pushed via modelStateKeys loop below
        _self.viewPS.registerEvent('clients',
            snap._peers ? Object.keys(snap._peers).sort() :
            (_livePeers ? [..._livePeers.keys()].sort() : []));
        _self.viewPS.registerEvent('clientJoined', []);
        _self.viewPS.registerEvent('clientLeft',   []);
        var _vTimeToPush = snap.time || 0;
        _self.viewPS.registerEvent('vTime', _vTimeToPush);
        var _appRef = _self.modelPS && _self.modelPS.app;
        _self._effectiveStateKeys.forEach(function(k) {
            // Prefer live model value — snap may be stale if observer fired after model advanced
            var _liveVal = _self._getModelNode(_self.modelPS, k);
            var _val = (_liveVal !== undefined)
                ? _liveVal
                : (snap[k] !== undefined ? _self._resolveSnapVal(_self.modelPS, k, snap[k]) : undefined);
            if (_val !== undefined) {
                _self.viewPS.registerEvent(k, _val);
                // Sync _modelStatePrev baseline so _makeSend detects real future changes
                if (_appRef) {
                    _appRef._modelStatePrev = _appRef._modelStatePrev || {};
                    _appRef._modelStatePrev[k] = _liveVal !== undefined ? _liveVal : _val;
                }
            }
        });
    }

    // _resolveSnapVal — convert a snapshot-serialised value back to the live Map format.
    // Detects format from the live model node: {map:Map} wrapper or bare Map.
    _resolveSnapVal(ps, k, v) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            var _live = this._getModelNode(ps, k);
            if (_live && _live.map instanceof Map) return { map: new Map(Object.entries(v)) };
            if (_live instanceof Map)              return new Map(Object.entries(v));
        }
        return v;
    }

    // _collectClientIds — recursively collect clientIds from this VM and all descendants.
    // Used by _destroy to synchronously remove ghost avatars from ancestor viewPSs.
    _collectClientIds() {
        return [
            ...(this._clientId ? [this._clientId] : []),
            ...Array.from(this._childrenMap?.values() || []).flatMap(c => c._collectClientIds()),
        ];
    }

    // _destroy — recursively tear down this VM and all its children.
    // Called from children$ reducer when a child is removed from spawned[].
    _destroy() {
        // Collect all clientIds before tearing down — used to update ancestor viewPSs.
        var _deadIds = this._collectClientIds();

        // Recurse first — stop grandchildren before stopping this VM's meta PS
        if (this._childrenMap) {
            this._childrenMap.forEach(function(grandchild) { grandchild._destroy(); });
            this._childrenMap.clear();
        }
        // Send goodbye before marking dead — reflector needs it to broadcast disconnect
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try { this.ws.send(JSON.stringify({ type: 'goodbye' })); } catch(e) {}
        }
        // Proactively remove dead clientIds from the immediate parent's model/viewPS
        // so avatar ghosts disappear immediately without waiting for the reflector round-trip.
        if (_deadIds.length && this._parent) {
            var _par = this._parent;
            var _parModelApp = _par.modelPS && _par.modelPS.app;
            if (_parModelApp && !_parModelApp._dead) {
                var _wss = _par._getModelNode(_par.modelPS, 'worldState');
                if (_wss) {
                    // Update peer registry
                    if (_wss._peers instanceof Map)
                        _deadIds.forEach(function(id) { _wss._peers.delete(id); });
                    if (_par.viewPS) {
                        var _peersNow = _wss._peers instanceof Map ? _wss._peers : new Map();
                        _par.viewPS.registerEvent('clients',    [..._peersNow.keys()].sort());
                        _par.viewPS.registerEvent('clientLeft', _deadIds);
                        // Mutate the app-level avatar Map in-place and push so the renderer
                        // removes ghost avatars immediately without waiting for reflector round-trip.
                        var _appObjs = _par._getModelNode(_par.modelPS, 'objects');
                        if (_appObjs && _appObjs.map instanceof Map) {
                            _deadIds.forEach(function(id) { _appObjs.map.delete(id); });
                            _par.viewPS.registerEvent('objects', { map: _appObjs.map });
                            if (_parModelApp._modelStatePrev)
                                _parModelApp._modelStatePrev['objects'] = { map: _appObjs.map };
                        }
                    }
                }
            }
        }
        // Mark model dead — blocks send() and injectModelMessage() immediately
        if (this.modelPS && this.modelPS.app) this.modelPS.app._dead = true;
        // Close WS
        if (this.ws) { try { this.ws.close(); } catch(e) {} this.ws = null; }
        // Stop PS layers (meta PS RAF loop; model PS has once:true so stop is no-op but harmless)
        try { if (this.ps      && this.ps.stop)      this.ps.stop();      } catch(e) {}
        try { if (this.viewPS  && this.viewPS.stop)  this.viewPS.stop();  } catch(e) {}
        try { if (this.modelPS && this.modelPS.stop) this.modelPS.stop(); } catch(e) {}
        // Clear futures
        try { if (this.modelPS && this.modelPS.app && this.modelPS.app._pendingFutures) this.modelPS.app._pendingFutures.length = 0; } catch(e) {}
        try {
            var _ws = this.modelPS && this._getModelNode(this.modelPS, 'worldState');
            if (_ws && _ws.queue) _ws.queue.length = 0;
        } catch(e) {}
    }

    // _children — Map of windowName → child VM (managed by children$ reducer)
    // Accessible so view nodes can look up child VMs by portalId
    get _children() {
        // Return the current children map from the meta PS if available
        return this._childrenMap || new Map();
    }

    // _spawnChild — create, configure and start one child VM for a spawned entry.
    // Returns { name, child } on success, null if depth limit reached.
    _spawnChild(entry) {
        const windowName   = (entry && typeof entry === 'object') ? entry.windowName : entry;
        const targetSeloId = (entry && typeof entry === 'object') ? entry.seloId    : entry;
        const _appName     = (entry && typeof entry === 'object') ? entry.appName   : null;
        const _entryDepth  = (entry && typeof entry === 'object' && entry.maxDepth != null)
                             ? entry.maxDepth : null;
        const appDef = _appName && _appResolver
            ? (_appResolver(_appName + ':') || {}).appDef || null : null;

        // Handle seloId change (via _joinWindow): destroy stale child first
        if (this._childrenMap && this._childrenMap.has(windowName)) {
            const existing = this._childrenMap.get(windowName);
            if (existing && existing.seloId !== targetSeloId) {
                existing._destroy();
                this._childrenMap.delete(windowName);
                if (this.onClose) this.onClose({ name: windowName });
            } else {
                return null; // already exists, no-op
            }
        }

        if (this.depth + 1 > this.maxDepth) {
            console.warn('[VM] max depth reached (' + this.maxDepth + '), not spawning:', windowName);
            return null;
        }
        console.log('[children$] spawning:', windowName, '→ seloId:', targetSeloId, 'depth:', this.depth + 1);

        const _childMaxDepth = _entryDepth != null ? _entryDepth : this.maxDepth;
        const _childWsUrl = (entry && typeof entry === 'object' && entry.wsUrl) ? entry.wsUrl : this.wsUrl;
        const child = new KrestianstvoVM({ wsUrl: _childWsUrl, seloId: targetSeloId, depth: this.depth + 1, maxDepth: _childMaxDepth });
        child._parent = this;
        child.modelStateKeys = this.modelStateKeys || [];
        child.onClose = this.onClose;

        if (entry && typeof entry === 'object' && entry.isPortal) {
            child._isPortal   = true;
            child._windowName = windowName;
            if (entry.linkId)   child._linkId   = entry.linkId;
            if (entry.portalId) child._portalId = entry.portalId;
            child._portalAlreadyPaired = !!entry.alreadyPaired;
        }

        const _parent    = this;
        const _spawnName  = windowName;
        const _spawnDepth = this.depth + 1;
        child._onJoinedCallback = function() {
            if (typeof _parent._registerChildVM === 'function') _parent._registerChildVM(child);
            if (typeof _parent.onSpawn === 'function') _parent.onSpawn({ name: _spawnName, vm: child, depth: _spawnDepth });
        };

        var _compiled = null;
        var _useApp   = !!(appDef && appDef.app && _krestianify);
        if (_useApp) {
            try { _compiled = _krestianify(appDef.app, appDef.modelNodes || []); }
            catch(e) { console.error('[_spawnChild] appDef compile failed:', e); _useApp = false; }
        }
        if (_useApp && _compiled) {
            child.modelStateKeys  = _compiled.modelStateKeys;
            child.viewEchoExclude = _compiled.viewToModel;
        } else {
            child.modelStateKeys  = (_parent.modelStateKeys || []).slice();
            child.viewEchoExclude = _parent.viewEchoExclude || new Set();
        }
        if (_parent.viewAppExtra && _parent.viewAppExtra.resolveApp) {
            child.viewAppExtra = Object.assign(child.viewAppExtra || {}, {
                resolveApp: _parent.viewAppExtra.resolveApp,
            });
        }
        child._inheritedPrograms = {
            modelProgram:    _useApp ? _compiled.modelProgram : (_parent._modelProgram || ''),
            viewProgram:     _useApp ? (appDef.viewProgram || _compiled.viewProgram) : (_parent._viewProgram || ''),
            applyAction:     _useApp ? (appDef.applyAction || _compiled.applyAction || '') : (_parent._applyAction || ''),
            modelStateKeys:  child.modelStateKeys.slice(),
            viewEchoExclude: child.viewEchoExclude,
            buildUI:         (_useApp && appDef.buildUI) ? appDef.buildUI
                             : (_parent.viewAppExtra && _parent.viewAppExtra._buildUI || null),
        };
        child.start({});
        return { name: windowName, child };
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
        this._effectiveStateKeys.forEach(k => {
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
        // Convert Map fields to plain objects for JSON serialization
        if (payload._peers instanceof Map) payload._peers = Object.fromEntries(payload._peers);
        this._effectiveStateKeys.forEach(function(k) {
            if (payload[k] instanceof Map) { payload[k] = Object.fromEntries(payload[k]); }
            else if (payload[k] && payload[k].map instanceof Map) { payload[k] = Object.fromEntries(payload[k].map); }
        });
        console.log('[SNAP SEND] t=' + wss.time + ' counter=' + payload.counter);
        this.ws.send(JSON.stringify({ type: 'snapshot_response', targetUser: targetUser, payload: payload }));
    }

    // ── _makeSend ──────────────────────────────────────────────────────────
    _makeSend(psRef) {
        return function(ev) {
            if (psRef._dead) return;
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

            // Flush any futures scheduled during FRP (e.g. from Behaviors.collect
            // accumulators calling future()). drain already ran so _pendingFutures were
            // not spliced in — do it now by injecting them into the worldState queue.
            // Then loop: if any flushed futures are ready (serverTime <= current vTime),
            // re-trigger a drain pass by injecting a synthetic same-vTime heartbeat.
            // This implements causality drain for krestianified apps where future() is
            // called from FRP nodes rather than applyAction.
            // IMPORTANT: this loop runs BEFORE modelStateKeys push so viewPS receives
            // the complete final state after all causal chain steps are processed.
            var _causalT = t;
            var _causalIter = 0;
            var _causalMax  = 300;
            while (_causalIter++ < _causalMax) {
                if (!psRef._pendingFutures || !psRef._pendingFutures.length) break;
                var _frpFutures = psRef._pendingFutures.splice(0);
                var _wsNode = (psRef._ps.resolved && psRef._ps.resolved.get('worldState'))
                           || (psRef._ps.scratch  && psRef._ps.scratch.get('worldState'));
                if (!_wsNode || !_wsNode.value) break;
                _wsNode.value.queue = (_wsNode.value.queue || []).concat(_frpFutures);
                // Check if any flushed futures are within the current causality window
                var _hasReady = _wsNode.value.queue.some(function(m) { return m.serverTime <= _causalT; });
                if (!_hasReady) break;
                // Inject synthetic heartbeat at same vTime to re-trigger worldState drain
                // without advancing virtual time. _enqueue spreads state (new ref) even when
                // time is unchanged, which fires Events.change($worldState) → _drain recurses.
                psRef._ps.registerEvent('_raw', { type: 'heartbeat', vTime: _causalT });
                psRef._ps.evaluate(_causalT);
                psRef._ps.evaluate(_causalT);
                psRef._ps.evaluate(_causalT);
            }

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

            // Push FRP 'spawned' model node to metaPS when it changes.
            // Supports pure-FRP apps where applyAction is a passthrough and spawned
            // is managed entirely by a Behaviors.select model node.
            if (psRef.metaPS) {
                var _spNode = (psRef._ps.resolved && psRef._ps.resolved.get('spawned'))
                           || (psRef._ps.scratch  && psRef._ps.scratch.get('spawned'));
                var _spVal = _spNode && _spNode.value;
                if (Array.isArray(_spVal) && _spVal !== _before['spawned']) {
                    psRef.metaPS.registerEvent('_spawned', _spVal.slice());
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
        // Always a Map — applyAction uses .get()/.set()/.delete()
        // if (!initialObjects || initialObjects instanceof Map) {
        //     initialObjects = initialObjects || new Map();
        // } else {
        //     initialObjects = new Map(Object.entries(initialObjects));
        // }
        initialObjects = initialObjects || {};
        initialState   = initialState   || {};
        var self = this;
        var appRef = {
            viewPS:           this.viewPS,
            metaPS:           this.ps,
            vm:               this,    // KrestianstvoVM — accessible as app.vm in applyAction
            _ps:              null,
            ws:               this.ws,
            initialObjects:   initialObjects,
            initialState:     initialState,
            initialTime:      initialTime,
            modelStateKeys:   this._effectiveStateKeys,
            viewEchoExclude:  this.viewEchoExclude || new Set(),
            _modelStatePrev: (function(keys, init) {
                var p = {};
                keys.forEach(function(k) { if (init[k] !== undefined) p[k] = init[k]; });
                return p;
            })(this._effectiveStateKeys, initialState),
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

    // ── injectModelMessage ───────────────────────────────────────────────
    // Cross-world model-to-model message without reflector round-trip.
    // Called by another VM's applyAction (via portal object) to inject a
    // message directly into this VM's model queue at this VM's current vTime.
    //
    // Correct Croquet multi-world architecture:
    //   World:1 model (deterministic) → calls vm2.injectModelMessage(...)
    //   → message enters vm2's queue at vm2's vTime
    //   → vm2's next drain processes it deterministically
    //   → vm2's VIEW applies result to all vm2 peers
    //
    // Every peer running world:1 produces the same call → every peer's vm2
    // processes the same message → no reflector needed, no network round-trip.
    //
    // @param type  — message type string (handled by target VM's applyAction)
    // @param data  — message data object
    // @param fromSelo — source selo id (for tracing)
    injectModelMessage(type, data, fromSelo) {
        if (!this.modelPS || (this.modelPS.app && this.modelPS.app._dead)) return;

        // Get target VM's current vTime for deterministic scheduling
        const _wss    = this._getModelNode(this.modelPS, 'worldState');
        const _vTime  = (_wss && _wss.time) || 0;
        // Wrap as client_msg — same envelope that _vm_enqueue processes from WS stream.
        // _enqueue extracts .data and queues at .serverTime for deterministic drain.
        const _clientMsg = {
            type:       'client_msg',
            data: {
                type:       type,
                data:       data || {},
                from:       fromSelo || 'portal',
                serverTime: _vTime,
                _future:    false,
                _injected:  true,
            },
            vTime: _vTime,
        };
        // Feed into _raw — same path as WS stream, goes through _enqueue → worldState
        this.modelPS.registerEvent('_raw', _clientMsg);
    }

    // ── _restoreModelSelo ─────────────────────────────────────────────────
    _restoreModelSelo(snap) {
        console.log('📸 restoreModelSelo t=', snap.time, 'peers:', Object.keys(snap._peers || {}));
        var peers = snap._peers;
        var rest  = Object.assign({}, snap);
        delete rest.time; delete rest._peers;
        return this._createModelSelo(snap.time, peers, rest);
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
