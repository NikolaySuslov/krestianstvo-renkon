# Krestianstvo Portal System

## Overview

A **portal** in Krestianstvo is a model-side object that creates a live viewport from one selo into another. Portals are not windows — they are named rectangles in the world that define *where* you look and *what* you see. A **portal link** connects a local portal to a named portal in a remote selo, causing a clipped, slideable viewport to appear in the local world.

```
world:1  ──link──▶  world:2
  q1 (viewport frame)   p1 (viewport anchor)
  window shows world:2 content
  moving p1 in world:2 slides the content
```

---

## User Instructions

### Creating a Portal Rectangle

In the portal bar input field, type:

```
portal:myname
```

This creates a named, draggable dashed rectangle in the current world. The rectangle is a **viewport anchor** — it marks a position in this world's coordinate space. It has no content by itself.

- **Drag** the rectangle by its label area to reposition
- **Resize** using the bottom-right triangular handle
- **Delete** using the `×` button

### Linking Two Portals

To view world:2 through a portal in world:1:

1. In **world:2**, create a portal: `portal:p1`
2. In **world:1**, create a portal: `portal:q1`  
3. In **world:1**, create the link:

```
link:q1->world:2/p1
```

Syntax: `link:<local-portal>-><target-selo>/<remote-portal>`

This spawns a **link window** in world:1 positioned at `q1`'s location. The window shows world:2's content clipped and offset so that `p1`'s position in world:2 aligns with the top-left of the window.

You can specify max recursion depth with `:d=N`:

```
link:q1->world:2/p1:d=3
```

### Navigating the Viewport

- **Move p1 in world:2** → the content slides inside world:1's link window
- **Resize p1 in world:2** → world:1's link window resizes reactively (model-driven, no extra network round-trip)
- **Move the link window in world:1** → repositions the viewport frame independently of p1

### Using selo.html

```
selo.html?k=world:1        # open world:1 (full world app)
selo.html?k=world:2        # open world:2 in another tab
```

Then in world:1's portal bar: `portal:q1`, then in world:2: `portal:p1`, then back in world:1: `link:q1->world:2/p1`.

---

## Portal Grid Demo

`portal-grid-demo.html` opens two worlds side by side and automatically creates:

- **world:2**: 9 named portal rects (`p1`–`p9`) in a 3×3 grid + a balls app window
- **world:1**: 9 named portal rects (`q1`–`q9`) + 9 one-way links `q_i → p_i`

All 9 link windows in world:1 show live viewports into world:2. Move any `p_i` in world:2 to pan that viewport in world:1. The balls app in world:2 is visible through all 9 portals.

---

## Programmatic Creation

### Reading Portal State

Portal state is exposed on `Renkon.app` in the viewPS:

```js
const portals      = vm.viewPS.app._portalState;       // { id: { id, name, x, y, w, h } }
const portalLinks  = vm.viewPS.app._portalLinksState;  // { id: { id, fromPortalId, toSelo, toPortalName } }
```

### Via `future()` Inside applyAction

For deterministic programmatic setup, use `future()` inside applyAction. All peers produce identical results:

```js
// In applyAction — schedules portal creation at vTime+0
if (msg.type === 'mySetup') {
    future(state.time, 0, 'createNamedPortal',
        { name: 'auto-portal', x: 60, y: 60, w: 200, h: 150 });
    future(state.time, 10, 'createLink', {
        fromPortalName: 'auto-portal',   // resolved by name (__pending__ path)
        toSelo:         'other-world',
        toPortalName:   'their-portal',
    });
    return state;
}
```

The `createLink` handler resolves `fromPortalId` by `fromPortalName` when `fromPortalId` is `__pending__` or absent, so it works correctly even when the portal was created by a prior `future` in the same drain cycle.

### Krestianified App with Auto-Setup

Declare portal setup as a model node — no manual applyAction needed:

```js
APPS["my-portal-app"] = {
    modelNodes: ['ticking', 'windows', 'portals', 'portalLinks', ...],
    app: `
const portals     = Behaviors.collect((_initialState&&_initialState.portals)||{},
    Events.change(worldState), (_, s) => s ? s.portals : {});
const portalLinks = Behaviors.collect((_initialState&&_initialState.portalLinks)||{},
    Events.change(worldState), (_, s) => s ? s.portalLinks : {});

// Auto-setup runs once on first join (portals empty)
const _setup = Behaviors.collect(false, Events.change(worldState), function(done, ws) {
    if (done || Object.keys(ws.portals||{}).length > 0) return true;
    future(ws.time, 0,  'createNamedPortal', { name: 'view', x: 60, y: 60, w: 240, h: 180 });
    future(ws.time, 10, 'createLink', {
        fromPortalName: 'view',
        toSelo:         'other-world',
        toPortalName:   'anchor',
    });
    return true;
});
`,
    viewProgram:  APPS['world'].viewProgram,  // share world's view
    applyAction:  APPS['world'].applyAction,  // share world's action handlers
    buildUI: null,
};
```

---

## Architecture

### Model-Side Portal Objects

Portals live entirely in the model's `worldState`:

```js
state.portals = {
    'p_abc123': { id: 'p_abc123', name: 'p1', x: 80, y: 80, w: 160, h: 120 }
}

state.portalLinks = {
    'link_xyz': {
        id:           'link_xyz',
        fromPortalId: 'q_local',   // portal in THIS world
        toSelo:       'world:2',   // target world's seloId
        toPortalName: 'p1',        // portal name in target world
    }
}
```

`createLink` also adds a `spawned` entry which causes `_diffChildren` to create a **portal child VM** connecting to the remote world.

### Child VM Tagging

Portal child VMs are tagged in `_diffChildren`:

```js
child._isPortal  = true
child._linkId    = entry.linkId      // matches portalLinks entry
child._windowName = windowName       // for window container lookup
child._parent    = parentVM          // parent VM reference (chain traversal)
```

### Viewport Rendering

`_portalLinkSync` (VIEW node, runs in world:1's viewPS) does:

1. Finds the link window container via `childVM._windowName`
2. Reads `toPortal` position from `childVM.viewPS.app._portalState`
3. Applies offset to `.vm-content`: `left = -toPortal.x`, `top = 30 - toPortal.y`
4. The window's `overflow:hidden` clips the content to the viewport frame
5. Moving `toPortal` in world:2 → offset updates → content slides

### Cross-World Resize (Inter-Selo Model Messaging)

When `p1` is resized in world:2, the resize propagates to world:1's link window **without any additional ws.send** after the initial resize handle interaction:

```
User drags resize handle
  → VIEW sends resizePortal to world:2's model (1 ws.send via reflector)
  → world:2 applyAction: stores new size
      → future(time, 0, '_notifyLinkedResize', { portalId, w, h })
  → _notifyLinkedResize: finds world:1's VM via app.vm._parent
      → parentVM.injectModelMessage('_resizeWindow', { name, w, h })
         (direct in-process, NO ws.send, NO reflector)
  → world:1 applyAction: _resizeWindow with _injected:true
      → future(time, 0, '_applyWindowResize', { name, w, h })
  → _applyWindowResize: stores windows[name].w/h
  → _winSync VIEW: applies to DOM on all world:1 peers
```

### `injectModelMessage(type, data, fromSelo)`

Direct VM-to-VM model message, bypassing the reflector:

```js
// In applyAction (world:2):
if (app.vm && app.vm._parent) {
    app.vm._parent.injectModelMessage('myMessage', { value: 42 }, app.vm.seloId);
}
```

- Wraps as `client_msg` at the target VM's current `vTime`
- Feeds into `_raw` → `_enqueue` → `worldState` → `_drain` → `applyAction`
- **Deterministic**: every peer running world:2 calls this at the same vTime → every peer's world:1 processes the same message
- Requires both worlds to be co-located (same JS process)
- `app.vm` is accessible in applyAction via `appRef.vm`

### Mirror Recursion Control

When world:1 views world:2 and world:2 views world:1 (reverse link exists):

- By default: nested link windows have `.vm-content` hidden via CSS (`.kv-portal-window .kv-link-window .vm-content { visibility:hidden }`) — mirror is blocked
- **Mirror activates** when a reverse link exists AND `childVM.depth < childVM.maxDepth` — the `kv-mirror-active` class overrides the CSS hiding
- Control mirror depth with `:d=N` in the link command: `link:q1->world:2/p1:d=3`
- Regular content (balls, avatars, windows) always shows — only the recursive portal link window is selectively hidden/shown

### `_parent` Chain

Every child VM has `_parent` pointing to the VM that spawned it:

```js
vm._parent            // direct parent
vm._parent._parent    // grandparent
// Walk up to root:
let root = vm;
while (root._parent) root = root._parent;
```

Useful for cross-world communication from deeply nested child VMs.

---

## State Keys

| Key | Type | Description |
|---|---|---|
| `portals` | `{ id: Portal }` | Named viewport anchor rects |
| `portalLinks` | `{ id: Link }` | Directional connections between portals |

**Portal object:**

```ts
{ id: string, name: string, x: number, y: number, w: number, h: number }
```

**Link object:**

```ts
{ id: string, fromPortalId: string, toSelo: string, toPortalName: string }
```

---

## CSS Classes

| Class | Element | Meaning |
|---|---|---|
| `kv-portal-rect` | div | Portal rectangle in world coordinate space |
| `kv-portal-label` | span | Portal name label inside rect |
| `kv-portal-window` | window el | Link window container (isPortal child VM) |
| `kv-link-window` | window el | Specifically a link-type portal window |
| `kv-mirror-active` | window el | Mirror recursion is active for this window |

---

## applyAction Message Types

| Type | Data | Description |
|---|---|---|
| `createNamedPortal` | `{ name, x?, y?, w?, h? }` | Create named portal rect |
| `movePortal` | `{ id, x, y }` | Move portal rect |
| `resizePortal` | `{ id, w, h }` | Resize portal rect (triggers cross-world resize chain) |
| `closePortal` | `{ id }` | Remove portal and all its links |
| `createLink` | `{ fromPortalId\|fromPortalName, toSelo, toPortalName, maxDepth? }` | Create portal link |
| `deleteLink` | `{ id }` | Remove link and close child VM |
| `_notifyLinkedResize` | `{ portalId, w, h }` | Internal future — cross-world resize notify |
| `_resizeWindow` | `{ name, w, h }` | Resize link window in model |
| `_applyWindowResize` | `{ name, w, h }` | Internal future — apply resize deterministically |
