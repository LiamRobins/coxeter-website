(function () {
'use strict';

// ─── Tetrahedron geometry (regular, circumradius 1, vertex 1 at top) ─────────
//
// Vertex layout (counterclockwise from above looking down):
//   1: top      (0, 1, 0)
//   2: front    (0, -1/3, 2√2/3)
//   3: back-right
//   4: back-left
//
// |G| = 24 elements, each chamber is a small triangle on the surface bounded by
// (vertex h, midpoint of edge h–i, centroid of face hij).

function tetraVertices() {
  var s = Math.sqrt(2/3);            // = √2 / √3
  var t = Math.sqrt(2) / 3;          // = √2 / 3
  return {
    1: new THREE.Vector3(0,   1,    0),
    2: new THREE.Vector3(0,  -1/3,  2*Math.sqrt(2)/3),
    3: new THREE.Vector3( s, -1/3, -t),
    4: new THREE.Vector3(-s, -1/3, -t),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function midpoint(a, b) {
  return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
}
function centroid3(a, b, c) {
  return new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1/3);
}

// Canvas-texture text (used for both billboard sprites and face labels)
function makeTextCanvas(text, opts) {
  opts = opts || {};
  var size  = opts.size  || 256;
  var color = opts.color || '#1c3d5a';
  var font  = opts.font  || 'bold 96px Georgia, serif';
  var canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size/2, size/2);
  return canvas;
}

function makeTextSprite(text, opts) {
  opts = opts || {};
  var canvas = makeTextCanvas(text, opts);
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  var sprite = new THREE.Sprite(mat);
  var scale = opts.scale || 0.25;
  sprite.scale.set(scale, scale, 1);
  sprite.renderOrder = 999; // draw on top
  return sprite;
}

// Convert "\overline{k}" (B_n style) to plain "k" (we won't see this for S_n,
// but kept here so the helper is reusable)
function plainLabel(label) {
  return label.replace(/\\overline\{(\w+)\}/g, '$1');
}

// ─── Colors ───────────────────────────────────────────────────────────────────

var COL = {
  chamberDefault:   0xeef2f8,
  chamberDefaultHex:'#eef2f8',
  chamberStroke:    0x1c3d5a,
  blue:             0x2979d4,
  green:            0x388e3c,
  yellow:           0xe6a817,
  axisRed:          0xd32f2f,
  axisDefault:      0x8faabf,
  edge:             0x1c3d5a,
};

// ─── Visualizer3D ─────────────────────────────────────────────────────────────

function Visualizer3D(container, G, options) {
  this.G        = G;
  this.options  = options || {};
  this.onSelect = null;

  this._selected     = null;
  this._showAxes     = false;
  this._chamberMeshes = []; // index = elemIdx, value = THREE.Mesh
  this._planeMeshes   = []; // index = axis index, value = THREE.Mesh
  this._planeLabels   = []; // parallel to _planeMeshes, sprites

  this._vertices = tetraVertices();

  var W = container.clientWidth || 520;
  var H = W;

  // ── Scene, camera, renderer ──
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafaf8);

  var camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  this._camera = camera;
  this._camTheta = Math.PI * 0.55; // initial azimuth (slight CCW from front)
  this._camPhi   = Math.PI * 0.32; // initial elevation (down from +Y)
  this._camDist  = 4.2;
  this._updateCamera();

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);
  this._renderer = renderer;
  this._canvas   = renderer.domElement;

  // ── Lights ──
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  var dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(2, 3, 4);
  scene.add(dir);

  this._scene = scene;

  // ── Build the model ──
  this._buildChambers();
  this._buildEdges();
  this._buildVertexLabels();
  this._buildPlanes();

  // ── Mouse interaction ──
  this._setupOrbitControls();
  this._setupRaycaster();

  this._render();
}

// ── Camera positioning (orbit) ──────────────────────────────────────────────
Visualizer3D.prototype._updateCamera = function () {
  var d = this._camDist, t = this._camTheta, p = this._camPhi;
  this._camera.position.set(
    d * Math.sin(p) * Math.cos(t),
    d * Math.cos(p),
    d * Math.sin(p) * Math.sin(t)
  );
  this._camera.lookAt(0, 0, 0);
};

Visualizer3D.prototype._render = function () {
  this._renderer.render(this._scene, this._camera);
};

// ── Chambers ────────────────────────────────────────────────────────────────
//
// Element σ = [h, i, j, k] is rendered at:
//   triangle ( v_h ,  midpoint(v_h, v_i) ,  centroid(v_h, v_i, v_j) )
// on the face opposite vertex k.

Visualizer3D.prototype._chamberTriangle = function (sigma) {
  var h = sigma[0], i = sigma[1], j = sigma[2];
  var vh = this._vertices[h];
  var vi = this._vertices[i];
  var vj = this._vertices[j];
  return [vh.clone(), midpoint(vh, vi), centroid3(vh, vi, vj)];
};

Visualizer3D.prototype._buildChambers = function () {
  var self = this;
  this.G.elements.forEach(function (elem, idx) {
    var pts = self._chamberTriangle(elem.sigma);
    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pts[0].x, pts[0].y, pts[0].z,
      pts[1].x, pts[1].y, pts[1].z,
      pts[2].x, pts[2].y, pts[2].z,
    ]), 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshLambertMaterial({
      color: COL.chamberDefault,
      side:  THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits:  1,
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.userData.elemIdx = idx;
    self._scene.add(mesh);
    self._chamberMeshes[idx] = mesh;

    // Tiny outline of the chamber triangle (thin black edges)
    var lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pts[0].x, pts[0].y, pts[0].z,
      pts[1].x, pts[1].y, pts[1].z,
      pts[1].x, pts[1].y, pts[1].z,
      pts[2].x, pts[2].y, pts[2].z,
      pts[2].x, pts[2].y, pts[2].z,
      pts[0].x, pts[0].y, pts[0].z,
    ]), 3));
    var lineMat = new THREE.LineBasicMaterial({ color: COL.edge });
    var lines = new THREE.LineSegments(lineGeom, lineMat);
    self._scene.add(lines);

    // Chamber label as a small plane mesh laid flat on the face
    self._addChamberLabel(elem, pts);
  });
};

// ── Chamber label, painted on the face surface ──────────────────────────────
Visualizer3D.prototype._addChamberLabel = function (elem, triPts) {
  // Centroid of chamber triangle (3D position of label)
  var c = centroid3(triPts[0], triPts[1], triPts[2]);
  // Outward face normal = -v_k (where k = σ(4))
  var k = elem.sigma[3];
  var faceNormal = this._vertices[k].clone().multiplyScalar(-1).normalize();

  // Build orientation: in-plane "up" = projection of world +Y onto face
  var worldUp = new THREE.Vector3(0, 1, 0);
  var inPlaneUp = worldUp.clone().sub(
    faceNormal.clone().multiplyScalar(worldUp.dot(faceNormal))
  );
  if (inPlaneUp.lengthSq() < 0.01) {
    // World +Y is parallel to face normal (bottom face) — use world +X instead
    inPlaneUp = new THREE.Vector3(1, 0, 0).sub(
      faceNormal.clone().multiplyScalar(faceNormal.dot(new THREE.Vector3(1,0,0)))
    );
  }
  inPlaneUp.normalize();
  var inPlaneRight = new THREE.Vector3().crossVectors(inPlaneUp, faceNormal).normalize();

  // Plane geometry: small square slightly above the face surface
  var size = 0.22;
  var planeGeom = new THREE.PlaneGeometry(size, size);
  var canvas = makeTextCanvas(plainLabel(elem.label), {
    size: 256, font: 'bold 96px Georgia, serif', color: '#1c3d5a',
  });
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  var planeMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
  });
  var plane = new THREE.Mesh(planeGeom, planeMat);

  // Position slightly outside the face surface to avoid z-fighting
  plane.position.copy(c).add(faceNormal.clone().multiplyScalar(0.005));

  // Orient: PlaneGeometry's local +Z = our faceNormal
  var basis = new THREE.Matrix4().makeBasis(inPlaneRight, inPlaneUp, faceNormal);
  plane.setRotationFromMatrix(basis);
  plane.renderOrder = 5;

  this._scene.add(plane);
};

// ── Tetrahedron edges (thin black lines on the wireframe) ───────────────────
Visualizer3D.prototype._buildEdges = function () {
  var V = this._vertices;
  var pairs = [[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
  var positions = [];
  pairs.forEach(function (p) {
    var a = V[p[0]], b = V[p[1]];
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  });
  var geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  var mat = new THREE.LineBasicMaterial({ color: COL.edge, linewidth: 2 });
  var lines = new THREE.LineSegments(geom, mat);
  this._scene.add(lines);
};

// ── Vertex labels (billboard sprites, just outside each vertex) ─────────────
Visualizer3D.prototype._buildVertexLabels = function () {
  var self = this;
  [1, 2, 3, 4].forEach(function (k) {
    var sprite = makeTextSprite(String(k), {
      size: 128, font: 'bold 72px Georgia, serif', color: '#1c3d5a', scale: 0.27,
    });
    var v = self._vertices[k];
    sprite.position.copy(v.clone().multiplyScalar(1.22));
    self._scene.add(sprite);
  });
};

// ── Reflection planes (one per transposition (i,j)) ────────────────────────
//
// The plane (i,j) is the perpendicular bisector of edge ij; it passes through
// the two other vertices (k, l) and the origin. We render each plane as a
// square that extends well beyond the tetrahedron so the user can see it.
//
// Plane index follows lexicographic order of transpositions:
//   (1,2), (1,3), (1,4), (2,3), (2,4), (3,4)

Visualizer3D.prototype._buildPlanes = function () {
  var V = this._vertices;
  var pairs = [[1,2],[1,3],[1,4],[2,3],[2,4],[3,4]];
  var self = this;

  pairs.forEach(function (pair, axisIdx) {
    var i = pair[0], j = pair[1];
    // The other two vertices are on the plane:
    var others = [1,2,3,4].filter(function (x) { return x !== i && x !== j; });
    var vk = V[others[0]];
    var vl = V[others[1]];

    // Normal to plane = (v_i - v_j) normalized
    var normal = new THREE.Vector3().subVectors(V[i], V[j]).normalize();

    // Build two in-plane axes:
    //   u = (vk + vl) direction (mid-edge of kl, normalized)
    //   v = perpendicular to u within plane
    var u = new THREE.Vector3().addVectors(vk, vl).normalize();
    if (u.lengthSq() < 0.01) u = new THREE.Vector3().crossVectors(normal, vk).normalize();
    var v = new THREE.Vector3().crossVectors(normal, u).normalize();

    // Square extending from -L to +L along u and v
    var L = 1.25;
    var p00 = new THREE.Vector3().addVectors(u.clone().multiplyScalar(-L), v.clone().multiplyScalar(-L));
    var p10 = new THREE.Vector3().addVectors(u.clone().multiplyScalar( L), v.clone().multiplyScalar(-L));
    var p11 = new THREE.Vector3().addVectors(u.clone().multiplyScalar( L), v.clone().multiplyScalar( L));
    var p01 = new THREE.Vector3().addVectors(u.clone().multiplyScalar(-L), v.clone().multiplyScalar( L));

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p11.x, p11.y, p11.z,
      p00.x, p00.y, p00.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z,
    ]), 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshBasicMaterial({
      color: COL.axisRed, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false,
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.userData.isHyperplane = true;
    self._scene.add(mesh);
    self._planeMeshes[axisIdx] = mesh;

    // Plane label: at the midpoint of the relevant edge ij, slightly outside
    var midIJ = midpoint(V[i], V[j]);
    var sprite = makeTextSprite('' + i + j, {
      size: 128, font: 'bold 64px Georgia, serif', color: '#d32f2f', scale: 0.22,
    });
    sprite.position.copy(midIJ.clone().multiplyScalar(1.55));
    sprite.visible = false;
    self._scene.add(sprite);
    self._planeLabels[axisIdx] = sprite;
  });
};

// ── Mouse orbit controls ────────────────────────────────────────────────────
Visualizer3D.prototype._setupOrbitControls = function () {
  var self = this;
  var dragging = false;
  var prev = { x: 0, y: 0 };

  this._canvas.addEventListener('mousedown', function (e) {
    dragging = true;
    prev.x = e.clientX; prev.y = e.clientY;
    e.preventDefault();
  });
  window.addEventListener('mouseup', function () { dragging = false; });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    self._camTheta -= dx * 0.008;
    self._camPhi   = Math.max(0.05, Math.min(Math.PI - 0.05, self._camPhi + dy * 0.008));
    prev.x = e.clientX; prev.y = e.clientY;
    self._updateCamera();
    self._render();
  });
};

// ── Click → raycast → select chamber ────────────────────────────────────────
Visualizer3D.prototype._setupRaycaster = function () {
  var self = this;
  var raycaster = new THREE.Raycaster();
  var mouseDown = { x: 0, y: 0 };
  this._canvas.addEventListener('mousedown', function (e) {
    mouseDown.x = e.clientX; mouseDown.y = e.clientY;
  });
  this._canvas.addEventListener('mouseup', function (e) {
    // Distinguish click from drag: only fire if the mouse barely moved
    if (Math.abs(e.clientX - mouseDown.x) > 4 || Math.abs(e.clientY - mouseDown.y) > 4) return;
    var rect = self._canvas.getBoundingClientRect();
    var x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    var y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x: x, y: y }, self._camera);
    var hits = raycaster.intersectObjects(self._chamberMeshes, false);
    if (hits.length === 0) return;
    var elemIdx = hits[0].object.userData.elemIdx;
    self._select(elemIdx);
  });
};

Visualizer3D.prototype._select = function (elemIdx) {
  this._selected = elemIdx;
  this._applyHighlights();
  this._render();
  if (this.onSelect) this.onSelect(elemIdx);
};

// ── Highlighting (blue / green / yellow / red) ──────────────────────────────
Visualizer3D.prototype._applyHighlights = function () {
  var G = this.G, wIdx = this._selected;
  var meshes = this._chamberMeshes;

  if (wIdx === null) {
    meshes.forEach(function (m) { m.material.color.setHex(COL.chamberDefault); });
    this._planeMeshes.forEach(function (m) { m.material.color.setHex(COL.axisRed); });
    return;
  }

  var hl = computeHighlights(G, wIdx);
  meshes.forEach(function (m, i) {
    var c;
    if      (hl.blue.has(i))   c = COL.blue;
    else if (hl.green.has(i))  c = COL.green;
    else if (hl.yellow.has(i)) c = COL.yellow;
    else                       c = COL.chamberDefault;
    m.material.color.setHex(c);
  });

  // Plane visibility: only show planes in the inversion arrangement.
  this._updatePlaneVisibility();
};

// Show planes (and their labels) iff toggled on AND in the current
// element's inversion arrangement.
Visualizer3D.prototype._updatePlaneVisibility = function () {
  var G = this.G, wIdx = this._selected;
  var on = this._showAxes;
  var axisSet = (on && wIdx !== null && G.inversionAxisIndices)
    ? G.inversionAxisIndices(wIdx) : new Set();
  this._planeMeshes.forEach(function (m, j) {
    var show = on && axisSet.has(j);
    m.visible = show;
    if (show) {
      m.material.color.setHex(COL.axisRed);
      m.material.opacity = 0.5;
    }
  });
  this._planeLabels.forEach(function (s, j) {
    s.visible = on && axisSet.has(j);
  });
};

function computeHighlights(G, wIdx) {
  var blue   = new Set([wIdx]);
  var green  = G.greenElements ? G.greenElements(wIdx) : new Set();
  var yellow = new Set();
  G.elements[wIdx].bruhatInterval.forEach(function (idx) {
    if (idx === wIdx)   return;
    if (green.has(idx)) return;
    yellow.add(idx);
  });
  return { blue: blue, green: green, yellow: yellow };
}

// ── Hyperplane visibility toggle ────────────────────────────────────────────
Visualizer3D.prototype.toggleAxes = function () {
  this._showAxes = !this._showAxes;
  this._updatePlaneVisibility();
  this._render();
  return this._showAxes;
};

window.Visualizer3D = Visualizer3D;

// ═════════════════════════════════════════════════════════════════════════════
// ═══ OCTAHEDRON (B_3 cross-polytope) ════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════

// 6 vertices labeled ±1, ±2, ±3 (where i is opposite −i):
//   +1: (0,  1,  0)   top
//   −1: (0, −1,  0)   bottom
//   +2: (0,  0,  1)   front (toward camera)
//   −2: (0,  0, −1)   back
//   +3: (1,  0,  0)   right
//   −3: (−1, 0,  0)   left
//
// (2 and 3 are placed so that face 123 looks like the S_3 triangle when
// viewed from the upper-right-front: 1 at top, 2 bottom-left, 3 bottom-right.)

function octaVertex(signedVal) {
  switch (signedVal) {
    case  1: return new THREE.Vector3( 0,  1,  0);
    case -1: return new THREE.Vector3( 0, -1,  0);
    case  2: return new THREE.Vector3( 0,  0,  1);
    case -2: return new THREE.Vector3( 0,  0, -1);
    case  3: return new THREE.Vector3( 1,  0,  0);
    case -3: return new THREE.Vector3(-1,  0,  0);
  }
  return null;
}

function octaEdges() {
  // 12 edges connecting different-axis vertices
  return [
    [1,  2], [1, -2], [1,  3], [1, -3],
    [-1, 2], [-1,-2], [-1, 3], [-1,-3],
    [2,  3], [2, -3], [-2, 3], [-2,-3],
  ];
}

// 9 reflective hyperplanes, in order matching HyperoctahedralGroup.inversionAxisIndices:
//   0: "11" (sign flip of axis 1, plane perpendicular to e_1 = y-axis)
//   1: "22" (sign flip of axis 2 = x-axis)
//   2: "33" (sign flip of axis 3 = z-axis)
//   3: "12" (swap +1 ↔ +2)
//   4: "13" (swap +1 ↔ +3)
//   5: "23" (swap +2 ↔ +3)
//   6: "21" (swap +1 ↔ −2)
//   7: "31" (swap +1 ↔ −3)
//   8: "32" (swap +2 ↔ −3)
//
// "ii" labels are placed INSIDE the octahedron near a chosen vertex on the
// perpendicular plane. The swap-plane labels sit just outside the relevant
// edge midpoint.
function octaPlanes() {
  return [
    { label: '11', normal: new THREE.Vector3( 0,  1, 0),
      labelPos: new THREE.Vector3( 0,    0,    0.65) },
    { label: '22', normal: new THREE.Vector3( 0,  0, 1),
      labelPos: new THREE.Vector3( 0.65, 0,    0   ) },
    { label: '33', normal: new THREE.Vector3( 1,  0, 0),
      labelPos: new THREE.Vector3( 0,    0.65, 0   ) },
    { label: '12', normal: new THREE.Vector3( 0, -1, 1).normalize(),
      labelPos: new THREE.Vector3( 0,    0.6,  0.6 ) },
    { label: '13', normal: new THREE.Vector3( 1, -1, 0).normalize(),
      labelPos: new THREE.Vector3( 0.6,  0.6,  0   ) },
    { label: '23', normal: new THREE.Vector3( 1,  0,-1).normalize(),
      labelPos: new THREE.Vector3( 0.6,  0,    0.6 ) },
    { label: '21', normal: new THREE.Vector3( 0,  1, 1).normalize(),
      labelPos: new THREE.Vector3( 0,    0.6, -0.6 ) },
    { label: '31', normal: new THREE.Vector3( 1,  1, 0).normalize(),
      labelPos: new THREE.Vector3(-0.6,  0.6,  0   ) },
    { label: '32', normal: new THREE.Vector3( 1,  0, 1).normalize(),
      labelPos: new THREE.Vector3(-0.6,  0,    0.6 ) },
  ];
}

// ─── Canvas-text rendering with overline support (for B_n chamber labels) ─────
function makeBnLabelCanvas(label, opts) {
  opts = opts || {};
  var size   = opts.size   || 256;
  var color  = opts.color  || '#1c3d5a';
  var fontPx = opts.fontPx || 60;
  var canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.font = 'bold ' + fontPx + 'px Georgia, serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Parse label into a list of {text, overline} parts
  var parts = [];
  var i = 0;
  while (i < label.length) {
    if (label.substr(i, 10) === '\\overline{') {
      var end = label.indexOf('}', i + 10);
      parts.push({ text: label.substring(i + 10, end), overline: true });
      i = end + 1;
    } else {
      parts.push({ text: label.charAt(i), overline: false });
      i++;
    }
  }

  var widths = parts.map(function (p) { return ctx.measureText(p.text).width; });
  var totalWidth = widths.reduce(function (a, b) { return a + b; }, 0);
  var x = size / 2 - totalWidth / 2;
  var y = size / 2;
  parts.forEach(function (p, idx) {
    ctx.fillText(p.text, x, y);
    if (p.overline) {
      var thickness = Math.max(2, fontPx * 0.06);
      var overlineY = y - fontPx * 0.42;
      ctx.fillRect(x, overlineY, widths[idx], thickness);
    }
    x += widths[idx];
  });
  return canvas;
}

// ─── Visualizer3DOctahedron ───────────────────────────────────────────────────
function Visualizer3DOctahedron(container, G, options) {
  this.G        = G;
  this.options  = options || {};
  this.onSelect = null;

  this._selected      = null;
  this._showAxes      = false;
  this._chamberMeshes = [];
  this._planeMeshes   = [];
  this._planeLabels   = [];

  var W = container.clientWidth || 520;
  var H = W;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafaf8);

  this._camera   = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  this._camTheta = Math.PI * 0.55;
  this._camPhi   = Math.PI * 0.32;
  this._camDist  = 4.2;
  this._updateCamera();

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);
  this._renderer = renderer;
  this._canvas   = renderer.domElement;

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  var dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(2, 3, 4);
  scene.add(dir);
  this._scene = scene;

  this._buildChambers();
  this._buildEdges();
  this._buildVertexLabels();
  this._buildPlanes();

  this._setupOrbitControls();
  this._setupRaycaster();

  this._render();
}

// ── Chamber building (octahedron version) ────────────────────────────────────
//
// For element σ ∈ B_3 with signed values s_k = eps[k]·sigma[k]:
//   chamber triangle = (v_{s_0},  midpt(v_{s_0}, v_{s_1}),  centroid(v_{s_0..2}))
//   on the face containing vertices v_{s_0}, v_{s_1}, v_{s_2}.

Visualizer3DOctahedron.prototype._buildChambers = function () {
  var self = this;
  this.G.elements.forEach(function (elem, idx) {
    var s1 = elem.eps[0] * elem.sigma[0];
    var s2 = elem.eps[1] * elem.sigma[1];
    var s3 = elem.eps[2] * elem.sigma[2];
    var v1 = octaVertex(s1);
    var v2 = octaVertex(s2);
    var v3 = octaVertex(s3);
    var pts = [v1.clone(), midpoint(v1, v2), centroid3(v1, v2, v3)];

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pts[0].x, pts[0].y, pts[0].z,
      pts[1].x, pts[1].y, pts[1].z,
      pts[2].x, pts[2].y, pts[2].z,
    ]), 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshLambertMaterial({
      color: COL.chamberDefault,
      side:  THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits:  1,
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.userData.elemIdx = idx;
    self._scene.add(mesh);
    self._chamberMeshes[idx] = mesh;

    // Chamber-triangle outline
    var lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pts[0].x, pts[0].y, pts[0].z,  pts[1].x, pts[1].y, pts[1].z,
      pts[1].x, pts[1].y, pts[1].z,  pts[2].x, pts[2].y, pts[2].z,
      pts[2].x, pts[2].y, pts[2].z,  pts[0].x, pts[0].y, pts[0].z,
    ]), 3));
    var lines = new THREE.LineSegments(lineGeom,
      new THREE.LineBasicMaterial({ color: COL.edge }));
    self._scene.add(lines);

    self._addOctaChamberLabel(elem, pts, [v1, v2, v3]);
  });
};

Visualizer3DOctahedron.prototype._addOctaChamberLabel = function (elem, triPts, faceVerts) {
  var c            = centroid3(triPts[0], triPts[1], triPts[2]);
  var faceCentroid = centroid3(faceVerts[0], faceVerts[1], faceVerts[2]);
  var faceNormal   = faceCentroid.clone().normalize();

  var worldUp = new THREE.Vector3(0, 1, 0);
  var inPlaneUp = worldUp.clone().sub(
    faceNormal.clone().multiplyScalar(worldUp.dot(faceNormal))
  );
  if (inPlaneUp.lengthSq() < 0.01) {
    inPlaneUp = new THREE.Vector3(1, 0, 0).sub(
      faceNormal.clone().multiplyScalar(faceNormal.dot(new THREE.Vector3(1, 0, 0)))
    );
  }
  inPlaneUp.normalize();
  var inPlaneRight = new THREE.Vector3().crossVectors(inPlaneUp, faceNormal).normalize();

  var size = 0.22;
  var canvas = makeBnLabelCanvas(elem.label, { size: 256, fontPx: 120, color: '#1c3d5a' });
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  var planeMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
  });
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), planeMat);

  plane.position.copy(c).add(faceNormal.clone().multiplyScalar(0.005));
  var basis = new THREE.Matrix4().makeBasis(inPlaneRight, inPlaneUp, faceNormal);
  plane.setRotationFromMatrix(basis);
  plane.renderOrder = 5;

  this._scene.add(plane);
};

// ── Octahedron edges ─────────────────────────────────────────────────────────
Visualizer3DOctahedron.prototype._buildEdges = function () {
  var positions = [];
  octaEdges().forEach(function (p) {
    var a = octaVertex(p[0]), b = octaVertex(p[1]);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  });
  var geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  this._scene.add(new THREE.LineSegments(geom,
    new THREE.LineBasicMaterial({ color: COL.edge })));
};

// ── Vertex labels (1, −1, 2, −2, 3, −3) as billboard sprites ─────────────────
Visualizer3DOctahedron.prototype._buildVertexLabels = function () {
  var self = this;
  [1, -1, 2, -2, 3, -3].forEach(function (val) {
    var sprite = makeTextSprite(String(val), {
      size: 128, font: 'bold 60px Georgia, serif', color: '#1c3d5a', scale: 0.27,
    });
    var v = octaVertex(val);
    sprite.position.copy(v.clone().multiplyScalar(1.22));
    self._scene.add(sprite);
  });
};

// ── Reflection planes (9 of them) ────────────────────────────────────────────
Visualizer3DOctahedron.prototype._buildPlanes = function () {
  var self = this;
  octaPlanes().forEach(function (p, axisIdx) {
    var n = p.normal.clone().normalize();
    // Find any orthogonal basis (u, v) in the plane perpendicular to n
    var helper = (Math.abs(n.y) > 0.9)
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    var u = new THREE.Vector3().crossVectors(helper, n).normalize();
    var v = new THREE.Vector3().crossVectors(n, u).normalize();

    var L = 1.4;
    var pA = new THREE.Vector3().addScaledVector(u, -L).addScaledVector(v, -L);
    var pB = new THREE.Vector3().addScaledVector(u,  L).addScaledVector(v, -L);
    var pC = new THREE.Vector3().addScaledVector(u,  L).addScaledVector(v,  L);
    var pD = new THREE.Vector3().addScaledVector(u, -L).addScaledVector(v,  L);

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z,
      pA.x, pA.y, pA.z, pC.x, pC.y, pC.z, pD.x, pD.y, pD.z,
    ]), 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshBasicMaterial({
      color: COL.axisRed, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.userData.isHyperplane = true;
    self._scene.add(mesh);
    self._planeMeshes[axisIdx] = mesh;

    // Plane label sprite
    var sprite = makeTextSprite(p.label, {
      size: 128, font: 'bold 60px Georgia, serif', color: '#d32f2f', scale: 0.22,
    });
    sprite.position.copy(p.labelPos);
    sprite.material.depthTest = false;
    sprite.visible = false;
    self._scene.add(sprite);
    self._planeLabels[axisIdx] = sprite;
  });
};

// ── Share scaffolding methods with Visualizer3D ──────────────────────────────
Visualizer3DOctahedron.prototype._updateCamera        = Visualizer3D.prototype._updateCamera;
Visualizer3DOctahedron.prototype._render              = Visualizer3D.prototype._render;
Visualizer3DOctahedron.prototype._setupOrbitControls  = Visualizer3D.prototype._setupOrbitControls;
Visualizer3DOctahedron.prototype._setupRaycaster      = Visualizer3D.prototype._setupRaycaster;
Visualizer3DOctahedron.prototype._select              = Visualizer3D.prototype._select;
Visualizer3DOctahedron.prototype._applyHighlights     = Visualizer3D.prototype._applyHighlights;
Visualizer3DOctahedron.prototype._updatePlaneVisibility = Visualizer3D.prototype._updatePlaneVisibility;
Visualizer3DOctahedron.prototype.toggleAxes           = Visualizer3D.prototype.toggleAxes;

window.Visualizer3DOctahedron = Visualizer3DOctahedron;

// ═════════════════════════════════════════════════════════════════════════════
// ═══ CUBE (B_3 hypercube) ═══════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════════════════════
//
// 6 square faces labeled ±1, ±2, ±3 (i opposite −i):
//   +1: y =  1   top         |   −1: y = −1   bottom
//   +2: z =  1   front       |   −2: z = −1   back
//   +3: x =  1   right       |   −3: x = −1   left
//
// Cube corners at (±1, ±1, ±1). 12 edges, each at the intersection of two
// non-opposite faces. 48 chambers (8 per face). Chamber σ = [σ(1), σ(2), σ(3)]
// is the triangle on face σ(1) with vertices:
//   - center of face σ(1)              = octaVertex(σ(1))
//   - midpoint of edge σ(1)−σ(2)        = octaVertex(σ(1)) + octaVertex(σ(2))
//   - corner where σ(1),σ(2),σ(3) meet  = sum of octaVertex over all three

function cubeChamberTriangle(sigma, eps) {
  var s1 = eps[0] * sigma[0];
  var s2 = eps[1] * sigma[1];
  var s3 = eps[2] * sigma[2];
  var v1 = octaVertex(s1);
  var v2 = octaVertex(s2);
  var v3 = octaVertex(s3);
  return [v1.clone(), v1.clone().add(v2), v1.clone().add(v2).add(v3)];
}

function cubeWireframeEdges() {
  var corners = [];
  for (var x = -1; x <= 1; x += 2)
    for (var y = -1; y <= 1; y += 2)
      for (var z = -1; z <= 1; z += 2)
        corners.push(new THREE.Vector3(x, y, z));
  var edges = [];
  for (var i = 0; i < corners.length; i++) {
    for (var j = i + 1; j < corners.length; j++) {
      var d = (corners[i].x !== corners[j].x ? 1 : 0)
            + (corners[i].y !== corners[j].y ? 1 : 0)
            + (corners[i].z !== corners[j].z ? 1 : 0);
      if (d === 1) edges.push([corners[i], corners[j]]);
    }
  }
  return edges;
}

// ─── Visualizer3DCube ─────────────────────────────────────────────────────────
function Visualizer3DCube(container, G, options) {
  this.G        = G;
  this.options  = options || {};
  this.onSelect = null;

  this._selected      = null;
  this._showAxes      = false;
  this._chamberMeshes = [];
  this._planeMeshes   = [];
  this._planeLabels   = [];

  var W = container.clientWidth || 520;
  var H = W;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafaf8);

  this._camera   = new THREE.PerspectiveCamera(40, W / H, 0.1, 100);
  this._camTheta = Math.PI * 0.55;
  this._camPhi   = Math.PI * 0.32;
  this._camDist  = 5.8;
  this._updateCamera();

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.appendChild(renderer.domElement);
  this._renderer = renderer;
  this._canvas   = renderer.domElement;

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  var dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(2, 3, 4);
  scene.add(dir);
  this._scene = scene;

  this._buildChambers();
  this._buildEdges();
  this._buildFaceLabels();
  this._buildPlanes();

  this._setupOrbitControls();
  this._setupRaycaster();

  this._render();
}

Visualizer3DCube.prototype._buildChambers = function () {
  var self = this;
  this.G.elements.forEach(function (elem, idx) {
    var pts = cubeChamberTriangle(elem.sigma, elem.eps);
    var s1 = elem.eps[0] * elem.sigma[0];
    var faceNormal = octaVertex(s1).clone(); // unit normal of face σ(1)

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pts[0].x, pts[0].y, pts[0].z,
      pts[1].x, pts[1].y, pts[1].z,
      pts[2].x, pts[2].y, pts[2].z,
    ]), 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshLambertMaterial({
      color: COL.chamberDefault,
      side:  THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits:  1,
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.userData.elemIdx = idx;
    self._scene.add(mesh);
    self._chamberMeshes[idx] = mesh;

    // Chamber-triangle outline
    var lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pts[0].x, pts[0].y, pts[0].z,  pts[1].x, pts[1].y, pts[1].z,
      pts[1].x, pts[1].y, pts[1].z,  pts[2].x, pts[2].y, pts[2].z,
      pts[2].x, pts[2].y, pts[2].z,  pts[0].x, pts[0].y, pts[0].z,
    ]), 3));
    var lines = new THREE.LineSegments(lineGeom,
      new THREE.LineBasicMaterial({ color: COL.edge }));
    self._scene.add(lines);

    self._addCubeChamberLabel(elem, pts, faceNormal);
  });
};

Visualizer3DCube.prototype._addCubeChamberLabel = function (elem, triPts, faceNormal) {
  var c = centroid3(triPts[0], triPts[1], triPts[2]);

  var worldUp = new THREE.Vector3(0, 1, 0);
  var inPlaneUp = worldUp.clone().sub(
    faceNormal.clone().multiplyScalar(worldUp.dot(faceNormal))
  );
  if (inPlaneUp.lengthSq() < 0.01) {
    inPlaneUp = new THREE.Vector3(1, 0, 0).sub(
      faceNormal.clone().multiplyScalar(faceNormal.dot(new THREE.Vector3(1, 0, 0)))
    );
  }
  inPlaneUp.normalize();
  var inPlaneRight = new THREE.Vector3().crossVectors(inPlaneUp, faceNormal).normalize();

  var size = 0.42;
  var canvas = makeBnLabelCanvas(elem.label, { size: 256, fontPx: 125, color: '#1c3d5a' });
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  var planeMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
  });
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), planeMat);

  plane.position.copy(c).add(faceNormal.clone().multiplyScalar(0.005));
  var basis = new THREE.Matrix4().makeBasis(inPlaneRight, inPlaneUp, faceNormal);
  plane.setRotationFromMatrix(basis);
  plane.renderOrder = 5;

  this._scene.add(plane);
};

Visualizer3DCube.prototype._buildEdges = function () {
  var positions = [];
  cubeWireframeEdges().forEach(function (e) {
    positions.push(e[0].x, e[0].y, e[0].z, e[1].x, e[1].y, e[1].z);
  });
  var geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  this._scene.add(new THREE.LineSegments(geom,
    new THREE.LineBasicMaterial({ color: COL.edge })));
};

Visualizer3DCube.prototype._buildFaceLabels = function () {
  var self = this;
  [1, -1, 2, -2, 3, -3].forEach(function (val) {
    var sprite = makeTextSprite(String(val), {
      size: 128, font: 'bold 60px Georgia, serif', color: '#1c3d5a', scale: 0.32,
    });
    sprite.position.copy(octaVertex(val).clone().multiplyScalar(1.22));
    self._scene.add(sprite);
  });
};

// Same 9 hyperplanes as the octahedron, but extended further beyond the cube
// so they have a visible "skirt" outside the cube's surface.
Visualizer3DCube.prototype._buildPlanes = function () {
  var self = this;
  octaPlanes().forEach(function (p, axisIdx) {
    var n = p.normal.clone().normalize();
    var helper = (Math.abs(n.y) > 0.9)
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 1, 0);
    var u = new THREE.Vector3().crossVectors(helper, n).normalize();
    var v = new THREE.Vector3().crossVectors(n, u).normalize();

    var L = 2.5; // larger than octahedron's 1.4 — cube extends to ±1 on each axis
    var pA = new THREE.Vector3().addScaledVector(u, -L).addScaledVector(v, -L);
    var pB = new THREE.Vector3().addScaledVector(u,  L).addScaledVector(v, -L);
    var pC = new THREE.Vector3().addScaledVector(u,  L).addScaledVector(v,  L);
    var pD = new THREE.Vector3().addScaledVector(u, -L).addScaledVector(v,  L);

    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, pC.x, pC.y, pC.z,
      pA.x, pA.y, pA.z, pC.x, pC.y, pC.z, pD.x, pD.y, pD.z,
    ]), 3));
    geom.computeVertexNormals();

    var mat = new THREE.MeshBasicMaterial({
      color: COL.axisRed, transparent: true, opacity: 0.5,
      side: THREE.DoubleSide, depthWrite: false,
    });
    var mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    mesh.userData.isHyperplane = true;
    self._scene.add(mesh);
    self._planeMeshes[axisIdx] = mesh;

    var sprite = makeTextSprite(p.label, {
      size: 128, font: 'bold 60px Georgia, serif', color: '#d32f2f', scale: 0.22,
    });
    sprite.position.copy(p.labelPos);
    sprite.material.depthTest = false;
    sprite.visible = false;
    self._scene.add(sprite);
    self._planeLabels[axisIdx] = sprite;
  });
};

// Share scaffolding methods with Visualizer3D
Visualizer3DCube.prototype._updateCamera         = Visualizer3D.prototype._updateCamera;
Visualizer3DCube.prototype._render               = Visualizer3D.prototype._render;
Visualizer3DCube.prototype._setupOrbitControls   = Visualizer3D.prototype._setupOrbitControls;
Visualizer3DCube.prototype._setupRaycaster       = Visualizer3D.prototype._setupRaycaster;
Visualizer3DCube.prototype._select               = Visualizer3D.prototype._select;
Visualizer3DCube.prototype._applyHighlights      = Visualizer3D.prototype._applyHighlights;
Visualizer3DCube.prototype._updatePlaneVisibility = Visualizer3D.prototype._updatePlaneVisibility;
Visualizer3DCube.prototype.toggleAxes            = Visualizer3D.prototype.toggleAxes;

window.Visualizer3DCube = Visualizer3DCube;

})();
