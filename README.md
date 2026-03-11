# Krestianstvo - Renkon | Pure FRP Croquet VM 

Introducing the Croquet-TeaTime-inspired, Renkon-driven collaborative computational engine (**WIP**)

#### Live demo (https://renkon.krestianstvo.org)

![](/public/doc/vm.jpg)


* Overall all parts of the classic **Croquet VM** are implemented, including **Reflector server**, **Virtual Time**, **Recursive Future Messages**, **Portals** etc. all in Renkon FRP architecture.
* Internal dispatcher of messages queue of the VM is implemented with **recursive causality drain**, that properly handles nested message future sends.
* Portals, Recursive spawning and Parallelising **"sheaf of sheaves of VMs"** running in form of Renkon signals
* No dependencies - works directly in browser or NodeJS
* Snapshot/Restoring logic - late joiners get full state + history replay
* **Krestianify compiller** converts a unified Renkon app (single source string) into the model/view split that KrestianstvoVM.start() expects.

### Source files
* [krestianstvo-vm.js](public/krestianstvo-vm.js)
* [krestianify.js](public/krestianify.js)
* [reflector.js](reflector.js)

![](public/doc/vm.gif)

## To run localy

``` 
npm install
npm start
```

Open web browser:   
http://localhost:3000 - for running tests.    
http://localhost:3000/demo.html - for demo app.  

URL params for demo page:   
- ?k=seloName — selo id  
- ?r=http://host:port  — reflector base url


### Learn more about:  

* [**Krestianstvo SDK 4**](https://github.com/NikolaySuslov/krestianstvo-playground) - [https://play.krestianstvo.org](https://play.krestianstvo.org)
* [**Croquet VM**](https://github.com/croquet/croquet) 
* [**Renkon**](https://github.com/yoshikiohshima/renkon)


# Documentation

## Table of Contents

- [Core Concepts](#core-concepts)
- [Three ProgramState Layers](#three-programstate-layers)
- [The Causality Engine](#the-causality-engine)
- [applyAction and Builtins](#applyaction-and-builtins)
- [Model → View Push Paths](#model--view-push-paths)
- [modelStateKeys](#modelstatekeys)
- [Snapshot Protocol](#snapshot-protocol)
- [Deterministic RNG](#deterministic-rng)
- [Source String Generation: `_src(fn)`](#source-string-generation-_srcfn)
- [Portal System and Recursive Selos](#portal-system-and-recursive-selos)
- [Writing an App](#writing-an-app)
- [Key Design Decisions](#key-design-decisions)
- [URL Parameters](#url-parameters)

---

## Core Concepts

### Reflector

A lightweight WebSocket server that does not simulate anything. It stamps each incoming message with a monotonic `serverTime` and broadcasts it to all peers in a selo. Peers receive the same messages in the same order at the same timestamps — determinism is guaranteed by the reflector's ordering, not by locking or consensus.

### Virtual Time

The model runs on a virtual clock driven by heartbeat messages from the reflector, not by `Date.now()`. All peers advance their virtual clock identically. `future(t, delay, type, data)` schedules a message at a deterministic virtual time regardless of real-world latency.

### Snapshot / Restore

When a new peer joins a running selo, the leader peer sends a snapshot of the current world state. The joiner restores from the snapshot, replays any buffered messages that arrived during the handshake, then joins the live stream seamlessly.

---

## Three ProgramState Layers

Each VM instance contains three independent Renkon `ProgramState` instances:

```
┌─────────────────────────────────────────────────────────┐
│  Meta PS  (protocol FSM — real time)                    │
│  wsMessages → wsMsg → seloState → spawnedNames          │
│                                 → children$             │
├─────────────────────────────────────────────────────────┤
│  Model PS  (causality engine — virtual time)            │
│  _raw → _enqueue → worldState ⟲ _drain → applyAction    │
│  + app MODEL_PROGRAM nodes (ticking, windows, counter…) │
├─────────────────────────────────────────────────────────┤
│  View PS  (display layer — 60 hz real time)             │
│  objects, vTime, clientIdentity, myObject               │
│  + app VIEW_PROGRAM nodes (renderer, input handlers…)   │
└─────────────────────────────────────────────────────────┘
```

### Meta PS

The outermost layer. Drives the WebSocket protocol state machine: connecting → buffering → live.

| Node | Role |
|---|---|
| `wsMessages` | Raw WS stream as async generator |
| `wsMsg` | Latest parsed message |
| `seloState` | Protocol phase FSM (`null` → `buffering` → `live`) |
| `_spawned` | Receiver for spawned child selo names |
| `spawnedNames` | Current list of spawned children |
| `children$` | Reactive `Map<name, KrestianstvoVM>` — managed by `_diffChildren` |

### Model PS

The causality engine. Runs on **virtual time** only — `evaluate(t)` is called manually at each virtual timestamp, never from a RAF loop.

| Node | Role |
|---|---|
| `worldState` | Entire shared simulation state |
| `incoming` | Raw message receiver |
| `_enqueue` | Inserts messages into the time-ordered queue |
| `_drain` | Processes one message per call, recurses until queue empty |
| `applyAction` | Builtin + user-supplied state reducer |
| `vTime` | Virtual clock projected from `worldState.time` |
| `objects` | Peer map projected from `worldState.objects` |
| *(app nodes)* | User-declared projection nodes: `ticking`, `windows`, `randomResult`, `counter`, etc. |

### View PS

The display layer. Runs on a real-time 60 hz `evaluator()` RAF loop. Receives pushed values from the model via `registerEvent()` calls made inside `_drain`. Never reads model state directly.

| Node | Role |
|---|---|
| `objects` | Peer map — pushed directly from `worldState.objects` after each drain step |
| `vTime` | Virtual clock — pushed directly from `worldState.time` |
| `clientIdentity` | Own `clientId` + `seloId` |
| `myObject` | Own peer object derived from `objects` |
| *(app nodes)* | Receiver behaviors for each `modelStateKeys` entry, plus VIEW_PROGRAM |

---

## The Causality Engine

`worldState` is a `Behaviors.collect` node that is both accumulator and its own trigger:

```js
const worldState = Behaviors.collect(
    { ...initialState },
    Events.or(incoming, Events.change($worldState)),
    (state, ev) => {
        // ev is either a new incoming message (enqueue path)
        // or a self-triggered drain signal (drain path)
        if (ev.time !== undefined && ev.queue !== undefined) {
            const drained = _drain(state);
            return drained === state ? state : drained;  // same ref = stop
        }
        return _enqueue(state, ev);
    }
);
```

The self-referential loop drives drain recursion without any explicit JS loop:

1. Heartbeat arrives → `_enqueue` advances `worldState.time`
2. `Events.change($worldState)` fires → `_drain` checks the queue
3. A message is ready at current virtual time → `applyAction` runs → new `worldState`
4. The new `worldState` triggers itself again → `_drain` recurses
5. Queue empty → `_drain` returns same reference → loop breaks

This gives **sub-tick ordering** — multiple messages at the same virtual time are processed in sequence within a single real-time frame.

---

## `applyAction` and Builtins

`applyAction` is composed of a VM builtin layer concatenated with the user's body string. Builtins run first:

| Message | Effect |
|---|---|
| `_join` | Creates peer object with deterministic color via shared RNG |
| `_leave` / `disconnect` | Removes peer object from `worldState.objects` |
| `_move` | Updates peer position |
| `spawnSelo` | Adds name to `worldState.spawned` |
| `_moveWindow` | Updates portal window position in `worldState.windows` |
| `_closeWindow` | Removes portal window and name from spawned list |
| `toggleTick` | Flips `worldState.ticking`, schedules first `tick` future |
| `tick` | Advances virtual counter, schedules next `tick` + 9 `subTick` futures |

The user's `APPLY_ACTION` body string is appended after the builtins. It receives `(state, msg)` and must return a new state object or fall through to `return state`.

---

## Model → View Push Paths

There are two distinct paths from model to view:

### 1. Direct push — `objects` and `vTime`

These are VM fundamentals. The `_drain` function pushes them directly from `worldState` after every action, bypassing the Renkon node graph:

```js
if (next.objects !== s.objects) app.viewPS.registerEvent('objects', next.objects);
if (next.time   !== s.time)    app.viewPS.registerEvent('vTime',   next.time);
```

> **Important:** `objects` and `vTime` must **not** be included in `modelStateKeys`. They are VM-managed and pushed directly — routing them through the `modelStateKeys` loop introduces a one-cycle lag that causes stale values and dropped updates.

### 2. `modelStateKeys` — app-declared projection nodes

All other app state. The drain loop reads named Renkon nodes from the model PS after each drain step and pushes changed values to viewPS:

```js
modelStateKeys.forEach(key => {
    const val = readNodeFromModelPS(key);
    if (val !== prev[key]) viewPS.registerEvent(key, val);
});
```

---

## `modelStateKeys`

`modelStateKeys` is an array of MODEL_PROGRAM Renkon node names set on the VM instance before `start()`. It controls three things:

1. **Snapshot inclusion** — node values are read from the model PS and included in the snapshot payload
2. **Drain push** — after each drain step, changed values are pushed to viewPS
3. **Snapshot restore** — values are pushed to viewPS from the snapshot on join

```js
vm.modelStateKeys = ['ticking', 'windows', 'randomResult', 'counter', 'subCounter'];
//                   ^ never include 'objects' or 'vTime' — those are VM-managed
```

### Declaring projection nodes

For each key in `modelStateKeys`, declare a matching node in MODEL_PROGRAM that projects from `worldState`, **seeded from `_initialState`**:

```js
// MODEL_PROGRAM
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    Events.change($worldState),
    (_, s) => s ? s.ticking : false
);
```

And a matching receiver in VIEW_PROGRAM:

```js
// VIEW_PROGRAM
const ticking = Behaviors.collect(false, Events.receiver(), (_, v) => v || false);
```

> **The `_initialState` seed is mandatory.** `Events.change($worldState)` only fires when `worldState` *changes*. On snapshot restore, `worldState` is seeded as the initial value — no change event fires. Without the `_initialState` seed, the projection node returns its hardcoded default instead of the restored value.

---

## Snapshot Protocol

```
New peer                  Reflector              Leader peer
    │                          │                       │
    ├──── connect ────────────►│                       │
    │◄─── selo_joined ─────────┤                       │
    │  [enter buffering phase] │                       │
    │                          ├─ request_snapshot ───►│
    │                          │◄─ snapshot_response ──┤
    │◄─── snapshot_apply ──────┤                       │
    │  [restore model PS]      │                       │
    │  [push objects+vTime]    │                       │
    │  [push modelStateKeys]   │                       │
    │  [replay buffered msgs]  │                       │
    ├──── _join ──────────────►│──── broadcast ───────►│
    │  [enter live phase]      │                       │
```

The snapshot payload is `Object.assign({}, worldState, { _rngState: ... })` — the full `worldState` object serialized generically with no hardcoded field names. Any field an app stores in `worldState` via `applyAction` is included automatically. `modelStateKeys` node values are appended on top (e.g. `counter`/`subCounter` live only as Renkon nodes, not in `worldState`).

`_modelStatePrev` is pre-seeded from snapshot values so the first drain step does not push stale defaults over the restored view state.

---

## Deterministic RNG

All peers must produce identical random values for shared state (avatar colors, positions, etc.). A [xoroshiro128+](https://prng.di.unimi.it/) PRNG is implemented as pure JS functions, seeded from a value agreed at selo creation. The RNG state is captured in `worldState._rngState` and included in every snapshot so late joiners resume the exact same sequence.

```js
const r = random();  // available inside MODEL_PROGRAM and APPLY_ACTION
```

---

## Source String Generation: `_src(fn)`

Renkon programs are passed as source strings to `ProgramState.setupProgram()`. All preamble builders use a small helper to keep node definitions readable:

```js
const _src = fn => fn.toString()
    .replace(/^[^{]*\{/, '')
    .replace(/\s*\}\s*$/, '');
```

Node definitions are written as real JS — syntax-highlighted, IDE-navigable, properly indented — and `_src()` strips the wrapper at runtime:

```js
const vTimeSrc = _src(function() {
const vTime   = Behaviors.collect((_initialState && _initialState.time)    || 0,
    Events.change($worldState), (_, s) => s ? s.time    : 0);
const objects = Behaviors.collect((_initialState && _initialState.objects) || {},
    Events.change($worldState), (_, s) => s ? s.objects : {});
});
```

Engine functions (`_drain`, `_enqueue`, `future`, `_xoroshiroSeed`, `_xoroshiroNext`) are real JS functions stringified via `_vmFnToConst()` — independently testable and debuggable.

---

## Portal System and Recursive Selos

A selo can spawn child selos via `spawnSelo` in `applyAction`. The full lifecycle:

```
applyAction adds name to worldState.spawned
    → _drain pushes to metaPS._spawned receiver
    → spawnedNames behavior updates
    → children$ calls _diffChildren(prev, names)
        → new name:     new KrestianstvoVM started
        → removed name: child.ws.close() + onClose callback (DOM removed)
    → onSpawn callback → DOM container created at saved or tiled position
```

Child VMs inherit `modelStateKeys` and `maxDepth` from the parent. Depth is tracked and capped at `maxDepth` (default 10). Each child is a complete independent VM with its own WebSocket connection, model PS, view PS, and snapshot lifecycle.

---

## Writing an App

An app supplies three exports:

```js
const cfg = { modelProgram: MODEL_PROGRAM, viewProgram: VIEW_PROGRAM, applyAction: APPLY_ACTION };
vm.start(cfg);
```

### `APPLY_ACTION`

A JS function body string. Receives `(state, msg)`, must return a new state. Has access to `future()` and `random()`.

```js
export const APPLY_ACTION = `
    if (msg.type === 'toggleTick') {
        if (!state.ticking) future(state.time, 1000, 'tick', {});
        return { ...state, ticking: !state.ticking };
    }
`;
```

### `MODEL_PROGRAM`

A Renkon program string. Declare projection nodes for every entry in `modelStateKeys`, seeded from `_initialState`:

```js
export const MODEL_PROGRAM = `
const ticking = Behaviors.collect(
    (_initialState && _initialState.ticking) || false,
    Events.change($worldState), (_, s) => s ? s.ticking : false
);
const counter = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    Events.receiver(), (prev, _) => prev + 1
);
`;
```

### `VIEW_PROGRAM`

A Renkon program string. Declare receiver nodes at the top for each `modelStateKeys` entry. `objects`, `vTime`, `clientIdentity`, `myObject` are already available from VIEW_PREAMBLE.

```js
export const VIEW_PROGRAM = `
const ticking = Behaviors.collect(false, Events.receiver(), (_, v) => v || false);
const counter = Behaviors.collect(0,     Events.receiver(), (_, v) => v || 0);

const renderer = Behaviors.collect(null, Events.timer(16), (_, __) => {
    // render using objects, vTime, clientIdentity, ticking, counter...
});
`;
```

### Boot

```js
const vm = new KrestianstvoVM({ seloId: 'my-room', wsUrl: 'ws://localhost:3000' });
vm.modelStateKeys = ['ticking', 'windows', 'randomResult', 'counter', 'subCounter'];
vm.start(cfg);
```

---

## Key Design Decisions

**`objects` and `vTime` are VM-managed, not app-declared.** They are pushed directly from `worldState` in the drain loop. Routing them through `modelStateKeys` introduces a one-evaluation-cycle lag — nodes update after `evaluate()`, which runs after the drain push — causing stale values and dropped updates (the alternating-click bug).

**Model PS never calls `viewPS.evaluate()`.** The 60 hz evaluator on viewPS is entirely self-driven. The model only calls `viewPS.registerEvent(key, value)`, queuing values for the next RAF frame. This prevents re-entrant evaluation bugs.

**`_makeSend` has no time gate.** All messages including `disconnect` (which carries `serverTime=0`) are injected into `_raw` and evaluated. This ensures peer removal is immediate.

**Space key routing.** A single `document.addEventListener('keydown')` is installed once per page. `_activeWS` tracks which pane the mouse is in via `mouseenter`/`mousedown`. Space always routes to the active pane's WebSocket, including portal child windows.

**Snapshot serializes full `worldState` generically.** `Object.assign({}, worldState, ...)` — no hardcoded field names. Any field an app stores in `worldState` is included in snapshots automatically.

**`_initialState` seeding is mandatory for projection nodes.** Every MODEL_PROGRAM projection node must be seeded from `_initialState`. Without this, post-replay reads return the hardcoded default because the initial `worldState` seed does not trigger `Events.change($worldState)`.

---

## URL Parameters

```
?k=seloName          selo id            (default: demo-main)
?r=http://host:port  reflector base url (default: ws://localhost:3000)
```

`http://` and `https://` in the `r` parameter are automatically converted to `ws://` and `wss://`:

