import './base.css';
import './style.css';
import { h, toast, uid, langToggle, showSaveBanner, hideSaveBanner, downloadBlob } from './ui';
import { dicts, type Lang, type Dict } from './i18n';
import { askPersist, idbLoad, idbSave, idbPutNow } from './db';

const DB = 'moji-nose';
const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", "Yu Gothic", sans-serif';
const COLORS = ['#111111', '#ffffff', '#e11d48', '#f59e0b', '#2563eb', '#16a34a'];

interface Layer {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  weight: 400 | 700 | 900;
}
interface State { lang: Lang }

let state: State = { lang: 'ja' };
let t: Dict = dicts.ja;
let imgEl: HTMLImageElement | null = null;
let imgUrl = '';
let layers: Layer[] = [];
let selectedId: string | null = null;
const app = document.getElementById('app')!;

const fileInput = h('input', { type: 'file', accept: 'image/*', style: 'position:fixed;left:-999px;width:1px;height:1px' });
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (f) loadFile(f);
});
document.body.append(fileInput);

function isLang(v: unknown): v is Lang { return v === 'ja' || v === 'en'; }
function normalize(raw: unknown): State {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { lang: isLang(o.lang) ? o.lang : 'ja' };
}

let saveChain: Promise<void> = Promise.resolve();
let saveQueued = false;
function queueSave(): void {
  saveQueued = true;
  saveChain = saveChain.then(async () => {
    if (!saveQueued) return;
    saveQueued = false;
    try {
      await idbSave(DB, { lang: state.lang });
      hideSaveBanner();
    } catch {
      showSaveBanner();
    }
  }).catch(() => { showSaveBanner(); });
}
document.addEventListener('visibilitychange', () => { if (document.hidden) queueSave(); });
window.addEventListener('pagehide', () => { idbPutNow(DB, { lang: state.lang }); queueSave(); });

function setLang(l: Lang): void {
  state.lang = l;
  t = dicts[l];
  document.documentElement.lang = l;
  document.title = t.app;
  queueSave();
  render();
}
function clamp(n: number, a: number, b: number): number { return Math.max(a, Math.min(b, n)); }
function selected(): Layer | null { return layers.find((l) => l.id === selectedId) ?? null; }

function loadFile(file: File): void {
  if (!file.type.startsWith('image/')) { toast(t.imgFail); return; }
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => {
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = url;
    imgEl = im;
    if (layers.length === 0) {
      const layer: Layer = {
        id: uid(),
        text: state.lang === 'ja' ? 'テキスト' : 'Text',
        x: 0.5, y: 0.42, size: 0.09, color: '#ffffff', weight: 700,
      };
      layers = [layer];
      selectedId = layer.id;
    }
    render();
  };
  im.onerror = () => {
    URL.revokeObjectURL(url);
    toast(t.imgFail);
  };
  im.src = url;
}

function addText(): void {
  const n = layers.length;
  const layer: Layer = {
    id: uid(),
    text: state.lang === 'ja' ? 'テキスト' : 'Text',
    x: clamp(0.5, 0.02, 0.98),
    y: clamp(0.35 + (n % 5) * 0.08, 0.08, 0.92),
    size: 0.08,
    color: '#ffffff',
    weight: 700,
  };
  layers.push(layer);
  selectedId = layer.id;
  render();
}
function deleteSelected(): void {
  if (!selectedId) return;
  layers = layers.filter((l) => l.id !== selectedId);
  selectedId = layers.length ? layers[layers.length - 1].id : null;
  render();
}

function placeAll(): void {
  const stage = document.querySelector('.stage');
  const w = stage?.clientWidth || 1;
  document.querySelectorAll<HTMLElement>('.tbox').forEach((el) => {
    const layer = layers.find((l) => l.id === el.dataset.id);
    if (!layer) return;
    el.style.left = `${layer.x * 100}%`;
    el.style.top = `${layer.y * 100}%`;
    el.style.fontSize = `${Math.max(12, layer.size * w)}px`;
    el.style.fontWeight = String(layer.weight);
    el.style.color = layer.color;
    el.style.fontFamily = FONT;
    el.textContent = layer.text || ' ';
  });
}
function syncChrome(): void {
  const layer = selected();
  document.querySelectorAll<HTMLElement>('.tbox').forEach((el) => {
    el.classList.toggle('on', el.dataset.id === selectedId);
  });
  const text = document.getElementById('layer-text') as HTMLInputElement | null;
  const size = document.getElementById('layer-size') as HTMLInputElement | null;
  const color = document.getElementById('layer-color') as HTMLInputElement | null;
  if (text) {
    text.disabled = !layer;
    if (document.activeElement !== text) text.value = layer?.text ?? '';
  }
  if (size) { size.disabled = !layer; size.value = String(layer?.size ?? 0.09); }
  if (color) { color.disabled = !layer; if (layer) color.value = toHex(layer.color); }
  document.querySelectorAll<HTMLButtonElement>('[data-weight]').forEach((b) => {
    b.disabled = !layer;
    b.setAttribute('aria-pressed', String(!!layer && layer.weight === Number(b.dataset.weight)));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => {
    b.disabled = !layer;
    b.classList.toggle('on', !!layer && layer.color.toLowerCase() === (b.dataset.color ?? '').toLowerCase());
  });
  const hint = document.getElementById('sel-hint');
  if (hint) hint.toggleAttribute('hidden', !!layer);
}
function toHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return '#ffffff';
}

function bindDrag(el: HTMLElement, layer: Layer): void {
  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    selectedId = layer.id;
    dragging = true;
    el.setPointerCapture(e.pointerId);
    syncChrome();
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const stage = el.parentElement;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    layer.x = clamp((e.clientX - r.left) / r.width, 0.02, 0.98);
    layer.y = clamp((e.clientY - r.top) / r.height, 0.02, 0.98);
    el.style.left = `${layer.x * 100}%`;
    el.style.top = `${layer.y * 100}%`;
  });
  const end = () => { dragging = false; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

function bindDrop(el: HTMLElement): void {
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('over');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });
}

async function exportPng(): Promise<void> {
  const im = imgEl;
  if (!im || !im.naturalWidth) { toast(t.exportFail); return; }
  const maxEdge = 4096;
  const scale = Math.min(1, maxEdge / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * scale));
  const h = Math.max(1, Math.round(im.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { toast(t.exportFail); return; }
  ctx.drawImage(im, 0, 0, w, h);
  for (const layer of layers) {
    if (!layer.text.trim()) continue;
    const fontPx = Math.max(8, layer.size * w);
    ctx.font = `${layer.weight} ${fontPx}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = Math.max(2, fontPx * 0.06);
    ctx.shadowOffsetY = Math.max(1, fontPx * 0.03);
    ctx.fillStyle = layer.color;
    ctx.fillText(layer.text, layer.x * w, layer.y * h);
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/png'));
  if (!blob) { toast(t.exportFail); return; }
  downloadBlob(blob, 'moji-nose.png');
}

function render(): void {
  const layer = selected();
  const controls = imgEl ? h('section', { class: 'card stack-gap', style: 'display:flex;flex-direction:column;gap:10px' },
    h('p', { id: 'sel-hint', class: 'muted small', style: 'margin:0', hidden: layer ? '' : undefined }, t.noneSelected),
    h('label', { class: 'field' }, t.textPh,
      h('input', {
        id: 'layer-text', class: 'input', type: 'text', value: layer?.text ?? '', placeholder: t.textPh, autocomplete: 'off',
        disabled: layer ? undefined : '',
        oninput: (e: Event) => {
          const cur = selected();
          if (!cur) return;
          cur.text = (e.target as HTMLInputElement).value;
          const box = document.querySelector<HTMLElement>(`.tbox[data-id="${CSS.escape(cur.id)}"]`);
          if (box) box.textContent = cur.text || ' ';
        },
      }),
    ),
    h('label', { class: 'field' }, t.size,
      h('input', {
        id: 'layer-size', type: 'range', min: '0.03', max: '0.22', step: '0.005', value: String(layer?.size ?? 0.09),
        disabled: layer ? undefined : '',
        oninput: (e: Event) => {
          const cur = selected();
          if (!cur) return;
          cur.size = Number((e.target as HTMLInputElement).value);
          placeAll();
        },
      }),
    ),
    h('div', { class: 'field' }, t.color,
      h('div', { class: 'swatches' },
        ...COLORS.map((c) => h('button', {
          type: 'button', class: 'swatch' + (layer?.color === c ? ' on' : ''),
          style: `background:${c}`, 'data-color': c, 'aria-label': c,
          disabled: layer ? undefined : '',
          onclick: () => {
            const cur = selected();
            if (!cur) return;
            cur.color = c;
            placeAll();
            syncChrome();
          },
        })),
        h('input', {
          id: 'layer-color', class: 'swatch', type: 'color', value: toHex(layer?.color ?? '#ffffff'), 'aria-label': t.color,
          disabled: layer ? undefined : '',
          oninput: (e: Event) => {
            const cur = selected();
            if (!cur) return;
            cur.color = (e.target as HTMLInputElement).value;
            placeAll();
            syncChrome();
          },
        }),
      ),
    ),
    h('div', { class: 'field' }, t.weight,
      h('div', { class: 'seg', role: 'group', 'aria-label': t.weight },
        ...([400, 700, 900] as const).map((w) => h('button', {
          type: 'button', 'data-weight': String(w),
          'aria-pressed': String(layer?.weight === w),
          disabled: layer ? undefined : '',
          onclick: () => {
            const cur = selected();
            if (!cur) return;
            cur.weight = w;
            placeAll();
            syncChrome();
          },
        }, w === 400 ? t.w400 : w === 700 ? t.w700 : t.w900)),
      ),
    ),
    h('p', { class: 'muted small', style: 'margin:0' }, t.horizontal),
    h('div', { class: 'row' },
      h('button', { class: 'btn grow', type: 'button', onclick: addText }, t.addText),
      h('button', { class: 'btn danger', type: 'button', disabled: layer ? undefined : '', onclick: deleteSelected }, t.del),
    ),
    h('button', { class: 'btn primary block', type: 'button', onclick: () => { void exportPng(); } }, t.export),
  ) : null;

  const stage = imgEl ? h('div', { class: 'stage' }) : null;
  if (stage && imgEl) {
    stage.append(imgEl);
    for (const ly of layers) {
      const box = h('div', { class: 'tbox' + (ly.id === selectedId ? ' on' : ''), 'data-id': ly.id }, ly.text || ' ');
      bindDrag(box, ly);
      stage.append(box);
    }
    bindDrop(stage);
  }

  const drop = !imgEl ? h('div', { class: 'drop' },
    h('p', { style: 'margin:0;font-weight:800' }, t.drop),
    h('p', { class: 'muted small', style: 'margin:0' }, t.noImage),
    h('button', { class: 'btn primary', type: 'button', onclick: () => fileInput.click() }, t.pick),
  ) : null;
  if (drop) bindDrop(drop);

  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('h1', {}, t.app),
      langToggle(state.lang, setLang),
    ),
    h('main', {},
      h('p', { class: 'subhead' }, t.sub),
      drop,
      stage,
      imgEl ? h('button', { class: 'btn block', type: 'button', onclick: () => fileInput.click() }, t.replace) : null,
      controls,
    ),
    h('p', { class: 'foot' }, t.privacy),
  );
  placeAll();
  syncChrome();
}

window.addEventListener('resize', () => placeAll());

async function boot(): Promise<void> {
  await askPersist();
  try { state = normalize(await idbLoad(DB)); }
  catch { state = { lang: 'ja' }; showSaveBanner(); }
  t = dicts[state.lang];
  document.documentElement.lang = state.lang;
  document.title = t.app;
  render();
  queueSave();
}
void boot();
