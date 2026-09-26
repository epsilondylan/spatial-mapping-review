# 配对量化分析：独立复核与新增发现

全部 128 世界；96 普通 + 32 物理遮挡；2 模式 × 2 模型 = 512 次已保存运行。对象 F1@0.75m 按世界等权，失败计零。没有新模型调用。

## 独立复核
- e2e: 0.177096 → 0.724847，Δ=+0.547751；胜/平/负=121/2/5 /128；完成=95→128 /128；完成但0分=30→3。
- reader: 0.209957 → 0.643361，Δ=+0.433405；胜/平/负=109/10/9 /128；完成=101→128 /128；完成但0分=29→7。

以上与旧 quant.json 一致，属于复核，不是新结果。

### 分组复核
- a_confirm_occlusion / occlusion：e2e n=32: 0.151204→0.644710，Δ+0.493505；reader n=32: 0.194490→0.581713，Δ+0.387223
- a_confirm_ordinary / clustered：e2e n=12: 0.155025→0.590713，Δ+0.435688；reader n=12: 0.219994→0.667530，Δ+0.447536
- a_confirm_ordinary / distributed：e2e n=12: 0.266232→0.808038，Δ+0.541806；reader n=12: 0.235705→0.549198，Δ+0.313494
- a_confirm_ordinary / elongated：e2e n=12: 0.128910→0.725775，Δ+0.596865；reader n=12: 0.250984→0.736836，Δ+0.485852
- a_confirm_ordinary / occlusion：e2e n=12: 0.240465→0.780073，Δ+0.539608；reader n=12: 0.304590→0.674212，Δ+0.369622
- a_confirm_ordinary / open_sparse：e2e n=12: 0.240278→0.858333，Δ+0.618056；reader n=12: 0.248347→0.713161，Δ+0.464815
- a_confirm_ordinary / perimeter：e2e n=12: 0.244992→0.820307，Δ+0.575316；reader n=12: 0.102701→0.724335，Δ+0.621633
- a_confirm_ordinary / repeated：e2e n=12: 0.093839→0.822094，Δ+0.728255；reader n=12: 0.219048→0.644121，Δ+0.425073
- a_confirm_ordinary / scale_rotation：e2e n=12: 0.116071→0.607143，Δ+0.491071；reader n=12: 0.139529→0.601893，Δ+0.462363
两种split、普通场景的8个family均为正平均增益；这是本seed本批世界的分组描述，family每组仅12个，不能称跨seed稳定。普通occlusion的12例与物理遮挡split的32例保留分列。

## 新增：全队列收益贡献分解

### e2e
- COMPLETE->COMPLETE: n=95，子集均值差=+0.481199；以128为分母的贡献=+0.357140，占总增益65.20%。
- FAILED->COMPLETE: n=33，子集均值差=+0.739340；以128为分母的贡献=+0.190611，占总增益34.80%。
- 即使假设所有失败 base 都补记满分，平均差仍≥+0.289939；这是评分敏感性的算术下界，不是对失败样本真实能力的估计。

### reader
- COMPLETE->COMPLETE: n=101，子集均值差=+0.394104；以128为分母的贡献=+0.310972，占总增益71.75%。
- FAILED->COMPLETE: n=27，子集均值差=+0.580419；以128为分母的贡献=+0.122432，占总增益28.25%。
- 即使假设所有失败 base 都补记满分，平均差仍≥+0.222467；这是评分敏感性的算术下界，不是对失败样本真实能力的估计。

## 新增：两模式的收益是否发生在相同世界
- all_128（n=128）：Pearson r=0.2607，Spearman ρ=0.2713；E2E增益−reader增益=+0.114347，探索性分层配对95%区间=[0.04911056784847421, 0.17952528072028484]。
- 方向交叉计数（行E2E、列reader，win/tie/loss）：{"win": {"win": 104, "tie": 10, "loss": 7}, "tie": {"win": 2, "tie": 0, "loss": 0}, "loss": {"win": 3, "tie": 0, "loss": 2}}
- all_four_complete_selected_subset（n=79）：Pearson r=0.3556，Spearman ρ=0.3900；E2E增益−reader增益=+0.100674，探索性分层配对95%区间=[0.02100736799885897, 0.1821827111749272]。
- 方向交叉计数（行E2E、列reader，win/tie/loss）：{"win": {"win": 62, "tie": 6, "loss": 6}, "tie": {"win": 2, "tie": 0, "loss": 0}, "loss": {"win": 1, "tie": 0, "loss": 2}}

## 新增：两模式错误互补
- SFT E2E 有 3/128 个完成但0分的案例，reader 有 7/128 个；两组没有重叠。
- 使用答案事后逐世界选更优模式，均分是 0.777340，比 E2E 的 0.724847 高 0.052493；≥0.75 的世界增至 87/128。这是互补性上界，不是可部署的路由策略或新实验。

## 模式反转与退化案例

### e2e_gains_reader_losses
- w202609201 / a_confirm_ordinary / distributed：e2e: 0.2222→1.0000（Δ+0.7778, COMPLETE→COMPLETE）；reader: 0.4000→0.0000（Δ-0.4000, COMPLETE→COMPLETE）
- w202619201 / a_confirm_occlusion / occlusion：e2e: 0.1818→0.6667（Δ+0.4848, COMPLETE→COMPLETE）；reader: 0.8000→0.1818（Δ-0.6182, COMPLETE→COMPLETE）
- w202619225 / a_confirm_occlusion / occlusion：e2e: 0.4000→0.9091（Δ+0.5091, COMPLETE→COMPLETE）；reader: 0.5455→0.1818（Δ-0.3636, COMPLETE→COMPLETE）
- w202609218 / a_confirm_ordinary / repeated：e2e: 0.0000→0.6667（Δ+0.6667, COMPLETE→COMPLETE）；reader: 0.6154→0.4286（Δ-0.1868, COMPLETE→COMPLETE）
- w202609252 / a_confirm_ordinary / occlusion：e2e: 0.1538→0.7692（Δ+0.6154, COMPLETE→COMPLETE）；reader: 0.7143→0.6667（Δ-0.0476, COMPLETE→COMPLETE）
- w202609255 / a_confirm_ordinary / elongated：e2e: 0.0000→0.6154（Δ+0.6154, FAILED→COMPLETE）；reader: 0.4615→0.4286（Δ-0.0330, COMPLETE→COMPLETE）
- w202609289 / a_confirm_ordinary / distributed：e2e: 0.5263→0.8889（Δ+0.3626, COMPLETE→COMPLETE）；reader: 0.2353→0.0000（Δ-0.2353, COMPLETE→COMPLETE）

### e2e_losses_reader_gains
- w202609283 / a_confirm_ordinary / clustered：e2e: 0.8333→0.5714（Δ-0.2619, COMPLETE→COMPLETE）；reader: 0.0000→0.6154（Δ+0.6154, FAILED→COMPLETE）
- w202619203 / a_confirm_occlusion / occlusion：e2e: 0.2000→0.0000（Δ-0.2000, COMPLETE→COMPLETE）；reader: 0.0000→0.2500（Δ+0.2500, FAILED→COMPLETE）
- w202609293 / a_confirm_ordinary / scale_rotation：e2e: 0.4000→0.1333（Δ-0.2667, COMPLETE→COMPLETE）；reader: 0.1333→0.2667（Δ+0.1333, COMPLETE→COMPLETE）

### both_regress
- w202609205 / a_confirm_ordinary / scale_rotation：e2e: 0.2500→0.0000（Δ-0.2500, COMPLETE→COMPLETE）；reader: 0.5000→0.2000（Δ-0.3000, COMPLETE→COMPLETE）
- w202609212 / a_confirm_ordinary / occlusion：e2e: 0.5000→0.4286（Δ-0.0714, COMPLETE→COMPLETE）；reader: 0.7692→0.5714（Δ-0.1978, COMPLETE→COMPLETE）

### both_complete_largest_e2e_gains
- w202609222 / a_confirm_ordinary / perimeter：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.2500→1.0000（Δ+0.7500, COMPLETE→COMPLETE）
- w202609240 / a_confirm_ordinary / open_sparse：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.0000→0.6667（Δ+0.6667, COMPLETE→COMPLETE）
- w202609248 / a_confirm_ordinary / open_sparse：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）
- w202609249 / a_confirm_ordinary / distributed：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.6000→0.9091（Δ+0.3091, COMPLETE→COMPLETE）
- w202609250 / a_confirm_ordinary / repeated：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.5455→0.8333（Δ+0.2879, COMPLETE→COMPLETE）
- w202609274 / a_confirm_ordinary / repeated：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）
- w202609277 / a_confirm_ordinary / scale_rotation：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.0000→0.6000（Δ+0.6000, COMPLETE→COMPLETE）
- w202609276 / a_confirm_ordinary / occlusion：e2e: 0.0000→0.8889（Δ+0.8889, COMPLETE→COMPLETE）；reader: 0.0000→0.2000（Δ+0.2000, FAILED→COMPLETE）

### both_complete_largest_reader_gains
- w202609209 / a_confirm_ordinary / distributed：e2e: 0.4000→0.8000（Δ+0.4000, COMPLETE→COMPLETE）；reader: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）
- w202609248 / a_confirm_ordinary / open_sparse：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）
- w202609270 / a_confirm_ordinary / perimeter：e2e: 0.5455→0.6000（Δ+0.0545, COMPLETE→COMPLETE）；reader: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）
- w202609274 / a_confirm_ordinary / repeated：e2e: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）；reader: 0.0000→1.0000（Δ+1.0000, COMPLETE→COMPLETE）
- w202619220 / a_confirm_occlusion / occlusion：e2e: 0.0000→0.8000（Δ+0.8000, COMPLETE→COMPLETE）；reader: 0.0000→0.8889（Δ+0.8889, COMPLETE→COMPLETE）
- w202609254 / a_confirm_ordinary / perimeter：e2e: 0.2500→1.0000（Δ+0.7500, COMPLETE→COMPLETE）；reader: 0.0000→0.8750（Δ+0.8750, COMPLETE→COMPLETE）
- w202619215 / a_confirm_occlusion / occlusion：e2e: 0.0000→0.7778（Δ+0.7778, COMPLETE→COMPLETE）；reader: 0.0000→0.8750（Δ+0.8750, COMPLETE→COMPLETE）
- w202619208 / a_confirm_occlusion / occlusion：e2e: 0.0000→0.5714（Δ+0.5714, COMPLETE→COMPLETE）；reader: 0.0000→0.8571（Δ+0.8571, COMPLETE→COMPLETE）

## 限制
- One trained seed, one checkpoint, procedural same-asset new-layout test only; no cross-seed, unseen-asset, real-world, or ToS-generalization claim.
- All additions here are post-hoc descriptive; original confirmatory results remain unchanged. Family n=12 is small and multiple comparisons are unadjusted.
- Both-complete and all-four-complete select on model-dependent completion. Their means do not estimate causal effects on an invariant population.
- E2E changes acquisition and readout jointly, and reader uses a scripted fixed scan. Difference of gains does not isolate the causal value of navigation.
- F1=0 is not always failure: completed but inaccurate maps remain zero. Completion-only arithmetic decomposition is not causal mediation.
- Family occlusion combines 12 ordinary +32 physical-occlusion worlds unless split is explicitly separated; use split_by_family for interpretation.
- Metrics are macro means across worlds; saved scoring is independently reconciled to the published audit but matching was not rerun by this script.

## 复现

`python3 work/analysis/stats/analyze.py`。完整数值和逐案例指标见 stats.json，输入的 259 份文件 SHA-256 见 stats-source-hashes.json。
