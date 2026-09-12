# 工具地图与已验证基线

查阅日期：2026-09-12。版本用于复现本次实践，不代表永远适合新项目；升级后重新运行最小模型、Core 与动作检查。

完整项目目录与上游来源见 [工具参考库](../tools/README.md) 和 [机器可读清单](../tools/catalog.json)。
本页保留制作主线的技术说明；日常操作可直接查 [命令速查](../tools/commands.md)。

## 实际承担生产工作的工具

| 工具 | 本次用途与基线 | 新项目如何使用 |
| --- | --- | --- |
| Codex / GPT-6 Astra Ultra | 用户确认方向、读取参考图、维护拆层坐标、修改导出器、检查动作、打包交付 | 本项目记录了一次成功实践；模型名称不是第三方工具的依赖，也不保证任意图片一次成功 |
| 图像生成 / 编辑工具 | 前期正面立绘与被遮挡部件补全 | 先让用户确认脸，再冻结已认可的脸；后续接缝修复优先改遮罩与绑定。宿主需自行提供可用图像工具及额度 |
| [PSD2Live / psd2live](https://github.com/tsunehimatoi/psd2live) | Kotlin 导出主线，固定 `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`；本 kit 附带经过实践的修补与 manifest 导入适配 | 见 [setup](setup.md)。它的项目名是 `psd2live`，不要误装名称相近的项目 |
| Java / Gradle / Kotlin | Java 21；基线 Gradle 9.6.1、Kotlin 2.4.10，由固定上游构建文件管理 | 首次构建需下载依赖；在同一个 checkout 串行导出，避免并发修改构建和输出 |
| Upscayl / upscayl-bin | Upscayl 2.15.0、Apple M4；调用已安装应用中的 NCNN CLI，4× 动漫超分 | 先做小样，确认 GPU 与参数兼容；[超分流程](upscaling.md)说明获取模型及保持 UV 的方法 |
| 官方 Cubism Core | 本次本地报告记录 Core `6.0.257`；独立读取实际 `.moc3`、检查参数极值和三角形 | 从官方渠道取得适合本机的 Core；kit 不携带其 Java/native/JS 二进制 |
| WebGL 预览 | 实际加载 `.model3.json`、`.moc3` 与 PNG；生产预览曾使用 PixiJS 6.5.10、pixi-live2d-display 0.4.0 和官方 Core | 浏览器画布必须渲染导出文件；用合成输入模拟面捕，不能拿 CSS 动图当绑定验证 |
| Playwright / 浏览器交互工具 | 参数网格截图、半身动作检查、窄屏布局、播放/暂停、文件哈希核对 | Playwright 用于可重复测试；Codex 浏览器工具用于打开页面、实际查看截图与操作。两者均不能代替目视审查 |
| shell、Git、JSON、SHA-256、ZIP 校验 | 批量导出、修订隔离、来源/产物一致性、完整打包 | 保留原始素材和版本；记录命令、退出码、工具版本、模型权重和文件哈希 |
| 图像诊断工具 | 读取 PNG/PSD、比较 alpha/边缘、查看单层与局部放大；本次使用 Java、Python/Pillow/NumPy、ImageMagick 等 | 数值检查负责定位；真实画面负责判断好不好看。不要把插值放大写成神经超分 |
| VTube Studio | 用户实际导入并验收过可用版本；最后一轮画质/拆层更新由用户继续验收 | 分别记录“Core 通过”“网页通过”“用户 VTS 通过”，不要用其中一个冒充另一个 |

PSD2Live 的[固定版本架构文档](https://github.com/tsunehimatoi/psd2live/blob/5526f2e16b57e5f83d34f33730d6fa26d8bc8695/docs/zh/AGENT_ARCHITECTURE.md)提供工作区与 Agent 接口背景。实际生产使用的是本地 Kotlin manifest → `SourceArt` → 导出管线；架构文档中的计划与演示不构成本 kit 已完成能力的证据。

## 生产主线与可选接入

```text
用户图片 → 经确认的正面母图 → 补全底层 / 精确拆层
        → manifest → 修补版 psd2live → 真正的 MOC3 / CMO3 / 图集
        → 官方 Core + WebGL 动作检查 → 图集超分 → 再验证 → VTS 用户验收

可选：psd2live MCP / Cubism External Edit MCP → 交互检查与编辑
可选：CLI-Anything Live2D → 包结构、引用与配置审查
```

已有 PNG 图层不等于已有 Live2D 绑定；`.model3.json` 是引用清单，不是网格或变形器。上游常规 CLI 接受 PSD，本 kit 的 manifest 适配层负责把独立 PNG 和源图遮罩放进同一坐标系，再交给真正的编码器。

[MCP 说明](../mcp/README.md)区分了本次用过的宿主能力与仅审查过的可选项目。完成本流程不要求同时安装所有 MCP。

## 通用 Core 几何诊断图

配置好 [setup](setup.md) 中的 `CUBISM_CORE_DIR` 与 Java 21 后，可直接给 Model3 清单生成诊断图；脚本按清单顺序读取所有纹理页，不要求某个角色的画布尺寸或脸部 crop：

```sh
bash scripts/render_core.sh work/character/low/MyCharacter.model3.json \
  work/character/diagnostics/neutral.png --size 1024 --background '#E5E7EB'
```

`--size` 是输出长边上限，不会放大原画布。可以加 `--margin 32` 留出动作超出画布的空间，或 `--set ParamAngleX=15` 指定模型实际存在且在范围内的参数。`--demo-dir` 配合 `--frames` 会输出 6 秒合成参数序列，跳过模型没有的标准参数；显式 `--set` 则在每一帧固定该值，输出的 `frames.json` 记录实际输入。演示输出使用新的空目录。

该脚本用官方 Core **计算网格**，再用 Java2D 三角形采样生成图像；不是官方 Cubism 渲染器。非普通混合、multiply/screen 颜色、边缘采样与遮罩表现可能不同，也没有读取 `physics3.json` 或进行追踪。它适合先确认模型有可见几何，最终接缝验收仍需真正的 WebGL/Cubism 或 VTS 画面。

## 先用官方简单模型隔离环境问题

本次先用 [Live2D Simple Model](https://www.live2d.com/en/learn/sample/simple-model/)确认官方 Core 能读取模型，再验证自制模型。该样例包括简单转头、眨眼、张嘴及 runtime 文件，适合检查 SDK/浏览器加载是否正常。

从官方页面自行获取并遵守 [Free Material License Agreement](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html) 与 [Sample Data Terms](https://www.live2d.com/learn/sample/model-terms/)。它没有被改为本仓库的 MIT 示例，也不随 kit 分发。kit 的 [minimal-model](../examples/minimal-model/)使用通用图形独立验证导出过程。

## 许可与获取边界

本仓库新增独立文档、脚本的 MIT 许可，不会替换被调用软件、补丁上下文、SDK、角色图片或权重的许可证。

| 组件 | 核实来源与处理 |
| --- | --- |
| psd2live | [GPL-3.0 原文](https://github.com/tsunehimatoi/psd2live/blob/5526f2e16b57e5f83d34f33730d6fa26d8bc8695/LICENSE)；`patches/` 与 `integrations/psd2live/`按各自声明处理；不宣称这些部分是 MIT |
| Upscayl / upscayl-ncnn | [应用 AGPL-3.0](https://github.com/upscayl/upscayl/blob/main/LICENSE)、[CLI AGPL-3.0](https://github.com/upscayl/upscayl-ncnn/blob/master/LICENSE)；作为用户单独安装的外部程序调用，不分发二进制 |
| Real-ESRGAN / 动漫权重 | [上游 BSD-3-Clause](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE)；具体模型来源与转换版本另记，不把整个 custom-models 集合视为一种许可 |
| Cubism Framework / Core | [官方许可证说明](https://github.com/Live2D/CubismWebFramework/blob/develop/LICENSE.md)：Framework 属 Live2D Open Software License，Core 属 Live2D Proprietary Software License；发布含 SDK 的应用还应核对对应 Release License。本 kit 不附带 SDK、Core 或 Framework |
| PixiJS / pixi-live2d-display | [PixiJS MIT](https://github.com/pixijs/pixijs/blob/v6.5.10/LICENSE)、[pixi-live2d-display MIT](https://github.com/guansss/pixi-live2d-display/blob/master/LICENSE)；其 MIT 不涵盖需要另外取得的 Cubism Core |
| CLI-Anything Live2D | [根仓库 Apache-2.0](https://github.com/HKUDS/CLI-Anything/blob/main/LICENSE)，但本次审查的 [子包 metadata](https://github.com/HKUDS/CLI-Anything/blob/810c18b0d1ab9b234bc996c9fd999318523a3ef0/live2d/agent-harness/setup.py) 标 MIT，存在不一致；仅提供链接，不将代码复制进 kit |
| CubismExternalEditMCP | [MIT](https://github.com/nana7chi/CubismExternalEditMCP/blob/master/LICENSE)；Editor 本体和外部 API 条件另外适用 |

This project is not affiliated with Live2D Inc.
