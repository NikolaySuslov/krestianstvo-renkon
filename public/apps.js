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
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
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
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
        mount.innerHTML = '<span style="font-size:11px;color:#889">' + (label||'') + '</span>' +
            '<div id="renkon"><div id="count">0</div>' +
            '<div style="display:flex;gap:12px"><button id="incr">+</button><button id="decr">−</button></div></div>';
        return mount;
    },
};

// ── counter2 — circle display with counter/subCounter, spacebar toggles ticking ─
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

const _render = Behaviors.collect(null,
    Events.or(Events.change(counter), Events.change(subCounter), Events.change(ticking)),
    function(_, __) {
        var rEl = rootEl;
        if (!rEl) return null;
        var circle = rEl.querySelector('.c2-circle');
        if (!circle) {
            circle = document.createElement('div');
            circle.className = 'c2-circle';
            circle.style.cssText =
                'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
                'width:90px;height:90px;border-radius:50%;background:#8899bb;' +
                'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                'pointer-events:none;transition:transform 0.15s;';
            var olbl = document.createElement('div');
            olbl.className = 'c2-cnt';
            olbl.style.cssText = 'font-size:22px;font-family:monospace;font-weight:bold;color:#fff;';
            var inner = document.createElement('div');
            inner.className = 'c2-inner';
            inner.style.cssText =
                'width:36px;height:36px;border-radius:50%;margin-top:4px;' +
                'border:2px solid rgba(255,255,255,0.65);display:flex;' +
                'align-items:center;justify-content:center;' +
                'font-size:11px;font-family:monospace;font-weight:bold;color:#fff;';
            circle.appendChild(olbl);
            circle.appendChild(inner);
            rEl.appendChild(circle);
        }
        circle.style.transform = ticking
            ? 'translate(-50%,-50%) scale(1.15)'
            : 'translate(-50%,-50%) scale(1)';
        var olbl = circle.querySelector('.c2-cnt');
        var inner = circle.querySelector('.c2-inner');
        if (olbl)  olbl.textContent  = counter || 0;
        if (inner) inner.textContent = subCounter || 0;
        return null;
    }
);
`,
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
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
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
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
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
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
    modelNodes: ['objects', '_move',
                 'windows', '_moveWindow', '_resizeWindow', '_rotateWindow', '_closeWindow', '_applyWindowResize',
                 'portals', 'movePortal', 'resizePortal', 'rotatePortal', 'scalePortal',
                 'portalLinks', '_rotateLinkPortal', '_scaleLinkPortal',
                 'spawned',
                 '_notifyLinkedResize', '_notifyLinkedRotate', '_notifyLinkedScale',
                 'setPortal', 'portalText'],
    app: `
// ── MODEL nodes: shared, deterministic, replicated ────────────────────────
// windows, portals, portalLinks: use Behaviors.select for clean per-message dispatch

// objects — avatar map owned entirely by the app; VM only holds _peers (bare IDs).
// {map: Map} wrapper keeps same format as windows/portals/portalLinks.
const _move = Events.receiver();
const objects = Behaviors.select(
    { map: new Map() },
    Events.once(worldState), function(prev, s) {
        if (!s || !s.objects) return prev;
        var _obj = s.objects;
        var _m = _obj instanceof Map ? new Map(_obj) : new Map(Object.entries(_obj));
        return { map: _m };
    },
    Events.change(clientJoined), function(prev, joined) {
        if (!joined || !joined.length) return prev;
        var _pal = ['#e05555','#0077cc','#0a9960','#f87800','#8833ee','#009bbb','#cc4400','#558800','#b05090','#207070'];
        var _next = new Map(prev.map);
        joined.forEach(function(id) {
            if (_next.get(id)) return;
            var _color = _pal[Math.floor(random() * _pal.length)];
            _next.set(id, { joinedAt: now(), color: _color, x: 80, y: 80 });
        });
        return { map: _next };
    },
    Events.change(clientLeft), function(prev, left) {
        if (!left || !left.length) return prev;
        var _next = new Map(prev.map);
        left.forEach(function(id) { _next.delete(id); });
        return { map: _next };
    },
    _move, function(prev, ev) {
        if (!ev || !ev.from || ev.x === undefined) return prev;
        var _e = prev.map.get(ev.from);
        if (!_e) return prev;
        _e.x = ev.x; _e.y = ev.y;
        return { map: prev.map };
    }
);

// windows — Behaviors.select: pure FRP, applyAction is a passthrough for these.
// new Map() initial is safe; Events.once(worldState) seeds from snapshot before any arm fires.
const _moveWindow        = Events.receiver();
const _resizeWindow      = Events.receiver();
const _rotateWindow      = Events.receiver();
const _closeWindow       = Events.receiver();
const _applyWindowResize = Events.receiver();
const windows = Behaviors.select(
    { map: new Map() },
    Events.once(worldState), function(prev, s) {
        if (!s || !s.windows) return prev;
        var _m = s.windows instanceof Map ? new Map(s.windows) : new Map(Object.entries(s.windows));
        return { map: _m };
    },
    _moveWindow,        function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { x: ev.x, y: ev.y }));
        return { map: prev.map };
    },
    _resizeWindow,      function(prev, ev) {
        if (!ev || !ev.name) return prev;
        if (ev._injected) {
            future(vTime, 0, '_applyWindowResize', { name: ev.name, w: ev.w, h: ev.h });
            return prev; // deferred to _applyWindowResize for deterministic cross-world ordering
        }
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { w: ev.w, h: ev.h }));
        return { map: prev.map };
    },
    _rotateWindow,      function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { r: ev.r }));
        return { map: prev.map };
    },
    _closeWindow,       function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.delete(ev.name);
        return { map: prev.map };
    },
    _applyWindowResize, function(prev, ev) {
        if (!ev || !ev.name) return prev;
        prev.map.set(ev.name, Object.assign({}, prev.map.get(ev.name) || {}, { w: ev.w, h: ev.h }));
        return { map: prev.map };
    }
);

// portals — Behaviors.select: pure FRP. Model-generated IDs via uid('p').
// new Map() initial is safe; Events.once(worldState) seeds from snapshot before any arm fires.
const createPortal      = Events.receiver();
const createNamedPortal = Events.receiver();
const movePortal        = Events.receiver();
const resizePortal      = Events.receiver();
const rotatePortal      = Events.receiver();
const scalePortal       = Events.receiver();
const closePortal       = Events.receiver();
const portals = Behaviors.select(
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
        prev.map.set(_pid, {
            id: _pid, name: ev.name,
            x: ev.x != null ? ev.x : 60, y: ev.y != null ? ev.y : 60,
            w: ev.w != null ? ev.w : 320, h: ev.h != null ? ev.h : 240,
        });
        return { map: prev.map };
    },
    createNamedPortal, function(prev, ev) {
        if (!ev || !ev.name) return prev;
        if ([...prev.map.values()].some(function(p) { return p.name === ev.name; })) return prev;
        var _pid = uid('p');
        prev.map.set(_pid, {
            id: _pid, name: ev.name,
            x: ev.x != null ? ev.x : 80, y: ev.y != null ? ev.y : 80,
            w: ev.w != null ? ev.w : 100, h: ev.h != null ? ev.h : 100,
        });
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
        if (!ev || !ev.id) return prev;
        prev.map.delete(ev.id);
        return { map: prev.map };
    }
);

// portalLinks — Behaviors.select: pure FRP. Model-generated IDs via uid('link').
// new Map() initial is safe; Events.once(worldState) seeds from snapshot before any arm fires.
const createLink        = Events.receiver();
const deleteLink        = Events.receiver();
const _rotateLinkPortal = Events.receiver();
const _scaleLinkPortal  = Events.receiver();
const portalLinks = Behaviors.select(
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
        var _lid = uid('link'); // deterministic: same uid() call order on all peers
        prev.map.set(_lid, { id: _lid, fromPortalId: _fromPortalId, toSelo: ev.toSelo, toPortalName: ev.toPortalName });
        return { map: prev.map };
    },
    deleteLink, function(prev, ev) {
        if (!ev || !ev.id) return prev;
        prev.map.delete(ev.id);
        return { map: prev.map };
    },
    closePortal, function(prev, ev) {
        if (!ev || !ev.id) return prev;
        prev.map.forEach(function(l, lid) {
            if (l.fromPortalId === ev.id || l.toPortalId === ev.id) prev.map.delete(lid);
        });
        return { map: prev.map };
    },
    _rotateLinkPortal, function(prev, ev) {
        if (!ev || !ev.linkId || !prev.map.get(ev.linkId)) return prev;
        prev.map.set(ev.linkId, Object.assign({}, prev.map.get(ev.linkId), { r: ev.r }));
        return { map: prev.map };
    },
    _scaleLinkPortal, function(prev, ev) {
        if (!ev || !ev.linkId || !prev.map.get(ev.linkId)) return prev;
        prev.map.set(ev.linkId, Object.assign({}, prev.map.get(ev.linkId), { s: ev.s }));
        return { map: prev.map };
    }
);

// spawned — Behaviors.select: pure FRP list of child VMs to maintain.
// [] initial is safe; Events.once(worldState) seeds from snapshot before any arm fires.
// _diffChildren in meta PS reads this node directly — no worldState mirror needed.
const spawnSelo   = Events.receiver();
const _joinWindow = Events.receiver();
const spawned = Behaviors.select(
    [],
    Events.once(worldState), function(prev, s) {
        if (!s || !s.spawned) return prev;
        return Array.isArray(s.spawned) ? s.spawned.slice() : prev;
    },
    spawnSelo, function(prev, ev) {
        if (!ev || (!ev.seloId && !ev.appName)) return prev;
        var _seloId = ev.seloId || uid(ev.appName || 'child'); // uid fallback mirrors old VM behavior
        var _windowName = uid('w') + '-' + _seloId;
        var _maxDepth = (ev.maxDepth != null) ? ev.maxDepth : null;
        var _next = prev.slice();
        _next.push({ windowName: _windowName, seloId: _seloId, appName: ev.appName || null, maxDepth: _maxDepth });
        return _next;
    },
    createLink, function(prev, ev) {
        if (!ev || !ev.toSelo || !ev.toPortalName) return prev;
        // portalLinks arm runs first (declared above) — read the just-created link for its id.
        var _fromPortalId = ev.fromPortalId;
        if (!_fromPortalId || _fromPortalId === '__pending__') {
            if (!ev.fromPortalName) return prev;
            var _fp = [...portals.map.values()].find(function(p) { return p.name === ev.fromPortalName; });
            if (!_fp) return prev;
            _fromPortalId = _fp.id;
        }
        var _link = [...portalLinks.map.values()].find(function(l) {
            return l.fromPortalId === _fromPortalId && l.toSelo === ev.toSelo && l.toPortalName === ev.toPortalName;
        });
        if (!_link) return prev; // portalLinks rejected it (dup or missing portal)
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
        if (!ev || !ev.id) return prev;
        // Filter entries whose fromPortalId matches — no portalLinks lookup needed.
        return prev.filter(function(e) { return !(e && e.isPortal && e.fromPortalId === ev.id); });
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
    }
);

// _notifyLinkedResize/Rotate/Scale — model-side side-effect nodes.
// Fire when a portal is resized/rotated/scaled; inject into parent VM so its
// linked window frame updates. Helper logic inlined (plain functions are not
// included by krestianify's findDecls and would be undefined at model runtime).
const _notifyLinkedResize = Behaviors.collect(null, resizePortal, (_, ev) => {
    if (!ev?.id || !app.vm) return null;
    const _vm2 = app.vm, _parentVM = _vm2._parent;
    if (!_parentVM) return null;
    const _parentLinks = (_parentVM._getModelNode(_parentVM.modelPS, 'portalLinks')?.map) || new Map();
    const _toPortal = portals.map.get(ev.id);
    const _spawned = _parentVM._getModelNode(_parentVM.modelPS, 'spawned');
    const _spArr = Array.isArray(_spawned) ? _spawned : [];
    [..._parentLinks.values()].forEach(lk => {
        if (lk.toSelo !== _vm2.seloId || _toPortal?.name !== lk.toPortalName) return;
        const _entry = _spArr.find(e => e?.linkId === lk.id);
        if (_entry) _parentVM.injectModelMessage('_resizeWindow', { name: _entry.windowName, w: ev.w, h: ev.h }, _vm2.seloId);
    });
    return null;
});
const _notifyLinkedRotate = Behaviors.collect(null, rotatePortal, (_, ev) => {
    if (!ev?.id || !app.vm) return null;
    const _vm2 = app.vm, _parentVM = _vm2._parent;
    if (!_parentVM) return null;
    const _parentLinks = (_parentVM._getModelNode(_parentVM.modelPS, 'portalLinks')?.map) || new Map();
    const _toPortal = portals.map.get(ev.id);
    [..._parentLinks.values()].forEach(lk => {
        if (lk.toSelo !== _vm2.seloId || _toPortal?.name !== lk.toPortalName) return;
        _parentVM.injectModelMessage('_rotateLinkPortal', { linkId: lk.id, r: ev.r }, _vm2.seloId);
    });
    return null;
});
const _notifyLinkedScale = Behaviors.collect(null, scalePortal, (_, ev) => {
    if (!ev?.id || !app.vm) return null;
    const _vm2 = app.vm, _parentVM = _vm2._parent;
    if (!_parentVM) return null;
    const _parentLinks = (_parentVM._getModelNode(_parentVM.modelPS, 'portalLinks')?.map) || new Map();
    const _toPortal = portals.map.get(ev.id);
    [..._parentLinks.values()].forEach(lk => {
        if (lk.toSelo !== _vm2.seloId || _toPortal?.name !== lk.toPortalName) return;
        _parentVM.injectModelMessage('_scaleLinkPortal', { linkId: lk.id, s: ev.s }, _vm2.seloId);
    });
    return null;
});

// portalText — synced portal bar input value; snapshotted so joiners restore it.
const setPortal  = Events.receiver();
const portalText = Behaviors.collect('', setPortal,
    function(_, ev) { return (ev && typeof ev === 'object') ? (ev.value || '') : (ev || ''); });

// ── VIEW nodes: local per-client ──────────────────────────────────────────
// (provided by the VIEW_PROGRAM)
`,
    viewProgram: `

// ── Model state receivers ─────────────────────────────────────────────────
// These receive values pushed by VM after each model drain (via modelStateKeys).
const windows      = Behaviors.collect({map: new Map()}, Events.receiver(), function(_,v){return v||{map: new Map()};});
const portals      = Behaviors.collect({map: new Map()}, Events.receiver(), function(_,v){return v||{map: new Map()};});
const portalLinks  = Behaviors.collect({map: new Map()}, Events.receiver(), function(_,v){return v||{map: new Map()};});
const portalText   = Behaviors.collect('', Events.receiver(), function(_, v) { return v || ''; });

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
    rEl._stripEl = strip;
    rEl._clockEl = stats.querySelector('.vm-clock');
    rEl._peersEl = stats.querySelector('.vm-peers');
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

    var cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    var cy = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

    // Compute coords in rEl's LOGICAL (pre-own-transform) space.
    // rEl may have rotate/scale applied by a parent world's _portalLinkSync.
    // parent.getBoundingClientRect() captures all ancestor transforms; rEl.offsetLeft/Top
    // gives the CSS-positioned offset (unaffected by rEl's own transform).
    var _parent = rEl.parentElement;
    var _pr = _parent ? _parent.getBoundingClientRect() : { left: 0, top: 0 };
    var rx = cx - _pr.left - (rEl.offsetLeft || 0);
    var ry = cy - _pr.top  - (rEl.offsetTop  || 0);
    var _st = window.getComputedStyle(rEl);
    var _tf = _st.transform;
    if (_tf && _tf !== 'none') {
        var _op = (_st.transformOrigin || '0 0').split(' ').map(parseFloat);
        var _ox = _op[0] || 0, _oy = _op[1] || 0;
        var _inv = new window.DOMMatrix(_tf).inverse();
        var _p = _inv.transformPoint(new window.DOMPoint(rx - _ox, ry - _oy));
        rx = _p.x + _ox; ry = _p.y + _oy;
    }
    // Subtract avatar layer's top offset (title-bar height) to stay in layer-local coords
    var _layerTop = (_layer && _layer.offsetTop) || 0;
    return { x: Math.round(rx), y: Math.round(ry - _layerTop) };
}
const _clickDoc = Events.or(
    Events.listener(document, 'click',      _clickHandler),
    Events.listener(document, 'touchstart', _clickHandler)
);
const _moveDoc = Events.or(
    Events.listener(document, 'mousemove', _clickHandler),
    Events.listener(document, 'touchmove', _clickHandler)
);
const _timerMove  = Events.timer((Renkon.app.depth || 0) > 7 ? 50 * (1 + Math.max(0, (Renkon.app.depth || 0) - 1)) : 50);
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
    var _dMatch = v.match(/:d=(\d+)$/);
    if (_dMatch) { maxDepth = parseInt(_dMatch[1], 10); v = v.slice(0, v.lastIndexOf(':d=')).trim(); }
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


// ── renderer — 60hz DOM update ────────────────────────────────────────────
const renderTick = Events.timer(16);
const renderer = Behaviors.collect(null, renderTick, function(_, __) {
    var rEl  = rootEl;
    if (!rEl || !UI) return null;
    var objs    = (objects && objects.map) || new Map();
    var myId    = clientIdentity && clientIdentity.clientId;
    var ws      = Renkon.app.ws;
    var depth    = Renkon.app.depth    || 0;
    var maxDepth = Renkon.app.maxDepth != null ? Renkon.app.maxDepth : 5;
    var atMax    = depth >= maxDepth;

    var clockEl = rEl._clockEl;
    var peersEl = rEl._peersEl;
    if (clockEl) clockEl.textContent = vTime || 0;
    if (peersEl) peersEl.textContent = objs.size;

    var portalBar = rEl._portalBar;

    if (!portalBar) {
    var _pbResult = UI.createPortalBar(rEl, {
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
                    name: parsed.portalName,
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
    });
    portalBar = _pbResult.bar;
    rEl._portalBar = portalBar;
    rEl._portalInp = _pbResult.input;
};

    var portalInp = rEl._portalInp;
    if (portalInp && !atMax && document.activeElement !== portalInp) {
        var pStr = (typeof portalText === 'object' && portalText !== null)
            ? (portalText.value || '') : (portalText || '');
        portalInp.value = pStr;
    }

    var layer = rEl._avatarLayer;

    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'vm-avatar-layer';
        layer._avatarMap = new Map();
        // Top offset = height of stats strip if directly inside rEl
        var _topOff = rEl._stripEl ? (rEl._stripEl.offsetHeight || 22) : 0;
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
        rEl._avatarLayer = layer;
    }

    // Keep avatar layer as last DOM child so it's always painted above portal windows.
    // Portal containers are appended to rEl after the layer; re-appending moves it last.
    //if (rEl.lastElementChild !== layer) rEl.appendChild(layer);

    if (!layer._avatarMap) layer._avatarMap = new Map();
    // Stale-cleanup: remove cached elements for IDs no longer in the avatar Map.
    // Belt-and-suspenders against timing races where _avatarLeftSync already cleared
    // _avatarMap but objects hasn't propagated yet, causing the renderer to re-create ghosts.
    layer._avatarMap.forEach(function(el, id) {
        if (!objs.has(id)) { el.remove(); layer._avatarMap.delete(id); }
    });
    objs.forEach(function(obj, id) {
        var el = layer._avatarMap.get(id);
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
            layer._avatarMap.set(id, el);
        } else {
            tri = el._avTri;
        }
        var color = obj.color || '#8899bb';
        if (tri) tri.style.background = color;
        el.style.transform = 'translate3d(' + ((obj.x || 80) - 15) + 'px,' + ((obj.y || 80) - 15) + 'px,0)';
        el.style.opacity   = id === myId ? '0.5' : '0.4';
    });

    return null;
});

// ── _avatarLeftSync — remove departed avatar elements on clientLeft event ──
const _avatarLeftSync = Behaviors.collect(null, Events.change(clientLeft), function(_, left) {
    if (!left || !left.length) return null;
    var rEl = rootEl; if (!rEl) return null;
    var layer = rEl._avatarLayer;
    if (!layer) return null;
    left.forEach(function(id) {
        var el = layer._avatarMap ? layer._avatarMap.get(id) : layer.querySelector('[data-client-id="' + id + '"]');
        if (el) { el.remove(); layer._avatarMap && layer._avatarMap.delete(id); }
    });
    return null;
});

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

// ── _attachGesture — unified mouse+touch drag helper ─────────────────────
// Attaches mousedown/touchstart to el; calls onStart(cx,cy), onMove(cx,cy),
// onEnd(cx,cy) during drag. opts.filter(e) can veto the gesture start.
function _attachGesture(el, onStart, onMove, onEnd, opts) {
    var filter = opts && opts.filter;
    function _mm(e) { onMove(e.clientX, e.clientY); }
    function _mu(e) {
        onEnd(e.clientX, e.clientY);
        document.removeEventListener('mousemove', _mm);
        document.removeEventListener('mouseup', _mu);
    }
    function _tm(e) { e.preventDefault(); var t = e.touches[0]; onMove(t.clientX, t.clientY); }
    function _tu(e) {
        var t = e.changedTouches[0]; onEnd(t.clientX, t.clientY);
        document.removeEventListener('touchmove', _tm);
        document.removeEventListener('touchend', _tu);
    }
    el.addEventListener('mousedown', function(e) {
        if (filter && !filter(e)) return;
        e.stopPropagation(); e.preventDefault();
        onStart(e.clientX, e.clientY);
        document.addEventListener('mousemove', _mm);
        document.addEventListener('mouseup', _mu);
    });
    el.addEventListener('touchstart', function(e) {
        if (filter && !filter(e)) return;
        e.stopPropagation(); e.preventDefault();
        var t = e.touches[0]; onStart(t.clientX, t.clientY);
        document.addEventListener('touchmove', _tm, { passive: false });
        document.addEventListener('touchend', _tu);
    }, { passive: false });
}

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
                var _scaling=false, _last=0, _startY=0, _startScale=1;
                _attachGesture(_sh2,
                    function(_, cy) { _scaling=true; _startY=cy; _startScale=parseFloat(rect.dataset.scale)||1; },
                    function(_, cy) {
                        if (!_scaling) return;
                        var now=Date.now(); if (now-_last<50) return; _last=now;
                        var s=Math.max(0.1,Math.round((_startScale+(cy-_startY)/100)*100)/100);
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'scalePortal',data:{id:_pid,s:s}}));
                    },
                    function(_, cy) {
                        if (!_scaling) return; _scaling=false;
                        var s=Math.max(0.1,Math.round((_startScale+(cy-_startY)/100)*100)/100);
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'scalePortal',data:{id:_pid,s:s}}));
                    }
                );
            })(pid);
            rect.appendChild(_sh2);

            // Resize handle
            var _rh = document.createElement('div');
            _rh.style.cssText =
                'position:absolute;bottom:0;right:0;width:22px;height:22px;cursor:se-resize;touch-action:none;' +
                'background:linear-gradient(135deg,transparent 50%,rgba(100,180,255,0.7) 50%);' +
                'border-bottom-right-radius:3px;';
            (function(_pid) {
                var _sw=0, _sh=0, _sx=0, _sy=0, _rsz=false, _last=0;
                _attachGesture(_rh,
                    function(cx, cy) { _rsz=true; _sw=parseInt(rect.style.width)||320; _sh=parseInt(rect.style.height)||240; _sx=cx; _sy=cy; },
                    function(cx, cy) {
                        if (!_rsz) return;
                        var now=Date.now(); if (now-_last<50) return; _last=now;
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'resizePortal',data:{id:_pid,w:Math.round(Math.max(80,_sw+cx-_sx)),h:Math.round(Math.max(60,_sh+cy-_sy))}}));
                    },
                    function(cx, cy) {
                        if (!_rsz) return; _rsz=false;
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'resizePortal',data:{id:_pid,w:Math.round(Math.max(80,_sw+cx-_sx)),h:Math.round(Math.max(60,_sh+cy-_sy))}}));
                    }
                );
            })(pid);
            rect.appendChild(_rh);

            // Rotation handle — bottom-left corner
            var _rot = document.createElement('div');
            _rot.style.cssText =
                'position:absolute;bottom:0;left:0;width:22px;height:22px;cursor:grab;touch-action:none;' +
                'background:linear-gradient(225deg,transparent 50%,rgba(100,220,160,0.7) 50%);' +
                'border-bottom-left-radius:3px;';
            (function(_pid) {
                var _rotating=false, _last=0, _startAngle=0, _startR=0;
                function _rawAngle(cx, cy) {
                    var br=rect.getBoundingClientRect();
                    return Math.atan2(cy-(br.top+br.height/2), cx-(br.left+br.width/2)) * 180/Math.PI;
                }
                _attachGesture(_rot,
                    function(cx, cy) { _rotating=true; _startAngle=_rawAngle(cx,cy); _startR=parseFloat((rect.style.transform||'').replace(/rotate\(|deg\)/g,''))||0; },
                    function(cx, cy) {
                        if (!_rotating) return;
                        var now=Date.now(); if (now-_last<50) return; _last=now;
                        var r=Math.round(_startR+_rawAngle(cx,cy)-_startAngle);
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'rotatePortal',data:{id:_pid,r:r}}));
                    },
                    function(cx, cy) {
                        if (!_rotating) return; _rotating=false;
                        var r=Math.round(_startR+_rawAngle(cx,cy)-_startAngle);
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'rotatePortal',data:{id:_pid,r:r}}));
                    }
                );
            })(pid);
            rect.appendChild(_rot);

            // Drag — mouse + touch
            (function(_pid) {
                var _ox=0, _oy=0, _mx=0, _my=0, _drag=false, _last=0;
                _attachGesture(rect,
                    function(cx, cy) { _drag=true; _ox=parseInt(rect.style.left)||0; _oy=parseInt(rect.style.top)||0; _mx=cx; _my=cy; },
                    function(cx, cy) {
                        if (!_drag) return;
                        var now=Date.now(); if (now-_last<50) return; _last=now;
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'movePortal',data:{id:_pid,x:Math.round(_ox+cx-_mx),y:Math.round(_oy+cy-_my)}}));
                    },
                    function(cx, cy) {
                        if (!_drag) return; _drag=false;
                        if (ws&&ws.readyState===1) ws.send(JSON.stringify({type:'movePortal',data:{id:_pid,x:Math.round(_ox+cx-_mx),y:Math.round(_oy+cy-_my)}}));
                    },
                    { filter: function(e) { return e.target === rect || e.target === lbl; } }
                );
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

        // Sync position/size/transform from model
        rect.style.left   = (p.x || 0) + 'px';
        rect.style.top    = (p.y || 0) + 'px';
        rect.style.width  = (p.w || 200) + 'px';
        rect.style.height = (p.h || 180) + 'px';
        var _rectR = p.r != null ? p.r : 0;
        var _rectS = p.s != null ? p.s : 1;
        var _rectSVis = _rectS !== 0 ? (1 / _rectS) : 1; // inverse: big scale = small rect
        rect.style.transform = (_rectR !== 0 || _rectS !== 1)
            ? 'rotate(' + _rectR + 'deg) scale(' + _rectSVis + ')' : '';
        rect.dataset.scale = _rectS; // keep scale handle's _startScale in sync
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
            // Apply rotation and scale to viewport content — driven by remote portal's r/s
            var _r = (lk.r != null) ? lk.r : 0;
            var _s = (lk.s != null) ? lk.s : 1;
            // Keep dataset.scale in sync so the scale handle reads current value
            var _rectEl = winEl.querySelector && Array.from(rEl.children)
                .find(function(c) { return c.dataset && c.dataset.portalId === lk.fromPortalId; });
            if (_rectEl) _rectEl.dataset.scale = _s;
            if (_r !== 0 || _s !== 1) {
                // Pivot at center of the visible portal area so zoom/rotate stays centered
                var _pw = (fromPortal && fromPortal.w) || 200;
                var _ph = (fromPortal && fromPortal.h) || 180;
                contentEl.style.transform = 'rotate(' + _r + 'deg) scale(' + _s + ')';
                contentEl.style.transformOrigin = ((-offX) + _pw / 2) + 'px ' + ((-offY) + _ph / 2) + 'px';
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
    modelNodes: ['createPortal', 'updatePortal', 'createLink', 'portals', 'portalLinks', 'spawned', '_autoSetup', '_tick', '_tickLoop'],
    app: `
// portals — Behaviors.select: pure FRP. createPortal/updatePortal handled by FRP + VM preamble.
const createPortal = Events.receiver();
const updatePortal = Events.receiver();
const createLink   = Events.receiver();
const portals = Behaviors.select(
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
        prev.map.set(_pid, { id: _pid, name: ev.name, meta: ev });
        return { map: prev.map };
    },
    updatePortal, function(prev, ev) {
        if (!ev || !ev.id) return prev;
        var _p = prev.map.get(ev.id);
        if (!_p) return prev;
        var _newMeta = Object.assign({}, _p.meta || {}, ev);
        delete _newMeta.id;
        prev.map.set(ev.id, Object.assign({}, _p, { meta: _newMeta }));
        return { map: prev.map };
    }
);
const portalLinks = Behaviors.select(
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
    }
);
// spawned — mirrors world.app pattern: createLink arm spawns portal child VMs.
const spawned = Behaviors.select(
    [],
    Events.once(worldState), function(prev, s) {
        if (!s || !s.spawned) return prev;
        return Array.isArray(s.spawned) ? s.spawned.slice() : prev;
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
        var _next = prev.slice();
        _next.push({ windowName: _windowName, seloId: ev.toSelo, linkId: _link.id, fromPortalId: _fromPortalId, isPortal: true });
        return _next;
    }
);

// _autoSetup: once on first worldState — creates portals, seeds _tick ONLY on :b
const _autoSetup = Behaviors.collect(false, Events.once(worldState), function(done, ws) {
    if (done) return true;
    // Guard: skip if portals already exist (snapshot restore) — check FRP node and worldState
    if (!ws) return true;
    var _existingPortals = portals.map.size > 0
        || (ws.portals instanceof Map ? ws.portals.size : Object.keys(ws.portals || {}).length) > 0;
    if (_existingPortals) return true;
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
        var _pt = [...portals.map.values()][0];
        if (_pt) {
            var _cur = (_pt.meta && _pt.meta.offset != null) ? _pt.meta.offset : 0;
            portal_update({ id: _pt.id, offset: _cur + 1 });
        }
    }
    return null;
});

// ── VIEW ──────────────────────────────────────────────────────────────────

const _logPos = Behaviors.collect(null, Events.change(portals), function(_, pts) {
    var _m = pts && pts.map instanceof Map ? pts.map : (pts instanceof Map ? pts : new Map());
    var _off = [..._m.values()].map(function(p) {
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
        var _pm = portals && portals.map instanceof Map ? portals.map : new Map();
        if (el) el.textContent = (Renkon.app.seloId || '?') +
            ' | portals: ' + [..._pm.values()].map(function(p) {
                return p.name + '@' + ((p.meta || {}).offset || 0);
            }).join(', ');
        return null;
    }
);
`,
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
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
    // modelNodes and app are extended from APPS['world'] in the wiring section below.
    // Only portal-demo-specific nodes are declared here.
    app: `
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
// createNamedPortal and createLink are handled by FRP receivers in world.app's portals/portalLinks/spawned nodes.
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
    buildUI: function(rootEl, label, _helpers) {
        var mount = (_helpers && _helpers.portalMount || portalMount)(rootEl);
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
    }
    if (APPS['portal-demo']) {
        // portal-demo reuses world's full model + view stack so avatar logic,
        // window/portal Behaviors, and view rendering are not duplicated.
        // portal-demo.app only carries its own extra nodes (counter, _autoSetup, etc.).
        APPS['portal-demo'].viewProgram = APPS['world'].viewProgram;
        APPS['portal-demo'].modelNodes  = APPS['world'].modelNodes.concat(
            ['ticking', 'counter', 'randomResult', 'tick', 'subTick', 'subCounter', '_autoSetup']
        );
        APPS['portal-demo'].app = APPS['world'].app + '\n' + APPS['portal-demo'].app;
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
