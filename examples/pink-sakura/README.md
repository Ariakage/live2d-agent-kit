# Pink Sakura · 角色工作流示例

**已收录可运行模型、五张原始输入、三张原眉分解衍生图与重建配方，完成 4× 动漫超分、原生 Core 和实际 WebGL 检查。** 当前版本新增独立左右眉毛；44 张脸部与 31 张全身概览已目视抽查，仍有已记录的小瑕疵；VTube Studio 待用户验收。运行入口是 [PinkSakura.model3.json](runtime/PinkSakura.model3.json)，使用时保留整个 `runtime/` 的相对目录。

这个示例使用用户明确授权收录的新粉色角色，演示从单张正面立绘制作 Live2D 的同一流程：保留认可的脸部与画风，补画被遮挡区域，精确拆层并建立绑定，检查嘴眼和发丝组合动作，再进行专用动漫超分。

原始参考图的来源标注：**此图片来自 ChatGPT Image2.5 生成**。这是用户提供的信息；后续补画的工具、版本状态和制作贡献另记在 [ATTRIBUTION.md](ATTRIBUTION.md)。原始输入和三张眉毛衍生图的尺寸、SHA-256、技术处理与生成提示保存在 [source-provenance.json](source-provenance.json)，不包含机器绝对路径。

![Pink Sakura 实际 WebGL 合成输入演示](verification/preview.gif)

演示来自实际模型画布：72 帧、12 fps，使用合成头部、眉毛、嘴眼和发丝输入，没有摄像头或麦克风输入。每帧请求值与实际参数见 [录制记录](verification/demo.json)；短演示不能代替极值检查。

## 目录与交付状态

| 产物 | 当前状态与完成条件 |
| --- | --- |
| 参考图、隐藏区域补画 | 五张原始 RGB PNG 已收录，另有可确定性重建的眉毛底图和两张 RGBA 眉层；通过测量配准与 alpha 拆层 |
| 拆层配方、坐标与绑定 | 24 个源层；实际运行模型为 24 参数、26 Drawable、7,180 顶点、11,904 三角形，含 2 个独立眉毛和 8 个发丝摆动参数 |
| 原分辨率运行模型 | 已导出；低分与高清 MOC 逐字节一致，低分图集可按配方重建 |
| 4× 高清运行图集 | 单页 2048² → 8192² 已完成；神经 RGB 超分与独立 bicubic alpha，保持布局、UV 与几何 |
| 原生 Core | 202 个姿态数值检查通过，含 125 个嘴形/张嘴组合；无未测得效果的参数 |
| 网页预览 | 22 项自动检查通过，24 个参数均测得 Drawable 变化；66 个姿态、91 帧实际画布检查已执行 |
| 视觉复核 | 模型 agent 查看 44 张脸部裁切和 31 张全身概览；范围、眉线细节和旧有细线限制单独记录 |
| VTube Studio | 待用户验收；Web 检查不代替此项 |

验证记录与最终文件身份见 [原生 Core](verification/native-core.json)、[资源结构](verification/structural.json)、[Web 自动检查](verification/web-smoke.json)、[画布姿态检查](verification/web-poses.json)和[实际超分记录](verification/upscale.json)。Native Core 为 6.0.257；Web 使用 Chrome 152.0.7977.83、Playwright 1.63.0 和 Web Core 5.1.0，实测 WebGL 最大纹理尺寸 16384。仓库仅收录选定截图；全部 91 帧身份已记录，可用检查脚本重新采集。

[视觉复核](verification/visual-review.json)针对本次眉毛版本重新执行：44 张脸部画布以 100% 像素裁切检查，31 张全身画布以 43% 比例概览，共 75 张；不表示 91 张均已精细目视。眉毛极值没有出现早期方案中的大白补片，嘴形/开口 15 种组合未见新的嘴周肤色块或分离双唇线。全身概览未见新的大块缺失或衣料矩形断口，不能据此排除每根发丝的小接缝。放大后仍可见眉毛与发线交叉处的浅点/分段、闭唇细线略发白/颗粒、闭睫毛端部偏钝；`EyeOpen=0..0.25` 有闭眼停留段。超分前后 91 个对应画布的 Drawable 状态摘要一致，数值比较与目视范围分别记录。

模型采用保守的二维头身运动，不包含独立手臂/手指绑定。本目录的自动验证使用合成输入且禁止摄像头；预览页面的可选真实追踪另见 [摄像头说明](../../docs/camera-tracking.md)，不能把这里的合成输入报告当作真实追踪验收。浏览器验证使用的 8192² 纹理在该环境通过，不代表所有设备的性能或纹理上限；更完整的证据范围见 [验证目录说明](verification/README.md)。

最终 MOC 的 SHA-256 为 `ba9c30d1a8a6382dad388caa67bf0baad944fc618b171bcb95613e4f7b6b19ae`；8192² RGBA 图集为 `8f0df8c8ec968dbebb6d1f89a8afd708a3f5843b1fae7b70a9d9cf31146d5361`，大小 45,336,522 字节。完整文件摘要见来源清单的 `final_evidence`。首次运行先用 [几何最小示例](../minimal-model/README.md)确认工具链；不能用 JSON 外壳或 MOC 文件头占位替代实际导出。

### 当前导出提示与源工程限制

低分和最终高清版都保留以下导出提示，原始记录见 [export-warnings.txt](verification/export-warnings.txt)。原生 Core 的 errors/warnings 为空，不会消除导出器对源工程和边界的这些提示。

| 导出器记录 | 对使用者的实际含义 |
| --- | --- |
| CMO3 未保留原始 PSD 源图编辑链，从一页图集重建可编辑图层；模型/Rig 数据保留 | CMO 可以保留该次模型与绑定信息，但不是完整保留原 PSD 图层来源的编辑工程；原始源图和拆层配方需另行保留。尚未在官方 Editor 中人工验收。 |
| `ArtMeshEyeCloseL` / `ArtMeshEyeCloseR` 的默认边界相对 PSD 有明显偏差 | 连续睫毛会重定位闭眼网格，必须结合开闭交接与实际可见状态检查；不能直接宣称“零警告”，也不能仅凭默认边界差判定整段动画失败。 |
| `ArtMeshBackHairL3` 原尺寸约 10×32 像素，默认顶部边界偏差约 7 像素 | 需要放大查看这块小后发片在中性与运动状态的覆盖和连接；原生数值有效不替代可见位置检查。 |
| 若干左右层共享语义名称，以稳定图层 ID 区分 | 同名提示与唯一运行标识分别核对，不应据此随意删掉其中一侧。 |

这些是最终导出时实际观察到的限制，不能把提示自动转换为美术通过或失败结论。此次导出复用了已有编译类并恢复运行依赖，未验证干净环境完整构建；执行身份见 [构建环境记录](verification/build-environment.json)及[环境恢复说明](../../docs/setup.md#依赖缓存缺失时怎样恢复)。

## 素材与配方怎样分工

| 文件，路径相对于本示例 | 在模型中的用途 |
| --- | --- |
| `source/reference.png` | 1024×1536 原始母图；认可的脸、前发与衣服仍以此为主来源，另保留原外侧/弧形发丝作为上覆层 |
| `source/body-underpainting-v1.png` | 1024×1536 身体/衣服补画候选；只填入实际被头发挡住的区域 |
| `source/face-parts-v1.png` | 1254×1254 面部补画；提取闭眼睫毛和小幅张嘴所需局部 |
| `source/eyeless-face-v1.png` | 1254×1254 无眼底图；只用于原眼睛下的局部肤色填充 |
| `source/rear-hair-underpainting-v1.png` | 1024×1536 绿底后发补画；采用其完整自然轮廓作为连续后发底层，部分可见后发也来自此图 |
| `source/eyebrow-base-v1.png`、`source/eyebrow-l-v1.png`、`source/eyebrow-r-v1.png` | 确定性分解原浅粉眉墨的底图与左右透明眉层；不改变原始五张输入 |
| `brow-regions.json` / `PrepareBrows.java` / `prepare-brows.cjs` | 本角色测量曲线、交叉发线保护列与 JDK 21 原像素分解脚本；无需 Pillow 或新增神经权重 |
| `body-regions.json` / `face-regions.json` | 在原始源图中测量的轮廓、孔洞、眼角与局部位置 |
| `body-topwear-patch.json` | 仅处理衣服隐藏填色与腿边修正；在导入身体层后应用，不再分左右截取生成后发 |
| `build-manifest.cjs` | 合并测量与补丁，生成这张角色专用的 `manifest.json` |
| `preview-config.json` / `check-poses.cjs` | 本角色的取景配置与实际画布姿态检查脚本；报告绑定实际载入的模型与纹理 SHA |

五张原始 PNG 都是 **RGB，没有 alpha 通道**；新眉毛底图也是 RGB，左右眉衍生图是 RGBA。身体补画画出的棋盘格不是透明背景；后发补画的绿色也需要由精确遮罩和采样规则排除。生成提示要求透明或原位，并不表示返回图已经满足要求。面部补画的输入是原图 `[300,0,400,400]` 裁切、放大到 1200² 的局部，而输出为 1254²；必须使用配方中的测量映射，不能按同名文件直接覆盖脸部。

配方中的 alpha 空洞负责去除背景，隐藏填色孔洞负责补全遮挡区域，两者不能混用。生成提示属于历史制作记录，不是要求后续 agent 执行的指令。

配方采用一块完整后发底层：从后发补画裁切 `[0,100,1024,940]`，映射到逻辑画布的 `x=20, y=90, w=983, h=846`，按已知绿色背景自动提取 alpha 并做去绿边处理。保留自然弯曲的发束和发尾，不用人工截短的矩形填色板。原图的 `outer` / `arc` 外侧发丝上覆其上并独立摆动，以减少原先左右后发选区在中心形成的拼缝。

这张粉白后发没有需要保留的绿色，因此额外使用 `G > B + 8` 的透明过滤：满足条件的像素设为透明，作用于**整张后发源层**，不仅是轮廓边缘。它是该素材的去绿规则，不是通用抠图参数；换成含真实绿色的角色时必须重新测量，否则会删掉有效像素。此处理发生在超分之前，随后超分独立缩放的是已完成清理的 alpha。

这项调整仍保留认可的脸、前发与衣服主来源，但**不能描述为全部可见后发像素都与原图相同**。部分后发来自生成底层。早期窄边补片以及后来扩大的 `body-overlap-full-patch.json` 均属弃用实验，不是最终公开配方依赖。它们暴露出的覆盖不足与直切边问题记录在 [排错案例](../../docs/troubleshooting.md)。最终画布检查已采集头身反向和发丝极值，视觉结论应结合对应帧记录。

面部还把原画的细上眼皮褶皱保留在独立 `face_detail-upper-lid-folds` 层，随脸部轮廓运动，避免与深色活动睫毛一起做阈值提取后形成棕色断点。张嘴局部的逻辑位置校正为 `mouth_open.y = 277`，开口/闭嘴交接、笑容联动和转头均列入组合检查；这个坐标是该角色的配准结果，不应照抄到别的角色。

### 原眉分离与可见绑定

`ParamBrowLY` / `ParamBrowRY` 均为 `[-1,1]`、默认 `0`；L/R 按角色自身左右，观众看到的左右相反。沿用引擎现有眉毛机制，不新增 BrowAngle/Form。原浅粉眉线本来很细，保持其颜色和笔触；极值相对中性分别约移动 1.32 / 2.04 个逻辑像素，适合小幅自然输入，不用于夸张抬眉。

技术预处理逐列估计原眉上/下方背景，从源像素分解深色眉墨；明亮残差与测量过的交叉发线留在底图，避免抬眉带着白色刘海块一起移动。保护列与曲线是本角色专用数据，不应直接照抄。重新运行预处理可逐字节得到三张公开衍生 PNG；输入/代码/输出 SHA 见 [brow-preparation.json](verification/brow-preparation.json)。

超分前的源复合对照中，眉区外像素完全一致，眉区内仅 19 个像素有最多 1 通道值差异。此数值只描述源图复合；不能外推成经过神经超分后的整张 HD 渲染逐像素相同。新旧中性 HD 画布另做目视对比，保留认可的脸、虹膜、睫毛与嘴形。

## 复现模板

以下命令从 **仓库根目录**运行，使用本示例已收录的源图、测量 JSON 与脚本。已将公开配方复制到全新工作目录，重新生成 24 层 manifest，与实际低分导出输入逐字节一致并通过结构检查。外部依赖仍需自行准备，这项配方重建不等于在干净环境中重新编译完整引擎。每次使用新的工作目录和导出目录；保留原始文件作为对照。

### 1. 准备外部工具

按 [setup](../../docs/setup.md)配置 Git、Python 3.10+、Node.js 和 JDK 21，然后准备固定的 psd2live。官方 Core/SDK、Web 渲染依赖、Upscayl 应用和权重均由使用者从原始渠道取得；不随本示例提供。

```sh
bash scripts/doctor.sh
bash scripts/setup-psd2live.sh
```

Core 命令需要已配置的 `CUBISM_CORE_DIR` 和 `VALIDATOR_JAVA`；Java 构建使用 JDK 21，不能直接假设系统默认版本相容。Upscayl 和权重的来源与 SHA 记录方法见 [超分指引](../../docs/upscaling.md)。

### 2. 从公开源文件重建原分辨率模型

`build-manifest.cjs` 按脚本所在目录读取配方。先复制到全新的 `work/` 目录，再生成 manifest；不会改写仓库内的公开母版。下面的复制拒绝覆盖已有目标目录，并略过已发布的 `runtime/`。

```sh
mkdir -p work
python3 -c "import shutil; shutil.copytree('examples/pink-sakura', 'work/pink-sakura-rebuild', ignore=shutil.ignore_patterns('runtime'))"
node work/pink-sakura-rebuild/prepare-brows.cjs
node work/pink-sakura-rebuild/build-manifest.cjs
bash scripts/validate.sh --manifest work/pink-sakura-rebuild/manifest.json
bash scripts/export-model.sh \
  work/pink-sakura-rebuild/manifest.json work/pink-sakura-rebuild/low
```

`prepare-brows.cjs` 使用 `VALIDATOR_JAVA` 指定的 JDK 21，未设置时使用 PATH 上的 `java`。它只重建工作目录中的三张衍生 PNG。

先检查 `low/` 的源图复合、导入图层及实际模型画面。尤其看原脸是否保持、半睁眼的睫毛粗细、`MouthSmile × MouthOpen` 的肤色接缝，以及后发在衣料边缘的连续性。结构有问题时先回到测量/填色配方修复，不能靠超分遮掩。

### 3. 验证低分运行结构，再做 4× 动漫超分

```sh
bash scripts/validate_core.sh \
  work/pink-sakura-rebuild/low/PinkSakura.moc3 \
  work/pink-sakura-rebuild/core-low-report.json
bash scripts/validate.sh \
  --model work/pink-sakura-rebuild/low/PinkSakura.model3.json \
  --core-report work/pink-sakura-rebuild/core-low-report.json
bash scripts/upscale-atlas.sh \
  --manifest work/pink-sakura-rebuild/manifest.json \
  --export work/pink-sakura-rebuild/low \
  --output work/pink-sakura-rebuild/upscale \
  --binary /path/to/upscayl-bin \
  --models /path/to/ncnn-models \
  --model realesr-animevideov3-x4 \
  --max-texture-size 8192
bash scripts/export-model.sh \
  work/pink-sakura-rebuild/upscale/manifest-hd.json \
  work/pink-sakura-rebuild/hd
```

路径占位符应指向自己的应用和成对 `.param` / `.bin` 权重。该流程对 RGB 做神经 4×，独立缩放低分图集已清理的 alpha；逻辑画布仍为 1024×1536。页数、布局、UV 与网格保持对应。若改了任何源层或排布，需要重做超分；不要把新低分 SHA 填进旧超分记录来绕过检查。

这里的 **4× 高清对象是 runtime atlas（运行图集）**，不表示源 PSD 的每个图层都已重新绘制或放大四倍。参考图与拆层仍使用各自记录的原始像素，PSD 的逻辑画布和图层坐标保持原大小；运行时通过同一套 UV 采样更高分辨率的纹理。交付说明应分别列出源图/PSD 与最终图集尺寸，不能把高清图集描述成“全图层 4× 重绘源工程”。

### 4. 核对最终高清模型

```sh
cmp work/pink-sakura-rebuild/low/PinkSakura.moc3 \
    work/pink-sakura-rebuild/hd/PinkSakura.moc3
bash scripts/validate_core.sh \
  work/pink-sakura-rebuild/hd/PinkSakura.moc3 \
  work/pink-sakura-rebuild/core-hd-report.json
bash scripts/validate.sh \
  --model work/pink-sakura-rebuild/hd/PinkSakura.model3.json \
  --core-report work/pink-sakura-rebuild/core-hd-report.json
```

`cmp` 验证本次低分/高清 MOC 是否逐字节一致，不能拿别人的历史 SHA 代替。原生 Core 检查有限数值、索引和参数组合，最终可爱程度、接缝与肤色仍需看真实画面。

### 5. 用实际 WebGL 检查动作与合成输入

```sh
python3 scripts/prepare-preview.py \
  --model work/pink-sakura-rebuild/hd/PinkSakura.model3.json \
  --output work/pink-sakura-rebuild/preview \
  --cubism-core /path/to/live2dcubismcore.min.js \
  --vendor-dir /path/to/web-vendor \
  --config work/pink-sakura-rebuild/preview-config.json \
  --reference work/pink-sakura-rebuild/source/reference.png
python3 work/pink-sakura-rebuild/preview/server.py --port 8837
```

确认 8837 空闲再启动；服务器保持运行，在另一终端执行浏览器检查。若使用已安装的 Chrome，可另设 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`；只设 `PLAYWRIGHT_MODULE` 不会选择浏览器程序。

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
node scripts/check-preview.cjs \
  --url http://127.0.0.1:8837/ \
  --output work/pink-sakura-rebuild/web-report.json \
  --screenshots work/pink-sakura-rebuild/web-shots
```

再执行本角色专用的真实画布姿态检查。上面的目录复制已包含 `check-poses.cjs`；它使用页面实际加载的模型，遍历头身、嘴眼组合、左右眉独立/反向与闭眼转头联动、独立摆发状态，采集真实画布供视觉复核。本次记录为 66 个姿态、91 帧；修改配方后的组合数和帧数以该次参数清单及脚本输出为准。

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
node work/pink-sakura-rebuild/check-poses.cjs \
  --url http://127.0.0.1:8837/ \
  --output work/pink-sakura-rebuild/pose-check
```

重新执行时，应阅读实际输出，逐帧检查脸部、闭眼/睁眼过渡、嘴周、后发与衣料连接，保存对应新文件的报告；已有报告不能用于另一套 MOC 或纹理。

需要录制 README 动作演示时，可从实际网页画布捕获 72 帧，再用 FFmpeg 编码。该脚本使用合成输入，另存每帧的请求值和 Core 实际参数；演示录制不代替上述极值检查。

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
node examples/pink-sakura/capture-demo.cjs \
  http://127.0.0.1:8837/ work/pink-sakura-rebuild/demo-frames
ffmpeg -framerate 12 -i work/pink-sakura-rebuild/demo-frames/frame-%03d.png \
  -filter_complex "[0:v]scale=440:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" \
  -loop 0 work/pink-sakura-rebuild/preview.gif
```

在页面中检查全身、半身、单眼/双眼闭合、嘴形与张嘴组合、头身反向和发丝摆动。脚本检查与目视检查分别记录，并核对浏览器实际载入的 MOC/纹理身份。这里模拟面捕/半身输入，不读取摄像头；详细依赖、操作和参数映射见 [预览模板](../../templates/web-preview/README.md)。

### 6. 连同署名与许可打包

`packaging/` 已提供能脱离仓库阅读的署名和许可文本，包含完整来源 URL 与随包文件名。发布自己的修改版本时补上新增贡献；不能把含仓库相对路径的 LICENSE 原样塞进 ZIP 后宣称链接均可用。

```sh
python3 scripts/package-model.py \
  --model work/pink-sakura-rebuild/hd/PinkSakura.model3.json \
  --core-report work/pink-sakura-rebuild/core-hd-report.json \
  --output work/pink-sakura-rebuild/release \
  --attribution work/pink-sakura-rebuild/packaging/ATTRIBUTION.md \
  --asset-license work/pink-sakura-rebuild/packaging/ASSET-LICENSE.md
```

打包器仅复制模型实际引用的资源和两份指定文本，输出文件夹、ZIP 和含 SHA 的 `release-metadata.json`。它不会把参考图、源工程、SDK 或权重悄悄加入运行包，也不会自动把 VTS 状态改为通过。可复建的源文件在本示例目录保留；新生成的 PSD/CMO3 在本地工作目录保存。

## 许可与来源保护

本示例素材采用 [CC BY 4.0](LICENSE.md)：允许署名使用、分享和修改，包括商用；需要保留来源与修改说明。项目意图是“允许署名使用和修改，禁止冒认作者”。适用文件范围和署名方式见 [许可证](LICENSE.md) 与 [署名文件](ATTRIBUTION.md)。

水印作为可选来源提示，不限制许可授予的再利用。隐水印目前只做方案评估，没有宣称已加标或能在直播截图中识别。技术边界和测试方法见 [示例保护方案](../../docs/model-protection.md)。

## 制作方法入口

- [完整工作流](../../docs/workflow.md)：母图确认、隐藏补画、绑定、检查与交付。
- [Manifest](../../docs/manifest.md)：源像素、裁切、逻辑画布、图集及 UV 坐标。
- [超分](../../docs/upscaling.md)：Upscayl NCNN 动漫 4×，RGB 和 alpha 分开处理。
- [排错](../../docs/troubleshooting.md)：嘴周色差、闭眼断线、黑边、发丝与衣料错位。

This project is not affiliated with Live2D Inc.
