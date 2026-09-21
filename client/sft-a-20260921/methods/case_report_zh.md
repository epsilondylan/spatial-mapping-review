# SFT 逐案例深读：收益发生在哪里，以及哪些命中不能当理解证明

本文件为 **2026-09-21 事后探索性分析**。依据封存的128父世界结果挑选8类机制案例，刻意同时保留正例、退化、协议失败和弱证据命中；这些是按结果选出的案例，不能估计各机制在总体中的发生率。没有新训练、模型调用、重试或渲染，未改动原结果、评分协议或预登记主终点。

案例总体支持一个有限结论：SFT除了提高完成率，也改善了部分固定观察下的像素选择、坐标汇总、实例区分和类别读出；它仍保留自信误分类、投影协议失败、证据很弱时输出确定坐标等问题。模型所说“所有对象已识别”“已三角定位”只作为输出行为引用，不视为视觉理解证明。

以下“new”对应封存arm `full838_a_seed20260920`。坐标单位米，+x为初始相机右侧，+y为初始相机前方。对象评分要求类别一致、距离不超过阈值且一对一匹配；默认F1阈值0.75m。关系分数由匹配对象的坐标派生八方向关系，排除距离/角度边界模糊的GT对，因此不是独立的自然语言关系测验。

特别注意：私有诊断 `observed=true` 指至少一帧中该GT实例达到 **263分割像素**。`false` 不等于零像素。私有GT、分割和审计数据仅在本次复核中使用，从未进入模型请求。

## 挑选规则与复核

所有规则在观察结果后确定，统一以world ID字典序打破并列。规则、完整候选排序与候选数保存于 [selected_cases.json](selected_cases.json)，可以运行 [build_cases.py](build_cases.py) 复算。每例的所有5个评测条件均保留，防止只展示有利的一条轨迹。

263个案例调用的原始SSE响应拼接文本与保存的content.txt逐字一致。18张展示RGB从封存评测只读复制，本地与远端SHA256逐一核对；没有裁剪、改色或生成新图。来源、帧号和哈希见 [media_manifest.json](media_manifest.json)。隐藏目标的每帧像素数量、bbox和分割文件哈希见 [occlusion_pixel_audit.json](occlusion_pixel_audit.json)。

## 1. w202609200｜完成救回：停止像素坐标循环，最终交出地图

选取：base端到端失败、new完成；按new F1降序、world ID升序。候选池 33 个，本例排名第一。场景族 `open_sparse`；分组 `a_confirm_ordinary`。

- `e2e/base`：F1=0.0000，F1@0.25m=0.0000，FAILED，无有效最终地图，5帧。
- `e2e/full128`：F1=0.7500，F1@0.25m=0.5000，COMPLETE，匹配3/4，13帧。
- `e2e/new`：F1=1.0000，F1@0.25m=0.5000，COMPLETE，匹配4/4，16帧。
- `reader/base`：F1=0.2857，F1@0.25m=0.0000，COMPLETE，匹配1/4，16帧。
- `reader/new`：F1=0.7500，F1@0.25m=0.2500，COMPLETE，匹配3/4，16帧。

**观察事实**

- base readout_00输出越界像素并反复自我纠正；原始meta记录4096 completion tokens与finish_reason=length，端到端计零。
- new完成4/4对象匹配，full128为3/4；new在0.25m阈值仍只有2/4，并非精确定位已经解决。
- new有16帧、full128有13帧、base有5帧；端到端差异同时包含采集证据与输出行为变化。

**关键原文与来源**

- `e2e/base` · `readout_00_0`：`Stool: u=230, v=700 is wrong.`。来源：`results/e2e/base/w202609200/calls/readout_00_0/content.txt` 第18行。
- `e2e/new` · `readout_03_0`：`"id":"floor_lamp_1","category":"floor_lamp","x":4.7,"y":-1.58`。来源：`results/e2e/full838_a_seed20260920/w202609200/calls/readout_03_0/content.txt` 第2行。

**解释**：本例最直接支持格式、尺度使用和终止可靠性改善，同时最终地图质量提高。

**不能推出**：不能把全部F1差归于视觉识别：base没有有效最终地图。 不能由模型所称all four或triangulation证明其推理过程正确。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202609200.json) 与 [统一案例数据](selected_cases.json)。

![w202609200 e2e frame 2](media/w202609200_new_e2e_f02.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202609200/public/obs_0002.png`；SHA256 `b0f70b930f63e7f3d5bbdd6f07675295c9d6c6d759eb7895f68ab84b303395d1`。

## 2. w202609222｜共同完成仍提升：初始坐标系、遗漏实例与关系

选取：base与new端到端均完成；按new-base F1差降序、ID升序。候选池 95 个，本例排名第一。场景族 `perimeter`；分组 `a_confirm_ordinary`。

- `e2e/base`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/8，9帧。
- `e2e/full128`：F1=0.8750，F1@0.25m=0.1250，COMPLETE，匹配7/8，11帧。
- `e2e/new`：F1=1.0000，F1@0.25m=0.3750，COMPLETE，匹配8/8，14帧。
- `reader/base`：F1=0.2500，F1@0.25m=0.0000，COMPLETE，匹配2/8，16帧。
- `reader/new`：F1=1.0000，F1@0.25m=0.3750，COMPLETE，匹配8/8，16帧。

**观察事实**

- base已完成且提交7对象，但0/8匹配；new提交8对象并8/8匹配。
- base遗漏chair；其plant=(1,-1.5)与GT=(-3.838,-4.939)相差5.935m，new=(-3.5,-4.6)，相差0.479m。
- 封存pair scorer的正确关系数从base 0/21、full128 16/21到new 20/21；这是坐标派生的关系评分。
- new在0.25m阈值F1=0.375，说明0.75m全对仍掩盖厘米级到分米级误差。

**关键原文与来源**

- `e2e/base` · `readout_02_0`：`"id":"plant_1","category":"plant","x":1.0,"y":-1.5`。来源：`results/e2e/base/w202609222/calls/readout_02_0/content.txt` 第2行。
- `e2e/new` · `readout_03_0`：`"id":"plant_1","category":"plant","x":-3.5,"y":-4.6`。来源：`results/e2e/full838_a_seed20260920/w202609222/calls/readout_03_0/content.txt` 第2行。
- `e2e/new` · `readout_03_0`：`"id":"chair_1","category":"chair","x":0.7,"y":-1.9`。来源：`results/e2e/full838_a_seed20260920/w202609222/calls/readout_03_0/content.txt` 第2行。

**解释**：完成格式以外，实例召回和坐标/方向使用也发生了实质改善。

**不能推出**：不能由此独立分解识别、几何、视角的因果贡献。 关系分数由定位匹配及坐标派生，不是独立的语言关系推理测验。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202609222.json) 与 [统一案例数据](selected_cases.json)。

![w202609222 e2e frame 3](media/w202609222_new_e2e_f03.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202609222/public/obs_0003.png`；SHA256 `ef5437ea37395eb53f2fc020c348774a0c7ea932b982552681b5cb49ccac7a17`。

## 3. w202609250｜重复实例：修正近重合花瓶，同时找回远处花瓶和第二盆植物

选取：repeated且full128存在同类别预测距离<0.25m的近重合对而new没有；按近重合对减少数降序、ID升序。候选池 1 个，本例排名第一。场景族 `repeated`；分组 `a_confirm_ordinary`。

- `e2e/base`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/6，7帧。
- `e2e/full128`：F1=0.7273，F1@0.25m=0.7273，COMPLETE，匹配4/6，9帧。
- `e2e/new`：F1=1.0000，F1@0.25m=0.5000，COMPLETE，匹配6/6，13帧。
- `reader/base`：F1=0.5455，F1@0.25m=0.3636，COMPLETE，匹配3/6，16帧。
- `reader/new`：F1=0.8333，F1@0.25m=0.1667，COMPLETE，匹配5/6，16帧。

**观察事实**

- GT为2 chair、2 vase、2 plant；full128提交5对象，其中两个vase位置仅相距0.102m，两者都接近同一个GT花瓶。
- new提交6对象并6/6匹配，两个vase分别接近两个不同GT；对象F1由full128 0.727至1.000，pair F1由0.4至1.0。
- 更严格0.25m F1反而由full128 0.727降至new 0.5；new获得完整性时，没有逐对象一致提高精度。

**关键原文与来源**

- `e2e/full128` · `readout_02_0`：`"id":"blue_vase_1","category":"vase","x":-2.49,"y":-1.51`。来源：`results/e2e/full128/w202609250/calls/readout_02_0/content.txt` 第2行。
- `e2e/full128` · `readout_02_0`：`"id":"blue_vase_2","category":"vase","x":-2.39,"y":-1.49`。来源：`results/e2e/full128/w202609250/calls/readout_02_0/content.txt` 第2行。
- `e2e/new` · `readout_03_0`：`"id":"blue_vase_2","category":"vase","x":-5.02,"y":4.81`。来源：`results/e2e/full838_a_seed20260920/w202609250/calls/readout_03_0/content.txt` 第2行。

**解释**：本例支持跨视角实例区分/去重和遗漏恢复，但只能观察最终身份对应，不能直接测出内部跟踪能力。

**不能推出**：两个近重合预测是可复算的重复疑点，单靠数量规则不能普遍判断所有重复。 new多采集了4帧，不能把收益全部归于同一证据上的读图。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202609250.json) 与 [统一案例数据](selected_cases.json)。

![w202609250 e2e frame 10](media/w202609250_new_e2e_f10.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202609250/public/obs_0010.png`；SHA256 `4ed68d1bbcd41e125439a478c4c91a5ce0e18798f364db1f0f755eb121f05aa4`。

## 4. w202609209｜固定reader：相同16帧，类别数量相同，定位从全错到全匹配

选取：base与new reader均完成；按new-base reader F1差降序、ID升序。候选池 101 个，本例排名第一。场景族 `distributed`；分组 `a_confirm_ordinary`。

- `e2e/base`：F1=0.4000，F1@0.25m=0.2000，COMPLETE，匹配2/5，13帧。
- `e2e/full128`：F1=0.8000，F1@0.25m=0.0000，COMPLETE，匹配4/5，8帧。
- `e2e/new`：F1=0.8000，F1@0.25m=0.0000，COMPLETE，匹配4/5，13帧。
- `reader/base`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/5，16帧。
- `reader/new`：F1=1.0000，F1@0.25m=0.2000，COMPLETE，匹配5/5，16帧。

**观察事实**

- base与new首次reader请求SHA完全一致，均16帧、4次读图调用；两者最后均提交正确的5种类别各1个。
- base 0/5匹配，new 5/5匹配；例如bookshelf由(1.78,-4.03)改为(5.13,-2.54)，GT=(5.708,-2.740)。
- base先尝试越界像素，随后修正并使用projection工具，但最终坐标仍错；new对多帧多个底角选点。
- 0.25m F1仅从0到0.2，pair F1从0到0.875。

**关键原文与来源**

- `reader/base` · `readout_03_0`：`"id":"bookshelf_1","category":"bookshelf","x":1.78,"y":-4.03`。来源：`results/reader/base/w202609209/calls/readout_03_0/content.txt` 第2行。
- `reader/new` · `readout_03_0`：`"id":"bookshelf_1","category":"bookshelf","x":5.13,"y":-2.54`。来源：`results/reader/full838_a_seed20260920/w202609209/calls/readout_03_0/content.txt` 第2行。
- `reader/new` · `readout_00_0`：`{"frame":4,"u":144,"v":373,"label":"stool_leg_left"}`。来源：`results/reader/full838_a_seed20260920/w202609209/calls/readout_00_0/content.txt` 第2行。

**解释**：该固定输入案例排除了本次对照中的主动采集差异和有效完成差异，支持读出链路中选点/几何/坐标汇总的改善。

**不能推出**：不能据此证明通用视觉理解，投影工具已提供几何变换。 reader后续工具输入与回执由模型选择，因此仅首次公共观察固定，整个工具对话并不相同。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202609209.json) 与 [统一案例数据](selected_cases.json)。

![w202609209 reader frame 5](media/w202609209_reader_f05.png)

原始公共RGB：`fixed_scan/w202609209/public/obs_0005.png`；SHA256 `50016d9dc70fac1c23ba750406851b891816ba5d08b5b3ac1ae10f8398c0c2e8`。

## 5. w202609208｜最大退化：几何接近，类别却从book/cabinet改错

选取：full128与new端到端均完成；按new-full128 F1差升序、ID升序。候选池 123 个，本例排名第一。场景族 `open_sparse`；分组 `a_confirm_ordinary`。

- `e2e/base`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/3，13帧。
- `e2e/full128`：F1=1.0000，F1@0.25m=0.3333，COMPLETE，匹配3/3，15帧。
- `e2e/new`：F1=0.3333，F1@0.25m=0.3333，COMPLETE，匹配1/3，16帧。
- `reader/base`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/3，16帧。
- `reader/new`：F1=0.2857，F1@0.25m=0.2857，COMPLETE，匹配1/3，16帧。

**观察事实**

- full128端到端F1=1，new=1/3，差-2/3为共同完成世界最严重退化。
- new acquisition末尾称stool/book/cabinet，最终readout改成stool/floor_lamp/bookshelf；采集历史在readout前按协议被公共重放替换，因此是两阶段输出不一致。
- new的floor_lamp点与GT book中心只差0.021m；bookshelf点与GT cabinet中心只差0.249m，因类别错而不匹配。
- 实际f4图像中紫色目标为窄竖板，看不到最终文本声称的conical shade；这支持输出描述错误，无法证明模型内部看到了什么。

**关键原文与来源**

- `e2e/new` · `acquire_05_0`：`All objects (stool, book, and cabinet) have been identified and located.`。来源：`results/e2e/full838_a_seed20260920/w202609208/calls/acquire_05_0/content.txt` 第1行。
- `e2e/new` · `readout_03_0`：`a floor lamp with a conical shade and pole`。来源：`results/e2e/full838_a_seed20260920/w202609208/calls/readout_03_0/content.txt` 第2行。
- `e2e/new` · `readout_03_0`：`"id":"floor_lamp_1","category":"floor_lamp","x":-6.38,"y":-0.19`。来源：`results/e2e/full838_a_seed20260920/w202609208/calls/readout_03_0/content.txt` 第2行。

**解释**：SFT收益不是单调且不是统一的空间理解改善；语义识别/读出可在准确几何附近仍失败。

**不能推出**：不能把最终自信描述当成视觉观察事实。 不能由单例判断整个模型依赖了某一种固定语义shortcut。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202609208.json) 与 [统一案例数据](selected_cases.json)。

![w202609208 e2e frame 4](media/w202609208_new_e2e_f04.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202609208/public/obs_0004.png`；SHA256 `98e3bd0bb2415968109b6bf91a94678e7a29304fe5de8f602ef54743afc5ce52`。

## 6. w202619206｜可信遮挡成功：目标面积增加，桌子定位准确

选取：物理遮挡组new observed=true且matched=true；按new F1降序、ID升序。候选池 10 个，本例排名第一。场景族 `occlusion`；分组 `a_confirm_occlusion`。

- `e2e/base`：F1=0.2000，F1@0.25m=0.2000，COMPLETE，匹配1/5，7帧。
- `e2e/full128`：F1=0.8000，F1@0.25m=0.4000，COMPLETE，匹配4/5，15帧。
- `e2e/new`：F1=1.0000，F1@0.25m=0.6000，COMPLETE，匹配5/5，15帧。
- `reader/base`：F1=0.2222，F1@0.25m=0.0000，COMPLETE，匹配1/5，16帧。
- `reader/new`：F1=0.5000，F1@0.25m=0.2500，COMPLETE，匹配2/5，16帧。

**观察事实**

- 隐藏目标是table o4；new轨迹f1只有56目标像素，f8为3643、f13为3474，跨过263像素观测阈值。
- new最终table=(-3.67,3.03)，GT=(-3.690,3.097)，误差0.070m；引用证据正是[8,13]。
- base也观测到隐藏目标但未匹配；full128也成功恢复目标。new整体F1=1，相比full128=0.8的额外提升还包括bookshelf类别修正。
- 固定reader new F1=0.5，缺少隐藏桌子的有效观察，与主动轨迹证据差异一致。

**关键原文与来源**

- `e2e/new` · `acquire_01_0`：`{"op":"step_sequence","steps":[{"turn_deg":90,"move_m":0.75},{"turn_deg":0,"move_m":0.75},{"turn_deg":0,"move_m":0.75}]}`。来源：`results/e2e/full838_a_seed20260920/w202619206/calls/acquire_01_0/content.txt` 第1行。
- `e2e/new` · `readout_03_0`：`"id":"table_1","category":"table","x":-3.67,"y":3.03,"evidence":[8,13]`。来源：`results/e2e/full838_a_seed20260920/w202619206/calls/readout_03_0/content.txt` 第2行。

**解释**：这是实测视角变化带来目标大面积显露、随后准确定位的正证据，比finalize自述更有说服力。

**不能推出**：无法证明这些动作是针对遮挡的自适应策略；其旋转/前进模板也可能碰巧提供合适视角。 同世界e2e-reader差不是策略与读图的严格因果分解。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202619206.json) 与 [统一案例数据](selected_cases.json)。

![w202619206 e2e frame 8](media/w202619206_new_e2e_f08.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202619206/public/obs_0008.png`；SHA256 `71f39d899574973640331adff6ab769befcf45849336eb5a964c6b486904c3b8`。

## 7. w202619205｜看到了仍失败：连续超量投影被拒，完成后全错

选取：物理遮挡组new observed=true且matched=false；按new F1升序、ID升序。候选池 7 个，本例排名第一。场景族 `occlusion`；分组 `a_confirm_occlusion`。

- `e2e/base`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/9，5帧。
- `e2e/full128`：F1=0.3158，F1@0.25m=0.0000，COMPLETE，匹配3/9，16帧。
- `e2e/new`：F1=0.0000，F1@0.25m=0.0000，COMPLETE，匹配0/9，16帧。
- `reader/base`：F1=0.1333，F1@0.25m=0.0000，COMPLETE，匹配1/9，16帧。
- `reader/new`：F1=0.6667，F1@0.25m=0.1333，COMPLETE，匹配5/9，16帧。

**观察事实**

- 隐藏printer o5在new f10/f14各1989像素，且private diagnostics为9/9 GT实例曾达到观测阈值。
- new前三次readout依次发78、28、25个project_ground点，三次公共回执均为Rejected: Provide 1..24 points。
- 最后一次readout仍提交9对象；类别多重集合与GT一致，但0/9定位匹配，F1=0。printer预测(-0.5,-2)距其GT约4.583m。
- 同世界new reader F1=0.667，端到端new却0，说明更多/主动图像不保证更好的读出。

**关键原文与来源**

- `e2e/new` · `readout_03_0`：`"id":"printer_1","category":"printer","x":-0.5,"y":-2.0`。来源：`results/e2e/full838_a_seed20260920/w202619205/calls/readout_03_0/content.txt` 第1行。
- `e2e/new` · `acquire_06_0`：`located with sufficient parallax and multi-view evidence.`。来源：`results/e2e/full838_a_seed20260920/w202619205/calls/acquire_06_0/content.txt` 第1行。
- 三条失败回执见 `results/e2e/full838_a_seed20260920/w202619205/phases.json` 的readout用户回执；原文均为 `Rejected: Provide 1..24 points`。对应 `readout_00_0` / `readout_01_0` / `readout_02_0` 分别78/28/25点。

**解释**：这是一条可以明确定位的工具协议失败链：没有成功投影结果，随后给出错误地图；同时说明100%完成率不等于100%工具可靠或空间正确。

**不能推出**：不能证明若三次工具调用合法便一定成功；这是未做的反事实。 不能把9类别正确看作9位置正确。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202619205.json) 与 [统一案例数据](selected_cases.json)。

![w202619205 e2e frame 10](media/w202619205_new_e2e_f10.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202619205/public/obs_0010.png`；SHA256 `fb51d860f5da58ca67c69a00280e71434f41de2ba22d8f0a2e4c31ec795eb388`。

## 8. w202619226｜弱证据命中：6像素plant落入宽阈值，保留shortcut疑点

选取：物理遮挡组new observed=false且matched=true；按ID升序。候选池 1 个，本例排名第一。场景族 `occlusion`；分组 `a_confirm_occlusion`。

- `e2e/base`：F1=0.0000，F1@0.25m=0.0000，FAILED，无有效最终地图，12帧。
- `e2e/full128`：F1=0.5000，F1@0.25m=0.0000，COMPLETE，匹配2/5，15帧。
- `e2e/new`：F1=1.0000，F1@0.25m=0.4000，COMPLETE，匹配5/5，16帧。
- `reader/base`：F1=0.2500，F1@0.25m=0.0000，COMPLETE，匹配1/5，16帧。
- `reader/new`：F1=0.7500，F1@0.25m=0.2500，COMPLETE，匹配3/5，16帧。

**观察事实**

- new hidden_target observed=false且matched=true；逐帧分割复核仅f8/f10/f14各6目标像素，其余13帧为0。
- 6像素位于[73,281,74,284]，模型在f8选plant_base=(75,325)，可见目标没有提供可核验的地面接触点。
- 模型最终plant=(-4.03,4.58)，GT=(-4.145,5.244)，误差0.674m；在0.75m匹配、0.25m不匹配。
- f8/f10/f14三张RGB字节完全相同，模型引用[8,10,14]不是3个独立视角；画面主要是近景书架。

**关键原文与来源**

- `e2e/new` · `readout_00_0`：`{"frame":8,"label":"plant_base","u":75,"v":325}`。来源：`results/e2e/full838_a_seed20260920/w202619226/calls/readout_00_0/content.txt` 第1行。
- `e2e/new` · `readout_03_0`：`"id":"plant_1","category":"plant","x":-4.03,"y":4.58,"evidence":[8,10,14]`。来源：`results/e2e/full838_a_seed20260920/w202619226/calls/readout_03_0/content.txt` 第2行。

**解释**：该命中可由极少视觉线索、资产先验、近似投影与宽阈值共同解释，是需要干预实验的shortcut疑点，不能作为可靠遮挡恢复证据。

**不能推出**：observed=false不等于零可见像素；这里明确有6像素。 不能从该例证明训练泄漏、作弊或完全不读图；也不能因为得分高便宣称可靠理解遮挡对象。

全部GT、预测、评分、公共请求历史和实际模型输出见 [本例证据](evidence/w202619226.json) 与 [统一案例数据](selected_cases.json)。

![w202619226 e2e frame 8](media/w202619226_new_e2e_f08.png)

原始公共RGB：`results/e2e/full838_a_seed20260920/w202619226/public/obs_0008.png`；SHA256 `3e51820062d03f7cec8385bcac0f53920e3a1a2d74617c61ac32ed8c213e7670`。

## 对shortcut的有限判断

这些材料可以反驳“收益全是更会结束输出”这一单一解释：w202609209的base/new均完成、类别和数量均正确、首次16帧公共请求一致，但最终位置从0/5变5/5。w202609222在共同完成后仍有明显坐标与遗漏改进。它们没有排除资产先验、程序化分布熟悉度、固定扫描模板或投影工具依赖。

w202609208显示高度准确的坐标与错误类别可以同时发生；w202619205显示看见全部实例与最终零分可以同时发生；w202619226则显示几乎被遮住的目标能在宽阈值下命中。这三例约束了“通用空间理解已学成”的表述，支持后续有针对性的反事实实验，而不是把单个自信输出当机制证明。

本次未实施的新实验建议：冻结同一reader请求并遮掉/打乱关键像素；保持几何不变交换资产外观；提供同样视角但改变帧顺序/公开位姿；使用类别别名或新的资产形态；移除/扰动投影工具；比较新训练seed。只有这些干预才有望分离视觉证据、资产先验、流程学习与工具依赖。当前封存结果不能替代这些实验。

## 交付文件

- `selected_cases.json`：页面用统一案例schema，包括观察事实、解释、不能推出、全部5条件预测和评分、关键调用原文。
- `evidence/{world}.json`：只含去服务地址的公共请求历史、实际模型输出、精简调用元数据和源文件SHA。
- `media/` 与 `media_manifest.json`：18张原始RGB及可核对来源。
- `occlusion_pixel_audit.json`：三个遮挡案例逐帧目标像素复核；不是模型输入。
- `raw_response_verification.json`：263个实际调用的SSE/content一致性检查。
- `build_cases.py`：选例、提取和JSON构建，可离线复算。
