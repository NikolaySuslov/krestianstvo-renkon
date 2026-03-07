// dom-demo.js — Krestianstvo - Renkon | SDK 4 vm
// Full UI demo: avatars, portal bar, draggable child windows, sub-tick counter.
// Works with krestianstvo-vm.js (untouched) + krestianstvo-ui.js.

// ── APPLY_ACTION ─────────────────────────────────────────────────────────
// Pure state-machine body — runs inside model PS.
export const APPLY_ACTION = `
    if (msg.type === 'tick') {
        if (state.ticking) {
            future(state.time, 1000, 'tick', {});
            for (var _i = 1; _i <= 9; _i++) future(state.time, _i * 100, 'subTick', { step: _i });
        }
    
        let r = random();
        return Object.assign({}, state, { randomResult: r });
    }
    if (msg.type === 'toggleTick') {
        var _nowTicking = !state.ticking;
        if (_nowTicking) {
            future(state.time, 1000, 'tick', {});
            for (var _i = 1; _i <= 9; _i++) future(state.time, _i * 100, 'subTick', { step: _i });
        }
        return Object.assign({}, state, { ticking: _nowTicking });
    }
    if (msg.type === '_move') {
        var _from = msg.from;
        var _x = msg.data && msg.data.x;
        var _y = msg.data && msg.data.y;
        if (!_from || _x === undefined) return state;
        var _objs = Object.assign({}, state.objects);
        if (!_objs[_from]) _objs[_from] = {};
        _objs[_from] = Object.assign({}, _objs[_from], { x: _x, y: _y });
        return Object.assign({}, state, { objects: _objs });
    }

    if (msg.type === 'setPortal') {
        return Object.assign({}, state, { portal: (msg.data && msg.data.value) || '' });
    }
    if (msg.type === 'spawnSelo') {
        var _name = (msg.data && msg.data.name) || '';
        if (!_name) return state;
        var _spawned = (state.spawned || []).slice();
        if (_spawned.indexOf(_name) === -1) _spawned.push(_name);
        return Object.assign({}, state, { portal: '', spawned: _spawned });
    }
    if (msg.type === '_moveWindow') {
        var _name = msg.data && msg.data.name;
        var _wx = msg.data && msg.data.x;
        var _wy = msg.data && msg.data.y;
        if (!_name) return state;
        var _wins = Object.assign({}, state.windows || {});
        _wins[_name] = { x: _wx, y: _wy };
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_closeWindow') {
        var _name = msg.data && msg.data.name;
        if (!_name) return state;
        var _sp = (state.spawned || []).filter(function(n) { return n !== _name; });
        var _wins = Object.assign({}, state.windows || {});
        delete _wins[_name];
        return Object.assign({}, state, { spawned: _sp, windows: _wins });
    }
`;

// ── MODEL_PROGRAM ─────────────────────────────────────────────────────────
// Renkon nodes inside model PS. _initialState provided by model preamble.
export const MODEL_PROGRAM = `
const tick       = Events.receiver();
const subTick    = Events.receiver();
const counter    = Behaviors.collect(_initialState.counter    || 0, tick,    function(prev, _) { var n=prev+1; console.log('[MODEL counter]', n); return n; });
const subCounter = Behaviors.collect(_initialState.subCounter || 0, subTick, function(prev, _) { return prev + 1; });

`;

// ── VIEW_PROGRAM ──────────────────────────────────────────────────────────
// Renkon nodes inside view PS.
// Preamble provides: objects, vTime, clientIdentity, randomResult, myObject
// Renkon.app provides: ws, depth, rootEl (set pre-start), UI (set pre-start)
// _drain pushes: tick, subTick, toggleTick, setPortal, windowMoved, etc.
export const VIEW_PROGRAM = `
const counter         = Behaviors.collect(0,    Events.receiver(), function(_,v){return v||0;});
const subCounter      = Behaviors.collect(0,    Events.receiver(), function(_,v){return v||0;});

const _clickDoc = Events.listener(document, 'mousemove', function(e) {
    var rEl = Renkon.app.rootEl;
    if (!rEl || !rEl.contains(e.target)) return undefined;
    var hit = e.target.closest('[data-selo-id]');
    if (hit && hit !== rEl) return undefined;
    rEl.focus({ preventScroll: true });
    var rect = rEl.getBoundingClientRect();
    return { x: Math.round(e.clientX - rect.left), y: Math.round(e.clientY - rect.top) };
});

// Throttle mousemove to 10fps — we don't want to flood the model with every pixel of movement.
const _timerMove = Events.timer(100);
const _mouseCoords = {t: _timerMove, e: _clickDoc};

const _sendMove = Behaviors.collect(null, _mouseCoords, function(_, pos) {
    if (!pos) return null;
    var ws = Renkon.app.ws;
    if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: '_move', data: pos.e }));
    return null;
});

const setPortal   = Events.receiver();
const _moveWindow = Events.receiver();


const portalText = Behaviors.collect('', setPortal,
    function(_, ev) { return (ev && typeof ev === 'object') ? (ev.value || '') : (ev || ''); });

const renderTick = Events.timer(16);
const renderer = Behaviors.collect(null, renderTick, function(_, __) {
    var rEl  = Renkon.app.rootEl;
    var UI   = Renkon.app.UI;
    if (!rEl || !UI) return null;

    var objs    = objects || {};
    var cnt     = counter    || 0;
    var sub     = subCounter || 0;
    var running = (_modelTicking === true);
    var myId    = clientIdentity && clientIdentity.clientId;
    var ws      = Renkon.app.ws;
    var depth   = Renkon.app.depth || 0;
    var atMax   = depth >= 4;

    var clockEl = rEl.querySelector('.vm-clock');
    var peersEl = rEl.querySelector('.vm-peers');
    var queueEl = rEl.querySelector('.vm-queue');
    if (clockEl) clockEl.textContent = vTime || 0;
    if (peersEl) peersEl.textContent = Object.keys(objs).length;
    if (queueEl) queueEl.textContent = running ? 'T:' + cnt + ' S:' + sub : 'stopped';

    UI.createPortalBar(rEl, {
        disabled: atMax,
        onInput: atMax ? null : function(value) {
            if (ws && ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'setPortal', data: { value: value } }));
        },
        onSubmit: atMax ? null : function(name) {
            if (!name) return;
            if (ws && ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'spawnSelo', data: { name: name } }));
        },
    });

    var portalBar = rEl.querySelector('.vm-portal-bar');
    var portalInp = portalBar && portalBar.querySelector('input');
    if (portalInp && !atMax && document.activeElement !== portalInp) {
        var pStr = (typeof portalText === 'object' && portalText !== null)
            ? (portalText.value || '') : (portalText || '');
        portalInp.value = pStr;
    }

    var layer = rEl.querySelector('.vm-avatar-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'vm-avatar-layer';
        layer.style.cssText =
            'position:absolute;top:22px;left:0;right:0;bottom:36px;' +
            'pointer-events:none;overflow:hidden;';
        rEl.appendChild(layer);
    }

    layer.querySelectorAll('.avatar').forEach(function(el) {
        if (!objs[el.dataset.clientId]) el.remove();
    });

    Object.keys(objs).forEach(function(id) {
        var obj = objs[id];
        var el = layer.querySelector('[data-client-id="' + id + '"]');
        if (!el) {
            el = document.createElement('div');
            el.className = 'avatar';
            el.dataset.clientId = id;
            layer.appendChild(el);
        }
        el.style.transform   = 'translate3d(' + ((obj.x || 80) - 18) + 'px,' +
                                                 ((obj.y || 80) - 18) + 'px,0)';
        el.style.borderColor  = obj.color || '#8899bb';
        el.style.background   = 'rgba(255,255,255,0.90)';
        el.style.opacity      = '0.80';
        el.style.fontWeight   = id === myId ? 'bold' : 'normal';
        el.style.boxShadow    = id === myId
            ? '0 0 0 2px rgba(255,255,255,0.9),0 0 0 4px ' + (obj.color || '#8899bb') : 'none';
        el.textContent = 'T:' + cnt + ' S:' + sub;
    });

    var wins = Renkon.app.windowPositions || {};
    Object.keys(wins).forEach(function(name) {
        var pos = wins[name];
        var childEl = rEl.querySelector('[data-selo-id="' + name + '"]');
        if (childEl) {
            childEl.style.left = (pos.x || 0) + 'px';
            childEl.style.top  = (pos.y || 0) + 'px';
        }
    });

    return null;
});

const _winSync = Behaviors.collect(null, _moveWindow, function(_, ev) {
    if (!ev || !ev.name) return null;
    var app = Renkon.app;
    app.windowPositions = app.windowPositions || {};
    app.windowPositions[ev.name] = { x: ev.x || 0, y: ev.y || 0 };
    return null;
});
`;

// ── installDOMHandlers ────────────────────────────────────────────────────
// Call BEFORE vm.start() so onViewPSReady fires with rootEl+UI set before
// the first Renkon evaluate().
// One Space keypress → one toggleTick send, routed to whichever VM pane is active.
// Module-level so only ONE listener exists across all panes in the same document.
let _activeWS = null;
let _spaceInstalled = false;
function _ensureSpaceListener() {
    if (_spaceInstalled) return;
    _spaceInstalled = true;
    document.addEventListener('keydown', function(e) {
        if (e.code !== 'Space' || e.repeat) return;
        e.preventDefault();
        if (_activeWS && _activeWS.readyState === WebSocket.OPEN)
            _activeWS.send(JSON.stringify({ type: 'toggleTick', data: {} }));
    });
}

export function installDOMHandlers(vm, rootEl) {
    // Chain onto any existing onViewPSReady
    var prevReady = vm.onViewPSReady;
    vm.onViewPSReady = function(viewPS) {
        if (prevReady) prevReady(viewPS);
        viewPS.app.rootEl = rootEl;
        viewPS.app.UI     = KrestianstvoUI;
    };

    // Track hover/click for Space key routing — plain JS, never inside Renkon sandbox
    rootEl.addEventListener('mouseenter', function() { _activeWS = vm.ws; });
    rootEl.addEventListener('mousedown',  function() { _activeWS = vm.ws; });
    _ensureSpaceListener();

    // Title strip with stats + join controls
    if (!rootEl.querySelector('.vm-clock')) {
        var strip = document.createElement('div');
        strip.style.cssText =
            'position:absolute;top:0;left:0;right:0;height:22px;' +
            'background:#e8e8f4;border-bottom:1px solid #ccd;' +
            'display:flex;align-items:center;padding:0 6px;gap:4px;' +
            'font-size:11px;font-family:monospace;color:#446;z-index:5;user-select:none;';

        var lbl = document.createElement('b');
        lbl.className = 'vm-label';
        lbl.textContent = vm.seloId || 'main';
        lbl.style.cssText = 'flex:0 0 auto;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

        var stats = document.createElement('span');
        stats.style.cssText = 'margin-left:auto;font-size:10px;font-weight:normal;color:#888;white-space:nowrap;';
        stats.innerHTML = 'T:<span class="vm-clock">0</span> P:<span class="vm-peers">0</span> <span class="vm-queue"></span>';

        var cinp = document.createElement('input');
        cinp.value = vm.seloId || 'main';
        cinp.style.cssText =
            'width:60px;padding:1px 3px;background:#f7f7f7;color:#333;' +
            'border:1px solid #bbb;border-radius:3px;font-size:10px;font-family:monospace;flex:0 0 auto;';
        cinp.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        cinp.addEventListener('keydown',   function(e) { e.stopPropagation(); });

        var cbtn = document.createElement('button');
        cbtn.textContent = 'Join';
        cbtn.style.cssText =
            'padding:1px 5px;background:#eef;color:#446;' +
            'border:1px solid #aac;border-radius:3px;font-size:10px;cursor:pointer;flex:0 0 auto;';
        cbtn.addEventListener('mousedown', function(e) { e.stopPropagation(); });
        cbtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var id = cinp.value.trim();
            if (id && vm.ws && vm.ws.readyState === WebSocket.OPEN)
                vm.ws.send(JSON.stringify({ type: 'join_selo', seloId: id }));
        });

        strip.appendChild(lbl);
        strip.appendChild(cinp);
        strip.appendChild(cbtn);
        strip.appendChild(stats);
        rootEl.appendChild(strip);
    }

    // onSpawn fires from vm2._diffChildren AFTER the child VM is created & started.
    // We can't use onViewPSReady for child VMs here — instead we directly set
    // viewPS.app.rootEl and .UI immediately (the child's viewPS already exists).
    function makeSpawnHandler(parentEl, parentVM) {
        return function(opts) {
            var name    = opts.name;
            var childVM = opts.vm;
            if (parentEl.querySelector('[data-selo-id="' + name + '"]')) return;

            var ws = parentVM.ws;
            var result = KrestianstvoUI.createSeloContainer(name, parentEl, {
                onMove: function(n, x, y) {
                    if (ws && ws.readyState === WebSocket.OPEN)
                        ws.send(JSON.stringify({ type: '_moveWindow', data: { name: n, x: x, y: y } }));
                },
                onClose: function(n) {
                    if (ws && ws.readyState === WebSocket.OPEN)
                        ws.send(JSON.stringify({ type: '_closeWindow', data: { name: n } }));
                },
            });
            var el   = result.el;
            var cinp = result.cinp;
            var cbtn = result.cbtn;

            if (childVM.viewPS && childVM.viewPS.app) {
                childVM.viewPS.app.rootEl = el;
                childVM.viewPS.app.UI     = KrestianstvoUI;
            }

            // Route Space key to this child VM when its window is active
            el.addEventListener('mouseenter', function() { _activeWS = childVM.ws; });
            el.addEventListener('mousedown',  function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                _activeWS = childVM.ws;
            });

            childVM.onSeloJoined = function(info) {
                var lbl = el.querySelector('.vm-label');
                if (lbl) lbl.textContent = info.seloId || name;
            };

            // Recurse — grandchildren spawn inside el, routed via childVM.ws
            childVM.onSpawn = makeSpawnHandler(el, childVM);

            childVM.onClose = function(closeOpts) {
                var childEl = el.querySelector('[data-selo-id="' + closeOpts.name + '"]');
                if (childEl) childEl.remove();
            };

            cbtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var id = cinp.value.trim() || name;
                if (childVM.ws && childVM.ws.readyState === WebSocket.OPEN)
                    childVM.ws.send(JSON.stringify({ type: 'join_selo', seloId: id }));
            });
        };
    }

    vm.onSpawn = makeSpawnHandler(rootEl, vm);
    // onClose: child removed from spawned[] in model
    vm.onClose = function(opts) {
        var childEl = rootEl.querySelector('[data-selo-id="' + opts.name + '"]');
        if (childEl) childEl.remove();
    };
}
