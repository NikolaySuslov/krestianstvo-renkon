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
            c.style.cssText = 'position:absolute;top:30px;left:0;right:0;bottom:0;overflow:hidden;z-index:1;';
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
        if (alive.length > 0) future(0.05, '_tick', { type: '_tick' });
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
    future(0.05, '_tick', { type: '_tick' });
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

const _spaceKey = Behaviors.collect(false, Events.change(vTime), function(done, _) {
    if (done) return true;
    var rEl = rootEl;
    if (!rEl) return false;
    rEl.setAttribute('tabindex', '-1');
    rEl.focus();
    rEl.addEventListener('keydown', function(e) {
        if (e.code !== 'Space' || e.repeat) return;
        e.preventDefault();
        send('toggleTick', {});
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
            future(1, 'tick', {});
            Array.from({ length: 9 }, (_, i) => i + 1)
                .forEach(i => future(i * 0.1, 'subTick', { step: i }));
        }
        return state;
    }
    if (msg.type === 'toggleTick') {
        var _now = !state.ticking;
        if (_now) {
            future(1, 'tick', {});
            Array.from({ length: 9 }, (_, i) => i + 1)
                .forEach(i => future(i * 0.1, 'subTick', { step: i }));
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
    modelNodes: ['counter', 'subCounter', 'running', 'toggle', '_tick', '_subTick', '_tickLoop', '_autoStart'],
    app: `
// ── MODEL ──────────────────────────────────────────────────────────────────

// _autoStart: seed first tick on session init only if running is true
const _autoStart = Behaviors.collect(false, Events.once(worldState), function(done, _) {
    if (done) return true;
    if (running) future(0.1, '_tick', { type: '_tick' });
    return true;
});

// toggle — model receiver, fired by view send('toggle', {})
const toggle = Events.receiver();

// running — toggled by start/stop button, starts true (auto-started)
const running = Behaviors.collect(false, toggle, (prev, _) => {
    var next = !prev;
    if (next) future(0.001, '_tick', { type: '_tick' });
    return next;
});

// _tick — fires every 1s, schedules 9 subticks at 100ms intervals within the second
const _tick    = Events.receiver();
const _subTick = Events.receiver({ queued: true });

const _tickLoop = Behaviors.collect(null, _tick, (_, __) => {
    if (!running) return null;
    future(1, '_tick', { type: '_tick' });
    Array.from({ length: 99 }, (_, i) => i + 1)
     .forEach(i => future(i * 0.01, '_subTick', { step: i }));
});

// counter increments on each main tick (only when running)
const counter = Behaviors.collect(0, Events.or(incr, decr, _tick), (prev, ev) => {
    if (ev && ev.type === '_tick') return running ? prev + 1 : prev;
    return prev + ev;
});

// subCounter counts all subticks (queued batch) + main tick = 100 per second
const subCounter = Behaviors.collect(0, Events.or(_tick, _subTick), (prev, ev) => {
    if (Array.isArray(ev)) return prev + ev.length;
    return prev + 1;
});

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
const incr         = Events.listener(rootEl.querySelector('#incr'),   'click', () => 1);
const decr         = Events.listener(rootEl.querySelector('#decr'),   'click', () => -1);
const _toggleSend  = Events.listener(rootEl.querySelector('#toggle'), 'click', () => { send('toggle', {}); });

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
            '<button id="toggle" style="font-size:16px;width:80px;height:60px;border-radius:10px;border:2px solid #88b;background:#eef;cursor:pointer">Stop</button>' +
            '</div>' +
            '<div style="font-size:11px;color:#aab">+1/s · 9 subticks/s</div>';
        return mount;
    },
};


// ── counter-timer2 ────────────────────────────────────────────────────────
// Demonstrates FRP causality drain: future() called from Behaviors.collect
// accumulators. Each subTick schedules the next one (chain pattern) so each
// fires in a separate _makeSend drain loop iteration — plain receiver, no queued:true.
APPS["counter-timer2"] = {
    modelNodes: ['counter', 'subCounter', 'running', 'toggle', '_tick', '_subTick', '_subTickChain', '_tickLoop', '_autoStart', 'burstLog'],
    app: `
// ── MODEL ──────────────────────────────────────────────────────────────────

const _autoStart = Behaviors.collect(false, Events.once(worldState), function(done, _) {
    if (done) return true;
    if (running) future(0.1, '_tick', { type: '_tick' });
    return true;
});

const toggle  = Events.receiver();
const running = Behaviors.collect(false, toggle, (prev, _) => {
    var next = !prev;
    if (next) future(0.001, '_tick', { type: '_tick' });
    return next;
});

const _tick    = Events.receiver();
const _subTick = Events.receiver();

// _tickLoop: starts the subTick chain — only schedules step 1
const _tickLoop = Behaviors.collect(null, _tick, (_, __) => {
    if (!running) return null;
    future(1, '_tick', { type: '_tick' });
    future(0.01, '_subTick', { step: 1, steps: 99, startVt: now() });
    return null;
});

// _subTickChain: each subTick schedules the next — one per drain loop iteration
const _subTickChain = Behaviors.collect(null, _subTick, (_, ev) => {
    if (!ev || ev.step >= ev.steps) return null;
    future(0.01, '_subTick', { step: ev.step + 1, steps: ev.steps, startVt: ev.startVt });
    return null;
});

const counter = Behaviors.collect(0, Events.or(incr, decr, _tick), (prev, ev) => {
    if (ev && ev.type === '_tick') return running ? prev + 1 : prev;
    return prev + ev;
});

const subCounter = Behaviors.collect(0, Events.or(_tick, _subTick), (prev, ev) => {
    return prev + 1;
});

// burstLog: last 9 subTick entries — all from one chain, spread should be ~9ms
const burstLog = Behaviors.collect([], _subTick, (prev, ev) => {
    if (!ev) return prev;
    var entry = { step: ev.step, msgVt: now(), startVt: ev.startVt };
    var log = prev.concat([entry]);
    return log.length > 99 ? log.slice(log.length - 99) : log;
});

// ── VIEW ────────────────────────────────────────────────────────────────────

const _injectStyles = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var sid = 'k-timer2-styles';
    if (!document.getElementById(sid)) {
        var s = document.createElement('style'); s.id = sid;
        s.textContent = '.k-timer2-root{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:20px;background:rgba(245,245,248,0.80);}';
        document.head.appendChild(s);
    }
    if (rootEl) rootEl.classList.add('k-timer2-root');
    return true;
});

const incr         = Events.listener(rootEl.querySelector('#incr'),   'click', () => 1);
const decr         = Events.listener(rootEl.querySelector('#decr'),   'click', () => -1);
const _toggleSend  = Events.listener(rootEl.querySelector('#toggle'), 'click', () => { send('toggle', {}); });

const _render = Behaviors.collect(null,
    Events.or(Events.change(counter), Events.change(subCounter), Events.change(running), Events.change(burstLog)),
    (_, __) => {
        var countEl  = rootEl.querySelector('#count');
        var subEl    = rootEl.querySelector('#subcounter');
        var toggleEl = rootEl.querySelector('#toggle');
        var burstEl  = rootEl.querySelector('#burst');
        if (countEl)  countEl.textContent  = counter;
        if (subEl)    subEl.textContent    = 'sub: ' + subCounter;
        if (toggleEl) toggleEl.textContent = running ? 'Stop' : 'Start';
        if (burstEl && burstLog && burstLog.length >= 2) {
            var first = burstLog[0].startVt || 0;
            var last  = burstLog[burstLog.length - 1].msgVt || 0;
            var spread = ((last - first) * 1000).toFixed(2);
            burstEl.textContent = 'last burst: ' + burstLog.length + ' steps · spread: ' + spread + 'ms';
        }
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
            '<button id="toggle" style="font-size:16px;width:80px;height:60px;border-radius:10px;border:2px solid #88b;background:#eef;cursor:pointer">Stop</button>' +
            '</div>' +
            '<div id="burst" style="font-size:11px;color:#aab;min-height:16px">waiting for burst…</div>' +
            '<div style="font-size:10px;color:#bbc">FRP chain drain · 99 subticks · 10ms each · plain receiver</div>';
        return mount;
    },
};


// ── world ──────────────────────────────────────────────────────────────────
// The main krestianstvo demo — avatars, portal bar, counter, ticking, sub-portals.
// Pure krestianified: single unified app string, krestianify splits model/view.
APPS["world"] = {
    modelNodes: ['objects', '_move',
                 'windows', '_moveWindow', '_resizeWindow', '_rotateWindow', '_applyWindowResize',
                 '_notifyLinkedResize', '_notifyLinkedRotate', '_notifyLinkedScale', '_notifyLinkedMove',
                 '_notifyLinkedPortalPos', '_notifyLinkedMirror',
                 'setPortal', 'portalText',
                 '_setJoinInput', 'joinInput'],
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
// _closeWindow — provided by VM preamble
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
            future(0, '_applyWindowResize', { name: ev.name, w: ev.w, h: ev.h });
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

// portals, createPortal, createNamedPortal, movePortal, resizePortal, rotatePortal,
// scalePortal, closePortal — provided by VM model preamble. No declaration needed.

// portalLinks, createLink, deleteLink, _rotateLinkPortal, _scaleLinkPortal —
// provided by VM model preamble. No declaration needed.

// spawned, spawnSelo, _joinWindow, _closeWindow — provided by VM model preamble.
// No declaration needed.

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
const _notifyLinkedMove = Behaviors.collect(null, movePortal, (_, ev) => {
    if (!ev?.id || !app.vm) return null;
    const _vm2 = app.vm, _parentVM = _vm2._parent;
    if (!_parentVM) return null;
    const _parentLinks = (_parentVM._getModelNode(_parentVM.modelPS, 'portalLinks')?.map) || new Map();
    const _toPortal = portals.map.get(ev.id);
    [..._parentLinks.values()].forEach(lk => {
        if (lk.toSelo !== _vm2.seloId || _toPortal?.name !== lk.toPortalName) return;
        _parentVM.injectModelMessage('_moveLinkPortal', { linkId: lk.id, x: ev.x, y: ev.y }, _vm2.seloId);
    });
    return null;
});
const _notifyLinkedPortalPos = Behaviors.collect(null, Events.change(portals), (_, __) => {
    if (!app.vm) return null;
    const _vm2 = app.vm, _parentVM = _vm2._parent;
    if (!_parentVM) return null;
    const _parentLinks = (_parentVM._getModelNode(_parentVM.modelPS, 'portalLinks')?.map) || new Map();
    portals.map.forEach(function(_portal) {
        [..._parentLinks.values()].forEach(function(lk) {
            if (lk.toSelo !== _vm2.seloId || lk.toPortalName !== _portal.name) return;
            _parentVM.injectModelMessage('_moveLinkPortal', { linkId: lk.id, x: _portal.x || 0, y: _portal.y || 0 }, _vm2.seloId);
        });
    });
    return null;
});
const _notifyLinkedMirror = Behaviors.collect(null, Events.change(portalLinks), (_, __) => {
    if (!app.vm) return null;
    const _vm2 = app.vm, _parentVM = _vm2._parent;
    if (!_parentVM) return null;
    const _parentLinks = (_parentVM._getModelNode(_parentVM.modelPS, 'portalLinks')?.map) || new Map();
    const _myLinks = (portalLinks && portalLinks.map) || new Map();
    [..._parentLinks.values()].forEach(function(lk) {
        if (lk.toSelo !== _vm2.seloId) return;
        const _hasMirror = [..._myLinks.values()].some(function(l) { return l.toSelo === _parentVM.seloId; });
        _parentVM.injectModelMessage('_setLinkMirror', { linkId: lk.id, hasMirror: _hasMirror }, _vm2.seloId);
    });
    return null;
});

// portalText — synced portal bar input value; snapshotted so joiners restore it.
const setPortal  = Events.receiver();
const portalText = Behaviors.collect('', setPortal,
    function(_, ev) { return (ev && typeof ev === 'object') ? (ev.value || '') : (ev || ''); });

// joinInput — synced join input value; { name: windowName, value } so renderer finds the right cinp.
const _setJoinInput = Events.receiver();
const joinInput = Behaviors.collect(null, _setJoinInput,
    function(_, ev) { return (ev && ev.name != null) ? ev : null; });

/// ── VIEW nodes: local per-client ──────────────────────────────────────────
// windows, portalText — auto-generated as cross-boundary receivers by krestianify

// ── buildUI — create title strip once ────────────────────────────────────
// Runs once: when rootEl is available and title strip not yet present.
// For child windows (createSeloContainer already has .vm-clock in titleBar),
// wires _clockEl/_peersEl to those spans instead of creating a second strip.
const _buildUI = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var rEl = rootEl;
    if (!rEl || !UI) return false;

    if (UI && UI.injectStyles) UI.injectStyles();

    // Every VM owns its stats bar (top) and portal bar (bottom) inside its rootEl.
    // Root VM rootEl = full page div. Child VM rootEl = vm-content (below parent titleBar).
    var tbResult = UI.createVMTitleBar(rEl, { name: Renkon.app.seloId || '', height: 18, draggable: false, showStats: true });
    rEl._stripEl = tbResult.bar;
    rEl._clockEl = tbResult.clockEl;
    rEl._peersEl = tbResult.peersEl;

    var depth    = Renkon.app.depth    || 0;
    var maxDepth = Renkon.app.maxDepth != null ? Renkon.app.maxDepth : 5;
    var atMax    = depth >= maxDepth;
    var _pbResult = UI.createPortalBar(rEl, {
        disabled: atMax,
        onInput: atMax ? null : function(value) { send('setPortal', { value: value }); },
        onSubmit: atMax ? null : function(inputVal) {
            var parsed = _parsePortalInput(inputVal);
            if (parsed.action === 'createPortal') {
                send('createPortal', { name: parsed.portalName });
            } else if (parsed.action === 'createLink') {
                var _liveVM = Renkon.app && Renkon.app.vm;
                var _livePortalNode = _liveVM && _liveVM._getModelNode(_liveVM.modelPS, 'portals');
                var _localPortals = (_livePortalNode && _livePortalNode.map) || new Map();
                var _fromPortal = null;
                [..._localPortals.values()].forEach(function(p) { if (p.name === parsed.fromPortalName) _fromPortal = p; });
                if (_fromPortal) send('createLink', { fromPortalId: _fromPortal.id, toSelo: parsed.toSelo, toPortalName: parsed.toPortalName, maxDepth: parsed.maxDepth });
                else console.warn('[createLink] portal not found:', parsed.fromPortalName, 'available:', [..._localPortals.values()].map(function(p){return p.name;}));
            } else {
                send('spawnSelo', { seloId: parsed.seloId, appName: parsed.appName || null, maxDepth: parsed.maxDepth, wsUrl: parsed.wsUrl || null });
            }
        },
    });
    rEl._portalBar = _pbResult.bar;
    rEl._portalInp = _pbResult.input;

    if (!rEl.getAttribute('tabindex')) rEl.setAttribute('tabindex', '-1');
    return true;
});

// ── _makeSpawnHandler — factory for spawn/close/join VM window handlers ──
const _makeSpawnHandler = function(parentEl, parentVM) {
    return function(opts) {
        var childVM      = opts.vm;
        var targetSeloId = childVM.seloId;
        var windowName   = opts.name;  // windowName passed directly from _diffChildren

        const _existing = [...parentEl.children].some(function(c) { return c.dataset?.seloId === windowName; });
        if (_existing) return;

        var result = UI.createSeloContainer(windowName, parentEl, {
            onMove:   function(n, x, y) { send('_moveWindow',   { name: n, x: x, y: y }); },
            onResize: function(n, w, h) { send('_resizeWindow', { name: n, w: w, h: h }); },
            onRotate: function(n, r)    { send('_rotateWindow', { name: n, r: r }); },
            onClose:  function(n)       { send('_closeWindow',  { name: n }); },
        });
        var el   = result.el;
        var cinp = result.cinp;
        var cbtn = result.cbtn;

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

        // z-index from spawned position — deterministic across peers regardless of
        // network-arrival order. _childrenMap preserves spawned array order.
        if (parentVM._childrenMap) {
            var _zKeys = [...parentVM._childrenMap.keys()];
            var _zIdx  = _zKeys.indexOf(windowName);
            if (_zIdx >= 0) el.style.zIndex = 60 + _zIdx;
        }

        if (childVM._isPortal) {
            el.classList.add('kv-portal-window');
            if (childVM._linkId) el.classList.add('kv-link-window');
        }

        // The window chrome (titleBar, handles, border) is parent VM UI.
        // The child VM renders only in the content area below the titleBar.
        // Create vm-content BEFORE any DOM insertion so viewAppExtra is set
        // before MutationObserver callbacks fire.
        var _vmContent = document.createElement('div');
        _vmContent.className = 'vm-content';
        var _tbH = result.titleBar.offsetHeight || 22;
        _vmContent.style.cssText = 'position:absolute;top:' + _tbH + 'px;left:0;right:0;bottom:0;overflow:hidden;z-index:1;';

        // Set rootEl on child VM before appending to DOM — ensures MutationObserver
        // in _rebuildViewPSWhenReady finds rootEl already set when it fires.
        if (childVM.viewPS && childVM.viewPS.app) {
            childVM.viewPS.app.rootEl = _vmContent;
            childVM.viewPS.app.UI     = UI;
        }
        childVM.viewAppExtra = Object.assign(childVM.viewAppExtra || {}, { rootEl: _vmContent, UI: UI });
        el._joinInp = cinp;

        el.appendChild(_vmContent);
        el.addEventListener('mouseenter', function() { Renkon.app._activeWS = childVM.ws; });
        el.addEventListener('mousedown',  function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            Renkon.app._activeWS = childVM.ws;
        });

        childVM.onSeloJoined = function(info) {
            var lbl = el.querySelector('.vm-label');
            if (lbl) lbl.textContent = info.seloId;
            cinp.value = info.seloId;
        };

        // Grandchild containers are appended to _vmContent (child VM's rootEl).
        childVM.onSpawn = _makeSpawnHandler(_vmContent, childVM);
        childVM.onClose = function(closeOpts) {
            const childEl = [..._vmContent.children].find(function(c) { return c.dataset?.seloId === closeOpts.name; });
            if (childEl) { childEl._destroyDrag?.(); childEl.remove(); }
        };

        cinp.addEventListener('input', function(e) {
            send('_setJoinInput', { name: windowName, value: e.target.value });
        });
        cinp.addEventListener('keydown', function(e) {
            if (e.code !== 'Enter') return;
            var newSeloId = cinp.value.trim();
            if (!newSeloId) return;
            send('_joinWindow', { name: windowName, seloId: newSeloId });
        });
        cbtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var newSeloId = cinp.value.trim();
            if (!newSeloId) return;
            send('_joinWindow', { name: windowName, seloId: newSeloId });
        });

        el._onSpawnSelo = function(inputVal) {
            var parsed = _parsePortalInput(inputVal);
            if (childVM.ws && childVM.ws.readyState === WebSocket.OPEN)
                childVM.ws.send(JSON.stringify({ type: 'spawnSelo', data: { seloId: parsed.seloId, appName: parsed.appName || null, maxDepth: parsed.maxDepth, wsUrl: parsed.wsUrl || null } }));
        };
    };
};

// ── onSpawn wiring — wire vm.onSpawn once using _makeSpawnHandler ──────────
const _spawnWired = Behaviors.collect(false, Events.once(vTime), function(done, _) {
    if (done) return true;
    var vm  = Renkon.app.vm;
    var app = Renkon.app;
    if (!vm || !UI) return false;

    vm.onSpawn = _makeSpawnHandler(app.rootEl, vm);
    // Flush children that were spawned before onSpawn was available (model
    // evaluates before view's first tick). Creates DOM slots in _childrenMap order
    // = spawned array order = historical creation order on all peers.
    if (vm._childrenMap) {
        vm._childrenMap.forEach(function(childVM, wName) {
            vm.onSpawn({ name: wName, vm: childVM, depth: childVM.depth, placeholder: true });
        });
    }
    vm.onClose = function(opts) {
        var rEl = app.rootEl;
        if (!rEl) return;
        const childEl = [...rEl.children].find(child => child.dataset?.seloId === opts.name);
        if (childEl) { childEl._destroyDrag?.(); childEl.remove(); }
    };

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
const _clickHandler = function(e) {
    var rEl = Renkon.app && Renkon.app.rootEl;
    if (!rEl || !rEl.contains(e.target)) return undefined;
    var hit = e.target.closest('[data-selo-id]');
    // hit may be rEl itself OR rEl's parent portal container (when rEl is .vm-content)
    if (hit && hit !== rEl && hit !== rEl.parentElement) return undefined;
    // Only steal focus on explicit click/touch — never on mousemove (would blur portal input)
    if (e.type === 'click' || e.type === 'touchstart') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
            rEl.focus({ preventScroll: true });
        }
    }
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
    var _layerTop = (_layer && _layer.offsetTop) || 0;  // always 0; layer covers full rootEl
    return { x: Math.round(rx), y: Math.round(ry - _layerTop) };
};
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
    send('_move', pos.e);
    return null;
});

// ── _parsePortalInput — interpret portal bar input ───────────────────────
// ''        → spawn new child with auto-generated name
// 'new:foo' → spawn new child named 'foo' (fresh empty selo)
// 'foo'     → open portal window connecting to existing selo 'foo'
const _parsePortalInput = function(inputVal) {
    var v = (inputVal || '').trim();
    if (!v) return { seloId: '', appName: null, maxDepth: null, wsUrl: null, isPortal: false };
    // Parse :r=URL first — URL value may contain colons so it must be last in the string
    var wsUrl = null;
    var _rIdx = v.indexOf(':r=');
    if (_rIdx >= 0) { wsUrl = v.slice(_rIdx + 3).trim() || null; v = v.slice(0, _rIdx).trim(); }
    // Parse :d=N for maxDepth override
    var maxDepth = null;
    var _dIdx = v.lastIndexOf(':d='); if (_dIdx >= 0) { var _dVal = v.slice(_dIdx + 3); if (_dVal && !isNaN(parseInt(_dVal, 10))) { maxDepth = parseInt(_dVal, 10); v = v.slice(0, _dIdx).trim(); } }

    // "portal:p1" — create a named portal rect in this selo
    if (v.indexOf('portal:') === 0) {
        var _pname = v.slice(7).trim();
        return { action: 'createPortal', portalName: _pname, maxDepth: maxDepth, wsUrl: wsUrl };
    }
    // "link:p1->world:2/p2" — link local portal p1 to portal p2 in world:2
    // fromPortalName -> toSelo / toPortalName
    if (v.indexOf('link:') === 0) {
        var _spec = v.slice(5).trim();
        var _arrowIdx = _spec.indexOf('->');
        if (_arrowIdx < 0) return { seloId: v, appName: null, maxDepth: maxDepth, wsUrl: wsUrl, isPortal: false };
        var _from = _spec.slice(0, _arrowIdx).trim();
        var _toSpec = _spec.slice(_arrowIdx + 2).trim();
        var _slashIdx = _toSpec.lastIndexOf('/');
        var _toSelo = _slashIdx >= 0 ? _toSpec.slice(0, _slashIdx).trim() : _toSpec;
        var _toPortal = _slashIdx >= 0 ? _toSpec.slice(_slashIdx + 1).trim() : '';
        return { action: 'createLink', fromPortalName: _from, toSelo: _toSelo, toPortalName: _toPortal, maxDepth: maxDepth, wsUrl: wsUrl };
    }
    var resolve = Renkon.app && Renkon.app.resolveApp;
    if (resolve) {
        var r = resolve(v);
        if (r && r.appDef) {
            var hasName = r.seloId && r.seloId.length > 0;
            var fullSeloId = hasName ? v : '';
            return { seloId: fullSeloId, appName: r.appName, maxDepth: maxDepth, wsUrl: wsUrl, isPortal: false };
        }
    }
    if (v.indexOf('new:') === 0) {
        return { seloId: v.slice(4).trim(), appName: 'world', maxDepth: maxDepth, wsUrl: wsUrl, isPortal: false };
    }
    // Plain name with no app prefix — default to 'world' so the child gets
    // the full portal/avatar infrastructure. Joining an existing session is
    // unaffected: the snapshot arrives and programs are restored from it.
    return { seloId: v, appName: 'world', maxDepth: maxDepth, wsUrl: wsUrl, isPortal: false };
};


// ── renderer — 60hz DOM update ────────────────────────────────────────────
const renderTick = Events.timer(16);
const renderer = ((renderTick) => {
    var rEl  = rootEl;
    if (!rEl || !UI) return null;
    var objs    = (objects && objects.map) || new Map();
    var myId    = clientIdentity && clientIdentity.clientId;
    var depth    = Renkon.app.depth    || 0;
    var maxDepth = Renkon.app.maxDepth != null ? Renkon.app.maxDepth : 5;
    var atMax    = depth >= maxDepth;

    var clockEl = rEl._clockEl;
    var peersEl = rEl._peersEl;
    if (clockEl) clockEl.textContent = (+(vTime || 0)).toFixed(3);
    if (peersEl) peersEl.textContent = objs.size;

    var portalBar = rEl._portalBar;

    var portalInp = rEl._portalInp;
    if (portalInp && !atMax && document.activeElement !== portalInp) {
        var pStr = (typeof portalText === 'object' && portalText !== null)
            ? (portalText.value || '') : (portalText || '');
        portalInp.value = pStr;
    }

    if (joinInput && joinInput.name) {
        var _wEl = rEl.querySelector('[data-selo-id="' + joinInput.name + '"]');
        var _jinp = _wEl && _wEl._joinInp;
        if (_jinp && document.activeElement !== _jinp) _jinp.value = joinInput.value || '';
    }

    var layer = rEl._avatarLayer;

    if (!layer) {
        layer = document.createElement('div');
        layer.className = 'vm-avatar-layer';
        layer._avatarMap = new Map();
        // Avatar layer covers the full rootEl — stats bar and portal bar are world app
        // elements inside rootEl; z-index:9999 renders avatars on top of both.
        layer.style.cssText =
            'position:absolute;top:0;left:0;right:0;bottom:0;' +
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
                'width:30px;height:30px;pointer-events:none;' +
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
})(renderTick);

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



// ── _attachGesture — unified mouse+touch drag helper ─────────────────────
// Attaches mousedown/touchstart to el; calls onStart(cx,cy), onMove(cx,cy),
// onEnd(cx,cy) during drag. opts.filter(e) can veto the gesture start.
const _attachGesture = function(el, onStart, onMove, onEnd, opts) {
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
};

// ── _portalRectSync — draggable portal viewport rectangles ────────────────
// Each portal is a named dashed rectangle. Moving it shifts the viewport
// in any linked selo's window. No child VMs — purely a visual anchor.
const _portalRectSync = Behaviors.collect(null, Events.change(portals), function(_, _pts) {
    if (!rootEl) return null;
    var pts = (_pts && _pts.map) || new Map();
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
                send('closePortal', { id: pid });
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
                        send('scalePortal', {id:_pid,s:s});
                    },
                    function(_, cy) {
                        if (!_scaling) return; _scaling=false;
                        var s=Math.max(0.1,Math.round((_startScale+(cy-_startY)/100)*100)/100);
                        send('scalePortal', {id:_pid,s:s});
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
                        send('resizePortal', {id:_pid,w:Math.round(Math.max(80,_sw+cx-_sx)),h:Math.round(Math.max(60,_sh+cy-_sy))});
                    },
                    function(cx, cy) {
                        if (!_rsz) return; _rsz=false;
                        send('resizePortal', {id:_pid,w:Math.round(Math.max(80,_sw+cx-_sx)),h:Math.round(Math.max(60,_sh+cy-_sy))});
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
                        send('rotatePortal', {id:_pid,r:r});
                    },
                    function(cx, cy) {
                        if (!_rotating) return; _rotating=false;
                        var r=Math.round(_startR+_rawAngle(cx,cy)-_startAngle);
                        send('rotatePortal', {id:_pid,r:r});
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
                        send('movePortal', {id:_pid,x:Math.round(_ox+cx-_mx),y:Math.round(_oy+cy-_my)});
                    },
                    function(cx, cy) {
                        if (!_drag) return; _drag=false;
                        send('movePortal', {id:_pid,x:Math.round(_ox+cx-_mx),y:Math.round(_oy+cy-_my)});
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
    Events.or(Events.change(portalLinks), Events.change(portals)),
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
                        send('deleteLink', { id: lid });
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

            // Offset from link entry — seeded by _notifyLinkedPortalPos on first portals change,
            // then kept current by _notifyLinkedMove on every movePortal.
            var offX = -(lk.x || 0);
            var offY = -(lk.y || 0);

            // Window resize is now handled by _notifyLinkedResize future chain
            // in world:2's model → injectModelMessage into world:1's model.
            // No VIEW-side ws.send needed here.

            // Mirror activation: check if the remote selo has a link window pointing
            // back to our selo. If it does AND the user explicitly places portals to
            // overlap (toPortal rect overlaps with fromPortal in viewport coords),
            // activate mirror by showing the nested link window content.
            // maxDepth prevents infinite recursion — mirror runs for finite depth only.
            if (fromPortal && lk.toPortalName) {
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
                // Mirror is active only if reverse link exists (pushed reactively via _notifyLinkedMirror)
                // AND depth allows it.
                var _mirrorActive = lk.hasMirror && childVM.depth < childVM.maxDepth;
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
//   portal_delete({ id/name })              — closePortal
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
    // portals, portalLinks, spawned, createPortal, createLink etc. provided by VM preamble.
    // Uses flat portal schema: { id, name, offset } — portal_update merges props directly.
    modelNodes: ['_autoSetup', '_tick', '_tickLoop'],
    app: `

// _autoSetup: once on first worldState — creates portals, seeds _tick ONLY on :b
const _autoSetup = Behaviors.collect(false, Events.once(worldState), function(done, ws) {
    if (done) return true;
    // Guard: skip if portals already exist (snapshot restore) — check FRP node and worldState
    if (!ws) return true;
    if (portals.map.size > 0) return true; // already initialised (snapshot restore)
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
        future(2, '_tick', { type: '_tick' });
    }
    return true;
});

// _tick / _tickLoop: exact same pattern as counter-timer app.
// _tick is a receiver fired by future(). _tickLoop reschedules it.
// Only :b updates the portal offset — :a's _tick never fires (not seeded).
const _tick = Events.receiver();

const _tickLoop = Behaviors.collect(null, _tick, function(_, __) {
    future(2, '_tick', { type: '_tick' });
    if (seloId.indexOf(':b') >= 0) {
        var _pt = [...portals.map.values()][0];
        if (_pt) {
            var _cur = _pt.offset != null ? _pt.offset : 0;
            portal_update({ id: _pt.id, offset: _cur + 1 });
        }
    }
    return null;
});

// ── VIEW ──────────────────────────────────────────────────────────────────

const _logPos = Behaviors.collect(null, Events.change(portals), function(_, pts) {
    var _m = pts && pts.map instanceof Map ? pts.map : (pts instanceof Map ? pts : new Map());
    var _off = [..._m.values()].map(function(p) {
        return p.name + '@' + (p.offset != null ? p.offset : (p.meta && p.meta.offset) || 0);
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
                return p.name + '@' + (p.offset != null ? p.offset : (p.meta && p.meta.offset) || 0);
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
    if (!ws || portals.map.size > 0) return true;

    if (seloId.indexOf(':source') >= 0) {
        var _targetSelo = seloId.replace(':source', ':target');
        future(0, 'createNamedPortal',
            { name: 'src-view', x: 60, y: 60, w: 240, h: 180 });
        future(0.005, 'createLink', {
            fromPortalId:   '__pending__',
            fromPortalName: 'src-view',
            toSelo:         _targetSelo,
            toPortalName:   'tgt-anchor',
        });
    }

    if (seloId.indexOf(':target') >= 0) {
        future(0, 'createNamedPortal',
            { name: 'tgt-anchor', x: 80, y: 80, w: 240, h: 180 });
        future(0.005, 'spawnSelo',
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

// Extend portal-demo with world's unified app string and modelNodes.
// krestianify handles the full model/view split for both apps combined.
if (APPS['world'] && APPS['portal-demo']) {
    APPS['portal-demo'].modelNodes = APPS['world'].modelNodes.concat(
        ['ticking', 'counter', 'randomResult', 'tick', 'subTick', 'subCounter', '_autoSetup']
    );
    APPS['portal-demo'].app = APPS['world'].app + '\n' + APPS['portal-demo'].app;
}

// ── installDOMHandlers ────────────────────────────────────────────────────
// Sets viewAppExtra on a VM before boot. Replaces the dom-demo.js version.
// resolveApp is optional — pass it so portal input can resolve named apps.
// buildUI is optional — if provided, stored in viewAppExtra and called immediately.
export function installDOMHandlers(vm, rootEl, resolveApp, buildUI) {
    vm.viewAppExtra = Object.assign(vm.viewAppExtra || {}, {
        rootEl:     rootEl,
        UI:         typeof KrestianstvoUI !== 'undefined' ? KrestianstvoUI : null,
        resolveApp: resolveApp || null,
    });
    if (buildUI) {
        vm.viewAppExtra._buildUI = buildUI;
        try { buildUI(rootEl, vm.seloId || '', { portalMount: portalMount }); } catch(e) {}
    }
    if (typeof KrestianstvoUI !== 'undefined' && KrestianstvoUI.injectStyles) {
        KrestianstvoUI.injectStyles();
    }
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
