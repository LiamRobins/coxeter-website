(function () {
'use strict';

// ── Element representation ────────────────────────────────────────────────────
// H_3 ≅ A_5 × Z_2  (order 120; symmetry group of the icosahedron / dodecahedron).
// An element is (sigma, eps): sigma is an even permutation of {1..5} (one-line),
// eps ∈ {+1, -1}.
// Multiplication: (s1, e1) · (s2, e2) = (s1 ∘ s2, e1 · e2),
// with permutation composition (a ∘ b)(i) = a(b(i)).
//
// The 15 reflections are (tau, -1) where tau is a double-transposition in A_5.

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

function isEvenPerm(s) {
  var inv = 0;
  for (var i = 0; i < s.length; i++)
    for (var j = i + 1; j < s.length; j++)
      if (s[i] > s[j]) inv++;
  return inv % 2 === 0;
}

// (a ∘ b)(i) = a(b(i)).  Stored 1-indexed in one-line form.
function compose(a, b) {
  var n = b.length;
  var out = new Array(n);
  for (var i = 0; i < n; i++) out[i] = a[b[i] - 1];
  return out;
}

// In A_5 (n=5), a permutation has cycle type either e, 3-cycle, 5-cycle, or
// double-transposition. Double-transpositions are characterised by 4 displaced
// indices and one fixed point.
function isDoubleTransposition(s) {
  var displaced = 0;
  for (var i = 0; i < s.length; i++) if (s[i] !== i + 1) displaced++;
  return displaced === 4;
}

// For a double-transposition s, return its two pairs [[a,b],[c,d]] with a<b,
// c<d, a<c (canonical ordering: smaller-element pair first).
function dtPairs(s) {
  var pairs = [];
  var seen = new Set();
  for (var i = 1; i <= s.length; i++) {
    if (seen.has(i)) continue;
    var j = s[i - 1];
    if (j !== i && !seen.has(j)) {
      pairs.push([Math.min(i, j), Math.max(i, j)]);
      seen.add(i); seen.add(j);
    }
  }
  return pairs;
}

// ── Labels (LaTeX) ────────────────────────────────────────────────────────────

// Element label: one-line notation, with \overline{...} when eps = -1.
function oneLineLabel(sigma, eps) {
  var s = sigma.join('');
  return eps === 1 ? s : '\\overline{' + s + '}';
}

// Reflection label: \overline{(ab)(cd)}. (Reflections have eps = -1.)
function reflectionLabel(sigma) {
  var p = dtPairs(sigma);
  return '\\overline{(' + p[0][0] + p[0][1] + ')(' + p[1][0] + p[1][1] + ')}';
}

// ── Element-key lookup ────────────────────────────────────────────────────────

function elemKey(sigma, eps) {
  return (eps === 1 ? '+' : '-') + sigma.join(',');
}

// ── Constructor ───────────────────────────────────────────────────────────────

function IcosahedralGroup() {
  var a5 = allPerms(5).filter(isEvenPerm);

  // 120 elements: each σ ∈ A_5 gives two elements (σ, +1) and (σ, -1).
  // Order: σ in lex order on one-line form; (σ, +1) before (σ, -1).
  var elems = [];
  a5.forEach(function (s) {
    elems.push({ sigma: s.slice(), eps:  1, label: oneLineLabel(s,  1) });
    elems.push({ sigma: s.slice(), eps: -1, label: oneLineLabel(s, -1) });
  });
  this.elements = elems;

  var keyToIdx = {};
  elems.forEach(function (e, i) { keyToIdx[elemKey(e.sigma, e.eps)] = i; });
  this._keyToIdx = keyToIdx;

  // 15 reflections: (τ, -1) for τ a double-transposition.
  var reflections = [];
  a5.forEach(function (s) {
    if (isDoubleTransposition(s)) {
      reflections.push({ sigma: s.slice(), eps: -1, label: reflectionLabel(s) });
    }
  });
  this.reflections = reflections;

  // 3 simple reflections — geometric ordering matching the fundamental chamber
  // on the icosahedron (V_0, M_0, C_0) where V_0 = (0, 1, φ):
  //   s_1 = \overline{(12)(34)}    reflection thru plane containing edge V_0—(1,φ,0)
  //         σ = [2,1,4,3,5];  m_12 = 2 with s_2,  m_13 = 5 with s_3
  //   s_2 = \overline{(13)(24)}    perpendicular bisector of V_0—(1,φ,0)
  //         σ = [3,4,1,2,5];  m_12 = 2 with s_1,  m_23 = 3 with s_3
  //   s_3 = \overline{(13)(25)}    perpendicular bisector of (1,φ,0)—(φ,0,1)
  //         σ = [3,5,1,4,2];  m_13 = 5 with s_1,  m_23 = 3 with s_2
  this.simpleReflections = [
    { sigma: [2, 1, 4, 3, 5], eps: -1, label: '\\overline{(12)(34)}' },
    { sigma: [3, 4, 1, 2, 5], eps: -1, label: '\\overline{(13)(24)}' },
    { sigma: [3, 5, 1, 4, 2], eps: -1, label: '\\overline{(13)(25)}' },
  ];
}

// ── 3D helpers (used to attach matrices and reflection normals) ───────────────

var PHI = (1 + Math.sqrt(5)) / 2;

// Geometric data for the fundamental chamber, used to derive simple reflections.
// V_NEXT and V_FACE are chosen so that, after the visualizer's Q rotation,
// V_NEXT ends up at the bottom-right of the rendered F_0 face. That puts the
// identity chamber (V_0, midpoint(V_0,V_NEXT), centroid) at the top-RIGHT of
// the face — matching the position of \overline{32154}'s S_3 subgroup
// arrangement that the project conventions call for.
var FUND_V = [0, 1, PHI];        // V_0: an icosahedron vertex
var FUND_V_NEXT = [PHI, 0, 1];   // (φ, 0, 1)
var FUND_V_FACE = [1, PHI, 0];   // (1, φ, 0)

function cross3(a, b) {
  return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
}
function sub3(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function dot3(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

function identityMat3() { return [1,0,0, 0,1,0, 0,0,1]; }

function matMul3(A, B) {
  var C = new Array(9).fill(0);
  for (var i = 0; i < 3; i++)
    for (var j = 0; j < 3; j++)
      for (var k = 0; k < 3; k++)
        C[i*3 + j] += A[i*3 + k] * B[k*3 + j];
  return C;
}

// Build a reflection matrix from a normal vector: M = I - 2 n n^T / |n|^2.
function reflectionMat3(n) {
  var s = 2 / dot3(n, n);
  var M = new Array(9);
  for (var i = 0; i < 3; i++)
    for (var j = 0; j < 3; j++)
      M[i*3 + j] = (i === j ? 1 : 0) - s * n[i] * n[j];
  return M;
}

// Apply 3×3 matrix M to 3-vector v.
function matVec3(M, v) {
  return [
    M[0]*v[0] + M[1]*v[1] + M[2]*v[2],
    M[3]*v[0] + M[4]*v[1] + M[5]*v[2],
    M[6]*v[0] + M[7]*v[1] + M[8]*v[2],
  ];
}

// Extract the reflection axis (unit normal) from a reflection matrix M (= I − 2nn^T/|n|²).
// Any column of (I − M) is parallel to n. Pick the column with largest norm.
function reflectionNormalFromMat(M) {
  var IminusM = new Array(9);
  for (var i = 0; i < 3; i++)
    for (var j = 0; j < 3; j++)
      IminusM[i*3 + j] = (i === j ? 1 : 0) - M[i*3 + j];
  var bestCol = 0, bestNorm = 0;
  for (var j = 0; j < 3; j++) {
    var c = [IminusM[j], IminusM[3 + j], IminusM[6 + j]];
    var nrm = dot3(c, c);
    if (nrm > bestNorm) { bestNorm = nrm; bestCol = j; }
  }
  var v = [IminusM[bestCol], IminusM[3 + bestCol], IminusM[6 + bestCol]];
  var len = Math.sqrt(dot3(v, v));
  return [v[0]/len, v[1]/len, v[2]/len];
}

// ── Build: lengths, inversion sets, Bruhat intervals ─────────────────────────

IcosahedralGroup.prototype.build = function () {
  var elems       = this.elements;
  var keyToIdx    = this._keyToIdx;
  var simples     = this.simpleReflections;
  var reflections = this.reflections;

  function indexOf(sigma, eps) { return keyToIdx[elemKey(sigma, eps)]; }

  // 3D simple-reflection normals derived from the fundamental chamber.
  var alphas = [
    cross3(FUND_V, FUND_V_NEXT),         // s_1: plane spanned by V_0, (1,φ,0), origin
    sub3(FUND_V_NEXT, FUND_V),           // s_2: perpendicular bisector of V_0—(1,φ,0)
    sub3(FUND_V_FACE, FUND_V_NEXT),      // s_3: perpendicular bisector of (1,φ,0)—(φ,0,1)
  ];
  var simpleMats = alphas.map(reflectionMat3);

  // BFS from the identity using simple reflections → length, matrix on each element.
  var idIdx = indexOf([1, 2, 3, 4, 5], 1);
  var lengths  = new Array(elems.length).fill(-1);
  var matrices = new Array(elems.length).fill(null);
  lengths[idIdx]  = 0;
  matrices[idIdx] = identityMat3();
  var queue = [idIdx];
  while (queue.length > 0) {
    var curIdx = queue.shift();
    var cur = elems[curIdx];
    for (var k = 0; k < simples.length; k++) {
      var s = simples[k];
      var nσ = compose(s.sigma, cur.sigma);
      var nε = s.eps * cur.eps;
      var nIdx = indexOf(nσ, nε);
      if (lengths[nIdx] === -1) {
        lengths[nIdx]  = lengths[curIdx] + 1;
        matrices[nIdx] = matMul3(simpleMats[k], matrices[curIdx]);
        queue.push(nIdx);
      }
    }
  }
  elems.forEach(function (e, i) { e.length = lengths[i]; e.matrix = matrices[i]; });

  // Inversion set: t ∈ Inv(w) iff ℓ(t·w) < ℓ(w), where t ranges over all 15 reflections.
  elems.forEach(function (w, wIdx) {
    var inv = [];
    reflections.forEach(function (t, tIdx) {
      var twσ = compose(t.sigma, w.sigma);
      var twε = t.eps * w.eps;
      var twIdx = indexOf(twσ, twε);
      if (lengths[twIdx] < lengths[wIdx]) {
        inv.push({ refIdx: tIdx, label: t.label });
      }
    });
    w.inversionSet = inv;
  });

  // Bruhat interval [e, w] (bottom-up DP).
  var intSets = elems.map(function (_, i) { var s = new Set(); s.add(i); return s; });
  var order = elems.map(function (_, i) { return i; })
    .sort(function (a, b) { return lengths[a] - lengths[b]; });
  order.forEach(function (i) {
    var w = elems[i];
    reflections.forEach(function (t) {
      var twσ = compose(t.sigma, w.sigma);
      var twε = t.eps * w.eps;
      var twIdx = indexOf(twσ, twε);
      if (lengths[twIdx] < lengths[i]) {
        intSets[twIdx].forEach(function (k) { intSets[i].add(k); });
      }
    });
  });
  elems.forEach(function (w, i) {
    w.bruhatInterval = Array.from(intSets[i])
      .sort(function (a, b) { return lengths[a] - lengths[b]; });
  });

  // Attach a 3D normal (unit vector) to each reflection.
  reflections.forEach(function (r) {
    var idx = indexOf(r.sigma, r.eps);
    r.matrix = elems[idx].matrix;
    r.normal = reflectionNormalFromMat(r.matrix);
    r.elemIdx = idx;
  });

  // Convenience: fundamental chamber 3D corners (used by the visualizer).
  this.fundamental = {
    V: FUND_V.slice(),
    M: [(FUND_V[0]+FUND_V_NEXT[0])/2, (FUND_V[1]+FUND_V_NEXT[1])/2, (FUND_V[2]+FUND_V_NEXT[2])/2],
    C: [(FUND_V[0]+FUND_V_NEXT[0]+FUND_V_FACE[0])/3,
        (FUND_V[1]+FUND_V_NEXT[1]+FUND_V_FACE[1])/3,
        (FUND_V[2]+FUND_V_NEXT[2]+FUND_V_FACE[2])/3],
  };

  return this;
};

// Format a 3×3 matrix entry as a short string for the info panel.
IcosahedralGroup.prototype.matrixStrings = function (elemIdx) {
  return this.elements[elemIdx].matrix.map(function (v) {
    if (Math.abs(v) < 1e-9) return '0';
    if (Math.abs(v - 1) < 1e-9) return '1';
    if (Math.abs(v + 1) < 1e-9) return '-1';
    return v.toFixed(3);
  });
};

// Inversion axis indices for the visualizer: each entry of inversionSet maps to
// a 0-based index into this.reflections (which is the order the visualizer uses
// when building reflection planes).
IcosahedralGroup.prototype.inversionAxisIndices = function (wIdx) {
  var inv = this.elements[wIdx].inversionSet;
  var axes = new Set();
  inv.forEach(function (r) { axes.add(r.refIdx); });
  return axes;
};

// Green elements: {t·w : t ∈ Inv(w)}.
IcosahedralGroup.prototype.greenElements = function (wIdx) {
  var elems = this.elements;
  var keyToIdx = this._keyToIdx;
  var w = elems[wIdx];
  var refs = this.reflections;
  var green = new Set();
  w.inversionSet.forEach(function (r) {
    var t = refs[r.refIdx];
    var twσ = compose(t.sigma, w.sigma);
    var twε = t.eps * w.eps;
    green.add(keyToIdx[elemKey(twσ, twε)]);
  });
  return green;
};

window.IcosahedralGroup = IcosahedralGroup;

})();
