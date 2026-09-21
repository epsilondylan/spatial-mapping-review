#!/usr/bin/env python3
"""Post-hoc descriptive analysis of sealed SFT evaluation. No model calls.

Run with Python + numpy. Reads only sealed evidence; writes only beside this file.
The frozen object F1's matching cardinality is independently reproduced with an
augmenting-path maximum bipartite matching (category and distance gated). The
frozen Hungarian solver minimizes distance among maximum-cardinality matches;
the two methods necessarily give identical counts at these finite thresholds.
Matched-position diagnostics use the frozen Hungarian matches, not the DFS match.
"""
import argparse
import collections
import hashlib
import json
import math
import pathlib
import re
import statistics
import sys
import numpy as np

sys.dont_write_bytecode = True
HERE = pathlib.Path(__file__).resolve().parent
WORKSPACE = HERE.parents[2]
NEW = 'full838_a_seed20260920'
ARMS = {'e2e': ['base', 'full128', NEW], 'reader': ['base', NEW]}
ALIASES = {'couch': 'sofa', 'lamp': 'floor_lamp', 'floor lamp': 'floor_lamp',
           'potted plant': 'plant', 'potted_plant': 'plant', 'desk': 'table',
           'cupboard': 'cabinet', 'round_stool': 'stool'}
THRESHOLDS = (.25, .5, .75, 1., 1.5)
SELECTED = ['w202609200', 'w202609222', 'w202609209', 'w202609208',
            'w202619206', 'w202619205', 'w202619226']

def read(p):
    return json.loads(p.read_text())

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def cat(value):
    value = str(value).strip().lower()
    return ALIASES.get(value, value.replace(' ', '_'))

def mean(values):
    values = list(values)
    return float(np.mean(values)) if values else None

def describe(values):
    values = list(values)
    if not values:
        return {'n': 0, 'mean': None, 'median': None, 'min': None, 'max': None}
    return {'n': len(values), 'mean': mean(values), 'median': float(np.median(values)),
            'min': float(min(values)), 'max': float(max(values)),
            'p25': float(np.quantile(values, .25)), 'p75': float(np.quantile(values, .75))}

def cardinality(pred, gt, threshold):
    adjacent = []
    for p in pred:
        edges = []
        if p.get('x') is not None and p.get('y') is not None:
            x, y = float(p['x']), float(p['y'])
            if math.isfinite(x) and math.isfinite(y):
                edges = [j for j, g in enumerate(gt)
                         if cat(p.get('category')) == cat(g['category']) and
                         math.hypot(x - g['x'], y - g['y']) <= threshold]
        adjacent.append(edges)
    assigned = {}
    def augment(i, visited):
        for j in adjacent[i]:
            if j in visited:
                continue
            visited.add(j)
            if j not in assigned or augment(assigned[j], visited):
                assigned[j] = i
                return True
        return False
    return sum(augment(i, set()) for i in range(len(pred)))

def parse_op(content):
    # Reproduce the frozen flash_client.parse_json extraction rule exactly.
    if not isinstance(content, str):
        return None
    try:
        return json.loads(content)
    except (ValueError, TypeError):
        pass
    decoder, found, i = json.JSONDecoder(), [], 0
    while i < len(content):
        if content[i] != '{':
            i += 1
            continue
        try:
            obj, end = decoder.raw_decode(content[i:])
            found.append(obj)
            i += end
        except ValueError:
            i += 1
    return found[0] if len(found) == 1 and isinstance(found[0], dict) else None

def behavior(phases, mode):
    ops = collections.Counter()
    invalid_ops = collections.Counter()
    rejections = collections.Counter()
    receipts = {}
    projection_points = 0
    projection = collections.Counter()
    phase_assistant = collections.Counter()
    for phase, messages in phases.items():
        for message_index, message in enumerate(messages):
            if message.get('role') == 'assistant':
                phase_assistant[phase] += 1
                op = parse_op(message.get('content'))
                opname = op.get('op', 'missing_op') if isinstance(op, dict) else 'unparseable'
                ops[f'{phase}:{opname}'] += 1
                if message.get('trainable') is False:
                    invalid_ops[f'{phase}:{opname}'] += 1
                if opname == 'project_ground' and isinstance(op.get('points'), list):
                    projection_points += len(op['points'])
                    projection['requested_operations'] += 1
                    projection['requested_points'] += len(op['points'])
                    following = messages[message_index + 1] if message_index + 1 < len(messages) else {}
                    blocks = following.get('content', []) if following.get('role') == 'user' else []
                    blocks = blocks if isinstance(blocks, list) else []
                    rejected = any(block.get('text', '').startswith('Rejected:') for block in blocks)
                    if rejected:
                        projection['whole_operation_rejected'] += 1
                    else:
                        receipts_with_points = []
                        for block in blocks:
                            try:
                                parsed = json.loads(block.get('text', ''))
                            except (ValueError, TypeError):
                                continue
                            if isinstance(parsed, dict) and isinstance(parsed.get('points'), list):
                                receipts_with_points.append(parsed)
                        if receipts_with_points:
                            assert len(receipts_with_points) == 1
                            points = receipts_with_points[0]['points']
                            errors = sum('error' in point for point in points)
                            projection['operations_with_structured_point_receipt'] += 1
                            projection['returned_points'] += len(points)
                            projection['returned_points_without_error'] += len(points) - errors
                            projection['returned_points_with_error'] += errors
                            projection['operations_with_any_point_error' if errors else 'operations_with_all_points_without_error'] += 1
                        else:
                            projection['operations_without_point_receipt'] += 1
            if message.get('role') != 'user' or not isinstance(message.get('content'), list):
                continue
            for block in message['content']:
                text = block.get('text', '')
                if text.startswith('Rejected:'):
                    rejections[f'{phase}:{text}'] += 1
                # E2E receipt replay appears twice; count only acquisition.
                if phase != ('acquire' if mode == 'e2e' else 'readout'):
                    continue
                try:
                    receipt = json.loads(text)
                except (ValueError, TypeError):
                    continue
                if isinstance(receipt, dict) and all(k in receipt for k in ['frame', 'requested_action', 'status']):
                    receipts[receipt['frame']] = receipt
    assert projection['requested_operations'] == ops['readout:project_ground']
    assert projection['requested_operations'] == (projection['whole_operation_rejected'] +
        projection['operations_with_structured_point_receipt'] + projection['operations_without_point_receipt'])
    assert projection['operations_with_structured_point_receipt'] == (projection['operations_with_any_point_error'] +
        projection['operations_with_all_points_without_error'])
    moves = [r for f, r in sorted(receipts.items()) if f != 1]
    moving = [r for r in moves if abs(r['requested_action'].get('move_m', 0)) > 1e-12]
    lower = sum(abs(r['requested_action'].get('move_m', 0)) for r in moving if r['status'] == 'executed')
    upper = lower + sum(abs(r['requested_action'].get('move_m', 0)) for r in moving if r['status'] == 'partial')
    return {'ops': dict(ops), 'invalid_or_point_error_ops': dict(invalid_ops),
            'projection_receipts': dict(projection),
            'explicit_rejections': dict(rejections), 'projection_points_requested': projection_points,
            'phase_assistant_messages': dict(phase_assistant), 'unique_receipts': len(receipts),
            'actual_observation_actions': len(moves), 'translation_action_receipts': len(moving),
            'pure_rotation_receipts': sum(abs(r['requested_action'].get('move_m', 0)) <= 1e-12 and
                                          abs(r['requested_action'].get('turn_deg', 0)) > 1e-12 for r in moves),
            'translation_receipt_status': dict(collections.Counter(r['status'] for r in moving)),
            'receipt_status': dict(collections.Counter(r['status'] for r in moves)),
            'absolute_turn_degrees': sum(abs(r['requested_action'].get('turn_deg', 0)) for r in moves),
            'translation_path_lower_m': lower, 'translation_path_upper_m': upper}

def bootstrap_difference(a, b, strata, seed=20260920, resamples=20000):
    delta = np.array(a, dtype=float) - np.array(b, dtype=float)
    rng = np.random.default_rng(seed)
    groups = [np.array([i for i, s in enumerate(strata) if s == key]) for key in sorted(set(strata))]
    values = np.zeros(resamples)
    for idx in groups:
        # Retain the observed subgroup proportions; NOT automatically 0.75/0.25.
        for start in range(0, resamples, 1000):
            stop = min(start + 1000, resamples)
            values[start:stop] += len(idx) / len(delta) * delta[rng.choice(idx, (stop - start, len(idx)))].mean(axis=1)
    return {'difference': mean(delta), 'ci95_descriptive': np.quantile(values, [.025, .975]).tolist(),
            'resamples': resamples, 'statistical_resampling_seed': seed,
            'stratum_counts': dict(collections.Counter(strata)),
            'weights': 'observed proportions within this subset; parent-world paired resampling',
            'multiplicity_adjusted': False}

def summary(rows):
    complete = [r for r in rows if r['complete']]
    result = {'n': len(rows), 'complete': len(complete), 'completion_rate': len(complete) / len(rows),
              'complete_zero_f1': sum(r['f1'] == 0 for r in complete),
              'failed': len(rows) - len(complete),
              'failure_reasons': dict(collections.Counter(r['failure_reason'] for r in rows if not r['complete']))}
    for k in ['f1', 'precision', 'recall', 'f1_025', 'pair_f1', 'pair_precision', 'pair_recall',
              'category_inventory_upper_bound_f1', 'frames', 'attempts', 'successful_call_responses',
              'completion_tokens', 'prompt_tokens', 'acquire_attempts', 'readout_attempts',
              'observed_gt_fraction_complete_only']:
        values = [r[k] for r in rows if r[k] is not None]
        result[k] = describe(values)
    result['threshold_curve'] = {str(t): mean(r['threshold_f1'][str(t)] for r in rows) for t in THRESHOLDS}
    result['completed_only'] = {k: mean(r[k] for r in complete) for k in ['f1', 'precision', 'recall', 'f1_025', 'category_inventory_upper_bound_f1']}
    result['conditional_position_world_medians'] = describe(r['position_median'] for r in complete if r['position_median'] is not None)
    result['conditional_position_object_errors'] = describe(d for r in complete for d in r['matched_errors'])
    result['totals'] = {k: sum(r[k] for r in rows) for k in ['attempts', 'successful_call_responses', 'completion_tokens', 'prompt_tokens', 'acquire_attempts', 'readout_attempts', 'frames']}
    result['budget'] = {'worlds_at_16_frames': sum(r['frames'] == 16 for r in rows),
                        'worlds_at_8_acquire_attempts': sum(r['acquire_attempts'] == 8 for r in rows),
                        'worlds_at_4_readout_attempts': sum(r['readout_attempts'] == 4 for r in rows),
                        'worlds_with_translation': sum(r['behavior']['translation_action_receipts'] > 0 for r in rows),
                        'worlds_with_any_invalid_or_point_error_op': sum(bool(r['behavior']['invalid_or_point_error_ops']) for r in rows),
                        'worlds_with_explicit_rejection': sum(bool(r['behavior']['explicit_rejections']) for r in rows),
                        'worlds_with_natural_finalization': sum(r['natural_finalization'] for r in rows)}
    result['behavior'] = {}
    for key in ['ops', 'invalid_or_point_error_ops', 'explicit_rejections', 'receipt_status', 'translation_receipt_status', 'projection_receipts']:
        count = collections.Counter()
        for r in rows:
            count.update(r['behavior'][key])
        result['behavior'][key] = dict(count)
    for key in ['actual_observation_actions', 'translation_action_receipts', 'pure_rotation_receipts',
                'absolute_turn_degrees', 'translation_path_lower_m', 'translation_path_upper_m', 'projection_points_requested']:
        result['behavior'][key] = describe(r['behavior'][key] for r in rows)
    result['hidden_target'] = {'n': sum(r['hidden_target'] is not None for r in rows),
                               'observed': sum(bool((r['hidden_target'] or {}).get('observed')) for r in rows),
                               'matched': sum(bool((r['hidden_target'] or {}).get('matched')) for r in rows)}
    result['hidden_target']['contingency'] = {
        f'observed_{obs}_matched_{mat}': sum(r['hidden_target'] == {'observed': obs, 'matched': mat} for r in rows)
        for obs in [False, True] for mat in [False, True]}
    return result

def contrast(a, b):
    assert [r['parent'] for r in a] == [r['parent'] for r in b]
    delta = [x['f1'] - y['f1'] for x, y in zip(a, b)]
    common = [(x, y) for x, y in zip(a, b) if x['complete'] and y['complete']]
    new_only = [(x, y) for x, y in zip(a, b) if x['complete'] and not y['complete']]
    result = {'n': len(a), 'a_arm': a[0]['arm'], 'b_arm': b[0]['arm'],
              'a_mean_f1': mean(r['f1'] for r in a), 'b_mean_f1': mean(r['f1'] for r in b),
              'difference_f1': mean(delta), 'wins': sum(d > 1e-12 for d in delta),
              'ties': sum(abs(d) <= 1e-12 for d in delta), 'losses': sum(d < -1e-12 for d in delta),
              'difference_completion_rate': mean(r['complete'] for r in a) - mean(r['complete'] for r in b),
              'completion_transitions': dict(collections.Counter(f'{y["complete"]}->{x["complete"]}' for x, y in zip(a, b))),
              'common_complete': {'n': len(common), 'parents': [x['parent'] for x, y in common]},
              'only_a_complete': {'n': len(new_only), 'a_mean_f1': mean(x['f1'] for x, y in new_only)},
              'regressions': [{'parent': x['parent'], 'a_f1': x['f1'], 'b_f1': y['f1'], 'delta': x['f1'] - y['f1']}
                              for x, y in zip(a, b) if x['f1'] < y['f1'] - 1e-12]}
    for key in ['f1', 'precision', 'recall', 'f1_025', 'pair_f1', 'category_inventory_upper_bound_f1', 'frames', 'attempts']:
        result['common_complete'][key] = {'a_mean': mean(x[key] for x, y in common),
                                         'b_mean': mean(y[key] for x, y in common),
                                         'difference': mean(x[key] - y[key] for x, y in common)}
    if common:
        result['common_complete']['f1_bootstrap'] = bootstrap_difference(
            [x['f1'] for x, y in common], [y['f1'] for x, y in common], [x['split'] for x, y in common])
    result['common_complete']['caution'] = 'Post-treatment selected subset; descriptive, not a causal effect or a mechanism share.'
    shared_object_errors = []
    for x, y in common:
        common_gt = set(x['matched_error_by_gt_id']) & set(y['matched_error_by_gt_id'])
        for gid in sorted(common_gt):
            shared_object_errors.append({'parent': x['parent'], 'gt_id': gid,
                                         'a_error_m': x['matched_error_by_gt_id'][gid],
                                         'b_error_m': y['matched_error_by_gt_id'][gid]})
    result['common_matched_gt_objects'] = {
        'objects': len(shared_object_errors), 'parents': len(set(r['parent'] for r in shared_object_errors)),
        'a_error_m': describe(r['a_error_m'] for r in shared_object_errors),
        'b_error_m': describe(r['b_error_m'] for r in shared_object_errors),
        'paired_error_difference_m': describe(r['a_error_m'] - r['b_error_m'] for r in shared_object_errors),
        'caution': 'Selected GT objects matched within 0.75m by both arms; descriptive object pooling only, no independent-object inference.'}
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', type=pathlib.Path, default=WORKSPACE)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    root = workspace / 'outputs/final_evaluation_evidence_v1/a_single_seed_20260920'
    manifest = read(root / 'manifest.json')
    sealed = read(workspace / 'outputs/analysis.json')
    outcomes = {(r['mode'], r['arm'], r['parent']): r for r in read(workspace / 'outputs/parent_world_outcomes.json')}
    sources = {}
    for name in ['analysis.json', 'parent_world_outcomes.json', 'final_report.md']:
        sources[f'outputs/{name}'] = sha(workspace / 'outputs' / name)
    all_input_hashes = dict(sources)
    def hash_input(path):
        all_input_hashes[str(path.relative_to(workspace))] = sha(path)
    hash_input(root / 'manifest.json')
    hash_input(root / 'source_snapshot/flash_client.py')
    hash_input(root / 'source_snapshot/scoring_frozen.py')
    gt_by_id = {s['id']: read(root / 'scenes' / s['id'] / 'private/gt.json')['objects'] for s in manifest}
    for s in manifest:
        hash_input(root / 'scenes' / s['id'] / 'private/gt.json')
    rows, validations = [], collections.Counter()
    for mode, arms in ARMS.items():
        for arm in arms:
            for scene in manifest:
                sid = scene['id']
                folder = root / 'results' / mode / arm / sid
                status = read(folder / 'status.json')
                hash_input(folder / 'status.json')
                hash_input(folder / 'phases.json')
                sources[str((folder / 'status.json').relative_to(workspace))] = sha(folder / 'status.json')
                expected_hash = sealed['status_hashes'][str((folder / 'status.json').relative_to(root))]
                assert sha(folder / 'status.json') == expected_hash
                phases = read(folder / 'phases.json')
                gt = gt_by_id[sid]
                complete = status['status'] == 'COMPLETE'
                pred = read(folder / 'prediction.json')['objects'] if complete else []
                if complete:
                    hash_input(folder / 'prediction.json')
                metrics = status.get('metrics', {}) if complete else {}
                met025 = status.get('metrics_025', {}) if complete else {}
                f1 = float(metrics.get('object_f1', 0) or 0)
                curve = {}
                for t in THRESHOLDS:
                    matches = cardinality(pred, gt, t)
                    curve[str(t)] = 2 * matches / (len(pred) + len(gt)) if complete else 0.
                    if complete and t in (.25, .75):
                        saved = (metrics if t == .75 else met025)
                        assert matches == saved['matched']
                        assert abs(curve[str(t)] - saved['object_f1']) < 1e-12
                        validations['recomputed_threshold_scores'] += 1
                gp, pp = collections.Counter(cat(g['category']) for g in gt), collections.Counter(cat(p.get('category')) for p in pred)
                inventory = sum((gp & pp).values())
                inventory_f1 = 2 * inventory / (len(pred) + len(gt)) if complete else 0.
                assert inventory_f1 + 1e-12 >= f1
                matched_errors = [math.hypot(float(pred[int(i)]['x']) - gt[int(j)]['x'], float(pred[int(i)]['y']) - gt[int(j)]['y'])
                                  for i, j in metrics.get('matches', {}).items()]
                metas = [(p.parent.name, read(p)) for p in sorted((folder / 'calls').glob('*/meta.json'))]
                for p in sorted((folder / 'calls').glob('*/meta.json')):
                    hash_input(p)
                assert len(metas) == status['metered_request_attempts']
                assert all(name.endswith('_0') for name, meta in metas)
                for key, saved_key in [('completion_tokens', 'all_attempt_reported_completion_tokens'), ('prompt_tokens', 'all_attempt_reported_prompt_tokens')]:
                    assert sum(m.get('usage', {}).get(key, 0) for _, m in metas) == status[saved_key]
                b = behavior(phases, mode)
                assert b['unique_receipts'] == status['frames'], (mode, arm, sid)
                row = {'parent': sid, 'mode': mode, 'arm': arm, 'split': scene['split'], 'family': scene['family'],
                       'complete': complete, 'failure_reason': (status.get('failure_classification') or {}).get('error'),
                       'f1': f1, 'precision': metrics.get('object_precision', 0) or 0,
                       'recall': metrics.get('object_recall', 0) or 0, 'f1_025': met025.get('object_f1', 0) or 0,
                       'pair_f1': metrics.get('pair_f1', 0) or 0, 'pair_precision': metrics.get('pair_precision', 0) or 0,
                       'pair_recall': metrics.get('pair_recall', 0) or 0,
                       'objects_gt': len(gt), 'objects_pred': len(pred), 'matched': metrics.get('matched', 0),
                       'threshold_f1': curve, 'category_inventory_upper_bound_matches': inventory,
                       'category_inventory_upper_bound_f1': inventory_f1,
                       'position_median': metrics.get('position_median'), 'matched_errors': matched_errors,
                       'matched_error_by_gt_id': {gt[int(j)]['id']: error for (i, j), error in zip(metrics.get('matches', {}).items(), matched_errors)},
                       'frames': status['frames'], 'attempts': len(metas), 'successful_call_responses': status['calls'],
                       'acquire_attempts': sum(name.startswith('acquire_') for name, meta in metas),
                       'readout_attempts': sum(name.startswith('readout_') for name, meta in metas),
                       'completion_tokens': status['all_attempt_reported_completion_tokens'],
                       'prompt_tokens': status['all_attempt_reported_prompt_tokens'],
                       'natural_finalization': status.get('natural_finalization', False),
                       'hidden_target': status.get('hidden_target'), 'behavior': b,
                       'observed_gt_fraction_complete_only': status.get('private_diagnostics', {}).get('observed_gt_instances', 0) / len(gt) if complete and mode == 'e2e' else None,
                       'prediction_objects': pred, 'gt_objects': gt,
                       'initial_request_messages_sha256': status.get('initial_request_messages_sha256')}
                o = outcomes[(mode, arm, sid)]
                assert abs(o['f1'] - f1) < 1e-12 and o['frames'] == row['frames'] and o['calls'] == row['successful_call_responses']
                rows.append(row)
                validations['status_hashes_verified'] += 1
                validations['call_metadata_verified'] += len(metas)
    index = {(r['mode'], r['arm'], r['parent']): r for r in rows}
    for s in manifest:
        a, b = index[('reader', 'base', s['id'])], index[('reader', NEW, s['id'])]
        assert a['initial_request_messages_sha256'] and a['initial_request_messages_sha256'] == b['initial_request_messages_sha256']
        validations['identical_reader_initial_requests'] += 1
    report = {'analysis_label': '事后探索性 / post-hoc exploratory; frozen confirmatory analysis unchanged',
              'method_version': '1.1', 'statistical_resampling_seed': 20260920,
              'statistical_resampling_seed_note': 'Fixed statistical RNG only; no new training seed or training run.',
              'source_hashes': sources, 'validation': dict(validations),
              'sealed_primary_contrasts_reference': sealed['results']['e2e']['contrasts'],
              'summaries': {}, 'contrasts': {}, 'split_summaries': {}, 'family_summaries': {},
              'family_contrasts_ordinary_only': {}, 'selected_worlds': {sid: [] for sid in SELECTED}}
    for mode, arms in ARMS.items():
        report['summaries'][mode] = {}
        report['split_summaries'][mode] = {}
        report['family_summaries'][mode] = {}
        report['contrasts'][mode] = {}
        report['family_contrasts_ordinary_only'][mode] = {}
        for arm in arms:
            subset = [r for r in rows if r['mode'] == mode and r['arm'] == arm]
            report['summaries'][mode][arm] = summary(subset)
            original = sealed['results'][mode]['summaries'][arm]
            for key, ours in [('mean_f1', mean(r['f1'] for r in subset)), ('world_mean_precision', mean(r['precision'] for r in subset)),
                              ('world_mean_recall', mean(r['recall'] for r in subset)), ('mean_frames', mean(r['frames'] for r in subset))]:
                assert abs(original[key] - ours) < 1e-12
            report['split_summaries'][mode][arm] = {s: summary([r for r in subset if r['split'] == s]) for s in sorted(set(r['split'] for r in subset))}
            # Keep ordinary family occlusion distinct from verified physical occlusion.
            report['family_summaries'][mode][arm] = {f: summary([r for r in subset if r['family'] == f and r['split'] == 'a_confirm_ordinary']) for f in sorted(set(r['family'] for r in subset))}
        for old in arms:
            if old == NEW:
                continue
            newer = [index[(mode, NEW, s['id'])] for s in manifest]
            older = [index[(mode, old, s['id'])] for s in manifest]
            key = f'{NEW}_minus_{old}'
            report['contrasts'][mode][key] = contrast(newer, older)
            report['contrasts'][mode][key]['by_split'] = {s: contrast([r for r in newer if r['split'] == s], [r for r in older if r['split'] == s]) for s in sorted(set(r['split'] for r in newer))}
            report['family_contrasts_ordinary_only'][mode][key] = {f: contrast([r for r in newer if r['family'] == f and r['split'] == 'a_confirm_ordinary'], [r for r in older if r['family'] == f and r['split'] == 'a_confirm_ordinary']) for f in sorted(set(r['family'] for r in newer))}
    report['e2e_vs_reader_descriptive'] = {}
    for arm in ['base', NEW]:
        a = [index[('e2e', arm, s['id'])] for s in manifest]
        b = [index[('reader', arm, s['id'])] for s in manifest]
        report['e2e_vs_reader_descriptive'][arm] = contrast(a, b)
        report['e2e_vs_reader_descriptive'][arm]['caution'] = 'Different sensor evidence and acquisition/readout interactions. This contrast is not the causal contribution of active exploration.'
    for r in rows:
        if r['parent'] in SELECTED:
            report['selected_worlds'][r['parent']].append(r)
    report['limitations'] = [
        'All newly computed results are exploratory, descriptive and unadjusted for multiple comparisons. The frozen primary endpoint remains decisive.',
        'Common-complete subsets condition on model-dependent completion. They diagnose output quality among selected paired parents; they do not identify a causal mechanism.',
        'Completion gains, reader gains and e2e gains cannot be subtracted or ratioed into mechanism shares.',
        'Category-inventory F1 ignores position and which instance is which; it is a permissive count-based upper bound, not a recognition accuracy or causal attribution.',
        'Position errors include only category-correct matches within 0.75m and are selected/truncated. Lower conditional error alone does not establish better localization for all objects.',
        'Object-error pooling and category counts are descriptive only; inference resamples parent worlds, never objects, frames or calls.',
        'Physical-occlusion observed/matched flags are the frozen status diagnostics. Matching without observed is possible under category+distance scoring and is not visual evidence.',
        'Movement path is bounded by public receipts; partial actual distance is unknown. Requested steps not executed after blocked/partial are excluded.',
        'More frames/calls are associated with better performance but no randomized budget control identifies their causal contribution.',
        'Reader compares identical initial sensor requests, but subsequent tool queries and conversations may differ; it measures reader policy/output capability as a whole.',
        'Projection points without tool errors satisfy the tool checks only; they need not be actual ground pixels, correct instance correspondences or object centers.',
        'One training seed and same procedural asset system; full838 vs full128 mixes dataset amount/composition/quality and optimizer updates.',
        'Ordinary family summaries have 12 parents each. Ordinary family named occlusion is kept separate from the 32 verified physical-occlusion parents.'
    ]
    (HERE / 'input_hashes.json').write_text(json.dumps(all_input_hashes, ensure_ascii=False, indent=2) + '\n')
    report['input_hash_manifest'] = {'file': 'input_hashes.json', 'sha256': sha(HERE / 'input_hashes.json'), 'files': len(all_input_hashes)}
    (HERE / 'quantitative_analysis.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (HERE / 'per_world_quantitative.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
    (HERE / 'reproduction_manifest.json').write_text(json.dumps({'script_sha256': sha(pathlib.Path(__file__)),
        'analysis_sha256': sha(HERE / 'quantitative_analysis.json'), 'per_world_sha256': sha(HERE / 'per_world_quantitative.json'),
        'numpy_version': np.__version__, 'python_version': sys.version, 'validation': dict(validations)}, indent=2) + '\n')
    print(json.dumps({'written': str(HERE), 'validation': dict(validations)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
