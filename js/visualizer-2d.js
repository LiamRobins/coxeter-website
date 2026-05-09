(function () {
'use strict';

// Set the text content of an SVG <text> element, rendering:
//   - B_n overlines via <tspan text-decoration="overline">
//   - D_n superscripts (e.g. r^{2}f) via <tspan baseline-shift="super">
//   - everything else as plain text (S_n digits, the bare letters e/r/f, etc.)
function applyLabel(textEl, label) {
  while (textEl.firstChild) textEl.removeChild(textEl.firstChild);

  if (label.indexOf('\\overline') !== -1) {
    var parts = label.split(/(\\overline\{\w+\})/);
    parts.forEach(function (part) {
      var m = part.match(/^\\overline\{(\w+)\}$/);
      if (m) {
        var tspan = document.createElementNS(SVG_NS, 'tspan');
        tspan.setAttribute('text-decoration', 'overline');
        tspan.textContent = m[1];
        textEl.appendChild(tspan);
      } else if (part) {
        textEl.appendChild(document.createTextNode(part));
      }
    });
    return;
  }

  if (label.indexOf('^{') !== -1) {
    var i = 0;
    while (i < label.length) {
      var nextSup = label.indexOf('^{', i);
      if (nextSup === -1) {
        textEl.appendChild(document.createTextNode(label.substring(i)));
        break;
      }
      if (nextSup > i) {
        textEl.appendChild(document.createTextNode(label.substring(i, nextSup)));
      }
      var end = label.indexOf('}', nextSup + 2);
      var sup = document.createElementNS(SVG_NS, 'tspan');
      sup.setAttribute('baseline-shift', 'super');
      sup.setAttribute('font-size', '70%');
      sup.textContent = label.substring(nextSup + 2, end);
      textEl.appendChild(sup);
      i = end + 1;
    }
    return;
  }

  textEl.textContent = label;
}

// ── Highlight computation ─────────────────────────────────────────────────────
// Returns {blue, green, yellow} as Sets of element indices.
//
// green = { t·w : t ∈ Inv(w) }  computed via G.greenElements(wIdx)
//         (reflections can decrease length by 1, 3, 5, ... so we can't
//          simply filter by length ℓ(w)−1)
// yellow = [e,w] \ {w} \ green
function computeHighlights(G, wIdx) {
  var blue  = new Set([wIdx]);
  var green = G.greenElements ? G.greenElements(wIdx) : new Set();
  var yellow = new Set();

  G.elements[wIdx].bruhatInterval.forEach(function (idx) {
    if (idx === wIdx)      return;
    if (green.has(idx))    return;
    yellow.add(idx);
  });

  return { blue: blue, green: green, yellow: yellow };
}

// ── 2D polygon chamber geometry ───────────────────────────────────────────────
//
// All 2D groups share the same geometry: a regular n-gon divided into 2n
// triangular chambers by n reflection axes.  n = |G|/2.
//
// Boundary points (2n, 0-indexed):
//   Point k is at angle φ + k·π/n.
//   Even k → polygon vertex  (radius R)
//   Odd  k → edge midpoint   (radius R·cos(π/n))
//
// Chamber assignment is computed by applying each element's 2×2 matrix to
// the centroid of the fundamental sector [0, π/n] and finding which sector
// the image lands in.  This works for all families (dihedral, symmetric,
// hyperoctahedral) because the matrix representation acts on the same ℝ².
//
// Reflection axis j (= G.reflections[j] for dihedral, or the j-th reflection
// listed by getReflAxes) runs between boundary pt (j+1) and (j+1+n) mod 2n.

function computeSectorAssignment(G, n, phi) {
  // For each element w, apply its 2×2 matrix to a test point and find which
  // drawn sector the image lands in.  Drawn sector k spans math-space angles
  // [phi + k·π/n,  phi + (k+1)·π/n], so we subtract phi before binning.
  var numSectors  = 2 * n;
  var sectorWidth = Math.PI / n;
  var TAU         = 2 * Math.PI;

  function angleToSector(angle) {
    var a = ((angle - phi) % TAU + TAU) % TAU; // normalise to [0, 2π)
    return Math.floor(a / sectorWidth) % numSectors;
  }

  function tryPoint(fx, fy) {
    var sectorOf = new Array(numSectors);
    var ok = true;
    G.elements.forEach(function (elem, idx) {
      var m = elem.matrix;
      var s = angleToSector(Math.atan2(m[2]*fx + m[3]*fy, m[0]*fx + m[1]*fy));
      if (sectorOf[s] !== undefined) { ok = false; }
      sectorOf[s] = idx;
    });
    return ok ? sectorOf : null;
  }

  // Try the midpoint of every drawn sector at several fractions.
  // The correct fundamental chamber is one of them.
  var fracs = [0.25, 0.35, 0.45, 0.5, 0.55, 0.65, 0.75];
  for (var s = 0; s < numSectors; s++) {
    for (var fi = 0; fi < fracs.length; fi++) {
      var ang = phi + (s + fracs[fi]) * sectorWidth;
      var res = tryPoint(0.5 * Math.cos(ang), 0.5 * Math.sin(ang));
      if (res) return res;
    }
  }

  // Should never reach here for the groups we support, but guard anyway.
  var fallback = new Array(numSectors);
  G.elements.forEach(function (e, i) { fallback[i] = i; });
  return fallback;
}

function buildPolygonChambers(G, n, cx, cy, R, phi) {
  var rMid = R * Math.cos(Math.PI / n);
  var pts  = [];
  for (var k = 0; k < 2 * n; k++) {
    var angle = phi + k * Math.PI / n;
    var r     = (k % 2 === 0) ? R : rMid;
    pts.push({ x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) });
  }

  var sectorOf = G.sectorAssignment
    ? G.sectorAssignment(n)
    : computeSectorAssignment(G, n, phi);

  var chambers = [];
  for (var k = 0; k < 2 * n; k++) {
    var kNext = (k + 1) % (2 * n);
    var p0 = { x: cx, y: cy }, p1 = pts[k], p2 = pts[kNext];
    chambers.push({
      elemIdx:  sectorOf[k],
      polygon:  [p0, p1, p2],
      centroid: { x: (p0.x+p1.x+p2.x)/3, y: (p0.y+p1.y+p2.y)/3 }
    });
  }

  // Reflection axes: axis j runs from boundary pt (j+1) to (j+1+n) mod 2n.
  // For dihedral G.reflections[j] is f_{j+1}.
  // For other families we still draw the n geometric axes (they correspond to
  // the sorted inversion-set indices used by _applyHighlights).
  var reflAxes = [];
  for (var j = 0; j < n; j++) {
    reflAxes.push({
      refIdx: j,
      p1: pts[(j + 1) % (2 * n)],
      p2: pts[(j + 1 + n) % (2 * n)]
    });
  }

  return { pts: pts, chambers: chambers, reflAxes: reflAxes };
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
var SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  var el = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
  return el;
}

function polyPoints(pts) {
  return pts.map(function (p) { return p.x.toFixed(2) + ',' + p.y.toFixed(2); }).join(' ');
}

// ── Colours ───────────────────────────────────────────────────────────────────
var COL = {
  chamberDefault:  '#f0f4fa',
  chamberStroke:   '#1c3d5a',
  blue:            '#2979d4',
  blueFill:        'rgba(41,121,212,0.25)',
  green:           '#388e3c',
  greenFill:       'rgba(56,142,60,0.25)',
  yellow:          '#e6a817',
  yellowFill:      'rgba(230,168,23,0.25)',
  axisDefault:     '#8faabf',
  axisRed:         '#d32f2f',
  labelDefault:    '#1c3d5a',
  labelSelected:   '#1a3a7a',
};

// ── Visualizer2D ──────────────────────────────────────────────────────────────
//
// Usage:
//   var viz = new Visualizer2D(containerEl, G, options);
//   viz.onSelect = function(elemIdx) { /* update info column */ };
//
// options (for dihedral): { family:'dihedral', n, phi }
// phi defaults to Math.PI/2 (vertex at top).

function Visualizer2D(container, G, options) {
  this.G           = G;
  this.options     = options;
  this.onSelect    = null;   // callback(elemIdx)
  this._selected   = null;   // currently selected element index
  this._showAxes   = false;

  var W = container.clientWidth || 520;
  var H = W;                          // square viewport
  this._cx = W / 2;
  this._cy = H / 2;
  this._R  = W * 0.38;                // polygon radius

  this._svg          = null;
  this._chambers     = [];
  this._chamberEls   = [];
  this._labelEls     = [];
  this._axisEls      = [];
  this._axisLabelEls = [];            // axis label text elements (toggled)
  this._geometry     = null;

  this._build(container, W, H);
}

Visualizer2D.prototype._build = function (container, W, H) {
  var self    = this;
  var G       = this.G;
  var options = this.options;
  var phi     = (options.phi !== undefined) ? options.phi : Math.PI / 2;

  // ── Compute geometry ──
  var geo = buildPolygonChambers(G, options.n, this._cx, this._cy, this._R, phi);
  this._geometry = geo;
  this._chambers = geo.chambers;

  // ── Create SVG ──
  var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });
  this._svg = svg;

  // Layer order: chambers (bottom) → axes (middle) → labels (top)
  var chamberLayer= svgEl('g', { class: 'chamber-layer' });
  var axisLayer   = svgEl('g', { class: 'axis-layer' });
  var labelLayer  = svgEl('g', { class: 'label-layer' });
  svg.appendChild(chamberLayer);
  svg.appendChild(axisLayer);
  svg.appendChild(labelLayer);

  // ── Draw reflection axes ──
  geo.reflAxes.forEach(function (ax) {
    var line = svgEl('line', {
      x1: ax.p1.x.toFixed(2), y1: ax.p1.y.toFixed(2),
      x2: ax.p2.x.toFixed(2), y2: ax.p2.y.toFixed(2),
      stroke: COL.axisDefault, 'stroke-width': '2',
      'stroke-linecap': 'round', class: 'refl-axis', visibility: 'hidden'
    });
    axisLayer.appendChild(line);
    self._axisEls.push(line);
  });

  // ── Draw chambers ──
  var fontSize    = Math.max(9, Math.round(self._R * 0.13));
  geo.chambers.forEach(function (ch, i) {
    var poly = svgEl('polygon', {
      points: polyPoints(ch.polygon),
      fill:   COL.chamberDefault,
      stroke: COL.chamberStroke, 'stroke-width': '1', 'stroke-linejoin': 'round',
      cursor: 'pointer', class: 'chamber'
    });
    poly.addEventListener('click', function () { self._select(i); });
    chamberLayer.appendChild(poly);
    self._chamberEls.push(poly);

    var label = svgEl('text', {
      x: ch.centroid.x.toFixed(2),
      y: ch.centroid.y.toFixed(2),
      'text-anchor': 'middle', 'dominant-baseline': 'central',
      'font-size': fontSize, 'font-family': 'Georgia, serif',
      fill: COL.labelDefault, 'pointer-events': 'none', class: 'chamber-label'
    });
    applyLabel(label, G.elements[ch.elemIdx].label);
    labelLayer.appendChild(label);
    self._labelEls.push(label);
  });

  // ── Vertex labels (e.g. "1","2","3" for S_3) ──
  // Placed at even boundary points (polygon corners), offset outward.
  if (options.vertexLabels) {
    options.vertexLabels.forEach(function (lbl, vi) {
      var pt  = geo.pts[vi * 2];
      var dx  = pt.x - self._cx, dy = pt.y - self._cy;
      var vtx = svgEl('text', {
        x: (self._cx + dx * 1.18).toFixed(2),
        y: (self._cy + dy * 1.18).toFixed(2),
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': Math.round(fontSize * 1.1), 'font-family': 'Georgia, serif',
        fill: COL.labelDefault, 'pointer-events': 'none', 'font-weight': 'bold'
      });
      vtx.textContent = lbl;
      labelLayer.appendChild(vtx);
    });
  }

  // ── Axis labels ──
  // Two placement strategies:
  //   - dihedral: uniform rule — every label sits just outside the polygon
  //     past ax.p1 (the smaller-index endpoint), at scale 1.2.
  //   - other 2D families (S_3, B_2): edge-midpoint axes get the label
  //     outside past the closer endpoint; vertex-through axes get the label
  //     inside near the smaller-boundary-index vertex.
  if (options.axisLabels) {
    var rMid = self._R * Math.cos(Math.PI / options.n);
    geo.reflAxes.forEach(function (ax, j) {
      var lbl = options.axisLabels[j];
      if (!lbl) return;

      var lx, ly;
      if (options.family === 'dihedral') {
        // Pick the endpoint with the smaller boundary index modulo 2n. This
        // is p1 for j = 0..n-2 and p2 for j = n-1 — so the "f" axis (j=n-1,
        // endpoints at indices n and 0) gets its label at pt 0 (the top).
        var idxA = (j + 1)              % (2 * options.n);
        var idxB = (j + 1 + options.n)  % (2 * options.n);
        var ptD  = (idxA < idxB) ? ax.p1 : ax.p2;
        var scale = 1.2;
        lx = (self._cx + (ptD.x - self._cx) * scale).toFixed(2);
        ly = (self._cy + (ptD.y - self._cy) * scale).toFixed(2);
      } else {
        var d1 = Math.hypot(ax.p1.x - self._cx, ax.p1.y - self._cy);
        var d2 = Math.hypot(ax.p2.x - self._cx, ax.p2.y - self._cy);
        if (Math.min(d1, d2) > (self._R + rMid) / 2) {
          // Vertex-through axis: label inside, near the smaller-index vertex.
          var idx1 = (j + 1)              % (2 * options.n);
          var idx2 = (j + 1 + options.n)  % (2 * options.n);
          var midPt = (idx1 < idx2) ? ax.p1 : ax.p2;
          var scaleIn = 0.84;
          lx = (self._cx + (midPt.x - self._cx) * scaleIn).toFixed(2);
          ly = (self._cy + (midPt.y - self._cy) * scaleIn).toFixed(2);
        } else {
          // Edge-midpoint axis: outside polygon, past the closer endpoint.
          var midPt2 = (d1 < d2) ? ax.p1 : ax.p2;
          var scaleOut = 1.2;
          lx = (self._cx + (midPt2.x - self._cx) * scaleOut).toFixed(2);
          ly = (self._cy + (midPt2.y - self._cy) * scaleOut).toFixed(2);
        }
      }

      var el = svgEl('text', {
        x: lx, y: ly,
        'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-size': Math.max(10, fontSize - 1), 'font-family': 'Georgia, serif',
        fill: COL.axisDefault, 'pointer-events': 'none', visibility: 'hidden'
      });
      applyLabel(el, lbl);
      axisLayer.appendChild(el);
      self._axisLabelEls.push(el);
    });
  }

  container.appendChild(svg);
};

// ── Selection and highlighting ────────────────────────────────────────────────

Visualizer2D.prototype._select = function (chamberIdx) {
  var elemIdx = this._chambers[chamberIdx].elemIdx;
  this._selected = elemIdx;
  this._applyHighlights();
  if (this.onSelect) this.onSelect(elemIdx);
};

// Map from element index → chamber index (inverse of chambers[i].elemIdx)
Visualizer2D.prototype._elemToChamber = function (elemIdx) {
  for (var i = 0; i < this._chambers.length; i++) {
    if (this._chambers[i].elemIdx === elemIdx) return i;
  }
  return -1;
};

Visualizer2D.prototype._applyHighlights = function () {
  var self   = this;
  var G      = this.G;
  var wIdx   = this._selected;

  if (wIdx === null) {
    // Reset everything
    this._chamberEls.forEach(function (el) {
      el.setAttribute('fill', COL.chamberDefault);
      el.setAttribute('stroke', COL.chamberStroke);
      el.setAttribute('stroke-width', '1');
    });
    this._axisEls.forEach(function (el) {
      el.setAttribute('stroke', COL.axisDefault);
    });
    return;
  }

  var hl = computeHighlights(G, wIdx);

  // Colour each chamber
  this._chamberEls.forEach(function (el, i) {
    var eIdx = self._chambers[i].elemIdx;
    var fill, stroke, sw;
    if (hl.blue.has(eIdx)) {
      fill = COL.blueFill; stroke = COL.blue; sw = '2.5';
    } else if (hl.green.has(eIdx)) {
      fill = COL.greenFill; stroke = COL.green; sw = '2';
    } else if (hl.yellow.has(eIdx)) {
      fill = COL.yellowFill; stroke = COL.yellow; sw = '2';
    } else {
      fill = COL.chamberDefault; stroke = COL.chamberStroke; sw = '1';
    }
    el.setAttribute('fill', fill);
    el.setAttribute('stroke', stroke);
    el.setAttribute('stroke-width', sw);
  });

  // Colour reflection axes: red if in inversion set, default otherwise
  var axisSet = G.inversionAxisIndices ? G.inversionAxisIndices(wIdx)
                                       : new Set(G.elements[wIdx].inversionSet);
  this._axisEls.forEach(function (el, j) {
    var red = axisSet.has(j);
    el.setAttribute('stroke',       red ? COL.axisRed : COL.axisDefault);
    el.setAttribute('stroke-width', red ? '4'         : '2');
  });
  this._axisLabelEls.forEach(function (el, j) {
    el.setAttribute('fill', axisSet.has(j) ? COL.axisRed : COL.axisDefault);
  });
};

// ── Hyperplane toggle ─────────────────────────────────────────────────────────

Visualizer2D.prototype.toggleAxes = function () {
  this._showAxes = !this._showAxes;
  var vis = this._showAxes ? 'visible' : 'hidden';
  this._axisEls.forEach(      function (el) { el.setAttribute('visibility', vis); });
  this._axisLabelEls.forEach( function (el) { el.setAttribute('visibility', vis); });
  return this._showAxes;
};

// ── Deselect ──────────────────────────────────────────────────────────────────

Visualizer2D.prototype.deselect = function () {
  this._selected = null;
  this._applyHighlights();
  this._axisEls.forEach(function (el) { el.setAttribute('stroke', COL.axisDefault); });
};

window.Visualizer2D = Visualizer2D;

// ── VisualizerPoint (S_1) ─────────────────────────────────────────────────────
// S_1 has exactly one element (the identity). Draw a single clickable dot.

function VisualizerPoint(container, G) {
  this.G        = G;
  this.onSelect = null;
  var self = this;

  var W = container.clientWidth || 520, H = 200;
  var cx = W / 2, cy = H / 2;
  var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });

  var dot = svgEl('circle', {
    cx: cx, cy: cy, r: 10,
    fill: COL.chamberDefault, stroke: COL.chamberStroke,
    'stroke-width': '2', cursor: 'pointer'
  });
  var label = svgEl('text', {
    x: cx, y: cy + 28, 'text-anchor': 'middle',
    'font-size': '15', 'font-family': 'Georgia, serif', fill: COL.labelDefault
  });
  applyLabel(label, G.elements[0].label);

  dot.addEventListener('click', function () {
    dot.setAttribute('fill', COL.blueFill);
    dot.setAttribute('stroke', COL.blue);
    dot.setAttribute('stroke-width', '3');
    if (self.onSelect) self.onSelect(0);
  });

  svg.appendChild(dot);
  svg.appendChild(label);
  container.appendChild(svg);
}
VisualizerPoint.prototype.toggleAxes = function () { return false; };

// ── VisualizerLine (S_2, B_1) ────────────────────────────────────────────────
// Two chambers: the positive half-line (right) and negative half-line (left).
// The single hyperplane is the origin point.
// Displays: vertex labels at endpoints, chamber labels in each half,
//           and (when toggled) the hyperplane dot + its reflection label.

function VisualizerLine(container, G, opts) {
  this.G         = G;
  this.onSelect  = null;
  this._selected = null;
  this._showAxes = false;
  opts = opts || {};

  // Which element is on which side?
  var rightIdx = 0, leftIdx = 1;
  G.elements.forEach(function (e, i) {
    if (e.matrix[0] > 0) rightIdx = i; else leftIdx = i;
  });
  this._rightIdx = rightIdx;
  this._leftIdx  = leftIdx;

  // Derive the hyperplane label from the non-identity element's inversion set
  // (leftIdx has exactly one reflection in its inversion set)
  var hypLabel = '';
  var inv0 = G.elements[leftIdx].inversionSet;
  if (inv0.length > 0) {
    var r = inv0[0];
    hypLabel = (r.label !== undefined) ? r.label : ('' + r.i + r.j);
  }

  var W = container.clientWidth || 520, H = 180;
  var cx = W / 2, cy = H / 2;
  var half = W * 0.35;
  var x1 = cx - half, x2 = cx + half;
  var self = this;

  var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H });

  // Half-line segments
  var leftSeg  = svgEl('line', { x1: x1, y1: cy, x2: cx, y2: cy,
    stroke: COL.chamberStroke, 'stroke-width': '6', 'stroke-linecap': 'round', cursor: 'pointer' });
  var rightSeg = svgEl('line', { x1: cx, y1: cy, x2: x2, y2: cy,
    stroke: COL.chamberStroke, 'stroke-width': '6', 'stroke-linecap': 'round', cursor: 'pointer' });

  // Endpoint caps
  svg.appendChild(svgEl('circle', { cx: x1, cy: cy, r: 5, fill: COL.chamberStroke }));
  svg.appendChild(svgEl('circle', { cx: x2, cy: cy, r: 5, fill: COL.chamberStroke }));

  // Origin hyperplane dot (toggled)
  var originDot = svgEl('circle', { cx: cx, cy: cy, r: 7,
    fill: 'white', stroke: COL.axisDefault, 'stroke-width': '2.5', visibility: 'hidden' });
  this._originDot = originDot;

  // Vertex labels above each endpoint
  var leftVtx  = svgEl('text', { x: x1, y: cy - 20, 'text-anchor': 'middle',
    'font-size': '15', 'font-family': 'Georgia, serif', fill: COL.labelDefault });
  var rightVtx = svgEl('text', { x: x2, y: cy - 20, 'text-anchor': 'middle',
    'font-size': '15', 'font-family': 'Georgia, serif', fill: COL.labelDefault });
  if (opts.leftLabel)  leftVtx.textContent  = opts.leftLabel;
  else                 applyLabel(leftVtx,  G.elements[leftIdx].label);
  if (opts.rightLabel) rightVtx.textContent = opts.rightLabel;
  else                 applyLabel(rightVtx, G.elements[rightIdx].label);

  // Chamber labels in the middle of each half (element names)
  var leftChamberLbl  = svgEl('text', { x: (x1 + cx) / 2, y: cy + 28, 'text-anchor': 'middle',
    'font-size': '14', 'font-family': 'Georgia, serif', fill: COL.labelDefault });
  var rightChamberLbl = svgEl('text', { x: (cx + x2) / 2, y: cy + 28, 'text-anchor': 'middle',
    'font-size': '14', 'font-family': 'Georgia, serif', fill: COL.labelDefault });
  applyLabel(leftChamberLbl,  G.elements[leftIdx].label);
  applyLabel(rightChamberLbl, G.elements[rightIdx].label);
  this._leftChamberLbl  = leftChamberLbl;
  this._rightChamberLbl = rightChamberLbl;

  // Hyperplane label at the origin (toggled with the dot)
  var hypLbl = svgEl('text', { x: cx, y: cy - 20, 'text-anchor': 'middle',
    'font-size': '14', 'font-family': 'Georgia, serif',
    fill: COL.axisDefault, visibility: 'hidden' });
  hypLbl.textContent = hypLabel;
  this._hypLbl = hypLbl;

  // Invisible hit areas
  var leftHit  = svgEl('rect', { x: x1, y: cy - 22, width: half, height: 44,
    fill: 'transparent', cursor: 'pointer' });
  var rightHit = svgEl('rect', { x: cx,  y: cy - 22, width: half, height: 44,
    fill: 'transparent', cursor: 'pointer' });
  leftHit.addEventListener( 'click', function () { self._select(leftIdx);  });
  rightHit.addEventListener('click', function () { self._select(rightIdx); });

  svg.appendChild(leftSeg);  svg.appendChild(rightSeg);
  svg.appendChild(originDot);
  svg.appendChild(leftVtx);  svg.appendChild(rightVtx);
  svg.appendChild(leftChamberLbl); svg.appendChild(rightChamberLbl);
  svg.appendChild(hypLbl);
  svg.appendChild(leftHit);  svg.appendChild(rightHit);
  container.appendChild(svg);

  this._leftSeg  = leftSeg;
  this._rightSeg = rightSeg;
}

VisualizerLine.prototype._select = function (elemIdx) {
  this._selected = elemIdx;
  this._applyHighlights();
  if (this.onSelect) this.onSelect(elemIdx);
};

VisualizerLine.prototype._applyHighlights = function () {
  var G    = this.G;
  var wIdx = this._selected;
  if (wIdx === null) {
    this._leftSeg.setAttribute( 'stroke', COL.chamberStroke);
    this._rightSeg.setAttribute('stroke', COL.chamberStroke);
    return;
  }

  var hl   = computeHighlights(G, wIdx);
  var pick = function (idx) {
    if (hl.blue.has(idx))   return COL.blue;
    if (hl.green.has(idx))  return COL.green;
    if (hl.yellow.has(idx)) return COL.yellow;
    return COL.chamberStroke;
  };

  this._leftSeg.setAttribute( 'stroke', pick(this._leftIdx));
  this._rightSeg.setAttribute('stroke', pick(this._rightIdx));

  // Origin dot and hyperplane label: red if the current element inverts this hyperplane
  var red = G.elements[wIdx].inversionSet.length > 0;
  var hypCol = red ? COL.axisRed : COL.axisDefault;
  this._originDot.setAttribute('stroke',       hypCol);
  this._originDot.setAttribute('stroke-width', red ? '4' : '2.5');
  this._hypLbl.setAttribute('fill', hypCol);
};

VisualizerLine.prototype.toggleAxes = function () {
  this._showAxes = !this._showAxes;
  var vis = this._showAxes ? 'visible' : 'hidden';
  this._originDot.setAttribute('visibility', vis);
  this._hypLbl.setAttribute(   'visibility', vis);
  return this._showAxes;
};

window.VisualizerPoint = VisualizerPoint;
window.VisualizerLine  = VisualizerLine;

})();
