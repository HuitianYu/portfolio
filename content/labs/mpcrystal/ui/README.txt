# MPCrystal Lab — simulation UI

这是可离线运行、可嵌入 Hugo 的浏览器仿真版本。原始 MATLAB 目录未修改。网页本身不需要 MATLAB、Python、服务器、OPC UA 或网络连接。

## 使用

The maintained HTML source is `workspace.txt`. Hugo generates `/labs/mpcrystal/ui/index.html`; edit the source files and rebuild the site. Keep the complete Lab bundle and its vendor assets together.

1. 顶部操作栏：选择 σ/G 控制目标，分别勾选 Eₐ、k₀、n 自适应参数；运行、测量、自适应和加晶种按钮集中显示。Parameters 中选择 MPC/PI。
2. Parameters：按 MATLAB GUI 的原分类修改参数；灰色字段由依赖项计算。
3. Start controller：开始新运行。Add seed 在下一步载入晶种；再次点击会替换晶种群，与原 GUI 一致。
4. Start growth rate：开启由过程模型产生的方向生长速率模拟值。Start adaptation 开启拟合；未开启测量时处于等待状态。
5. Display：查看实时图表。可选择面板、布局和曲线颜色；同一曲线在所有图表中使用同一颜色。
6. Pause/Resume 保留当前状态；暂停后 Advance one step 推进一个物理步长 Δt，便于检查单步变化。Stop 后再次 Start 会开始新运行。
7. Refresh controller 重置 EKF、自适应测量滤波器和控制器积分，保留过程状态与历史。Refresh growth measurement 重置测量滤波器及拟合样本。
8. Save variables 导出完整 JSON，包括参数、历史、晶种事件和当前粒径；Export results 导出 CSV。工具栏 Export 提供数据 JSON 与 CSV；不提供设置导出或文件导入。

右上角 Step interval 是播放间隔，与 Parameters 中的物理步长 Δt 独立。默认播放间隔为 0.5 s。计算或绘图耗时较长时，实际播放速度由设备性能决定。As fast as possible 仍逐步计算，图表刷新会节流以保持响应。

参数名称、数学符号、公式、单位、图轴和图例使用本地 MathJax 排版。控制目标与自适应参数使用 MathJax 排版的单选/复选控件；E、T、σ、u、v 等变量为斜体，A（activation）、j（jacket）、P/I（控制作用）及 set 等说明性下标为正体。参数支持安全算术表达式：`3e-8`、`250e-6`、`pi/6`、`sqrt(3)`、`exp(-2)`、`10**(-7)`；不执行导入内容中的代码。向量以 `[4,3,2]` 输入。

## Hugo 安装

解压 `mpcrystal-hugo.zip` 到 Hugo 项目根目录：

```
static/mpcrystal/index.html
layouts/shortcodes/mpcrystal.html
```

在 Markdown 页面中插入：

```
{{< mpcrystal height="1400" >}}
```

使用 iframe 可以隔离主题 CSS、公式渲染器和图表库。嵌入区域内部可滚动；可以调整 height。`relURL` 支持 Hugo 的子路径部署。无需打开 Hugo 的 unsafe HTML 选项。也可直接链接 `/mpcrystal/` 在完整窗口运行。

## 源码映射

| 网页文件 | MATLAB 参考 |
| --- | --- |
| `schema.js` | `gui_main/param_section.m`：原参数分组、变量对应和派生关系 |
| `app.js` | `gui_main/op_section.m`：操作开关、Refresh、加晶种和显示 |
| `engine.js` | `measure_controller_data.m`、`calculate_target.m`、`calculate_lag_time.m`、`calculate_T_j_set.m`、`read_growth_rate.m` 和 `subroutines_controller/` |
| `style.css` | 用户提供的 Orbit HTML 配色、排版、页头、标签页和参数卡片布局 |

实时图表包含温度、浓度及其导数、σ/G 目标与目标函数、方向生长速率、模型参数和延迟。原硬件 Count 图没有模拟数据来源，替换为明确标注的模拟晶体数量，不将其当作硬件测量值。颜色默认来自 `initialize_plots.m`。实时显示始终开启，页面不提供关闭开关。浓度 c 与温度、过饱和度、生长速率和夹套设定一起显示为五张大指标卡。温度与浓度原值/滤波值共享颜色，通过实线/点线区分。

## 仿真范围与数值差异

保留 glycine 溶解度多项式、带符号 Arrhenius 生长模型、球形晶体质量衡算、热传递模型、MPC 单变量有界优化、PI、目标相关参数、延迟外推、次级夹套控制、EKF 和自适应拟合顺序。

浏览器移植具有以下明确差异，不应视为 MATLAB 的逐位复现：

- MATLAB `ode45` 的状态预测改为 1 s 以下步长的 RK4；固定夹套温度下的反应器温度使用对应 ODE 的解析解。
- MATLAB `fminbnd` 改为黄金分割；自适应中 Eₐ、ln(k₀)、n 依次优化的独立一维最小二乘问题使用解析解并施加原先的相对边界。未改变“逐项拟合”的顺序。
- EKF 使用数值雅可比、Joseph 协方差更新，初始协方差取单位矩阵。生长测量的三状态滤波器保留原转移矩阵和噪声设置。
- 使用确定性浏览器随机数；其序列不同于 MATLAB 的 `rng/randn`。
- 原晶种数量求解目标内部反复随机采样，网页改为按正态分布三阶矩估算数量，并归一化体积以满足输入晶种质量。粒径下限和完全溶解时的体积下限避免产生负体积。
- 原 GUI 中 `calc_mode()` 固定返回 MPC，网页的状态估计和目标预测继续使用该模型；MPC/PI 选择只切换主控制器，与原调用关系一致。
- 原 `calc_T_j_set_.m` 实际使用 `K_P_target` 而非 `K_P_T`，调用传入的 `T_j` 在 GUI 主循环中保持初始化值。网页保留这一实际行为，避免悄悄改变控制规律；相应未使用的 K_P_T 参数从页面移除。
- 默认控制模型与过程模型参数不同。未开启自适应时，尤其 G 目标模式，不能保证达到设定值；这不是播放速度造成的。

已执行 MPC/PI × σ/G 四组默认完整步数测试，验证有限数值、夹套约束、确定性、质量归一化、Refresh 与结束边界。已执行浏览器交互、暂停/单步、加晶种、颜色一致、CSV、公式无错误、移动端和离线单文件检查。没有在此环境运行 MATLAB，因此尚未完成 MATLAB 轨迹对照验证。

## 清理与修正

- 移除实验/预存实验图像模式、OPC UA、摄像头/PVM、YOLO/Hough 识别和跨进程通信。
- 参数表重复的 `params.var_dT_dt` 合并。
- 参数表中 `params.var_dT` / `params.var_dc` 修正为实际模型使用的 `params.dT` / `params.dc`；其含义是测量标准差，计算 R 时平方。
- 修正房间温度、种晶质量/粒径、夹套更新间隔等原表格中错误的单位文字。
- 移除 GUI 主循环没有使用的自动种晶时间、IR/温度采样比、最小计数阈值和未实际参与参数记录的 n/k₀/Eₐ 滤波器配置。保留 GUI 的手动 Add seed 操作。
- 原 PI 积分增益函数固定返回 0，T_u 在活动路径中不生效，因此从页面移除；唯一实现的 PI 调参规则显示为只读。
- 初值仅在新运行时应用；噪声及增益修改按原 Refresh 操作重建滤波器。

## 文件与验证

The maintained HTML source is `workspace.txt`. Hugo generates `/labs/mpcrystal/ui/index.html`; edit the source files and rebuild the site. Keep the complete Lab bundle and its vendor assets together.
- `index.html` + 其余文件：可维护的多文件版本。
- `mpcrystal-hugo.zip`：Hugo 安装包。
- `mpcrystal-source.zip`：源码、库许可证和验证脚本。
- `tests/engine.cjs`、`tests/browser.cjs`：数值及浏览器验证。浏览器脚本的依赖路径针对创建此交付的环境，可按本机安装修改。

The maintained HTML source is `workspace.txt`. Hugo generates `/labs/mpcrystal/ui/index.html`; edit the source files and rebuild the site. Keep the complete Lab bundle and its vendor assets together.

MathJax 与 Plotly 库来自用户提供的 Orbit 包；许可证位于 `vendor/`。

## 本次界面更新

使用用户提供的 Figure02_MPCStructure.png 作为 Overview 的结构图；Reactor setups 分类包含热传递模型与反应器/夹套温度限制。页面展示的 G 公式使用生长区简式 G = k₀ σⁿ exp(−Eₐ/RT)，底层计算保留对负过饱和度的带符号处理，以避免改变溶解阶段的行为。

Filters 与 Adaptation 分为独立参数标签；生长模型分别标为 for control 和 for model。五张指标卡统一在下方显示符号及方括号单位：T [°C]、c [g g⁻¹]、σ [−]、G [m s⁻¹]、Tⱼ,set [°C]，大数值不重复附加单位。

`n操作区按 Controller、Growth measurement、Adaptation、Seed 分组。Refresh controller 位于控制目标与目标值之后；Refresh growth measurement 与测量启动按钮放在同组。播放控制与右上角间隔独立显示。

参数标签顺序：Control → Filter → Growth → Reactor → Adaptation → Simulation → Display。计数单位用 #，无量纲量用 −。操作第一行放控制器与生长测量，第二行放参数自适应与晶种。
参数按物理用途分区排序：热交换、环境、溶剂、溶质、几何；控制目标与共享数值保护；过程噪声与测量噪声；输入值与生效派生值。sigma_threshold 在 MPC/PI、sigma/G 分支之前检查，因此放在 Control / Target。操作台状态集中在顶部，目标值显示在按钮上方。

移除 Simulation 主标签：初始值、运行步数和晶种归入 Control；夹套动态与夹套温度限制合并到 Reactor / Jacket。参数分类按作用组织。

Target tracking 按原 initialize_plots.m 固定观察窗口：σ_set ± 0.005，G_set ± 5e-9 m/s；绝对误差 ≤ 阈值为 Good，超过为 Bad。非当前目标显示 Inactive。Growth parameters 图例单列显示以容纳长公式。


## Browser resource and recovery limits

Each target supports at most 10,000 steps; adaptation windows at most 200 samples; jacket integration at most 5,000 internal updates per simulation step. The total queued and active seed population is limited to 500,000 particles. Invalid seed additions leave the existing run and queue unchanged.

Pause stops the simulation timer. Leaving the workspace cancels the timer and preserves a paused state if browser history restores the document. Reset all clears the run. Restart lab in the surrounding website recreates the complete workspace if its internal controls no longer respond.


## Run provenance in JSON exports

Results retain the v1 format and existing fields. `initialParameters` and `initialOptions` capture the run start; `runEvents` records manual setting changes, queued seed additions and filter/controller refreshes. Each event includes `nextStep` and `afterTime` (seconds). `nextRunOnly` identifies edited initial conditions that do not replace current process states. `parameters` and `options` remain the final settings, not a claim that they applied to the entire run. Adaptive kinetic estimates are recorded in each history row. CSV exports remain trajectory tables; use JSON for the run context. This is a provenance record, not an implemented automatic replay feature.


## Parameter notation and temperature feedback

Use Δt for finite time intervals; δT and δc denote measurement precision and δTj the jacket resolution/deadband. Temperature derivatives use T-dot, including the objective weight w_(T-dot). Adaptation sample bounds use n_(adapt,min/max). Total-step names retain the existing target-specific notation.

The reference secondary-control equation uses K_P_target for its proportional temperature-feedback term, even though stored K_P_T_sigma/G values exist. The UI shows the actual proportional value under the standard K_P,T notation as a calculated field; unused stored gains are not shown. No algorithm substitution was made. K_I_T multiplies an integral of temperature error (K·s), so its displayed unit is s^-1. Temperature-gradient proportional and integral feedback retain units s and dimensionless, respectively.
