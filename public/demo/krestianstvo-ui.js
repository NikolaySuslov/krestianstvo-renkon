// krestianstvo-ui.js — Krestianstvo - Renkon | SDK 4
// Pure DOM construction and layout — no VM, no WS, no Renkon.
//
// API:
//   KrestianstvoUI.createSeloContainer(name, parentEl, { onMove, onClose })
//   KrestianstvoUI.makeDraggable(el, handleEl, { onMove })
//   KrestianstvoUI.createPortalBar(rootEl, { onInput, onSubmit, disabled })
//   KrestianstvoUI.injectStyles()

const KrestianstvoUI = (() => {

    const C = {
        border:      '#ccc',
        titleBg:     '#e8e8f4',
        titleBorder: '#ccd',
        titleText:   '#446',
        statsText:   '#888',
        inputBg:     '#f7f7f7',
        inputBorder: '#bbb',
        btnBg:       '#eef',
        btnBorder:   '#aac',
        btnText:     '#446',
        closeBg:     '#fdd',
        closeText:   '#a44',
        portalBg:    'rgba(245,245,255,0.97)',
    };

    let _stylesInjected = false;
    function injectStyles() {
        if (_stylesInjected) return;
        _stylesInjected = true;
        const s = document.createElement('style');
        s.textContent = `
.vm-root { position:absolute; inset:0; background:#f5f5f8; overflow:hidden; cursor:crosshair; outline:none; font-family:monospace; touch-action:none; }
.avatar { position:absolute; width:36px; height:36px; border-radius:50%; border:3px solid #8899bb; background:#fff;
    display:flex; align-items:center; justify-content:center;
    font-size:9px; font-weight:bold; color:#334; text-align:center; line-height:1.1;
    pointer-events:none; }
.vm-portal-bar { padding-bottom: max(5px, env(safe-area-inset-bottom)) !important; }
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

    function createTitleBar(name) {
        const bar = document.createElement('div');
        bar.style.cssText =
            'position:absolute;top:0;left:0;right:0;height:22px;' +
            'background:' + C.titleBg + ';border-bottom:1px solid ' + C.titleBorder + ';' +
            'display:flex;align-items:center;padding:0 4px;gap:4px;' +
            'font-size:11px;font-weight:bold;color:' + C.titleText + ';' +
            'z-index:10;cursor:move;user-select:none;';
        const label = document.createElement('span');
        label.className = 'vm-label';
        label.textContent = name;
        label.style.cssText = 'flex:0 0 auto;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        const stats = document.createElement('span');
        stats.style.cssText = 'margin-left:auto;font-size:10px;font-weight:normal;color:' + C.statsText + ';white-space:nowrap;';
        stats.innerHTML = 'T:<span class="vm-clock">0</span> P:<span class="vm-peers">0</span> <span class="vm-queue"></span>';
        bar.appendChild(label);
        bar.appendChild(stats);
        return bar;
    }

    function createSeloContainer(name, parentEl, opts) {
        opts = opts || {};
        const onMove = opts.onMove, onClose = opts.onClose;
        const CHILD_W = 240, CHILD_H = 180;
        const el = document.createElement('div');
        el.dataset.seloId = name;
        el.setAttribute('tabindex', '-1');
        el.style.cssText =
            'position:absolute;left:20px;top:40px;' +
            'width:' + CHILD_W + 'px;height:' + CHILD_H + 'px;' +
            'background:rgba(250,250,254,0.80);backdrop-filter:blur(2px);' +
            'border:1.5px solid ' + C.border + ';' +
            'border-radius:6px;overflow:hidden;cursor:crosshair;' +
            'z-index:20;outline:none;box-shadow:0 2px 16px rgba(0,0,80,0.13);';

        const titleBar = createTitleBar(name);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText =
            'margin-left:4px;padding:0 5px;height:16px;line-height:14px;' +
            'background:' + C.closeBg + ';color:' + C.closeText + ';' +
            'border:1px solid #eaa;border-radius:3px;font-size:13px;cursor:pointer;flex:0 0 auto;';
        closeBtn.addEventListener('mousedown', e => e.stopPropagation());
        closeBtn.addEventListener('click', e => {
            e.stopPropagation();
            el.remove();
            if (onClose) onClose(name);
        });
        titleBar.appendChild(closeBtn);

        const cinp = document.createElement('input');
        cinp.value = name;
        cinp.style.cssText =
            'width:58px;padding:1px 3px;background:' + C.inputBg + ';color:#333;' +
            'border:1px solid ' + C.inputBorder + ';border-radius:3px;font-size:10px;font-family:monospace;flex:0 0 auto;';
        cinp.addEventListener('mousedown', e => e.stopPropagation());
        cinp.addEventListener('keydown',   e => e.stopPropagation());

        const cbtn = document.createElement('button');
        cbtn.textContent = 'Join';
        cbtn.style.cssText =
            'padding:1px 5px;background:' + C.btnBg + ';color:' + C.btnText + ';' +
            'border:1px solid ' + C.btnBorder + ';border-radius:3px;font-size:10px;cursor:pointer;flex:0 0 auto;';
        cbtn.addEventListener('mousedown', e => e.stopPropagation());

        titleBar.appendChild(cinp);
        titleBar.appendChild(cbtn);
        el.appendChild(titleBar);

        makeDraggable(el, titleBar, {
            onMove: onMove ? (x, y) => onMove(name, x, y) : null
        });

        parentEl.appendChild(el);
        return { el, titleBar, cinp, cbtn, closeBtn };
    }

    function createPortalBar(rootEl, opts) {
        opts = opts || {};
        const onInput = opts.onInput, onSubmit = opts.onSubmit, disabled = opts.disabled || false;

        let bar = rootEl.querySelector('.vm-portal-bar');
        if (bar) return { bar, input: bar.querySelector('input'), button: bar.querySelector('button') };

        bar = document.createElement('div');
        bar.className = 'vm-portal-bar';
        bar.style.cssText =
            'position:absolute;bottom:0;left:0;right:0;display:flex;gap:4px;padding:5px 8px;' +
            'background:' + C.portalBg + ';border-top:1px solid ' + C.titleBorder + ';' +
            'z-index:20;box-sizing:border-box;';

        const inp = document.createElement('input');
        inp.placeholder = disabled ? 'max depth reached' : 'new selo name\u2026';
        inp.disabled = disabled;
        inp.style.cssText =
            'flex:1;min-width:0;padding:3px 7px;border:1px solid ' + C.titleBorder + ';border-radius:3px;' +
            'font-size:11px;font-family:monospace;background:' + (disabled ? '#eee' : '#fff') + ';color:#334;';

        const btn = document.createElement('button');
        btn.textContent = 'Open';
        btn.disabled = disabled;
        btn.style.cssText =
            'padding:3px 10px;background:' + (disabled ? '#ddd' : C.btnBg) + ';color:' + C.btnText + ';' +
            'border:1px solid ' + C.btnBorder + ';border-radius:3px;font-size:11px;' +
            'cursor:' + (disabled ? 'default' : 'pointer') + ';white-space:nowrap;';

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

    return { createSeloContainer, createPortalBar, makeDraggable, injectStyles, tilePosition };
})();
