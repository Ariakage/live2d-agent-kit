# 工具参考库

这里集中收录本次模型制作、排错、超分和 kit 开发中实际涉及的工具。每项保留用途、上游入口、观察版本、获取方式、许可范围和证据；第三方软件以引用收录，原始 SDK、程序和权重由使用者另行取得，已授权的 Pink Sakura 示例素材随仓库提供。

**人读此页，agent 读 [catalog.json](catalog.json)。** 安装顺序见 [setup](../docs/setup.md)，操作顺序见 [workflow](../docs/workflow.md)，已有本地包装脚本见 [scripts](../scripts/)。

查阅日期：2026-09-12。`observed_version: "unknown"` 表示原记录没有足够版本证据；不是最新版，也不是不曾使用。固定提交才是可复现基线，网页上游链接可能继续变化。

## 状态说明

| 标记 | 含义 |
| --- | --- |
| **生产使用** | 参与素材、绑定、导出、纹理、实际网页渲染或工程组织 |
| **辅助验证** | 实际执行过检查、候选比较、诊断或用户验收；不等于参与最终编码 |
| **仅评估** | 查过源码、接口或环境，未将其未完成的能力算作生产成果 |
| **Kit 开发** | 整理可迁移流程、检查技能结构、构建通用示例与测试 |

这不是“所有条目都必须安装”的依赖清单。NCNN 属于推理二进制的底层组件；CLI-Anything 属于可选包审查；Editor MCP 不是批量导出的前提。

## 生产使用 · 21 项

| 工具 / 官方入口 | 观察基线 | 具体用途 | Kit 入口 |
| --- | --- | --- | --- |
| [psd2live](https://github.com/tsunehimatoi/psd2live) | `5526f2e16b57` | 将 SourceArt / PSD 转为真实网格、参数、物理、PSD、CMO3 和 MOC3。 | [setup-psd2live.sh](../scripts/setup-psd2live.sh) |
| [Java / OpenJDK 21](https://openjdk.org/projects/jdk/21/) | Java 21；发行版 Zulu，补丁版本 unknown | 编译运行导出适配、调用官方 Core、处理 alpha 与原创几何示例。 | [doctor.sh](../scripts/doctor.sh) |
| [Gradle Wrapper](https://gradle.org/) | 9.6.1 | 固定上游的 JVM 构建与导出任务。 | [psd2live-init.gradle](../scripts/psd2live-init.gradle) |
| [Kotlin](https://kotlinlang.org/) | 2.4.10 | psd2live 与 manifest / PSD 适配器实现语言。 | [ManifestExport.kt](../integrations/psd2live/ManifestExport.kt) |
| [Upscayl](https://github.com/upscayl/upscayl) | 2.15.0 | 提供本次本地动漫超分所用的 upscayl-bin。 | [upscale-atlas.sh](../scripts/upscale-atlas.sh) |
| [Upscayl NCNN / upscayl-bin](https://github.com/upscayl/upscayl-ncnn) | 随 Upscayl 2.15.0；独立 CLI 版本 unknown | GPU 分块推理 4× RGB 图集；实际参数 -z 4 -s 4 -t 256 -j 1:1:1。 | [upscale-atlas.py](../scripts/upscale-atlas.py) |
| [Tencent NCNN](https://github.com/Tencent/ncnn) | unknown | 作为 upscayl-bin 内部推理组件，读取 NCNN 网络结构和权重。 | [upscaling.md](../docs/upscaling.md) |
| [Upscayl custom-models](https://github.com/upscayl/custom-models) | unknown；精确权重以 SHA-256 记录 | 获取和辨认 Upscayl 可用的 NCNN 模型集合。 | [upscaling.md](../docs/upscaling.md) |
| [Real-ESRGAN / realesr-animevideov3-x4](https://github.com/xinntao/Real-ESRGAN) | AnimeVideo v3，NCNN x4；指纹见 catalog.json | 最终选定的动漫 RGB 神经超分模型；与独立 alpha 合成后保持原绑定与 UV。 | [upscale-atlas.py](../scripts/upscale-atlas.py) |
| [Live2D Cubism Core Web](https://www.live2d.com/en/sdk/download/) | 5.1.0 | 网页实际载入 MOC3 并驱动 WebGL 模型；与 native Core 分别验证。 | [prepare-preview.py](../scripts/prepare-preview.py) |
| [Python 3 / standard library](https://www.python.org/downloads/) | kit 使用 Python 3.14；原项目所有环境的精确版本 unknown | JSON/路径/PNG 头检查、导出编排、SHA、ZIP、静态服务和自动测试。 | [validate.py](../scripts/validate.py) |
| [Node.js](https://nodejs.org/en/download) | unknown | 运行浏览器回归、语法检查与网页相关开发脚本。 | [check-preview.cjs](../scripts/check-preview.cjs) |
| [PixiJS](https://github.com/pixijs/pixijs) | 6.5.10 | 预览模板 WebGL 画布、纹理和交互渲染基础。 | [README.md](../templates/web-preview/README.md) |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | 0.4.0 | 连接 PixiJS 与 Cubism Core，实际渲染 runtime、表情、动作和参数。 | [README.md](../templates/web-preview/README.md) |
| [Codex / GPT-6 Astra Ultra](https://openai.com/codex/) | 会话配置 GPT-6 Astra Ultra；宿主构建 unknown | 读参考图、计划、修改代码、协调审查、运行工具并汇总验证。 | [SKILL.md](../SKILL.md) |
| [宿主图像生成 / 编辑](https://openai.com/codex/) | unknown；宿主提供 | 生成前期正面立绘、重绘迭代以及被遮挡的底层素材。 | [astra.md](../prompts/astra.md) |
| [Shell / 文件与进程工具](https://www.gnu.org/software/bash/manual/) | Bash / zsh；版本 unknown | 运行脚本、检索源码、精确修改文件、检查端口和等待子进程。 | [doctor.sh](../scripts/doctor.sh) |
| [Git](https://git-scm.com/) | unknown | 克隆固定上游、应用累计补丁、核对工作区并保留 main 的本地提交。 | [setup-psd2live.py](../scripts/setup-psd2live.py) |
| [JSON / SHA-256 / ZIP 工程记录](https://docs.python.org/3/library/hashlib.html) | 算法/格式无单一工具版本；Python 标准库实现 | 把原画、权重、低清图集、MOC、预览响应和 ZIP 绑定到同一产物身份。 | [validate.py](../scripts/validate.py) |
| [多 agent 协作](https://openai.com/codex/) | unknown；宿主提供 | 独立审查源像素、几何、工具与文档，限定文件归属后由主 agent 集成。 | [AGENTS.md](../AGENTS.md) |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | 1.0.1；Face / Pose Lite float16/1 | 浏览器本地面部、眉毛和肩部/躯干输入；实际调用摄像头测试 | [摄像头指引](../docs/camera-tracking.md) |

## 辅助验证 · 15 项

| 工具 / 官方入口 | 观察基线 | 具体用途 | Kit 入口 |
| --- | --- | --- | --- |
| 4x-AnimeSharp-fp32（来源未完整保存） | 本地 NCNN fp32；精确作者/下载版本 unknown | 与 AnimeVideo 对比脸部、虹膜和线条；没有用于最终运行图集。 | [upscaling.md](../docs/upscaling.md) |
| [Live2D Cubism Core Java / native](https://www.live2d.com/en/sdk/download/) | 6.0.257 | 独立加载真实 MOC3、更新参数、读取顶点与透明度，并记录模型 SHA。 | [validate_core.java](../scripts/validate_core.java) |
| [Live2D 官方 Simple Model](https://www.live2d.com/en/learn/sample/simple-model/) | unknown | 先用官方 runtime 隔离 Core / 浏览器环境问题。 | [tooling.md](../docs/tooling.md) |
| [VTube Studio](https://denchisoft.com/) | unknown | 用户实际导入并验收较早运行版本。 | [workflow.md](../docs/workflow.md) |
| [Pillow](https://pillow.readthedocs.io/) | unknown | 读取图像与 alpha、局部合成、诊断接缝/遮罩，不替代神经超分。 | [case-study.md](../docs/case-study.md) |
| [NumPy](https://numpy.org/) | unknown | 像素数组、alpha 阈值、来源图重构差异和被遮挡 RGB 分析。 | [case-study.md](../docs/case-study.md) |
| [psd-tools](https://psd-tools.readthedocs.io/en/latest/) | unknown | 独立解码早期导出 PSD，检查图层数量、尺寸与像素复合误差。 | [tooling.md](../docs/tooling.md) |
| [ImageMagick](https://imagemagick.org/) | unknown | 将 4× 小样 Box 缩回原尺寸，计算归一化 RGB RMSE；辅助像素诊断。 | [upscaling.md](../docs/upscaling.md) |
| [FFmpeg](https://ffmpeg.org/) | unknown | 将官方 Core 计算、Java2D 输出的帧编码为 MP4 / WebM 诊断演示。 | [render_core.sh](../scripts/render_core.sh) |
| [Playwright](https://playwright.dev/) | unknown | 独立浏览器参数/组合动作截图、交互、HTTP 资源身份、窄屏和无摄像头请求检查。 | [check-preview.cjs](../scripts/check-preview.cjs) |
| [Chromium](https://www.chromium.org/) | unknown | 承载真实 WebGL / Core 的独立无头测试浏览器。 | [check-preview.cjs](../scripts/check-preview.cjs) |
| [CLI-Anything Live2D skill / CLI](https://github.com/HKUDS/CLI-Anything) | 0.3.0 · `810c18b0d1ab` | 实际执行资源引用、严格校验、lint 和 runtime 配置审查；也评估过生成边界。 | [README.md](../mcp/README.md) |
| [宿主图片查看](https://openai.com/codex/) | unknown；宿主提供 | 查看原图、透明复合、模型局部与参数状态，进行真实目视检查。 | [SKILL.md](../SKILL.md) |
| [CUA / 宿主浏览器工具](https://openai.com/codex/) | unknown；宿主接口可能变化 | 在可见网页中操作并查看真实模型，与 Playwright 回归互补。 | [README.md](../mcp/README.md) |
| [官方文档 / 源码浏览与 HTTP](https://github.com/) | unknown；宿主提供 | 核实上游能力、固定版本、许可、样例与错误边界。 | [tooling.md](../docs/tooling.md) |

## 仅评估 · 4 项

| 工具 / 官方入口 | 观察基线 | 具体用途 | Kit 入口 |
| --- | --- | --- | --- |
| [Live2D Cubism Editor](https://www.live2d.com/en/cubism/) | 本机 5.3.03；5.4 Alpha 仅资料审查 | 检查本机资源与 External Edit API 适用性；官方编辑器人工验收未完成。 | [README.md](../mcp/README.md) |
| [psd2live 内置 MCP](https://github.com/tsunehimatoi/psd2live/blob/5526f2e16b57e5f83d34f33730d6fa26d8bc8695/docs/zh/MCP_AUTHORING.md) | `5526f2e16b57` | 审查交互式工作区、参数、历史和透明图层接口。 | [README.md](../mcp/README.md) |
| [CubismExternalEditMCP](https://github.com/nana7chi/CubismExternalEditMCP) | 1.0.3 · `863ebc87d0fe` | 审查 Editor 查询/编辑能力，检查本机版本和接口监听情况。 | [README.md](../mcp/README.md) |
| [TrustMark](https://github.com/adobe/trustmark) · [官方 FAQ](https://opensource.contentauthenticity.org/docs/durable-cr/tm-faq/) | unknown；官方实现 MIT，仅资料评估 | 可选的像素来源标识。**未安装、未加标、未检测测试**；RGBA 需独立保留 alpha，Live2D 渲染截图的检出能力尚未验证。 | [水印与来源方案](../docs/model-protection.md) |

TrustMark 的评估不算已完成模型保护。图集原文件的标识不能直接推定在 UV 变形、透明混合后的画面中仍可读取。
[C2PA](https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html)是关联来源记录的标准，当前只作为文档参考，未执行签名，也不单独计入已运行工具。

## Kit 开发 · 7 项

| 工具 / 官方入口 | 观察基线 | 具体用途 | Kit 入口 |
| --- | --- | --- | --- |
| [skill-creator](https://github.com/openai/skills) | 宿主内置版本 unknown | 按技能创作规范整理 SKILL.md、metadata 与渐进文档，并运行 quick_validate。 | [SKILL.md](../SKILL.md) |
| [Live2D Agent Kit 原创脚本与通用示例](https://github.com/Ariakage/live2d-agent-kit) | 以当前 Git 提交为版本 | 将生产方法变成可重跑的 setup / export / validate / SR / preview / package 链。 | [README.md](../examples/minimal-model/README.md) |
| [Python unittest / 语法检查](https://docs.python.org/3/library/unittest.html) | Python 标准库；版本随解释器 | 验证路径边界、模型结构、报告身份、打包和脚本语法。 | [test_validation.py](../tests/test_validation.py) |
| [Mermaid](https://github.com/mermaid-js/mermaid) | 11.17.2 | 渲染 README 的 8 节点工作流图，在独立本地浏览器检查排版。 | [README.md](../README.md) |
| [Marked](https://github.com/markedjs/marked) | 17.0.5 | 将 README Markdown 转成临时本地预览 HTML，配合 Playwright 验证窄屏排版。 | [README.md](../README.md) |
| [Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 用户提供的本地 skill；未声明版本 | 中文 README 文字审校，保留技术事实与命令 | [README.md](../README.md) |
| [Humanizer](https://github.com/blader/humanizer) | 本地 frontmatter 2.8.2 | 英文 README 草稿、自审与修订 | [README.en.md](../README.en.md) |


## 获取与复现

| 需要做的事 | 获取顺序 / 本仓库入口 |
| --- | --- |
| 从图层导出模型 | 安装 Git、Python 3、JDK 21 → [setup-psd2live.sh](../scripts/setup-psd2live.sh) → [manifest 适配](../integrations/psd2live/README.md) → [export-model.sh](../scripts/export-model.sh) |
| 先验证环境 | 从 [官方 Simple Model](https://www.live2d.com/en/learn/sample/simple-model/)取得 runtime，使用自己合法取得的官方 Core；再运行本仓库 [几何最小示例](../examples/minimal-model/README.md)验证自制导出链 |
| 检查实际 MOC3 | [validate_core.sh](../scripts/validate_core.sh) + 本机 Core；[validate.sh](../scripts/validate.sh)检查文件引用和报告身份。仅有 model3 / MOC 文件头不算绑定成功 |
| 开网页模拟输入 | 准备自己取得的 Core Web、PixiJS、pixi-live2d-display → [网页模板](../templates/web-preview/README.md) → [check-preview.cjs](../scripts/check-preview.cjs)；模拟不打开摄像头 |
| 做 4× 动漫超分 | [Upscayl Releases](https://github.com/upscayl/upscayl/releases)取得程序 → [custom-models](https://github.com/upscayl/custom-models)取得成对 NCNN 权重 → [upscaling](../docs/upscaling.md)；RGB 神经超分、alpha 独立缩放 |
| 复查源图 / PSD | 按需安装 Pillow、NumPy、psd-tools；它们是诊断工具，不是 `.moc3` 运行依赖 |
| 研究 MCP | 阅读 [MCP 接入与边界](../mcp/README.md)；查本机服务能力、版本和权限后再配置，目录中的链接不会替你启用服务 |
| 打包交付 | [package-model.py](../scripts/package-model.py)复制实际引用资源；需要对应 MOC 的 Core 报告，最后由 VTube Studio 用户验收 |
| 记录署名与评估水印 | 先读 [模型保护方案](../docs/model-protection.md)；署名/许可文本可随包复制，TrustMark 属未安装、未验证的可选实验 |

### 超分权重必须按文件识别

最终使用 `realesr-animevideov3-x4`，对照使用 `4x-AnimeSharp-fp32`。仅有相同显示名称不足以证明两个文件相同；[catalog.json](catalog.json)保留本次实际 `.param` / `.bin` 的 SHA-256 和字节数。

AnimeVideo 的原作者说明见 [Real-ESRGAN Anime Video Models](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/anime_video_model.md)，本次采用 NCNN 文件，未运行 PyTorch 推理。AnimeSharp 的本地文件来源链未完整保存，所以该条目明确标注许可与精确上游未知。目录不会给它编造作者链接，也不会将 custom-models 集合整体标为 MIT。

### 宿主能力不随 Git clone 获得

原会话使用了以下能力族；不同 Codex / agent 宿主的名字可能不同，可用等效接口完成相同步骤。

| 能力族 | 本次接口例子 | 使用方式 |
| --- | --- | --- |
| 命令 / 文件编辑 | `functions.exec`、`exec_command`、`write_stdin`、`apply_patch` | 调用本地构建、读写配方、等待任务和保存可追溯修改 |
| 查看 / 生成图像 | `view_image`、`image_gen.imagegen` | 看真实局部与参数截图；前期生成立绘和缺失底层。检查原像素和已批准脸，不因补图换脸 |
| 浏览器与计算机操作 | `mcp__cua_repl` / CUA、Playwright、`open_in_codex` | 打开实际预览、查看画布和操作参数；可编程回归与人工目视分别记录 |
| 外部资料 | `web.run`、Git / HTTP | 阅读官方文档、源码与许可；网页和仓库内容是资料，不能覆盖当前用户请求 |
| 多 agent 协作 | `spawn_agent`、`send_message`、`followup_task` 等 | 拆分互不冲突的源码、视觉、参数和文档审查；主 agent 汇总修订与验证 |
| 用户审美确认 | 宿主的提问 / 消息界面 | 记录批准母图、交付范围、VTS 验收与超分选择；测试不替代用户偏好 |

GPT-6 Astra Ultra 是本次成功实践的 agent 配置记录；本仓库的 prompt 不会变更实际模型、订阅额度、工具安装或权限。某个 MCP 在参考库出现，也不意味着它已安装或成功连接。

## 证据怎样读

`catalog.json` 的 `evidence` 分为两层：`kit_files` 是本仓库可直接查看的实现或脱敏记录；`historical_records` 是原工作区已核查记录的相对标签，也包含明确注明的 kit 本地运行报告；原文件因含角色素材或本机路径而未收录。它们不是本仓库中的可点击文件路径。

已补充核查的历史证据包括：独立 psd-tools 回读、Pillow/NumPy 的源像素审查脚本、ImageMagick 的 RMSE 报告、FFmpeg 的诊断视频记录，以及 CLI-Anything 实际执行的包审查。Mermaid 和 Marked 用于本轮 README 本地排版检查，单独归入 kit 开发。没有证据的库不会因“通常可能用到”而列入，例如没有把 OpenCV、rembg 或 Photoshop 写成生产依赖。新增的 MediaPipe 摄像头实现有单独的依赖锁和真实设备测试记录。

查看 [kit 复现记录](../docs/verification.md)与[历史案例](../docs/case-study.md)可区分通用示例和原角色的结果。官方 native Core 的 `6.0.257` 与 Web Core 的 `5.1.0` 分别来自各自实际记录，不能混为同一个版本。用户曾验收过较早的 VTS 模型，后续修订不能继承该结论。

## 目录维护

新增条目至少填写稳定 `id`、`name`、`usage_status`、`purpose`、`observed_version`、`upstream`、`acquisition`、`license`、`integration_paths` 和 `evidence`。未知项明确写 `unknown`；不要根据今天安装的软件反推昨天的版本。模型权重可加 `fingerprints`，但不可将文件复制进目录。

更新后运行 `bash scripts/validate.sh --kit`。跨平台程序、GPU、SDK 与权重升级需要重跑对应链路；引用目录本身不是安装脚本或许可证替代文本。完整分发边界见 [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md)。

This project is not affiliated with Live2D Inc.

## 本地摄像头输入

| 工具 | 固定版本与用途 | 获取和检查 |
| --- | --- | --- |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | `1.0.1`；Face Landmarker + Pose Landmarker Lite `float16/1`，本地面部/眉毛/上半身输入 | [依赖锁](tracking-dependencies.json) · [安装和设备测试](../docs/camera-tracking.md) |

JS、WASM 与模型任务文件单独下载到忽略目录，并按锁核对大小和 SHA；仓库只包含集成代码和获取说明。浏览器仅在用户主动开始后申请视频流，默认模拟继续不使用设备。

MediaPipe 1.0.1 虽在本机推理，仍会发送性能/使用统计，包括关闭识别器时的剩余统计。官方没有 opt-out API；本 kit 的服务返回 `Content-Security-Policy: connect-src 'self'` 阻断外连，不修改上游 SDK 字节。其它托管必须保留同等策略，并分别检查被拦截的尝试与实际发送。来源见 [Google 隐私说明](https://developers.google.com/edge/mediapipe/solutions/tasks#mediapipe_tasks_privacy_notice)与[维护者关于阻断外连的回复](https://github.com/google-ai-edge/mediapipe/issues/6306#issuecomment-4673728357)，具体边界见[摄像头指引](../docs/camera-tracking.md#网络边界与-sdk-遥测)。
