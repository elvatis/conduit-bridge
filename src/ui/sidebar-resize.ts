export const SIDEBAR_RESIZE_HTML = `<div id="sidebar-resizer" class="sidebar-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-controls="sidebar" aria-valuemin="240" aria-valuemax="480" aria-valuenow="256" aria-label="Resize navigation" data-i18n-aria="ui_resize_navigation" title="Drag to resize. Arrow keys adjust; double-click or Enter resets." data-i18n-title="ui_resize_navigation_help"></div>`;

export const SIDEBAR_RESIZE_STYLE = String.raw`
  #main-layout { --sidebar-size:var(--sidebar-width,clamp(16rem,16vw,19rem)); grid-template-columns:var(--sidebar-size) minmax(0,1fr); }
  .sidebar-resizer { position:fixed; z-index:30; top:0; bottom:0; left:calc(var(--sidebar-size) - 5px); width:10px; cursor:col-resize; touch-action:none; outline:none; }
  .sidebar-resizer::after { content:''; position:absolute; inset:0 4px; background:transparent; transition:background .15s; }
  .sidebar-resizer:hover::after,.sidebar-resizer:focus-visible::after,#main-layout.resizing-sidebar .sidebar-resizer::after { background:var(--blue); }
  .sidebar-resizer:focus-visible { box-shadow:inset 0 0 0 1px var(--blue); }
  #main-layout.resizing-sidebar { transition:none; cursor:col-resize; user-select:none; }
  #main-layout.resizing-sidebar .sidebar { transition:none; }
  #main-layout.sidebar-collapsed .sidebar-resizer { display:none; }
  @media(max-width:760px) { #main-layout,#main-layout.sidebar-collapsed { grid-template-columns:minmax(0,1fr); } .sidebar-resizer { display:none; } }
  @media(prefers-reduced-motion:reduce) { #main-layout,.sidebar-resizer::after { transition:none; } }
`;

export const SIDEBAR_RESIZE_SCRIPT = String.raw`
  (() => {
    const handle = $('sidebar-resizer'), layout = $('main-layout'), panel = $('sidebar');
    if (!handle?.setPointerCapture || !layout?.style?.setProperty) return;
    const storageKey = 'conduit_sidebar_width', minimum = 240;
    let preferred = Number(localStorage.getItem(storageKey)) || null, drag = null;
    if (preferred !== null && (!Number.isFinite(preferred) || preferred < minimum || preferred > 480)) preferred = null;
    const maximum = () => Math.max(minimum,Math.min(480,window.innerWidth - 360));
    const clamp = value => Math.max(minimum,Math.min(maximum(),Math.round(value)));
    // The handle follows the target CSS width while the grid may still animate.
    const targetWidth = () => {
      const style = getComputedStyle(handle);
      return clamp(parseFloat(style.left) + parseFloat(style.width) / 2);
    };
    function apply(value, persist = false) {
      if (value === null) layout.style.removeProperty('--sidebar-width');
      else layout.style.setProperty('--sidebar-width',clamp(value) + 'px');
      if (persist) {
        preferred = value;
        if (value === null) localStorage.removeItem(storageKey); else localStorage.setItem(storageKey,String(value));
      }
      handle.setAttribute('aria-valuemax',String(maximum()));
      handle.setAttribute('aria-valuenow',String(targetWidth()));
      handle.tabIndex = window.innerWidth <= 760 || panel.classList.contains('collapsed') ? -1 : 0;
    }
    function finish(cancelled) {
      if (!drag) return;
      const previous = drag; drag = null;
      layout.classList.remove('resizing-sidebar');
      if (handle.hasPointerCapture(previous.pointer)) handle.releasePointerCapture(previous.pointer);
      apply(cancelled ? previous.preferred : targetWidth(),!cancelled);
    }
    handle.addEventListener('pointerdown',event => {
      if (event.button !== 0 || window.innerWidth <= 760 || panel.classList.contains('collapsed')) return;
      event.preventDefault(); handle.focus();
      drag = {pointer:event.pointerId,start:event.clientX,width:targetWidth(),preferred};
      layout.classList.add('resizing-sidebar'); handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove',event => { if (drag && drag.pointer === event.pointerId) apply(drag.width + event.clientX - drag.start); });
    handle.addEventListener('pointerup',() => finish(false));
    handle.addEventListener('pointercancel',() => finish(true));
    handle.addEventListener('lostpointercapture',() => finish(true));
    handle.addEventListener('dblclick',() => apply(null,true));
    handle.addEventListener('keydown',event => {
      if (event.key === 'Escape') { finish(true); return; }
      const step = event.shiftKey ? 32 : 8, width = targetWidth();
      const value = event.key === 'ArrowLeft' ? width-step : event.key === 'ArrowRight' ? width+step : event.key === 'Home' ? minimum : event.key === 'End' ? maximum() : undefined;
      if (value !== undefined || event.key === 'Enter') { event.preventDefault(); apply(event.key === 'Enter' ? null : clamp(value),true); }
    });
    $('sidebar-collapse-btn').addEventListener('click',() => apply(preferred));
    window.addEventListener('resize',() => { finish(true); apply(preferred); });
    apply(preferred);
  })();
`;
