# 网站维护

## 本地与 Netlify 构建

需要 Node.js 22、Hugo extended 0.167.0，以及仓库内的 package-lock.json。

```sh
npm ci
npm run build
```

`build` 依次生成共用样式、同步 Lab 资源、检查格式与程序，最后运行 Hugo。输出目录是 `public`。Netlify 的 Build command 填 `npm run build`，Publish directory 填 `public`；如果仓库根目录就是本站，Base directory 留空。Netlify 会安装 npm 依赖，无需在命令里再次 npm install。版本已写在 netlify.toml。

本地预览：先 `npm run sync:shared`，再 `hugo server`，或在 PowerShell 运行 `./preview.ps1`。Windows 也可运行 `./build.ps1`，它会优先使用旁边 hugo-runtime 中的 Hugo。

## 文件职责

- `layouts/`：页面结构与共用模板。首页位于 index.html；Education 使用 home-education.html。
- `data/`：会议、教育、机构名称与联系方式；`content/`：文章、新闻和每个 Lab 的元数据。
- `ui/styles/`：样式源文件和共用尺寸。不要直接编辑生成的 static/css。模块顺序见 manifest.json。
- `static/js/ui-controls.js`：交互基础；lab-runtime.js：页面选择和图表默认值；lab-interface.js：布局、菜单、键盘和嵌入通信。
- `content/labs/<名称>/ui/app.js`：各 Lab 的状态与计算编排；engine/schema 管理模型和参数。
- `ui/workspace.txt`：Lab 页面源文件，Hugo 生成 ui/index.html。不要手动维护第二份入口。

修改后运行 `npm run format`、`npm run sync:shared`、`npm run build`。共用文件只修改 static 中的原件，同步命令负责四个 Lab 的副本。详细界面职责见 ui/README.md。

## Lab 保留与移除

完整源码保留四个 Lab。只公开 Curvature 与 MPCrystal 时，在发布副本中把 content/labs/orbitalflatness 和 content/labs/stablegsensor 整个目录移到仓库之外，再运行 npm run build。不要删本地完整维护副本。

首页、Lab 列表、论文关联、搜索及新闻链接会按剩余目录生成。上传全新 public，不要叠加旧输出。

## Curvature 的下载与计算

Local 从随站点提供的样例加载；Cloud 从 Zenodo ZIP 中按索引读取范围，不会下载整个 ZIP。下载采用 2 MB 分段，每段最多尝试两次、每次最长 90 秒；成功的数据在当前页面缓存两份。切换晶体会取消旧下载。

按钮空闲时为 Download 或 Calculate，运行时为 Cancel；状态行区分下载百分比与计算步骤。计算在 Worker 中进行，单次任务最长 120 秒；取消会停止下载、排队更新和计算 Worker，可重新运行。解压和 JSON 解析仍在主线程，因此大样例可能短暂影响界面；延长超时不能提高网络带宽。

科学参数、精度、单位和算法不因界面整理而改变。MPC 使用独立的渲染修订号防止旧图覆盖新状态；暂停时补画最终快照。图例仅在内容变化时重新排版。

## 联系、图片与资源体积

联系方式集中在 data/contact.json；机构名称在 data/institutions.json。学校官网与 SVT 部门入口各保留一个；个人 TUM profile 放在 Profiles。

MathJax 与 Plotly 已本地提供。Curvature 简单标签采用 HTML 符号，动态公式失败时显示简短提示。国内网络仍可能影响站点与 Zenodo，手机实际速度需要在当地设备验证。

Lab 目录约 502 MB，主要是内置样例、录制媒体、动画和第三方库，并非界面源代码。保留离线样例和独立 Lab 时，不应为了缩小源码包随意删除这些资源。发布副本移走两个未公开 Lab 可明显减小体积。
