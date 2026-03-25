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
    var _p = rootEl && rootEl.parentElement;
    if (!_p) return null;
    var _clk = _p.querySelector('.vm-clock');
    if (_clk) _clk.textContent = t || 0;
    var _prs = _p.querySelector('.vm-peers');
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
            c.style.cssText = 'position:absolute;top:22px;left:0;right:0;bottom:0;overflow:hidden;';
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
    var _p = rootEl && rootEl.parentElement;
    if (!_p) return null;
    var _clk = _p.querySelector('.vm-clock');
    if (_clk) _clk.textContent = t || 0;
    var _prs = _p.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
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
    var _p = rootEl && rootEl.parentElement;
    if (!_p) return null;
    var _clk = _p.querySelector('.vm-clock');
    if (_clk) _clk.textContent = t || 0;
    var _prs = _p.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
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
    var _p = rootEl && rootEl.parentElement;
    if (!_p) return null;
    var _clk = _p.querySelector('.vm-clock');
    if (_clk) _clk.textContent = t || 0;
    var _prs = _p.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
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
    var _p = rootEl && rootEl.parentElement;
    if (!_p) return null;
    var _clk = _p.querySelector('.vm-clock');
    if (_clk) _clk.textContent = t || 0;
    var _prs = _p.querySelector('.vm-peers');
    if (_prs) _prs.textContent = Object.keys(objects || {}).length;
    return null;
});
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
    modelNodes: ['ticking', 'windows', 'randomResult', 'tick', 'subTick', 'counter', 'subCounter'],
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
            ws.send(JSON.stringify({ type: 'spawnSelo', data: { seloId: parsed.seloId, appName: parsed.appName || null, maxDepth: parsed.maxDepth } }));
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
        layer.style.cssText =
            'position:absolute;top:' + _topOff + 'px;left:0;right:0;bottom:36px;' +
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
`,
    // buildUI is null — VIEW_PROGRAM's _buildUI Renkon node handles DOM setup
    buildUI: null,
};


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
