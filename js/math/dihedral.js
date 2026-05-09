(function () {
'use strict';

// ── Matrix helpers ────────────────────────────────────────────────────────────

function matMul(A, B) {
  return [
    A[0]*B[0] + A[1]*B[2],  A[0]*B[1] + A[1]*B[3],
    A[2]*B[0] + A[3]*B[2],  A[2]*B[1] + A[3]*B[3]
  ];
}

function matEq(A, B) {
  var EPS = 1e-9;
  return Math.abs(A[0]-B[0]) < EPS && Math.abs(A[1]-B[1]) < EPS &&
         Math.abs(A[2]-B[2]) < EPS && Math.abs(A[3]-B[3]) < EPS;
}

function rotMat(theta) {
  var c = Math.cos(theta), s = Math.sin(theta);
  return [c, -s, s, c];
}

// Reflection across line through origin at angle theta
function reflMat(theta) {
  var c = Math.cos(2*theta), s = Math.sin(2*theta);
  return [c, s, s, -c];
}

// ── Element construction ──────────────────────────────────────────────────────
// D_n has 2n elements:
//   Rotations    e, r, r^2, ..., r^{n-1}     where r = rotation by 2π/n
//   Reflections  f, rf, r^2 f, ..., r^{n-1} f
// where f = reflection across the x-axis (angle 0), and r^j f reflects across
// the axis at angle jπ/n (since R(α)·Refl(θ) = Refl(θ + α/2)).
//
// Internal storage order matches the original geometry:
//   reflections[k]  (k = 0..n-1) is the reflection with axis at angle (k+1)π/n,
//   i.e. labelled  r^{k+1} f  when k < n-1, and  f  when k = n-1
//   (since r^n f = Refl(π) = Refl(0) = f).

function rotLabel(k) {
  if (k === 0) return 'e';
  if (k === 1) return 'r';
  return 'r^{' + k + '}';
}

// k = 1..n; matches the original f_k axis-angle convention (axis at kπ/n).
function refLabel(k, n) {
  if (k === n) return 'f';            // Refl(π) = Refl(0) = r^0 f
  if (k === 1) return 'rf';
  return 'r^{' + k + '}f';
}

function buildElements(n) {
  var elems = [];
  for (var k = 0; k < n; k++) {
    elems.push({
      type:   'rotation',
      k:      k,
      label:  rotLabel(k),
      matrix: rotMat(2 * Math.PI * k / n)
    });
  }
  for (var k = 1; k <= n; k++) {
    elems.push({
      type:   'reflection',
      k:      k,
      label:  refLabel(k, n),
      matrix: reflMat(Math.PI * k / n)
    });
  }
  return elems;
}

function buildReflections(n) {
  var refs = [];
  for (var k = 1; k <= n; k++) {
    refs.push({ label: refLabel(k, n), matrix: reflMat(Math.PI * k / n) });
  }
  return refs;
}

// ── Constructor ───────────────────────────────────────────────────────────────

function DihedralGroup(n) {
  this.n           = n;
  this.elements    = buildElements(n);
  this.reflections = buildReflections(n);
}

// ── Coxeter length via BFS ────────────────────────────────────────────────────
// Simple generators: s1 = f (axis angle 0), s2 = rf (axis angle π/n).

DihedralGroup.prototype.computeLengths = function () {
  var elems = this.elements;
  var n     = this.n;
  var s1    = reflMat(0);
  var s2    = reflMat(Math.PI / n);
  var lens  = new Array(elems.length).fill(-1);
  lens[0]   = 0;               // r_0 = identity
  var queue = [0];

  while (queue.length > 0) {
    var idx    = queue.shift();
    var mat    = elems[idx].matrix;
    var newLen = lens[idx] + 1;
    [s1, s2].forEach(function (smat) {
      var prod = matMul(smat, mat);
      for (var j = 0; j < elems.length; j++) {
        if (lens[j] === -1 && matEq(prod, elems[j].matrix)) {
          lens[j] = newLen;
          queue.push(j);
          break;
        }
      }
    });
  }

  for (var i = 0; i < elems.length; i++) elems[i].length = lens[i];
};

// ── Inversion set ─────────────────────────────────────────────────────────────
// reflection t ∈ Inv(g) iff ℓ(t · g) < ℓ(g).

DihedralGroup.prototype.computeInversions = function () {
  var elems = this.elements;
  var refs  = this.reflections;

  elems.forEach(function (g) {
    var inv = [];
    refs.forEach(function (ref, k) {
      var prod    = matMul(ref.matrix, g.matrix);
      var prodLen = -1;
      for (var j = 0; j < elems.length; j++) {
        if (matEq(prod, elems[j].matrix)) { prodLen = elems[j].length; break; }
      }
      if (prodLen < g.length) inv.push(k);
    });
    g.inversionSet = inv; // array of indices into this.reflections
  });
};

// ── Bruhat interval ───────────────────────────────────────────────────────────
// Correct Bruhat order (not weak order):
//   [e, w] = {w} ∪ ⋃{ [e, t·w] : t reflection, ℓ(t·w) < ℓ(w) }
// Computed bottom-up in order of increasing length.

DihedralGroup.prototype.computeBruhatIntervals = function () {
  var elems = this.elements;
  var refs  = this.reflections;

  // Process elements in order of increasing length
  var order = elems.map(function (_, i) { return i; })
    .sort(function (a, b) { return elems[a].length - elems[b].length; });

  var intSets = elems.map(function (_, i) { var s = new Set(); s.add(i); return s; });

  order.forEach(function (i) {
    var w = elems[i];
    refs.forEach(function (ref) {
      var tw = matMul(ref.matrix, w.matrix);
      for (var j = 0; j < elems.length; j++) {
        if (matEq(tw, elems[j].matrix)) {
          if (elems[j].length < w.length) {
            intSets[j].forEach(function (k) { intSets[i].add(k); });
          }
          break;
        }
      }
    });
  });

  elems.forEach(function (w, i) {
    w.bruhatInterval = Array.from(intSets[i])
      .sort(function (a, b) { return elems[a].length - elems[b].length; });
  });
};

DihedralGroup.prototype.build = function () {
  this.computeLengths();
  this.computeInversions();
  this.computeBruhatIntervals();
  return this;
};

// ── Exact matrix-entry strings ────────────────────────────────────────────────
// Stores decimal values internally; returns KaTeX strings for display.

var EXACT = (function () {
  var S2 = Math.SQRT2 / 2;
  var S3 = Math.sqrt(3) / 2;
  var S5 = Math.sqrt(5);
  var table = [
    [ 1,   '1'  ], [-1,  '-1' ], [ 0, '0' ],
    [ 0.5, '\\tfrac{1}{2}' ], [-0.5, '-\\tfrac{1}{2}' ],
    [ S2,  '\\tfrac{\\sqrt{2}}{2}' ], [-S2, '-\\tfrac{\\sqrt{2}}{2}' ],
    [ S3,  '\\tfrac{\\sqrt{3}}{2}' ], [-S3, '-\\tfrac{\\sqrt{3}}{2}' ],
    // n=5
    [ (S5-1)/4,  '\\tfrac{\\sqrt{5}-1}{4}' ], [-(S5-1)/4, '-\\tfrac{\\sqrt{5}-1}{4}' ],
    [ (S5+1)/4,  '\\tfrac{\\sqrt{5}+1}{4}' ], [-(S5+1)/4, '-\\tfrac{\\sqrt{5}+1}{4}' ],
    [ Math.sqrt(10+2*S5)/4,  '\\tfrac{\\sqrt{10+2\\sqrt{5}}}{4}' ],
    [-Math.sqrt(10+2*S5)/4, '-\\tfrac{\\sqrt{10+2\\sqrt{5}}}{4}' ],
    [ Math.sqrt(10-2*S5)/4,  '\\tfrac{\\sqrt{10-2\\sqrt{5}}}{4}' ],
    [-Math.sqrt(10-2*S5)/4, '-\\tfrac{\\sqrt{10-2\\sqrt{5}}}{4}' ],
    // n=8
    [ Math.sqrt(2+Math.SQRT2)/2,  '\\tfrac{\\sqrt{2+\\sqrt{2}}}{2}' ],
    [-Math.sqrt(2+Math.SQRT2)/2, '-\\tfrac{\\sqrt{2+\\sqrt{2}}}{2}' ],
    [ Math.sqrt(2-Math.SQRT2)/2,  '\\tfrac{\\sqrt{2-\\sqrt{2}}}{2}' ],
    [-Math.sqrt(2-Math.SQRT2)/2, '-\\tfrac{\\sqrt{2-\\sqrt{2}}}{2}' ],
  ];
  var EPS = 1e-9;
  return function (v) {
    for (var i = 0; i < table.length; i++) {
      if (Math.abs(v - table[i][0]) < EPS) return table[i][1];
    }
    return null; // caller will use trig fallback
  };
})();

DihedralGroup.prototype.matrixStrings = function (elemIdx) {
  var n   = this.n;
  var mat = this.elements[elemIdx].matrix;
  return mat.map(function (v) {
    var s = EXACT(v);
    if (s !== null) return s;
    // Trig fallback for n=7 and other irrationals
    var EPS = 1e-9;
    for (var m = 0; m <= 2*n; m++) {
      if (Math.abs(v - Math.cos(m*Math.PI/n)) < EPS)
        return m === 0 ? '1' : (m === n ? '-1' : '\\cos\\tfrac{' + m + '\\pi}{' + n + '}');
      if (Math.abs(v - Math.sin(m*Math.PI/n)) < EPS)
        return m === 0 ? '0' : '\\sin\\tfrac{' + m + '\\pi}{' + n + '}';
      if (Math.abs(v + Math.cos(m*Math.PI/n)) < EPS)
        return m === 0 ? '-1' : '-\\cos\\tfrac{' + m + '\\pi}{' + n + '}';
      if (Math.abs(v + Math.sin(m*Math.PI/n)) < EPS)
        return m === 0 ? '0' : '-\\sin\\tfrac{' + m + '\\pi}{' + n + '}';
    }
    return v.toFixed(4);
  });
};

// ── Chamber sector assignment ─────────────────────────────────────────────────
// Even sectors hold the n rotations  (rotation k in sector 2k);
// odd sectors hold the n reflections (reflections[k] in sector 2k+1).

DihedralGroup.prototype.sectorAssignment = function (n_poly) {
  var n = this.n;
  var result = new Array(2 * n);
  for (var k = 0; k < 2 * n; k++) {
    result[k] = (k % 2 === 0) ? (k / 2) : (n + Math.floor(k / 2));
  }
  return result;
};

// ── Inversion axis indices (for hyperplane highlighting) ──────────────────────
// Returns a Set of axis indices 0..n-1 that should be drawn red.
// For D_n these directly match inversionSet indices.

DihedralGroup.prototype.inversionAxisIndices = function (wIdx) {
  return new Set(this.elements[wIdx].inversionSet);
};

// ── Green elements ────────────────────────────────────────────────────────────
// Returns a Set of element indices {t·w : t ∈ Inv(w)}.
// Note: reflections can decrease length by 1, 3, 5, ... so we must actually
// compute t·w rather than assuming they all land at length ℓ(w)−1.

DihedralGroup.prototype.greenElements = function (wIdx) {
  var elems = this.elements;
  var refs  = this.reflections;
  var w     = elems[wIdx];
  var green = new Set();

  w.inversionSet.forEach(function (k) {
    var tw = matMul(refs[k].matrix, w.matrix);
    for (var j = 0; j < elems.length; j++) {
      if (matEq(tw, elems[j].matrix)) { green.add(j); break; }
    }
  });
  return green;
};

// ── Verification helper ───────────────────────────────────────────────────────

DihedralGroup.verify = function (n) {
  var G = new DihedralGroup(n).build();
  console.group('D_' + n + ' (' + G.elements.length + ' elements)');
  G.elements.forEach(function (e) {
    var inv = e.inversionSet.map(function (k) { return G.reflections[k].label; }).join(', ') || '∅';
    var bru = e.bruhatInterval.map(function (j) { return G.elements[j].label; }).join(', ');
    console.log(e.label, '  len=' + e.length, '  inv={' + inv + '}', '  [e,w]={' + bru + '}');
  });
  console.groupEnd();
};

window.DihedralGroup = DihedralGroup;

})();
