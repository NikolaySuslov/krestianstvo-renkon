// krestianstvo/public/index.js
// Main entry point — re-exports the full public API.
//
// Usage:
//   import { KrestianstvoVM, krestianify, selo,
//            registerVM, parseUrlParams } from '../index.js';
//
// ProgramState is imported from the local vendored renkon-core.js.
// Download it once: curl -o public/renkon-core.js https://cdn.jsdelivr.net/npm/renkon-core/dist/renkon-core.js
// No init() call needed in your app.

import { ProgramState } from './renkon-core-0.10.7.js';
import { init }         from './krestianstvo-core.js';
import { KrestianstvoVM, parseUrlParams } from './krestianstvo-vm.js';
import { registerVM }   from './vm-lifecycle.js';
import { krestianify }  from './krestianify.js';
import { _injectDeps }  from './krestianstvo-core.js';

// Inject ProgramState once — all consumers get it via _getProgramState().
init({ ProgramState });

// Inject deps into core so selo() works without explicit passing.
_injectDeps({ KrestianstvoVM, registerVM, krestianify, parseUrlParams });

export { selo }            from './krestianstvo-core.js';
export { KrestianstvoVM, parseUrlParams } from './krestianstvo-vm.js';
export { krestianify }         from './krestianify.js';
export { registerVM }          from './vm-lifecycle.js';
