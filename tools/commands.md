# 任务命令速查

以下命令从 **仓库根目录** 执行。`/path/to/...` 是待替换的本地路径；`work/` 是忽略目录，
输出使用新的空目录。先阅读 [setup](../docs/setup.md)，再按需要运行对应任务。
此页汇总本 kit 的实际入口，不会自动安装 SDK、权重或浏览器，也不会关闭已有服务。

## 先看需要哪些依赖

| 任务 | 入口 | 必需条件 |
| --- | --- | --- |
| 环境盘点 | [`doctor.sh`](../scripts/doctor.sh) | shell；只读，不安装软件 |
| 维护 kit、检查 manifest / runtime | [`validate.sh`](../scripts/validate.sh) / [`validate.py`](../scripts/validate.py) | Python 3.10+ 标准库；无需 SDK |
| 检查已提交源包 | [`check-source-package.py`](../scripts/check-source-package.py) | Git、Python、Node.js、JDK 21；离线重建源素材与配方，不运行 SDK |
| 获取固定引擎 | [`setup-psd2live.sh`](../scripts/setup-psd2live.sh) | Git、Python、网络；获取 pin 并核对补丁 |
| PSD 提取、manifest 导出 | [`extract-psd.sh`](../scripts/extract-psd.sh)、[`export-model.sh`](../scripts/export-model.sh) | JDK 21、引擎、Gradle 构建依赖 |
| 原生验证 / 软件诊断渲染 | [`validate_core.sh`](../scripts/validate_core.sh)、[`render_core.sh`](../scripts/render_core.sh) | JDK 21、本机官方 Java/native Core |
| 动漫 4× 图集超分 | [`upscale-atlas.sh`](../scripts/upscale-atlas.sh)、[`AtlasAlpha.java`](../scripts/AtlasAlpha.java) | Java、本地 NCNN CLI、模型权重、兼容 GPU |
| 准备实际 Web 预览 | [`prepare-preview.py`](../scripts/prepare-preview.py) | Python、本地 Web Core 与两个版本匹配的渲染依赖 |
| 本地摄像头依赖 | [`setup-tracking.py`](../scripts/setup-tracking.py) | Python 标准库与网络；固定版本获取后可离线验证，无需 curl |
| 明确请求真实摄像头测试 | [`check-camera.cjs`](../scripts/check-camera.cjs) | 带本地识别依赖的预览、Node.js、Playwright、真实摄像头及浏览器/系统权限 |
| 浏览器测试 | [`check-preview.cjs`](../scripts/check-preview.cjs) | 已启动的实际预览、Node.js、Playwright 与 Chromium |
| 运行包与 ZIP | [`package-model.py`](../scripts/package-model.py) | Python、与该 MOC SHA 匹配的原生 Core 报告 |
| 可选 Editor/MCP 编辑 | [MCP 指引](../mcp/README.md) | 支持相应 API 的本机编辑器、实际启用的接口和宿主连接 |

## 检查环境与脚本参数

```sh
bash scripts/doctor.sh
python3 scripts/setup-psd2live.py --help
python3 scripts/validate.py --help
python3 scripts/check-source-package.py --help
python3 scripts/upscale-atlas.py --help
python3 scripts/prepare-preview.py --help
python3 scripts/package-model.py --help
python3 scripts/setup-tracking.py --help
bash scripts/render_core.sh --help
```

`export-model.sh`、`extract-psd.sh`、`validate_core.sh` 使用位置参数，无参数调用会打印用法并返回 2。
`check-preview.cjs` 没有独立 `--help` 模式，参数见本页和 [网页模板说明](../templates/web-preview/README.md)。
不要用测试命令的默认 URL 误操作另一个正在运行的预览。

## 检查配方与运行资源

```sh
bash scripts/validate.sh --manifest work/character/assets/manifest.json
bash scripts/validate.sh --model work/character/low/MyCharacter.model3.json \
  --output work/character/runtime-structure.json
```

此处只有资源结构和引用检查。没有提供官方 Core 报告时，结果中的
`nativeCoreValidated` 不会变成 `true`；文件名和 MOC3 magic 不是完整原生有效性的证明。
自己制作图层时参照 [manifest 坐标说明](../docs/manifest.md)，不要套用通用示例的脸和发束坐标。

## 验证最小导出链

先确认 `java -version` 是已经验证的 JDK 21。首次构建会下载上游 Gradle/JVM 依赖。

```sh
java --source 21 examples/minimal-model/GenerateExample.java work/minimal/assets
bash scripts/validate.sh --manifest work/minimal/assets/manifest.json
bash scripts/setup-psd2live.sh
bash scripts/export-model.sh work/minimal/assets/manifest.json work/minimal/low
```

说明见 [通用最小模型](../examples/minimal-model/README.md)。它生成原创几何图层，
不需要用户角色素材，也不是最终美术示范。同一个引擎 checkout 的导出任务串行执行。

已有 PSD 时可以单独提取可见栅格层：

```sh
bash scripts/extract-psd.sh /path/to/source.psd work/character/extracted
bash scripts/validate.sh --manifest work/character/extracted/manifest.json
```

提取器保留可见非空栅格层的位置与层序，不承诺无损迁移复杂 PSD 特效、完整编辑历史或自动补全隐藏区域。
如果是运行环境异常，可用 [官方 Simple Model](https://www.live2d.com/en/learn/sample/simple-model/)
区分官方基准能否加载；获取方法及素材条款见 [工具地图](../docs/tooling.md#先用官方简单模型隔离环境问题)。

## 检查官方 Core 与几何

`CUBISM_CORE_DIR` 必须包含真实 `Live2DCubismCore.jar` 和对应架构本机库。
`VALIDATOR_JAVA` 可省略，此时使用 `PATH` 中的 `java`。

```sh
export CUBISM_CORE_DIR=/path/to/your/local/core
export VALIDATOR_JAVA=/path/to/jdk-21/bin/java
bash scripts/validate_core.sh work/minimal/low/Minimal.moc3 work/minimal/core-report.json
bash scripts/validate.sh --model work/minimal/low/Minimal.model3.json \
  --core-report work/minimal/core-report.json
bash scripts/render_core.sh work/minimal/low/Minimal.model3.json \
  work/minimal/diagnostics/neutral.png --size 1024 --background '#E5E7EB'
```

可选动作诊断：

```sh
bash scripts/render_core.sh work/minimal/low/Minimal.model3.json \
  work/minimal/diagnostics/angle.png --set ParamAngleX=15 \
  --demo-dir work/minimal/diagnostics/demo-01 --frames 60
```

显式参数必须是模型实际支持的 ID 和范围；`--set` 在演示每帧固定该参数。
诊断图用官方 Core 求几何、Java2D 采样绘制，适合排查可见网格；它不是官方渲染器，
也没有模拟 `physics3.json`，最终接缝和物理需在真实 WebGL / VTS 画面检查。

## 完成低分修复后再超分

先按 [动漫超分说明](../docs/upscaling.md) 做局部比较。以下处理 RGB 神经 4× 与独立 alpha，
不会修改逻辑画布、重新绑定或自动修好素材接缝。

```sh
bash scripts/upscale-atlas.sh \
  --manifest work/minimal/assets/manifest.json \
  --export work/minimal/low --output work/minimal/upscale \
  --binary /path/to/upscayl-bin --models /path/to/ncnn-models \
  --model realesr-animevideov3-x4 --java /path/to/jdk-21/bin/java
bash scripts/export-model.sh work/minimal/upscale/manifest-hd.json work/minimal/hd
cmp work/minimal/low/Minimal.moc3 work/minimal/hd/Minimal.moc3
bash scripts/validate_core.sh work/minimal/hd/Minimal.moc3 work/minimal/core-hd-report.json
bash scripts/validate.sh --model work/minimal/hd/Minimal.model3.json \
  --core-report work/minimal/core-hd-report.json
```

`cmp` 无输出且退出 0 表示两份 MOC 逐字节相同，仅适用于保持同一绑定的图集替换流程。
默认 `--max-texture-size 8192` 是兼容上限；只有核实目标 GPU/运行时后才覆盖它。
低分素材或遮罩改过，必须重新生成 atlas 和超分，不能沿用旧来源 SHA。
应用和模型获取入口：[Upscayl](https://github.com/upscayl/upscayl)、
[custom-models](https://github.com/upscayl/custom-models)；仓库不捆绑权重。

## 准备与检查真实网页预览

按 [网页模板说明](../templates/web-preview/README.md) 准备三个本地依赖：
Web Core、PixiJS 6.5.10、pixi-live2d-display 0.4.0。

```sh
python3 scripts/prepare-preview.py \
  --model work/minimal/hd/Minimal.model3.json \
  --output work/minimal-preview \
  --cubism-core /path/to/local/live2dcubismcore.min.js \
  --vendor-dir /path/to/local/vendor
```

`8837` 只是临时预览示例端口，启动前先检查是否被占用。macOS / 有 `lsof` 的环境可只读查询：

```sh
lsof -nP -iTCP:8837 -sTCP:LISTEN
```

如果已有服务，选择另一端口并同步修改下面的 URL。启动在单独终端；服务绑定失败会退出，
不会关闭已存在的进程。即使查询未发现占用，仍以启动时能否成功绑定为准。

```sh
python3 work/minimal-preview/server.py --port 8837
```

在另一终端运行浏览器检查，`PLAYWRIGHT_MODULE` 指向已经安装的模块；若本机能够直接
`require('playwright')`，可以省略该环境变量：

```sh
PLAYWRIGHT_MODULE=/path/to/installed/playwright \
  node scripts/check-preview.cjs --url http://127.0.0.1:8837/ \
  --output work/minimal-preview-smoke.json \
  --screenshots work/minimal-preview-shots
```

打开同一个 URL 目视核对中立、闭眼过渡、嘴型组合、左右大角度和头身反向动作。
报告记录真正响应给浏览器的 model3 / MOC / PNG 身份；合成输入不会请求摄像头或麦克风。
检查结束只在自己启动的服务终端按 Ctrl+C，不批量杀掉同端口或其他项目的进程。

## 可选摄像头与真实设备检查

```sh
python3 scripts/setup-tracking.py --directory .cache/mediapipe
python3 scripts/setup-tracking.py --directory .cache/mediapipe --verify
```

在 `prepare-preview.py` 中加上 `--tracking-dir .cache/mediapipe`，使用空闲端口启动新预览。点击页面的“开始面捕”才会申请设备；命令行设备测试也要求显式开关：

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome \
node scripts/check-camera.cjs --physical-camera \
  --url http://127.0.0.1:8860/ --duration 15 --output work/camera-check.json
```

此命令会启动真实摄像头，需要真人正视镜头并让双肩入镜。它只保留汇总参数范围和设备释放结果，不截图、不录制摄像头画面；与无设备的 `check-preview.cjs` 分别报告。识别率和性能依赖设备、光线与遮挡。说明见 [摄像头指引](../docs/camera-tracking.md)。

## 打包给用户验收

```sh
python3 scripts/package-model.py \
  --model work/minimal/hd/Minimal.model3.json \
  --core-report work/minimal/core-hd-report.json \
  --output work/release/Minimal
```

生成运行目录 `work/release/Minimal` 和同级 `work/release/Minimal.zip`；脚本只复制模型引用的
运行资源和发布元数据，不自动混入 PSD、CMO3、SDK 或权重。需要交付可编辑来源时，另列文件清单和许可。
原生报告必须匹配本次 MOC，Web 检查和用户 VTS 验收单独记录；打包成功不能替代后两项。

## 检查 kit 与本地提交

```sh
python3 -m unittest discover -s tests -v
node --test tests/test_*.cjs
bash scripts/validate.sh --kit
git status --short
git diff --check
git diff --stat
```

上述维护检查不需要 SDK、GPU 或网络。提交前核对 diff 和文件清单，保留第三方许可边界。
发布或推送依照当前用户指定的范围进行。
图片和模型仅提交用户明确授权、已经记录来源与许可的示例；其余角色、原始 SDK、模型权重、机器专用路径和含私人路径的完整日志不加入 Git。


只用 `HEAD` 的公开文件检查源素材与配方能否重建：

```sh
python3 scripts/check-source-package.py --report work/source-package-report.json
```

它自动建立并清理临时 `git archive` 副本，不读取旧 `work/`。需先提交待检查的改动；它不验证完整引擎编译或 Core。范围与独立空缓存导出命令见 [复现审查](../docs/reproducibility.md)。

This project is not affiliated with Live2D Inc.
