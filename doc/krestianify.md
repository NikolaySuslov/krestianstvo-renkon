# Krestianify

**Krestianify** is a thin compiler that takes an ordinary [Renkon](https://github.com/neverworks/renkon) reactive program and splits it into two programs automatically — a **model** that runs identically on every connected peer, and a **view** that renders locally. The result is a multiplayer, deterministic, collaborative application with almost no extra code. Inspired by [renkon-croquet-maker](https://github.com/yoshikiohshima/renkon-croquet-maker).


You write one program. Krestianify does the rest.

---

## The idea

Renkon programs are graphs of reactive nodes — `Behaviors` and `Events` — that re-evaluate as data flows through them. Krestianify exploits a simple observation: some nodes belong to the shared world (model), and some belong to each peer's screen (view). You declare which nodes are model nodes. Krestianify rewires everything else automatically.

```
your program  ──►  krestianify(APP, MODEL_NODES)
                        │
              ┌─────────┴──────────┐
           modelProgram         viewProgram
        (runs on reflector,   (runs in browser,
         same on all peers)    one per client)
```

The model runs inside a **Krestianstvo VM** connected to a WebSocket reflector. The view subscribes to model state and sends user events back as messages. All of this wiring is generated — you never write it by hand.

---

## Writing a Krestianify app

A Krestianify app is just a Renkon program — a string of `const` declarations using `Events` and `Behaviors` combinators. You pass it to `krestianify()` along with the list of node names that belong to the model.

```js
const APP = `
const counter = Behaviors.collect(0, click, (prev, _) => prev + 1);

const click = Events.listener(Renkon.app.rootEl.querySelector("#btn"), "click", () => 1);

const _render = Behaviors.collect(null, counter, (_, n) => {
    Renkon.app.rootEl.querySelector("#count").textContent = n;
    return null;
});
`;

const MODEL_NODES = ['counter'];

const compiled = krestianify(APP, MODEL_NODES);
```

That's it. `counter` is shared across all peers. `click` is captured per-peer and forwarded to the model as a message. `_render` stays local. No sockets, no reducers, no message serialization written by hand.

---

## `random()` — deterministic randomness

Inside model combinators, `random()` replaces `Math.random()`. It draws from a shared seeded PRNG that advances identically on every peer. This means randomness is deterministic — every client produces the same value from the same call, in the same order, every time.

```js
// Color demo — click produces a random color, identical on all peers
const color = Behaviors.collect("#cccccc", click, (_, __) => {
    var h = Math.floor(random() * 360);
    var s = 40 + Math.floor(random() * 50);
    var l = 40 + Math.floor(random() * 20);
    return "hsl(" + h + "," + s + "%," + l + "%)";
});
```

Every peer calls `random()` in the same sequence and gets the same `h`, `s`, `l`. No coordination needed. No risk of divergence.

---

## `now()` — virtual time

Inside model combinators, `now()` returns **virtual time** — milliseconds elapsed since the session started, as tracked by the reflector. Virtual time is the same on all peers at the same logical moment, regardless of wall-clock differences or network lag.

```js
// Balls demo — record spawn time in virtual time
const ball = {
    id:        Math.floor(random() * 1e9),
    spawnedAt: now(),   // same value on every peer
    ...
};
```

Use `now()` for timestamps, durations, or anything that needs to agree across clients. Never use `Date.now()` inside model combinators.

---

## `future()` — deferred model events

`future(now(), delayMs, receiverName, eventData)` schedules an event to fire into a named `Events.receiver()` after `delayMs` virtual milliseconds. It is callable from inside any model combinator — including inside a `Behaviors.collect` accumulator.

This is the primary way to drive time-based model logic: animations, expiry, periodic ticks.

```js
// Balls demo — each tick moves balls, decrements fade, schedules the next tick
const _tick = Events.receiver();

const balls = Behaviors.collect([], Events.or(click, _tick), (prev, ev) => {

    if (ev.type === '_tick') {
        var alive = prev.map(function(b) {
            var nx = b.x + b.vx, ny = b.y + b.vy;
            var vx = b.vx, vy = b.vy;
            if (nx - b.r < 0 || nx + b.r > 800) { vx = -vx; nx = b.x + vx; }
            if (ny - b.r < 0 || ny + b.r > 600) { vy = -vy; ny = b.y + vy; }
            return Object.assign({}, b, { x: nx, y: ny, vx: vx, vy: vy, fade: b.fade - 0.033 });
        }).filter(function(b) { return b.fade > 0; });

        if (alive.length > 0) future(now(), 50, '_tick', { type: '_tick' }); // chain next tick
        return alive;
    }

    // click — spawn ball, kick off tick chain
    var speed = 1.5 + random() * 3.5;
    var angle = random() * Math.PI * 2;
    future(now(), 50, '_tick', { type: '_tick' });
    return prev.concat({
        id: Math.floor(random() * 1e9),
        x: ev.x, y: ev.y, r: 18 + Math.floor(random() * 24),
        color: 'hsl(' + Math.floor(random() * 360) + ',90%,50%)',
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        fade: 1.0
    });
});
```

Key properties of `future()`:

- Fires at **virtual time**, so all peers receive it at the same logical moment
- Can be called inside `Behaviors.collect` accumulators — no special context needed
- Self-chaining futures (`_tick` scheduling the next `_tick`) are the standard pattern for continuous model animation
- When no balls remain, the chain stops naturally — `future()` is never called on an empty array

---

## Model vs view split

The split follows a simple rule: nodes listed in `MODEL_NODES` go to the model. Everything else goes to the view. Krestianify then:

- Replaces model-side `Events.listener` nodes with `Events.receiver()` stubs
- Inserts `_kfy_send_*` wrappers in the view that forward events to the model over WebSocket
- Replaces view-side references to model nodes with `Behaviors.receiver()` stubs that receive pushed state

```
MODEL_NODES = ['counter']

model gets:                         view gets:
  const click = Events.receiver()     const click = Events.listener(btn, 'click', () => 1)
  const counter = Behaviors.collect(  const counter = Behaviors.receiver()
      0, click, (p, _) => p + 1)      const _render = Behaviors.collect(...)
                                       const _kfy_send_click = ...  ← auto-generated forwarder
```

The boundary is explicit and minimal. You control exactly what is shared.

---

## Booting

```js
const compiled = krestianify(APP, MODEL_NODES);

const vm = new KrestianstvoVM({
    seloId:       'my-session',
    wsUrl:        'ws://localhost:3000',
    modelProgram: compiled.modelProgram,
    viewProgram:  compiled.viewProgram,
    modelStateKeys: compiled.modelStateKeys,
    applyAction:  compiled.applyAction,
});

vm.start(document.getElementById('root'));
registerVM(vm); // registers goodbye on page unload
```

Multiple VMs can boot on the same page with different `seloId` values — the two-peer demos use this to show two clients side by side.

---

## Summary

| What you write | What Krestianify generates |
|---|---|
| One Renkon program | Separate model and view programs |
| `MODEL_NODES` list | WebSocket forwarders and receiver stubs |
| `random()` in model | Deterministic shared PRNG |
| `now()` in model | Virtual time, same on all peers |
| `future(now(), ms, name, data)` | Deferred model event, synchronized |

The surface area is tiny. A complete multiplayer app is a single string of Renkon combinators and a list of node names.
