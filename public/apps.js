// apps.js — Krestianstvo app registry
//
// Collection of pure krestianified applications.
// Each app defines: app (Renkon program string), modelNodes, buildUI.
//
// Portal input syntax:
//   "balls:1"        → spawn new selo "1" with balls app
//   "balls:"         → spawn new solo with auto-generated name, balls app
//   "counter-timer:x"→ spawn new selo "x" with counter-timer app
//   "1"              → connect portal to existing selo "1" (blank-joiner)
//   "new:foo"        → spawn new child "foo" with parent app
//   empty            → spawn new child with parent app, auto name

export const APPS = {};



// ── portalMount(rootEl) ────────────────────────────────────────────────────
// Common buildUI helper. If rootEl is a portal container (has .vm-label),
// creates/finds a .vm-content wrapper below the titleBar and returns it.
// Otherwise returns rootEl unchanged.
// Usage in buildUI:  var mount = portalMount(rootEl);  mount.innerHTML = ...;  return mount;
export function portalMount(rootEl) {
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


// ── balls ─────────────────────────────────────────────
APPS["balls"] = {
    modelNodes: ['balls', '_tick'],
    app: `
// ── MODEL ─────────────────────────────────────────────────────────────────

const _tick = Events.receiver();

const balls = Behaviors.collect([], Events.or(click, _tick), (prev, ev) => {
    if (!ev) return prev;

    // Tick: move, fade, remove if fade <= 0, chain next tick
    if (ev.type === '_tick') {
        var alive = prev.map(function(b) {
            var nx = b.x + b.vx, ny = b.y + b.vy;
            var vx = b.vx, vy = b.vy;
            if (nx - b.r < 0 || nx + b.r > 800) { vx = -vx; nx = b.x + vx; }
            if (ny - b.r < 0 || ny + b.r > 600) { vy = -vy; ny = b.y + vy; }
            return Object.assign({}, b, { x: nx, y: ny, vx: vx, vy: vy, fade: b.fade - 0.033 });
        }).filter(function(b) { return b.fade > 0; });
        if (alive.length > 0) future(now(), 50, '_tick', { type: '_tick' });
        return alive;
    }

    // Click: spawn new ball with fade=1.0
    var id    = Math.floor(random() * 1e9);
    var hue   = Math.floor(random() * 360);
    var r     = 18 + Math.floor(random() * 24);
    var speed = 1.5 + random() * 3.5;
    var angle = random() * Math.PI * 2;
    var vx    = Math.cos(angle) * speed + (random() - 0.5) * 2;
    var vy    = Math.sin(angle) * speed + (random() - 0.5) * 2;
    future(now(), 50, '_tick', { type: '_tick' });
    return prev.concat({ id: id, x: ev.x, y: ev.y, r: r,
        color: 'hsl(' + hue + ',90%,50%)', vx: vx, vy: vy, fade: 1.0 });
});

// ── VIEW ──────────────────────────────────────────────────────────────────

// Inject app-specific styles once — travels in snapshot so portal windows
// get the correct dark background and canvas sizing automatically.
const _injectAppStyles = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var styleId = 'k-balls-styles';
    if (!document.getElementById(styleId)) {
        var s = document.createElement('style');
        s.id = styleId;
        s.textContent =
            '.k-canvas{position:absolute;inset:0;width:100%;height:100%;}' +
            '.k-label{position:absolute;top:4px;left:8px;font-size:11px;' +
            'color:#aef;font-family:monospace;pointer-events:none;z-index:2;}';
        document.head.appendChild(s);
    }
    // Dark background — always set directly on the right element via inline style:
    // If rootEl is .vm-content (inside portal), colour the portal container el.
    // If rootEl is the standalone root, colour it directly.
    // Set background on portal container if inside one, else on rootEl
    var _bg = (rootEl && rootEl.className === 'vm-content') ? rootEl.parentElement : rootEl;
    if (_bg) _bg.style.background = 'rgba(255,255,255,0.15)';
    return true;
});

const _touchTap = Events.listener(rootEl, 'touchstart', (e) => {
    if (e.cancelable) e.preventDefault();
    rootEl._lastTouch = Date.now();
    var rect = rootEl.getBoundingClientRect();
    var t = e.touches[0];
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
});
const _mouseClick = Events.listener(rootEl, 'click', (e) => {
    if (rootEl._lastTouch && Date.now() - rootEl._lastTouch < 500) return null;
    var rect = rootEl.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
});
const click = Events.or(_touchTap, _mouseClick);

// Wall-clock ticker at ~60fps for smooth animation
const _frame = Events.timer(16);

// Draw — view just reads ball.fade directly from model
const _render = Behaviors.collect(null, Events.or(Events.change(balls), _frame), (_, __) => {
    var canvas = rootEl.querySelector('.k-canvas');
    if (!canvas) return null;
    var bs  = balls || [];
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width = canvas.offsetWidth, canvas.height = canvas.offsetHeight);
    bs.forEach(function(b) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, b.fade);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.restore();
    });
    return null;
});`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) { c = document.createElement('div'); c.className = 'vm-content';
                c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c); }
            mount = c;
        }
        mount.innerHTML = '<div class="k-label">' + (label||'') + '</div><canvas class="k-canvas"></canvas>';
        return mount;
    },
};

// ── counter ───────────────────────────────────────────
APPS["counter"] = {
    modelNodes: ['counter', 'change', 'tick'],
    app: `
const tick    = Events.timer(1000);
const change  = Events.or(incr, decr, tick);
const counter = Behaviors.collect(0, change, (prev, ch) => prev + (typeof ch === 'number' ? ch : 1));

const _injectCounterStyles = Behaviors.collect(false, Events.once(vTime), function(done,_){
    if (done) return true;
    var sid = 'k-counter-styles';
    if (!document.getElementById(sid)) {
        var s = document.createElement('style'); s.id = sid;
        s.textContent =
            '.k-counter-root{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;background:rgba(245,245,248,0.80);}' +
            '.k-counter-root #renkon{display:flex;flex-direction:column;align-items:center;gap:16px;}' +
            '.k-counter-root #count{font-size:72px;font-weight:bold;color:#223;letter-spacing:-2px;}' +
            '.k-counter-root #incr,.k-counter-root #decr{font-size:28px;width:60px;height:60px;border-radius:10px;border:2px solid #aab;background:#fff;cursor:pointer;}';
        document.head.appendChild(s);
    }
    if (rootEl) rootEl.classList.add('k-counter-root');
    return true;
});
const incr = Events.listener(rootEl.querySelector("#incr"), "click", (evt) => 1);
const decr = Events.listener(rootEl.querySelector("#decr"), "click", (evt) => -1);

const _render = Behaviors.collect(null, counter, (_, n) => {
    rootEl.querySelector("#count").textContent = n;
    return null;
});`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) { c = document.createElement('div'); c.className = 'vm-content';
                c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c); }
            mount = c;
        }
        mount.innerHTML = '<span style="font-size:11px;color:#889">' + (label||'') + '</span>' +
            '<div id="renkon"><div id="count">0</div>' +
            '<div style="display:flex;gap:12px"><button id="incr">+</button><button id="decr">−</button></div></div>';
        return mount;
    },
};

// ── counter2 — colored circle avatars with counter, spacebar toggles ticking ─
APPS["counter2"] = {
    modelNodes: ['counter', 'subCounter', 'ticking', 'tick', 'subTick'],
    app: `
// ── MODEL ──────────────────────────────────────────────────────────────────
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    toggleTick, function(prev, _) { return !prev; }
);
const tick    = Events.receiver();
const subTick = Events.receiver();
const counter = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    tick, function(prev, _) { return prev + 1; }
);
const subCounter = Behaviors.collect(
    (_initialState && _initialState.subCounter) || 0,
    subTick, function(prev, _) { return prev + 1; }
);
// ── VIEW ───────────────────────────────────────────────────────────────────
const toggleTick = Events.receiver();
// Mouse tracking — sends _move so avatar follows cursor


const _timerMove  = Events.timer(50 * (1 + Math.max(0, (Renkon.app.depth || 0) - 1)));
const _mouseCoords = {t: _timerMove, e: _moveDoc};

const _moveDoc   = Events.or(
    Events.listener(rootEl, 'mousemove',  function(e) { return { x: e.offsetX, y: e.offsetY }; }),
    Events.listener(rootEl, 'touchmove',  function(e) { var t = e.touches[0]; var r = rootEl.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; }, { passive: true })
);
const _sendMove = Behaviors.collect(null, Events.or(_mouseCoords), function(_, pos) {
    if (!pos) return null;
    var ws = Renkon.app.ws;
    if (ws && ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: '_move', data: pos.e }));
    return null;
});
const _spaceKey = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var rEl = rootEl;
    if (!rEl) return false;
    rEl.setAttribute('tabindex', '-1');
    rEl.focus();
    rEl.addEventListener('keydown', function(e) {
        if (e.code !== 'Space' || e.repeat) return;
        e.preventDefault();
        var ws = Renkon.app.ws;
        if (ws && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: 'toggleTick', data: {} }));
    });
    return true;
});
const _renderAvatars = Behaviors.collect(null,
    Events.or(Events.change(counter), Events.change(subCounter), Events.change(ticking),
               Events.change(objects)),
    function(_, __) {
        var rEl = rootEl;
        if (!rEl) return null;
        var myId = clientIdentity && clientIdentity.clientId;
        var objs = objects || new Map();
        var layer = rEl.querySelector('.c2-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'c2-layer';
            layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
            rEl.appendChild(layer);
        }
        // Remove stale
        layer.querySelectorAll('[data-cid]').forEach(function(el) {
            if (!objs.get(el.dataset.cid)) el.remove();
        });
        objs.forEach(function(obj, id) {
            var isMe = id === myId;
            var el = layer.querySelector('[data-cid="' + id + '"]');
            if (!el) {
                el = document.createElement('div');
                el.dataset.cid = id;
                el.style.cssText =
                    'position:absolute;width:44px;height:44px;border-radius:50%;' +
                    'pointer-events:none;display:flex;align-items:center;justify-content:center;';
                // Outer label (counter)
                var olbl = document.createElement('div');
                olbl.className = 'c2-cnt';
                olbl.style.cssText =
                    'position:absolute;top:2px;font-size:10px;font-family:monospace;' +
                    'font-weight:bold;color:#fff;';
                // Inner circle (subCounter)
                var inner = document.createElement('div');
                inner.className = 'c2-inner';
                inner.style.cssText =
                    'width:28px;height:28px;border-radius:50%;margin-top:6px;' +
                    'border:2px solid rgba(255,255,255,0.65);display:flex;' +
                    'align-items:center;justify-content:center;' +
                    'font-size:9px;font-family:monospace;font-weight:bold;color:#fff;';
                el.appendChild(olbl);
                el.appendChild(inner);
                layer.appendChild(el);
            }
            var color = obj.color || '#8899bb';
            el.style.left       = (obj.x || 80) - 22 + 'px';
            el.style.top        = (obj.y || 80) - 22 + 'px';
            el.style.background = color;
            el.style.opacity    = isMe ? '1' : '0.75';
            el.style.boxShadow  = isMe
                ? '0 0 0 3px rgba(255,255,255,0.9),0 0 0 5px ' + color
                : '0 1px 4px rgba(0,0,0,0.2)';
            el.style.transform  = isMe && ticking ? 'scale(1.18)' : 'scale(1)';
            // All avatars show the same shared values
            var olbl = el.querySelector('.c2-cnt');
            var inner = el.querySelector('.c2-inner');
            if (olbl) olbl.textContent = counter || 0;
            if (inner) inner.textContent = subCounter || 0;
        });
        return null;
    }
);
`,
    buildUI: function(rootEl) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) { c = document.createElement('div'); c.className = 'vm-content';
                c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c); }
            mount = c;
        }
        mount.style.cssText = (mount.style.cssText || '') +
            'background:#f5f5f8;cursor:crosshair;outline:none;';
        mount.setAttribute('tabindex', '-1');
        return mount;
    },
    applyAction: `
    if (msg.type === 'tick') {
        if (state.ticking) {
            future(state.time, 1000, 'tick', {});
            Array.from({ length: 9 }, (_, i) => i + 1)
                .forEach(i => future(state.time, i * 100, 'subTick', { step: i }));
        }
        return state;
    }
    if (msg.type === 'toggleTick') {
        var _now = !state.ticking;
        if (_now) {
            future(state.time, 1000, 'tick', {});
            Array.from({ length: 9 }, (_, i) => i + 1)
                .forEach(i => future(state.time, i * 100, 'subTick', { step: i }));
        }
        return Object.assign({}, state, { ticking: _now });
    }
    if (msg.type === '_move') {
        var _from = msg.from;
        var _x = msg.data && msg.data.x;
        var _y = msg.data && msg.data.y;
        if (!_from || _x === undefined) return state;
        var _objs = state.objects || new Map();
        var _e = _objs.get(_from);
        if (_e) { _e.x = _x; _e.y = _y; }
        else { _objs.set(_from, { x: _x, y: _y }); }
        return Object.assign({}, state, { objects: _objs });
    }
    `,
};

// ── color ─────────────────────────────────────────────
APPS["color"] = {
    modelNodes: ['counter', 'color'],
    app: `
const _injectColorStyles = Behaviors.collect(false, Events.once(vTime), function(done,_){
    if (done) return true;
    var sid = 'k-color-styles';
    if (!document.getElementById(sid)) {
        var s = document.createElement('style'); s.id = sid;
        s.textContent =
            '.k-color-root{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:24px;background:rgba(245,245,248,0.80);}' +
            '.k-counter{font-size:64px;font-weight:bold;color:#223;letter-spacing:-2px;user-select:none;}' +
            '.k-colorbox{width:180px;height:180px;border-radius:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:rgba(255,255,255,0.85);text-shadow:0 1px 3px rgba(0,0,0,0.4);background:#ccc;transition:transform 0.08s,background 0.3s;user-select:none;}' +
            '.k-colorbox:active{transform:scale(0.95);}' +
            '.k-label{font-size:11px;color:#889;letter-spacing:1px;}';
        document.head.appendChild(s);
    }
    if (rootEl) rootEl.classList.add('k-color-root');
    return true;
});
const click   = Events.listener(rootEl.querySelector(".k-colorbox"), "click", () => 1);

const counter = Behaviors.collect(0, click, (prev, _) => prev + 1);

const color = Behaviors.collect("#cccccc", click, (_, __) => {
    var r = random();
    var g = random();
    var b = random();
    return "hsl(" + Math.floor(r * 360) + "," +
           (40 + Math.floor(g * 50)) + "%," +
           (40 + Math.floor(b * 20)) + "%)";
});

const _renderCounter = Behaviors.collect(null, counter, (_, n) => {
    rootEl.querySelector(".k-counter").textContent = n;
    return null;
});

const _renderColor = Behaviors.collect(null, color, (_, c) => {
    rootEl.querySelector(".k-colorbox").style.background = c;
    return null;
});`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) { c = document.createElement('div'); c.className = 'vm-content';
                c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c); }
            mount = c;
        }
        mount.innerHTML = '<div class="k-label">' + (label||'') + '</div>' +
            '<div class="k-counter">0</div><div class="k-colorbox">click me</div>';
        return mount;
    },
};

// ── counter-timer ─────────────────────────────────────
APPS["counter-timer"] = {
    modelNodes: ['counter', 'subCounter', 'running', '_tick', '_subTick', '_tickLoop'],
    app: `
// ── MODEL ──────────────────────────────────────────────────────────────────

// running — toggled by start/stop button, starts false
const running = Behaviors.collect(false, toggle, (prev, _) => {
    var next = !prev;
    if (next) future(now(), 1000, '_tick', { type: '_tick' });
    return next;
});

// _tick — fires every 1s, schedules 9 subticks at 100ms intervals within the second
const _tick    = Events.receiver();
const _subTick = Events.receiver();

const _tickLoop = Behaviors.collect(null, _tick, (_, __) => {
    if (!running) return null;
    future(now(), 1000, '_tick', { type: '_tick' });
    Array.from({ length: 9 }, (_, i) => i + 1)
     .forEach(i => future(now(), i * 100, '_subTick', { step: i }));
});

// counter increments on each main tick
const counter = Behaviors.collect(0, Events.or(incr, decr, _tick), (prev, ev) => {
    if (ev && ev.type === '_tick') return prev + 1;
    return prev + ev;
});

// subCounter increments on each subtick (9x per second when running)
const subCounter = Behaviors.collect(0, _subTick, (prev, _) => prev + 1);

// ── VIEW ────────────────────────────────────────────────────────────────────

const _injectTimerStyles = Behaviors.collect(false, Events.once(vTime), function(done,_){
    if (done) return true;
    var sid = 'k-timer-styles';
    if (!document.getElementById(sid)) {
        var s = document.createElement('style'); s.id = sid;
        s.textContent =
            '.k-timer-root{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:24px;background:rgba(245,245,248,0.80);}';
        document.head.appendChild(s);
    }
    if (rootEl) rootEl.classList.add('k-timer-root');
    return true;
});
const incr   = Events.listener(rootEl.querySelector('#incr'),   'click', () => 1);
const decr   = Events.listener(rootEl.querySelector('#decr'),   'click', () => -1);
const toggle = Events.listener(rootEl.querySelector('#toggle'), 'click', () => 1);

const _render = Behaviors.collect(null,
    Events.or(Events.change(counter), Events.change(subCounter), Events.change(running)),
    (_, __) => {
        var countEl  = rootEl.querySelector('#count');
        var subEl    = rootEl.querySelector('#subcounter');
        var toggleEl = rootEl.querySelector('#toggle');
        if (countEl)  countEl.textContent  = counter;
        if (subEl)    subEl.textContent    = 'sub: ' + subCounter;
        if (toggleEl) toggleEl.textContent = running ? 'Stop' : 'Start';
        return null;
    }
);`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) { c = document.createElement('div'); c.className = 'vm-content';
                c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c); }
            mount = c;
        }
        mount.innerHTML = '<div style="font-size:11px;color:#889;letter-spacing:1px">' + (label||'') + '</div>' +
            '<div id="count" style="font-size:72px;font-weight:bold;color:#223;letter-spacing:-2px">0</div>' +
            '<div id="subcounter" style="font-size:13px;color:#88a;margin-top:-8px">sub: 0</div>' +
            '<div style="display:flex;gap:12px;margin-top:8px">' +
            '<button id="incr"   style="font-size:28px;width:60px;height:60px;border-radius:10px;border:2px solid #aab;background:#fff;cursor:pointer">+</button>' +
            '<button id="decr"   style="font-size:28px;width:60px;height:60px;border-radius:10px;border:2px solid #aab;background:#fff;cursor:pointer">−</button>' +
            '<button id="toggle" style="font-size:16px;width:80px;height:60px;border-radius:10px;border:2px solid #88b;background:#eef;cursor:pointer">Start</button>' +
            '</div>' +
            '<div style="font-size:11px;color:#aab">+1/s · 9 subticks/s · press Start</div>';
        return mount;
    },
};


// ── world ──────────────────────────────────────────────────────────────────
// The main krestianstvo demo — avatars, portal bar, counter, ticking, sub-portals.
// Uses UNIFIED_APP for model compilation but overrides viewProgram/applyAction
// with the full dom-demo VIEW_PROGRAM (same pattern as krestianify-demo.html).
APPS["world"] = {
    modelNodes: ['windows', '_moveWindow', '_resizeWindow', '_rotateWindow', '_closeWindow',
                 'portals', 'createPortal', 'movePortal', 'resizePortal', 'rotatePortal', 'scalePortal', 'closePortal',
                 'portalLinks', 'createLink', 'deleteLink'],
    app: `
// ── MODEL nodes: shared, deterministic, replicated ────────────────────────
// windows, portals, portalLinks: use Behaviors.select for clean per-message dispatch

// windows — Behaviors.select dispatches per message type
// Each arm corresponds to one applyAction handler, keeping model and applyAction in sync.
const _moveWindow   = Events.receiver();
const _resizeWindow = Events.receiver();
const _rotateWindow = Events.receiver();
const _closeWindow  = Events.receiver();
const windows = Behaviors.select(
    { map: (_initialState && _initialState.windows) ? new Map(Object.entries(_initialState.windows)) : new Map() },
    Events.change(worldState), function(prev, s) { if (!s) return { map: new Map() }; if (s.windows === (prev && prev.map)) return prev; return { map: s.windows || new Map() }; },
    _moveWindow,   function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { x: ev.x, y: ev.y }));
        return { map: prev.map };
    },
    _resizeWindow, function(prev, ev) {
        if (!ev || !ev.name || ev._injected) return prev;
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { w: ev.w, h: ev.h }));
        return { map: prev.map };
    },
    _rotateWindow, function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { r: ev.r }));
        return { map: prev.map };
    },
    _closeWindow,  function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.delete(ev.name);
        return { map: prev.map };
    }
);

// portals — Behaviors.select per portal operation
const createPortal = Events.receiver();
const movePortal   = Events.receiver();
const resizePortal = Events.receiver();
const rotatePortal = Events.receiver();
const scalePortal  = Events.receiver();
const closePortal  = Events.receiver();
const portals = Behaviors.select(
    { map: (_initialState && _initialState.portals) ? new Map(Object.entries(_initialState.portals)) : new Map() },
    Events.change(worldState), function(prev, s) { if (!s) return { map: new Map() }; if (s.portals === (prev && prev.map)) return prev; return { map: s.portals || new Map() }; },
    createPortal,  function(prev, ev) {
        if (!ev || !ev.name) return prev;
        if ([...prev.map.values()].some(function(p) { return p.name === ev.name; })) return prev;
        var pid = uid('p');
        prev.map.set(pid, { id: pid, name: ev.name,
            x: ev.x != null ? ev.x : 60, y: ev.y != null ? ev.y : 60,
            w: ev.w != null ? ev.w : 320, h: ev.h != null ? ev.h : 240 });
        return { map: prev.map };
    },
    movePortal,    function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { x: ev.x, y: ev.y }));
        return { map: prev.map };
    },
    resizePortal,  function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { w: ev.w, h: ev.h }));
        return { map: prev.map };
    },
    rotatePortal,  function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { r: ev.r }));
        return { map: prev.map };
    },
    scalePortal,   function(prev, ev) {
        if (!ev || !ev.id || !prev.map.get(ev.id)) return prev;
        prev.map.set(ev.id, Object.assign({}, prev.map.get(ev.id), { s: ev.s }));
        return { map: prev.map };
    },
    closePortal,   function(prev, ev) {
        if (!ev || !ev.id) return prev;
        prev.map.delete(ev.id);
        return { map: prev.map };
    }
);

// portalLinks — Behaviors.select per link operation
const createLink = Events.receiver();
const deleteLink = Events.receiver();
const portalLinks = Behaviors.select(
    { map: (_initialState && _initialState.portalLinks) ? new Map(Object.entries(_initialState.portalLinks)) : new Map() },
    Events.change(worldState), function(prev, s) { if (!s) return { map: new Map() }; if (s.portalLinks === (prev && prev.map)) return prev; return { map: s.portalLinks || new Map() }; },
    createLink,    function(prev, ev) {
        if (!ev || !ev.id) return prev;
        prev.map.set(ev.id, { id: ev.id, fromPortalId: ev.fromPortalId,
            toSelo: ev.toSelo, toPortalName: ev.toPortalName });
        return { map: prev.map };
    },
    deleteLink,    function(prev, ev) {
        if (!ev || !ev.id) return prev;
        prev.map.delete(ev.id);
        return { map: prev.map };
    }
);

// ── VIEW nodes: local per-client ──────────────────────────────────────────
// (provided by the VIEW_PROGRAM)
`,
    viewProgram: `

// ── Model state receivers ─────────────────────────────────────────────────
// These receive values pushed by VM after each model drain (via modelStateKeys).
const windows      = Behaviors.collect({map: new Map()}, Events.receiver(), function(_,v){return v||{map: new Map()};});
const portals      = Behaviors.collect({map: new Map()}, Events.receiver(), function(_,v){return v||{map: new Map()};});
const portalLinks  = Behaviors.collect({map: new Map()}, Events.receiver(), function(_,v){return v||{map: new Map()};});
const setPortal    = Events.receiver();

// ── buildUI — create title strip once ────────────────────────────────────
// Runs once: when rootEl is available and title strip not yet present.
// Creates .vm-clock, .vm-peers, .vm-queue so the renderer can update them.
const _buildUI = Behaviors.collect(false, Events.once(vTime), function(done, _) {
console.log('buildUI timer fired', { done, rootEl, vTime });
    if (done) return true;
    var rEl = rootEl;
    if (!rEl || rEl.querySelector('.vm-clock')) return true;

    // Inject avatar + vm CSS so blank-joiner gets styles without a <style> block
    if (UI && UI.injectStyles) UI.injectStyles();
    var strip = document.createElement('div');
    strip.style.cssText =
        'position:absolute;top:0;left:0;right:0;height:22px;' +
        'background:rgba(232,232,244,0.80);border-bottom:1px solid #ccd;' +
        'display:flex;align-items:center;padding:0 6px;gap:4px;' +
        'font-size:11px;font-family:monospace;color:#446;z-index:5;user-select:none;';
    var lbl = document.createElement('b');
    lbl.className = 'vm-label';
    lbl.textContent = Renkon.app.seloId || '';
    lbl.style.cssText = 'flex:0 0 auto;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    var stats = document.createElement('span');
    stats.style.cssText = 'margin-left:auto;font-size:10px;font-weight:normal;color:#888;white-space:nowrap;';
    stats.innerHTML = 'T:<span class="vm-clock">0</span> P:<span class="vm-peers">0</span>';
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
const _spawnWired = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var vm = Renkon.app.vm;
    var app = Renkon.app;
    if (!vm || !UI) return false;

    function makeSpawnHandler(parentEl, parentVM) {
        return function(opts) {
            var childVM    = opts.vm;
            var targetSeloId = childVM.seloId;   // actual seloId the child connected to
            // Look up the DOM windowName key from _childrenMap (Map<windowName, childVM>)
            var windowName = opts.name;
            if (parentVM._childrenMap) {
                parentVM._childrenMap.forEach(function(vm, wName) {
                    if (vm === childVM) windowName = wName;
                });
            }

            const _existing = [...parentEl.children].some(child => child.dataset?.seloId === windowName);
            if (_existing) return;
            
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
                onRotate: function(n, r) {
                    if (ws && ws.readyState === WebSocket.OPEN)
                        ws.send(JSON.stringify({ type: '_rotateWindow', data: { name: n, r: r } }));
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

            var _wp = parentVM.viewPS && parentVM.viewPS.app && parentVM.viewPS.app.windowPositions;
            var savedPos = _wp && (_wp instanceof Map ? _wp.get(windowName) : _wp[windowName]);
            if (savedPos) {
                if (savedPos.x != null) el.style.left = savedPos.x + 'px';
                if (savedPos.y != null) el.style.top  = savedPos.y + 'px';
                if (savedPos.w != null) el.style.width  = savedPos.w + 'px';
                if (savedPos.h != null) el.style.height = savedPos.h + 'px';
                if (savedPos.r != null) el.style.transform = 'rotate(' + savedPos.r + 'deg)';
            }

            if (childVM.viewPS && childVM.viewPS.app) {
                childVM.viewPS.app.rootEl = el;
                childVM.viewPS.app.UI     = UI;
            }
            childVM.viewAppExtra = Object.assign(childVM.viewAppExtra || {}, {
                rootEl: el, UI: UI,
            });

            // Tag portal windows for CSS hiding of nested portals
            if (childVM._isPortal) {
                el.classList.add('kv-portal-window');
                // Link windows get extra class to distinguish from auto-paired portals
                if (childVM._linkId) el.classList.add('kv-link-window');
                // Pre-create .vm-content so world:2 renders inside it (not directly in el).
                // _portalLinkSync offsets .vm-content to slide the viewport.
                // Also ensures _buildUI guard (.vm-clock found in titlebar) works correctly.
                var _pvc = document.createElement('div');
                _pvc.className = 'vm-content';
                _pvc.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                el.appendChild(_pvc);
                // Point child VM rootEl at .vm-content so world:2 renders there
                childVM.viewAppExtra = Object.assign(childVM.viewAppExtra || {}, {
                    rootEl: _pvc, UI: UI,
                });
            }
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
                // Convert HTMLCollection to Array and find the matching child
                const childEl = [...el.children].find(child => 
                    child.dataset?.seloId === closeOpts.name
                );
                // If found, execute cleanup and remove
                if (childEl) {
                    childEl._destroyDrag?.(); 
                    childEl.remove();
                }
            };

            // Join button — re-joins via parent model so all peers update together
            cbtn.addEventListener('click', function(e) {
                e.stopPropagation();
                var newSeloId = cinp.value.trim();
                if (!newSeloId) return;
                if (ws && ws.readyState === WebSocket.OPEN)
                    ws.send(JSON.stringify({ type: '_joinWindow', data: { name: windowName, seloId: newSeloId } }));
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
        var rEl = app.rootEl;
        if (!rEl) return;

         // Convert HTMLCollection to Array and find the matching child
                const childEl = [...rEl.children].find(child => 
                    child.dataset?.seloId === opts.name
                );
                // If found, execute cleanup and remove
                if (childEl) {
                    childEl._destroyDrag?.(); 
                    childEl.remove();
                }
    };

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
    // hit may be rEl itself OR rEl's parent portal container (when rEl is .vm-content)
    if (hit && hit !== rEl && hit !== rEl.parentElement) return undefined;
    // Don't steal focus from INPUT or BUTTON elements (e.g. portal bar)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return undefined;
    rEl.focus({ preventScroll: true });
    // Measure coords relative to avatar layer so cursor center matches avatar center.
    // Search only direct children to avoid finding nested portal layers.

    const _layer = [...rEl.children].find(child => 
    child.classList?.contains('vm-avatar-layer'));

    var rect = _layer ? _layer.getBoundingClientRect() : rEl.getBoundingClientRect();
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
const _timerMove  = Events.timer(50 * (1 + Math.max(0, (Renkon.app.depth || 0) - 1)));
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
    if (!v) return { seloId: '', appName: null, maxDepth: null, isPortal: false };
    // Parse trailing options: ":d=5" sets maxDepth
    var maxDepth = null;
    var _dIdx = v.lastIndexOf(':d='); if (_dIdx >= 0) { var _dVal = v.slice(_dIdx + 3); if (_dVal && !isNaN(parseInt(_dVal, 10))) { maxDepth = parseInt(_dVal, 10); v = v.slice(0, _dIdx).trim(); } }
    // "portal:p1" — create a named portal rect in this selo
    if (v.indexOf('portal:') === 0) {
        var _pname = v.slice(7).trim();
        return { action: 'createPortal', portalName: _pname, maxDepth: maxDepth };
    }
    // "link:p1->world:2/p2" — link local portal p1 to portal p2 in world:2
    // fromPortalName -> toSelo / toPortalName
    if (v.indexOf('link:') === 0) {
        var _spec = v.slice(5).trim();
        var _arrowIdx = _spec.indexOf('->');
        if (_arrowIdx < 0) return { seloId: v, appName: null, maxDepth: maxDepth, isPortal: false };
        var _from = _spec.slice(0, _arrowIdx).trim();
        var _toSpec = _spec.slice(_arrowIdx + 2).trim();
        var _slashIdx = _toSpec.lastIndexOf('/');
        var _toSelo = _slashIdx >= 0 ? _toSpec.slice(0, _slashIdx).trim() : _toSpec;
        var _toPortal = _slashIdx >= 0 ? _toSpec.slice(_slashIdx + 1).trim() : '';
        return { action: 'createLink', fromPortalName: _from, toSelo: _toSelo, toPortalName: _toPortal, maxDepth: maxDepth };
    }
    var resolve = Renkon.app && Renkon.app.resolveApp;
    if (resolve) {
        var r = resolve(v);
        if (r && r.appDef) {
            var hasName = r.seloId && r.seloId.length > 0;
            var fullSeloId = hasName ? v : '';
            return { seloId: fullSeloId, appName: r.appName, maxDepth: maxDepth, isPortal: false };
        }
    }
    if (v.indexOf('new:') === 0) {
        return { seloId: v.slice(4).trim(), appName: 'world', maxDepth: maxDepth, isPortal: false };
    }
    // Plain name with no app prefix — default to 'world' so the child gets
    // the full portal/avatar infrastructure. Joining an existing session is
    // unaffected: the snapshot arrives and programs are restored from it.
    return { seloId: v, appName: 'world', maxDepth: maxDepth, isPortal: false };
}

// ── portalText — synced portal input value ────────────────────────────────
const portalText = Behaviors.collect('', setPortal,
    function(_, ev) { return (ev && typeof ev === 'object') ? (ev.value || '') : (ev || ''); });

const showSpwnedChildren = (()=>{
    //console.log("Childs: ", clientJoined);
    })();

// ── renderer — 60hz DOM update ────────────────────────────────────────────
const renderTick = Events.timer(16);
const renderer = ((renderTick)=>
//Behaviors.collect(null, renderTick, function(_, __) {

{
    var rEl  = rootEl;
    if (!rEl || !UI) return null;
    var objs    = objects || new Map();
    var myId    = clientIdentity && clientIdentity.clientId;
    var ws      = Renkon.app.ws;
    var depth    = Renkon.app.depth    || 0;
    var maxDepth = Renkon.app.maxDepth != null ? Renkon.app.maxDepth : 5;
    var atMax    = depth >= maxDepth;

    var clockEl = rEl.querySelector('.vm-clock');
    var peersEl = rEl.querySelector('.vm-peers');
    if (clockEl) clockEl.textContent = vTime || 0;
    if (peersEl) peersEl.textContent = objs.size;

    var portalBar = rEl.querySelector('.vm-portal-bar');

    if (!portalBar) {
    portalBar = UI.createPortalBar(rEl, {
        disabled: atMax,
        onInput: atMax ? null : function(value) {
            if (ws && ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: 'setPortal', data: { value: value } }));
        },
        onSubmit: atMax ? null : function(inputVal) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            var parsed = _parsePortalInput(inputVal);
            if (parsed.action === 'createPortal') {
                ws.send(JSON.stringify({ type: 'createPortal', data: {
                    name: parsed.portalName
                }}));
            } else if (parsed.action === 'createLink') {
                // Resolve local portal id from name.
                // Use Renkon.app._portalState (set by _exposePortalState) since
                // portals behavior is not in scope inside the renderer closure.
                var _localPortals = (Renkon.app && Renkon.app._portalState) || new Map();
                var _fromPortal = null;
                ;[..._localPortals.values()].forEach(function(p) {
                    if (p.name === parsed.fromPortalName) _fromPortal = p;
                });
                if (_fromPortal && ws && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'createLink', data: {
                        fromPortalId:  _fromPortal.id,
                        toSelo:        parsed.toSelo,
                        toPortalName:  parsed.toPortalName,
                        maxDepth:      parsed.maxDepth,
                    }}));
                } else if (!_fromPortal) {
                    console.warn('[portal] local portal not found:', parsed.fromPortalName,
                        'available:', [..._localPortals.values()].map(function(p){return p.name;}));
                }
            } else {
                ws.send(JSON.stringify({ type: 'spawnSelo', data: { seloId: parsed.seloId, appName: parsed.appName || null, maxDepth: parsed.maxDepth } }));
            }
        },
    }).bar;
};

    //var portalBar = rEl.querySelector('.vm-portal-bar');
    var portalInp = portalBar && portalBar.querySelector('input');
    if (portalInp && !atMax && document.activeElement !== portalInp) {
        var pStr = (typeof portalText === 'object' && portalText !== null)
            ? (portalText.value || '') : (portalText || '');
        portalInp.value = pStr;
    }

    var layer = [...rEl.children].find(child => 
    child.classList?.contains('vm-avatar-layer'));

    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'vm-avatar-layer';
        // Top offset = height of stats strip if directly inside rEl

         const _strip = [...rEl.children].find(child => 
            child.querySelector?.('.vm-clock'));

        var _topOff = _strip ? (_strip.offsetHeight || 22) : 0;
        // bottom:36px reserved for portal bar — but in portal viewports the contentEl
        // can be 400vh tall, making the layer huge and avatars render far offscreen.
        // Use overflow:hidden on the parent to clip instead.
        var _isPortalContent = rEl.classList && rEl.classList.contains('vm-content') &&
            rEl.parentElement && rEl.parentElement.classList.contains('kv-portal-window');
        var _bottom = _isPortalContent ? '0px' : '44px'; // portal bar ~40px
        layer.style.cssText =
            'position:absolute;top:' + _topOff + 'px;left:0;right:0;bottom:' + _bottom + ';' +
            'pointer-events:none;overflow:hidden;z-index:9999;';
        rEl.appendChild(layer);
    }

    layer.querySelectorAll('.avatar').forEach(function(el) {
        if (!objs.get(el.dataset.clientId)) el.remove();
    });

    objs.forEach(function(obj, id) {
        var el = layer.querySelector('[data-client-id="' + id + '"]');
        var tri;
        if (!el) {
            el = document.createElement('div');
            el.className = 'avatar';
            el.dataset.clientId = id;
            el.style.cssText =
                'position:absolute;width:30px;height:30px;pointer-events:none;' +
                'filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35));';
            tri = document.createElement('div');
            tri.className = 'av-tri';
            tri.style.cssText =
                'width:30px;height:30px;' +
                'clip-path: circle(40%);';
            el.appendChild(tri);
            el._avTri = tri;
            layer.appendChild(el);
        } else {
            tri = el._avTri || el.querySelector('.av-tri');
        }
        var color = obj.color || '#8899bb';
        if (tri) tri.style.background = color;
        el.style.transform = 'translate3d(' + (obj.x || 80) + 'px,' + (obj.y || 80) + 'px,0)';
        el.style.opacity   = id === myId ? '0.5' : '0.4';
    });

    return null;
})(renderTick);

// ── _exposePortalState — share portals with parent VM ────────────────────
const _exposePortalState = Behaviors.collect(null,
    Events.or(Events.change(portals), Events.change(portalLinks)),
    function(_, __) {
        if (Renkon.app) {
            Renkon.app._portalState       = (portals      && portals.map)      || new Map();
            Renkon.app._portalLinksState  = (portalLinks  && portalLinks.map)  || new Map();
        }
        return null;
    }
);

// ── _portalRectSync — draggable portal viewport rectangles ────────────────
// Each portal is a named dashed rectangle. Moving it shifts the viewport
// in any linked selo's window. No child VMs — purely a visual anchor.
const _portalRectSync = Behaviors.collect(null, Events.change(portals), function(_, _pts) {
    if (!rootEl) return null;
    var pts = (_pts && _pts.map) || new Map();
    var ws  = Renkon.app.ws;
    var rEl = rootEl;

    // Remove stale rects
    Array.from(rEl.children).forEach(function(el) {
        if (el.classList && el.classList.contains('kv-portal-rect') && !pts.get(el.dataset.portalId))
            el.remove();
    });

    pts.forEach(function(p, pid) {
        var rect = Array.from(rEl.children).find(function(el) {
            return el.dataset && el.dataset.portalId === pid;
        });

        if (!rect) {
            rect = document.createElement('div');
            rect.className = 'kv-portal-rect';
            rect.dataset.portalId = pid;
            rect.style.cssText =
                'position:absolute;box-sizing:border-box;' +
                'border:2px dashed rgba(100,180,255,0.85);border-radius:4px;' +
                'background:rgba(100,180,255,0.07);pointer-events:all;cursor:move;' +
                'z-index:15;user-select:none;touch-action:none;';

            // Name label
            var lbl = document.createElement('div');
            lbl.className = 'kv-portal-label';
            lbl.style.cssText =
                'position:absolute;top:2px;left:6px;right:20px;font-size:10px;' +
                'font-family:monospace;color:rgba(40,120,210,0.9);pointer-events:none;white-space:nowrap;overflow:hidden;';
            lbl.textContent = '\u25c7 ' + (p.name || pid);
            rect.appendChild(lbl);

            // Close button
            var _cb = document.createElement('button');
            _cb.textContent = '\xd7';
            _cb.style.cssText =
                'position:absolute;top:1px;right:2px;width:14px;height:14px;' +
                'border:none;background:rgba(200,80,80,0.4);color:#fff;border-radius:2px;' +
                'font-size:11px;line-height:12px;cursor:pointer;padding:0;z-index:2;';
            _cb.addEventListener('click', function(e) {
                e.stopPropagation();
                if (ws && ws.readyState === 1)
                    ws.send(JSON.stringify({ type: 'closePortal', data: { id: pid } }));
            });
            rect.appendChild(_cb);

            // Scale handle — top-left corner
            var _sh2 = document.createElement('div');
            _sh2.style.cssText =
                'position:absolute;top:0;left:0;width:22px;height:22px;cursor:nw-resize;touch-action:none;' +
                'background:linear-gradient(325deg,transparent 50%,rgba(255,200,80,0.7) 50%);' +
                'border-top-left-radius:3px;';
            (function(_pid) {
                var _scaling=false,_last=0,_startY=0,_startScale=1;
                function _startScale2(cy) {
                    _scaling = true;
                    _startY = cy;
                    _startScale = parseFloat(rect.dataset.scale) || 1;
                }
                function _doScale(cy) {
                    if (!_scaling) return;
                    var now=Date.now(); if (now-_last<50) return; _last=now;
                    var delta = (_startY - cy) / 100; // drag up = zoom in
                    var s = Math.max(0.1, Math.round((_startScale + delta) * 100) / 100);
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'scalePortal',data:{id:_pid,s:s}}));
                }
                function _endScale(cy) {
                    if (!_scaling) return; _scaling=false;
                    var delta = (_startY - cy) / 100;
                    var s = Math.max(0.1, Math.round((_startScale + delta) * 100) / 100);
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'scalePortal',data:{id:_pid,s:s}}));
                }
                function _mm(e) { _doScale(e.clientY); }
                function _mu(e) {
                    _endScale(e.clientY);
                    document.removeEventListener('mousemove',_mm);
                    document.removeEventListener('mouseup',_mu);
                }
                function _tm(e) { e.preventDefault(); _doScale(e.touches[0].clientY); }
                function _tu(e) {
                    _endScale(e.changedTouches[0].clientY);
                    document.removeEventListener('touchmove',_tm);
                    document.removeEventListener('touchend',_tu);
                }
                _sh2.addEventListener('mousedown',function(e){
                    e.stopPropagation(); e.preventDefault();
                    _startScale2(e.clientY);
                    document.addEventListener('mousemove',_mm);
                    document.addEventListener('mouseup',_mu);
                });
                _sh2.addEventListener('touchstart',function(e){
                    e.stopPropagation(); e.preventDefault();
                    _startScale2(e.touches[0].clientY);
                    document.addEventListener('touchmove',_tm,{passive:false});
                    document.addEventListener('touchend',_tu);
                },{passive:false});
            })(pid);
            rect.appendChild(_sh2);

            // Resize handle
            var _rh = document.createElement('div');
            _rh.style.cssText =
                'position:absolute;bottom:0;right:0;width:22px;height:22px;cursor:se-resize;touch-action:none;' +
                'background:linear-gradient(135deg,transparent 50%,rgba(100,180,255,0.7) 50%);' +
                'border-bottom-right-radius:3px;';
            (function(_pid) {
                var _sw=0,_sh=0,_sx=0,_sy=0,_rsz=false,_last=0;
                function _doResize(cx, cy) {
                    var now=Date.now(); if (now-_last<50) return; _last=now;
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'resizePortal',data:{id:_pid,
                            w:Math.round(Math.max(80,_sw+cx-_sx)),
                            h:Math.round(Math.max(60,_sh+cy-_sy))}}));
                }
                function _endResize(cx, cy) {
                    if (!_rsz) return; _rsz=false;
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'resizePortal',data:{id:_pid,
                            w:Math.round(Math.max(80,_sw+cx-_sx)),
                            h:Math.round(Math.max(60,_sh+cy-_sy))}}));
                }
                function _mm(e) { if (!_rsz) return; _doResize(e.clientX, e.clientY); }
                function _mu(e) {
                    _endResize(e.clientX, e.clientY);
                    document.removeEventListener('mousemove',_mm);
                    document.removeEventListener('mouseup',_mu);
                }
                function _tm(e) {
                    if (!_rsz) return;
                    e.preventDefault();
                    var t=e.touches[0]; _doResize(t.clientX, t.clientY);
                }
                function _tu(e) {
                    var t=e.changedTouches[0]; _endResize(t.clientX, t.clientY);
                    document.removeEventListener('touchmove',_tm);
                    document.removeEventListener('touchend',_tu);
                }
                _rh.addEventListener('mousedown',function(e){
                    e.stopPropagation(); e.preventDefault(); _rsz=true;
                    _sw=parseInt(rect.style.width)||320; _sh=parseInt(rect.style.height)||240;
                    _sx=e.clientX; _sy=e.clientY;
                    document.addEventListener('mousemove',_mm);
                    document.addEventListener('mouseup',_mu);
                });
                _rh.addEventListener('touchstart',function(e){
                    e.stopPropagation(); e.preventDefault(); _rsz=true;
                    _sw=parseInt(rect.style.width)||320; _sh=parseInt(rect.style.height)||240;
                    var t=e.touches[0]; _sx=t.clientX; _sy=t.clientY;
                    document.addEventListener('touchmove',_tm,{passive:false});
                    document.addEventListener('touchend',_tu);
                },{passive:false});
            })(pid);
            rect.appendChild(_rh);

            // Rotation handle — bottom-left corner
            var _rot = document.createElement('div');
            _rot.style.cssText =
                'position:absolute;bottom:0;left:0;width:22px;height:22px;cursor:grab;touch-action:none;' +
                'background:linear-gradient(225deg,transparent 50%,rgba(100,220,160,0.7) 50%);' +
                'border-bottom-left-radius:3px;';
            (function(_pid) {
                var _rotating=false,_last=0,_startAngle=0,_startR=0;
                function _rawAngle(cx, cy) {
                    var br = rect.getBoundingClientRect();
                    var _cx = br.left + br.width  / 2;
                    var _cy = br.top  + br.height / 2;
                    return Math.atan2(cy - _cy, cx - _cx) * 180 / Math.PI;
                }
                function _startRotate(cx, cy) {
                    _rotating = true;
                    _startAngle = _rawAngle(cx, cy);
                    _startR = parseFloat(rect.style.transform && rect.style.transform.replace('rotate(','').replace('deg)','')) || 0;
                }
                function _doRotate(cx, cy) {
                    if (!_rotating) return;
                    var now=Date.now(); if (now-_last<50) return; _last=now;
                    var delta = _rawAngle(cx, cy) - _startAngle;
                    var r = Math.round(_startR + delta);
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'rotatePortal',data:{id:_pid,r:r}}));
                }
                function _endRotate(cx, cy) {
                    if (!_rotating) return; _rotating=false;
                    var delta = _rawAngle(cx, cy) - _startAngle;
                    var r = Math.round(_startR + delta);
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'rotatePortal',data:{id:_pid,r:r}}));
                }
                function _mm(e) { _doRotate(e.clientX, e.clientY); }
                function _mu(e) {
                    _endRotate(e.clientX, e.clientY);
                    document.removeEventListener('mousemove',_mm);
                    document.removeEventListener('mouseup',_mu);
                }
                function _tm(e) {
                    e.preventDefault();
                    var t=e.touches[0]; _doRotate(t.clientX, t.clientY);
                }
                function _tu(e) {
                    var t=e.changedTouches[0]; _endRotate(t.clientX, t.clientY);
                    document.removeEventListener('touchmove',_tm);
                    document.removeEventListener('touchend',_tu);
                }
                _rot.addEventListener('mousedown',function(e){
                    e.stopPropagation(); e.preventDefault();
                    _startRotate(e.clientX, e.clientY);
                    document.addEventListener('mousemove',_mm);
                    document.addEventListener('mouseup',_mu);
                });
                _rot.addEventListener('touchstart',function(e){
                    e.stopPropagation(); e.preventDefault();
                    var t=e.touches[0]; _startRotate(t.clientX, t.clientY);
                    document.addEventListener('touchmove',_tm,{passive:false});
                    document.addEventListener('touchend',_tu);
                },{passive:false});
            })(pid);
            rect.appendChild(_rot);

            // Drag — mouse + touch
            (function(_pid) {
                var _ox=0,_oy=0,_mx=0,_my=0,_drag=false,_last=0;
                function _startDrag(cx, cy) {
                    _drag=true;
                    _ox=parseInt(rect.style.left)||0; _oy=parseInt(rect.style.top)||0;
                    _mx=cx; _my=cy;
                }
                function _doDrag(cx, cy) {
                    if (!_drag) return;
                    var now=Date.now(); if (now-_last<50) return; _last=now;
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'movePortal',data:{id:_pid,
                            x:Math.round(_ox+cx-_mx),y:Math.round(_oy+cy-_my)}}));
                }
                function _endDrag(cx, cy) {
                    if (!_drag) return; _drag=false;
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'movePortal',data:{id:_pid,
                            x:Math.round(_ox+cx-_mx),y:Math.round(_oy+cy-_my)}}));
                }
                // Mouse
                rect.addEventListener('mousedown', function(e) {
                    if (e.target !== rect && e.target !== lbl) return;
                    e.stopPropagation(); e.preventDefault();
                    _startDrag(e.clientX, e.clientY);
                    function _mm(e) { _doDrag(e.clientX, e.clientY); }
                    function _mu(e) {
                        _endDrag(e.clientX, e.clientY);
                        document.removeEventListener('mousemove',_mm);
                        document.removeEventListener('mouseup',_mu);
                    }
                    document.addEventListener('mousemove',_mm);
                    document.addEventListener('mouseup',_mu);
                });
                // Touch
                rect.addEventListener('touchstart', function(e) {
                    if (e.target !== rect && e.target !== lbl) return;
                    e.stopPropagation(); e.preventDefault();
                    var t=e.touches[0];
                    _startDrag(t.clientX, t.clientY);
                    function _tm(e) {
                        e.preventDefault();
                        var t=e.touches[0]; _doDrag(t.clientX, t.clientY);
                    }
                    function _tu(e) {
                        var t=e.changedTouches[0]; _endDrag(t.clientX, t.clientY);
                        document.removeEventListener('touchmove',_tm);
                        document.removeEventListener('touchend',_tu);
                    }
                    document.addEventListener('touchmove',_tm,{passive:false});
                    document.addEventListener('touchend',_tu);
                },{passive:false});
            })(pid);

            rEl.appendChild(rect);

            // CSS: hide portal rects and link windows inside portal windows (prevents recursion)
            if (!document.getElementById('kv-hide-portal-in-portal')) {
                var _css = document.createElement('style');
                _css.id = 'kv-hide-portal-in-portal';
                _css.textContent =
                    // Hide portal rects when viewed through any portal
                    '.kv-portal-window .kv-portal-rect { display:none !important; }' +
                    // When a link window is seen through another portal viewport,
                    // hide its .vm-content (the recursive mirror) but keep the chrome.
                    // The titlebar shows it exists; the empty body breaks the recursion.
                    '.kv-portal-window .kv-link-window .vm-content { visibility:hidden !important; }';
                document.head.appendChild(_css);
            }
        }

        // Sync position/size from model
        rect.style.left      = (p.x || 0) + 'px';
        rect.style.top       = (p.y || 0) + 'px';
        rect.style.width     = (p.w || 200) + 'px';
        rect.style.height    = (p.h || 180) + 'px';
        rect.style.transform = p.r != null ? 'rotate(' + p.r + 'deg)' : '';
        // Update label if name changed
        var _lbl = rect.querySelector('.kv-portal-label');
        if (_lbl) _lbl.textContent = '\u25c7 ' + (p.name || pid);
    });
    return null;
});

// ── _portalLinkSync — manage link windows and apply viewport offset ────────
// Each portalLink entry spawns a child VM window (via spawned/model).
// This VIEW node sizes the window to match the local portal rect,
// and offsets the inner content so toPortal's position aligns with (0,0).
const _portalLinkSync = Behaviors.collect(null,
    Events.or(Events.change(portalLinks), Events.change(portals), Events.change(objects), Events.change(vTime)),
    function(_, __) {
        var lks  = (portalLinks  && portalLinks.map)  || new Map();
        var pts  = (portals      && portals.map)      || new Map();
        var vm   = Renkon.app.vm;
        var rEl  = rootEl;
        if (!vm || !vm._children || !rEl) return null;

        lks.forEach(function(lk, lid) {
            var fromPortal = pts.get(lk.fromPortalId);
            if (!fromPortal) return;

            // Find child VM for this link
            var childVM = null;
            vm._children.forEach(function(cvm) { if (cvm._linkId === lid) childVM = cvm; });
            if (!childVM) return;

            // Find window container
            var winEl = null;
            Array.from(rEl.children).forEach(function(c) {
                if (c.dataset && c.dataset.seloId === childVM._windowName) winEl = c;
            });
            if (!winEl) return;

            // Size is set reactively from toPortal (remote p2) after we read it below.
            // Position is independent — user moves the window freely.

            // Wire close button to delete the link (once)
            if (!winEl._linkCloseWired) {
                winEl._linkCloseWired = true;
                var _closeBtn = winEl.querySelector('button');
                // Find the × close button (first button in titleBar)
                var _titleBar = winEl.querySelector && winEl.children[0];
                var _xBtn = _titleBar && Array.from(_titleBar.querySelectorAll('button'))
                    .find(function(b) { return b.textContent === '\xd7'; });
                if (_xBtn) {
                    // Replace existing listeners by cloning
                    var _newBtn = _xBtn.cloneNode(true);
                    _xBtn.parentNode.replaceChild(_newBtn, _xBtn);
                    _newBtn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        // deleteLink: model removes spawned entry → _diffChildren
                        // closes child VM → onClose removes window DOM
                        var _ws = Renkon.app.ws;
                        if (_ws && _ws.readyState === 1)
                            _ws.send(JSON.stringify({ type: 'deleteLink', data: { id: lid } }));
                    });
                }
            }

            // Get .vm-content — offset it to slide world:2's content in the clipped window.
            // el (window container) has overflow:hidden and clips the shifted content.
            // .vm-content is position:absolute inside el — offsetting its left/top slides
            // all of world:2's content (avatars, windows) past the clip boundary.
            var contentEl = winEl.querySelector('.vm-content');
            if (!contentEl) {
                // Fallback: use el itself (should not happen with pre-created .vm-content)
                contentEl = winEl;
            }

            // Read toPortal position from remote VM's exposed state
            var remotePortals = (childVM.viewPS && childVM.viewPS.app &&
                                  childVM.viewPS.app._portalState) || new Map();
            var toPortal = [...remotePortals.values()].find(function(p) {
                return p.name === lk.toPortalName;
            });
            // Offset: move content so toPortal's top-left aligns with window origin.
            // toPortal moves right → offset goes more negative → content slides left.
            var offX = toPortal ? -(toPortal.x || 0) : 0;
            var offY = toPortal ? -(toPortal.y || 0) : 0;

            // Window resize is now handled by _notifyLinkedResize future chain
            // in world:2's model → injectModelMessage into world:1's model.
            // No VIEW-side ws.send needed here.

            // Mirror activation: check if the remote selo has a link window pointing
            // back to our selo. If it does AND the user explicitly places portals to
            // overlap (toPortal rect overlaps with fromPortal in viewport coords),
            // activate mirror by showing the nested link window content.
            // maxDepth prevents infinite recursion — mirror runs for finite depth only.
            if (fromPortal && toPortal) {
                var _mirrorCssId = 'kv-mirror-active-css';
                if (!document.getElementById(_mirrorCssId)) {
                    var _ms = document.createElement('style');
                    _ms.id = _mirrorCssId;
                    _ms.textContent =
                        '.kv-portal-window .kv-link-window.kv-mirror-active .vm-content ' +
                        '{ visibility:visible !important; }';
                    document.head.appendChild(_ms);
                }
                // Overlap: toPortal rect (in world:2 coords) is within the viewport clip.
                // The viewport shows world:2 from (toPortal.x, toPortal.y).
                // fromPortal defines the clip size (w,h).
                // Any portal rect in world:2 that falls within that region causes overlap.
                // Simple heuristic: if a remote link window exists pointing to our selo,
                // check if its fromPortal rect is within the clipped view.
                var _remotePLinks = (childVM.viewPS && childVM.viewPS.app &&
                                    childVM.viewPS.app._portalLinksState) || new Map();
                var _hasReverseLink = [..._remotePLinks.values()].some(function(l) {
                    return l.toSelo === Renkon.app.seloId;
                });
                // Mirror is active only if reverse link exists AND depth allows it
                var _mirrorActive = _hasReverseLink && childVM.depth < childVM.maxDepth;
                if (_mirrorActive) {
                    winEl.classList.add('kv-mirror-active');
                } else {
                    winEl.classList.remove('kv-mirror-active');
                }
            }

            // Apply offset — override .vm-content's default left:0, top:22px
            contentEl.style.left   = offX + 'px';
            contentEl.style.top    = (22 + offY) + 'px';  // preserve 22px titlebar gap
            contentEl.style.right  = 'auto';               // remove right:0 constraint
            contentEl.style.bottom = 'auto';               // remove bottom:0 constraint
            contentEl.style.width  = '400vw';              // large enough to show all content
            contentEl.style.height = '400vh';
            // Apply rotation and scale to the viewport content
            var _r = (fromPortal && fromPortal.r != null) ? fromPortal.r : 0;
            var _s = (fromPortal && fromPortal.s != null) ? fromPortal.s : 1;
            // Keep dataset.scale in sync so the scale handle reads current value
            var _rectEl = winEl.querySelector && Array.from(rEl.children)
                .find(function(c) { return c.dataset && c.dataset.portalId === lk.fromPortalId; });
            if (_rectEl) _rectEl.dataset.scale = _s;
            if (_r !== 0 || _s !== 1) {
                contentEl.style.transform = 'rotate(' + _r + 'deg) scale(' + _s + ')';
                contentEl.style.transformOrigin = (-offX) + 'px ' + (-offY) + 'px';
            } else {
                contentEl.style.transform = '';
            }
        });
        return null;
    }
);

// ── _winSync — apply window positions from model ──────────────────────────
const _winSync = Behaviors.collect(null, Events.change(windows), function(_, _wins) {
    var wins = _wins && _wins.map;
    if (!wins) return null;
    var app = Renkon.app;
    app.windowPositions = wins;
    var rEl = app.rootEl;
    if (rEl) {
        wins.forEach(function(pos, name) {
            // Only match DIRECT children of rEl — not nested portal windows
            // which have the same data-selo-id at deeper levels.
            const el = [...rEl.children].find(child => child.dataset?.seloId === name);
            if (el) {
                if (pos.x != null) el.style.left = pos.x + 'px';
                if (pos.y != null) el.style.top  = pos.y + 'px';
                if (pos.w != null) el.style.width  = pos.w + 'px';
                if (pos.h != null) el.style.height = pos.h + 'px';
                if (pos.r != null) el.style.transform = 'rotate(' + pos.r + 'deg)';
            }
        });
    }
    return null;
});
`,
    applyAction: `
    if (msg.type === '_move') {
        var _from = msg.from;
        var _x = msg.data && msg.data.x;
        var _y = msg.data && msg.data.y;
        if (!_from || _x === undefined) return state;
        var _objs = state.objects || new Map();
        var _e = _objs.get(_from);
        if (_e) { _e.x = _x; _e.y = _y; }
        else { _objs.set(_from, { x: _x, y: _y }); }
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
        var _wins = new Map(state.windows || new Map());
        _wins.set(_name, Object.assign({}, _wins.get(_name) || {}, { x: _wx, y: _wy }));
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_resizeWindow') {
        var _name = msg.data && msg.data.name;
        var _ww = msg.data && msg.data.w;
        var _wh = msg.data && msg.data.h;
        if (!_name) return state;
        // _injected:true means this came via injectModelMessage (cross-world, no reflector).
        // future(0) ensures deterministic ordering: all world:1 peers that received the
        // same injected message process it at the same logical vTime step.
        if (msg._injected) {
            future(state.time, 0, '_applyWindowResize', { name: _name, w: _ww, h: _wh });
            return state; // defer to future for determinism
        }
        var _wins = new Map(state.windows || new Map());
        _wins.set(_name, Object.assign({}, _wins.get(_name) || {}, { w: _ww, h: _wh }));
        return Object.assign({}, state, { windows: _wins });
    }
    // _applyWindowResize: future handler called from injected _resizeWindow.
    // Runs at vTime+0, fully deterministic — same on all world:1 peers.
    if (msg.type === '_applyWindowResize') {
        var _name = msg.data && msg.data.name;
        var _ww   = msg.data && msg.data.w;
        var _wh   = msg.data && msg.data.h;
        if (!_name) return state;
        var _wins = new Map(state.windows || new Map());
        _wins.set(_name, Object.assign({}, _wins.get(_name) || {}, { w: _ww, h: _wh }));
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_rotateWindow') {
        var _name = msg.data && msg.data.name;
        var _wr = msg.data && msg.data.r;
        if (!_name || _wr == null) return state;
        var _wins = new Map(state.windows || new Map());
        _wins.set(_name, Object.assign({}, _wins.get(_name) || {}, { r: _wr }));
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_closeWindow') {
        var _name = msg.data && msg.data.name;
        if (!_name) return state;
        var _sp = (state.spawned || []).filter(function(n) {
            var wn = (n && typeof n === 'object') ? n.windowName : n;
            return wn !== _name;
        });
        var _wins = new Map(state.windows || new Map());
        _wins.delete(_name);
        return Object.assign({}, state, { spawned: _sp, windows: _wins });
    }
    if (msg.type === '_joinWindow') {
        var _name = msg.data && msg.data.name;
        var _newSelo = (msg.data && msg.data.seloId || '').trim();
        if (!_name || !_newSelo) return state;
        var _sp = (state.spawned || []).map(function(e) {
            if (!e || (typeof e === 'object' ? e.windowName : e) !== _name) return e;
            return Object.assign({}, e, { seloId: _newSelo });
        });
        return Object.assign({}, state, { spawned: _sp });
    }
    // ── Portal actions ───────────────────────────────────────────────────
    // createPortal: create a named viewport rectangle in this selo.
    // No links, no child VMs — just a positioned rect.
    // { name, x, y, w, h }
    if (msg.type === 'createPortal') {
        var _d = msg.data || {};
        var _name = (_d.name || '').trim();
        if (!_name) return state;
        // Check for duplicate name
        var _portals = new Map(state.portals || new Map());
        var _exists = [..._portals.values()].some(function(p) { return p.name === _name; });
        if (_exists) return state;
        var _pid = uid('p');
        _portals.set(_pid, {
            id: _pid, name: _name,
            x: _d.x != null ? _d.x : 60,
            y: _d.y != null ? _d.y : 60,
            w: _d.w != null ? _d.w : 320,
            h: _d.h != null ? _d.h : 240,
        });
        return Object.assign({}, state, { portals: _portals });
    }
    // movePortal: { id, x, y }
    if (msg.type === 'movePortal') {
        var _d = msg.data || {};
        var _portals = new Map(state.portals || new Map());
        var _p = _portals.get(_d.id); if (!_p) return state;
        _portals.set(_d.id, Object.assign({}, _p, { x: _d.x, y: _d.y }));
        return Object.assign({}, state, { portals: _portals });
    }
    // rotatePortal: { id, r }
    if (msg.type === 'rotatePortal') {
        var _d = msg.data || {};
        var _portals = new Map(state.portals || new Map());
        var _p = _portals.get(_d.id); if (!_p) return state;
        _portals.set(_d.id, Object.assign({}, _p, { r: _d.r }));
        return Object.assign({}, state, { portals: _portals });
    }
    // scalePortal: { id, s }
    if (msg.type === 'scalePortal') {
        var _d = msg.data || {};
        var _portals = new Map(state.portals || new Map());
        var _p = _portals.get(_d.id); if (!_p) return state;
        _portals.set(_d.id, Object.assign({}, _p, { s: _d.s }));
        return Object.assign({}, state, { portals: _portals });
    }
    // resizePortal: { id, w, h }
    // Pure Croquet multi-world architecture — no ws.send, no reflector round-trip:
    // Step 1: store new portal size in world:2's model (this applyAction).
    // Step 2: use future(0) to schedule cross-world notification in world:2's causality.
    // Step 3 (notifyLinkedWindowResize): world:2's model finds linked world:1 VM via
    //         app.vm._children, calls vm1.injectModelMessage() directly — in-process,
    //         deterministic (every peer running world:2 makes the same call at same vTime).
    // Step 4 (world:1 model _resizeWindow): updates windows[name] via future(0).
    // Step 5: world:1's _winSync VIEW applies size to all world:1 peers.
    if (msg.type === 'resizePortal') {
        var _d = msg.data || {};
        var _portals = new Map(state.portals || new Map());
        var _p = _portals.get(_d.id); if (!_p) return state;
        _portals.set(_d.id, Object.assign({}, _p, { w: _d.w, h: _d.h }));
        // Schedule cross-world notification at vTime+0 (same logical tick, deterministic)
        future(state.time, 0, '_notifyLinkedResize', { portalId: _d.id, w: _d.w, h: _d.h });
        return Object.assign({}, state, { portals: _portals });
    }
    // _notifyLinkedResize: future handler — runs in world:2's causality at vTime+0.
    // Finds all portal links in OTHER worlds that link TO the resized portal,
    // and injects _resizeWindow directly into those worlds' model queues.
    // No ws.send — pure in-process VM-to-VM model injection.
    if (msg.type === '_notifyLinkedResize') {
        var _d = msg.data || {};
        var _pid = _d.portalId;
        if (!_pid || !app.vm) return state;
        // Find child VMs in this world's VM that ARE portal links
        // (child VMs connected to other worlds)
        var _children = app.vm._children || new Map();
        _children.forEach(function(childVM) {
            if (!childVM._isPortal || !childVM._linkId) return;
            // This child VM is a link child connecting us to another world.
            // BUT: we are world:2. The link in world:2 points FROM world:2 TO world:1?
            // No — links are in world:1 (the viewer). World:2 has no links.
            // Instead: find PARENT VM — world:1's VM that has a child VM connected here.
            // app.vm._parent is world:1's VM if this is running in world:1's child VM.
            // Actually this runs in world:2's model. app.vm = world:2's VM.
            // world:2's VM._parent = world:1's VM (set in _diffChildren).
        });
        // Correct approach: world:2's VM._parent chain leads to world:1's VM.
        // The parent VM has portalLinks pointing to world:2.
        // Find parent VM and inject _resizeWindow for matching link windows.
        var _vm2 = app.vm;
        var _parentVM = _vm2._parent;
        if (!_parentVM) return state; // standalone, no parent
        // Find links in parent VM that point to this world and to _pid
        var _parentState = _parentVM.modelPS &&
            _parentVM._getModelNode(_parentVM.modelPS, 'worldState');
        var _parentLinks = (_parentState && _parentState.portalLinks) || new Map();
        [..._parentLinks.values()].forEach(function(lk) {
            if (lk.toSelo !== _vm2.seloId) return;
            // Find the toPortal name — check if it matches _pid
            var _thisPortals = state.portals || new Map();
            var _toPortal = _thisPortals.get(_pid);
            if (!_toPortal || _toPortal.name !== lk.toPortalName) return;
            // Found matching link — find window name in parent's spawned
            var _parentSpawned = (_parentState && _parentState.spawned) || [];
            var _entry = _parentSpawned.find(function(e) {
                return e && e.linkId === lk.id;
            });
            if (!_entry) return;
            // Inject _resizeWindow into parent VM's model — direct, no ws.send!
            _parentVM.injectModelMessage('_resizeWindow', {
                name: _entry.windowName,
                w:    _d.w,
                h:    _d.h,
            }, _vm2.seloId);
        });
        return state; // no state change in world:2
    }
    // closePortal: { id } — remove portal and any links involving it
    if (msg.type === 'closePortal') {
        var _d = msg.data || {};
        var _pid = _d.id; if (!_pid) return state;
        var _portals = new Map(state.portals || new Map());
        _portals.delete(_pid);
        // Remove links that reference this portal
        var _links = new Map(state.portalLinks || new Map());
        _links.forEach(function(l, lid) {
            if (l.fromPortalId === _pid || l.toPortalId === _pid) _links.delete(lid);
        });
        // Remove spawned child VMs for removed links
        var _removedSeloIds = {};
        (state.portalLinks || new Map()).forEach(function(_, lid) {
            if (!_links.has(lid)) _removedSeloIds[lid] = true;
        });
        var _spawned = (state.spawned || []).filter(function(e) {
            return !(e && e.linkId && _removedSeloIds[e.linkId]);
        });
        return Object.assign({}, state, { portals: _portals, portalLinks: _links, spawned: _spawned });
    }
    // createLink: create a directional link from local portal to remote portal.
    // Spawns a child VM to toSelo so we can show its content through fromPortal.
    // { fromPortalId, fromPortalName, toSelo, toPortalName }
    // Direction: viewing toSelo through fromPortal, offset by toPortal's position.
    // createNamedPortal: create standalone named portal rect
    if (msg.type === 'createNamedPortal') {
        var _d = msg.data || {};
        var _name = (_d.name || '').trim();
        if (!_name) return state;
        var _portals = new Map(state.portals || new Map());
        if ([..._portals.values()].some(function(p) { return p.name === _name; })) return state;
        var _pid = uid('p');
        _portals.set(_pid, { id: _pid, name: _name,
            x: _d.x != null ? _d.x : 80,
            y: _d.y != null ? _d.y : 80,
            w: _d.w != null ? _d.w : 100,
            h: _d.h != null ? _d.h : 100 });
        return Object.assign({}, state, { portals: _portals });
    }
    if (msg.type === 'createLink') {
        var _d = msg.data || {};
        if (!_d.toSelo || !_d.toPortalName) return state;
        // Resolve fromPortalId by name if __pending__ (portal was just created)
        var _fromPortalId = _d.fromPortalId;
        if (!_fromPortalId || _fromPortalId === '__pending__') {
            if (!_d.fromPortalName) return state;
            var _fp = [...(state.portals || new Map()).values()].find(function(p) {
                return p.name === _d.fromPortalName;
            });
            if (!_fp) return state; // portal not found
            _fromPortalId = _fp.id;
        }
        var _links = new Map(state.portalLinks || new Map());
        // Prevent duplicate links
        var _dup = [..._links.values()].some(function(l) {
            return l.fromPortalId === _fromPortalId && l.toSelo === _d.toSelo && l.toPortalName === _d.toPortalName;
        });
        if (_dup) return state;
        var _lid = uid('link');
        _links.set(_lid, {
            id:            _lid,
            fromPortalId:  _fromPortalId,
            toSelo:        _d.toSelo,
            toPortalName:  _d.toPortalName,
        });
        // Spawn child VM to toSelo (tagged with linkId so _diffChildren wires it up)
        var _windowName = uid('lw') + '-' + _d.toSelo;
        var _spawned = (state.spawned || []).slice();
        // maxDepth: user-provided via :d=N, or null (inherits from parent VM in _diffChildren)
        var _linkMaxDepth = (_d.maxDepth != null) ? _d.maxDepth : null;
        _spawned.push({ windowName: _windowName, seloId: _d.toSelo, linkId: _lid, isPortal: true, maxDepth: _linkMaxDepth });
        return Object.assign({}, state, { portalLinks: _links, spawned: _spawned });
    }
    // deleteLink: { id }
    if (msg.type === 'deleteLink') {
        var _d = msg.data || {};
        var _lid = _d.id; if (!_lid) return state;
        var _links = new Map(state.portalLinks || new Map());
        _links.delete(_lid);
        var _spawned = (state.spawned || []).filter(function(e) {
            return !(e && e.linkId === _lid);
        });
        return Object.assign({}, state, { portalLinks: _links, spawned: _spawned });
    }
    // requestPairedPortal and setPairedPortal removed — replaced by explicit links.

`,
    // buildUI is null — VIEW_PROGRAM's _buildUI Renkon node handles DOM setup
    buildUI: null,
};


// ── portal-minimal ───────────────────────────────────────────────────────
// Minimal krestianified app demonstrating portals as PURE RENKON combinators.
// No manual applyAction. No world 2D dependency.
//
// Concept: 1D number line. World :b ticks a position counter, updating a
// portal anchor's offset. World :a links to :b and observes through the
// portal — computing a sliding window of 5 values centered on :b's offset.
// Console output shows the window on every tick.
//
// All portal operations are available as model preamble functions:
//   portal_create({ name, ...meta })        — createPortal
//   portal_update({ id/name, ...meta })     — updatePortal (+ cross-VM notify)
//   portal_delete({ id/name })              — deletePortal
//   portal_link({ fromPortalName, toSelo, toPortalName, maxDepth? })
//   portal_unlink({ id })                   — deleteLink
//   selo_spawn({ seloId, appName })
//   inject(targetVM, msgType, data)         — injectModelMessage
//   seloId                                  — this world's selo id
//
// Usage:
//   selo.html?k=portal-minimal:a   — source (links to :b, shows sliding window)
//   selo.html?k=portal-minimal:b   — target (ticking position, updates portal)
APPS["portal-minimal"] = {
    modelNodes: ['portals', 'portalLinks', '_autoSetup', '_tick', '_tickLoop'],
    app: `
const portals = Behaviors.collect(
    (_initialState && _initialState.portals) ? new Map(Object.entries(_initialState.portals)) : new Map(),
    Events.change(worldState), (_, s) => s ? (s.portals || new Map()) : new Map());
const portalLinks = Behaviors.collect(
    (_initialState && _initialState.portalLinks) ? new Map(Object.entries(_initialState.portalLinks)) : new Map(),
    Events.change(worldState), (_, s) => s ? (s.portalLinks || new Map()) : new Map());

// _autoSetup: once on first worldState — creates portals, seeds _tick ONLY on :b
const _autoSetup = Behaviors.collect(false, Events.once(worldState), function(done, ws) {
    if (done) return true;
    if (!ws || (ws.portals instanceof Map ? ws.portals.size : Object.keys(ws.portals || {}).length) > 0) return true;
    if (seloId.indexOf(':a') >= 0) {
        portal_create({ name: 'view-a', offset: 0 });
        portal_link({
            fromPortalId:   '__pending__',
            fromPortalName: 'view-a',
            toSelo:         seloId.replace(':a', ':b'),
            toPortalName:   'anchor-b',
        });
    }
    if (seloId.indexOf(':b') >= 0) {
        portal_create({ name: 'anchor-b', offset: 0 });
        future(now(), 2000, '_tick', { type: '_tick' });
    }
    return true;
});

// _tick / _tickLoop: exact same pattern as counter-timer app.
// _tick is a receiver fired by future(). _tickLoop reschedules it.
// Only :b updates the portal offset — :a's _tick never fires (not seeded).
const _tick = Events.receiver();

const _tickLoop = Behaviors.collect(null, _tick, function(_, __) {
    future(now(), 2000, '_tick', { type: '_tick' });
    if (seloId.indexOf(':b') >= 0) {
        var _pt = [...(portals || new Map()).values()][0];
        if (_pt) {
            var _cur = (_pt.meta && _pt.meta.offset != null) ? _pt.meta.offset : 0;
            portal_update({ id: _pt.id, offset: _cur + 1 });
        }
    }
    return null;
});

// ── VIEW ──────────────────────────────────────────────────────────────────

const _logPos = Behaviors.collect(null, Events.change(portals), function(_, pts) {
    var _off = [...(pts || new Map()).values()].map(function(p) {
        return p.name + '@' + ((p.meta || {}).offset || 0);
    }).join(', ');
    if (_off) console.log('[' + (Renkon.app.seloId || '?') + '] portals:', _off);
    return null;
});

const _portalUpdatedRx = Events.receiver();
const _logUpdate = Behaviors.collect(null, Events.change(_portalUpdatedRx), function(_, ev) {
    if (!ev) return null;
    var _off = ev.meta && ev.meta.offset != null ? ev.meta.offset : 0;
    var _win = [];
    for (var i = _off - 2; i <= _off + 2; i++) _win.push(i);
    console.log('[' + (Renkon.app.seloId || '?') + '] << portalUpdated from',
        ev.toSelo + '/' + ev.toPortalName,
        '| offset:', _off, '| window: [', _win.join(', '), ']');
    var el = rootEl && rootEl.querySelector && rootEl.querySelector('.pm-status');
    if (el) el.textContent = 'window: [' + _win.join(', ') + ']  (remote offset=' + _off + ')';
    return ev;
});

const _statusSync = Behaviors.collect(null,
    Events.or(Events.change(portals), Events.change(_portalUpdatedRx)),
    function(_, __) {
        var el = rootEl && rootEl.querySelector && rootEl.querySelector('.pm-pos');
        if (el) el.textContent = (Renkon.app.seloId || '?') +
            ' | portals: ' + [...(portals || new Map()).values()].map(function(p) {
                return p.name + '@' + ((p.meta || {}).offset || 0);
            }).join(', ');
        return null;
    }
);
`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) {
                c = document.createElement('div');
                c.className = 'vm-content';
                c.style.cssText =
                    'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c);
            }
            mount = c;
        }
        mount.innerHTML =
            '<div style="padding:10px;font-family:monospace;font-size:12px;' +
            'color:#334;line-height:2;">' +
            '<div class="pm-pos">initialising...</div>' +
            '<div class="pm-status" style="color:#669;">' +
            (label.indexOf(':a') >= 0 ? '(waiting for updates from :b...)' : '(ticking every 2s...)') +
            '</div>' +
            '<div style="color:#aaa;font-size:10px;margin-top:8px;">' +
            'open console for sliding window output' +
            '</div></div>';
        return mount;
    },
};


// ── portal-demo ──────────────────────────────────────────────────────────
// Krestianified app demonstrating portals, links, and inter-selo VM injection
// using the WORLD 2D app infrastructure (portal rects, link windows, avatars).
//
// Two roles detected from seloId suffix:
//   selo.html?k=portal-demo:source  — creates 2D portal rects + links to target
//   selo.html?k=portal-demo:target  — receives links, runs balls app
//
// Uses world's viewProgram + applyAction so all 2D portal handlers are available:
//   createNamedPortal, resizePortal, movePortal, closePortal,
//   createLink, deleteLink, _resizeWindow, _applyWindowResize, _notifyLinkedResize
//   + builtin: createPortal, updatePortal, spawnSelo, injectModelMessage
APPS["portal-demo"] = {
    modelNodes: ['ticking', 'windows', 'portals', 'portalLinks',
                 'counter', 'randomResult', 'tick', 'subTick', 'subCounter', '_autoSetup'],
    app: `
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    Events.change(worldState), (_, s) => s ? s.ticking : false);
const windows = Behaviors.collect(
    { map: (_initialState && _initialState.windows) ? new Map(Object.entries(_initialState.windows)) : new Map() },
    Events.change(worldState), (_, s) => s ? { map: s.windows || new Map() } : { map: new Map() });
const portals = Behaviors.collect(
    { map: (_initialState && _initialState.portals) ? new Map(Object.entries(_initialState.portals)) : new Map() },
    Events.change(worldState), (_, s) => s ? { map: s.portals || new Map() } : { map: new Map() });
const portalLinks = Behaviors.collect(
    { map: (_initialState && _initialState.portalLinks) ? new Map(Object.entries(_initialState.portalLinks)) : new Map() },
    Events.change(worldState), (_, s) => s ? { map: s.portalLinks || new Map() } : { map: new Map() });
const counter = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    Events.change(worldState), (_, s) => s ? (s.counter || 0) : 0);
const randomResult = Behaviors.collect(
    (_initialState && _initialState.randomResult) || null,
    Events.change(worldState), (_, s) => s ? s.randomResult : null);
const tick     = Events.receiver();
const subTick  = Events.receiver();
const subCounter = Behaviors.collect(
    (_initialState && _initialState.subCounter) || 0,
    subTick, function(prev, _) { return prev + 1; });

// ── Auto-setup: model-side, runs once on first join ──────────────────────
// Uses Events.once(worldState) so it fires exactly once in the model PS.
// future() calls are deterministic — all peers produce the same result.
// createNamedPortal and createLink are handled by world's applyAction (wired below).
const _autoSetup = Behaviors.collect(false, Events.once(worldState), function(done, ws) {
    if (done) return true;
    if (!ws || (ws.portals instanceof Map ? ws.portals.size : Object.keys(ws.portals || {}).length) > 0) return true;

    if (seloId.indexOf(':source') >= 0) {
        var _targetSelo = seloId.replace(':source', ':target');
        future(ws.time, 0, 'createNamedPortal',
            { name: 'src-view', x: 60, y: 60, w: 240, h: 180 });
        future(ws.time, 5, 'createLink', {
            fromPortalId:   '__pending__',
            fromPortalName: 'src-view',
            toSelo:         _targetSelo,
            toPortalName:   'tgt-anchor',
        });
    }

    if (seloId.indexOf(':target') >= 0) {
        future(ws.time, 0, 'createNamedPortal',
            { name: 'tgt-anchor', x: 80, y: 80, w: 240, h: 180 });
        future(ws.time, 5, 'spawnSelo',
            { seloId: seloId + '-balls', appName: 'balls' });
    }

    return true;
});

// ── injectModelMessage — available in any model combinator ───────────────
// injectModelMessage(targetVM, msgType, data) bypasses the reflector and
// directly enqueues into the target VM's model queue at its current vTime.
// Every peer running this model produces the same call deterministically.
//
// The built-in resizePortal chain uses it automatically:
//   resizePortal (world:target) → future(0, _notifyLinkedResize)
//   → injectModelMessage(parentVM, _resizeWindow, { name, w, h })
//   → world:source model: future(0, _applyWindowResize) → windows updated
//
// Custom usage example (add to your model combinators):
//   injectModelMessage(app.vm._parent, 'myCustomMsg', { value: 42 })

`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) {
                c = document.createElement('div');
                c.className = 'vm-content';
                c.style.cssText =
                    'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c);
            }
            mount = c;
        }
        mount.innerHTML =
            '<div style="position:absolute;inset:8px 10px auto;font-size:11px;' +
            'font-family:monospace;color:#446;font-weight:bold;">' + label + '</div>' +
            '<div style="position:absolute;top:30px;left:10px;right:10px;' +
            'font-size:10px;font-family:monospace;color:#889;line-height:1.8;">' +
            'portal-demo &mdash; krestianified<br>' +
            'portals &bull; links &bull; injectModelMessage<br>' +
            'resize target portal &rarr; source window resizes' +
            '</div>';
        return mount;
    },
};

// Wire portal-grid and portal-demo to world's programs
if (APPS['world']) {
    if (APPS['portal-grid']) {
        APPS['portal-grid'].viewProgram = APPS['world'].viewProgram;
        APPS['portal-grid'].applyAction = APPS['world'].applyAction;
    }
    if (APPS['portal-demo']) {
        // portal-demo uses world's viewProgram AND applyAction because it uses
        // 2D portal handlers (createNamedPortal, resizePortal, _notifyLinkedResize,
        // _resizeWindow, _applyWindowResize) which live in the world demo layer.
        // The builtin VM handlers (createPortal, createLink etc.) are always included.
        APPS['portal-demo'].viewProgram = APPS['world'].viewProgram;
        APPS['portal-demo'].applyAction = APPS['world'].applyAction;
    }
}

// ── installDOMHandlers ────────────────────────────────────────────────────
// Sets viewAppExtra on a VM before boot. Replaces the dom-demo.js version.
// resolveApp is optional — pass it so portal input can resolve named apps.
export function installDOMHandlers(vm, rootEl, resolveApp) {
    vm.viewAppExtra = Object.assign(vm.viewAppExtra || {}, {
        rootEl:     rootEl,
        UI:         typeof KrestianstvoUI !== 'undefined' ? KrestianstvoUI : null,
        resolveApp: resolveApp || null,
    });
}

// resolveApp(rawKey) — parse "appName:seloId" or plain "seloId"
// Returns { appName, seloId, appDef } where appDef may be null (plain join).
export function resolveApp(rawKey) {
    var v = (rawKey || '').trim();
    var colonIdx = v.indexOf(':');
    if (colonIdx > 0) {
        var appName = v.slice(0, colonIdx).trim();
        var seloId  = v.slice(colonIdx + 1).trim();
        var appDef  = APPS[appName] || null;
        if (appDef) {
            // seloId may be empty — model will generate deterministically via uid()
            return { appName: appName, seloId: seloId, appDef: appDef };
        }
    }
    // Unknown prefix or no colon — treat as plain seloId
    return { appName: null, seloId: v, appDef: null };
}
