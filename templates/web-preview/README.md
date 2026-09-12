# 通用真实 Live2D 网页预览

这是从本项目实际交付时使用的预览器整理的通用模板：Cubism Core 求值、WebGL 绘制、真实参数滑块与 VTS 风格模拟输入。未加载真实 `.moc3` 时显示错误，不用静态图片或假动画冒充模型。**本目录不含模型、角色素材、超分权重或第三方运行库。** 模板代码采用仓库 MIT 许可证；依赖各自原许可证。

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

模拟输入是本地生成的 FaceAngleX/Y/Z、EyeOpenLeft/Right、左右视线、MouthOpen、MouthSmile、MocopiBodyAngleX/Y/Z。Mocopi 前缀只沿用输入命名，不表示已连接设备或复现 VTS 的算法。名义输入范围属于本模拟器；实际 VTS 的映射可以单独设置。默认目标为 Cubism 常规参数 ID，输出按实际 Core 范围缩放；MouthSmile 默认从参数默认值映射到最大值。左右眼按模型解剖命名，独立输入映射到共享眼球参数时取平均。可在 `inputMapping` 中覆盖目标和输入/输出端点，或把某输入设为 `false`。

页面只列出真实 Core 参数并标记未映射输入；**有参数不等于该参数绑定了可见图形**。半身输入需要模型真的绑定 BodyAngle；没有物理配置就不会有物理联动。没有实现摄像头、麦克风、手臂、手指或眉毛的跟踪输入，不能把预留 UI 或参数槽宣传成已实现捕捉。已有表情/动作从模型文件引用中读取。

输入平滑在跟踪源层进行；手动滑块接管模拟；暂停会冻结全部当前参数与物理输出；拖动时间轴保持暂停；停止恢复模型原始默认值。网页服务还通过 Permissions-Policy 禁止摄像头和麦克风。

## 实测

用户自行安装 Playwright 和它需要的 Chromium，或指定现有模块：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
  node scripts/check-preview.cjs --url http://127.0.0.1:8793/ \
  --output work/preview-smoke.json
```

报告的 `runtime` 字段记录实际 Web `csmGetVersion()` 数值/字符串、WebGL `MAX_TEXTURE_SIZE`、请求的遮罩尺寸及渲染器返回的实际遮罩尺寸（接口不可用则为 null）。脚本在页面导航前监听浏览器真实 model3/MOC/PNG 响应，记录 SHA-256 和 PNG 尺寸；读取到 `preview-manifest.json` 时逐项核对，缺记录或哈希不符即失败。没有清单时保留真实响应证据并写警告，不用事后另取模型文件冒充实际载入。可添加 `--screenshots work/preview-shots` 保存同一验证页面的默认/模拟暂停帧截图。脚本验证真实 Core/Drawable、手动参数、默认恢复、模拟推进、暂停冻结、时间轴、不请求摄像头、窄屏布局。它同时记录每个参数对 drawable 顶点/透明度是否有影响。没有可见绑定会写警告，不能用“参数值改变”代替视觉验收。浏览器通过不代替原生 Core 验证、组合参数接缝检查或用户自己的 VTube Studio 最终验收。

来源：本仓库工作流从实际角色制作中整理的自有 runtime、输入控制器与网页交互代码，不包含那位角色的图片/模型。经验保留了高清眼部遮罩缓冲区、源输入与物理的顺序、暂停冻结、实际参数范围、无假模型回退。

This project is not affiliated with Live2D Inc.
