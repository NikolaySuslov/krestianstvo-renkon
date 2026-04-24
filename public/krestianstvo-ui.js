// krestianstvo-ui.js — Krestianstvo - Renkon | SDK 4
// Pure DOM construction and layout — no VM, no WS, no Renkon.
//
// API:
//   KrestianstvoUI.createVMTitleBar(containerEl, { name, draggable, showClose, showJoin })
//   KrestianstvoUI.createSeloContainer(name, parentEl, { onMove, onClose })
//   KrestianstvoUI.makeDraggable(el, handleEl, { onMove })
//   KrestianstvoUI.createPortalBar(rootEl, { onInput, onSubmit, disabled })
//   KrestianstvoUI.injectStyles()

const KrestianstvoUI = (() => {

    const C = {
        border:      'rgba(175,175,205,0.50)',
        titleBg:     'rgba(226,226,242,0.80)',
        titleBorder: 'rgba(188,188,215,0.52)',
        titleText:   '#445',
        statsBg:     'rgba(236,236,250,0.48)',
        statsBorder: 'rgba(185,185,215,0.28)',
        statsText:   'rgba(62,72,108,0.62)',
        inputBg:     'rgba(255,255,255,0.72)',
        inputBorder: 'rgba(142,142,178,0.48)',
        inputText:   '#334',
        btnBg:       'rgba(222,222,242,0.72)',
        btnBorder:   'rgba(128,128,172,0.48)',
        btnText:     '#446',
        closeBg:     'rgba(255,208,208,0.62)',
        closeBorder: 'rgba(192,138,138,0.42)',
        closeText:   '#a33',
        portalBg:    'rgba(245,245,255,0.82)',
    };

    let _stylesInjected = false;
    function injectStyles() {
        if (_stylesInjected) return;
        _stylesInjected = true;
        const s = document.createElement('style');
        s.textContent = `
.vm-root { position:absolute; inset:0; background:#f5f5f8; overflow:hidden; cursor:crosshair; outline:none; font-family:monospace; touch-action:none; }
.avatar { position:absolute; pointer-events:none; }
.vm-portal-bar { padding-bottom: max(5px, env(safe-area-inset-bottom)) !important; }
.vm-close-btn { background:transparent; border:none; border-radius:3px; color:rgba(175,55,55,0.52); cursor:pointer; flex:0 0 auto; font-size:13px; width:16px; height:16px; display:flex; align-items:center; justify-content:center; padding:0; touch-action:manipulation; transition:background 0.1s,color 0.1s; }
.vm-close-btn:hover { background:rgba(195,70,70,0.15); color:#b33; }
`;
        document.head.appendChild(s);
    }

    function makeDraggable(el, handleEl, { onMove } = {}) {
        let ox = 0, oy = 0, mx = 0, my = 0, dragging = false;
        let _lastMove = 0; // throttle to 20fps

        function startDrag(cx, cy) {
            dragging = true; mx = cx; my = cy;
            ox = parseInt(el.style.left) || 0; oy = parseInt(el.style.top) || 0;
        }
        function moveDrag(cx, cy) {
            if (!dragging) return;
            const nx = ox + cx - mx, ny = oy + cy - my;
            const now = Date.now();
            if (onMove && now - _lastMove >= 50) { _lastMove = now; onMove(nx, ny); }
            // Position is set by model confirmation (_winSync), not locally
        }
        function endDrag() { dragging = false; }
        const _onMouseMove = e => moveDrag(e.clientX, e.clientY);
        const _onMouseUp   = () => endDrag();

        // Mouse
        handleEl.addEventListener('mousedown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            startDrag(e.clientX, e.clientY);
            e.stopPropagation(); e.preventDefault();
        });
        document.addEventListener('mousemove', _onMouseMove);
        document.addEventListener('mouseup',   _onMouseUp);

        // Touch
        // destroy — call when window is closed to remove document-level listeners
        el._destroyDrag = () => {
            document.removeEventListener('mousemove', _onMouseMove);
            document.removeEventListener('mouseup',   _onMouseUp);
        };

        handleEl.addEventListener('touchstart', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
            e.stopPropagation(); e.preventDefault();
        }, { passive: false });
        handleEl.addEventListener('touchmove', e => {
            const t = e.touches[0];
            moveDrag(t.clientX, t.clientY);
            e.preventDefault();
        }, { passive: false });
        handleEl.addEventListener('touchend', endDrag);
    }

    function tilePosition(parentEl, childW, childH, margin) {
        margin = margin || 12;
        const n = parentEl.querySelectorAll('[data-selo-id]').length;
        const parentW = parentEl.clientWidth || 440;
        const cols = Math.max(1, Math.floor((parentW - margin) / (childW + margin)));
        return {
            x: margin + (n % cols) * (childW + margin),
            y: margin + Math.floor(n / cols) * (childH + margin),
        };
    }

    // Creates a compact title bar and appends it to containerEl.
    // opts: { name, height, draggable, showClose, showJoin, showStats }
    //   height defaults: 22px for window bars, pass 18 for stats-only bars
    //   showClose → × button at far right
    //   showJoin  → [input][Join] after label
    //   showStats → T:clock P:peers at far right
    // Returns: { bar, label, closeBtn, cinp, cbtn, clockEl, peersEl }
    function createVMTitleBar(containerEl, opts) {
        opts = opts || {};
        const h = opts.height || 22;
        const isStats = opts.showStats && !opts.showClose && !opts.showJoin;

        const bar = document.createElement('div');
        bar.style.cssText =
            'position:absolute;top:0;left:0;right:0;height:' + h + 'px;' +
            'background:' + (isStats ? C.statsBg : C.titleBg) + ';' +
            'border-bottom:1px solid ' + (isStats ? C.statsBorder : C.titleBorder) + ';' +
            'display:flex;align-items:center;padding:0 5px;gap:3px;' +
            'font-size:' + (isStats ? '9px' : '10px') + ';' +
            'font-weight:' + (isStats ? 'normal' : 'bold') + ';' +
            'color:' + (isStats ? C.statsText : C.titleText) + ';' +
            'z-index:10;' + (opts.draggable ? 'cursor:move;' : '') +
            'user-select:none;touch-action:none;box-sizing:border-box;';

        // Close button first — left corner (macOS style), flat via CSS class
        let closeBtn = null;
        if (opts.showClose) {
            closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            closeBtn.className = 'vm-close-btn';
            closeBtn.addEventListener('mousedown', e => e.stopPropagation());
            bar.appendChild(closeBtn);
        }

        const label = document.createElement('span');
        label.className = 'vm-label';
        label.textContent = opts.name || '';
        label.style.cssText = (isStats ? 'flex:1;min-width:0;' : 'flex:0 0 auto;') +
            'max-width:' + (isStats ? 'none' : '58px') + ';' +
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        bar.appendChild(label);

        let cinp = null, cbtn = null;
        if (opts.showJoin) {
            cinp = document.createElement('input');
            cinp.value = opts.name || '';
            cinp.style.cssText =
                'width:54px;padding:0 3px;height:16px;' +
                'background:' + C.inputBg + ';color:' + C.inputText + ';' +
                'border:1px solid ' + C.inputBorder + ';border-radius:3px;' +
                'font-size:11px;font-family:monospace;flex:0 0 auto;' +
                'touch-action:manipulation;-webkit-user-select:text;user-select:text;' +
                'box-sizing:border-box;';
            cinp.addEventListener('mousedown', e => e.stopPropagation());
            cinp.addEventListener('keydown',   e => e.stopPropagation());
            if (containerEl) {
                cinp.addEventListener('focus', () => {
                    containerEl._lockedW = containerEl.offsetWidth;
                    containerEl._lockedH = containerEl.offsetHeight;
                    containerEl.style.width  = containerEl._lockedW + 'px';
                    containerEl.style.height = containerEl._lockedH + 'px';
                });
                cinp.addEventListener('blur', () => {
                    containerEl._lockedW = null;
                    containerEl._lockedH = null;
                });
            }

            cbtn = document.createElement('button');
            cbtn.textContent = 'Join';
            cbtn.style.cssText =
                'padding:0 5px;height:16px;' +
                'background:' + C.btnBg + ';color:' + C.btnText + ';' +
                'border:1px solid ' + C.btnBorder + ';border-radius:3px;' +
                'font-size:10px;cursor:pointer;flex:0 0 auto;' +
                'touch-action:manipulation;box-sizing:border-box;';
            cbtn.addEventListener('mousedown', e => e.stopPropagation());

            bar.appendChild(cinp);
            bar.appendChild(cbtn);
        }

        let clockEl = null, peersEl = null;
        if (opts.showStats) {
            const vmStats = document.createElement('span');
            vmStats.style.cssText = 'margin-left:auto;white-space:nowrap;flex-shrink:0;';
            vmStats.innerHTML = 'T:<span class="vm-clock">-</span> P:<span class="vm-peers">-</span>';
            bar.appendChild(vmStats);
            clockEl = vmStats.querySelector('.vm-clock');
            peersEl = vmStats.querySelector('.vm-peers');
        }

        if (containerEl) containerEl.appendChild(bar);
        return { bar, label, closeBtn, cinp, cbtn, clockEl, peersEl };
    }

    function createSeloContainer(name, parentEl, opts) {
        opts = opts || {};
        const onMove = opts.onMove, onClose = opts.onClose, onResize = opts.onResize, onRotate = opts.onRotate;
        const CHILD_W = 240, CHILD_H = 180;
        const el = document.createElement('div');
        el.dataset.seloId = name;
        el.setAttribute('tabindex', '-1');
        el.style.cssText =
            'position:absolute;left:20px;top:40px;' +
            'width:' + CHILD_W + 'px;height:' + CHILD_H + 'px;' +
            'min-width:120px;min-height:60px;' +
            'background:rgba(255,255,255,0.40);' +
            'border:1.5px solid ' + C.border + ';' +
            'border-radius:6px;overflow:hidden;cursor:crosshair;' +
            'z-index:20;outline:none;box-shadow:0 2px 16px rgba(0,0,80,0.13);';

        const tbResult = createVMTitleBar(el, {
            name,
            height:    22,
            draggable: true,
            showClose: true,
            showJoin:  true,
        });
        const titleBar = tbResult.bar;
        const cinp     = tbResult.cinp;
        const cbtn     = tbResult.cbtn;
        const closeBtn = tbResult.closeBtn;

        closeBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (el._destroyDrag) el._destroyDrag();
            el.remove();
            if (onClose) onClose(name);
        });

        makeDraggable(el, titleBar, {
            onMove: onMove ? (x, y) => onMove(name, x, y) : null
        });

        // ── Resize handle — bottom-right corner ───────────────────────────
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText =
            'position:absolute;bottom:0;right:0;width:14px;height:14px;cursor:se-resize;' +
            'z-index:30;opacity:0.4;' +
            'background:linear-gradient(135deg,transparent 50%,' + C.border + ' 50%);' +
            'border-bottom-right-radius:5px;';
        function _startResize(startX, startY) {
            var startW = el.offsetWidth, startH = el.offsetHeight;
            var minW = 120, minH = 80;
            var _lastSend = 0;
            function onMove(cx, cy) {
                var w = Math.max(minW, startW + cx - startX);
                var h = Math.max(minH, startH + cy - startY);
                // Throttle sends to ~20fps — model updates drive all rendering
                var now = Date.now();
                if (onResize && now - _lastSend >= 50) {
                    _lastSend = now;
                    onResize(name, w, h);
                }
            }
            function onEnd(cx, cy) {
                // Final send on release
                var w = Math.max(minW, startW + cx - startX);
                var h = Math.max(minH, startH + cy - startY);
                if (onResize) onResize(name, w, h);
            }
            function onMouseMove(e) { onMove(e.clientX, e.clientY); }
            function onMouseUp(e)   {
                onEnd(e.clientX, e.clientY);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup',   onMouseUp);
            }
            function onTouchMove(e) { var t = e.touches[0]; onMove(t.clientX, t.clientY); }
            function onTouchEnd(e)  {
                var t = e.changedTouches[0];
                onEnd(t.clientX, t.clientY);
                document.removeEventListener('touchmove', onTouchMove);
                document.removeEventListener('touchend',  onTouchEnd);
            }
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup',   onMouseUp);
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend',  onTouchEnd);
        }
        resizeHandle.addEventListener('mousedown', function(e) {
            e.stopPropagation(); e.preventDefault();
            _startResize(e.clientX, e.clientY);
        });
        resizeHandle.addEventListener('touchstart', function(e) {
            e.stopPropagation();
            var t = e.touches[0];
            _startResize(t.clientX, t.clientY);
        }, { passive: false });
        el.appendChild(resizeHandle);

        // ── Rotate handle — bottom-left corner ────────────────────────────
        const rotateHandle = document.createElement('div');
        rotateHandle.title = 'Rotate';
        rotateHandle.style.cssText =
            'position:absolute;bottom:0;left:0;width:22px;height:22px;cursor:crosshair;' +
            'z-index:30;opacity:0.4;touch-action:none;' +
            'background:linear-gradient(225deg,transparent 50%,' + C.border + ' 50%);' +
            'border-bottom-left-radius:5px;';
        (function() {
            var _startAngle = 0, _lastSend = 0;
            function _getCenter() {
                var r = el.getBoundingClientRect();
                return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
            }
            function _angleFrom(cx, cy, ex, ey) {
                return Math.atan2(ey - cy, ex - cx) * 180 / Math.PI;
            }
            function _startRotate(ex, ey) {
                var c = _getCenter();
                _startAngle = _angleFrom(c.cx, c.cy, ex, ey);
                var cur = parseFloat(el.style.transform && el.style.transform.replace('rotate(','').replace('deg)','')) || 0;
                _startAngle -= cur;
            }
            function _onMove(ex, ey) {
                var c = _getCenter();
                var angle = Math.round(_angleFrom(c.cx, c.cy, ex, ey) - _startAngle);
                var now = Date.now();
                if (onRotate && now - _lastSend >= 50) { _lastSend = now; onRotate(name, angle); }
            }
            function _onEnd(ex, ey) {
                var c = _getCenter();
                var angle = Math.round(_angleFrom(c.cx, c.cy, ex, ey) - _startAngle);
                if (onRotate) onRotate(name, angle);
            }
            function _mm(e) { _onMove(e.clientX, e.clientY); }
            function _mu(e)  { _onEnd(e.clientX, e.clientY);
                document.removeEventListener('mousemove', _mm);
                document.removeEventListener('mouseup', _mu); }
            function _tm(e)  { var t = e.touches[0]; _onMove(t.clientX, t.clientY); }
            function _tu(e)  { var t = e.changedTouches[0]; _onEnd(t.clientX, t.clientY);
                document.removeEventListener('touchmove', _tm);
                document.removeEventListener('touchend', _tu); }
            rotateHandle.addEventListener('mousedown', function(e) {
                e.stopPropagation(); e.preventDefault();
                _startRotate(e.clientX, e.clientY);
                document.addEventListener('mousemove', _mm);
                document.addEventListener('mouseup', _mu);
            });
            rotateHandle.addEventListener('touchstart', function(e) {
                e.stopPropagation();
                var t = e.touches[0]; _startRotate(t.clientX, t.clientY);
                document.addEventListener('touchmove', _tm, { passive: false });
                document.addEventListener('touchend', _tu);
            }, { passive: false });
        })();
        el.appendChild(rotateHandle);

        parentEl.appendChild(el);
        //parentEl.insertBefore(el, parentEl.firstChild);
        return { el, titleBar, cinp, cbtn, closeBtn, resizeHandle, rotateHandle };
    }

    function createPortalBar(rootEl, opts) {
        opts = opts || {};
        const onInput = opts.onInput, onSubmit = opts.onSubmit, disabled = opts.disabled || false;

        let bar = rootEl.querySelector('.vm-portal-bar');
        if (bar) return { bar, input: bar.querySelector('input'), button: bar.querySelector('button') };

        bar = document.createElement('div');
        bar.className = 'vm-portal-bar';
        bar.style.cssText =
            'position:absolute;bottom:0;left:0;right:0;height:30px;' +
            'display:flex;align-items:center;gap:4px;' +
            'padding:0 20px 0 26px;' +  /* clear rotate handle (22px left) and resize handle (14px right) */
            'background:' + C.statsBg + ';border-top:1px solid ' + C.statsBorder + ';' +
            'z-index:20;box-sizing:border-box;';

        const inp = document.createElement('input');
        inp.placeholder = disabled ? 'max depth reached' : 'selo / app:name';
        inp.disabled = disabled;
        inp.style.cssText =
            'flex:1;min-width:0;padding:0 5px;height:20px;' +
            'border:1px solid ' + C.inputBorder + ';border-radius:3px;' +
            'font-size:12px;font-family:monospace;' +
            'background:' + (disabled ? 'rgba(220,220,230,0.5)' : C.inputBg) + ';color:#334;' +
            'touch-action:manipulation;-webkit-user-select:text;user-select:text;' +
            'box-sizing:border-box;';
        // iOS fix: lock rootEl dimensions during input focus to prevent
        // visual-viewport shrink from resizing the portal window container.
        // if (!disabled) {
        //     inp.addEventListener('focus', () => {
        //         if (rootEl && rootEl.style) {
        //             rootEl._barFocusW = rootEl.offsetWidth;
        //             rootEl._barFocusH = rootEl.offsetHeight;
        //             rootEl.style.width  = rootEl._barFocusW + 'px';
        //             rootEl.style.height = rootEl._barFocusH + 'px';
        //         }
        //     });
        //     inp.addEventListener('blur', () => {
        //         if (rootEl && rootEl._barFocusW) {
        //             rootEl._barFocusW = null;
        //             rootEl._barFocusH = null;
        //         }
        //     });
        // }

        const btn = document.createElement('button');
        btn.textContent = 'Open';
        btn.disabled = disabled;
        btn.style.cssText =
            'padding:0 8px;height:20px;' +
            'background:' + (disabled ? 'rgba(210,210,225,0.5)' : C.btnBg) + ';color:' + C.btnText + ';' +
            'border:1px solid ' + (disabled ? 'rgba(180,180,200,0.3)' : C.btnBorder) + ';border-radius:3px;' +
            'font-size:11px;cursor:' + (disabled ? 'default' : 'pointer') + ';white-space:nowrap;' +
            'touch-action:manipulation;flex:0 0 auto;box-sizing:border-box;';

        bar.appendChild(inp);
        bar.appendChild(btn);
        rootEl.appendChild(bar);

        if (!disabled) {
            if (onInput) inp.addEventListener('input', e => onInput(e.target.value));
            inp.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.code === 'Enter' && onSubmit) onSubmit(inp.value.trim());
            });
            inp.addEventListener('mousedown', e => e.stopPropagation());
            if (onSubmit) btn.addEventListener('click', e => { e.stopPropagation(); onSubmit(inp.value.trim()); });
        } else {
            inp.addEventListener('mousedown', e => e.stopPropagation());
        }

        return { bar, input: inp, button: btn };
    }

    return { createSeloContainer, createVMTitleBar, createPortalBar, makeDraggable, injectStyles, tilePosition };
})();
