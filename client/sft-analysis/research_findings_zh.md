# 最新 SFT checkpoint：收益、行为与迁移的联合复盘

分析日期：2026-09-27。checkpoint 为 `full838_a_seed20260920_attempt03`，419 次更新、训练 seed 20260920、838 训练世界。分析全部来自已保存结果，没有新增模型调用或训练。

[交互分析页](https://epsilondylan.github.io/spatial-mapping-review/sft-findings.html) · [全部 128 案例对比](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html)

## 最有价值的发现

1. **任务内收益确实存在，无法仅用失败记零解释。** 自主探索对象 F1@0.75m 从 17.71 到 72.48，固定观察从 21.00 到 64.34（均为 F1×100、128 世界宏平均）。双方均完成的样本贡献了总增益的 65.20% / 71.75%。即使把所有失败 base 补记满分、其他运行不动，SFT 仍领先 28.99 / 22.25 分。这个算术下界不是置信区间，也不是对失败模型潜在能力的估计。总分是既有结果复核；贡献分解与此下界是新增。

2. **更多观察主要来自原地扫描，尾部重复值得处理。** E2E 每世界观察帧 9.21→15.38，但实际路径 2.576→2.441m、独立位置 5.55→3.79。原地扫描产生新图的次数也确实从 2.24 增至 7.19，不能把旋转一概算浪费。不过 SFT 62/128 例最后至少 4 帧全是此前出现过的同字节图片，base 仅 2/128；按全部帧统计的重复率为 12.64%→28.71%。8 例沿同一小方形绕三圈，4 例仍获满分地图。共同完成 95 例中的实际路径 2.623→2.669m，需与全部运行分列。

3. **会完成任务，不等于会根据反馈纠错。** SFT 256/256 运行都完成，但固定观察 96/128 例收到投影“最多 24 点”的拒绝，其中 31 例连续至少两次、9 例三次全被拒。那 9 例平均 F1 为 7.95，其他 119 例为 68.60。Reader 6 个世界有 7 次被拒后逐字重复答案；E2E 3 个世界有 3 次。这是反馈利用不足的可核验证据，但修复参数能提高多少分还需干预实验。

4. **同一世界的两种观察模式会反转。** 两模式增益 Pearson r=0.261；104 例两边改善，7 例仅 E2E 改善而 Reader 退化，3 例方向相反。`w202609201` 中 E2E 22.22→100，而 Reader 40→0，四个运行都完成。Reader SFT 连续提交 28/28/26 个投影点均被拒，却在最终自报告中声称使用了投影；记录没有成功工具结果。SFT 两模式零分世界没有重叠，但据 GT 事后选更好输出的 77.73 分只是互补性上界，不是已实现路由。

5. **对象匹配、证据帧忠实性、精细定位应分别评估。** `w202609274-reader` 两边都给出相同的 3 凳子、1 椅子、1 植物，匹配却由 0/5 到 5/5，是坐标改进的正例。`w202609248-reader` 的地图满分，椅子却引用了看不到椅子的第 7、8 帧。`w202609244-e2e` 在 0.75m 下达 82.35 分，收紧到 0.25m 后为零。新增的 0.10m 检查中 SFT E2E 9.85、Reader 6.42，虽均高于 base，但不能将 0.75m 高分说成厘米级地图。

6. **碰撞总量降低没有证明移动更安全。** partial/blocked 总数 147→116，但非零移动请求也由 718 降至 490；相应比例为 20.47%→23.67%。双方第一次碰撞之后都实际记录了至少 4 个后续观察帧的 26 个配对世界中，base 1 例、SFT 19 例之后不再平移。这是选择后的行为子集，不能当成碰撞的因果影响。

7. **任务外迁移仍是明确短板。** 同 checkpoint 的既有 ToS 结果为官方平均题目得分 31.89→23.94，不能与建图 F1 混算。探索失败和至少一方 QA 未正常结束的组对全体差值分别贡献 −4.84、−4.28 分；这只是互斥分组的算术分解。新增按任务拆解发现，在双方正常结束且可解析的 157 道反向视角文字题中，均分仍为 42.04→33.76，表明“只修复截断就够了”尚无依据。该条件化子集有选择偏差，不能替代全量主结果。

## 优先复查的案例

- [重复方形三圈：w202609214](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609214&mode=e2e&view=map&base=16&sft=16&sync=1)。[声称 3×3 网格的第 6 次调用](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609214&mode=e2e&view=chat&base=6&sft=6&sync=1)。
- [投影三次被拒却声称使用投影：w202609201](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609201&mode=reader&view=chat&base=4&sft=4&sync=1)。
- [固定同图最大退化：w202619201](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202619201&mode=reader&view=final&base=16&sft=16&sync=1)。
- [类别和数量相同、坐标明显改善：w202609274](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609274&mode=reader&view=final&base=16&sft=16&sync=1)。
- [满分地图的错误椅子引用：w202609248 第 7 帧](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609248&mode=reader&view=map&base=7&sft=7&sync=1)。
- [类别数量全对仍有大坐标误差：w202609283](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609283&mode=e2e&view=final&base=16&sft=16&sync=1)。
- [较少移动取得互补视图的正例：w202609277](https://epsilondylan.github.io/spatial-mapping-review/sft-compare.html#case=w202609277&mode=e2e&view=map&base=16&sft=16&sync=1)。

## 下一轮最值得做的实验

- 固定 checkpoint 和观察输入，单独比较原始反馈与结构化参数纠错，统计有效工具回执、超过 24 点后的恢复率与最终 F1。
- 把图像去重与提前结束采集分成两个条件；加入循环检测或换视点提示，统一动作/输出预算，检查新图、路径和最终地图。不能预设去重一定增分。
- 保留原 0.75m 主终点，同时提前登记严格定位、证据帧一致性与 ToS 终止指标。固定观察回放、坐标系旋转和对象重命名有助于检验输入依赖。以上建议均未执行。

## 方法与边界

三路子 agent 分别核对配对统计、实际轨迹、聊天工具反馈；汇总者另做定位阈值和 ToS 分解，随后交叉审稿。三路使用相同封存数据，不能因多个分析者同意就增加实验独立性。

本次范围为 128 世界（96 普通 + 32 物理遮挡）、2 模式、2 模型，共 512 运行、3,229 调用。Reader 的 128 组首轮消息、生成设置、16 张图像及公开回执逐项一致，仅服务模型名不同；E2E 的图像来自各自行动策略。全部 3,603 张原始 PNG 字节哈希与文件名一致，256 个 E2E 实际路径与保存 distance 一致。定位复算核对全部 512 个 @0.75m 分数和全部 4 个原 @0.25m 均值。

一个训练 seed、一个 checkpoint、程序化同资产新布局测试，不能外推跨 seed、未见资产或真实世界泛化。完成条件子集、案例挑选、严格阈值及按任务分解均为事后分析，存在选择偏差，未做多重比较校正。ToS 与单房间任务协议和指标不同。模型保存的 reason 是自报告，不能当作内部机制或真实工具执行证据；没有补写隐藏思考。

详细报告与机器可读文件：`stats.md/json`、`behavior.md/json`、`conversation.md/json`、`localization.json`、`transfer.json`。页面及下载文件在 `sft-analysis/` 下；`manifest.json` 和 `stats-source-hashes.json` 保留 SHA256。
