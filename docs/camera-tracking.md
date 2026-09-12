# 本地摄像头面部与上半身追踪

网页预览可读取真实摄像头，把面部表情、头部姿态和近似躯干姿态映射到模型已有的 Live2D 参数。识别使用本地 MediaPipe，输入控制器负责映射与平滑；模型没有绑定的参数不会凭空产生动作。模拟输入与摄像头输入是两个独立来源，页面会明确显示当前来源。

## 安装与打开

在仓库根目录运行：

```sh
python3 scripts/setup-tracking.py --directory .cache/mediapipe
python3 scripts/setup-tracking.py --directory .cache/mediapipe --verify

python3 scripts/prepare-preview.py \
  --model examples/pink-sakura/runtime/PinkSakura.model3.json \
  --output work/camera-preview \
  --cubism-core /path/to/legally-obtained/live2dcubismcore.min.js \
  --vendor-dir /path/to/legally-obtained/vendor \
  --config examples/pink-sakura/preview-config.json \
  --tracking-dir .cache/mediapipe
python3 work/camera-preview/server.py --port 8860
```

Core 与网页渲染依赖仍需自己取得，见[模板说明](../templates/web-preview/README.md)。输出目录须为空；重复准备时使用新目录，端口被占用时换端口。安装器仅依赖 Python 标准库，通过 urllib 联网下载依赖，不会打开摄像头；不需要 curl。`--verify` 只检查本地文件，不联网、不写入。已从全新空目录实际下载并校验全部 12 个文件，共 45,157,730 字节，再通过离线验证；该检查没有复用已有缓存。

打开本地页面后，点击“开始面捕”才会申请摄像头权限。先让脸和双肩进入画面，睁眼、闭嘴、放松表情，再点“正视并校准”。默认不显示摄像头画面；“显示本地画面”只控制镜像缩略图，不影响识别。取消上半身选项可以只运行面部识别，重新开始后生效。

加载页面、看静态对照图或运行模拟均不会请求摄像头。请求始终为 `audio: false`，预览没有麦克风或录像功能；视频推理在本机完成。推理资源从页面同源目录加载，默认服务只监听本机，并阻止 SDK 遥测外连，具体边界见下节。暂停会冻结模型但保留设备，继续可恢复识别；关闭摄像头、手动滑块接管、切换模拟、页面进入后台或离开页面会释放设备。浏览器是否显示权限提示，由已有授权和浏览器设置决定。

## 网络边界与 SDK 遥测

**只把模型与 WASM 放在本地，并不能阻止 SDK 的其它网络请求。** Google 的 [MediaPipe Tasks 隐私说明](https://developers.google.com/edge/mediapipe/solutions/tasks#mediapipe_tasks_privacy_notice)表示输入图像/视频在设备上处理，同时会向 Google 发送性能和使用指标。我们在固定 1.0.1 包及真实摄像头检查中确认了 `https://odml.pa.googleapis.com/v1/log`：JavaScript logger 定期发送，并在关闭识别器时发送剩余统计。该次诊断记录的是来源与请求状态，没有解码全部 protobuf 字段。

当前没有可用的官方关闭 API；维护者说明可以阻止外发请求后继续使用 SDK。见[官方仓库维护者回复](https://github.com/google-ai-edge/mediapipe/issues/6306#issuecomment-4673728357)和[后续遥测说明](https://github.com/google-ai-edge/mediapipe/issues/6291#issuecomment-4896121772)。本 kit 保持上游文件字节不变，通过自带 `server.py` 返回的响应头阻断外连：

```text
Content-Security-Policy: connect-src 'self'
```

这里的保证是**浏览器执行服务策略，阻止 SDK 统计发往外部端点**，不是声称 SDK 没有尝试联网，也不是发现了官方 opt-out 开关。外网检查分别记录请求尝试、`BlockedByCSP` 与实际发出的请求；关闭和重新启动识别器也在检查范围内。安装器获取依赖仍然会联网。

如果将预览放到其它静态托管服务或用别的 HTTP 服务器启动，必须保留等效的 CSP 响应头并重新检查网络行为。仅复制网页文件不会自动带上 Python 服务配置；不能直接把“本地推理”改写成“运行时没有外发统计”。不要为消除控制台中的 CSP 拦截提示而放开该端点。

## 锁定的依赖

[tracking-dependencies.json](../tools/tracking-dependencies.json) 保存每个文件的固定 URL、SHA-256 和字节数。当前使用 `@mediapipe/tasks-vision` **1.0.1**、Face Landmarker `float16/1` 与 Pose Landmarker Lite `float16/1`。Web 入口的安装方式来自 Google 的 [Face Web 指引](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)与 [Pose Web 指引](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)，模型地址来自[官方面部模型页](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)和[姿态模型页](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)。

```text
.cache/mediapipe/
├── vision_bundle.mjs
├── wasm/
│   ├── vision_wasm_internal.{js,wasm}
│   ├── vision_wasm_nosimd_internal.{js,wasm}
│   └── vision_wasm_module_internal.{js,wasm}
├── models/
│   ├── face_landmarker.task
│   └── pose_landmarker_lite.task
└── notices/
    ├── Apache-2.0.txt
    ├── README.md
    └── package.json
```

JavaScript/WASM 指纹根据固定版本的官方 npm 包计算，先核对 registry 中的 SHA-512 integrity，再记录各文件 SHA-256；安装时仍检查实际 CDN 下载结果。模型文件直接从固定版本的 Google 地址取得。哈希用于核对相同字节，不是另加的发布者签名。

安装器拒绝路径越界、符号链接、大小或哈希不符的下载。新文件全部验证后才替换旧文件，失败不会先删掉还能使用的文件。预览准备脚本也会再次校验，并只复制清单中列出的文件至 `tracking/`，不复制整个开发缓存。

这些运行库、WASM 和模型都放在 Git 忽略目录，不随本仓库提交。MediaPipe 包的 Apache-2.0 声明保存在下载的 notices 中；模型和其它依赖仍按各自来源条款使用，不归入本 kit 的 MIT 许可。

## 输入、坐标与校准

以下范围属于本预览器的输入协议。`Mocopi` 前缀用于兼容现有字段名，不表示连接了 Mocopi 设备，也不表示实现了 VTube Studio 自身的识别算法。

| 输入 | 识别依据 | 输出范围 |
| --- | --- | --- |
| `FaceAngleX/Y/Z` | 面部变换矩阵的 yaw、pitch、roll | 各 −30° 至 30° |
| `EyeOpenLeft/Right` | `1 - eyeBlinkLeft/Right` | 0 至 1 |
| `EyeLeftX/Y`、`EyeRightX/Y` | 对应眼睛相反方向的 gaze blendshape 差值 | −1 至 1 |
| `MouthOpen` | `jawOpen` | 0 至 1 |
| `MouthSmile` | 左右 `mouthSmile` 的平均值 | 0 至 1 |
| `BrowLeftY/RightY` | 各侧 `.55 × innerUp + .45 × outerUp - down` | −1 至 1 |
| `MocopiBodyAngleX/Z` | 双肩深度差和画面倾斜 | 各 −10° 至 10° |
| `MocopiBodyAngleY` | 肩部与髋部的相对深度、垂直距离 | −10° 至 10° |

面部矩阵按列主序读取，去除各旋转列的缩放后，用 `Rz × Ry × Rx` 约定取角度；平移不进入角度输出。实现依据 MediaPipe 的 [MatrixData 格式](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto)和 [Web Face Landmarker 实现](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts)。代码中的符号映射约定为未镜像视频的 X 向画面右转、Y 抬头、Z 顺时针歪头。眼睛沿用识别结果的解剖侧别；镜像缩略图不交换眼睛或转置矩阵。不同模型若需要反转方向，应在 `inputMapping` 调整输出端点，再实际检查左右眨眼与转头。

姿态输入要求两个肩部点均在画面中，visibility 与存在的 presence 至少为 0.6。肩部足够清楚时可以估计左右转体和侧倾；髋部不在画面或不可靠时，俯仰保持 0，状态栏会说明原因。优先使用有效的 world landmarks；缺少这一结果时可用归一化坐标近似，已返回却损坏的肩部深度不会被当成有效结果。单摄像头深度是模型估计，侧身、遮挡和宽松衣服可能使身体角度抖动。这里没有独立手臂、手指或全身绑定。

校准保存当前可用脸部与身体的数值基线，不保存图像。角度先减基线再限幅；眼睛按睁眼基线归一化，嘴部减去静态偏置。脸丢失、结果过期、闭眼或明显张嘴时不接受校准。只有脸可见时仍可校准脸部，身体保持未校准；再次校准不会保留已经失效的旧身体基线。输入控制器不再叠加第二套摄像头角度校准。

## 丢失、性能与资源释放

识别器使用 VIDEO 模式、单人、CPU delegate，内部检测/存在/追踪阈值设为 0.6。Face 的 blendshape 分数是表情强度，不能拿 `_neutral` 分数冒充人脸置信度；输出缺失时回正，并另外检查有限矩阵、关键点位置与退化几何。

面部推理上限为 15fps，上半身上限为 8fps。每次只处理当前新视频帧，不排队；同一视频时间戳不反复推理。`detectForVideo()` 为同步调用，会占用主线程，这是 Google [Face Web 指引](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)与 [Pose Web 指引](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)明确说明的限制。上限不等于实测帧率：最终 M4、Chrome 152.0.7977.83、高清模型与 CPU 面部/身体联合识别记录中，`inferenceFps` 状态指标平均为 8.45，范围 1.93 至 11.78，含启动后的较慢样本；`inferenceMs` 为 5.1 至 163.6ms。性能不足时可先关闭身体识别。GPU delegate 与 worker 是后续可评估方向，本版没有声称已验证这些模式。

检测到丢脸或遮挡时，相关输入立即回中性值，另一来源仍可独立工作。静止视频的最后一次结果最多使用 350ms，时间戳倒退、非有限数值、设备 muted/paused 同样不会继续保持旧姿态。控制器在 500ms 没收到有效新帧时，将目标设为模型默认参数；摄像头平滑按真实经过时间收敛，低渲染帧率不会把这段时间压成模拟时钟。已停止、重复或倒序的回调不接管模型，相机模式不额外生成模拟呼吸。

`stop()` 会取消下一次帧回调、停止流中的每条 track、清空 video 绑定并关闭两个 Landmarker。正在等待权限或模型加载时也可停止；迟到的设备和模型会在返回后释放，旧会话不会重新接管新会话。应用层负责在切换输入、页面隐藏和退出时调用这个方法。

## 集成接口

```js
const tracker = new CameraTracker({
  video,
  assets: {
    visionModule: 'tracking/vision_bundle.mjs',
    wasmRoot: 'tracking/wasm',
    faceModel: 'tracking/models/face_landmarker.task',
    poseModel: 'tracking/models/pose_landmarker_lite.task',
  },
  onFrame: frame => capture.updateCameraFrame(frame),
  onState: state => updateCameraStatus(state),
});

// 只在用户点击后调用；先让控制器切换到 camera 来源。
await tracker.start({bodyEnabled: true});
const calibrated = tracker.calibrate(); // boolean，失败时保持原基线
tracker.stop();
```

构造器支持 `assets: null`，不加载依赖、不申请权限；缺少资源会在 `start()` 时说明。重复启动共享同一次初始化，停止后可以重新开始。

`onFrame` 返回 `{inputs, faceVisible, bodyVisible, timestamp, metrics}`，还包含可读的失追原因。时间戳使用 `performance.now()` 毫秒值。`getState()` 返回状态、可见性、是否校准及数值计数，不包含原图、视频帧或 landmarks。`frames` 统计实际运行面部推理的次数，`faceFrames/bodyFrames` 统计各自成功识别的实际推理帧，不把重复使用的缓存输出算成新识别。

## 验证与排错

```sh
node --test tests/test_*.cjs
python3 -m unittest discover -s tests -v
bash scripts/validate.sh --kit
```

数学与生命周期测试使用人工构造的识别结果和设备对象，覆盖左右眼、角度、眉毛、校准、NaN、失追、过期、冻结视频、加载失败、重复启动、取消与 track 释放。安装器测试验证下载、缓存、哈希、越界和符号链接拒绝。这些测试不等同于摄像头识别效果验收。

真实设备检查必须显式开启：

```sh
PLAYWRIGHT_MODULE=/path/to/playwright \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome \
  node scripts/check-camera.cjs \
  --url http://127.0.0.1:8860/ \
  --output work/camera-check.json \
  --physical-camera
```

该命令会实际申请摄像头并执行预览交互，请只在准备好使用设备时运行。检查范围包括真实识别输出、校准、停帧回正、手动接管、只开面部后重启、切换模拟时释放、页面外网请求和音频轨道。真实报告应记录版本与计数，并与人工动作的视觉结果分开；不能把合成设备或预录素材测试标作物理摄像头通过。

最终物理摄像头回归使用新增眉毛绑定后的 Pink Sakura 高清 runtime，**16 项检查通过**。20 秒采样期间记录 187 次实际推理；80 次状态采样中有 67 次脸部可见、77 次肩部可见，两眉的真实 Core 参数都跨过中性值，覆盖范围合计约 −0.48 至 0.54。校准、停帧回正、只开面部后重启及输入接管均通过；音频轨道和未捕获页面错误为 0，全部 track 已结束。浏览器记录到 3 次 SDK 日志外连尝试，均由 CSP 在发送前阻止，实际外部请求事件为 0，检查涵盖关闭识别器。见[公开设备检查记录](verification/camera-tracking.json)。

这次髋部有效采样数为 0，因此证明了肩部左右/侧倾输入，没有完成真实躯干俯仰准确性验证。上述次数也不是标准数据集上的识别率；模型动作的美观、遮挡容错和不同摄像头效果仍需在使用者的环境中检查。

| 现象 | 先检查 |
| --- | --- |
| 提示缺少依赖 | 先运行 `setup-tracking.py --verify`，再用 `--tracking-dir` 准备新预览目录 |
| 无法申请摄像头 | 使用 localhost/HTTPS；检查浏览器与系统摄像头权限，设备是否被其它应用占用 |
| 能见脸但模型不动 | 看输入来源是否为摄像头、是否暂停，以及目标参数是否真有 drawable 绑定 |
| 脸动，身体不动 | 双肩是否入画；模型是否有 BodyAngle 绑定；俯仰还需要髋部可靠可见 |
| 上半身角度抖动或卡顿 | 先坐正校准、减少遮挡；尝试仅面部识别，查看实际 inferenceFps 和 inferenceMs |
| 眼睛或方向相反 | 分别检查解剖侧别与模型参数方向，通过 `inputMapping` 校正；不要把镜像缩略图当原始识别坐标 |
| 关闭后设备指示灯仍亮 | 检查其它浏览器标签或应用；本页须确认每条 track 已 ended，不能只隐藏 video |

VTube Studio 的模型导入与面捕仍由用户在自己的环境验收。浏览器摄像头测试只证明这套预览输入链路，不替代 VTS 验收。
