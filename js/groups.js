// Configuration table for all 13 Coxeter groups on this site.
// Each entry maps a group ID string to its display metadata.
// The math engine (DihedralGroup / SymmetricGroup / HyperoctahedralGroup)
// is instantiated separately by group-page.js using the family and n fields.

var GROUPS = {

  // ── Dihedral ──────────────────────────────────────────────────────────────
  D3: { name: 'D_3', family: 'dihedral',        n: 3, polytope: 'equilateral triangle',
        iso: [{ label: 'S_3', id: 'S3' }] },
  D4: { name: 'D_4', family: 'dihedral',        n: 4, polytope: 'square',
        iso: [{ label: 'B_2', id: 'B2' }] },
  D5: { name: 'D_5', family: 'dihedral',        n: 5, polytope: 'regular pentagon',
        iso: [] },
  D6: { name: 'D_6', family: 'dihedral',        n: 6, polytope: 'regular hexagon',
        iso: [] },
  D7: { name: 'D_7', family: 'dihedral',        n: 7, polytope: 'regular heptagon',
        iso: [] },
  D8: { name: 'D_8', family: 'dihedral',        n: 8, polytope: 'regular octagon',
        iso: [] },

  // ── Simplex (Symmetric) ───────────────────────────────────────────────────
  S1: { name: 'S_1', family: 'symmetric',       n: 1, polytope: 'point',
        iso: [] },
  S2: { name: 'S_2', family: 'symmetric',       n: 2, polytope: 'line segment',
        iso: [{ label: 'B_1', id: 'B1' }] },
  S3: { name: 'S_3', family: 'symmetric',       n: 3, polytope: 'equilateral triangle',
        iso: [{ label: 'D_3', id: 'D3' }] },
  S4: { name: 'S_4', family: 'symmetric',       n: 4, polytope: 'regular tetrahedron',
        iso: [] },

  // ── Octahedral (Hyperoctahedral) ──────────────────────────────────────────
  B1: { name: 'B_1', family: 'hyperoctahedral', n: 1, polytope: 'line segment',
        iso: [{ label: 'S_2', id: 'S2' }] },
  B2: { name: 'B_2', family: 'hyperoctahedral', n: 2, polytope: 'square',
        iso: [{ label: 'D_4', id: 'D4' }] },
  B3: { name: 'B_3', family: 'hyperoctahedral', n: 3, polytope: 'cube',
        iso: [] },

  // Same math group as B_3, but visualised as the dual (octahedron) instead of the cube.
  B3oct: { name: 'B_3', family: 'hyperoctahedral', n: 3, polytope: 'octahedron',
        iso: [] },
};
