(function () {
'use strict';

// ── KaTeX rendering helpers ───────────────────────────────────────────────────

function renderKaTeX(latex) {
  return katex.renderToString(latex, { throwOnError: false, displayMode: false });
}

function renderKaTeXDisplay(latex) {
  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
}

// Build a KaTeX matrix string from an array of entry strings and dimension.
function matrixLatex(entries, dim) {
  var rows = [];
  for (var i = 0; i < dim; i++) {
    var row = [];
    for (var j = 0; j < dim; j++) row.push(entries[i * dim + j]);
    rows.push(row.join(' & '));
  }
  return '\\begin{pmatrix} ' + rows.join(' \\\\ ') + ' \\end{pmatrix}';
}

// Render a group element label as KaTeX.
// D_n: stored as "e", "r", "r^{2}", "f", "rf", "r^{3}f" → already valid LaTeX.
// S_n: stored as "3412" → render as plain text in math mode.
// B_n: stored as "\\overline{1}2" → already valid LaTeX.
function elemLabelLatex(label) {
  // Check if it's a plain permutation string (only digits)
  if (/^[0-9]+$/.test(label)) return label; // S_n: plain digits, no KaTeX needed
  return label; // D_n and B_n labels are already valid LaTeX
}

// ── Inversion set label for KaTeX ────────────────────────────────────────────

function inversionSetLatex(G, wIdx, family) {
  var invSet = G.elements[wIdx].inversionSet;
  if (invSet.length === 0) return '\\emptyset';

  if (family === 'dihedral') {
    return invSet.map(function (k) { return G.reflections[k].label; }).join(', ');
  }
  if (family === 'symmetric') {
    return invSet.map(function (p) { return '' + p.i + p.j; }).join(', ');
  }
  if (family === 'hyperoctahedral') {
    return invSet.map(function (r) { return r.label; }).join(', ');
  }
  if (family === 'icosahedral') {
    return invSet.map(function (r) { return r.label; }).join(', ');
  }
  return '';
}

// ── Bruhat interval list for KaTeX ───────────────────────────────────────────

function bruhatIntervalLatex(G, wIdx, family) {
  return G.elements[wIdx].bruhatInterval.map(function (idx) {
    return G.elements[idx].label;
  }).join(', ');
}

// ── Info column population ────────────────────────────────────────────────────

function populateInfoColumn(G, elemIdx, config) {
  var elem   = G.elements[elemIdx];
  var family = config.family;
  var dim    = (family === 'dihedral') ? 2 :
               (family === 'symmetric') ? Math.max(1, config.n - 1) :
               (family === 'icosahedral') ? 3 :
               config.n; // hyperoctahedral

  // Element label
  var labelEl = document.getElementById('info-element');
  labelEl.innerHTML = renderKaTeX(elemLabelLatex(elem.label));

  // Matrix
  var matEl = document.getElementById('info-matrix');
  var matStr = G.matrixStrings(elemIdx);
  matEl.innerHTML = renderKaTeXDisplay(matrixLatex(matStr, dim));

  // Length
  document.getElementById('info-length').textContent = elem.length;

  // Inversion arrangement
  var invEl = document.getElementById('info-inversions');
  invEl.innerHTML = renderKaTeX(inversionSetLatex(G, elemIdx, family));

  // Bruhat interval (scrollable list)
  var bruhatEl = document.getElementById('info-bruhat');
  bruhatEl.innerHTML = renderKaTeX(bruhatIntervalLatex(G, elemIdx, family));
}

// ── Page header population ────────────────────────────────────────────────────

function populateHeader(config) {
  // Group name
  document.getElementById('group-name').innerHTML =
    renderKaTeX(config.name);
  document.title =
    config.name.replace(/[_{}]/g, '') + ' | Geometric Representations of Finite Coxeter Groups';

  // Subtitle
  document.getElementById('group-subtitle').textContent =
    'corresponding to the reflective chambers of a ' + config.polytope;

  // Isomorphisms (iso.id === null → render label without a link)
  var isoEl = document.getElementById('group-iso');
  if (config.iso && config.iso.length > 0) {
    var links = config.iso.map(function (iso) {
      if (iso.id === null) return renderKaTeX(iso.label);
      return '<a href="group.html?g=' + iso.id + '">' + renderKaTeX(iso.label) + '</a>';
    }).join(', ');
    isoEl.innerHTML = 'Isomorphic to: ' + links;
  } else {
    isoEl.textContent = '';
  }
}

// ── Hyperplane toggle button ──────────────────────────────────────────────────

function setupToggleButton(btn, viz) {
  btn.disabled = true; // greyed out until a chamber is clicked
  btn.addEventListener('click', function () {
    var on = viz.toggleAxes();
    btn.textContent = on ? 'Hide Hyperplanes' : 'Show Hyperplanes';
    btn.classList.toggle('active', on);
  });
}

// ── Info panel slide-in ───────────────────────────────────────────────────────

var infoPanelShown = false;

function showInfoPanel() {
  if (infoPanelShown) return;
  infoPanelShown = true;
  var panel = document.getElementById('info-panel');
  panel.classList.add('visible');
  document.getElementById('info-empty').style.display = 'none';
  document.getElementById('info-content').style.display = 'block';
}

// ── Main entry point ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  // Read group ID from URL parameter
  var params  = new URLSearchParams(window.location.search);
  var groupId = params.get('g');
  if (!groupId || !GROUPS[groupId]) {
    document.getElementById('group-name').textContent = 'Unknown group';
    return;
  }

  var config = GROUPS[groupId];
  var n      = config.n;

  // Instantiate the math group
  var G;
  if (config.family === 'dihedral') {
    G = new DihedralGroup(n).build();
  } else if (config.family === 'symmetric') {
    G = new SymmetricGroup(n).build();
  } else if (config.family === 'icosahedral') {
    G = new IcosahedralGroup().build();
  } else {
    G = new HyperoctahedralGroup(n).build();
  }

  // Populate header
  populateHeader(config);

  // Create visualizer
  var vizContainer = document.getElementById('visualizer');
  vizContainer.innerHTML = ''; // clear placeholder text

  var viz;
  // n_poly = number of sides of the polygon = number of reflection axes = |G|/2
  var n_poly = G.elements.length / 2;

  if (config.family === 'dihedral') {
    // Axis labels mirror the reflection-element labels (f, rf, r^{2}f, ...).
    var dAxisLabels = G.reflections.map(function (r) { return r.label; });
    viz = new Visualizer2D(vizContainer, G, {
      family: 'dihedral', n: n_poly,
      axisLabels: dAxisLabels
    });
  } else if (config.family === 'symmetric' && n === 3) {
    var sVertexLabels = Array.from({length: n}, function (_, i) { return String(i + 1); });
    var sAxisLabels = [];
    for (var a = 1; a <= n; a++)
      for (var b = a + 1; b <= n; b++)
        sAxisLabels.push('' + a + b);
    viz = new Visualizer2D(vizContainer, G, {
      family: 'symmetric', n: n_poly,
      vertexLabels: sVertexLabels,
      axisLabels:   sAxisLabels
    });
  } else if (config.family === 'symmetric' && n === 4) {
    // S_4: 3D tetrahedron
    viz = new Visualizer3D(vizContainer, G, { family: 'symmetric', n: n });
  } else if (config.family === 'hyperoctahedral' && n === 3 && config.polytope === 'octahedron') {
    // B_3 visualised as the octahedron
    viz = new Visualizer3DOctahedron(vizContainer, G, { family: 'hyperoctahedral', n: n });
  } else if (config.family === 'hyperoctahedral' && n === 3 && config.polytope === 'cube') {
    // B_3 visualised as the cube
    viz = new Visualizer3DCube(vizContainer, G, { family: 'hyperoctahedral', n: n });
  } else if (config.family === 'icosahedral' && config.polytope === 'icosahedron') {
    // H_3 visualised as the icosahedron
    viz = new Visualizer3DIcosahedron(vizContainer, G, { family: 'icosahedral' });
  } else if (config.family === 'icosahedral' && config.polytope === 'dodecahedron') {
    // H_3 visualised as the dual dodecahedron
    viz = new Visualizer3DDodecahedron(vizContainer, G, { family: 'icosahedral' });
  } else if (config.family === 'hyperoctahedral' && n === 2) {
    // B_2 cross-polytope: vertices ±1, ±2 in CCW order +1, +2, −1, −2
    viz = new Visualizer2D(vizContainer, G, {
      family: 'hyperoctahedral', n: n_poly,
      vertexLabels: ['1', '2', '-1', '-2'],
      // Axis labels for j=0,1,2,3 (drawn at math 135°, 0°, 45°, 90°)
      axisLabels:   ['12', '11', '21', '22']
    });
  } else if (G.elements.length === 1) {
    // S_1: single point
    viz = new VisualizerPoint(vizContainer, G);
  } else if (G.elements.length === 2) {
    // S_2 or B_1: line segment — pass vertex labels for the two endpoints
    var lineOpts;
    if (config.family === 'symmetric') {
      lineOpts = { rightLabel: '1', leftLabel: '2' };   // vertices of 1-simplex
    } else {
      lineOpts = { rightLabel: '1', leftLabel: '-1' };  // ±1 vectors of B_1
    }
    viz = new VisualizerLine(vizContainer, G, lineOpts);
  } else {
    vizContainer.innerHTML = '<div class="visualizer-placeholder">Visualizer coming soon.</div>';
    return;
  }

  // Wire up toggle button
  var btn = document.getElementById('btn-hyperplanes');
  setupToggleButton(btn, viz);

  // Wire up chamber selection → info column
  viz.onSelect = function (elemIdx) {
    showInfoPanel();
    btn.disabled = false;
    populateInfoColumn(G, elemIdx, config);
  };
});

})();
