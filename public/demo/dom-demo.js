// dom-demo.js — Krestianstvo - Renkon | SDK 4 vm
// Full UI demo: avatars, portal bar, draggable child windows, sub-tick counter.
// Works with krestianstvo-vm.js + krestianstvo-ui.js.
//
// All UI setup — including buildUI (title strip), onSpawn, onClose, space key,
// mouse/touch routing — lives in VIEW_PROGRAM as Renkon nodes.
// This means the full app travels in the snapshot and selo.html
// can boot it without any app-specific JS.

// ── APPLY_ACTION ─────────────────────────────────────────────────────────
export const APPLY_ACTION = `
    if (msg.type === 'tick') {
        if (state.ticking) {
            future(state.time, 1000, 'tick', {});
            for (var _i = 1; _i <= 9; _i++) future(state.time, _i * 100, 'subTick', { step: _i });
        }
        return Object.assign({}, state, { randomResult: random() });
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
        var _appName = (msg.data && msg.data.appName) || null;
        // seloId: use explicit value from view (user typed a name) or generate deterministically
        var _seloId = (msg.data && msg.data.seloId) || uid(_appName || 'child');
        // windowName: unique DOM key per window, always generated deterministically
        var _windowName = uid('w') + '-' + _seloId;
        var _spawned = (state.spawned || []).slice();
        var _maxDepth = (msg.data && msg.data.maxDepth != null) ? msg.data.maxDepth : null;
        _spawned.push({ windowName: _windowName, seloId: _seloId, appName: _appName, maxDepth: _maxDepth });
        return Object.assign({}, state, { portal: '', spawned: _spawned });
    }
    if (msg.type === '_moveWindow') {
        var _name = msg.data && msg.data.name;
        var _wx = msg.data && msg.data.x;
        var _wy = msg.data && msg.data.y;
        if (!_name) return state;
        var _wins = Object.assign({}, state.windows || {});
        _wins[_name] = Object.assign({}, _wins[_name] || {}, { x: _wx, y: _wy });
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_resizeWindow') {
        var _name = msg.data && msg.data.name;
        var _ww = msg.data && msg.data.w;
        var _wh = msg.data && msg.data.h;
        if (!_name) return state;
        var _wins = Object.assign({}, state.windows || {});
        _wins[_name] = Object.assign({}, _wins[_name] || {}, { w: _ww, h: _wh });
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_closeWindow') {
        var _name = msg.data && msg.data.name;
        if (!_name) return state;
        var _sp = (state.spawned || []).filter(function(n) {
            var wn = (n && typeof n === 'object') ? n.windowName : n;
            return wn !== _name;
        });
        var _wins = Object.assign({}, state.windows || {});
        delete _wins[_name];
        return Object.assign({}, state, { spawned: _sp, windows: _wins });
    }
`;

// ── MODEL_PROGRAM ─────────────────────────────────────────────────────────
export const MODEL_PROGRAM = `
const ticking      = Behaviors.collect((_initialState && _initialState.ticking)      || false, Events.change($worldState), (_, s) => s ? s.ticking      : false);
const windows      = Behaviors.collect((_initialState && _initialState.windows)      || {},    Events.change($worldState), (_, s) => s ? s.windows      : {});
const randomResult = Behaviors.collect((_initialState && _initialState.randomResult) || null,  Events.change($worldState), (_, s) => s ? s.randomResult : null);

const tick       = Events.receiver();
const subTick    = Events.receiver();
const counter    = Behaviors.collect(_initialState.counter    || 0, tick,    function(prev, _) { return prev + 1; });
const subCounter = Behaviors.collect(_initialState.subCounter || 0, subTick, function(prev, _) { return prev + 1; });
`;

// ── VIEW_PROGRAM ──────────────────────────────────────────────────────────
// Self-contained — no imports, no external calls.
// Reads from VIEW_PREAMBLE: rootEl, UI, objects, vTime, clientIdentity, myObject,
//   clients, clientJoined, clientLeft
// Reads from Renkon.app: ws, depth
//
// Fully portable: travels in the snapshot payload.
// selo.html boots this identically to krestianify-demo.html.
export const VIEW_PROGRAM = `

// ── Model state receivers ─────────────────────────────────────────────────
// These receive values pushed by VM after each model drain (via modelStateKeys).
const ticking      = Behaviors.collect(false, Events.receiver(), function(_,v){return v||false;});
const windows      = Behaviors.collect({},    Events.receiver(), function(_,v){return v||{};});
const randomResult = Behaviors.collect(null,  Events.receiver(), function(_,v){return v;});
const counter      = Behaviors.collect(0,     Events.receiver(), function(_,v){return v||0;});
const subCounter   = Behaviors.collect(0,     Events.receiver(), function(_,v){return v||0;});
const setPortal    = Events.receiver();
// tick/subTick pushed by VM but not used directly in view — counter/subCounter carry the values

// ── buildUI — create title strip once ────────────────────────────────────
// Runs once: when rootEl is available and title strip not yet present.
// Creates .vm-clock, .vm-peers, .vm-queue so the renderer can update them.
const _buildUI = Behaviors.collect(false, Events.timer(50), function(done, _) {
    if (done) return true;
    var rEl = rootEl;
    if (!rEl || rEl.querySelector('.vm-clock')) return true;
    // Inject avatar + vm CSS so blank-joiner gets styles without a <style> block
    if (UI && UI.injectStyles) UI.injectStyles();
    var strip = document.createElement('div');
    strip.style.cssText =
        'position:absolute;top:0;left:0;right:0;height:22px;' +
        'background:#e8e8f4;border-bottom:1px solid #ccd;' +
        'display:flex;align-items:center;padding:0 6px;gap:4px;' +
        'font-size:11px;font-family:monospace;color:#446;z-index:5;user-select:none;';
    var lbl = document.createElement('b');
    lbl.className = 'vm-label';
    lbl.textContent = Renkon.app.seloId || '';
    lbl.style.cssText = 'flex:0 0 auto;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    var stats = document.createElement('span');
    stats.style.cssText = 'margin-left:auto;font-size:10px;font-weight:normal;color:#888;white-space:nowrap;';
    stats.innerHTML = 'T:<span class="vm-clock">0</span> P:<span class="vm-peers">0</span> <span class="vm-queue"></span>';
    strip.appendChild(lbl);
    strip.appendChild(stats);
    rEl.appendChild(strip);
    // Don't touch rEl.style.cssText — host page CSS handles layout.
    // Just ensure it's focusable.
    if (!rEl.getAttribute('tabindex')) rEl.setAttribute('tabindex', '-1');
    return true;
});

// ── onSpawn wiring — set up child VM portal windows ───────────────────────
// Renkon.app.vm is the KrestianstvoVM instance.
// We set vm.onSpawn once so child VMs get portal containers.
const _spawnWired = Behaviors.collect(false, Events.timer(50), function(done, _) {
    if (done) return true;
    var vm = Renkon.app.vm;
    var app = Renkon.app;
    if (!vm || !UI) return false;

    function makeSpawnHandler(parentEl, parentVM) {
        return function(opts) {
            var windowName = opts.name;          // unique key for this window
            var childVM    = opts.vm;
            var targetSeloId = childVM.seloId;   // actual seloId the child connected to
            if (parentEl.querySelector('[data-selo-id="' + windowName + '"]')) return;
            var ws = parentVM.ws;
            // createSeloContainer uses windowName as data-selo-id (unique DOM key)
            // but shows targetSeloId as the label and cinp default value
            var result = UI.createSeloContainer(windowName, parentEl, {
                onMove: function(n, x, y) {
                    if (ws && ws.readyState === WebSocket.OPEN)
                        ws.send(JSON.stringify({ type: '_moveWindow', data: { name: n, x: x, y: y } }));
                },
                onResize: function(n, w, h) {
                    if (ws && ws.readyState === WebSocket.OPEN)
                        ws.send(JSON.stringify({ type: '_resizeWindow', data: { name: n, w: w, h: h } }));
                },
                onClose: function(n) {
                    if (ws && ws.readyState === WebSocket.OPEN)
                        ws.send(JSON.stringify({ type: '_closeWindow', data: { name: n } }));
                },
            });
            var el   = result.el;
            var cinp = result.cinp;
            var cbtn = result.cbtn;

            // Show the actual seloId in the label and join input, not the window name
            var lbl0 = el.querySelector('.vm-label');
            if (lbl0) lbl0.textContent = targetSeloId;
            cinp.value = targetSeloId;

            var savedPos = parentVM.viewPS && parentVM.viewPS.app &&
                           parentVM.viewPS.app.windowPositions &&
                           parentVM.viewPS.app.windowPositions[windowName];
            if (savedPos) {
                if (savedPos.x != null) el.style.left = savedPos.x + 'px';
                if (savedPos.y != null) el.style.top  = savedPos.y + 'px';
                if (savedPos.w != null) el.style.width  = savedPos.w + 'px';
                if (savedPos.h != null) el.style.height = savedPos.h + 'px';
            }

            if (childVM.viewPS && childVM.viewPS.app) {
                childVM.viewPS.app.rootEl = el;
                childVM.viewPS.app.UI     = UI;
            }
            childVM.viewAppExtra = Object.assign(childVM.viewAppExtra || {}, {
                rootEl: el, UI: UI,
            });

            el.addEventListener('mouseenter', function() { app._activeWS = childVM.ws; });
            el.addEventListener('mousedown',  function(e) {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
                app._activeWS = childVM.ws;
            });

            childVM.onSeloJoined = function(info) {
                var lbl = el.querySelector('.vm-label');
                if (lbl) lbl.textContent = info.seloId;
                cinp.value = info.seloId;
            };

            childVM.onSpawn = makeSpawnHandler(el, childVM);
            childVM.onClose = function(closeOpts) {
                var childEl = el.querySelector('[data-selo-id="' + closeOpts.name + '"]');
                if (childEl) { if (childEl._destroyDrag) childEl._destroyDrag(); childEl.remove(); }
            };

            // Join button — re-joins this child VM to a different seloId
            cbtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var newSeloId = cinp.value.trim();
                if (!newSeloId) return;
                if (childVM.ws && childVM.ws.readyState === WebSocket.OPEN)
                    childVM.ws.send(JSON.stringify({ type: 'join_selo', seloId: newSeloId }));
            });

            // Portal bar inside child window — spawn grandchildren
            el._onSpawnSelo = function(inputVal) {
                var parsed = _parsePortalInput(inputVal);
                if (childVM.ws && childVM.ws.readyState === WebSocket.OPEN)
                    childVM.ws.send(JSON.stringify({ type: 'spawnSelo', data: { seloId: parsed.seloId, appName: parsed.appName || null, maxDepth: parsed.maxDepth } }));
            };
        };
    }

    vm.onSpawn = makeSpawnHandler(app.rootEl, vm);
    vm.onClose = function(opts) {
        var childEl = (app.rootEl) && app.rootEl.querySelector('[data-selo-id="' + opts.name + '"]');
        if (childEl) { if (childEl._destroyDrag) childEl._destroyDrag(); childEl.remove(); }
    };

    // Space key → toggleTick on active VM
    if (!window._krestiansvoSpaceInstalled) {
        window._krestiansvoSpaceInstalled = true;
        document.addEventListener('keydown', function(e) {
            if (e.code !== 'Space' || e.repeat) return;
            e.preventDefault();
            var aws = window._krestiansvoActiveWS;
            if (aws && aws.readyState === WebSocket.OPEN)
                aws.send(JSON.stringify({ type: 'toggleTick', data: {} }));
        });
    }

    // Mouse/touch tracking — route to correct VM on enter/click
    var rEl = app.rootEl;
    if (rEl) {
        rEl.addEventListener('mouseenter',  function() { window._krestiansvoActiveWS = app.ws; });
        rEl.addEventListener('mousedown',   function() { window._krestiansvoActiveWS = app.ws; });
        rEl.addEventListener('touchstart',  function() { window._krestiansvoActiveWS = app.ws; }, { passive: true });
    }
    app._activeWS = app.ws;

    return true;
});

// ── Input / move events ───────────────────────────────────────────────────
function _clickHandler(e) {
    var rEl = Renkon.app && Renkon.app.rootEl;
    if (!rEl || !rEl.contains(e.target)) return undefined;
    var hit = e.target.closest('[data-selo-id]');
    if (hit && hit !== rEl) return undefined;
    // Don't steal focus from INPUT or BUTTON elements (e.g. portal bar)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return undefined;
    rEl.focus({ preventScroll: true });
    var rect = rEl.getBoundingClientRect();
    var cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    var cy = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    return { x: Math.round(cx - rect.left), y: Math.round(cy - rect.top) };
}
const _clickDoc = Events.or(
    Events.listener(document, 'click',      _clickHandler),
    Events.listener(document, 'touchstart', _clickHandler)
);
const _moveDoc = Events.or(
    Events.listener(document, 'mousemove', _clickHandler),
    Events.listener(document, 'touchmove', _clickHandler)
);
const _timerMove  = Events.timer(100);
const _mouseCoords = {t: _timerMove, e: _moveDoc};
const _sendMove = Behaviors.collect(null, Events.or(_mouseCoords, _clickDoc), function(_, pos) {
    if (!pos) return null;
    var ws = Renkon.app.ws;
    if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: '_move', data: pos.e }));
    return null;
});

// ── _parsePortalInput — interpret portal bar input ───────────────────────
// ''        → spawn new child with auto-generated name
// 'new:foo' → spawn new child named 'foo' (fresh empty selo)
// 'foo'     → open portal window connecting to existing selo 'foo'
function _parsePortalInput(inputVal) {
    var v = (inputVal || '').trim();
    if (!v) return { seloId: '', appName: null, maxDepth: null };
    // Parse trailing options: "balls:1:d=5" → d=5 sets maxDepth
    var maxDepth = null;
    var _dIdx = v.lastIndexOf(':d='); if (_dIdx >= 0) { var _dVal = v.slice(_dIdx + 3); if (_dVal && !isNaN(parseInt(_dVal, 10))) { maxDepth = parseInt(_dVal, 10); v = v.slice(0, _dIdx).trim(); } }
    var resolve = Renkon.app && Renkon.app.resolveApp;
    if (resolve) {
        var r = resolve(v);
        if (r && r.appDef) {
            var hasName = r.seloId && r.seloId.length > 0;
            var fullSeloId = hasName ? v : '';
            return { seloId: fullSeloId, appName: r.appName, maxDepth: maxDepth };
        }
    }
    if (v.indexOf('new:') === 0) {
        return { seloId: v.slice(4).trim(), appName: null, maxDepth: maxDepth };
    }
    return { seloId: v, appName: null, maxDepth: maxDepth };
}

// ── portalText — synced portal input value ────────────────────────────────
const portalText = Behaviors.collect('', setPortal,
    function(_, ev) { return (ev && typeof ev === 'object') ? (ev.value || '') : (ev || ''); });

// ── renderer — 60hz DOM update ────────────────────────────────────────────
const renderTick = Events.timer(16);
const renderer = Behaviors.collect(null, renderTick, function(_, __) {
    var rEl  = rootEl;
    if (!rEl || !UI) return null;
    var objs    = objects || {};

    var cnt     = counter    || 0;
    var sub     = subCounter || 0;
    var running = (ticking === true);
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
        onSubmit: atMax ? null : function(inputVal) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            var parsed = _parsePortalInput(inputVal);
            ws.send(JSON.stringify({ type: 'spawnSelo', data: { seloId: parsed.seloId, appName: parsed.appName || null, maxDepth: parsed.maxDepth } }));
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
        el.style.opacity      = '0.90';
        el.style.fontWeight   = id === myId ? 'bold' : 'normal';
        el.style.boxShadow    = id === myId
            ? '0 0 0 2px rgba(255,255,255,0.9),0 0 0 4px ' + (obj.color || '#8899bb') : 'none';
        el.textContent = 'T:' + cnt + '\\nS:' + sub;
    });

    return null;
});

// ── _winSync — apply window positions from model ──────────────────────────
const _winSync = Behaviors.collect(null, Events.change($windows), function(_, wins) {
    if (!wins) return null;
    var app = Renkon.app;
    app.windowPositions = wins;
    var rEl = app.rootEl;
    if (rEl) {
        Object.entries(wins).forEach(function(e) {
            var name = e[0], pos = e[1];
            var el = rEl.querySelector('[data-selo-id="' + name + '"]');
            if (el) {
                if (pos.x != null) el.style.left = pos.x + 'px';
                if (pos.y != null) el.style.top  = pos.y + 'px';
                if (pos.w != null) el.style.width  = pos.w + 'px';
                if (pos.h != null) el.style.height = pos.h + 'px';
            }
        });
    }
    return null;
});
`;

// ── installDOMHandlers ────────────────────────────────────────────────────
// Minimal — just injects rootEl + UI into viewAppExtra before boot.
// All DOM setup lives in VIEW_PROGRAM above, so blank-joiner gets it too.
export function installDOMHandlers(vm, rootEl, resolveApp) {
    vm.viewAppExtra = Object.assign(vm.viewAppExtra || {}, {
        rootEl:     rootEl,
        UI:         typeof KrestianstvoUI !== 'undefined' ? KrestianstvoUI : null,
        resolveApp: resolveApp || null,
    });
}
