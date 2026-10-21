# Pink Sakura · 角色工作流示例

**本例包含公开源图、拆层配方、37 参数高清模型，以及表情与动作生成器。** 当前版本增加身体和衣料动态，保留已认可的脸与原高清图集。运行入口是 [PinkSakura.model3.json](runtime/PinkSakura.model3.json)，使用时保留整个 `runtime/` 的相对目录。

这个示例使用用户明确授权收录的新粉色角色，演示从单张正面立绘制作 Live2D 的流程：补画遮挡区域、测量拆层、绑定、检查组合动作、动漫超分，再验证与打包。

原始参考图的来源标注：**此图片来自 ChatGPT Image2.5 生成**。这是用户提供的信息；后续补画与模型制作贡献见 [ATTRIBUTION.md](ATTRIBUTION.md)。输入尺寸、SHA-256 和技术处理记录在 [source-provenance.json](source-provenance.json)。

![Pink Sakura 早期眉毛版本的实际 WebGL 合成输入演示](verification/preview.gif)

上方是早期眉毛版本的 72 帧、12 fps 演示，使用合成输入，没有摄像头或麦克风输入。它展示原脸、头部和发丝，尚未包含本轮身体动态。最新检查见[动态验证记录](verification/dynamics-20261020/README.md)。

## 当前模型

| 项目 | 内容 |
| --- | --- |
| 结构 | 24 个源层、37 参数、26 Drawable、7,180 顶点、11,904 三角形 |
| 面部 | 独立左右眉、眼睛、视线与嘴形；保留原面部素材与绑定 |
| 身体 | 9 个串联局部变形器；双肩、胸腰、上臂与袖口轻摆、裙摆 |
| 配件与环境输入 | 发饰、8 个发丝参数、14 组物理；`ParamFloat` 为整体 ±8 原画像素，`ParamWind` 经物理驱动次级摆动 |
| 表情 | Smile、SoftSmile、WinkLeft、WinkRight、Surprised、Smug、Angry、Sleepy |
| 动作 | Idle、Blink、Nod、Shake；新增 Quiet、Curious、Sleepy、Airy、SlowBlink、SpeechBob |
| 高清图集 | `realesr-animevideov3-x4`，2048² → 8192²；RGB 神经超分与独立 alpha，保持布局和 UV |

身体、袖子和手部仍使用连续图层。上臂输入只做 ±1.5° 的局部轻摆，没有新增托下巴、比心、招手或手指动作。九个变形器在中性点保持恒等映射，源图、图集排布和网格拓扑不变；实际画面仍需结合组合动作检查。

8 个表情只使用已有嘴眼和眉毛参数，没有新增表情贴图。原眉线很细，Angry 是轻微不悦；半闭眼睫毛仍偏厚，`EyeOpen=0..0.25` 保留闭眼停留段，闭唇线也偏淡。这些预设不代表完成了新的表情美术精修。

网页会轮换 Quiet / Curious / Sleepy 待机，并提供默认关闭的额外呼吸、微风、浮动与说话微动。六路上半身估计映射到新参数，校准、失去跟踪和暂停行为见[摄像头说明](../../docs/camera-tracking.md)。本轮自动检查使用合成输入并禁止打开摄像头；真实摄像头、30 分钟长跑与 VTube Studio 验收需分别进行。

## 验证与历史记录

最新文件身份、Core / Web 检查、连续动作路径、中性脸部对比和选帧目视范围集中在[动态验证记录](verification/dynamics-20261020/README.md)。自动连续帧检查不等于每帧都经过人工精看，原生数值有效也不能替代接缝与画风验收。

本轮通过固定 psd2live 重新编译适配器并导出 LOW / HD，另做 Minimal 实际导出与 Core / Web 回归。使用的是已有 Gradle 依赖缓存，并非一次新的空缓存构建。低分图集与上一版逐字节一致后，复用原 `realesr-animevideov3-x4` 高清图集；没有重复神经超分。8192² 图集 SHA-256 仍为 `8f0df8c8ec968dbebb6d1f89a8afd708a3f5843b1fae7b70a9d9cf31146d5361`。

早期 24 参数眉毛版本的 [202 姿态 Core 检查](verification/native-core.json)、[91 帧画布记录](verification/web-poses.json)、[75 张选帧目视记录](verification/visual-review.json)、[超分记录](verification/upscale.json)，以及 [2026-10-17 连续动作检查](verification/continuous-20261017/README.md)仍保留为历史证据，不能用于替代新版 MOC 的验收。各轮版本边界见[验证索引](verification/README.md)。

### 源工程与导出限制

CMO3 保留模型与绑定，但可编辑图层从图集重建，不保留原 PSD 的完整来源编辑链。继续制作时需同时保留公开源图、测量和生成脚本；官方 Editor 中的人工验收另行进行。

导出器的闭眼网格默认边界、小后发层边界与重复语义名提示需要结合实际画面判断。[早期提示](verification/export-warnings.txt)保留用于对照；每次重新导出仍应检查自己的日志，不能用 Core 数值通过抹去提示。8192² 纹理也不保证在所有设备上有相同性能。

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
| `dynamics-regions.json` | 1024×1536 画布内的肩、腰和发饰锚点及幅度；`pink-sakura-v1` 专用原生变形配方，必须随源包保留 |
| `build-manifest.cjs` | 合并测量与补丁，生成这张角色专用的 `manifest.json` |
| `build-performance.cjs` | 对匹配原生 Core 报告的新导出目录生成 8 个表情和 6 个新增动作；拒绝覆盖已发布模型 |
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

`prepare-brows.cjs` 使用 `VALIDATOR_JAVA` 指定的 JDK 21，未设置时使用 PATH 上的 `java`。它只重建工作目录中的三张衍生 PNG。上述复制同时保留 `dynamics-regions.json`；manifest 的 `config.pink_dynamics` 相对路径必须能在配方目录内解析，不需要作者原来的 `work/` 文件。

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

### 4. 核对高清模型并生成表情与动作

```sh
cmp work/pink-sakura-rebuild/low/PinkSakura.moc3 \
    work/pink-sakura-rebuild/hd/PinkSakura.moc3
bash scripts/validate_core.sh \
  work/pink-sakura-rebuild/hd/PinkSakura.moc3 \
  work/pink-sakura-rebuild/core-hd-report.json
node work/pink-sakura-rebuild/build-performance.cjs \
  work/pink-sakura-rebuild/hd \
  work/pink-sakura-rebuild/core-hd-report.json
bash scripts/validate.sh \
  --model work/pink-sakura-rebuild/hd/PinkSakura.model3.json \
  --core-report work/pink-sakura-rebuild/core-hd-report.json
```

`build-performance.cjs` 必须在新的导出目录运行，并提供与该 MOC SHA 匹配、检查通过的原生 Core 报告。它更新 `model3.json` 引用，加入参数表情与动作文件，不修改 MOC 或纹理；已生成过的目录会被拒绝覆盖。

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

再执行本角色专用的真实画布姿态检查。上面的目录复制已包含 `check-poses.cjs`；它使用页面实际加载的模型，遍历头身、嘴眼组合、左右眉独立/反向与闭眼转头联动、独立摆发状态，采集真实画布供视觉复核。早期眉毛版本记录为 66 个姿态、91 帧；当前参数和组合数以本次脚本输出为准。

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
node work/pink-sakura-rebuild/check-poses.cjs \
  --url http://127.0.0.1:8837/ \
  --output work/pink-sakura-rebuild/pose-check
```

重新执行时，应阅读实际输出，逐帧检查脸部、闭眼/睁眼过渡、嘴周、后发与衣料连接，保存对应新文件的报告；已有报告不能用于另一套 MOC 或纹理。

然后检查实际播放。`check-continuous.cjs` 在 Pixi 完成绘制后采集画布，覆盖模型引用的全部 motion、8 个表情渐变、嘴眉/眨眼组合、头身/发丝及新增身体/配件往返、中途反向与重复；轨迹内部不逐帧复位。输出目录必须为空。每帧记录时间、Core 参数和 PNG SHA；超过 250 ms 的帧间隙、资源哈希不符或中性 RGBA 复位失败都会使检查失败。PNG 采集会增加负载，测得的帧率不是纯播放性能基准。

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
node examples/pink-sakura/check-continuous.cjs \
  http://127.0.0.1:8837/ work/pink-sakura-rebuild/continuous
node --test tests/test_continuous_review.cjs
```

脚本是 Pink 当前参数的检查配方，换角色时先调整输入并核对其声明范围，不能靠静默钳制掩盖错误。自动结果始终保留 `visualReview: pending`；另行记录实际看过的编号帧、区域和剩余瑕疵。最新[动态检查记录](verification/dynamics-20261020/README.md)覆盖本版新增动态，不包含独立手势。原始 PNG 可能占用数 GB；转存后应逐文件核对哈希，保留报告、索引和抽查原图再清理本地副本。

若有单独运行的旧版基线，还可用 `check-dynamics.cjs CANDIDATE_URL BASELINE_URL EMPTY_OUTPUT` 检查中性脸部、动作交接、风物理与辅助动画暂停；两个页面的资源身份都应记录。该检查不读取摄像头。

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
