(function () {
  'use strict';

  var VERSION = '20260723.3';
  var params = new URLSearchParams(location.search);
  var scanTarget = params.get('target') || 'pesanan';
  var scanType = (params.get('type') || 'barcode').toLowerCase();
  var transport = window.ScannerTransport || {};

  var scanner = null;
  var fileScanner = null;
  var cameras = [];
  var cameraIndex = 0;
  var lastValue = '';
  var paused = false;
  var starting = false;
  var torchOn = false;
  var audioCtx = null;
  var wakeLock = null;
  var zoomCaps = null;
  var zoomValue = 1;
  var startedConstraint = null;

  injectUi();

  function injectUi() {
    document.documentElement.lang = 'id';
    document.title = transport.title || 'Scanner HD';
    document.head.insertAdjacentHTML('beforeend', '<style>' + css() + '</style>');
    document.body.innerHTML = ''
      + '<div class="app">'
      + '  <div class="bar">'
      + '    <div><strong>📷 Scanner HD</strong><span class="badge" id="targetBadge">-</span><span class="ver">v' + VERSION + '</span></div>'
      + '    <button class="xbtn" type="button" onclick="ScannerApp.close()">✕</button>'
      + '  </div>'
      + '  <div class="cam">'
      + '    <div id="reader"></div>'
      + '    <div id="scanGuide" class="scan-guide ' + (scanType === 'qrcode' ? 'qr' : 'barcode') + '"><span></span></div>'
      + '    <div id="loadMsg" class="loading"><div class="spinner"></div><div>Menyiapkan kamera resolusi tinggi...</div></div>'
      + '    <div id="errbox" class="errbox"><div class="icon">⚠️</div><div class="title" id="errT">Scanner gagal</div><div class="desc" id="errD">-</div><button class="btn btn-ok" type="button" onclick="ScannerApp.start()">Coba Lagi</button><button class="btn btn-no" type="button" onclick="ScannerApp.close()">Tutup</button></div>'
      + '    <div id="sentScreen" class="sent"><div class="sent-icon">✅</div><div class="sent-title" id="sentTitle">Kode berhasil dikirim</div><div class="sent-value" id="sentValue">-</div><button class="btn btn-ok" type="button" onclick="ScannerApp.close()">Tutup</button></div>'
      + '  </div>'
      + '  <div class="panel">'
      + '    <div class="status" id="status">Memulai scanner...</div>'
      + '    <div class="camera-info" id="cameraInfo">-</div>'
      + '    <div class="tip" id="scanTip">Posisikan seluruh garis barcode di dalam kotak. Jaga jarak 12–20 cm.</div>'
      + '    <div class="tool-row" id="toolRow">'
      + '      <button id="btnTorch" class="tool hidden" type="button" onclick="ScannerApp.toggleTorch()">🔦 Lampu</button>'
      + '      <button id="btnFocus" class="tool" type="button" onclick="ScannerApp.refocus()">🎯 Fokus</button>'
      + '      <button id="btnCamera" class="tool hidden" type="button" onclick="ScannerApp.switchCamera()">🔄 Kamera</button>'
      + '      <button class="tool" type="button" onclick="document.getElementById(\'photoInput\').click()">📸 Foto HD</button>'
      + '    </div>'
      + '    <div class="zoom-wrap hidden" id="zoomWrap">'
      + '      <button class="zoom-btn" type="button" onclick="ScannerApp.zoomStep(-1)">−</button>'
      + '      <input id="zoomRange" type="range" oninput="ScannerApp.zoomTo(this.value)">'
      + '      <button class="zoom-btn" type="button" onclick="ScannerApp.zoomStep(1)">+</button>'
      + '      <span id="zoomLabel">1.0×</span>'
      + '    </div>'
      + '    <input id="photoInput" type="file" accept="image/*" capture="environment" hidden onchange="ScannerApp.scanPhoto(this)">'
      + '    <div id="fileReader" class="file-reader"></div>'
      + '    <div id="resBox" class="result"><div class="typ" id="resTyp">-</div><div class="val" id="resVal">-</div></div>'
      + '    <div id="resultBtns" class="btns hidden"><button class="btn btn-ok" type="button" onclick="ScannerApp.send()">✅ Gunakan</button><button class="btn btn-warn" type="button" onclick="ScannerApp.rescan()">🔄 Ulang</button><button class="btn btn-no" type="button" onclick="ScannerApp.close()">✕</button></div>'
      + '  </div>'
      + '</div><div id="toast" class="toast"></div>';

    var badge = document.getElementById('targetBadge');
    var map = {
      pesanan: 'Pesanan', resi: 'Resi', search: 'Cari', cekbarang: 'Cek Barang',
      cekekspedisi: 'Cek Ekspedisi', orderpesanan: 'Input Pesanan', orderresi: 'Input Resi'
    };
    badge.textContent = map[scanTarget] || scanTarget;
    badge.className = 'badge ' + (scanType === 'qrcode' ? 'qr' : 'bar');
    if (scanType === 'qrcode') {
      document.getElementById('scanTip').textContent = 'Dekatkan QR secara perlahan. Gunakan zoom atau Foto HD jika QR sangat kecil.';
    }
  }

  function css() {
    return '*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#07111f;color:#f8fafc;font-family:Segoe UI,system-ui,sans-serif}'
      + '.app{height:100%;display:flex;flex-direction:column}.bar{height:52px;padding:8px 12px;background:#142033;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;box-shadow:0 2px 10px rgba(0,0,0,.3)}'
      + '.bar strong{font-size:.95rem}.badge{display:inline-flex;margin-left:8px;padding:3px 9px;border-radius:20px;font-size:.67rem;font-weight:700}.badge.bar{background:#ede9fe;color:#6d28d9}.badge.qr{background:#fce7f3;color:#be185d}.ver{margin-left:6px;color:#64748b;font-size:.6rem}'
      + '.xbtn{width:38px;height:38px;border:0;border-radius:50%;background:#ef4444;color:white;font-size:1.2rem;cursor:pointer}.xbtn:active,.btn:active,.tool:active,.zoom-btn:active{transform:scale(.95)}'
      + '.cam{position:relative;flex:1;min-height:180px;background:#000;overflow:hidden}#reader{width:100%!important;height:100%!important;border:0!important}#reader video{width:100%!important;height:100%!important;object-fit:cover!important}'
      + '#reader img[alt="Info icon"],#reader__header_message,#reader__status_span,#reader__dashboard{display:none!important}#reader__scan_region{height:100%!important;min-height:100%!important}#reader__scan_region img{display:none!important}'
      + '.scan-guide{pointer-events:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.92);border-radius:12px;box-shadow:0 0 0 9999px rgba(0,0,0,.25);z-index:4}.scan-guide.barcode{width:92%;height:34%;max-height:240px;min-height:100px}.scan-guide.qr{width:min(82vw,56vh);height:min(82vw,56vh);max-width:520px;max-height:520px}'
      + '.scan-guide:before,.scan-guide:after,.scan-guide span:before,.scan-guide span:after{content:"";position:absolute;width:30px;height:30px;border-color:#22c55e}.scan-guide:before{left:-3px;top:-3px;border-left:5px solid #22c55e;border-top:5px solid #22c55e;border-radius:10px 0 0 0}.scan-guide:after{right:-3px;top:-3px;border-right:5px solid #22c55e;border-top:5px solid #22c55e;border-radius:0 10px 0 0}.scan-guide span:before{left:-3px;bottom:-3px;border-left:5px solid #22c55e;border-bottom:5px solid #22c55e;border-radius:0 0 0 10px}.scan-guide span:after{right:-3px;bottom:-3px;border-right:5px solid #22c55e;border-bottom:5px solid #22c55e;border-radius:0 0 10px 0}'
      + '.loading,.errbox,.sent{position:absolute;inset:0;z-index:20;background:#07111f;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:24px;gap:12px}.errbox,.sent{display:none}.errbox.show,.sent.show{display:flex}.spinner{width:34px;height:34px;border:4px solid #334155;border-top-color:#22c55e;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}'
      + '.errbox .icon,.sent-icon{font-size:3rem}.errbox .title,.sent-title{font-weight:800;font-size:1.05rem}.errbox .desc{color:#94a3b8;font-size:.82rem;line-height:1.5;max-width:420px}.sent-value{color:#22c55e;font-weight:700;word-break:break-all}'
      + '.panel{background:#142033;padding:9px 12px 12px;flex-shrink:0;max-height:48vh;overflow:auto}.status{text-align:center;font-size:.82rem;color:#cbd5e1;font-weight:600}.status.ok{color:#4ade80}.status.err{color:#f87171}.camera-info{text-align:center;color:#64748b;font-size:.67rem;margin-top:3px}.tip{background:#0f1b2d;border:1px solid #334155;color:#cbd5e1;border-radius:8px;padding:7px 9px;font-size:.7rem;line-height:1.35;margin-top:7px;text-align:center}'
      + '.tool-row{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}.tool{border:1px solid #475569;background:#1e293b;color:#f8fafc;border-radius:8px;padding:9px 5px;font-size:.72rem;font-weight:700;cursor:pointer}.tool.on{background:#f59e0b;color:#111827;border-color:#fbbf24}.hidden{display:none!important}'
      + '.zoom-wrap{display:grid;grid-template-columns:34px 1fr 34px 48px;gap:7px;align-items:center;margin-top:8px}.zoom-wrap input{width:100%;accent-color:#22c55e}.zoom-btn{height:32px;border:1px solid #475569;border-radius:7px;background:#1e293b;color:white;font-size:1.2rem}.zoom-wrap span{text-align:right;font-size:.72rem;color:#cbd5e1;font-weight:700}'
      + '.file-reader{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.result{display:none;background:rgba(34,197,94,.1);border:2px solid #22c55e;border-radius:10px;padding:10px;text-align:center;margin-top:8px}.result.show{display:block}.result .typ{font-size:.68rem;color:#94a3b8}.result .val{font-size:1rem;font-weight:800;color:#4ade80;word-break:break-all;margin-top:4px}.btns{display:flex;gap:6px;margin-top:8px}.btn{flex:1;border:0;border-radius:8px;padding:11px 8px;font-weight:800;font-size:.8rem;cursor:pointer}.btn-ok{background:#16a34a;color:white}.btn-warn{background:#f59e0b;color:#111827}.btn-no{background:#ef4444;color:white}'
      + '.toast{display:none;position:fixed;left:50%;bottom:100px;transform:translateX(-50%);z-index:100;background:#16a34a;color:white;padding:10px 16px;border-radius:9px;font-weight:700;font-size:.8rem;box-shadow:0 8px 25px rgba(0,0,0,.35);white-space:nowrap}.toast.show{display:block}'
      + '@media(max-width:430px){.tool-row{grid-template-columns:repeat(2,1fr)}.panel{max-height:52vh}.scan-guide.barcode{height:30%}}';
  }

  function getFormats() {
    if (typeof Html5QrcodeSupportedFormats === 'undefined') return undefined;
    if (scanType === 'qrcode') return [Html5QrcodeSupportedFormats.QR_CODE];
    return [
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.ITF,
      Html5QrcodeSupportedFormats.CODABAR,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.PDF_417
    ].filter(function (x) { return x !== undefined; });
  }

  function createScanner(elementId) {
    return new Html5Qrcode(elementId, {
      formatsToSupport: getFormats(),
      useBarCodeDetectorIfSupported: true,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
  }

  function qrbox(viewWidth, viewHeight) {
    if (scanType === 'qrcode') {
      var size = Math.floor(Math.min(viewWidth * 0.84, viewHeight * 0.72, 520));
      size = Math.max(180, size);
      return { width: size, height: size };
    }
    var width = Math.floor(Math.min(viewWidth * 0.94, 820));
    var height = Math.floor(Math.min(Math.max(viewHeight * 0.34, 110), 260));
    return { width: Math.max(220, width), height: height };
  }

  function scanConfig() {
    return {
      fps: 20,
      qrbox: qrbox,
      disableFlip: true
    };
  }

  function scoreCamera(camera) {
    var label = String(camera.label || '').toLowerCase();
    var score = 0;
    if (/macro/.test(label)) score += 70;
    if (/back|rear|environment|belakang/.test(label)) score += 45;
    if (/main|camera 0|kamera 0/.test(label)) score += 12;
    if (/front|user|selfie|depan/.test(label)) score -= 100;
    if (/ultra|0\.5|wide angle/.test(label)) score -= 25;
    return score;
  }

  async function loadCameras() {
    try {
      cameras = await Html5Qrcode.getCameras();
      cameras = (cameras || []).sort(function (a, b) { return scoreCamera(b) - scoreCamera(a); });
      if (cameras.length > 1) document.getElementById('btnCamera').classList.remove('hidden');
    } catch (e) {
      cameras = [];
    }
  }

  function buildConstraint(highQuality) {
    var selected = cameras[cameraIndex];
    var c = {};
    if (selected && selected.id) c.deviceId = { exact: selected.id };
    else c.facingMode = { ideal: 'environment' };
    if (highQuality) {
      c.width = { ideal: 1920 };
      c.height = { ideal: 1080 };
      c.frameRate = { ideal: 30, min: 15 };
    }
    return c;
  }

  async function tryStart(constraint) {
    document.getElementById('reader').innerHTML = '';
    scanner = createScanner('reader');
    await scanner.start(constraint, scanConfig(), onScanSuccess, function () {});
    startedConstraint = constraint;
  }

  async function start() {
    if (starting) return;
    starting = true;
    paused = false;
    lastValue = '';
    torchOn = false;
    document.getElementById('errbox').classList.remove('show');
    document.getElementById('sentScreen').classList.remove('show');
    document.getElementById('loadMsg').style.display = 'flex';
    hideResult();
    setStatus('Menyiapkan kamera resolusi tinggi...');

    if (typeof Html5Qrcode === 'undefined') {
      showError('Library scanner gagal dimuat', 'Periksa koneksi internet lalu coba lagi.');
      starting = false;
      return;
    }

    await safeStop();
    if (!cameras.length) await loadCameras();

    var attempts = [buildConstraint(true), buildConstraint(false)];
    if (cameras[cameraIndex]) {
      attempts.push({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } });
      attempts.push({ facingMode: 'environment' });
    }
    attempts.push({ facingMode: 'user' });

    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        await tryStart(attempts[i]);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        try { if (scanner) scanner.clear(); } catch (_) {}
        scanner = null;
      }
    }

    if (lastErr || !scanner) {
      var msg = String(lastErr || 'Kamera tidak tersedia');
      var denied = /NotAllowed|Permission|denied/i.test(msg);
      showError(denied ? 'Izin kamera ditolak' : 'Kamera tidak dapat dibuka', denied ? 'Buka pengaturan situs → Kamera → Izinkan, lalu tekan Coba Lagi.' : msg);
      starting = false;
      return;
    }

    document.getElementById('loadMsg').style.display = 'none';
    setStatus('Arahkan kamera ke barcode atau QR.');
    await tuneCamera();
    updateCameraInfo();
    requestWakeLock();
    starting = false;
  }

  async function tuneCamera() {
    var caps = {};
    try { caps = scanner.getRunningTrackCapabilities() || {}; } catch (e) {}

    if (caps.focusMode && Array.isArray(caps.focusMode)) {
      if (caps.focusMode.indexOf('continuous') >= 0) {
        await safeApply({ focusMode: 'continuous' });
      }
    }

    if (caps.zoom && isFinite(caps.zoom.min) && isFinite(caps.zoom.max)) {
      zoomCaps = caps.zoom;
      var range = document.getElementById('zoomRange');
      range.min = caps.zoom.min;
      range.max = caps.zoom.max;
      range.step = caps.zoom.step || 0.1;
      var saved = parseFloat(localStorage.getItem('packingScannerZoom'));
      var preferred = scanType === 'qrcode' ? 1.35 : 1.8;
      zoomValue = isFinite(saved) ? saved : preferred;
      zoomValue = Math.max(caps.zoom.min, Math.min(caps.zoom.max, zoomValue));
      range.value = zoomValue;
      document.getElementById('zoomWrap').classList.remove('hidden');
      await applyZoom(zoomValue, false);
    } else {
      zoomCaps = null;
      document.getElementById('zoomWrap').classList.add('hidden');
    }

    if (caps.torch) document.getElementById('btnTorch').classList.remove('hidden');
    else document.getElementById('btnTorch').classList.add('hidden');
  }

  async function safeApply(value) {
    if (!scanner || !scanner.applyVideoConstraints) return false;
    try {
      await scanner.applyVideoConstraints({ advanced: [value] });
      return true;
    } catch (e1) {
      try {
        await scanner.applyVideoConstraints(value);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  async function applyZoom(value, showMessage) {
    if (!zoomCaps) return;
    value = Math.max(zoomCaps.min, Math.min(zoomCaps.max, parseFloat(value)));
    var ok = await safeApply({ zoom: value });
    if (ok) {
      zoomValue = value;
      document.getElementById('zoomRange').value = value;
      document.getElementById('zoomLabel').textContent = value.toFixed(1) + '×';
      try { localStorage.setItem('packingScannerZoom', String(value)); } catch (e) {}
      if (showMessage) showToast('Zoom ' + value.toFixed(1) + '×');
    }
  }

  function zoomTo(value) { applyZoom(parseFloat(value), false); }

  function zoomStep(direction) {
    if (!zoomCaps) return;
    var step = Math.max(zoomCaps.step || 0.1, (zoomCaps.max - zoomCaps.min) / 18);
    applyZoom(zoomValue + step * direction, true);
  }

  async function toggleTorch() {
    var ok = await safeApply({ torch: !torchOn });
    if (!ok) {
      showToast('Lampu tidak didukung kamera ini', true);
      return;
    }
    torchOn = !torchOn;
    var btn = document.getElementById('btnTorch');
    btn.classList.toggle('on', torchOn);
    btn.textContent = torchOn ? '🔦 Lampu ON' : '🔦 Lampu';
  }

  async function refocus() {
    if (!scanner) return;
    setStatus('Memfokuskan kamera...');
    var caps = {};
    try { caps = scanner.getRunningTrackCapabilities() || {}; } catch (e) {}
    var ok = false;
    if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.indexOf('single-shot') >= 0) {
      ok = await safeApply({ focusMode: 'single-shot' });
      setTimeout(function () { safeApply({ focusMode: 'continuous' }); }, 900);
    } else {
      ok = await safeApply({ focusMode: 'continuous' });
    }
    if (ok) {
      showToast('Fokus kamera diperbarui');
      setTimeout(function () { if (!paused) setStatus('Arahkan kamera ke barcode atau QR.'); }, 700);
    } else {
      showToast('Fokus manual tidak didukung', true);
      setStatus('Geser HP sedikit maju-mundur agar fokus.');
    }
  }

  async function switchCamera() {
    if (cameras.length < 2 || starting) return;
    cameraIndex = (cameraIndex + 1) % cameras.length;
    setStatus('Mengganti kamera...');
    await start();
  }

  function updateCameraInfo() {
    var selected = cameras[cameraIndex];
    var parts = [];
    if (selected && selected.label) parts.push(selected.label);
    try {
      var s = scanner.getRunningTrackSettings();
      if (s && s.width && s.height) parts.push(s.width + '×' + s.height);
    } catch (e) {}
    document.getElementById('cameraInfo').textContent = parts.join(' • ') || 'Kamera aktif';
  }

  function detectType(result, fallback) {
    var fmt = fallback || 'Barcode';
    try { fmt = result.result.format.formatName || fmt; } catch (e) {}
    try { fmt = result.format.formatName || fmt; } catch (e) {}
    return String(fmt).toUpperCase().indexOf('QR') >= 0 ? 'QR Code' : 'Barcode (' + fmt + ')';
  }

  function normalizeValue(value) {
    return String(value == null ? '' : value).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }

  function onScanSuccess(text, result, sourceLabel) {
    if (paused) return;
    text = normalizeValue(text);
    if (!text || text === lastValue) return;
    lastValue = text;
    paused = true;
    beep();
    try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch (e) {}
    try { if (scanner) scanner.pause(true); } catch (e) {}
    var typeLabel = detectType(result, sourceLabel || 'Barcode');
    document.getElementById('resVal').textContent = text;
    document.getElementById('resTyp').textContent = typeLabel + (sourceLabel === 'Foto HD' ? ' • Foto HD' : '');
    document.getElementById('resBox').classList.add('show');
    document.getElementById('resultBtns').classList.remove('hidden');
    document.getElementById('scanGuide').style.display = 'none';
    setStatus('✅ Kode berhasil dibaca', 'ok');
  }

  async function scanPhoto(input) {
    var file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try { if (scanner && !paused) scanner.pause(true); } catch (e) {}
    paused = true;
    setStatus('Menganalisis foto resolusi tinggi...');
    document.getElementById('loadMsg').style.display = 'flex';
    document.getElementById('loadMsg').lastElementChild.textContent = 'Mencoba beberapa area dan kontras...';

    try {
      var attempts = [file];
      var found = null;

      // Coba file asli lebih dulu agar tetap bekerja pada browser yang belum
      // mendukung createImageBitmap (sebagian perangkat iOS lama).
      for (var first = 0; first < attempts.length; first++) {
        setStatus('Membaca foto asli...');
        try {
          document.getElementById('fileReader').innerHTML = '';
          fileScanner = createScanner('fileReader');
          var originalResult = await fileScanner.scanFileV2(attempts[first], false);
          var originalText = originalResult && (originalResult.decodedText || originalResult.text);
          if (originalText) found = { text: originalText, result: originalResult };
        } catch (originalError) {
          // Jika belum terbaca, lanjutkan ke crop/rotasi/kontras.
        } finally {
          try { if (fileScanner) fileScanner.clear(); } catch (originalClearError) {}
          fileScanner = null;
        }
      }

      if (!found && typeof createImageBitmap === 'function') {
        var variants = await createImageVariants(file);
        attempts = variants;
        for (var i = 0; i < attempts.length; i++) {
          setStatus('Membaca varian foto ' + (i + 1) + '/' + attempts.length + '...');
          try {
            document.getElementById('fileReader').innerHTML = '';
            fileScanner = createScanner('fileReader');
            var r = await fileScanner.scanFileV2(attempts[i], false);
            var text = r && (r.decodedText || r.text);
            if (text) { found = { text: text, result: r }; break; }
          } catch (e) {
            // Coba varian berikutnya.
          } finally {
            try { if (fileScanner) fileScanner.clear(); } catch (e2) {}
            fileScanner = null;
          }
        }
      }
      document.getElementById('loadMsg').style.display = 'none';
      if (found) {
        paused = false;
        onScanSuccess(found.text, found.result, 'Foto HD');
      } else {
        paused = false;
        try { if (scanner) scanner.resume(); } catch (e3) {}
        setStatus('Kode belum terbaca. Ambil foto lebih dekat dan lurus.', 'err');
        showToast('Pastikan seluruh barcode terlihat dan tidak terpotong', true);
      }
    } catch (e) {
      document.getElementById('loadMsg').style.display = 'none';
      paused = false;
      try { if (scanner) scanner.resume(); } catch (e2) {}
      setStatus('Foto gagal dianalisis: ' + e.message, 'err');
    }
  }

  async function createImageVariants(file) {
    var bitmap = await createImageBitmap(file);
    var specs = [
      { crop: 0.90, rotation: 0, enhance: false },
      { crop: 0.72, rotation: 0, enhance: false },
      { crop: 1.00, rotation: 0, enhance: true },
      { crop: 0.78, rotation: 0, enhance: true },
      { crop: 1.00, rotation: 90, enhance: false },
      { crop: 1.00, rotation: 270, enhance: false }
    ];
    var out = [];
    for (var i = 0; i < specs.length; i++) {
      out.push(await renderVariant(bitmap, specs[i], i));
    }
    try { bitmap.close(); } catch (e) {}
    return out;
  }

  function renderVariant(bitmap, spec, index) {
    return new Promise(function (resolve, reject) {
      var sw = Math.floor(bitmap.width * spec.crop);
      var sh = Math.floor(bitmap.height * spec.crop);
      var sx = Math.floor((bitmap.width - sw) / 2);
      var sy = Math.floor((bitmap.height - sh) / 2);
      var scale = Math.min(1, 2400 / Math.max(sw, sh));
      var dw = Math.max(1, Math.floor(sw * scale));
      var dh = Math.max(1, Math.floor(sh * scale));
      var rotated = spec.rotation === 90 || spec.rotation === 270;
      var canvas = document.createElement('canvas');
      canvas.width = rotated ? dh : dw;
      canvas.height = rotated ? dw : dh;
      var ctx = canvas.getContext('2d', { willReadFrequently: false });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      if (spec.enhance && 'filter' in ctx) ctx.filter = 'grayscale(1) contrast(1.75)';
      ctx.save();
      if (spec.rotation === 90) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
      if (spec.rotation === 270) { ctx.translate(0, canvas.height); ctx.rotate(-Math.PI / 2); }
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
      ctx.restore();
      canvas.toBlob(function (blob) {
        if (!blob) return reject(new Error('Gagal membuat varian foto'));
        resolve(new File([blob], 'scan_variant_' + index + '.jpg', { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.94);
    });
  }

  async function send() {
    var value = document.getElementById('resVal').textContent;
    var type = document.getElementById('resTyp').textContent.replace(' • Foto HD', '');
    if (!value || value === '-') return;
    setStatus('Mengirim kode...');
    try {
      if (!transport.send) throw new Error('Transport scanner belum dikonfigurasi');
      await transport.send({ target: scanTarget, value: value, type: type, time: Date.now() });
      setStatus('✅ Berhasil dikirim', 'ok');
      showToast(transport.successMessage || 'Kode berhasil dikirim');
      if (transport.autoClose === false) {
        document.getElementById('sentTitle').textContent = transport.sentTitle || 'Kode berhasil dikirim';
        document.getElementById('sentValue').textContent = value + ' (' + type + ')';
        document.getElementById('sentScreen').classList.add('show');
        await safeStop();
      } else {
        await safeStop();
        setTimeout(close, transport.closeDelay || 700);
      }
    } catch (e) {
      setStatus('❌ Gagal mengirim: ' + (e.message || e), 'err');
    }
  }

  function rescan() {
    lastValue = '';
    paused = false;
    hideResult();
    document.getElementById('scanGuide').style.display = '';
    setStatus('Arahkan kamera ke barcode atau QR.');
    try { scanner.resume(); } catch (e) { start(); }
  }

  function hideResult() {
    document.getElementById('resBox').classList.remove('show');
    document.getElementById('resultBtns').classList.add('hidden');
  }

  function setStatus(message, type) {
    var el = document.getElementById('status');
    el.textContent = message;
    el.className = 'status' + (type ? ' ' + type : '');
  }

  function showError(title, message) {
    document.getElementById('loadMsg').style.display = 'none';
    document.getElementById('errT').textContent = title;
    document.getElementById('errD').textContent = message;
    document.getElementById('errbox').classList.add('show');
  }

  function showToast(message, isError) {
    var el = document.getElementById('toast');
    el.textContent = message;
    el.style.background = isError ? '#ef4444' : '#16a34a';
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  function beep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      function tone(f, delay, duration) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f;
        var t = audioCtx.currentTime + delay;
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + duration);
        o.start(t); o.stop(t + duration);
      }
      tone(1200, 0, 0.14); tone(1600, 0.17, 0.18);
    } catch (e) {}
  }

  async function safeStop() {
    if (!scanner) return;
    try { await scanner.stop(); } catch (e) {}
    try { scanner.clear(); } catch (e2) {}
    scanner = null;
  }

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  }

  async function close() {
    await safeStop();
    try { if (wakeLock) await wakeLock.release(); } catch (e) {}
    if (transport.close) {
      try { transport.close(); return; } catch (e2) {}
    }
    try { window.close(); } catch (e3) {}
    setTimeout(function () { try { history.back(); } catch (e4) {} }, 250);
  }

  window.ScannerApp = {
    start: start,
    close: close,
    send: send,
    rescan: rescan,
    toggleTorch: toggleTorch,
    refocus: refocus,
    switchCamera: switchCamera,
    zoomTo: zoomTo,
    zoomStep: zoomStep,
    scanPhoto: scanPhoto
  };

  window.addEventListener('load', function () { setTimeout(start, 250); });
  window.addEventListener('beforeunload', function () { safeStop(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && !paused) requestWakeLock();
  });
})();
