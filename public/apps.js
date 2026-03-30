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

// ── PORTAL_CLOCK_SYNC ──────────────────────────────────────────────────────
// Renkon VIEW snippet that updates .vm-clock/.vm-peers in the portal titleBar.
// rootEl is .vm-content when inside a portal — its parent has the titleBar.
// Include in every app's VIEW section so stats update for all apps in portals.
export const PORTAL_CLOCK_SYNC = `
const _portalClockSync = Behaviors.collect(null, Events.change(vTime), function(_, t) {
    // Walk up from rootEl to find nearest container with .vm-clock (titleBar stats)
    var _p = rootEl;
    var _clk = null;
    while (_p && _p.parentElement && !_clk) {
        _p = _p.parentElement;
        _clk = _p.querySelector && _p.querySelector(':scope > * > .vm-clock, :scope > .vm-clock');
    }
    if (_clk) _clk.textContent = t || 0;
    var _prs = _clk && _clk.parentElement && _clk.parentElement.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
`;


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
});
// ── Portal titleBar clock sync ────────────────────────────────────────────
const _portalClockSync = Behaviors.collect(null, Events.change(vTime), function(_, t) {
    // Walk up from rootEl to find nearest container with .vm-clock (titleBar stats)
    var _p = rootEl;
    var _clk = null;
    while (_p && _p.parentElement && !_clk) {
        _p = _p.parentElement;
        _clk = _p.querySelector && _p.querySelector(':scope > * > .vm-clock, :scope > .vm-clock');
    }
    if (_clk) _clk.textContent = t || 0;
    var _prs = _clk && _clk.parentElement && _clk.parentElement.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
`,
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
const counter = Behaviors.collect(0, change, (prev, ch) => prev + ch);

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
});
// ── Portal titleBar clock sync ────────────────────────────────────────────
const _portalClockSync = Behaviors.collect(null, Events.change(vTime), function(_, t) {
    // Walk up from rootEl to find nearest container with .vm-clock (titleBar stats)
    var _p = rootEl;
    var _clk = null;
    while (_p && _p.parentElement && !_clk) {
        _p = _p.parentElement;
        _clk = _p.querySelector && _p.querySelector(':scope > * > .vm-clock, :scope > .vm-clock');
    }
    if (_clk) _clk.textContent = t || 0;
    var _prs = _clk && _clk.parentElement && _clk.parentElement.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
`,
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
});
// ── Portal titleBar clock sync ────────────────────────────────────────────
const _portalClockSync = Behaviors.collect(null, Events.change(vTime), function(_, t) {
    // Walk up from rootEl to find nearest container with .vm-clock (titleBar stats)
    var _p = rootEl;
    var _clk = null;
    while (_p && _p.parentElement && !_clk) {
        _p = _p.parentElement;
        _clk = _p.querySelector && _p.querySelector(':scope > * > .vm-clock, :scope > .vm-clock');
    }
    if (_clk) _clk.textContent = t || 0;
    var _prs = _clk && _clk.parentElement && _clk.parentElement.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
`,
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
);
// ── Portal titleBar clock sync ────────────────────────────────────────────
const _portalClockSync = Behaviors.collect(null, Events.change(vTime), function(_, t) {
    // Walk up from rootEl to find nearest container with .vm-clock (titleBar stats)
    var _p = rootEl;
    var _clk = null;
    while (_p && _p.parentElement && !_clk) {
        _p = _p.parentElement;
        _clk = _p.querySelector && _p.querySelector(':scope > * > .vm-clock, :scope > .vm-clock');
    }
    if (_clk) _clk.textContent = t || 0;
    var _prs = _clk && _clk.parentElement && _clk.parentElement.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
`,
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
    modelNodes: ['ticking', 'windows', 'portals', 'portalLinks', 'randomResult', 'tick', 'subTick', 'counter', 'subCounter'],
    app: `
// ── MODEL nodes: shared, deterministic, replicated ────────────────────────
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    Events.change(worldState),
    (_, s) => s ? s.ticking : false
);
const windows = Behaviors.collect(
    (_initialState && _initialState.windows) || {},
    Events.change(worldState),
    (_, s) => s ? s.windows : {}
);
const portals = Behaviors.collect(
    (_initialState && _initialState.portals) || {},
    Events.change(worldState),
    (_, s) => s ? s.portals : {}
);
const portalLinks = Behaviors.collect(
    (_initialState && _initialState.portalLinks) || {},
    Events.change(worldState),
    (_, s) => s ? s.portalLinks : {}
);
const randomResult = Behaviors.collect(
    (_initialState && _initialState.randomResult) || null,
    Events.change(worldState),
    (_, s) => s ? s.randomResult : null
);
const tick       = Events.receiver();
const subTick    = Events.receiver();
const counter    = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    tick, function(prev, _) { return prev + 1; }
);
const subCounter = Behaviors.collect(
    (_initialState && _initialState.subCounter) || 0,
    subTick, function(prev, _) { return prev + 1; }
);

// ── VIEW nodes: local per-client ──────────────────────────────────────────
// (provided by the VIEW_PROGRAM)
`,
    viewProgram: `

// ── Model state receivers ─────────────────────────────────────────────────
// These receive values pushed by VM after each model drain (via modelStateKeys).
const ticking      = Behaviors.collect(false, Events.receiver(), function(_,v){return v||false;});
const windows      = Behaviors.collect({},    Events.receiver(), function(_,v){return v||{};});
const randomResult = Behaviors.collect(null,  Events.receiver(), function(_,v){return v;});
const counter      = Behaviors.collect(0,     Events.receiver(), function(_,v){return v||0;});
const subCounter   = Behaviors.collect(0,     Events.receiver(), function(_,v){return v||0;});
const portals      = Behaviors.collect({},    Events.receiver(), function(_,v){return v||{};});
const portalLinks  = Behaviors.collect({},    Events.receiver(), function(_,v){return v||{};});
const setPortal    = Events.receiver();
// tick/subTick pushed by VM but not used directly in view — counter/subCounter carry the values

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
const _spawnWired = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var vm = Renkon.app.vm;
    var app = Renkon.app;
    if (!vm || !UI) return false;

    function makeSpawnHandler(parentEl, parentVM) {
        return function(opts) {
            var windowName = opts.name;          // unique key for this window
            var childVM    = opts.vm;
            var targetSeloId = childVM.seloId;   // actual seloId the child connected to

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

            var savedPos = parentVM.viewPS && parentVM.viewPS.app &&
                           parentVM.viewPS.app.windowPositions &&
                           parentVM.viewPS.app.windowPositions[windowName];
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
const _timerMove  = Events.timer(50);
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
        return { seloId: v.slice(4).trim(), appName: null, maxDepth: maxDepth, isPortal: false };
    }
    return { seloId: v, appName: null, maxDepth: maxDepth, isPortal: false };
}

// ── portalText — synced portal input value ────────────────────────────────
const portalText = Behaviors.collect('', setPortal,
    function(_, ev) { return (ev && typeof ev === 'object') ? (ev.value || '') : (ev || ''); });

const showSpwnedChildren = (()=>{
    console.log("Childs: ", clientJoined);
    })();

// ── renderer — 60hz DOM update ────────────────────────────────────────────
const renderTick = Events.timer(16);
const renderer = ((renderTick)=>
//Behaviors.collect(null, renderTick, function(_, __) {

{
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
                var _localPortals = (Renkon.app && Renkon.app._portalState) || {};
                var _fromPortal = null;
                Object.values(_localPortals).forEach(function(p) {
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
                        'available:', Object.values(_localPortals).map(function(p){return p.name;}));
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
})(renderTick);

// ── _exposePortalState — share portals with parent VM ────────────────────
const _exposePortalState = Behaviors.collect(null,
    Events.or(Events.change(portals), Events.change(portalLinks)),
    function(_, __) {
        if (Renkon.app) {
            Renkon.app._portalState       = portals      || {};
            Renkon.app._portalLinksState  = portalLinks  || {};
        }
        return null;
    }
);

// ── _portalRectSync — draggable portal viewport rectangles ────────────────
// Each portal is a named dashed rectangle. Moving it shifts the viewport
// in any linked selo's window. No child VMs — purely a visual anchor.
const _portalRectSync = Behaviors.collect(null, Events.change(portals), function(_, pts) {
    if (!rootEl) return null;
    pts = pts || {};
    var ws  = Renkon.app.ws;
    var rEl = rootEl;

    // Remove stale rects
    Array.from(rEl.children).forEach(function(el) {
        if (el.classList && el.classList.contains('kv-portal-rect') && !pts[el.dataset.portalId])
            el.remove();
    });

    Object.keys(pts).forEach(function(pid) {
        var p = pts[pid];
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
                'z-index:15;user-select:none;';

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

            // Resize handle
            var _rh = document.createElement('div');
            _rh.style.cssText =
                'position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:se-resize;' +
                'background:linear-gradient(135deg,transparent 50%,rgba(100,180,255,0.7) 50%);' +
                'border-bottom-right-radius:3px;';
            (function(_pid) {
                var _sw=0,_sh=0,_sx=0,_sy=0,_rsz=false,_last=0;
                function _mm(e) {
                    if (!_rsz) return;
                    var now=Date.now(); if (now-_last<50) return; _last=now;
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'resizePortal',data:{id:_pid,
                            w:Math.round(Math.max(80,_sw+e.clientX-_sx)),
                            h:Math.round(Math.max(60,_sh+e.clientY-_sy))}}));
                }
                function _mu(e) {
                    if (!_rsz) return; _rsz=false;
                    if (ws&&ws.readyState===1)
                        ws.send(JSON.stringify({type:'resizePortal',data:{id:_pid,
                            w:Math.round(Math.max(80,_sw+e.clientX-_sx)),
                            h:Math.round(Math.max(60,_sh+e.clientY-_sy))}}));
                    document.removeEventListener('mousemove',_mm); document.removeEventListener('mouseup',_mu);
                }
                _rh.addEventListener('mousedown',function(e){
                    e.stopPropagation(); e.preventDefault(); _rsz=true;
                    _sw=parseInt(rect.style.width)||320; _sh=parseInt(rect.style.height)||240;
                    _sx=e.clientX; _sy=e.clientY;
                    document.addEventListener('mousemove',_mm); document.addEventListener('mouseup',_mu);
                });
            })(pid);
            rect.appendChild(_rh);

            // Drag
            (function(_pid) {
                var _ox=0,_oy=0,_mx=0,_my=0,_drag=false,_last=0;
                rect.addEventListener('mousedown', function(e) {
                    if (e.target !== rect && e.target !== lbl) return;
                    e.stopPropagation(); e.preventDefault(); _drag=true;
                    _ox=parseInt(rect.style.left)||0; _oy=parseInt(rect.style.top)||0;
                    _mx=e.clientX; _my=e.clientY;
                    function _mm(e) {
                        if (!_drag) return;
                        var now=Date.now(); if (now-_last<50) return; _last=now;
                        if (ws&&ws.readyState===1)
                            ws.send(JSON.stringify({type:'movePortal',data:{id:_pid,
                                x:Math.round(_ox+e.clientX-_mx),y:Math.round(_oy+e.clientY-_my)}}));
                    }
                    function _mu(e) {
                        if (!_drag) return; _drag=false;
                        if (ws&&ws.readyState===1)
                            ws.send(JSON.stringify({type:'movePortal',data:{id:_pid,
                                x:Math.round(_ox+e.clientX-_mx),y:Math.round(_oy+e.clientY-_my)}}));
                        document.removeEventListener('mousemove',_mm); document.removeEventListener('mouseup',_mu);
                    }
                    document.addEventListener('mousemove',_mm); document.addEventListener('mouseup',_mu);
                });
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
        rect.style.left   = (p.x || 0) + 'px';
        rect.style.top    = (p.y || 0) + 'px';
        rect.style.width  = (p.w || 320) + 'px';
        rect.style.height = (p.h || 240) + 'px';
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
        var lks  = portalLinks || {};
        var pts  = portals     || {};
        var vm   = Renkon.app.vm;
        var rEl  = rootEl;
        if (!vm || !vm._children || !rEl) return null;

        Object.keys(lks).forEach(function(lid) {
            var lk = lks[lid];
            var fromPortal = pts[lk.fromPortalId];
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
                                  childVM.viewPS.app._portalState) || {};
            var toPortal = Object.values(remotePortals).find(function(p) {
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
                var _remotePLinks = childVM.viewPS && childVM.viewPS.app &&
                                    childVM.viewPS.app._portalLinksState || {};
                var _hasReverseLink = Object.values(_remotePLinks).some(function(l) {
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
        });
        return null;
    }
);

// ── _winSync — apply window positions from model ──────────────────────────
const _winSync = (() => 
//Behaviors.collect(null, Events.change($windows), function(_, wins) {
{
    console.log('Window sync', { windows });
    let wins = windows;
    if (!wins) return null;
    var app = Renkon.app;
    app.windowPositions = wins;
    var rEl = app.rootEl;
    if (rEl) {
        Object.entries(wins).forEach(function(e) {
            var name = e[0], pos = e[1];
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
})();
`,
    applyAction: `
    if (msg.type === 'tick') {
        if (state.ticking) {
            future(state.time, 1000, 'tick', {});
                Array.from({ length: 9 }, (_, i) => i + 1)
     .forEach(i => future(state.time, i * 100, 'subTick', { step: i }));
        }
        return Object.assign({}, state, { randomResult: random() });
    }
    if (msg.type === 'toggleTick') {
        var _nowTicking = !state.ticking;
        if (_nowTicking) {
            future(state.time, 1000, 'tick', {});
            Array.from({ length: 9 }, (_, i) => i + 1)
     .forEach(i => future(state.time, i * 100, 'subTick', { step: i }));
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
        // _injected:true means this came via injectModelMessage (cross-world, no reflector).
        // future(0) ensures deterministic ordering: all world:1 peers that received the
        // same injected message process it at the same logical vTime step.
        if (msg._injected) {
            future(state.time, 0, '_applyWindowResize', { name: _name, w: _ww, h: _wh });
            return state; // defer to future for determinism
        }
        var _wins = Object.assign({}, state.windows || {});
        _wins[_name] = Object.assign({}, _wins[_name] || {}, { w: _ww, h: _wh });
        return Object.assign({}, state, { windows: _wins });
    }
    // _applyWindowResize: future handler called from injected _resizeWindow.
    // Runs at vTime+0, fully deterministic — same on all world:1 peers.
    if (msg.type === '_applyWindowResize') {
        var _name = msg.data && msg.data.name;
        var _ww   = msg.data && msg.data.w;
        var _wh   = msg.data && msg.data.h;
        if (!_name) return state;
        var _wins = Object.assign({}, state.windows || {});
        _wins[_name] = Object.assign({}, _wins[_name] || {}, { w: _ww, h: _wh });
        return Object.assign({}, state, { windows: _wins });
    }
    if (msg.type === '_rotateWindow') {
        var _name = msg.data && msg.data.name;
        var _wr = msg.data && msg.data.r;
        if (!_name || _wr == null) return state;
        var _wins = Object.assign({}, state.windows || {});
        _wins[_name] = Object.assign({}, _wins[_name] || {}, { r: _wr });
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
    // ── Portal actions ───────────────────────────────────────────────────
    // createPortal: create a named viewport rectangle in this selo.
    // No links, no child VMs — just a positioned rect.
    // { name, x, y, w, h }
    if (msg.type === 'createPortal') {
        var _d = msg.data || {};
        var _name = (_d.name || '').trim();
        if (!_name) return state;
        // Check for duplicate name
        var _portals = Object.assign({}, state.portals || {});
        var _exists = Object.values(_portals).some(function(p) { return p.name === _name; });
        if (_exists) return state;
        var _pid = uid('p');
        _portals[_pid] = {
            id: _pid, name: _name,
            x: _d.x != null ? _d.x : 60,
            y: _d.y != null ? _d.y : 60,
            w: _d.w != null ? _d.w : 320,
            h: _d.h != null ? _d.h : 240,
        };
        return Object.assign({}, state, { portals: _portals });
    }
    // movePortal: { id, x, y }
    if (msg.type === 'movePortal') {
        var _d = msg.data || {};
        var _portals = Object.assign({}, state.portals || {});
        var _p = _portals[_d.id]; if (!_p) return state;
        _portals[_d.id] = Object.assign({}, _p, { x: _d.x, y: _d.y });
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
        var _portals = Object.assign({}, state.portals || {});
        var _p = _portals[_d.id]; if (!_p) return state;
        _portals[_d.id] = Object.assign({}, _p, { w: _d.w, h: _d.h });
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
        var _parentLinks = (_parentState && _parentState.portalLinks) || {};
        Object.values(_parentLinks).forEach(function(lk) {
            if (lk.toSelo !== _vm2.seloId) return;
            // Find the toPortal name — check if it matches _pid
            var _thisPortals = state.portals || {};
            var _toPortal = _thisPortals[_pid];
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
        var _portals = Object.assign({}, state.portals || {});
        delete _portals[_pid];
        // Remove links that reference this portal
        var _links = Object.assign({}, state.portalLinks || {});
        Object.keys(_links).forEach(function(lid) {
            var l = _links[lid];
            if (l.fromPortalId === _pid || l.toPortalId === _pid) delete _links[lid];
        });
        // Remove spawned child VMs for removed links
        var _removedSeloIds = {};
        Object.keys(state.portalLinks || {}).forEach(function(lid) {
            if (!_links[lid]) _removedSeloIds[lid] = true;
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
        var _portals = Object.assign({}, state.portals || {});
        if (Object.values(_portals).some(function(p) { return p.name === _name; })) return state;
        var _pid = uid('p');
        _portals[_pid] = { id: _pid, name: _name,
            x: _d.x != null ? _d.x : 80,
            y: _d.y != null ? _d.y : 80,
            w: _d.w != null ? _d.w : 100,
            h: _d.h != null ? _d.h : 100 };
        return Object.assign({}, state, { portals: _portals });
    }
    if (msg.type === 'createLink') {
        var _d = msg.data || {};
        if (!_d.toSelo || !_d.toPortalName) return state;
        // Resolve fromPortalId by name if __pending__ (portal was just created)
        var _fromPortalId = _d.fromPortalId;
        if (!_fromPortalId || _fromPortalId === '__pending__') {
            if (!_d.fromPortalName) return state;
            var _fp = Object.values(state.portals || {}).find(function(p) {
                return p.name === _d.fromPortalName;
            });
            if (!_fp) return state; // portal not found
            _fromPortalId = _fp.id;
        }
        var _links = Object.assign({}, state.portalLinks || {});
        // Prevent duplicate links
        var _dup = Object.values(_links).some(function(l) {
            return l.fromPortalId === _fromPortalId && l.toSelo === _d.toSelo && l.toPortalName === _d.toPortalName;
        });
        if (_dup) return state;
        var _lid = uid('link');
        _links[_lid] = {
            id:            _lid,
            fromPortalId:  _fromPortalId,
            toSelo:        _d.toSelo,
            toPortalName:  _d.toPortalName,
        };
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
        var _links = Object.assign({}, state.portalLinks || {});
        delete _links[_lid];
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


// ── Wire portal-grid to use world's viewProgram/applyAction ─────────────
// Done after APPS["world"] is defined so we can reference it.
// The portal-grid app is the world app with a special setup routine in the VIEW.
// ─────────────────────────────────────────────────────────────────────────────

// ── portal-grid ───────────────────────────────────────────────────────────
// Two-world portal grid demo as a krestianified app.
// Usage: open in two browser tabs:
//   selo.html?k=portal-grid:w1  — world:1 (portals + links)
//   selo.html?k=portal-grid:w2  — world:2 (portals + balls)
// Or use portal-grid-demo.html which boots both side by side.
//
// On first join, the app detects which world it is (seloId suffix :w1 or :w2)
// and uses future(time, 0, ...) to schedule portal/link creation deterministically.
APPS["portal-grid"] = {
    modelNodes: ['ticking', 'windows', 'portals', 'portalLinks',
                 'randomResult', 'tick', 'subTick', 'counter', 'subCounter'],
    app: `
// ── MODEL ─────────────────────────────────────────────────────────────────
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    Events.change(worldState), (_, s) => s ? s.ticking : false);
const windows = Behaviors.collect(
    (_initialState && _initialState.windows) || {},
    Events.change(worldState), (_, s) => s ? s.windows : {});
const portals = Behaviors.collect(
    (_initialState && _initialState.portals) || {},
    Events.change(worldState), (_, s) => s ? s.portals : {});
const portalLinks = Behaviors.collect(
    (_initialState && _initialState.portalLinks) || {},
    Events.change(worldState), (_, s) => s ? s.portalLinks : {});
const randomResult = Behaviors.collect(
    (_initialState && _initialState.randomResult) || null,
    Events.change(worldState), (_, s) => s ? s.randomResult : null);
const tick     = Events.receiver();
const subTick  = Events.receiver();
const counter  = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    tick, function(prev, _) { return prev + 1; });
const subCounter = Behaviors.collect(
    (_initialState && _initialState.subCounter) || 0,
    subTick, function(prev, _) { return prev + 1; });
`,
    viewProgram: null,  // uses world viewProgram — set at runtime
    applyAction: null,  // uses world applyAction — set at runtime
    buildUI: null,
};

// ── portal-demo ──────────────────────────────────────────────────────────
// Krestianified app demonstrating portals, links, and inter-selo VM access.
// No manual applyAction — krestianify splits model/view automatically.
//
// The app runs in two roles detected by seloId suffix:
//   selo.html?k=portal-demo:source  — the SOURCE world (creates portals + links)
//   selo.html?k=portal-demo:target  — the TARGET world (receives links, balls)
//
// Features demonstrated:
//   1. createNamedPortal — model-side portal objects
//   2. createLink        — portal link between selos
//   3. injectModelMessage via app.vm._parent — cross-world model msg (no ws.send)
//   4. reactive resize: resizing target portal resizes link window in source
APPS["portal-demo"] = {
    modelNodes: ['ticking', 'windows', 'portals', 'portalLinks',
                 'counter', 'randomResult', 'tick', 'subTick', 'subCounter', '_autoSetup'],
    app: `
// ── Shared model nodes (replicated) ──────────────────────────────────────
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    Events.change(worldState), (_, s) => s ? s.ticking : false);

const windows = Behaviors.collect(
    (_initialState && _initialState.windows) || {},
    Events.change(worldState), (_, s) => s ? s.windows : {});

const portals = Behaviors.collect(
    (_initialState && _initialState.portals) || {},
    Events.change(worldState), (_, s) => s ? s.portals : {});

const portalLinks = Behaviors.collect(
    (_initialState && _initialState.portalLinks) || {},
    Events.change(worldState), (_, s) => s ? s.portalLinks : {});

const counter = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    Events.change(worldState), (_, s) => s ? (s.counter || 0) : 0);

const randomResult = Behaviors.collect(
    (_initialState && _initialState.randomResult) || null,
    Events.change(worldState), (_, s) => s ? s.randomResult : null);

const tick    = Events.receiver();
const subTick = Events.receiver();
const subCounter = Behaviors.collect(
    (_initialState && _initialState.subCounter) || 0,
    subTick, function(prev, _) { return prev + 1; });

// ── Auto-setup: runs once on first join (empty portals + empty portalLinks) ──
// Detects role from seloId suffix. Uses future(time,0) for deterministic init.
const _autoSetup = Behaviors.collect(false, Events.once(worldState), function(done, ws) {
    if (done) return true;
    // Only first peer (no portals yet) triggers setup
    if (!ws || Object.keys(ws.portals || {}).length > 0) return true;
    var _sid = (app && app.vm.seloId) || '';
    // Source world: create 1 portal rect + 1 link to target
    if (_sid.indexOf('source') >= 0) {
        future(ws.time, 0, 'createNamedPortal', { name: 'src-view', x: 60, y: 60, w: 240, h: 180 });
        future(ws.time, 10, 'createLink', {
            fromPortalId: '__pending__',  // resolved in createLink handler
            fromPortalName: 'src-view',
            toSelo: _sid.replace('source', 'target'),
            toPortalName: 'tgt-anchor',
        });
    }
    // Target world: create anchor portal + spawn balls
    if (_sid.indexOf('target') >= 0) {
        future(ws.time, 0, 'createNamedPortal', { name: 'tgt-anchor', x: 80, y: 80, w: 240, h: 180 });
        future(ws.time, 10, 'spawnSelo', { seloId: 'demo-balls', appName: 'balls' });
    }
    return true;
});

// ── Tick / counter ─────────────────────────────────────────────────────────
const _tickNode = Behaviors.collect(0, tick, function(prev, _) { return prev + 1; });

// ── VIEW nodes (local per-client) ──────────────────────────────────────────

// Display counter from model
const _counterDisplay = Behaviors.collect(null, Events.change(counter), function(_, n) {
    var el = rootEl && rootEl.querySelector('.pd-counter');
    if (el) el.textContent = 'tick: ' + n;
    return null;
});

// Show seloId as title
const _titleSync = Behaviors.collect(false, Events.timer(200), function(done, _) {
    if (done) return true;
    var el = rootEl && rootEl.querySelector('.pd-title');
    if (!el) return false;
    el.textContent = Renkon.app.seloId || '';
    return true;
});

` + PORTAL_CLOCK_SYNC + `
`,
    buildUI: function(rootEl, label) {
        var mount = rootEl;
        if (rootEl && rootEl.querySelector && rootEl.querySelector('.vm-label')) {
            var c = rootEl.querySelector('.vm-content');
            if (!c) { c = document.createElement('div'); c.className = 'vm-content';
                c.style.cssText = 'position:absolute;top:22px;left:0;right:0;bottom:0;overflow:hidden;';
                rootEl.appendChild(c); }
            mount = c;
        }
        mount.innerHTML =
            '<div class="pd-title" style="position:absolute;top:8px;left:10px;' +
            'font-size:11px;font-family:monospace;color:#446;font-weight:bold;"></div>' +
            '<div class="pd-counter" style="position:absolute;top:28px;left:10px;' +
            'font-size:11px;font-family:monospace;color:#889;">tick: 0</div>' +
            '<div style="position:absolute;bottom:40px;left:10px;right:10px;' +
            'font-size:10px;font-family:monospace;color:#aaa;line-height:1.6;">' +
            'portal-demo app<br>' +
            'portals + links + inter-selo vm inject<br>' +
            'resizing target portal resizes source window' +
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
        // portal-demo uses world's viewProgram (portals, links, avatars, windows)
        // and world's applyAction (handles createNamedPortal, createLink, resizePortal etc.)
        // The app's own unified program provides the model nodes krestianify uses.
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
