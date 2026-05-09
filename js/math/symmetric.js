(function () {
'use strict';

// ── Permutation helpers ───────────────────────────────────────────────────────

function allPerms(n) {
  if (n === 1) return [[1]];
  var result = [];
  function build(arr, rest) {
    if (rest.length === 0) { result.push(arr.slice()); return; }
    for (var i = 0; i < rest.length; i++) {
      arr.push(rest[i]);
      build(arr, rest.filter(function (_, j) { return j !== i; }));
      arr.pop();
    }
  }
  build([], Array.from({length: n}, function (_, i) { return i + 1; }));
  return result;
}

// Apply permutation sigma to a vector in ℝ^n (0-indexed array)
function applyPerm(sigma, vec) {
  var result = new Array(sigma.length).fill(0);
  for (var j = 0; j < sigma.length; j++) result[sigma[j] - 1] += vec[j];
  return result;
}

// ── Basis for the hyperplane Σx_i = 0 ────────────────────────────────────────
// Returns (n-1) row vectors, each in ℝ^n, forming an orthonormal basis.

function buildBasis(n) {
  if (n <= 1) return [[1]];
  if (n === 2) return [[Math.SQRT1_2, -Math.SQRT1_2]];
  var rows = [];
  for (var k = 0; k < n - 1; k++) {
    var row  = new Array(n).fill(0);
    var norm = Math.sqrt((k + 1) * (k + 2));
    for (var j = 0; j <= k; j++) row[j] = 1 / norm;
    row[k + 1] = -(k + 1) / norm;
    rows.push(row);
  }
  return rows;
}

// Project n×n permutation matrix onto the (n-1)-dim subspace, giving a (dim×dim) matrix.
function permMatrix(sigma, basis, dim) {
  if (sigma.length === 1) return [1]; // S_1
  var n   = sigma.length;
  var mat = [];
  for (var i = 0; i < dim; i++) {
    for (var j = 0; j < dim; j++) {
      var bj      = basis[j];
      var sigmaBj = applyPerm(sigma, bj);
      var dot     = 0;
      for (var k = 0; k < n; k++) dot += basis[i][k] * sigmaBj[k];
      mat.push(dot);
    }
  }
  return mat;
}

// ── Inversions and length ─────────────────────────────────────────────────────
// Inv(σ) = { (i,j) : i < j, σ⁻¹(i) > σ⁻¹(j) }
// i.e. value i appears after value j in the one-line notation.
// This matches the Coxeter inversion set: (i,j) ∈ Inv(σ) iff
// the transposition t_{ij} satisfies ℓ(t_{ij}·σ) < ℓ(σ).

function inversions(sigma) {
  var n = sigma.length;
  // pos[v] = 0-based position of value v in sigma
  var pos = new Array(n + 1);
  for (var k = 0; k < n; k++) pos[sigma[k]] = k;

  var inv = [];
  for (var i = 1; i <= n; i++)
    for (var j = i + 1; j <= n; j++)
      if (pos[i] > pos[j])
        inv.push({ i: i, j: j });
  return inv;
}

// ── Bruhat order criterion ────────────────────────────────────────────────────
function bruhatLeq(u, w) {
  var n = u.length;
  for (var q = 1; q <= n; q++) {
    for (var p = 1; p < n; p++) {
      var cu = 0, cw = 0;
      for (var i = 0; i < q; i++) {
        if (u[i] <= p) cu++;
        if (w[i] <= p) cw++;
      }
      if (cu < cw) return false;
    }
  }
  return true;
}

// ── Constructor ───────────────────────────────────────────────────────────────

function SymmetricGroup(n) {
  this.n     = n;
  this.dim   = Math.max(1, n - 1);
  var basis  = buildBasis(n);
  var dim    = this.dim;
  this.elements = allPerms(n).map(function (sigma) {
    return {
      sigma:  sigma,
      label:  sigma.join(''),
      matrix: permMatrix(sigma, basis, dim)
    };
  });
}

SymmetricGroup.prototype.build = function () {
  var elems = this.elements;

  // Lengths and inversion sets
  elems.forEach(function (e) {
    e.inversionSet = inversions(e.sigma);
    e.length       = e.inversionSet.length;
  });

  // Bruhat order for S_n: u ≤ w iff for all p in {1..n-1}, q in {1..n}:
  //   |{i ≤ q : u(i) ≤ p}| ≥ |{i ≤ q : w(i) ≤ p}|
  elems.forEach(function (w) {
    w.bruhatInterval = [];
    elems.forEach(function (v, vIdx) {
      if (bruhatLeq(v.sigma, w.sigma)) w.bruhatInterval.push(vIdx);
    });
    w.bruhatInterval.sort(function (a, b) { return elems[a].length - elems[b].length; });
  });

  return this;
};

// ── Inversion axis indices ────────────────────────────────────────────────────
// Transposition (a,b) maps to axis index = its position in lexicographic order
// over all pairs a<b.  This matches the axis ordering in buildPolygonChambers.

SymmetricGroup.prototype.inversionAxisIndices = function (wIdx) {
  var n   = this.n;
  var inv = this.elements[wIdx].inversionSet;
  var axes = new Set();
  inv.forEach(function (p) {
    var j = 0;
    outer: for (var a = 1; a <= n; a++)
      for (var b = a + 1; b <= n; b++) {
        if (a === p.i && b === p.j) { axes.add(j); break outer; }
        j++;
      }
  });
  return axes;
};

// ── Chamber sector assignment ─────────────────────────────────────────────────
// Explicit geometric rule (used in place of matrix-based computation):
//   Element ijk occupies the sector at vertex i on the edge-ij side.
// Vertices are drawn at even boundary points: V_m at pt 2*(m-1).
// Counterclockwise vertex order: 1 → 2 → 3 → ... → n → 1.
// If j follows i counterclockwise ((j-i+n)%n == 1): sector = 2*(i-1)
// Otherwise (j precedes i):                         sector = 2*(j-1)+1

SymmetricGroup.prototype.sectorAssignment = function (n_poly) {
  var n      = this.n;
  var elems  = this.elements;
  var result = new Array(2 * n_poly);
  elems.forEach(function (elem, idx) {
    var i = elem.sigma[0], j = elem.sigma[1];
    var sector = ((j - i + n) % n === 1) ? 2 * (i - 1) : 2 * (j - 1) + 1;
    result[sector] = idx;
  });
  return result;
};

// ── Green elements ────────────────────────────────────────────────────────────
// t*(i,j) applied to σ: swap values i and j in σ's image.
// (t·σ)(k) = t(σ(k))  where t swaps values i↔j.

SymmetricGroup.prototype.greenElements = function (wIdx) {
  var elems = this.elements;
  var w     = elems[wIdx];
  var green = new Set();

  w.inversionSet.forEach(function (p) {
    var i = p.i, j = p.j;
    var newSigma = w.sigma.map(function (v) {
      return v === i ? j : v === j ? i : v;
    });
    var key = newSigma.join(',');
    for (var k = 0; k < elems.length; k++) {
      if (elems[k].sigma.join(',') === key) { green.add(k); break; }
    }
  });
  return green;
};

// ── Exact matrix-entry strings ────────────────────────────────────────────────
// S_n matrices have entries built from 1/√(k(k+1)) for small k.

var SN_EXACT = (function () {
  var EPS = 1e-9;
  var table = [
    [ 1, '1' ], [-1, '-1' ], [ 0, '0' ],
    [ 0.5,              '\\tfrac{1}{2}'             ],
    [-0.5,             '-\\tfrac{1}{2}'             ],
    [ Math.SQRT1_2,     '\\tfrac{1}{\\sqrt{2}}'     ],
    [-Math.SQRT1_2,    '-\\tfrac{1}{\\sqrt{2}}'     ],
    [ Math.sqrt(1/6),   '\\tfrac{1}{\\sqrt{6}}'     ],
    [-Math.sqrt(1/6),  '-\\tfrac{1}{\\sqrt{6}}'     ],
    [ Math.sqrt(2/3),   '\\tfrac{\\sqrt{2}}{\\sqrt{3}}' ],
    [-Math.sqrt(2/3),  '-\\tfrac{\\sqrt{2}}{\\sqrt{3}}' ],
    [ 1/Math.sqrt(3),   '\\tfrac{1}{\\sqrt{3}}'     ],
    [-1/Math.sqrt(3),  '-\\tfrac{1}{\\sqrt{3}}'     ],
    [ Math.sqrt(3)/2,   '\\tfrac{\\sqrt{3}}{2}'     ],
    [-Math.sqrt(3)/2,  '-\\tfrac{\\sqrt{3}}{2}'     ],
    [ 2/Math.sqrt(6),   '\\tfrac{2}{\\sqrt{6}}'     ],
    [-2/Math.sqrt(6),  '-\\tfrac{2}{\\sqrt{6}}'     ],
  ];
  return function (v) {
    for (var i = 0; i < table.length; i++)
      if (Math.abs(v - table[i][0]) < EPS) return table[i][1];
    return v.toFixed(4);
  };
})();

SymmetricGroup.prototype.matrixStrings = function (elemIdx) {
  return this.elements[elemIdx].matrix.map(SN_EXACT);
};

// ── Verification helper ───────────────────────────────────────────────────────

SymmetricGroup.verify = function (n) {
  var G = new SymmetricGroup(n).build();
  console.group('S_' + n + ' (' + G.elements.length + ' elements)');
  G.elements.forEach(function (e) {
    var inv = e.inversionSet.map(function (p) { return '(' + p.i + p.j + ')'; }).join('') || '∅';
    var bru = e.bruhatInterval.map(function (j) { return G.elements[j].label; }).join(' ');
    console.log(e.label, '  len=' + e.length, '  inv=' + inv, '  [e,w]={' + bru + '}');
  });
  console.groupEnd();
};

window.SymmetricGroup = SymmetricGroup;

})();
