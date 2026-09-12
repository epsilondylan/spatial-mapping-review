# Two-scene strategy / perception crossover

Status: {'COMPLETE': 52, 'FAILED': 8}. Expected: 24 map readouts + 36 single-image readouts.

All readers receive the same first 40 acquired RGB frames and public actions from each donor. No donor notes, answers, poses, segmentation, GT, or scores enter inference. Fresh direct API requests, no tools. Thinking requested for all models. This tests fixed-evidence interpretation, not autonomous exploration itself.

## Crossover map results

| Scene | Donor | Reader | Valid / planned | Map F1 mean [min, max] | Inventory category F1 | Median position error (ungated) |
|---|---|---|---|---|---|---|
| 91103 | flash | qwen | 2/2 | 0.059 [0.000, 0.118] | 0.824 | 2.490 m |
| 91103 | flash | gemma | 1/2 | 0.400 [0.400, 0.400] | 0.933 | 0.843 m |
| 91103 | flash | flash | 2/2 | 0.562 [0.375, 0.750] | 1.000 | 0.607 m |
| 91103 | gemma | qwen | 1/2 | 0.125 [0.125, 0.125] | 1.000 | 1.013 m |
| 91103 | gemma | gemma | 2/2 | 0.188 [0.125, 0.250] | 1.000 | 1.307 m |
| 91103 | gemma | flash | 2/2 | 0.500 [0.375, 0.625] | 1.000 | 0.825 m |
| 91105 | flash | qwen | 2/2 | 0.446 [0.267, 0.625] | 0.967 | 1.682 m |
| 91105 | flash | gemma | 0/2 | — | nan | nan m |
| 91105 | flash | flash | 2/2 | 0.875 [0.875, 0.875] | 0.938 | 0.216 m |
| 91105 | gemma | qwen | 2/2 | 0.196 [0.125, 0.267] | 0.838 | 1.964 m |
| 91105 | gemma | gemma | 2/2 | 0.000 [0.000, 0.000] | 0.849 | 2.039 m |
| 91105 | gemma | flash | 2/2 | 0.750 [0.625, 0.875] | 0.875 | 0.201 m |

## Single-image perception

Conditional scores below include GT-independent normalization of root lists / bbox_2d, if needed. Strict protocol status is retained. Truncated reasoning is never normalized into an answer. Do not compare conditional means without also checking common-input scores and completion rates.

| Reader | Strict + normalized / planned | Category F1 (conditional) | Category + IoU≥0.25 F1 | IoU≥0.5 F1 | Common-input category F1 |
|---|---|---|---|---|---|
| qwen | 11 + 1/12 | 0.765 | 0.597 | 0.523 | 0.786 (n=9) |
| gemma | 9 + 0/12 | 0.785 | 0.673 | 0.618 | 0.785 (n=9) |
| flash | 12 + 0/12 | 0.862 | 0.770 | 0.741 | 0.881 (n=9) |

## Malformed map-frame declarations: sensitivity only

The following complete answers returned an invalid frame declaration. If their numeric positions are interpreted in the requested start-camera frame, the resulting scores are below. These remain strict protocol failures; no model answer is edited or regenerated.
- map_bank_01_gemma_r2, declared frame [0, 0]: assumption-only object F1 0.000.
- map_bank_03_gemma_r1, declared frame [0, 0]: assumption-only object F1 0.133.
- map_bank_03_gemma_r2, declared frame [0, 0]: assumption-only object F1 0.000.

## Post-hoc no-thinking supplement

Failure-selected Gemma examples; the thinking baseline remains unchanged. Not a representative thinking/no-thinking comparison.

| Input | Thinking baseline | No-thinking status | Category F1 | Bbox IoU≥0.25 F1 | Time |
|---|---|---|---|---|---|
| vision_bank_01_gemma_f40 | length-truncated, no final answer | COMPLETE | 1.0 | 0.0 | 1.57 s |
| vision_bank_02_gemma_f01 | length-truncated, no final answer | COMPLETE | 0.7272727272727273 | 0.0 | 2.89 s |

Both no-thinking outputs used coordinates extending to approximately 1000 despite the requested 0–511 pixel convention. A separately reported, fixed 511/1000 unit conversion (not fitted to GT) recovers the boxes. This diagnoses a coordinate-protocol issue; raw scores remain unchanged.
- vision_bank_01_gemma_f40: fixed-conversion bbox F1 @0.5 = 1.000.
- vision_bank_02_gemma_f01: fixed-conversion bbox F1 @0.5 = 0.727.

## Evidence availability

[
  {
    "bank": "bank_01",
    "scene": 91103,
    "donor": "flash",
    "seen_objects": 8,
    "seen_ids": [
      "o0",
      "o1",
      "o2",
      "o3",
      "o4",
      "o5",
      "o6",
      "o7"
    ],
    "objects_gt": 8,
    "unique_images": 39,
    "collisions": 0
  },
  {
    "bank": "bank_02",
    "scene": 91103,
    "donor": "gemma",
    "seen_objects": 8,
    "seen_ids": [
      "o0",
      "o1",
      "o2",
      "o3",
      "o4",
      "o5",
      "o6",
      "o7"
    ],
    "objects_gt": 8,
    "unique_images": 33,
    "collisions": 0
  },
  {
    "bank": "bank_03",
    "scene": 91105,
    "donor": "flash",
    "seen_objects": 8,
    "seen_ids": [
      "o0",
      "o1",
      "o2",
      "o3",
      "o4",
      "o5",
      "o6",
      "o7"
    ],
    "objects_gt": 8,
    "unique_images": 37,
    "collisions": 0
  },
  {
    "bank": "bank_04",
    "scene": 91105,
    "donor": "gemma",
    "seen_objects": 8,
    "seen_ids": [
      "o0",
      "o1",
      "o2",
      "o3",
      "o4",
      "o5",
      "o6",
      "o7"
    ],
    "objects_gt": 8,
    "unique_images": 31,
    "collisions": 0
  }
]

## Interpretation limits

Two deliberately selected scenes and two map repetitions are diagnostic, not a population-level ranking. A strong reader succeeding on a weak donor trajectory shows that trajectory can contain enough evidence; it does not prove all exploration policies equivalent. Single-image categories test recognition; boxes additionally test localization. Good single-image scores with poor maps implicate multiview association, geometry, action integration, or long-context behavior. This protocol supplies all acquired frames, including frames the original agent might not have opened, and uses a fresh context rather than its native agent harness. Invalid calls are reported separately, never silently converted into spatial errors.

![Crossover](crossover.png)
