# Pink Sakura · 验证证据

本目录记录 **2026-09-12 新增原眉绑定后的高清运行模型**。当前 MOC 为 `ba9c30d1a8a6382dad388caa67bf0baad944fc618b171bcb95613e4f7b6b19ae`。旧 22 参数版的运行与视觉报告已被本次结果替换；编译输出身份记录沿用同一编译树并重新核对 SHA，不表示又完成了一次干净构建。

| 检查 | 证据与实际范围 |
| --- | --- |
| 原眉分解 | [brow-preparation.json](brow-preparation.json)：原图、代码、测量与三张衍生图 SHA；逐字节重新生成通过；源复合眉区外无差异 |
| 官方原生 Core | [native-core.json](native-core.json)：6.0.257，202 个取样姿态，24 参数、26 Drawable；错误和警告为空 |
| 文件完整性 | [structural.json](structural.json)：Model3 引用与当前 MOC 的原生报告 SHA 匹配；结构检查自身不运行 Core |
| 动漫超分 | [upscale.json](upscale.json)：实际本地 AnimeVideo v3 4×，2048² → 8192²；固定低分输入快照，神经 RGB 与独立 alpha |
| 网页功能 | [web-smoke.json](web-smoke.json)：22 项通过；全部 24 参数测到网格或透明度变化；实际加载的 MOC、PNG 与预览清单 SHA 一致 |
| 动作矩阵 | [web-poses.json](web-poses.json)：66 个姿态、91 张实际画布；嘴形 × 开口、眼过渡、左右眉、眉眼转头组合、头身反向与发丝极值 |
| 目视复核 | [visual-review.json](visual-review.json) 索引 [脸部](face-review.json) 的 44 张原像素裁切和 [身体/后发](body-review.json) 的 31 张缩小概览；共 75 张，精细程度与局限明确区分 |
| 动作演示 | [preview.gif](preview.gif)：新 HD 实际 WebGL 72 帧，12 fps；[demo.json](demo.json) 含眉毛与其他合成输入的请求值和实际值 |
| 构建身份 | [build-environment.json](build-environment.json)、[编译类清单](compiled-classes.json)、[运行依赖来源](headless-dependencies.json)；只提供元数据，不分发第三方二进制 |
| 导出提示 | [export-warnings.txt](export-warnings.txt)：保留闭睫毛位置、小后发片及 CMO3 原 PSD 编辑链限制，不能用 Core 的空警告覆盖导出器提示 |

浏览器为本机独立启动的 **Google Chrome 152.0.7977.83 / Playwright 1.63.0**，使用 **Web Core 5.1.0** 和真实 WebGL。这里的脚本没有访问摄像头、麦克风或 VTube Studio；可选真实追踪另有检查记录。8192² 纹理在本机通过，不代表所有设备的性能或上限。

自动动作报告的 `visualReview: pending` 是脚本输出，自动化不替代目视审批。后续目视结果独立记录；不要把 91 张自动截图称为每张均已精细检查。完整截图留在本地工作目录，仓库包含少量选帧与全部帧的 SHA，可用 `check-poses.cjs` 重跑。LOW/HD 的 91 个对应 Drawable 状态摘要一致；它验证几何与透明度，不证明纹理没有美术问题。

原浅粉眉毛保持细笔触和小幅度，未重画加粗；抬眉时不再携带大白补片。放大后仍可能看见刘海交叉处的浅点/分段、闭唇细线的淡色颗粒与闭睫毛端部偏钝。EyeOpen 0–0.25 仍有闭眼停留段。全身概览不能排除细发丝或透明边的小瑕疵，VTube Studio 验收由使用者完成。

部分报告将本机路径替换成相对路径/占位符，并保留 `originalLocalReportSha256` 指向脱敏前字节；该值与发布文件自身 SHA 不同。模型、纹理和截图指纹不变。`work/`、`.cache/` 仅描述执行时本地布局，不表示依赖已经分发。

截图与 GIF 是本模型的派生画面，适用 [CC BY 4.0 素材许可](../LICENSE.md)；检查脚本与原创报告文档适用仓库代码/文档许可。
