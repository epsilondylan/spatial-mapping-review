# 91103 / 91105 fixed-evidence crossover

Selection is diagnostic: 91103 has complete 200-frame Gemma/Flash trajectories with a large map gap; 91105 has an accurate short Flash trajectory and poor long Qwen/Gemma trajectories. These are not randomly sampled scenes.

## Frozen interventions

Four observation banks: two scenes × Flash/Gemma donors, each exactly the first 40 acquired frames. Every reader receives the same 40 RGB images and the same public action receipts in temporal order, with an identical prompt. Donor identities, notes, maps, model reasoning, and scene IDs are absent from the actual model messages. There are three readers (Qwen3.8-27B, Gemma4-31B, Gemini3.8-Flash), two fresh repetitions each, and 24 map requests total.

Single-image recognition uses frames 1, 20, 40 of every bank, fixed before examining segmentation. Each of three readers gets all 12 inputs: 36 requests. Initial views may repeat across donors; these are repeated measurements, not independent scenes. Empty views remain in the diagnostic; report their effect separately. No additional observations or actions are available to any reader.

All requests ask for thinking. Qwen/Gemma use `enable_thinking=true`; Flash uses `reasoning_effort=high`. Map completion cap 32,768 tokens; single-image cap 8,192; temperature 0.6. Native image tokenizers and reasoning budgets differ, so equal pixels and requested settings do not imply equal internal computation. Qwen exposes `reasoning_content`; Gemma emits thought channel text; Flash exposes reasoning-token usage but not its private reasoning text. Original native agent harnesses are deliberately removed in this diagnostic.

## Isolation and audit

1. `build_inputs.py` reads only allowlisted donor `work/history.jsonl` fields and `work/observations/obs_####.png`. It copies and hashes RGB images.
2. `run.py` reads the frozen packets, endpoint settings, and provider credentials. It does not import an evaluator or read private scene files. Actual API messages contain only the shared task prompt, RGB data, and public receipts. There are no tools, executable callbacks, filesystem access, or evaluator feedback available to the model. Credentials exist only in HTTP headers and are not saved in request JSON.
3. `evaluate.py` alone opens private GT and segmentation. It reads saved predictions and writes offline reports. It performs no model calls and has no path feeding reference data into inference.
4. Save every exact request and response, request hash, requested and returned model identity, timing, usage, termination reason, and strict parse status. A provider alias is an observed endpoint identity, not independent authentication of the underlying weights.

## Prespecified metrics and interpretation

Map: original category-gated one-to-one matching within 0.75 m, object F1 and relation recall; category inventory F1 without geometry; category-matched position error without the distance cutoff; post-hoc rigid alignment only as a separately labeled diagnostic.

Single image: category multiset F1 and same-category bounding-box IoU F1 at 0.25 and 0.5. Visible GT instances require ≥263 segmentation pixels, matching the original visibility criterion. Boxes enclose visible pixels rather than amodal object extent. Generic-category alias rules are inherited unchanged from the original scorer. Protocol failures are separate from perception failures. Any deterministic format normalization is reported separately and is never a new model answer.

Interpretation: Flash succeeding on Gemma evidence demonstrates that those views can suffice for a strong reader. Qwen/Gemma improving on Flash evidence supports a strategy/evidence contribution. Poor single-image recognition points toward perception; good single-image results with poor maps points toward association, geometry, action integration, or context management. Differences between these fresh 40-image readouts and original agents can also reflect tool use and harness effects. No two-scene result establishes a population-wide causal percentage.

## Operational scope

Four GPUs total (two each for local readers); 20 Flash API requests. Existing Opus experiments are independent. Local services stop when all crossover requests finish. Transport failures may retry once; no model calls receive GT-based repair prompts.

## Post-hoc supplement (separate from the primary 60 calls)
After the first two Gemma single-image responses hit the 8192-token cap while repeating coordinate estimates, replay those exact two prompts/images once with enable_thinking=false. This failure-selected, two-call local diagnostic tests whether a generation loop masks available recognition. It is not a general thinking/no-thinking benchmark, is scored offline, and does not change the primary thinking baseline.

A separate single Flash transport diagnostic replays bank_02 (Gemma donor, scene 91103) with the same messages, temperature and output cap, but native Chat SSE, after the first non-streaming 40-image map call exceeded 12 minutes without a response. This is a post-hoc transport check, separate from the 60 planned calls; preserve SSE events and do not silently replace primary requests.

## Transport recovery
The SSE diagnostic completed in 79.57 s while the initial nonstreaming request was still pending after >14 min. Canonical Flash map readouts now use native Chat SSE with identical messages and generation settings. Reuse the completed bank_02 repetition unchanged; run the remaining seven map readouts with up to three concurrent requests. Original nonstreaming attempt and seven administrative queue cancellations remain archived under results/. Cancelled jobs made no API request and are not model failures. Canonical Flash map evidence is under flash_stream/. The original pending nonstream request will be cancelled only after both local reader queues finish, so no local inference is interrupted.

Final transport outcome: the original nonstreaming map request eventually completed after 1342.6 seconds, with object F1 0.375. It remains a noncanonical extra result (report/superseded_nonstream_result.json); it was not used to choose or replace any SSE repetition. All 60 canonical requests completed or terminated; both local GPU jobs are inactive.
