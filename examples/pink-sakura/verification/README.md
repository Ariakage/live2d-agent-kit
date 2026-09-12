# Pink Sakura · 验证证据

本目录记录 **2026-09-12 最终高清运行模型**的实际执行结果。它与通用几何最小示例、旧角色以及制作期间的低分候选分开记录。

| 检查 | 证据与实际范围 |
| --- | --- |
| 官方原生 Core | [native-core.json](native-core.json)：6.0.257，198 个取样姿态，22 参数、24 Drawable；错误和警告为空 |
| 文件完整性 | [structural.json](structural.json)：Model3 引用与最终 MOC 的原生报告 SHA 匹配；结构检查自身不运行 Core |
| 动漫超分 | [upscale.json](upscale.json)：本地 AnimeVideo v3 4×，2048² → 8192²；神经 RGB 与独立 alpha |
| 网页功能 | [web-smoke.json](web-smoke.json)：22 项通过；全部 22 参数测到网格或透明度变化；实际加载的 MOC、PNG 与预览清单 SHA 一致 |
| 动作矩阵 | [web-poses.json](web-poses.json)：55 个姿态、80 张实际画布；嘴形 × 开口、眼过渡、头身反向及各头发极值 |
| 目视复核 | [visual-review.json](visual-review.json) 汇总 [脸部](face-review.json) 与 [身体/后发](body-review.json) 的独立抽查、文件身份及小瑕疵 |
| 动作演示 | [preview.gif](preview.gif) 由实际 WebGL 画布的 72 帧合成输入演示编码，12 fps；参数记录见 [demo.json](demo.json) |
| 构建身份 | [build-environment.json](build-environment.json)、[编译类清单](compiled-classes.json)、[运行依赖来源](headless-dependencies.json)；只提供元数据，不分发第三方二进制 |
| 导出提示 | [export-warnings.txt](export-warnings.txt)：闭睫毛位置、细小后发片与 CMO3 源 PSD 编辑链的限制仍保留，没有用 Core 的空警告覆盖这些提示 |

浏览器为本机独立启动的 **Google Chrome 152.0.7977.83 / Playwright 1.63.0**，使用 **Web Core 5.1.0** 和实际 WebGL。没有访问摄像头、麦克风或 VTube Studio。8192² 纹理在本机检查通过，不代表所有设备的纹理上限和性能。

自动动作报告的 `visualReview: pending` 是脚本输出：自动化不替代目视审批。后续独立目视结果见 `visual-review.json`；不要把 80 张自动截图误写成每张都已人工检查。完整截图留在本地工作目录，仓库仅包含少量选帧和所有帧的身份记录，可以用上一级 `check-poses.cjs` 重跑。

部分发布报告将本机路径改为相对路径或占位符，并增加 `originalLocalReportSha256`。该字段指向脱敏前的本地报告字节；发布文件自身会有不同 SHA。模型、纹理和各截图的内容指纹保持不变。构建记录中的 `work/`、`.cache/` 路径描述当时的本地布局，不表示那些依赖已随库分发。

目视复核未发现旧的嘴周色块、分离双唇线、宽直切发尾或袖腿矩形断口。仍有轻微细闭唇颗粒、闭睫毛端部偏钝和放大后的细轮廓浅边；眼开合 0–0.25 有闭眼停留段。VTube Studio 验收继续由使用者在目标环境完成。

截图与 GIF 是本模型的派生画面，适用上一级 [CC BY 4.0 素材许可](../LICENSE.md)；检查脚本与原创报告文档适用仓库代码/文档许可。
