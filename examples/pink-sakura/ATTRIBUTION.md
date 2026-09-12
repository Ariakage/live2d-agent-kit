# Pink Sakura · 署名与来源

项目：[Ariakage / live2d-agent-kit](https://github.com/Ariakage/live2d-agent-kit)

示例名称：**Pink Sakura**（本仓库用于区分示例的名称）。

示例提供与制作统筹：**Ariakage**。角色参考图由用户提供，拆层、补画、绑定、超分与验证在用户指导下使用 agent 和本 kit 工具完成；不宣称该图或绑定由人手逐笔绘制。

## 分开记录素材来源与制作过程

| 素材或环节 | 来源说明 |
| --- | --- |
| 原始 `source/reference.png` | **此图片来自 ChatGPT Image2.5 生成**。这是用户提供的来源说明，未独立核验生成服务记录；仅指原始参考图。 |
| `source/body-underpainting-v1.png`、`source/face-parts-v1.png`、`source/eyeless-face-v1.png` | 为建模隐藏区域和拆层制作的补画；使用宿主内置图像生成工具。该工具实际服务版本未独立验证，不能沿用原参考图的 Image2.5 版本标注。具体是否进入成品以最终构建配方为准。 |
| 拆层与模型制作 | 在 Ariakage 指导下使用 **GPT-6 Astra Ultra** 与 live2d-agent-kit / psd2live 自动化工具完成制作流程。该说明描述制作方式，不表示所有制作阶段已完成或通过验收。 |
| 高清纹理 | 计划使用本地 Upscayl NCNN 和 `realesr-animevideov3-x4`；最终结果应记录实际版本、参数、输入/输出指纹和验证报告。 |
| 后续修改 | 修改者应补充自己的名字或账号、修改日期和修改内容，并保留已有来源记录。 |

素材按 [CC BY 4.0](LICENSE.md) 提供。示例配方与 kit 原创代码仍按其各自代码许可证提供。

## 可以直接使用的署名模板

把方括号中的修改者信息替换为实际情况；未修改则填写“未修改”。

```text
Pink Sakura · Ariakage / live2d-agent-kit
来源：https://github.com/Ariakage/live2d-agent-kit
素材许可：CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
原始参考图：此图片来自 ChatGPT Image2.5 生成（用户提供的来源说明）。
隐藏补画使用内置图像生成工具；模型流程由 GPT-6 Astra Ultra 与本 kit 辅助完成。
本版本修改：[修改者；修改内容，或“未修改”]。
```

原始图像生成、隐藏补画、模型制作与后续修改应分别归属；保留来源不妨碍对自己的新增贡献署名。不得暗示 Live2D Inc.、OpenAI 或原项目为你的发布背书。

This project is not affiliated with Live2D Inc.
