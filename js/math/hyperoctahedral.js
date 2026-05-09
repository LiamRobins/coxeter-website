(function () {
'use strict';

// ── Element construction ──────────────────────────────────────────────────────
// B_n = signed permutations of {1,...,n}, order 2^n · n!
// An element is (sigma, eps): sigma ∈ S_n, eps ∈ {±1}^n.
// Action: w(e_i) = eps[i-1] · e_{sigma[i-1]}
// One-line notation: eps[i-1]*sigma[i-1], where +k → "k", -k → "\overline{k}"

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

function allSignVecs(n) {
  var result = [];
  for (var mask = 0; mask < (1 << n); mask++) {
    var eps = [];
    for (var i = 0; i < n; i++) eps.push((mask >> i) & 1 ? -1 : 1);
    result.push(eps);
  }
  return result;
}

// One-line label: positive k shown as "k", negative as "\overline{k}"
function signedLabel(sigma, eps) {
  return sigma.map(function (v, i) {
    return eps[i] === 1 ? String(v) : '\\overline{' + v + '}';
  }).join('');
}

// n×n matrix (row-major flat array): column i has eps[i] in row sigma[i]-1
function bnMatrix(sigma, eps, n) {
  var mat = new Array(n * n).fill(0);
  for (var i = 0; i < n; i++) mat[(sigma[i] - 1) * n + i] = eps[i];
  return mat;
}

// ── Inversion set ─────────────────────────────────────────────────────────────
// Positive roots of B_n (standard Bourbaki ordering, simple roots e_1-e_2,...,e_{n-1}-e_n, e_n):
//   e_i          (i = 1..n)            → label "ii"
//   e_i - e_j    (i < j)               → label "ij"
//   e_i + e_j    (i < j)               → label "ji"  (larger index first, per spec)
//
// w = (sigma, eps) inverts root α iff w(α) is a negative root.
// w(e_k) = eps[k-1] · e_{sigma[k-1]}
//
// Inversion conditions:
//   e_i:       inverted iff eps[i-1] = -1
//   e_i - e_j: let a=sigma[i-1], b=sigma[j-1], ea=eps[i-1], eb=eps[j-1]
//              inverted iff (ea=+1,eb=+1,a>b) OR (ea=-1,eb=+1) OR (ea=-1,eb=-1,a<b)
//   e_i + e_j: inverted iff the coefficient of e_{min(a,b)} in w(e_i+e_j) is negative
//              = (a<b AND ea=-1) OR (a>b AND eb=-1)

function computeInversions(sigma, eps, n) {
  // Geometric inversion arrangement: α ∈ Inv(w) iff w⁻¹(α) is a negative root.
  // For each value k ∈ {1..n}, find its position p in sigma and associated sign s,
  // so w⁻¹(e_k) = s · e_p.
  var pos = new Array(n + 1); // pos[k] = { p: position of value k, s: associated sign }
  for (var i = 1; i <= n; i++) {
    pos[sigma[i-1]] = { p: i, s: eps[i-1] };
  }

  var inv = [];

  // Root e_k: inverted iff w⁻¹(e_k) is negative ⇔ pos[k].s === -1
  for (var k = 1; k <= n; k++) {
    if (pos[k].s === -1)
      inv.push({ type: 'e', i: k, j: k, label: '' + k + k });
  }

  // Root e_k - e_l (k<l):  w⁻¹(e_k - e_l) = s_k·e_{p_k} - s_l·e_{p_l}
  for (var k = 1; k <= n; k++) {
    for (var l = k + 1; l <= n; l++) {
      var P = pos[k].p, Q = pos[l].p, sP = pos[k].s, sQ = pos[l].s;
      var inverted;
      if      (sP ===  1 && sQ ===  1) inverted = (P >  Q);
      else if (sP ===  1 && sQ === -1) inverted = false;
      else if (sP === -1 && sQ ===  1) inverted = true;
      else                             inverted = (P <  Q);
      if (inverted)
        inv.push({ type: 'eiej', i: k, j: l, label: '' + k + l });
    }
  }

  // Root e_k + e_l (k<l):  w⁻¹(e_k + e_l) = s_k·e_{p_k} + s_l·e_{p_l}
  for (var k = 1; k <= n; k++) {
    for (var l = k + 1; l <= n; l++) {
      var P = pos[k].p, Q = pos[l].p, sP = pos[k].s, sQ = pos[l].s;
      var inverted;
      if      (sP ===  1 && sQ ===  1) inverted = false;
      else if (sP ===  1 && sQ === -1) inverted = (P >  Q);
      else if (sP === -1 && sQ ===  1) inverted = (P <  Q);
      else                             inverted = true;
      if (inverted)
        inv.push({ type: 'eipej', i: k, j: l, label: '' + l + k });
    }
  }

  return inv;
}

// ── n×n matrix helpers (for Bruhat interval computation) ─────────────────────
function matMulN(A, B, n) {
  var C = new Array(n * n).fill(0);
  for (var i = 0; i < n; i++)
    for (var j = 0; j < n; j++)
      for (var k = 0; k < n; k++)
        C[i * n + j] += A[i * n + k] * B[k * n + j];
  return C;
}
function matEqN(A, B) {
  var EPS = 1e-9;
  for (var i = 0; i < A.length; i++) if (Math.abs(A[i] - B[i]) >= EPS) return false;
  return true;
}

// All n² reflections of B_n as n×n matrices.
// Three families corresponding to the positive roots:
//   e_i          → sign flip of coord i
//   e_i - e_j    → swap coords i and j          (i < j)
//   e_i + e_j    → send e_i→-e_j, e_j→-e_i    (i < j)
function allBnReflectionMats(n) {
  var mats = [];

  // Sign flip of coord i (root e_i)
  for (var i = 0; i < n; i++) {
    var m = new Array(n * n).fill(0);
    for (var k = 0; k < n; k++) m[k * n + k] = (k === i) ? -1 : 1;
    mats.push(m);
  }

  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      // Transposition: swap e_i and e_j (root e_i - e_j)
      var m = new Array(n * n).fill(0);
      for (var k = 0; k < n; k++) m[k * n + k] = 1;
      m[i * n + i] = 0; m[j * n + j] = 0;
      m[i * n + j] = 1; m[j * n + i] = 1;
      mats.push(m);

      // Anti-transposition: e_i→-e_j, e_j→-e_i (root e_i + e_j)
      var m2 = new Array(n * n).fill(0);
      for (var k = 0; k < n; k++) if (k !== i && k !== j) m2[k * n + k] = 1;
      m2[j * n + i] = -1; // column i: e_i maps to -e_j
      m2[i * n + j] = -1; // column j: e_j maps to -e_i
      mats.push(m2);
    }
  }
  return mats;
}

// ── Constructor ───────────────────────────────────────────────────────────────

function HyperoctahedralGroup(n) {
  this.n = n;
  var perms  = allPerms(n);
  var signs  = allSignVecs(n);
  var elems  = [];
  for (var p = 0; p < perms.length; p++) {
    for (var s = 0; s < signs.length; s++) {
      var sigma = perms[p], eps = signs[s];
      elems.push({
        sigma:  sigma,
        eps:    eps,
        label:  signedLabel(sigma, eps),
        matrix: bnMatrix(sigma, eps, n)
      });
    }
  }
  this.elements = elems;
}

HyperoctahedralGroup.prototype.build = function () {
  var elems = this.elements;
  var n     = this.n;

  elems.forEach(function (e) {
    e.inversionSet = computeInversions(e.sigma, e.eps, n);
    e.length       = e.inversionSet.length;
  });

  // Bruhat order: [e,w] = {w} ∪ ⋃{[e,t·w] : t reflection, ℓ(t·w) < ℓ(w)}, bottom-up.
  var refMats = allBnReflectionMats(n);
  var ne = elems.length;
  var order = elems.map(function (_, i) { return i; })
    .sort(function (a, b) { return elems[a].length - elems[b].length; });
  var intSets = elems.map(function (_, i) { var s = new Set(); s.add(i); return s; });

  order.forEach(function (i) {
    var w = elems[i];
    refMats.forEach(function (rMat) {
      var tw = matMulN(rMat, w.matrix, n);
      for (var j = 0; j < ne; j++) {
        if (matEqN(tw, elems[j].matrix)) {
          if (elems[j].length < w.length)
            intSets[j].forEach(function (k) { intSets[i].add(k); });
          break;
        }
      }
    });
  });

  elems.forEach(function (w, i) {
    w.bruhatInterval = Array.from(intSets[i])
      .sort(function (a, b) { return elems[a].length - elems[b].length; });
  });

  return this;
};

// ── Chamber sector assignment (cross-polytope B_2) ───────────────────────────
// Vertices in counterclockwise order: +1 (top), +2 (left), −1 (bottom), −2 (right)
// → vidx 0, 1, 2, 3.  Chamber σ(1)σ(2) sits at vertex σ(1) on the side toward
// vertex σ(2):
//   if σ(2) is the next vertex CCW from σ(1):     sector = 2·vidx(σ(1))
//   if σ(2) is the previous vertex CCW (next CW): sector = (2·vidx(σ(1)) − 1) mod 8

HyperoctahedralGroup.prototype.sectorAssignment = function (n_poly) {
  var n = this.n;
  var elems = this.elements;
  var result = new Array(2 * n_poly);

  if (n === 2) {
    function vidx(signed) {
      // +1→0, +2→1, −1→2, −2→3
      return (signed > 0 ? 0 : 2) + (Math.abs(signed) - 1);
    }
    elems.forEach(function (elem, idx) {
      var s1 = elem.eps[0] * elem.sigma[0];
      var s2 = elem.eps[1] * elem.sigma[1];
      var v1 = vidx(s1), v2 = vidx(s2);
      var diff = (v2 - v1 + 4) % 4;
      var sector;
      if      (diff === 1) sector = 2 * v1;
      else if (diff === 3) sector = (2 * v1 - 1 + 8) % 8;
      result[sector] = idx;
    });
  }
  // B_3 handled in 3D phase
  return result;
};

// ── Inversion axis indices (B_2 explicit mapping) ────────────────────────────
// In the cross-polytope drawing (+1 up, +2 left, −1 down, −2 right, phi = π/2),
// e_1 points up and e_2 points left, so the geometric axes are:
//   axis 0 → 135° diagonal = transposition  (swaps e_1, e_2)        label "12"
//   axis 1 → horizontal    = sign flip of coord 1 (fixes e_2)        label "11"
//   axis 2 →  45° diagonal = anti-transposition (e_1↔−e_2)           label "21"
//   axis 3 → vertical      = sign flip of coord 2 (fixes e_1)        label "22"

HyperoctahedralGroup.prototype.inversionAxisIndices = function (wIdx) {
  var n   = this.n;
  var inv = this.elements[wIdx].inversionSet;
  var axes = new Set();

  if (n === 2) {
    inv.forEach(function (r) {
      if      (r.type === 'e'     && r.i === 1) axes.add(1);
      else if (r.type === 'e'     && r.i === 2) axes.add(3);
      else if (r.type === 'eiej')               axes.add(0);
      else if (r.type === 'eipej')              axes.add(2);
    });
  } else if (n === 3) {
    // B_3 axis order matches Visualizer3DOctahedron's plane order:
    //   0: "11", 1: "22", 2: "33",
    //   3: "12", 4: "13", 5: "23",
    //   6: "21", 7: "31", 8: "32"
    inv.forEach(function (r) {
      if (r.type === 'e') {
        axes.add(r.i - 1);
      } else if (r.type === 'eiej') {
        if      (r.i === 1 && r.j === 2) axes.add(3);
        else if (r.i === 1 && r.j === 3) axes.add(4);
        else                              axes.add(5); // (2,3)
      } else { // eipej
        if      (r.i === 1 && r.j === 2) axes.add(6);
        else if (r.i === 1 && r.j === 3) axes.add(7);
        else                              axes.add(8); // (2,3)
      }
    });
  }
  return axes;
};

// ── Green elements ────────────────────────────────────────────────────────────
// Compute t·w for each reflection t in Inv(w) directly from signed permutation.

HyperoctahedralGroup.prototype.greenElements = function (wIdx) {
  var elems = this.elements;
  var w     = elems[wIdx];
  var green = new Set();

  w.inversionSet.forEach(function (r) {
    var ns = w.sigma.slice(), ne = w.eps.slice();
    var i = r.i, j = r.j; // 1-indexed

    if (r.type === 'e') {
      // sign flip of coord i: negate eps for position k where sigma[k-1]=i
      for (var k = 0; k < ns.length; k++)
        if (ns[k] === i) { ne[k] = -ne[k]; break; }

    } else if (r.type === 'eiej') {
      // swap coords i and j in sigma (eps unchanged)
      for (var k = 0; k < ns.length; k++) {
        if (w.sigma[k] === i) ns[k] = j;
        else if (w.sigma[k] === j) ns[k] = i;
      }

    } else { // eipej: anti-transposition e_i+e_j
      for (var k = 0; k < ns.length; k++) {
        if (w.sigma[k] === i) { ns[k] = j; ne[k] = -w.eps[k]; }
        else if (w.sigma[k] === j) { ns[k] = i; ne[k] = -w.eps[k]; }
      }
    }

    var sKey = ns.join(','), eKey = ne.join(',');
    for (var k = 0; k < elems.length; k++) {
      if (elems[k].sigma.join(',') === sKey && elems[k].eps.join(',') === eKey) {
        green.add(k); break;
      }
    }
  });
  return green;
};

// ── Matrix-entry strings ──────────────────────────────────────────────────────
// B_n matrices have entries only in {-1, 0, 1}.

HyperoctahedralGroup.prototype.matrixStrings = function (elemIdx) {
  return this.elements[elemIdx].matrix.map(function (v) {
    return v === 1 ? '1' : v === -1 ? '-1' : '0';
  });
};

// ── Verification helper ───────────────────────────────────────────────────────

HyperoctahedralGroup.verify = function (n) {
  var G = new HyperoctahedralGroup(n).build();
  console.group('B_' + n + ' (' + G.elements.length + ' elements)');
  G.elements.forEach(function (e) {
    var inv = e.inversionSet.map(function (r) { return '(' + r.label + ')'; }).join('') || '∅';
    console.log(e.label, '  len=' + e.length, '  inv=' + inv, '  |[e,w]|=' + e.bruhatInterval.length);
  });
  console.groupEnd();
};

window.HyperoctahedralGroup = HyperoctahedralGroup;

})();
