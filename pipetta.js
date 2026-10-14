'use strict';
(function () {
  const VER = ((document.currentScript && document.currentScript.src || '').match(/\?v=\d+/) || [''])[0];
  const VERSIONE = (VER.match(/\d+/) || ['dev'])[0];

  const $ = id => document.getElementById(id);
  const video = $('video'), still = $('still'), viewer = $('viewer');
  const reticle = $('reticle'), loupe = $('loupe');

  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (isNative()) document.body.classList.add('capacitor');
  $('ver').textContent = 'v' + VERSIONE;

  // ---------- colore: conversioni ----------
  const LIN = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linToByte(v) {
    v = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  }
  function rgbToLab(r, g, b) {
    const R = LIN[r], G = LIN[g], B = LIN[b];
    const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750);
    const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  const RAD = Math.PI / 180;
  // differenza percettiva CIEDE2000
  function de2000(p, q) {
    const L1 = p[0], a1 = p[1], b1 = p[2], L2 = q[0], a2 = q[1], b2 = q[2];
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cm7 = Math.pow((C1 + C2) / 2, 7);
    const G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + 6103515625)));
    const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const hue = (b, a) => { if (a === 0 && b === 0) return 0; const h = Math.atan2(b, a) / RAD; return h < 0 ? h + 360 : h; };
    const h1p = hue(b1, a1p), h2p = hue(b2, a2p);
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * RAD / 2);
    const Lmp = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
    let hmp;
    if (C1p * C2p === 0) hmp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hmp = (h1p + h2p) / 2;
    else hmp = (h1p + h2p < 360) ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    const T = 1 - 0.17 * Math.cos((hmp - 30) * RAD) + 0.24 * Math.cos(2 * hmp * RAD)
      + 0.32 * Math.cos((3 * hmp + 6) * RAD) - 0.20 * Math.cos((4 * hmp - 63) * RAD);
    const dTh = 30 * Math.exp(-Math.pow((hmp - 275) / 25, 2));
    const Cmp7 = Math.pow(Cmp, 7);
    const Rc = 2 * Math.sqrt(Cmp7 / (Cmp7 + 6103515625));
    const l50 = (Lmp - 50) * (Lmp - 50);
    const Sl = 1 + 0.015 * l50 / Math.sqrt(20 + l50);
    const Sc = 1 + 0.045 * Cmp, Sh = 1 + 0.015 * Cmp * T;
    const Rt = -Math.sin(2 * dTh * RAD) * Rc;
    const tl = dLp / Sl, tc = dCp / Sc, th = dHp / Sh;
    return Math.sqrt(tl * tl + tc * tc + th * th + Rt * tc * th);
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [Math.round(h) % 360, Math.round(s * 100), Math.round(l * 100)];
  }
  const hex2 = n => n.toString(16).padStart(2, '0').toUpperCase();
  const toHex = c => '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  const fmt = {
    hex: c => toHex(c),
    rgb: c => c.r + ', ' + c.g + ', ' + c.b,
    hsl: c => { const h = rgbToHsl(c.r, c.g, c.b); return h[0] + '°, ' + h[1] + '%, ' + h[2] + '%'; }
  };
  const copyFmt = {
    hex: c => toHex(c),
    rgb: c => 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')',
    hsl: c => { const h = rgbToHsl(c.r, c.g, c.b); return 'hsl(' + h[0] + ', ' + h[1] + '%, ' + h[2] + '%)'; }
  };

  // ---------- nomi ----------
  const NOMI = window.PIPETTA_NOMI.map(([css, it, hx]) => {
    const r = parseInt(hx.slice(0, 2), 16), g = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16);
    return { css, it, r, g, b, lab: rgbToLab(r, g, b) };
  });
  function nearest(c, k) {
    const lab = rgbToLab(c.r, c.g, c.b);
    const out = NOMI.map(n => ({ n, de: de2000(lab, n.lab) }));
    out.sort((a, b) => a.de - b.de);
    return out.slice(0, k || 1);
  }
  function closeness(de) {
    if (de < 1.5) return 'esatto';
    if (de < 4) return 'molto vicino';
    if (de < 9) return 'vicino';
    return 'approssimato';
  }
  // descrizione a parole: famiglia di tinta, luminosità, intensità
  function describe(c) {
    const lab = rgbToLab(c.r, c.g, c.b);
    const L = lab[0], C = Math.hypot(lab[1], lab[2]);
    const h = rgbToHsl(c.r, c.g, c.b)[0];
    const words = [];
    if (C < 7) {
      words.push(L < 12 ? 'nero' : L > 94 ? 'bianco' : 'grigio');
      if (L >= 12 && L <= 94) words.push(L < 35 ? 'scuro' : L > 70 ? 'chiaro' : 'medio');
      if (C >= 3.5) {
        const tint = h < 20 || h >= 330 ? 'rossastro' : h < 70 ? 'caldo' : h < 170 ? 'verdastro' : h < 260 ? 'bluastro' : 'violaceo';
        words.push(tint);
      }
      return words.join(' · ');
    }
    let fam;
    if (h < 12 || h >= 345) fam = 'rosso';
    else if (h < 42) fam = 'arancione';
    else if (h < 66) fam = 'giallo';
    else if (h < 80) fam = 'verde giallo';
    else if (h < 160) fam = 'verde';
    else if (h < 190) fam = 'verde acqua';
    else if (h < 212) fam = 'azzurro';
    else if (h < 248) fam = 'blu';
    else if (h < 282) fam = 'viola';
    else if (h < 318) fam = 'magenta';
    else fam = 'rosa';
    // i caldi scuri sono marroni, i rossi chiari sono rosa
    if ((fam === 'arancione' || fam === 'giallo' || fam === 'rosso') && L < 52 && C < 60) fam = fam === 'giallo' ? 'oliva' : 'marrone';
    else if (fam === 'rosso' && L > 68) fam = 'rosa';
    else if (fam === 'arancione' && L > 72 && C < 45) fam = 'beige';
    words.push(fam);
    words.push(L < 22 ? 'molto scuro' : L < 42 ? 'scuro' : L < 66 ? 'medio' : L < 86 ? 'chiaro' : 'molto chiaro');
    words.push(C < 22 ? 'spento' : C < 50 ? 'tenue' : C < 80 ? 'vivo' : 'saturo');
    return words.join(' · ');
  }

  // ---------- stato ----------
  const SIZES = [
    { label: 'punto', r: 1.5, dot: 5 },
    { label: 'piccolo', r: 7, dot: 9 },
    { label: 'medio', r: 18, dot: 13 }
  ];
  const state = {
    mode: 'idle',          // idle | live | frozen | photo
    stream: null,
    pt: { x: .5, y: .5 },  // posizione del mirino, relativa all'inquadratura
    size: 1,
    ema: null,
    current: null,
    torch: false,
    resumeOnShow: false,
    saved: []
  };
  try { const s = parseInt(localStorage.getItem('pipetta.area'), 10); if (s >= 0 && s < SIZES.length) state.size = s; } catch (e) {}
  try { state.saved = JSON.parse(localStorage.getItem('pipetta.salvati') || '[]').filter(c => c && c.r >= 0); } catch (e) { state.saved = []; }

  function setMode(m) {
    state.mode = m;
    viewer.dataset.mode = m;
    still.classList.toggle('contain', m === 'photo');
    const tag = $('modeTag');
    tag.innerHTML = m === 'live' ? '<span class="rec"></span>dal vivo' : m === 'frozen' ? 'bloccato' : m === 'photo' ? 'foto' : '';
    $('btnCam').classList.toggle('active', m === 'live');
    $('btnFreeze').disabled = !(m === 'live' || m === 'frozen');
    $('lblFreeze').textContent = m === 'frozen' ? 'Riprendi' : 'Blocca';
    $('icoFreeze').innerHTML = m === 'frozen' ? '<path d="M8 5l11 7-11 7z"/>' : '<path d="M9 5v14M15 5v14"/>';
    if (m !== 'live') $('btnTorch').hidden = true;
    state.ema = null;
    placeReticle();
    if (m === 'live') startLoop();
    else if (m !== 'idle') sampleNow();
  }

  // ---------- geometria: dall'inquadratura ai pixel della sorgente ----------
  function srcInfo() {
    if (state.mode === 'live') {
      if (!video.videoWidth) return null;
      return { el: video, w: video.videoWidth, h: video.videoHeight, fit: 'cover' };
    }
    if (state.mode === 'frozen' || state.mode === 'photo') {
      if (!still.width) return null;
      return { el: still, w: still.width, h: still.height, fit: state.mode === 'photo' ? 'contain' : 'cover' };
    }
    return null;
  }
  function layout(info) {
    const vw = viewer.clientWidth, vh = viewer.clientHeight;
    const s = info.fit === 'cover' ? Math.max(vw / info.w, vh / info.h) : Math.min(vw / info.w, vh / info.h);
    const dw = info.w * s, dh = info.h * s;
    return { s, ox: (vw - dw) / 2, oy: (vh - dh) / 2, dw, dh, vw, vh };
  }
  // posizione del mirino in px CSS, tenuta dentro l'immagine visibile
  function reticlePx(info) {
    const vw = viewer.clientWidth, vh = viewer.clientHeight;
    let x = state.pt.x * vw, y = state.pt.y * vh;
    if (info) {
      const g = layout(info);
      const x0 = Math.max(0, g.ox), y0 = Math.max(0, g.oy);
      const x1 = Math.min(vw, g.ox + g.dw), y1 = Math.min(vh, g.oy + g.dh);
      x = Math.min(x1 - 1, Math.max(x0, x)); y = Math.min(y1 - 1, Math.max(y0, y));
    }
    return { x, y };
  }
  function placeReticle() {
    const p = reticlePx(srcInfo());
    const sz = SIZES[state.size];
    reticle.style.setProperty('--d', Math.max(10, sz.r * 2 + 4) + 'px');
    reticle.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
    $('sizeLbl').textContent = sz.label;
    $('btnSize').style.setProperty('--dd', sz.dot + 'px');
  }

  // ---------- campionamento ----------
  const tiny = document.createElement('canvas');
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  const MAXN = 40;
  function sample() {
    const info = srcInfo();
    if (!info) return null;
    const g = layout(info);
    const p = reticlePx(info);
    const sx = (p.x - g.ox) / g.s, sy = (p.y - g.oy) / g.s;
    const rs = Math.max(0.5, SIZES[state.size].r / g.s);
    let x0 = Math.floor(sx - rs), y0 = Math.floor(sy - rs), x1 = Math.ceil(sx + rs), y1 = Math.ceil(sy + rs);
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(info.w, Math.max(x0 + 1, x1)); y1 = Math.min(info.h, Math.max(y0 + 1, y1));
    const bw = x1 - x0, bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return null;
    const nw = Math.min(MAXN, bw), nh = Math.min(MAXN, bh);
    if (tiny.width !== nw) tiny.width = nw;
    if (tiny.height !== nh) tiny.height = nh;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.clearRect(0, 0, nw, nh);
    try { tctx.drawImage(info.el, x0, y0, bw, bh, 0, 0, nw, nh); } catch (e) { return null; }
    const d = tctx.getImageData(0, 0, nw, nh).data;
    // media in luce lineare, dentro il cerchio
    let R = 0, G = 0, B = 0, n = 0;
    const cx = (nw - 1) / 2, cy = (nh - 1) / 2, rr = Math.max(cx, cy) + 0.5;
    const circle = nw >= 5 && nh >= 5;
    for (let j = 0; j < nh; j++) for (let i = 0; i < nw; i++) {
      if (circle) { const dx = (i - cx) / (rr), dy = (j - cy) / (rr); if (dx * dx + dy * dy > 1) continue; }
      const k = (j * nw + i) * 4;
      if (d[k + 3] < 8) continue;
      R += LIN[d[k]]; G += LIN[d[k + 1]]; B += LIN[d[k + 2]]; n++;
    }
    if (!n) return null;
    return { r: R / n, g: G / n, b: B / n };
  }
  const toByte = lin => ({ r: linToByte(lin.r), g: linToByte(lin.g), b: linToByte(lin.b) });
  function sampleNow() {
    const s = sample();
    if (s) show(toByte(s));
  }

  let raf = 0, lastPaint = 0;
  function startLoop() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(t) {
    raf = 0;
    if (state.mode !== 'live') return;
    raf = requestAnimationFrame(tick);
    if (video.readyState < 2) return;
    const s = sample();
    if (!s) return;
    if (!state.ema) state.ema = s;
    else { const a = 0.25, e = state.ema; e.r += (s.r - e.r) * a; e.g += (s.g - e.g) * a; e.b += (s.b - e.b) * a; }
    if (t - lastPaint > 110) { lastPaint = t; show(toByte(state.ema)); }
  }

  // ---------- mostrare ----------
  let lastKey = '';
  function show(c) {
    state.current = c;
    const key = c.r + ',' + c.g + ',' + c.b;
    if (key === lastKey) return;
    lastKey = key;
    const best = nearest(c, 1)[0];
    $('swatch').style.background = toHex(c);
    const ref = $('swRef');
    ref.classList.add('on');
    ref.style.background = 'rgb(' + best.n.r + ',' + best.n.g + ',' + best.n.b + ')';
    $('nameIt').textContent = best.n.it;
    $('nameCss').innerHTML = 'CSS <b>' + best.n.css + '</b><span class="near">' + closeness(best.de) + '</span>';
    $('descr').textContent = describe(c);
    $('vHex').textContent = fmt.hex(c);
    $('vRgb').textContent = fmt.rgb(c);
    $('vHsl').textContent = fmt.hsl(c);
    $('btnSave').disabled = false;
  }

  // ---------- fotocamera ----------
  function stopStream() {
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
    state.torch = false;
    $('btnTorch').classList.remove('on');
    video.srcObject = null;
  }
  function message(txt) {
    $('phMsg').innerHTML = txt;
  }
  let starting = false;
  async function startCamera() {
    if (starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      message('Qui la fotocamera non è disponibile.<br>Puoi sempre aprire una foto.');
      return;
    }
    starting = true;
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      state.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (!video.videoWidth) await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }));
      setMode('live');
      setupTorch();
    } catch (e) {
      const n = e && e.name;
      if (state.mode === 'idle') {
        message(n === 'NotAllowedError' || n === 'SecurityError'
          ? 'Il permesso per la fotocamera è stato negato.<br>Puoi sempre aprire una foto.'
          : n === 'NotFoundError' || n === 'OverconstrainedError'
            ? 'Nessuna fotocamera trovata.<br>Puoi sempre aprire una foto.'
            : 'La fotocamera non si è avviata.<br>Riprova, oppure apri una foto.');
      } else toast('La fotocamera non si è avviata');
    } finally { starting = false; }
  }
  function setupTorch() {
    const t = state.stream && state.stream.getVideoTracks()[0];
    let ok = false;
    try { ok = !!(t && t.getCapabilities && t.getCapabilities().torch); } catch (e) {}
    $('btnTorch').hidden = !ok;
  }
  $('btnTorch').addEventListener('click', async () => {
    const t = state.stream && state.stream.getVideoTracks()[0];
    if (!t) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !state.torch }] });
      state.torch = !state.torch;
      $('btnTorch').classList.toggle('on', state.torch);
    } catch (e) { toast('Torcia non disponibile'); }
  });

  function freeze() {
    if (state.mode !== 'live' || !video.videoWidth) return;
    still.width = video.videoWidth; still.height = video.videoHeight;
    still.getContext('2d').drawImage(video, 0, 0);
    stopStream();
    setMode('frozen');
  }

  $('btnCam').addEventListener('click', () => { if (state.mode !== 'live') startCamera(); });
  $('btnFreeze').addEventListener('click', () => {
    if (state.mode === 'live') freeze();
    else if (state.mode === 'frozen') startCamera();
  });
  $('btnPhoto').addEventListener('click', () => { $('file').value = ''; $('file').click(); });
  $('file').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) loadPhoto(f);
  });
  function loadPhoto(blob) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const MAX = 3000;
      const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      still.width = Math.max(1, Math.round(img.naturalWidth * k));
      still.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = still.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, still.width, still.height);
      URL.revokeObjectURL(url);
      stopStream();
      state.pt = { x: .5, y: .5 };
      setMode('photo');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Questa immagine non si apre'); };
    img.src = url;
  }

  $('btnSize').addEventListener('click', () => {
    state.size = (state.size + 1) % SIZES.length;
    try { localStorage.setItem('pipetta.area', String(state.size)); } catch (e) {}
    state.ema = null;
    placeReticle();
    if (state.mode !== 'live') sampleNow();
  });

  // ---------- trascinare il mirino ----------
  let dragging = false;
  const LOUPE = 116, LOUPE_SPAN = 22; // la lente mostra 22 px CSS di inquadratura
  const lctx = loupe.getContext('2d');
  function setPt(ev) {
    const r = viewer.getBoundingClientRect();
    state.pt = {
      x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))
    };
    state.ema = null;
    placeReticle();
    if (state.mode !== 'live') sampleNow();
    drawLoupe();
  }
  function drawLoupe() {
    const info = srcInfo();
    if (!dragging || !info) { loupe.classList.remove('on'); return; }
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const px = Math.round(LOUPE * dpr);
    if (loupe.width !== px) { loupe.width = px; loupe.height = px; }
    const g = layout(info), p = reticlePx(info);
    const span = LOUPE_SPAN / g.s;
    const sx = (p.x - g.ox) / g.s, sy = (p.y - g.oy) / g.s;
    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, px, px);
    try { lctx.drawImage(info.el, sx - span / 2, sy - span / 2, span, span, 0, 0, px, px); } catch (e) {}
    // cerchio dell'area misurata
    const rr = SIZES[state.size].r * px / LOUPE_SPAN;
    lctx.lineWidth = 2 * dpr;
    lctx.strokeStyle = 'rgba(0,0,0,.7)';
    lctx.beginPath(); lctx.arc(px / 2, px / 2, Math.max(3 * dpr, rr) + 1.5 * dpr, 0, Math.PI * 2); lctx.stroke();
    lctx.strokeStyle = '#fff';
    lctx.beginPath(); lctx.arc(px / 2, px / 2, Math.max(3 * dpr, rr), 0, Math.PI * 2); lctx.stroke();
    // la lente sta sopra il dito, o sotto se non c'è spazio
    let lx = p.x - LOUPE / 2, ly = p.y - LOUPE - 46;
    if (ly < 6) ly = p.y + 46;
    lx = Math.min(g.vw - LOUPE - 6, Math.max(6, lx));
    loupe.style.transform = 'translate(' + lx + 'px,' + ly + 'px)';
    loupe.classList.add('on');
  }
  viewer.addEventListener('pointerdown', ev => {
    if (state.mode === 'idle' || ev.target.closest('.chip')) return;
    dragging = true;
    try { viewer.setPointerCapture(ev.pointerId); } catch (e) {}
    setPt(ev);
  });
  viewer.addEventListener('pointermove', ev => { if (dragging) setPt(ev); });
  const endDrag = () => { dragging = false; loupe.classList.remove('on'); };
  viewer.addEventListener('pointerup', endDrag);
  viewer.addEventListener('pointercancel', endDrag);
  // in diretta la lente si aggiorna anche se il dito sta fermo
  setInterval(() => { if (dragging && state.mode === 'live') drawLoupe(); }, 80);

  window.addEventListener('resize', () => { placeReticle(); if (state.mode !== 'live' && state.mode !== 'idle') sampleNow(); });

  // ---------- copiare ----------
  let toastT = 0;
  function toast(t) {
    const el = $('toast');
    el.textContent = t;
    el.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('on'), 1400);
  }
  async function copy(text) {
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) {}
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
    }
    toast(ok ? 'Copiato ' + text : 'Non sono riuscito a copiare');
  }
  document.querySelectorAll('#values .val').forEach(b => b.addEventListener('click', () => {
    if (state.current) copy(copyFmt[b.dataset.k](state.current));
  }));

  // ---------- salvati ----------
  function persist() { try { localStorage.setItem('pipetta.salvati', JSON.stringify(state.saved)); } catch (e) {} }
  function renderPalette() {
    const pal = $('palette');
    pal.querySelectorAll('.pc').forEach(e => e.remove());
    $('palHint').hidden = state.saved.length > 0;
    state.saved.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'pc';
      b.style.background = toHex(c);
      b.setAttribute('aria-label', toHex(c));
      b.addEventListener('click', () => openSheet(c, i));
      pal.appendChild(b);
    });
  }
  $('btnSave').addEventListener('click', () => {
    const c = state.current;
    if (!c) return;
    const top = state.saved[0];
    if (top && top.r === c.r && top.g === c.g && top.b === c.b) { toast('Già salvato'); return; }
    state.saved.unshift({ r: c.r, g: c.g, b: c.b });
    if (state.saved.length > 40) state.saved.length = 40;
    persist(); renderPalette();
    $('palette').scrollLeft = 0;
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) {}
    toast('Salvato ' + toHex(c));
  });

  // ---------- scheda dettaglio ----------
  let sheetIdx = -1;
  function openSheet(c, savedIdx) {
    sheetIdx = savedIdx == null ? -1 : savedIdx;
    c = { r: c.r, g: c.g, b: c.b };
    const near = nearest(c, 5);
    $('shSwatch').style.background = toHex(c);
    $('shIt').textContent = near[0].n.it;
    $('shCss').textContent = describe(c);
    const vals = $('shValues');
    vals.innerHTML = '';
    ['hex', 'rgb', 'hsl'].forEach(k => {
      const b = document.createElement('button');
      b.className = 'val';
      b.innerHTML = '<span class="k">' + k.toUpperCase() + '</span><span class="v"></span>' + document.querySelector('#values .cp').outerHTML;
      b.querySelector('.v').textContent = fmt[k](c);
      b.addEventListener('click', () => copy(copyFmt[k](c)));
      vals.appendChild(b);
    });
    const list = $('shNear');
    list.innerHTML = '';
    near.forEach(x => {
      const b = document.createElement('button');
      b.className = 'nr';
      b.innerHTML = '<span class="sw"></span><span class="nm"><span></span><span></span></span><span class="de"></span>';
      b.querySelector('.sw').style.background = 'rgb(' + x.n.r + ',' + x.n.g + ',' + x.n.b + ')';
      const sp = b.querySelectorAll('.nm span');
      sp[0].textContent = x.n.it;
      const alias = window.PIPETTA_ALIAS[x.n.css];
      sp[1].textContent = x.n.css + (alias ? ' / ' + alias : '') + ' · ' + toHex(x.n);
      b.querySelector('.de').textContent = 'ΔE ' + x.de.toFixed(1);
      b.addEventListener('click', () => copy(x.n.css));
      list.appendChild(b);
    });
    $('shDel').hidden = sheetIdx < 0;
    $('sheet').hidden = false;
  }
  function closeSheet() { $('sheet').hidden = true; }
  $('reading').addEventListener('click', () => { if (state.current) openSheet(state.current); });
  $('shClose').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
  $('shDel').addEventListener('click', () => {
    if (sheetIdx >= 0) { state.saved.splice(sheetIdx, 1); persist(); renderPalette(); }
    closeSheet();
  });

  // ---------- la fotocamera si libera quando l'app va in secondo piano ----------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state.mode === 'live') { state.resumeOnShow = true; stopStream(); }
    } else if (state.resumeOnShow) {
      state.resumeOnShow = false;
      startCamera();
    }
  });

  // ---------- avvio ----------
  setMode('idle');
  renderPalette();
  startCamera();

  // per il collaudo
  window.__pipetta = { state, nearest, de2000, rgbToLab, describe, loadPhoto, show, NOMI };
})();
