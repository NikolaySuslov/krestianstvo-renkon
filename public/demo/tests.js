// user-program2.js — Krestianstvo - Renkon | SDK 4 v2
//
// The user writes two explicit Renkon programs:
//   MODEL_PROGRAM  — runs inside model PS alongside the causality engine
//                    has access to: worldState, vTime, random(), future()
//   VIEW_PROGRAM   — runs inside view PS
//                    has access to: objects, vTime, clientIdentity, randomResult
//                    and any event type that drains (tick, toggleTick, spawnSelo, …)
//   APPLY_ACTION   — JS function-body string extending the base applyAction(state, msg)
//
// No MODEL_NODES list needed — the model/view split is explicit in the source.
// Cross-boundary communication:
//   model → view: worldState changes push objects+vTime to viewPS automatically.
//                 Any extra values can be pushed via registerEvent inside
//                 APPLY_ACTION or model nodes.
//   view → model: vm.ws.send({ type, data }) from view code.

// ── APPLY_ACTION — pure state-machine extension ───────────────────────────
// Receives (state, msg) after builtins (_join / _leave) are handled.
// Must return a new state object or fall through to `return state`.

const APPLY_ACTION = `
    if (msg.type === 'toggleTick') {
        const nowTicking = !state.ticking;
        if (nowTicking) {
            future(state.time, 1000, 'tick', {});
        }
        return { ...state, ticking: nowTicking };
    }

    if (msg.type === 'tick') {
        if (state.ticking) {
            future(state.time, 1000, 'tick', {});
            for (var i = 1; i <= 9; i++) {
                future(state.time, i * 100, 'subTick', { step: i });
            }
        }
        const r = random();
        return { ...state, randomResult: r };
    }

    if (msg.type === 'spawnSelo') {
        const name = msg.data?.name ?? '';
        if (!name) return state;
        const spawned = [...(state.spawned ?? [])];
        if (!spawned.includes(name)) spawned.push(name);
        return { ...state, spawned };
    }
`;

// ── MODEL_PROGRAM — Renkon nodes inside the model PS ─────────────────────
// The preamble already provides:
//   worldState, vTime, random(), future(), incoming, app
// Declare extra derived model nodes here.

const MODEL_PROGRAM = `
// App-level worldState projections — seeded from _initialState so snapshot restore reads correctly
const ticking      = Behaviors.collect((_initialState && _initialState.ticking)      || false, Events.change($worldState), (_, s) => s ? s.ticking      : false);
const randomResult = Behaviors.collect((_initialState && _initialState.randomResult) || null,  Events.change($worldState), (_, s) => s ? s.randomResult : null);

// tick: fires every 1000ms virtual (recursive future)
const tick    = Events.receiver();
const counter = Behaviors.collect(
    (_initialState && _initialState.counter) || 0,
    tick,
    (prev, _) => prev + 1
);

// subTick: fires 9 times per tick (+100ms..+900ms virtual)
// All 9 drain in a single causality pass when the heartbeat advances time
const subTick    = Events.receiver();
const subCounter = Behaviors.collect(
    (_initialState && _initialState.subCounter) || 0,
    subTick,
    (prev, _) => prev + 1
);
`;

// ── VIEW_PROGRAM — Renkon nodes inside the view PS ────────────────────────
// The preamble already provides:
//   objects, vTime, clientIdentity, randomResult, myObject
// Every drained event is also registerEvent'd here by _drain,
// so you can listen to e.g. 'tick', 'toggleTick', 'spawnSelo' directly.

const VIEW_PROGRAM = `
// App-level receivers — values pushed from model PS nodes via modelStateKeys
const ticking      = Behaviors.collect(false, Events.receiver(), function(_,v){return v||false;});
const randomResult = Behaviors.collect(null,  Events.receiver(), function(_,v){return v;});
const counter      = Behaviors.collect(0,     Events.receiver(), function(_,v){return v||0;});
const subCounter   = Behaviors.collect(0,     Events.receiver(), function(_,v){return v||0;});

// [TEST future] — counter + subCounter pushed via modelStateKeys
const _logCounter = Behaviors.collect(null, Events.change($counter), (_, n) => {
    console.log('%c[TEST counter] counter=' + n, 'color:#0f8;font-weight:bold');
    return null;
});

const _logSubCounter = Behaviors.collect(null, Events.change($subCounter), (_, n) => {
    console.log('%c[TEST subCounter] subCounter=' + n + ' (should be counter×9)',
        'color:#0a6;font-weight:bold');
    return null;
});

// [TEST peers]
const _logPeers = Behaviors.collect(null, Events.change($objects), (_, o) => {
    console.log('%c[TEST peers] ' + Object.keys(o ?? {}).length + ' peer(s)',
        'color:#0cf;font-weight:bold');
    return null;
});

// [TEST vTime]
const _logTime = Behaviors.collect(0, Events.change($vTime), (prev, t) => {
    if (t - prev >= 950)
        console.log('%c[TEST vTime] t=' + t, 'color:#888');
    return (t - prev >= 950) ? t : prev;
});

// spawnSelo is handled by the VM internally via _spawned → metaPS → children$
// No need to re-send from viewPS — that would create a reflector loop.
`;

export { MODEL_PROGRAM, VIEW_PROGRAM, APPLY_ACTION };
