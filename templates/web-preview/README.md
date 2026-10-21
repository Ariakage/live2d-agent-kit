# 通用真实 Live2D 网页预览

这是从本项目实际交付时使用的预览器整理的通用模板：Cubism Core 求值、WebGL 绘制、真实参数滑块、VTS 风格模拟输入与可选的本地摄像头面部/上半身追踪。未加载真实 `.moc3` 时显示错误，不用静态图片或假动画冒充模型。**本目录不含模型、角色素材、超分权重或第三方运行库。** 模板代码采用仓库 MIT 许可证；依赖各自原许可证。

## 准备与启动

先在仓库根目录运行（路径替换为自己的资源）：

```sh
python3 scripts/prepare-preview.py \
  --model work/export/MyAvatar.model3.json \
  --output work/preview \
  --cubism-core /path/to/legally-obtained/live2dcubismcore.min.js \
  --vendor-dir /path/to/legally-obtained/vendor
python3 work/preview/server.py --port 8793
```

脚本只复制本地用户提供的文件，不下载 SDK、不接受协议、不安装浏览器。输出必须为空，模型文件名可任意，所有 `model3.json` 资源引用必须是模型目录内的相对路径。脚本规范化入口为 `model/model.model3.json`，保留各资源的相对目录，生成 `view-config.js` 与带 SHA-256 的 `preview-manifest.json`。服务默认只监听 `127.0.0.1:8793`；端口占用就退出，可以指定其它端口，不会停止原服务。

`--vendor-dir` 必须含下列三个依赖中的后两个；第一个由 `--cubism-core` 明确指定。脚本会一并复制用户目录里的许可证/NOTICE 与可能使用的 WASM 支持文件。**目录中没有许可证不等于允许省略归属；请自行核对完整条款后再分发输出。**

| 依赖 | 本模板实际兼容版本/用途 | 获取与许可说明 |
|---|---|---|
| Live2D Cubism Core for Web | 用户合法取得、且支持所用 MOC 版本的 Core；版本在运行时读取，以自己的浏览器烟测报告为准；不得把原生 Core 的版本直接当作 Web Core 的版本 | [官方 Cubism SDK](https://www.live2d.com/en/sdk/download/web/)，用户阅读并遵守官方许可；本仓库不镜像 SDK |
| PixiJS | 6.5.10，WebGL 渲染 | [PixiJS 官方仓库](https://github.com/pixijs/pixijs/tree/v6.5.10)，MIT；本地文件名 `pixi-6.5.10.min.js` |
| pixi-live2d-display | 0.4.0，Cubism 4 运行时适配 | [项目仓库](https://github.com/guansss/pixi-live2d-display/tree/v0.4.0)，保留包中 MIT 与所包含 Cubism Framework 的单独条款；使用该版本 `dist/cubism4.min.js` 构建，存为 `pixi-live2d-display-0.4.0.min.js` |

这三者不是可随意互换的最新版本组合；升级后要重新做浏览器与模型兼容验证。对于较新 Cubism 功能，能够解析 MOC 不代表该适配器已实现全部渲染功能。

## 自己的取景与输入配置

提供可选 `--config config.json`：

```json
{
  "label": "My Avatar",
  "drawing": {"width": 1024, "height": 1536},
  "regions": {
    "full": {"x": 0, "y": 0, "w": 1024, "h": 1536},
    "portrait": {"x": 200, "y": 0, "w": 624, "h": 900},
    "face": {"x": 320, "y": 0, "w": 384, "h": 400}
  },
  "inputMapping": {
    "FaceAngleX": {"target": "ParamAngleX", "inputMin": -30, "inputMax": 30},
    "MouthSmile": {"target": "ParamMouthForm", "outputMin": 0, "outputMax": 1}
  }
}
```

`drawing` 和 `regions` 是角色逻辑画布坐标，**不随纹理图集 4× 超分改成 4×**。不知道正确裁切时不要猜脸的位置；未传配置时三个取景都展示全画布，之后自行设定区域。可用 `--reference path/to/reference.png` 添加明确标记的静态对照，或 `--download path/to/model.zip` 添加下载链接；不提供时不显示。

模拟输入包括 FaceAngleX/Y/Z、EyeOpenLeft/Right、左右视线、眉毛、MouthOpen、MouthSmile、MocopiBodyAngleX/Y/Z，以及下表中的六路身体输入。“半身联动”和“综合演示”会驱动这些新增信号，24 秒循环接点保持连续。Mocopi 前缀只沿用输入命名，不表示已连接设备或复现 VTS 的算法。名义输入范围属于本模拟器；实际 VTS 的映射可以单独设置。默认目标为 Cubism 常规参数 ID，输出按实际 Core 范围缩放；MouthSmile 默认从参数默认值映射到最大值。左右眼按模型解剖命名，独立输入映射到共享眼球参数时取平均。可在 `inputMapping` 中覆盖目标和输入/输出端点，或把某输入设为 `false`。

页面只列出真实 Core 参数并标记未映射输入；**有参数不等于该参数绑定了可见图形**。半身输入需要模型真的绑定对应参数；没有物理配置就不会有物理联动。摄像头入口需要单独准备 MediaPipe 识别依赖，支持眉毛、眼睛、嘴部、头部与近似躯干、上臂输入；没有麦克风、手掌姿态或手指追踪。已有表情/动作从模型文件引用中读取。

| 新增输入（均为 −1 至 1） | 默认模型参数 | 摄像头需要可靠可见的部位 |
| --- | --- | --- |
| `BodyShoulderLiftL/R` | `ParamShoulderLiftL/R` | 双肩、双髋 |
| `BodyChestExpand` | `ParamChestExpand` | 双肩、双髋 |
| `BodyWaistSway` | `ParamWaistSway` | 双肩、双髋 |
| `BodyUpperArmLSwing/RSwing` | `ParamUpperArmLSwing/RSwing` | 双肩、各自一侧的肘部 |

六路信号是姿态近似量，第一次可靠检测先建立临时中性基线；自然坐正后应再点击校准。肘部局部遮挡只收回该侧上臂，髋部丢失收回肩、胸、腰四路，双肩丢失收回全部身体输入，面部仍可独立工作。重新开启识别会清空基线。旧模型缺少目标时标记不可用，不把这些网页输入描述为模型已拥有的新绑定。

配置还可包含 `"captureHoldDefaults": ["ParamEyeBallForm"]`。它在模拟、手动输入信号或摄像头捕捉期间，将列出的未映射参数保持在实际 Core 默认值；直接操作原生滑块或检查静态姿态时不固定。默认 `[]` 不添加限制，输入映射优先，未知参数跳过。该字段必须是无重复的非空参数 ID 字符串数组，仅在需要保留旧捕捉行为时设置。其它参数的物理联动继续运行。已有模型的范围和素材迁移见[迁移指引](../../docs/migrate-existing-model.md)。

输入平滑在跟踪源层进行；手动滑块接管模拟；暂停会冻结全部当前参数与物理输出；拖动时间轴保持暂停；停止恢复模型原始默认值。网页服务通过 Permissions-Policy 仅允许本页摄像头，禁止麦克风；加载页面和运行模拟不会请求摄像头。

## 可选摄像头追踪

先获取固定版本的 MediaPipe 依赖，再加入准备参数：

```sh
python3 scripts/setup-tracking.py --directory .cache/mediapipe
python3 scripts/prepare-preview.py \
  --model examples/pink-sakura/runtime/PinkSakura.model3.json \
  --output work/camera-preview \
  --cubism-core /path/to/live2dcubismcore.min.js --vendor-dir /path/to/vendor \
  --config examples/pink-sakura/preview-config.json \
  --tracking-dir .cache/mediapipe
python3 work/camera-preview/server.py --port 8860
```

点击“开始面捕”后，浏览器才申请摄像头。视频和识别结果在本机处理，不上传、不录制；“显示本地画面”仅控制镜像画面的显示。正视镜头后点击“正视并校准”，再尝试抬眉、眨眼、张嘴、转头和肩部侧倾。暂停冻结模型但保留摄像头；“关闭摄像头”、手调接管、切换模拟、切换到后台页面或离开页面会释放设备。

单摄像头上半身姿态是近似估计，低置信或失追时回到默认参数，不以头部角度冒充身体识别。没有 `--tracking-dir` 的预览仍可使用模拟输入；摄像头按钮会说明缺少依赖。完整安装、权限排错、追踪范围及测试方法见仓库的 [摄像头指引](../../docs/camera-tracking.md)。

## 节点、表情与长跑统计

- “显示本地画面”“显示关键点”“显示视线估计”分别控制显示。隐藏视频后仍可在深色底上查看节点；三项开关都不改变模型输入。视线箭头表示虹膜相对眼睑的二维方向，不是屏幕注视位置或三维视线。过期、闭眼或缺少虹膜时隐藏箭头。
- 表情按钮读取模型自己的 `Expressions` 文件，可在摄像头、模拟输入及暂停状态下切换。过渡使用文件中的淡入/淡出时长，未提供时为 0.35 秒。“清除表情”平滑回到当前输入；“恢复默认”立即重置。直接参数滑块优先。未提供表情文件的模型会显示说明，不生成替代素材。
- 先启动摄像头，再点击“开始统计”。可做 10 秒静止采样并导出 JSON，只保留计数、识别比例和抖动/漂移汇总。暂停、切换来源、关闭摄像头或进入后台会结束本轮；恢复后须手动重新开始。连续计时要求新推理帧间隔不超过 500ms，30 分钟至少 9000 帧。计时达标不等于视觉验收通过。

完整数据范围、边界与接口见[摄像头指引](../../docs/camera-tracking.md)。更新模板后，用 `prepare-preview.py` 准备新的空目录；之前生成的预览不会自动更新。

## 可选微动与待机轮换

模型具有 `ParamFloat` 时显示微动选项。以下两项默认关闭，开启后随摄像头、模拟或手动输入运行，暂停时一起冻结：

- **轻呼吸、微风与浮动**：只向实际存在的 `ParamBreath`、`ParamWind`、`ParamFloat` 添加小幅辅助信号；它们不是捕捉结果。摄像头全部失追后回默认值，关闭选项后摄像头不注入这些动画；模拟仍保留原有基础呼吸。
- **说话轻点头**：`SpeechBob` 根据当前嘴部开合平滑跟随，不采集声音。只在捕捉输入运行时生效，关闭或停止后清空跟随状态。

“浮动幅度”的轻柔、标准、明显档位对应 0.6、0.8、1.0 倍，**只控制捕捉辅助浮动**，不改网格最大形变、待机动作或说话微动。原画尺寸与绑定不同，不能把这些档位当成统一的像素位移。

“自动待机”按模型实际提供的 `Quiet`、`Curious`、`Sleepy` 动作轮换，每 48 秒切换一次；只有一项就播放该项，均缺失则使用 `Idle`。没有相应动作文件不会凭空生成动画。模板提供输入和播放逻辑，动作美观与接缝仍需检查模型本身。

## 实测

用户自行安装 Playwright 和它需要的 Chromium，或指定现有模块：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node scripts/check-preview.cjs --url http://127.0.0.1:8793/ \
  --output work/preview-smoke.json
```

报告的 `runtime` 字段记录实际 Web `csmGetVersion()` 数值/字符串、WebGL `MAX_TEXTURE_SIZE`、请求的遮罩尺寸及渲染器返回的实际遮罩尺寸（接口不可用则为 null）。脚本在页面导航前监听浏览器真实 model3/MOC/PNG 响应，记录 SHA-256 和 PNG 尺寸；读取到 `preview-manifest.json` 时逐项核对，缺记录或哈希不符即失败。没有清单时保留真实响应证据并写警告，不用事后另取模型文件冒充实际载入。可添加 `--screenshots work/preview-shots` 保存同一验证页面的默认/模拟暂停帧截图。脚本验证真实 Core/Drawable、手动参数、默认恢复、模拟推进、暂停冻结、时间轴、不请求摄像头、窄屏布局。它同时记录每个参数对 drawable 顶点/透明度是否有影响。没有可见绑定会写警告，不能用“参数值改变”代替视觉验收。浏览器通过不代替原生 Core 验证、组合参数接缝检查或用户自己的 VTube Studio 最终验收。

对于具有 `ParamMouthOpenY` 和 `ParamEyeLOpen` 的模型，可加 `--interaction-features` 检查表情叠加、暂停/恢复、节点显示和统计导出。该检查临时拦截两份测试表情及 model3 响应，并注入合成追踪回调；磁盘模型不变，不请求摄像头、不执行识别，也不代表 30 分钟真实长跑。基础阶段的加载哈希验证与这个测试阶段分别记录。

六路身体输入与辅助微动的自动测试使用合成姿态和控制器对象，覆盖局部丢失、校准、暂停、限幅与循环衔接。本轮没有据此增加物理摄像头或 VTS 通过声明；新增输入的实际识别效果需要单独验收。

来源：本仓库工作流从实际角色制作中整理的自有 runtime、输入控制器与网页交互代码，不包含那位角色的图片/模型。经验保留了高清眼部遮罩缓冲区、源输入与物理的顺序、暂停冻结、实际参数范围、无假模型回退。

This project is not affiliated with Live2D Inc.

The supplied server enforces `Content-Security-Policy: connect-src 'self'` to block MediaPipe’s default usage-metric logging. Keep this response policy on other hosts. Camera inference being local does not itself disable SDK telemetry; see the [camera guide](../../docs/camera-tracking.md).
