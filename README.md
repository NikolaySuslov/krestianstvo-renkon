# Krestianstvo - Renkon | Pure FRP Croquet VM 

Introducing the Croquet-TeaTime-inspired, Renkon-driven collaborative computational engine (**WIP**)

#### Live demo (https://renkon.krestianstvo.org)

![](/doc/vm.jpg)


* Overall all parts of the classic **Croquet VM** are implemented, including **Reflector server**, **Virtual Time**, **Recursive Future Messages**, **Portals** etc. all in Renkon FRP architecture.
* Internal dispatcher of messages queue of the VM is implemented with **recursive causality drain**, that properly handles nested message future sends.
* Portals, Recursive spawning and Parallelising **"sheaf of sheaves of VMs"** running in form of Renkon signals
* No dependencies - works directly in browser or NodeJS
* Snapshot/Restoring logic - late joiners get full state + history replay
* **Krestianify compiller** converts a unified Renkon app (single source string) into the model/view split that KrestianstvoVM.start() expects.
* Distributing as an ES6 module

### Source files
* [krestianstvo-vm.js](public/krestianstvo-vm.js)
* [krestianify.js](public/krestianify.js)
* [reflector.js](reflector.js)

![](/doc/vm.gif)

### Documentation

- [Krestianstvo VM](/doc/krestianstvo-vm.md)
- [Krestianify compiler](/doc/krestianify.md)
- [Using as ES6 module](/doc/es6-module.md)
- [Demos explained](/doc/demos.md)

Learn more about

- [Krestianstvo SDK 4](https://github.com/NikolaySuslov/krestianstvo-playground) - [https://play.krestianstvo.org](https://play.krestianstvo.org)
- [Croquet VM](https://github.com/croquet/croquet) 
- [Renkon](https://github.com/yoshikiohshima/renkon)
---

### Simple app 

Import Krestianstvo VM as ES6 Module. No build step. No `npm install`. 

```html
<!DOCTYPE html>
<div id="root"></div>

<script type="module">
import { selo } from 'https://cdn.jsdelivr.net/npm/krestianstvo-renkon@latest/public/index.js';

const APP = `
// ── MODEL ──
const counter = Behaviors.collect(0, click, (prev, _) => prev + 1);

// ── VIEW ───
const click = Events.listener(Renkon.app.rootEl.querySelector('#btn'), 'click', () => 1);

const _render = (()=>{
  Renkon.app.rootEl.querySelector('#count').textContent = counter;
})();
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

### To run reflector localy

``` 
npm install
npm start
```

Open web browser:  
http://localhost:3000 - list demo apps.  

URL params for demo page:   
- ?k=seloName — selo id  
- ?r=http://host:port  — reflector base url



