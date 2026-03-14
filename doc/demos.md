# Krestianstvo SDK — Demo Apps

All demos run two peer windows side by side on the same page, connected to the same reflector session. Changes made in one peer appear instantly in the other — the model is shared, the view is local.

---

## krestianify-counter-demo.html

**Shared counter with auto-tick**

A collaborative increment/decrement counter. Three peers can click `+` or `−` to change the shared value. A `Events.timer(1000)` tick also increments the counter automatically every second from inside the model, demonstrating that model-driven timers work identically across all peers without any client sending a message.

Model nodes: `counter`, `change`, `tick`

```js
const tick    = Events.timer(1000);
const change  = Events.or(incr, decr, tick);
const counter = Behaviors.collect(0, change, (prev, ch) => prev + ch);
```

---

## krestianify-color-demo.html

**Deterministic random color on click**

Click the colored box — it changes to a new random color, the same on every peer simultaneously. Demonstrates `random()` inside a `Behaviors.collect` accumulator: the PRNG advances identically on all clients, so no coordination is needed to agree on the new color.

Model nodes: `counter`, `color`

```js
const color = Behaviors.collect("#cccccc", click, (_, __) => {
    return "hsl(" + Math.floor(random() * 360) + ","
                  + (40 + Math.floor(random() * 50)) + "%,"
                  + (40 + Math.floor(random() * 20)) + "%)";
});
```

---

## krestianify-balls-demo.html

**Bouncing fading balls**

Click anywhere on the canvas to spawn a glowing ball. Each ball gets a deterministic random color, radius, and velocity from `random()`. Balls bounce off walls and fade out over ~1.5 seconds. Position, velocity, and fade (`0.0`–`1.0`) all live in the model — the view just reads `ball.fade` and `ball.x/y` directly.

Movement is driven by a self-chaining `future()` tick at 50ms virtual time intervals. When all balls have faded (`fade ≤ 0`), the tick chain stops automatically.

Model nodes: `balls`, `_tick`

```js
// On each _tick: move, fade, remove if gone, schedule next tick
if (ev.type === '_tick') {
    var alive = prev.map(b => ({ ...b,
        x: b.x + b.vx, y: b.y + b.vy,
        fade: b.fade - 0.033
    })).filter(b => b.fade > 0);
    if (alive.length > 0) future(now(), 50, '_tick', { type: '_tick' });
    return alive;
}
```

## krestianify-counter-demo.html

**Counter with periodic virtual-time timer**

A variant of the counter demo focusing specifically on `future()`-based periodic ticking from within the model. Demonstrates scheduling recurring model events using `future(now(), interval, receiver, data)` rather than a view-side `Events.timer`, ensuring the tick fires at the same virtual time on all peers.

---

## demo.html

The primary SDK demo. Multiple draggable portal windows, each hosting an independent VM connected to its own selo (session). Demonstrates the full Krestianstvo UI layer: window drag/drop, portal open/close/destroy, child VM lifecycle, snapshot/restore on new peer join, and `goodbye` messages sent on tab close to clean up the reflector immediately.

---

## Notes

- All demos accept `?k=<seloId>` and `?r=<reflectorUrl>` URL parameters to connect to a custom session or reflector.
- The two-peer layout (peer A / peer B on the same page) is for development convenience — in production each peer runs in its own browser tab or device.
- `vm-lifecycle.js` is imported by all demos to register `beforeunload` / `pagehide` / `visibilitychange` goodbye handlers, ensuring clean reflector disconnection on tab close or bfcache navigation.
