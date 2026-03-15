# Using krestianstvo-renkon as a ES6 module

## Import

```html
<script type="module">
import { selo, krestianify, KrestianstvoVM,
         registerVM, parseUrlParams }
    from 'https://cdn.jsdelivr.net/npm/krestianstvo-renkon@0.1.1/public/index.js';
</script>
```

No build step. No `npm install`. Works in any modern browser.

---

## Minimal app — `selo()`

`selo()` is the single entry point for a krestianified app. Pass it your Renkon program string, the list of model node names, a selo id, a reflector URL, and a DOM element.

```html
<!DOCTYPE html>
<div id="root"></div>

<script type="module">
import { selo } from 'https://cdn.jsdelivr.net/npm/krestianstvo-renkon@0.1.1/public/index.js';

const APP = `
// ── MODEL ────────────────────────────────────────────────────────────────
const counter = Behaviors.collect(0, click, (prev, _) => prev + 1);

// ── VIEW ─────────────────────────────────────────────────────────────────
const click = Events.listener(Renkon.app.rootEl.querySelector('#btn'), 'click', () => 1);

const _render = Behaviors.collect(null, counter, (_, n) => {
    Renkon.app.rootEl.querySelector('#count').textContent = n;
    return null;
});
`;

const buildUI = (rootEl, label) => {
    rootEl.innerHTML = `
        <div>${label}</div>
        <div id="count">0</div>
        <button id="btn">Click me</button>
    `;
};

selo({
    app:        APP,
    modelNodes: ['counter'],
    seloId:     'my-app',
    reflector:  'ws://localhost:3000',
    rootEl:     document.getElementById('root'),
    buildUI,
});
</script>
```

`counter` is shared across all connected peers. Every click on any peer increments it for everyone.

---

## `selo()` parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `app` | string | ✓ | Renkon program source |
| `modelNodes` | string[] | ✓ | Node names that live in the shared model |
| `seloId` | string | ✓ | Session/room identifier |
| `reflector` | string | ✓ | WebSocket reflector URL |
| `rootEl` | HTMLElement | ✓ | DOM element to mount into |
| `buildUI` | function | — | `(rootEl, label) => void` — builds DOM before VM starts |
| `label` | string | — | Peer label passed to `buildUI` |
| `delay` | number | — | ms before WebSocket connects (default: `0`) |
| `applyAction` | string | — | Extra `applyAction` body for custom state mutations |

`?k=` and `?r=` URL params override `seloId` and `reflector` if present.

Returns `Promise<KrestianstvoVM>`.

---

## Two peers on the same page

```js
const buildUI = (rootEl, label) => {
    rootEl.innerHTML = `<div>${label}</div><div id="count">0</div>`;
};

selo({ app: APP, modelNodes: ['counter'],
       seloId: 'demo', reflector: 'ws://localhost:3000',
       rootEl: document.getElementById('peerA'),
       label: 'Peer A', buildUI });

selo({ app: APP, modelNodes: ['counter'],
       seloId: 'demo', reflector: 'ws://localhost:3000',
       rootEl: document.getElementById('peerB'),
       label: 'Peer B', delay: 350, buildUI });
```

---

## Model builtins

These functions are available inside any model combinator (`Behaviors.collect` accumulator) and inside `applyAction`. They are deterministic — identical on all peers.

### When to use `Events.change($x)`

In Renkon, `Events.change($x)` is only needed when a `Behaviors.collect` node references **itself** as a trigger — i.e. a self-referential cycle. The `$` prefix tells Renkon to use the node's previous settled value as the trigger, breaking the cycle.

```js
// Self-referential — needs $worldState to break the cycle
const worldState = Behaviors.collect({}, Events.change($worldState), (s, ev) => ...);

// No cycle — plain name is correct
const _render = Behaviors.collect(null, counter, (_, n) => ...);
```

In krestianify apps, view nodes reading model receivers are never self-referential — always use the plain name.

---

### `now()`


Returns virtual time in milliseconds since the session started. Identical on all peers at the same logical moment.

```js
const ball = Behaviors.collect(null, click, (_, ev) => ({
    id:        uid('ball'),
    spawnedAt: now(),
    x: ev.x, y: ev.y,
}));
```

### `random()`

Draws from a shared seeded PRNG. Same sequence on all peers.

```js
const color = Behaviors.collect('#ccc', click, (_, __) => {
    return 'hsl(' + Math.floor(random() * 360) + ',80%,60%)';
});
```

### `future(now(), delayMs, receiverName, data)`

Schedules an event to fire into a named `Events.receiver()` after `delayMs` virtual milliseconds. Fires at the same virtual time on all peers.

```js
const _tick = Events.receiver();

const counter = Behaviors.collect(0, _tick, (prev, _) => {
    future(now(), 1000, '_tick', 1); // reschedule next tick
    return prev + 1;
});
```

Self-chaining `future()` calls are the standard pattern for model-driven animation and timers. Chain stops when you stop calling `future()`.

### `uid(prefix?)`

Generates a deterministic short ID from `random()`. Same result on all peers for the same call in sequence.

```js
var id = uid();         // → "4f7x2m9k1z3p8q5r"
var id = uid('ball');   // → "ball_4f7x2m9k1z3p8q5r"
```

106 bits of entropy (2 × 53-bit random values in base36). Deterministic — never use `crypto.randomUUID()` in model code.

### `Events.timer(N)` in model

In the model, `Events.timer(N)` is automatically rewritten by the krestianify compiler into a `future()`-based self-chaining receiver. No manual `future()` needed — just write it naturally and it becomes deterministic.

```js
const timer = Events.timer(1000); // fires every 1s, same on all peers

const counter = Behaviors.collect(0, timer, (prev, _) => prev + 1);
```

---

## Pre-declared nodes

These nodes are always available in view programs without declaring them. They are pushed from the model after every state change.

| Node | Type | Description |
|---|---|---|
| `vTime` | number | Virtual time in ms |
| `objects` | object | Map of all peers `{ clientId: { x, y, color, ... } }` |
| `clients` | string[] | Sorted array of clientIds currently in the selo |
| `clientJoined` | string[] | ClientIds that just joined (empty when no change) |
| `clientLeft` | string[] | ClientIds that just left (empty when no change) |
| `clientIdentity` | object | Own identity `{ clientId, seloId }` |
| `myObject` | object | Own peer object from `objects` |

```js
// ── VIEW ─────────────────────────────────────────────────────────────────

const _renderPeers = Behaviors.collect(null, clients, (_, ids) => {
    console.log(ids.length + ' peers online');
    console.log('I am:', clientIdentity.clientId);
    return null;
});

const _onJoin = Behaviors.collect(null, clientJoined, (_, ids) => {
    ids.forEach(id => console.log('joined:', id));
    return null;
});

const _onExit = Behaviors.collect(null, clientLeft, (_, ids) => {
    ids.forEach(id => console.log('left:', id));
    return null;
});
```

---

## Reacting to joins and exits in the model

`clientJoined` and `clientLeft` are also model-side nodes — use them to trigger game logic:

```js
// ── MODEL ─────────────────────────────────────────────────────────────────

const _welcome = Behaviors.collect(null, clientJoined, (_, ids) => {
    ids.forEach(id => future(now(), 0, 'welcome', { id: id }));
    return null;
});

const welcome = Events.receiver();
// ... handle 'welcome' in applyAction or another Behaviors.collect
```

Add `_welcome` and `welcome` to `modelNodes`.

---

## `applyAction` — custom state mutations

For advanced state logic pass an `applyAction` body string to `selo()`. It receives `(state, msg)` and has access to `future()`, `random()`, `uid()`, and `now()`.

```js
selo({
    app: APP,
    modelNodes: MODEL_NODES,
    seloId: 'game', reflector: 'ws://localhost:3000',
    rootEl: el, buildUI,
    applyAction: `
        if (msg.type === 'startRound') {
            future(state.time, 30000, 'roundEnd', {});
            return { ...state, round: state.round + 1, active: true };
        }
        if (msg.type === 'roundEnd') {
            return { ...state, active: false };
        }
    `,
});
```

---

## Direct VM usage (without krestianify)

For full control, use `KrestianstvoVM` directly and supply separate model/view programs:

```js
import { KrestianstvoVM, registerVM, parseUrlParams }
    from 'https://cdn.jsdelivr.net/npm/krestianstvo-renkon@0.1.1/public/index.js';

const { seloId, reflector } = parseUrlParams('my-app', 'ws://localhost:3000');

const vm = new KrestianstvoVM({ seloId, wsUrl: reflector });
vm.modelStateKeys = ['counter', 'ticking'];
vm.start({
    modelProgram: MODEL_PROGRAM,
    viewProgram:  VIEW_PROGRAM,
    applyAction:  APPLY_ACTION,
});
registerVM(vm);
```

---

## URL params

Any demo or app automatically supports these URL params:

| Param | Override |
|---|---|
| `?k=my-room` | `seloId` |
| `?r=wss://myserver.com` | `reflector` (`http://` → `ws://`, `https://` → `wss://`) |

```
https://myapp.com/demo.html?k=room-42&r=wss://myserver.com
```
