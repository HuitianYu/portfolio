# Curvature Lab

English browser UI following the PBM / MPCrystal visual style. Sources are read-only; all outputs were created separately.

## Open and data sources

The Hugo build generates `/labs/curvature/ui/`. Keep the complete Lab bundle together. Local examples are supplied with the site and load on demand; Cloud entries are retrieved from the configured scientific dataset. User mesh uploads and local folder connections are disabled.

The catalog contains 1,497 entries across three size groups. Fifteen examples are supplied locally; other entries require network access. A failed remote request leaves the controls available to select a Local example.

## Defaults and smoothing

Default size group: 300–350. Crystal choices are sorted by reference roundness ascending; the default is the middle entry, crystal_215_0p44392. Mean curvature H is calculated on load. Display settings and camera view persist across crystal and geometry changes.

Optional class smoothing follows `Mesh.smooth(iterations=5, verts_iterations=5, factor=None)`: normalised |H| weights, a complementary pass, then a uniform pass. The final smoothing strength is 1 minus the uniform self-weight; 0.5 matches the original. Every application starts from the original selected geometry. Curvature is recalculated after smoothing. Disable smoothing to restore the raw mesh. Constant-H weights use 0.5 to avoid the original zero-denominator edge case. Smoothing and curvature run in browser workers.

Smoothing matched the original class on the reference mesh to 8.9e-16 maximum coordinate difference.

## Provenance and interpretation

Original group names represent the unabraded crystal's half-diagonal length. No coordinate unit is inferred. Filename `0p063543` is Rheinhold reference roundness 0.063543 from the Minkowski-addition calculation. That reference belongs to the parent single crystal and is not a newly computed agglomerate or broken roundness.

Existing MAT files already contain all three surfaces. Generation is not repeated.

- Agglomerate generator: `code-huitian-yu/subroutines/merge_crystals.m`.
- Broken generator: `code-huitian-yu/subroutines/break_crystals.m`.
- Calls: `code-huitian-yu/create_simulated_crystals.m`, lines 153/161, 347/355, 541/549.
- Mesh plotting and curvature: `Python/Mesh/python/CT/classes/mesh.py`, `calc_curvature`, `plot`; another copy exists in `code-huitian-yu/subroutines/python/CT/classes/mesh.py`.
- Example usage: `subroutines/python/CT/paper1.py`, starting around line 575.

Normalisation divides coordinates by the selected geometry's volume-equivalent diameter `(6V/π)^(1/3)`. H and principal curvatures therefore multiply by that diameter; K by its square. Original coordinates retain their native source units.

Curvature uses mixed Voronoi vertex areas, angle-weighted vertex normals, angle-defect K and signed cotangent-Laplacian H; κ₁,₂ = H ± sqrt(max(H²−K,0)). 2–98% clipping only changes the colour mapping.

## Numerical corrections and validation

The provided Python `_check_direction` reverses face indices and cotangents without reversing `_angles`. Subsequent `_calc_K` may accumulate corner angles at the wrong vertices. This implementation maintains corner correspondence. The original `add_at` also uses unsynchronised parallel scatter updates; the reference comparison used deterministic `numpy.add.at`.

Browser calculation matched the supplied Python implementation on 5,184 vertices after correcting that angle mapping: maximum absolute errors H ≈ 1.1e-14, K ≈ 8.2e-12. Curvature scale laws under doubling of coordinates were verified. Browser checks covered geometry switching, reference roundness, curvature calculation and responsive layout.

Original files were not edited. Browser support requires modern JavaScript and DecompressionStream (current Edge / Chrome).
