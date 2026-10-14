# Hugo 网站维护

运行 `hugo server` 本地预览，运行 `hugo` 生成网站。无需 Python 或额外预处理。

## Lab：一个文件夹就是一个 Lab

全部位于 `content/labs/<名称>/`。`index.md` 管理名称、简介、顺序和关联 paper；`ui/` 存放对应 HTML、脚本、图标、图片和示例数据。HTML 源码为 `ui/workspace.txt`，Hugo 自动生成 `ui/index.html` 入口。

移除：把整个 Lab 文件夹移到网站目录之外，再运行 Hugo。恢复：移回来再运行 Hugo。首页、Lab 列表、论文关联和搜索自动同步。配置已启用清理旧输出。部署时上传完整新生成的 public，而非叠加旧文件。

StableGSensor、OrbitalFlatness 在完整维护源码中保留，当前 .gitignore 不会自动排除这两个 Lab。若本次只公开 MPCrystal 与 Curvature，在发布副本中移走 content/labs/orbitalflatness/ 与 content/labs/stablegsensor/；保留本地完整源码。然后运行 npm run sync:shared、npm run check:shared、npm run check 和 hugo --minify --cleanDestinationDir，使用完整新生成的 public。若直接发布完整源码，则四个 Lab 都会发布。

## 内容维护

论文：`content/papers/<文章>/index.md`；主图：`static/images/papers/`。
会议：`data/conferences.json`，按 date 自动倒序。
CV 正文：`data/cv.json`；CV 文件链接和 Wiki 地址：`config.yaml`。
个人首页：`layouts/index.html`。
各 Lab 的 Zenodo 配置：对应 `index.md` 的 data 字段（ui/lab-config.js 仅用于离线备用），集中在该 Lab 内。

## 首页

Labs 横向滑动展示当前 Lab；Papers 横向滑动展示最新四篇。每 3 秒自动循环，可暂停 / 继续、使用箭头或触屏滑动。鼠标停留、键盘聚焦或页面不可见时暂停。

## 核对记录

CV 的 ProcessNet 2019 写为 May，会议 programme 指向 March；网页采用 18–19 March，建议与原始海报再确认。2025 DECHEMA 的作者名单、2026 DECHEMA 的最终报告标题仍需作者确认。BME 访问日期和范围根据邀请函整理，未公开邀请函或签名。

## 联系与内容关联

联系邮箱统一在 config.yaml 的 params.email；个人资料链接与联系简介统一在 data/contact.json。首页、Contact 页和页脚共用这些数据。导航统一在 config.yaml 的 menu.main。Contact 用单数；Papers、Conferences、Labs 为集合用复数；CV、Wiki、News、Search 保留通行写法。

Lab 的 index.md 中 paper 字段填写论文文件夹名，只声明一次。论文卡片与详情自动找到对应 Lab，Lab 卡片与工具栏自动找到对应论文。两侧是各自独立的导航入口；无对应内容不显示链接。移走 Lab 文件夹后，论文上的入口自动消失。

建议 Hugo extended 0.167.0 或更新版本；当前预览使用旁边 hugo-runtime 中的新版，避免旧版本资源监听崩溃。

临时 TUM 邮箱：data/contact.json 的 additionalEmails。移除时把该数组改为 []，首页与 Contact 自动同步；个人邮箱仍在 config.yaml 的 params.email。

## 照片主题

config.yaml 的 params.portrait 同时决定首页照片和自动主题来源。替换照片后运行 Hugo，照片指纹变化会自动更新配色；首页和所有 Lab 读取同一主题脚本。状态色统一使用 success / warning / danger / info；科学图表数值色标独立保留。照片在浏览器本地分析，不上传。

自动主题会比较同色、邻近色和克制互补色候选，以照片协调度及主色对比度筛选；这是设计启发式，并非对审美的客观评分。背景保持明亮，主色与背景对比度至少 4.7:1，次要文字至少 4.5:1。

## 机构名称

data/institutions.json 集中维护 full（全称）、short（简称）、display（概览显示名）。CV 条目用 institutionID 关联，unit 保存院系；详细经历首次出现用全称加简称，后续用简称，首页与 CV 概览用 display。机构名称修改只需改此文件。


### Shared interface rules
Data source keys and labels live in `data/lab-ui.json`; hosted labs receive them through `LAB_CONFIG.ui`. The shared responsive contract lives in `static/css/design-system.css`. Main and parameter navigation scroll within their own row on narrow screens rather than widening the document. Keep scientific plots and comparison tables independently scrollable; do not hide page overflow to conceal layout errors.


### Workspace lifecycle
`static/js/lab-interface.js` emits `lab:suspend` with `page-exit` or `background`. Apps subscribe once and clean up their own work. MPC cancels its timer and retains a paused state on page exit; recorded media pauses on both events; Curvature stops rotation on exit. Opening a new instance creates independent state. Focus mode changes layout without replacing the iframe. Do not add per-app browser lifecycle listeners outside this contract.


### Embedded and standalone identity
The shared Lab shell renders the identity beside the back link. Generated apps detect embedding before first paint and hide only their duplicate brand; standalone apps retain it. Workspace height uses flex layout, not a fixed header-height subtraction. Toolbar actions wrap on mobile; never hide actions by positional selectors such as `:first-child`.


### CV ordering and current position
CV sections use stable `id` fields for anchors. The education overview finds the `education` section by id and the current entry by `current: true`, rather than relying on array position. Reordering sections or entries therefore does not change which position is described as current. Lab navigation labels map scientific state keys (including `results`) through `data/lab-ui.json`.


### Explicit header layouts
Each workspace header declares `data-header-layout`: `actions` for Curvature and StableGSensor, `modules` for MPCrystal, and `calculation` for OrbitalFlatness. Shared layout rules select this contract rather than guessing from the presence of a child element. Adding a status or button must not silently change layout type.


### Curvature 数据输入策略

仅保留 Local（随站点提供）与 Cloud（配置的数据集）来源。不提供用户晶体上传或本地文件夹连接；对应解析脚本和 Uploaded 分类已移除。所有 Lab 均不提供用户文件导入，包括设置文件。


### Lab build and recovery contract

All four Labs maintain `ui/workspace.txt`; Hugo generates the runnable `ui/index.html`. Missing workspace source or identity icon is a build error. Shared hosted styles and behavior come from `static/css/design-system.css` and `static/js/lab-interface.js`; bundled copies must match when preparing an offline version. Old standalone build instructions do not describe this site.

The host owns Restart lab, which replaces the iframe without depending on its scripts. Reset all is app-specific and restores scientific settings; Reset view changes only the camera. Do not describe these as equivalent operations. A failed or superseded calculation must not re-enable export of stale analysis.


## 源代码组织与清理规则

- `layouts/partials/labs-data.html`：Lab 元数据、排序与论文关系。
- `layouts/partials/lab-app.html`：生成工作区页面、注入配置与资源版本。
- `static/js/site.js`：有名称的主站交互初始化函数。
- `static/js/lab-interface.js`：共用导航、状态可访问性和生命周期；科学算法留在各 Lab。
- `static/css/design-system.css`：共享视觉与响应式规则，各 Lab 的 `style.css` 维护专属图表和布局。

首次运行 `npm ci` 安装锁定版本的开发工具。使用 `npm run format` 整理源代码，随后 `npm run sync:shared` 同步离线副本；检查用 `npm run format:check` 和 `npm run check:shared`。工具跳过第三方库、晶体目录、归档索引和构建产物。网页运行和 Hugo 构建不依赖这些 Node 开发工具。

样式中现有覆盖规则暂按原顺序保留：合并或删除时需要逐个验证桌面、手机、嵌入和独立工作区，不以缩短文件为目标。科学算法清理必须另做数值回归。

离线 `lab-config.js` 也由 `npm run sync:shared` 从 Lab frontmatter 和 `data/lab-ui.json` 生成，不应手动编辑。运行 `npm run check` 可检查自维护脚本语法，并执行 MPC/PI 默认运行及 Orbital 三维度数值冒烟检查。


## 状态色与选中态

照片主题只控制品牌与界面基调。运行/完成使用 success，待处理/等待样本使用 info，暂停和超出容差使用 warning，真正错误使用 danger；未启用与就绪为中性色。选中的 tab、参数分类和方法按钮表示界面选择，不表示计算成功。科学数值色标保留自己的数据含义。

MPC 模块使用 data-state：inactive、ready、active、paused、pending、complete、error。传感器已启用但控制器未运行时显示 Ready。Adapter 尚未积累足够样本使用信息状态，不标成 Bad。质量提示使用 Within/Outside tolerance，并给出判断阈值。


## Lab 导航架构

主导航统一使用 `data-section`，由共享脚本提供命名、选中语义和键盘规则，各应用负责自己的科学状态和页面内容切换。不要再引入 data-page/data-workspace/data-tab 三套主导航属性。

共同主导航以 Overview 开始，Display 展示结果；MPC 的 Operation、Orbital 的 Design、Curvature 的 Crystal library 按功能保留。无需为对称而添加空页面。参数类别和结果视图使用共享 toolbar 键盘规则；实际可用性由应用决定，例如 Orbital 无有效结果时禁用 Display。切换页面是否暂停播放或计算，遵循各应用生命周期说明，不能因统一导航而暗改。

主面板切换统一调用 `static/js/lab-runtime.js` 的 `LabWorkspace.selectSection`，负责校验目标可用性、显隐、选中状态及 aria-controls/aria-labelledby。`lab-interface.js` 负责键盘导航、命名和生命周期。各应用的切换函数仅维护科学状态、绘图和播放副作用，不重复绑定共用显示按钮。`LabCharts.font` 也由基础运行层提供。


### 整个页眉收起

右下角图标 Hide/Show lab controls 仅控制 Lab 内部固定操作/tab 栏。主站页眉和外层工具栏保留，由 Focus mode 独立控制。外层只向当前 iframe 发消息，内部校验来源；独立页面由同一共享脚本创建按钮。收起不会暂停、重启或迁移运行；Escape 可恢复。它与 Focus mode 独立，使用前应理解操作按钮也会收起。


### 用户文件输入策略

四个 Lab 均不提供用户上传、设置导入或本地文件夹连接。相应按钮、隐藏文件选择器与处理代码已移除。保留参数手动编辑、内置案例选择、已配置的数据集加载与导出。以后新增 Lab 应遵守相同规则。


### Reset all 统一语义

终止旧运行/任务，恢复初始科研输入和显示选项，撤下旧结果，再按该 Lab 的默认方式准备数据。MPC 回到未运行状态，StableGSensor 回到默认案例起始帧且不播放，Curvature 准备默认晶体分析，Orbital 恢复默认 2D 模型并自动计算。当前主 tab、Focus mode 与内部控件收起状态保留。Reset view 仅改相机；播放 Restart 仅回到起始帧；Restart lab 是故障恢复，不能与 Reset all 混淆。

固定操作栏使用共用 36px 控件高度与 12px 文字，状态融入操作按钮。设置导出已移除；MPC 导出 JSON/CSV，Orbital 导出计算结果，Curvature 导出图像。StableGSensor 播放、进度、倍速始终可见，案例与方法在 Options 内。手机按功能组换行。


### 参数说明与控制器分组

数值输入规则在计算型 Lab 使用可展开的 Input guide，保留单位和只读提示，但不常驻大段说明。StableGSensor 只有录制案例和播放选择，不添加无关的数值输入说明。

MPC Secondary controller 按 T-dot 与 T 两组排列，每组先 P 后 I；热响应常数放入 Reactor / Heat transfer。显示的 K_P,T 对应参考方程实际采用的 K_P_target，只读；界面去掉 Applied/Stored 后缀和冗长来源说明，算法差异保留在维护文档。主控制器参数页使用 MPC/PI 左右选择，表示浏览对应参数组，不会自动改变正在运行的控制模式。

鼠标设备的模块弹层仅在按钮或弹层悬停时显示；键盘导航仍支持 focus-within。控件收起按钮放在 Lab 外层工具栏，独立页放在页眉附近。计时显示分开数值与单位，固定区域宽度并使用等宽数字。


### 控制台与模式入口
MPC Parameters 只保留一个实际控制器模式入口（MPC/PI 分段按钮），主控制器参数随模式同步。Input guide 放在模式行末端，可选展开。Secondary controller 先按 Tdot/T 分组，T 的 P 独占一行，目标对应 I 在下一行。Operation 四个子系统采用紧凑卡片，各自容纳动作、选择与状态。共用页眉不再把运行按钮拉伸到剩余宽度；运行组与右侧导出/重置用留白和分隔线区分。步进图标使用 SVG 保证图形居中。


### 参数完整性保护
恢复 Secondary controller 的只读 K_I,T，并保留两个目标对应的可编辑积分增益；比例、积分分别成组，输入保持半宽。check 检查参数键重复、所有显示字段能从模型解析、两个目标的自动积分增益映射，以及必要温度增益未丢失。与清理前 schema 比较无缺失参数。OrbitalFlatness 参数搜索跨分组查找，Reset all 清空搜索。时间显示采用固定宽度的衬线排版；主题主色仍从照片提取，状态语义色保持独立。

### 跨 Lab 页眉分组
四个 Lab 的主要操作与右侧工具使用 data-toolbar-group=primary/secondary 标记，共用间距与右侧竖线。OrbitalFlatness 的 Grid 属于计算组；StableGSensor 的 Options 与 Reset all 属于右侧工具组，弹出面板使用两列布局防止模式按钮溢出。MPC Operation 的标题、选择与状态按固定行对齐；Adapter 下拉参数为同行三个等宽按压式多选按钮，保留原生复选语义，以主题填色表示选中。

### 窄屏控制台核对
390px 浏览器宽度下，MPC 顶部模块切为两列，Operation 子系统用单列卡片。清除旧 flex-basis 对标题与状态的撑高，按钮和目标选项保持可读字号。实测 iframe 文档 clientWidth/scrollWidth 均为375px，控制器卡片无内容溢出。检查预览时核对样式版本哈希，避免普通刷新仍使用旧页面引用。
Curvature 数据加载阶段显示 Loading data，避免将固定5%误认为计算进度。本地脚本加载30秒超时，失败清理pending并允许Retry loading；check覆盖加载超时后再次请求。
StableGSensor 页眉直接显示 Case、Methods、Correction/Detection，不再使用 Options 折叠层。时间轴限定48–110px，Case86px，窄屏分组换行。桌面1280px与手机390px已验证无文档横向溢出。


英文论文与会议标题采用统一 Title Case；介词和冠词按标题规则保留小写，缩写 EUCLID/PBM 保留，德语条目保留德语名词大小写。大小写直接维护在内容数据中，不使用CSS text-transform修改学术名称。
搜索索引包含论文 DOI 与期刊名；搜索归一化兼容连字符及德语ß/ss。索引请求重新验证缓存并设置15秒超时，失败后输入不会退回Loading状态。

全站审视：本地页面引用和锚点检查无缺失。搜索摘要独立于检索元数据，避免摘要堆叠作者/DOI；菜单Escape在捕获阶段处理，关闭菜单不会同时退出Focus mode（浏览器验证）。
CV 入口使用主页照片，22%透明度、右下角裁切及对角渐隐，不改变照片驱动的主题色。StableGSensor 页眉按Case/Methods/显示模式→播放/Frame/进度/速度→右侧Reset all排序，播放组间距24px，进度条固定80px并紧邻Frame。
当前工作所在地统一使用Freising, Germany；完整SVT工作地址仅Contact维护（官网核对85354），主页照片标记Shot in Paris, France。Contact采用小幅正式头像；News以独立内容页记录ISIC 2026和AMLD 2022现场报告，AMLD录影链接由本人提供。学科名称统一为Process Systems Engineering。

Lab 启动时用lab-initializing暂时隐藏iframe正文，DOMContentLoaded（defer脚本执行结束）后显示，避免原始操作页切到Overview产生闪屏；无需等待科学数据下载。ISIC新闻已换为完整报告现场照片。学校logo官方资源暂不可可靠下载，未使用替代或重绘标识。

学校标识采用本人提供的600px PNG原图，主页及CV统一方形白底容器，无重绘/透明处理。KIT本科硕士分别标注Sehr gut，本科单独标注Top1.13%，成绩维护在cv.json。

主页不显示KIT成绩及排名，CV继续保留。主页标识改为右上角40px方框，不占据独立行高。


### 手动移走未公开Lab
由本人移走content/labs/orbitalflatness及stablegsensor整个目录到仓库外。ISIC新闻使用lab-links短代码，只渲染仍存在的Lab。check在Orbital不存在时跳过该模型，仍检查其他模型。已在独立临时副本中验证干净构建、搜索与旧资源无残留；原四个Lab保留。
