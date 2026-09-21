"""Recheck public maps with only the Python standard library.
Run: python3 verify_public.py
Reads ../data.json and ../cases.json. No requests, model calls or training.
The matching cardinality reproduces category-gated frozen Hungarian F1;
this does not reproduce distance-minimizing matched-position statistics.
"""
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
data = json.loads((ROOT / 'data.json').read_text())
cases = json.loads((ROOT / 'cases.json').read_text())
aliases = {'couch': 'sofa', 'lamp': 'floor_lamp', 'floor lamp': 'floor_lamp',
           'potted plant': 'plant', 'potted_plant': 'plant', 'desk': 'table',
           'cupboard': 'cabinet', 'round_stool': 'stool'}

def category(c):
    c = str(c).strip().lower()
    return aliases.get(c, c.replace(' ', '_'))

def f1(pred, gt, radius):
    edges = []
    for p in pred:
        valid = isinstance(p.get('x'), (float, int)) and isinstance(p.get('y'), (float, int))
        edges.append([j for j, g in enumerate(gt) if valid
                      and category(p['category']) == category(g['category'])
                      and math.hypot(p['x']-g['x'], p['y']-g['y']) <= radius])
    matched = {}
    def augment(i, seen):
        for j in edges[i]:
            if j in seen:
                continue
            seen.add(j)
            if j not in matched or augment(matched[j], seen):
                matched[j] = i
                return True
        return False
    count = sum(augment(i, set()) for i in range(len(pred)))
    return 2*count/(len(pred)+len(gt)) if pred or gt else 0

checks = 0
for world in data['worlds']:
    for mode, outputs in world['outputs'].items():
        for arm, output in outputs.items():
            for radius, key in [(.75, 'metrics'), (.25, 'metrics_025')]:
                expected = (output.get(key) or {}).get('object_f1', 0)
                score = f1(output['prediction'], world['gt'], radius)
                assert abs(score-expected) < 1e-12, (world['id'], mode, arm, radius)
                if radius == .75:
                    assert abs(score-output['primary_f1']) < 1e-12
                checks += 1
for summary in data['summaries']:
    values = [w['outputs'][summary['mode']][summary['arm']] for w in data['worlds']]
    assert sum(o['status'] == 'COMPLETE' for o in values) == summary['complete']
    assert abs(sum(o['primary_f1'] for o in values)/128-summary['mean_f1']) < 1e-12
media_checks = 0
for case in cases['cases']:
    for media in case['media']:
        assert hashlib.sha256((ROOT / media['local']).read_bytes()).hexdigest() == media['sha256']
        media_checks += 1
print(json.dumps({'status': 'PASS', 'parents': len(data['worlds']),
                  'score_checks_including_failed_zero': checks,
                  'summary_groups': len(data['summaries']),
                  'case_rgb_sha256_checks': media_checks,
                  'new_model_calls': 0}, indent=2))
