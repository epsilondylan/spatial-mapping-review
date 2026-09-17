const NS = 'http://www.w3.org/2000/svg';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const finite = value => Number.isFinite(Number(value));

function normalizedCategory(value) {
  const compact = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
  if (compact.includes('plant')) return 'plant';
  if (compact.includes('floorlamp')) return 'floorlamp';
  if (compact.includes('sidetable')) return 'table';
  return compact;
}

function framePosition(frame) {
  const pose = frame.review_pose;
  if (Array.isArray(pose?.camera_xy) && pose.camera_xy.every(finite)) return {x: +pose.camera_xy[0], y: +pose.camera_xy[1], heading: pose.clockwise_heading_deg, source: '离线渲染位姿'};
  const offline = frame.reference?.camera_xy;
  if (Array.isArray(offline) && offline.every(finite)) return {x: +offline[0], y: +offline[1], source: '离线评测位姿'};
  const camera = frame.receipt?.camera;
  if (finite(camera?.camera_x) && finite(camera?.camera_y)) return {x: +camera.camera_x, y: +camera.camera_y, heading: camera.clockwise_heading_deg, source: '固定输入位姿'};
  return null;
}

function pathFor(run) {
  return (run.frames || []).map((frame, index) => {
    const position = framePosition(frame);
    return position && {...position, frame, index};
  }).filter(Boolean);
}

function objectKey(item) {
  const id = String(item.id || item.category || '').toLowerCase().replace(/potted/g, '').replace(/[\s_-]/g, '');
  return id || normalizedCategory(item.category);
}

function evidenceFrame(item) {
  const values = (item.evidence || []).map(value => {
    if (finite(value)) return +value;
    const source = String(value?.frame_id || value?.frame || '');
    const match = source.match(/(\d+)/);
    return match ? +match[1] : null;
  }).filter(finite);
  return values.length ? Math.min(...values) : null;
}

function firstEntries(checkpoints) {
  const entries = new Map();
  for (const checkpoint of checkpoints) for (const item of checkpoint.prediction?.objects || []) {
    const key = objectKey(item);
    const evidence = evidenceFrame(item);
    if (!entries.has(key)) {
      entries.set(key, {budget: checkpoint.budget, actual: checkpoint.meta?.actual_frames ?? checkpoint.budget, evidence});
      continue;
    }
    const previous = entries.get(key);
    if (evidence !== null && (previous.evidence === null || evidence < previous.evidence)) previous.evidence = evidence;
  }
  return entries;
}

function predictedObjects(prediction, entries) {
  return (prediction?.objects || []).filter(item => finite(item.x) && finite(item.y)).map(item => ({
    ...item, x: +item.x, y: +item.y, category: item.category || item.id || '未命名物体', first: entries.get(objectKey(item)),
  }));
}

function matchedPairs(prediction, gt) {
  const candidates = [];
  for (let left = 0; left < prediction.length; left += 1) for (let right = 0; right < gt.length; right += 1) {
    if (normalizedCategory(prediction[left].category) !== normalizedCategory(gt[right].category)) continue;
    const distance = Math.hypot(prediction[left].x - gt[right].x, prediction[left].y - gt[right].y);
    if (distance <= 0.75) candidates.push({left, right, distance});
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const usedLeft = new Set(), usedRight = new Set();
  return candidates.filter(pair => {
    if (usedLeft.has(pair.left) || usedRight.has(pair.right)) return false;
    usedLeft.add(pair.left); usedRight.add(pair.right); return true;
  });
}

function svgNode(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionText(frame) {
  const action = frame.receipt?.requested_action;
  if (!action) return frame.receipt?.label || frame.receipt?.status || '未保存动作回执';
  return '转向 ' + (action.turn_deg ?? 0) + '°；移动请求 ' + (action.move_m ?? 0) + ' m；' + (frame.receipt?.status || '已记录');
}

function drawOverlay({gt, prediction, path, run, onSelectFrame}) {
  const width = 640, height = 470, padding = {left: 48, right: 16, top: 18, bottom: 43};
  const all = [...gt, ...prediction, ...path];
  const xs = all.map(item => item.x), ys = all.map(item => item.y);
  let xmin = Math.min(...xs, 0) - 0.75, xmax = Math.max(...xs, 0) + 0.75;
  let ymin = Math.min(...ys, 0) - 0.75, ymax = Math.max(...ys, 0) + 0.75;
  if (xmax - xmin < 3) { xmin -= 1; xmax += 1; }
  if (ymax - ymin < 3) { ymin -= 1; ymax += 1; }
  const scale = Math.min((width - padding.left - padding.right) / (xmax - xmin), (height - padding.top - padding.bottom) / (ymax - ymin));
  const X = x => padding.left + (x - xmin) * scale, Y = y => height - padding.bottom - (y - ymin) * scale;
  const svg = svgNode('svg', {viewBox: '0 0 ' + width + ' ' + height, class: 'trajectory-map-svg', role: 'img', 'aria-label': '模型轨迹、预测地图与离线真值叠加图'});
  const draw = (tag, attrs, text) => { const node = svgNode(tag, attrs, text); svg.append(node); return node; };
  const step = Math.max(1, Math.ceil(Math.max(xmax - xmin, ymax - ymin) / 10));
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    draw('line', {x1: X(x), x2: X(x), y1: Y(ymin), y2: Y(ymax), stroke: '#e3e8ef'});
    draw('text', {x: X(x), y: height - 20, 'text-anchor': 'middle', 'font-size': 10, fill: '#758297'}, x.toFixed(0));
  }
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
    draw('line', {x1: X(xmin), x2: X(xmax), y1: Y(y), y2: Y(y), stroke: '#e3e8ef'});
    draw('text', {x: 36, y: Y(y) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#758297'}, y.toFixed(0));
  }
  draw('text', {x: width / 2, y: height - 4, 'text-anchor': 'middle', 'font-size': 11, fill: '#65748a'}, 'start_camera_xy · 米');
  const pairs = matchedPairs(prediction, gt);
  for (const pair of pairs) draw('line', {x1: X(prediction[pair.left].x), y1: Y(prediction[pair.left].y), x2: X(gt[pair.right].x), y2: Y(gt[pair.right].y), stroke: '#8b6fc4', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', opacity: .8});
  if (path.length > 1 && run.kind !== 'static') draw('polyline', {points: path.map(point => String(X(point.x)) + ',' + String(Y(point.y))).join(' '), fill: 'none', stroke: '#1e344c', 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'});
  for (const point of path) {
    const marker = draw('circle', {cx: X(point.x), cy: Y(point.y), r: point.index === path.length - 1 ? 6 : 4.2, fill: '#1e344c', stroke: '#ffffff', 'stroke-width': 1.5, class: onSelectFrame ? 'trajectory-frame-marker' : ''});
    marker.append(svgNode('title', {}, '第 ' + point.frame.id + ' 帧 · ' + actionText(point.frame) + ' · ' + point.source));
    if (onSelectFrame) marker.addEventListener('click', () => onSelectFrame(point.frame.id));
    if (path.length <= 20 || point.index === 0 || point.index === path.length - 1 || point.index % 10 === 0) draw('text', {x: X(point.x) + 6, y: Y(point.y) - 6, 'font-size': 9, fill: '#1e344c'}, String(point.frame.id));
  }
  for (const item of gt) {
    const x = X(item.x), y = Y(item.y);
    draw('path', {d: 'M ' + x + ' ' + (y - 5) + ' L ' + (x + 5) + ' ' + y + ' L ' + x + ' ' + (y + 5) + ' L ' + (x - 5) + ' ' + y + ' Z', fill: '#d88a37', stroke: '#9d5d1c', 'stroke-width': 1});
    draw('text', {x: x + 7, y: y + 12, 'font-size': 9, fill: '#9b5d25'}, String(item.category) + (item.room_id ? ' · ' + item.room_id : ''));
  }
  for (const item of prediction) {
    const x = X(item.x), y = Y(item.y);
    draw('circle', {cx: x, cy: y, r: 5, fill: '#4166c3', stroke: '#ffffff', 'stroke-width': 1.5});
    draw('text', {x: x + 7, y: y - 7, 'font-size': 9, fill: '#38549b'}, String(item.category) + (item.first ? ' · 首录' + item.first.budget : ''));
  }
  return {svg, pairs};
}

function checkpointLabel(checkpoint) {
  const actual = checkpoint.meta?.actual_frames ?? checkpoint.budget, f1 = checkpoint.metrics?.object_f1;
  return '预算 ' + checkpoint.budget + ' 帧／已观察 ' + actual + ' 帧' + (typeof f1 === 'number' ? ' · F1 ' + f1.toFixed(3) : '');
}

function fillDecisionList(list, path, onSelectFrame) {
  list.replaceChildren();
  for (const point of path) {
    const item = el('li');
    item.append(document.createTextNode('帧 ' + point.frame.id + '：' + actionText(point.frame) + '；离线位置 (' + point.x.toFixed(2) + ', ' + point.y.toFixed(2) + ')'));
    if (onSelectFrame) {
      const jump = el('button', 'quiet trajectory-jump', '查看该帧');
      jump.onclick = () => onSelectFrame(point.frame.id);
      item.append(document.createTextNode(' '), jump);
    }
    list.append(item);
  }
}

function renderFirstEntries(mount, objects, entries) {
  mount.replaceChildren();
  const heading = el('h4', '', '本检查点物体的首次录入');
  const note = el('p', 'hint', '“首次保存”指物体第一次出现在导出的模型地图检查点；它是模型外显记录的下界，不等于模型首次注意到物体的确切时刻。“最早引用帧”来自模型保存地图里的 evidence 字段。');
  const table = el('table', 'trajectory-entry-table');
  const head = document.createElement('thead'), headRow = document.createElement('tr');
  for (const title of ['物体', '首次保存', '最早引用帧', '当前坐标']) headRow.append(el('th', '', title));
  head.append(headRow);
  const body = document.createElement('tbody');
  const rows = [...objects].sort((left, right) => (entries.get(objectKey(left))?.budget || Infinity) - (entries.get(objectKey(right))?.budget || Infinity));
  for (const object of rows) {
    const first = entries.get(objectKey(object));
    const row = document.createElement('tr');
    row.append(el('td', '', object.category || object.id || '未命名物体'));
    row.append(el('td', '', first ? '预算 ' + first.budget + '／已观察 ' + first.actual : '—'));
    row.append(el('td', '', first?.evidence !== null && first?.evidence !== undefined ? '第 ' + first.evidence + ' 帧' : '未声明'));
    row.append(el('td', '', finite(object.x) && finite(object.y) ? '(' + (+object.x).toFixed(2) + ', ' + (+object.y).toFixed(2) + ')' : '未定位'));
    body.append(row);
  }
  table.append(head, body);
  mount.append(heading, note, table);
}

export async function renderTrajectoryReview(mount, run, {load, onSelectFrame} = {}) {
  const box = el('section', 'trajectory-review');
  mount.append(box);
  const heading = el('div', 'trajectory-review-heading');
  heading.append(el('h3', '', '轨迹 × 模型地图 × GT'), el('span', 'soft-tag', '离线审阅层'));
  box.append(heading, el('p', 'hint', '检查点会同时截断黑色相机路径与模型地图：选 20／40／60 时只显示该预算已经拥有的观察历史。蓝点是模型保存的坐标判断；橙色菱形是 GT。紫色虚线只连接类别相同且相距不超过 0.75 m 的一对一可视化配对，不替代正式评分。模型在运行中没有获得任何 GT 或离线位姿。'));
  if (!run.reference_url || typeof load !== 'function') { box.append(el('div', 'empty-state', '此记录没有同坐标系的 GT 参考，因此无法生成叠加图。')); return; }
  const loading = el('div', 'skeleton', '载入轨迹与离线参考…');
  box.append(loading);
  try {
    const reference = await load(run.reference_url);
    const gt = (reference.objects || []).filter(item => finite(item.x) && finite(item.y)).map(item => ({...item, x: +item.x, y: +item.y}));
    const path = pathFor(run), checkpoints = (run.checkpoints || []).filter(checkpoint => checkpoint.valid && checkpoint.prediction), entryByObject = firstEntries(checkpoints);
    loading.remove();
    if (!gt.length) { box.append(el('div', 'empty-state', 'GT 中没有可绘制的二维物体坐标。')); return; }
    if (!path.length) box.append(el('div', 'notice', run.kind === 'baseline' ? '该 SpatialClaw 审计没有连续环境位姿，不能将封存面板画成运动轨迹。' : '导出的记录没有逐帧相机坐标；此图只显示模型地图与 GT。'));
    if (run.kind === 'static') box.append(el('div', 'notice blue', 'Luna 的四个黑色点是预先选定的固定输入视角；它们不是模型运动轨迹，图中不会把它们连线。'));
    const controls = el('label', 'trajectory-checkpoint-label', '模型地图检查点 ');
    const select = el('select');
    if (!checkpoints.length) { const option = el('option', '', '没有保存的坐标地图'); option.value = '-1'; select.append(option); select.disabled = true; }
    else checkpoints.forEach((checkpoint, index) => { const option = el('option', '', checkpointLabel(checkpoint)); option.value = String(index); select.append(option); });
    if (checkpoints.length) select.value = String(checkpoints.length - 1);
    controls.append(select);
    const scope = el('p', 'trajectory-history-scope');
    const canvas = el('div', 'trajectory-map-canvas'), summary = el('p', 'hint trajectory-summary');
    const entryPanel = el('section', 'trajectory-first-entries');
    const decisions = el('details', 'trajectory-decisions');
    decisions.append(el('summary', '', '逐帧操作与离线位姿'));
    const decisionList = el('ol');
    decisions.append(decisionList);
    box.append(controls, scope, canvas, summary, entryPanel);
    if (path.length) box.append(decisions);
    const redraw = () => {
      canvas.replaceChildren();
      const checkpoint = checkpoints[+select.value] || null;
      const observed = checkpoint?.meta?.actual_frames ?? checkpoint?.budget ?? path.length;
      const visiblePath = path.filter(point => point.frame.id <= observed);
      const mapObjects = checkpoint?.prediction?.objects || [];
      const prediction = predictedObjects(checkpoint?.prediction, entryByObject);
      const result = drawOverlay({gt, prediction, path: visiblePath, run, onSelectFrame});
      canvas.append(result.svg);
      const declared = mapObjects.length, unlocalized = Math.max(0, declared - prediction.length);
      const pathText = visiblePath.length ? (run.kind === 'static' ? '固定采样 ' : '相机轨迹 ') + visiblePath.length + ' 个位置' : '没有可用相机位姿';
      scope.textContent = checkpoint ? '当前审阅范围：预算 ' + checkpoint.budget + ' 帧／实际观察 ' + observed + ' 帧；黑色路径、逐帧列表和蓝色地图均只使用此前历史。' : '当前记录没有可选检查点。';
      summary.textContent = 'GT ' + gt.length + ' 个物体；模型本检查点声明 ' + declared + ' 个，其中 ' + prediction.length + ' 个有坐标、' + unlocalized + ' 个未定位；可视化阈值配对 ' + result.pairs.length + ' 个；' + pathText + '。';
      renderFirstEntries(entryPanel, mapObjects, entryByObject);
      fillDecisionList(decisionList, visiblePath, onSelectFrame);
    };
    select.onchange = redraw;
    redraw();
  } catch (error) {
    loading.textContent = '轨迹叠加图载入失败：' + error.message;
  }
}
