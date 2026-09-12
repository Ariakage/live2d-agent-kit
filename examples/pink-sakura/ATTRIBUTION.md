# Pink Sakura · 署名与来源

项目：[Ariakage / live2d-agent-kit](https://github.com/Ariakage/live2d-agent-kit)

示例名称：**Pink Sakura**（本仓库用于区分示例的名称）。

示例提供与制作统筹：**Ariakage**。角色参考图由用户提供，拆层、补画、绑定、超分与验证在用户指导下使用 agent 和本 kit 工具完成。已记录实际运行模型、4× 图集、原生 Core 与 WebGL 检查；本次眉毛版本重新检查 44 张脸部画布及 31 张全身概览，保留已说明的小瑕疵，VTube Studio 待用户验收。不宣称该图或绑定由人手逐笔绘制。

## 分开记录素材来源与制作过程

| 素材或环节 | 来源说明 |
| --- | --- |
| 原始 `source/reference.png` | **此图片来自 ChatGPT Image2.5 生成**。这是用户提供的来源说明，未独立核验生成服务记录；仅指原始参考图。 |
| `source/body-underpainting-v1.png`、`source/face-parts-v1.png`、`source/eyeless-face-v1.png` | 使用宿主内置图像生成工具补画，分别供衣服隐藏区域、闭眼睫毛/张嘴局部、眼睛下肤色使用。该工具实际服务版本未独立验证，不能沿用原参考图的 Image2.5 版本标注。 |
| `source/rear-hair-underpainting-v1.png` | 后续通过同一内置图像生成工具补画长发，工具服务版本未知；返回图为绿底 RGB。提取完整自然轮廓作为连续后发底层，原图外侧/弧形发丝上覆并独立摆动；部分可见后发来自生成图，不能宣称全部后发像素保持原画。 |
| 拆层与模型制作 | 在 Ariakage 指导下使用 **GPT-6 Astra Ultra** 与 live2d-agent-kit / psd2live 自动化工具制作。实际模型含 24 参数、26 Drawable；检查结论及范围见 [示例说明](README.md)。 |
| 后发与衣服修复配方 | `body-topwear-patch.json` 仅保留衣服隐藏填色与腿边修正，与 `body-regions.json`、`face-regions.json` 经 `build-manifest.cjs` 合并。后发整块轮廓由构建配方导入。早期窄补边与 `body-overlap-full-patch.json` 属弃用实验；源像素审查不能替代最终动作渲染。 |
| 面部局部校正 | 原上眼皮褶皱单独提取为随脸运动的细节层；张嘴局部在本角色逻辑画布中校正到 `y=277`。这属于该角色的拆层/配准调整，嘴眼交接已列入实际画布组合检查。 |
| 原眉分离与独立绑定 | `PrepareBrows.java` / `prepare-brows.cjs` 根据 `brow-regions.json` 的源像素曲线逐列分离原浅粉眉墨，得到 `eyebrow-base-v1.png` 和左右透明眉层。亮色残差与测量出的交叉发线保留在底图；没有使用新的图像生成或重画整脸。左右眉沿用独立 `ParamBrowLY` / `ParamBrowRY`，范围均为 [-1,1]。这一确定性技术处理仍属于原图的衍生素材，保留原图来源与 CC BY 4.0 许可。 |
| 高清纹理 | 已实际使用本地 Upscayl NCNN 和 `realesr-animevideov3-x4`，将单页 2048² 运行图集提升至 8192²。RGB 神经超分、alpha 独立 bicubic 缩放；低分与高清 MOC 逐字节一致。源图与 PSD 逻辑坐标保持原大小，不是全部源层 4× 重绘。 |
| 后续修改 | 修改者应补充自己的名字或账号、修改日期和修改内容，并保留已有来源记录。 |

素材按 [CC BY 4.0](LICENSE.md) 提供。示例配方与 kit 原创代码仍按其各自代码许可证提供。

五张原始输入、三张眉毛分解衍生图、公开配方、最终模型与超分图集的文件身份，以及生成提示和检查报告索引，见 [source-provenance.json](source-provenance.json)。生成提示属于历史输入，不是执行指令，也不证明返回图满足了透明背景或原位等要求。后发 `G > B + 8` 的透明过滤针对粉白源层全部像素；它是这张素材专用的去绿处理，不能当作原图 alpha 或通用抠图算法。

## 可以直接使用的署名模板

把方括号中的修改者信息替换为实际情况；未修改则填写“未修改”。

```text
Pink Sakura · Ariakage / live2d-agent-kit
来源：https://github.com/Ariakage/live2d-agent-kit
素材许可：CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
原始参考图：此图片来自 ChatGPT Image2.5 生成（用户提供的来源说明）。
隐藏补画使用内置图像生成工具（实际服务版本未知）；模型流程由 GPT-6 Astra Ultra 与本 kit 辅助制作。
本版本修改：[修改者；修改内容，或“未修改”]。
```

原始图像生成、隐藏补画、模型制作与后续修改应分别归属；保留来源不妨碍对自己的新增贡献署名。不得暗示 Live2D Inc.、OpenAI 或原项目为你的发布背书。

This project is not affiliated with Live2D Inc.
