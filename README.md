# Live2D Agent Kit

把自己的参考图或分层 PSD 制作成可检查、可导入 VTube Studio 的 Live2D 模型：
为 Codex / 其他 coding agent 提供工作流程、素材清单适配器、经过实践的 psd2live 补丁、
动漫超分、真实 Core 验证和网页输入模拟。

本 kit 源于一次使用 **GPT-6 Astra Ultra** 完成的角色制作与多轮修复实践。
这是使用配置和案例记录；其他模型也能按流程工作，不保证任意一张图片能一键得到成熟绑定。
平面原图中被遮挡的头发、眼球、口腔和衣服仍需补画与定位，审美选择需要原画对照。

**This project is not affiliated with Live2D Inc.**

## 工具与原始资料链接

| 项目 / 资料 | 本流程中的用途 | 对应指引 |
| --- | --- | --- |
| [psd2live](https://github.com/tsunehimatoi/psd2live) · [中文 Agent 架构](https://github.com/tsunehimatoi/psd2live/blob/master/docs/zh/AGENT_ARCHITECTURE.md) | PSD/图层装配、绑定与真实 CMO3/MOC3 导出；kit 使用固定提交和累计补丁 | [安装](docs/setup.md)、[工作流](docs/workflow.md)、[manifest](docs/manifest.md) |
| [Live2D 官方 Simple Model](https://www.live2d.com/en/learn/sample/simple-model/) | 用官方简单样例隔离 Core / 预览环境问题 | [官方样例验证](docs/tooling.md#先用官方简单模型隔离环境问题) |
| [Live2D 官方 SDK](https://www.live2d.com/en/sdk/download/) · [Web SDK](https://www.live2d.com/en/sdk/download/web/) | 获取合法的官方 Core 与相应许可 | [Core 配置](docs/setup.md#配置本机官方-core)、[网页预览](templates/web-preview/README.md) |
| [Upscayl](https://github.com/upscayl/upscayl) · [官方发布](https://github.com/upscayl/upscayl/releases) | 本地 GPU 动漫超分应用与所附 CLI | [超分工具及命令](docs/upscaling.md) |
| [Upscayl custom-models](https://github.com/upscayl/custom-models) · [NCNN CLI 源码](https://github.com/upscayl/upscayl-ncnn) | 获取配套 `.param/.bin`，本次使用 `realesr-animevideov3-x4` | [模型获取与指纹](docs/upscaling.md#获取方式) |
| [CLI-Anything Live2D skill](https://github.com/HKUDS/CLI-Anything/blob/main/live2d/agent-harness/cli_anything/live2d/skills/SKILL.md) | 可选包检查；其占位模板不是真正模型编码器 | [接入范围](mcp/README.md) |
| [CubismExternalEditMCP](https://github.com/nana7chi/CubismExternalEditMCP) | 可选 Editor 外部 API 接入，需核对 Editor/API 版本 | [MCP 指引](mcp/README.md) |

链接指向各项目原始来源；官方样例、SDK 和权重分别获取并遵守各自条款，不随 kit 分发。

## 交给另一个 agent

在本仓库中启动 Codex，把下面内容与自己的图片一起交给它：

> 阅读 `SKILL.md`，按 `docs/workflow.md` 帮我把这些参考图做成 Live2D 模型。
> 先检查环境并运行最小示例，确认导出与真实 Core 可用；再按我的图片测量、拆层和绑定。
> 我认可的脸和画风要保留。请交付可追溯的源工程、运行包、网页动作预览和实际验证结果。

长任务提示见 [prompts/astra.md](prompts/astra.md)。可直接读取根 `SKILL.md`，
或把本仓库作为 `live2d-agent-kit` skill 安装到当前 agent 支持的技能目录；
无需安装 MCP 才能运行主线流程。

## 先跑最小示例

需要 Git、Python 3.10+、**JDK 21**。先读 [安装说明](docs/setup.md)。

```sh
bash scripts/doctor.sh
bash scripts/setup-psd2live.sh
java --source 21 examples/minimal-model/GenerateExample.java work/minimal/assets
bash scripts/export-model.sh work/minimal/assets/manifest.json work/minimal/low
bash scripts/validate.sh --model work/minimal/low/Minimal.model3.json
```

这一步生成真正的 PSD、CMO3、MOC3 和图集；最后一行只检查**文件结构**。
原生验证需要用户已有、版本和平台匹配的官方 Core：

```sh
export CUBISM_CORE_DIR=/path/to/your/local/core
bash scripts/validate_core.sh work/minimal/low/Minimal.moc3 work/minimal/core-report.json
bash scripts/validate.sh --model work/minimal/low/Minimal.model3.json \
  --core-report work/minimal/core-report.json
python3 scripts/package-model.py --model work/minimal/low/Minimal.model3.json \
  --core-report work/minimal/core-report.json --output work/minimal/runtime
```

最小示例是本仓库原创的几何测试素材，不包含案例角色图片。完整操作见
[示例说明](examples/minimal-model/README.md)。最终还要进行视觉检查与目标软件验收。

## 从自己的图片制作

| 入口 | 下一步 |
| --- | --- |
| 已有分层 PSD | `scripts/extract-psd.sh` 提取可见栅格图层，检查语义命名、位置、隐藏区域和拆层完整性。 |
| 只有参考图 / 平面立绘 | 先确定正面母图与画风；保留已认可脸部，补画隐藏区域，按原图坐标描出独立图层。 |
| 已有模型、存在接缝或错位 | 对比原图、透明合成、低分实际 Core；定位可见内容和运动归属，再修复。 |
| 模型正确但纹理模糊 | 先做小样选择专用动漫超分模型，再对最终原图集做 4× RGB 超分与独立 alpha 合成。 |

- [工作流程](docs/workflow.md)：从输入到交付，各阶段应留下哪些证据。
- [素材清单与坐标](docs/manifest.md)：PNG/PSD 路线、alpha holes、隐藏补画和特殊脸部模式。
- [工具地图](docs/tooling.md)：实际使用、可选评估和第三方许可。
- [动漫超分](docs/upscaling.md)：`realesr-animevideov3-x4`、Upscayl、透明边缘和 UV 不变的做法。
- [排错指南](docs/troubleshooting.md)：脸、眼角、嘴周色块、黑缝、发尾与背带错位。
- [Kit 复现记录](docs/verification.md)：通用示例的实际导出、Core、超分和检查指纹。
- [完整案例复盘](docs/case-study.md)：失败方法、修复证据与经验边界。
- [网页模板](templates/web-preview/README.md)：真实 Live2D 模型的面部/半身**输入模拟**；不是摄像头跟踪。
- [MCP 说明](mcp/README.md)：psd2live、CLI-Anything、CubismExternalEditMCP 的用途与限制。

## 仓库中的实现

`scripts/setup-psd2live.sh` 获取固定上游提交并验证补丁，不依赖浮动 HEAD。
`integrations/psd2live` 提供 PNG manifest 与 PSD 适配器；`patches` 提供小特征网格、
原像素脸部、头发绑定、纹理边缘延展和高清图集注入的实用修补。

`scripts/validate.sh` 检查资源结构，`validate_core.sh` 调用户本机官方原生 Core，
`check-preview.cjs` 检查真实 Web Core。结果绑定具体 MOC/图集 SHA-256。
结构通过、原生通过、画面正确和 VTube Studio 验收是不同结论。

素材、SDK、模型权重、生成结果与工具缓存都留在本机忽略目录。
本仓库不提供原案例角色图片、SDK、付费工具、超分权重或未取得授权的官方样例。

## 许可

原创 kit 代码、文档和提示主要采用 [MIT](LICENSE)。
`patches/psd2live-agent-kit.patch` 与 `integrations/psd2live/*.kt` 采用 **GPL-3.0-only**，
其上游来源和完整许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。
Live2D SDK、框架、样例、工具、权重与用户素材各自适用原条款，不被本仓库 MIT 覆盖。
