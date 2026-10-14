/* Reference Line – Training & Evaluation
 * Shared engine for the Training, Evaluation and Reproducibility modules.
 * The page declares its module with <body data-mode="training|evaluation|repro">
 * and loads radiusjSON.js and tibiajSON.js (image list, ground truth, image
 * sets and the per-image pixel-row → mm lookup tables) before this file.
 *
 * Scoring is unchanged from the original 2015–2017 implementation:
 *  - the line position is a scout-canvas pixel row y;
 *  - the correct row is the first row whose mm value equals the ground truth;
 *  - |y - correct| = 0 → Exact, ≤ 2 → Good, > 2 → Out of range.
 */
(function () {
  'use strict';

  const MODE = document.body.dataset.mode;
  const SET_SIZE = 8;
  const GOOD_TOLERANCE_PX = 2;
  const PASSES_FOR_CERTIFICATE = 3;
  // A set passes in Evaluation only if no position is Out of range
  // (all 8 Exact or Good), per the certification protocol.
  const PASS_MAX_OUT_OF_RANGE = 0;
  // Keyboard positioning is always available (WCAG 2.1.1), but Evaluation and
  // Reproducibility assess the mouse-based workstation skill, so lines placed
  // with the keyboard there are flagged and the set/score cannot be accepted.
  const KEYBOARD_COUNTS = MODE === 'training';
  const keyboardSummary = (n, total) => n + ' of ' + total + (n === 1 ? ' lines was' : ' lines were') + ' placed with the keyboard';
  const TOP_ROW = 20;                  // the line cannot go above this canvas row
  const LINE_GREEN = '#66ff00', SCANCO_RED = '#ff0800', CORRECT_BLUE = '#0033ff';
  const RESULT = {
    exact: { label: 'Exact', color: '#66ff00', css: 'alert-exact' },
    good:  { label: 'Good', color: '#ffa500', css: 'alert-good' },
    out:   { label: 'Out of range', color: '#ff0000', css: 'alert-out' }
  };

  // ---------- Data ----------
  const nums = (json) => JSON.parse(json).imageNums.slice(1).map(Number);
  const sets = (suffix) => {
    const list = [null];
    for (let i = 1; i <= 15; i++) list.push(nums(window['set' + i + 'Text' + suffix]));
    return list;
  };
  const scale = (mm, top, rows, bottomMm) => (mm - top) * (rows / (bottomMm - top));

  const BONES = {
    radius: {
      name: 'Radius',
      images: JSON.parse(radiusText).radii,
      pixels: JSON.parse(pixelInfoR),
      imageCount: 112,
      bottomRow: 434, bottomMarker: 432.5, topMm: '80.000', bottomMm: '154.112',
      sets: { training: sets('RT'), evaluation: sets('RE'), repro: nums(setTextRR) },
      // Correct line on the feedback image (image 1), per landmark definition
      feedbackRow: { scanco: scale(111.3131, 80, 434, 154.112), proximal: scale(113.7086, 80, 434, 154.112) },
      reproRange: 0.360
    },
    tibia: {
      name: 'Tibia',
      images: JSON.parse(tibiaText).tibiae,
      pixels: JSON.parse(pixelInfoT),
      imageCount: 112,
      bottomRow: 496, bottomMarker: 494.5, topMm: '60.000', bottomMm: '144.724',
      sets: { training: sets('TT'), evaluation: sets('TE'), repro: nums(setTextTR) },
      feedbackRow: { scanco: scale(75.7421, 60, 496, 144.724) },
      reproRange: 0.140
    }
  };

  // Training categories → the sets each one cycles through. Landmark visibility
  // refers to the Scanco landmark, so with the radius proximal margin landmark
  // only laterality applies (sets grouped as in the original set labels).
  const CATEGORIES = {
    'left-visible':  { sets: [1, 2, 3],    label: 'Left, landmark visible' },
    'right-visible': { sets: [4, 5, 6],    label: 'Right, landmark visible' },
    'left-hidden':   { sets: [7, 8, 9],    label: 'Left, landmark not visible' },
    'right-hidden':  { sets: [10, 11, 12], label: 'Right, landmark not visible' },
    'left':          { sets: [1, 2, 3, 7, 8, 9],    label: 'Left', proximal: true },
    'right':         { sets: [4, 5, 6, 10, 11, 12], label: 'Right', proximal: true },
    'mixed':         { sets: [13, 14, 15], label: 'Mixed' }
  };
  const usesProximal = () => state.bone === 'radius' && state.landmark === 'proximal';
  // Whether a category is offered for the current bone/landmark
  // (Mixed, Random and For certification always are)
  const categoryAvailable = (key) => {
    const c = CATEGORIES[key];
    if (!c || key === 'mixed') return true;
    return usesProximal() ? !!c.proximal : !c.proximal;
  };
  const categoryOfSet = (n) => Object.keys(CATEGORIES).find((k) => categoryAvailable(k) && CATEGORIES[k].sets.includes(n));

  // mm value for every canvas row of an image (index = row; built on first use)
  const mmColumns = {};
  function mmColumn(bone, img) {
    const key = bone + img;
    if (!mmColumns[key]) mmColumns[key] = [null].concat(BONES[bone].pixels.map((row) => row[img]));
    return mmColumns[key];
  }
  const groundTruth = (bone, img, landmark) =>
    BONES[bone].images[img][bone === 'radius' && landmark === 'proximal' ? 'grTruth2' : 'grTruth'];

  const imageCache = {};
  function loadImage(bone, img) {
    const key = bone + img;
    if (!imageCache[key]) {
      imageCache[key] = new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not load ' + el.src));
        el.src = BONES[bone].images[img].src;
      });
    }
    return imageCache[key];
  }

  // ---------- Elements ----------
  const $ = (id) => document.getElementById(id);
  const scout = $('scout');
  const ctx = scout.getContext('2d');
  const setup = $('setup');
  const startBtn = $('startBtn'), lineBtn = $('lineBtn'), confirmBtn = $('confirmBtn'), nextBtn = $('nextBtn');
  const progressWrap = $('progressWrap'), progress = $('progress'), progressText = $('progressText');
  const resultBox = $('result'), setLabel = $('setLabel');
  const dialog = $('feedback');

  // ---------- State ----------
  const state = {
    bone: null, landmark: null, category: null,
    cyclePos: {},            // training: next set index per category
    certSet: 0,              // training "For certification": current set 1–15
    queue: [], index: 0,     // images of the running set
    image: null,             // current HTMLImageElement
    y: 180,                  // current line row (kept between images, as in the original)
    placing: false, placed: false,
    results: [],             // per image: { img, diff, result, mm }
    passed: { 'radius-scanco': 0, 'radius-proximal': 0, tibia: 0 },
    repro: {}                // repro: img → [mm, mm, mm]
  };
  const bone = () => BONES[state.bone];

  // Workstation only: devices without a mouse or trackpad (phones, tablets) can't run a session.
  // Browsers older than ~2022 (no <dialog>) would fail at the end of a set, so stop them up front.
  const browserSupported = typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype && !!window.PointerEvent;
  if (!browserSupported || !window.matchMedia('(any-pointer: fine)').matches) {
    const notice = $('deviceNotice');
    if (!browserSupported) {
      notice.textContent = 'This browser is not supported. Please use a current version of Chrome, Edge, Firefox, or Safari.';
    }
    notice.hidden = false;
    setup.disabled = true;
  }

  // ---------- Setup controls ----------
  setup.addEventListener('change', (e) => {
    const { name, value } = e.target;
    if (name === 'bone') {
      state.bone = value;
      const lm = $('landmarkSet');
      if (lm) lm.hidden = value !== 'radius';
    }
    if (name === 'landmark') state.landmark = value;
    if (name === 'category') { state.category = value; state.cyclePos[value] = 0; }
    if (name === 'bone' || name === 'landmark') updateCategoryOptions();
    clearCanvas();
    startBtn.disabled = !ready();
  });

  // Show only the image-set options that apply to the selected landmark
  function updateCategoryOptions() {
    document.querySelectorAll('input[name="category"]').forEach((input) => {
      const show = categoryAvailable(input.value);
      input.closest('label').hidden = !show;
      if (!show && input.checked) {
        input.checked = false;
        state.category = null;
      }
    });
  }

  function ready() {
    if (!state.bone) return false;
    if (MODE !== 'repro' && state.bone === 'radius' && !state.landmark) return false;
    if (MODE === 'training' && !state.category) return false;
    return true;
  }

  startBtn.addEventListener('click', () => {
    state.results = [];
    state.repro = {};
    let queue;
    if (MODE === 'repro') {
      queue = bone().sets.repro;
    } else if (MODE === 'evaluation') {
      queue = bone().sets.evaluation[1 + Math.floor(Math.random() * 15)];
    } else if (state.category === 'random') {
      queue = Array.from({ length: SET_SIZE }, () => 1 + Math.floor(Math.random() * bone().imageCount));
    } else if (state.category === 'certification') {
      state.certSet = 1;
      queue = bone().sets.training[1];
    } else {
      const c = CATEGORIES[state.category];
      queue = bone().sets.training[c.sets[state.cyclePos[state.category]]];
    }
    runSet(queue);
  });

  function runSet(queue) {
    state.queue = queue;
    state.index = 0;
    state.keyboardPlacements = 0;
    const kbNotice = $('keyboardNotice');
    if (kbNotice) kbNotice.hidden = true;
    setup.disabled = true;
    startBtn.disabled = true;
    progressWrap.hidden = false;
    queue.forEach((img) => loadImage(state.bone, img).catch(() => {}));  // preload the set
    updateSetLabel();
    updateProgress(0);
    showImage().then(() => lineBtn.focus());
  }

  function updateSetLabel() {
    if (!setLabel) return;
    if (state.certSet) {
      const c = CATEGORIES[categoryOfSet(state.certSet)];
      setLabel.textContent = 'Certification set ' + state.certSet + ' of 15: ' + c.label;
    } else {
      setLabel.textContent = '';
    }
  }

  function updateProgress(done) {
    let value = done, max = state.queue.length;
    if (state.certSet) { value = SET_SIZE * (state.certSet - 1) + done; max = SET_SIZE * 15; }
    progress.max = max;
    progress.value = value;
    progressText.textContent = value + ' of ' + max + ' images';
  }

  // ---------- Canvas drawing ----------
  function clearCanvas() {
    ctx.clearRect(0, 0, scout.width, scout.height);
    scout.classList.remove('has-image');
  }

  function drawImage() {
    ctx.clearRect(0, 0, scout.width, scout.height);
    if (state.image) ctx.drawImage(state.image, 0, 0);
  }

  function mmAt(y) {
    const v = mmColumn(state.bone, currentImg())[y];
    return v.slice(0, v.indexOf('.') + 4);   // 3 decimals, as displayed by the scanner
  }

  // Reproduces the Scanco scout-view overlay: reference line, mm readout,
  // red markers for the scan range, and the scan summary.
  function drawLine() {
    const b = bone(), y = state.y;
    drawImage();
    ctx.lineWidth = 1;
    ctx.strokeStyle = LINE_GREEN;
    strokeRow(y, 0, 512);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = SCANCO_RED;
    strokeRow(1.25, 477, 512);
    strokeRow(b.bottomMarker, 477, 512);
    ctx.font = '12px Arial';
    ctx.fillStyle = SCANCO_RED;
    ctx.fillText(b.topMm, 475, 14);
    ctx.fillText(b.bottomMm, 467, b.bottomMarker - 5);
    ctx.fillStyle = LINE_GREEN;
    ctx.fillText(mmAt(y) + 'mm', 11, y - 3);
    ctx.fillText('110 Slices, 9.020mm, 2.8min', 190, 508);
  }

  function strokeRow(y, x0, x1) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  const currentImg = () => state.queue[state.index];

  function showImage() {
    clearCanvas();
    lineBtn.disabled = true;
    confirmBtn.disabled = true;
    nextBtn.disabled = true;
    return loadImage(state.bone, currentImg()).then((img) => {
      state.image = img;
      scout.classList.add('has-image');
      drawImage();
      lineBtn.disabled = false;
    }, (err) => {
      resultBox.innerHTML = '<p class="alert alert-out">The scout view image could not be loaded. Please check your connection and reload the page.</p>';
      console.error(err);
    });
  }

  // ---------- Positioning the line (mouse; keyboard alternative) ----------
  function setRow(y) {
    state.y = Math.min(Math.max(Math.round(y), TOP_ROW), bone().bottomRow);
    drawLine();
    scout.setAttribute('aria-valuenow', state.y);
    scout.setAttribute('aria-valuetext', mmAt(state.y) + ' millimeters');
  }

  function rowFromPointer(e) {
    const r = scout.getBoundingClientRect();
    return (e.clientY - r.top) * (scout.height / r.height);
  }

  lineBtn.addEventListener('click', () => {
    state.placing = true;
    state.placed = false;
    confirmBtn.disabled = true;
    resultBox.textContent = '';
    scout.classList.add('placing');
    scout.tabIndex = 0;
    scout.setAttribute('aria-disabled', 'false');
    scout.setAttribute('aria-valuemin', TOP_ROW);
    scout.setAttribute('aria-valuemax', bone().bottomRow);
    setRow(state.y);
    scout.focus();
  });

  function place(method) {
    if (!state.placing) return;
    state.placing = false;
    state.placed = true;
    state.placedBy = method;
    const kbNotice = $('keyboardNotice');
    if (KEYBOARD_COUNTS) {
      // Training: keyboard is fine for practice, but remind that assessments require the mouse
      if (method === 'keyboard') kbNotice.hidden = false;
    } else {
      // Evaluation/Repro: warn while a keyboard placement is pending or already confirmed in this set
      kbNotice.hidden = method !== 'keyboard' && state.keyboardPlacements === 0;
    }
    scout.classList.remove('placing');
    confirmBtn.disabled = false;
    resultBox.textContent = 'Line placed at ' + mmAt(state.y) + ' mm. Select Confirm, or Set reference line to reposition.';
    confirmBtn.focus();
  }

  // Mouse (or trackpad) only, as on the scanner workstation: the line follows
  // the pointer and is placed on button press. Touch and pen input are ignored.
  scout.addEventListener('pointermove', (e) => {
    if (state.placing && e.pointerType === 'mouse') setRow(rowFromPointer(e));
  });
  scout.addEventListener('pointerdown', (e) => {
    if (!state.placing || e.pointerType !== 'mouse' || e.button !== 0) return;
    setRow(rowFromPointer(e));
    place('mouse');
  });
  scout.addEventListener('keydown', (e) => {
    if (!state.placing) return;
    const step = e.shiftKey ? 10 : 1;
    const moves = { ArrowUp: -step, ArrowDown: step, PageUp: -10, PageDown: 10 };
    if (e.key in moves) setRow(state.y + moves[e.key]);
    else if (e.key === 'Home') setRow(TOP_ROW);
    else if (e.key === 'End') setRow(bone().bottomRow);
    else if (e.key === 'Enter' && !e.repeat) place('keyboard');
    else if (e.key !== ' ') return;   // Space places on keyup, so its release doesn't activate Confirm
    e.preventDefault();
  });
  scout.addEventListener('keyup', (e) => {
    if (e.key === ' ' && state.placing) { e.preventDefault(); place('keyboard'); }
  });

  // ---------- Confirm / Next ----------
  confirmBtn.addEventListener('click', () => {
    const img = currentImg(), y = state.y;
    const mm = mmColumn(state.bone, img)[y];
    const keyboard = state.placedBy === 'keyboard';
    if (keyboard) state.keyboardPlacements++;
    scout.tabIndex = -1;
    scout.setAttribute('aria-disabled', 'true');

    if (MODE === 'repro') {
      // No feedback per image; record the position (mm) of each repetition.
      (state.repro[img] = state.repro[img] || []).push(parseFloat(mm));
      resultBox.textContent = 'Position recorded.';
    } else {
      const truth = groundTruth(state.bone, img, state.landmark);
      const correctRow = mmColumn(state.bone, img).indexOf(truth);
      if (correctRow < 0) console.error('Ground truth ' + truth + ' not found for ' + state.bone + ' image ' + img);
      const diff = y - correctRow;
      const result = diff === 0 ? 'exact' : Math.abs(diff) <= GOOD_TOLERANCE_PX ? 'good' : 'out';
      const diffMm = Number((parseFloat(mm) - parseFloat(truth)).toFixed(4));
      state.results.push({ img, diff, result, diffMm, keyboard });

      ctx.lineWidth = 1;
      ctx.strokeStyle = CORRECT_BLUE;
      strokeRow(correctRow, 0, 512);
      ctx.font = '12px Arial';
      ctx.fillStyle = CORRECT_BLUE;
      ctx.fillText(truth, 460, correctRow - 6);

      const r = RESULT[result];
      resultBox.innerHTML = '<p class="alert ' + r.css + '"><strong>' + r.label + '!</strong> Difference: ' +
        (diff === 0 ? '0.0000' : (diffMm > 0 ? '+' : '') + diffMm) + ' mm. The correct position is shown in blue.</p>';
    }

    updateProgress(state.index + 1);
    lineBtn.disabled = true;
    confirmBtn.disabled = true;
    nextBtn.disabled = false;
    nextBtn.focus();
  });

  nextBtn.addEventListener('click', () => {
    nextBtn.disabled = true;
    resultBox.textContent = '';
    state.placed = false;
    state.index++;
    if (state.index < state.queue.length) {
      showImage().then(() => lineBtn.focus());
    } else {
      endOfSet();
    }
  });

  // ---------- End of set ----------
  function endOfSet() {
    clearCanvas();
    state.image = null;
    if (MODE === 'repro') showReproFeedback();
    else showSetFeedback();
    dialog.showModal();
    updatePrintCopy();
  }

  dialog.addEventListener('close', () => {
    const printCopy = document.querySelector('.print-area');
    if (printCopy) printCopy.remove();
    if (MODE === 'training') {
      if (state.certSet && state.certSet < 15) {   // certification continues with the next set
        state.certSet++;
        runSet(bone().sets.training[state.certSet]);
        return;
      }
      if (CATEGORIES[state.category]) {
        state.cyclePos[state.category] = (state.cyclePos[state.category] + 1) % CATEGORIES[state.category].sets.length;
      }
      state.certSet = 0;
    }
    updateSetLabel();
    progressWrap.hidden = true;
    setup.disabled = false;
    startBtn.disabled = !ready();
    startBtn.focus();
  });
  $('closeFeedback').addEventListener('click', () => dialog.close());

  function showSetFeedback() {
    const b = bone();
    const counts = { exact: 0, good: 0, out: 0 };
    let above = 0, below = 0;
    const rows = state.results.map((r, i) => {
      counts[r.result]++;
      if (r.diff < 0) above++;
      if (r.diff > 0) below++;
      const where = r.diff < 0 ? 'distal (above)' : r.diff > 0 ? 'proximal (below)' : '—';
      return '<tr><td>' + (i + 1) + '</td><td>' + RESULT[r.result].label + (r.keyboard && !KEYBOARD_COUNTS ? ' (keyboard)' : '') + '</td><td>' +
        (r.diff > 0 ? '+' : '') + r.diff + '</td><td>' + where + '</td></tr>';
    });
    $('countExact').textContent = counts.exact;
    $('countGood').textContent = counts.good;
    $('countOut').textContent = counts.out;
    $('aboveBelow').textContent = 'Distal (above) the correct position: ' + above + '. Proximal (below) the correct position: ' + below + '.';
    $('resultRows').innerHTML = rows.join('');

    // Summary image: all of the user's lines, offset onto image 1 of the bone
    const fb = $('feedbackCanvas'), f = fb.getContext('2d');
    const correct = b.feedbackRow[state.bone === 'radius' ? state.landmark : 'scanco'];
    f.clearRect(0, 0, fb.width, fb.height);
    loadImage(state.bone, 1).then((img) => {
      f.drawImage(img, 0, 0);
      f.lineWidth = 1;
      state.results.forEach((r) => {
        f.strokeStyle = RESULT[r.result].color;
        f.beginPath(); f.moveTo(0, r.diff + correct); f.lineTo(512, r.diff + correct); f.stroke();
      });
      f.strokeStyle = CORRECT_BLUE;
      f.beginPath(); f.moveTo(0, correct); f.lineTo(512, correct); f.stroke();
      updatePrintCopy();   // include the finished drawing in the print copy
    }).catch(() => {});

    if (MODE === 'evaluation') {
      const key = state.bone === 'radius' ? 'radius-' + state.landmark : 'tibia';
      const kb = state.keyboardPlacements;
      const passed = counts.out <= PASS_MAX_OUT_OF_RANGE && kb === 0;
      if (passed) state.passed[key]++;
      $('setPassed').textContent = passed ? 'You passed this set.'
        : kb ? 'This set does not count toward certification: ' + keyboardSummary(kb, state.results.length) +
               '. Evaluation sets must be positioned with the mouse.'
        : 'You did not pass this set.';
      // Each bone/landmark combination is certified independently
      $('passedCount').textContent = 'Sets passed in this session: radius, Scanco landmark ' +
        state.passed['radius-scanco'] + '; radius, proximal margin landmark ' +
        state.passed['radius-proximal'] + '; tibia ' + state.passed.tibia + '.';
      const cert = $('certified');
      cert.hidden = state.passed[key] < PASSES_FOR_CERTIFICATE;
      $('certLink').href = 'certificate.html?bone=' + key;
    }
  }

  function showReproFeedback() {
    const b = bone();
    // One row per image, in order of first appearance (as in the original)
    const ids = Array.from(new Set(state.queue));
    const sds = [];
    const rows = ids.map((img, i) => {
      const p = state.repro[img];
      const mean = (p[0] + p[1] + p[2]) / 3;
      const sd = Math.sqrt(p.reduce((s, v) => s + (v - mean) ** 2, 0) / (p.length - 1));
      sds.push(sd);
      return '<tr><td>' + (i + 1) + '</td><td>' + p.map((v) => v.toFixed(3)).join('</td><td>') +
        '</td><td>' + sd.toFixed(3) + '</td></tr>';
    });
    const rms = Math.sqrt(sds.reduce((s, v) => s + v * v, 0) / sds.length);
    rows.push('<tr><th scope="row">RMS</th><td></td><td></td><td></td><td>' + rms.toFixed(3) + '</td></tr>');
    $('resultRows').innerHTML = rows.join('');
    $('rmsScore').textContent = rms.toFixed(3) + ' mm';
    $('rmsRange').textContent = 'less than ' + b.reproRange.toFixed(3) + ' mm (' + b.name.toLowerCase() + ')';
    const kb = state.keyboardPlacements;
    $('inRange').textContent = kb
      ? 'This score cannot be accepted: ' + keyboardSummary(kb, state.queue.length) +
        '. Repeat the session using the mouse.'
      : Number(rms.toFixed(3)) <= b.reproRange
        ? 'Your score is in the accepted range.'
        : 'Your score is not in the accepted range.';
  }

  // ---------- Printing results ----------
  // Browsers (notably Safari) print an open modal dialog as one fixed box clipped
  // to its scroll position, so results print from a plain in-flow copy
  // (.print-area in refline.css). The copy is built when the results are shown,
  // not when printing starts: Safari takes its print snapshot immediately and
  // would print a just-created image as a blank box.
  function updatePrintCopy() {
    let area = document.querySelector('.print-area');
    if (!area) {
      area = document.createElement('div');
      area.className = 'print-area';
      area.setAttribute('aria-hidden', 'true');   // duplicate of the open results; for print only
      area.inert = true;
      document.body.appendChild(area);
    }
    area.innerHTML = '<div class="print-header"><img src="img/logo-refline.png" alt="UCSF Reference Line Training &amp; Evaluation">' +
      '<span>' + document.querySelector('.module-header h1').textContent + ' · ' + new Date().toLocaleString() + '</span></div>';
    const copy = dialog.cloneNode(true);
    // Canvas drawings aren't cloned; print them as images
    const canvases = dialog.querySelectorAll('canvas');
    copy.querySelectorAll('canvas').forEach((c, i) => {
      const img = document.createElement('img');
      img.src = canvases[i].toDataURL('image/png');
      img.alt = canvases[i].getAttribute('aria-label') || '';
      img.className = 'print-canvas';
      c.replaceWith(img);
    });
    copy.querySelectorAll('.no-print').forEach((n) => n.remove());
    copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));   // avoid duplicate ids
    area.append(...copy.childNodes);
  }
  // Print button, File > Print and Cmd+P all print the copy while results are open
  window.addEventListener('beforeprint', () => document.body.classList.toggle('printing-dialog', dialog.open));
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-dialog'));
  $('printFeedback').addEventListener('click', () => {
    document.body.classList.add('printing-dialog');
    window.print();
  });
})();
