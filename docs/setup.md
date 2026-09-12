# 环境与安装

主线是本机文件/命令行工作流。已验证的制作环境为 macOS / Apple M4、JDK 21、
psd2live 固定提交、官方本机 Core 与浏览器 WebGL。其他系统可以按依赖条件尝试，
但本 kit 不把未测试的平台标作已验证；原生库必须匹配操作系统、架构和 Java API。

## 必需与按需依赖

| 工作 | 依赖 |
| --- | --- |
| 文件/manifest 检查与打包 | Python 3.10+ 标准库；打包另外要求有效原生 Core 报告 |
| PSD/PNG → Live2D | Git、JDK 21、固定提交的 psd2live 与本 kit 补丁；首次构建要下载 Gradle/JVM 依赖 |
| 原生检查/软件诊断渲染 | 用户合法取得的 `Live2DCubismCore.jar` 及对应本机 native library |
| 网页预览 | 支持 WebGL 的浏览器、本地 Cubism Core Web、PixiJS 6.5.10、pixi-live2d-display 0.4.0 |
| 网页自动检查 | Node.js、Playwright 与 Chromium |
| 专用动漫超分 | 本地 Upscayl `upscayl-bin`、匹配的 NCNN `.param/.bin` 模型及兼容 GPU |
| 原画/隐藏区域补画 | 当前宿主可用的图像生成/编辑工具，或用户已有的绘画素材 |

```sh
bash scripts/doctor.sh
```

本地默认 `java` 可能不是 21。先选好 `JAVA_HOME` 并把它的 `bin` 加入 `PATH`。
macOS 安装了 JDK 21 时，可用：

```sh
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```

Linux 使用自己安装的 JDK 21 目录。不要覆盖别的工程的全局 Gradle 配置。
初次网络构建可能较慢；保留具体下载错误，不要将依赖失败误判成模型损坏。

## 获取固定引擎

```sh
bash scripts/setup-psd2live.sh
```

脚本从 [psd2live](https://github.com/tsunehimatoi/psd2live) 获取提交
`5526f2e16b57e5f83d34f33730d6fa26d8bc8695` 到忽略目录 `.cache/psd2live`，
校验 `engine-lock.json`，应用本 kit 补丁并核对修改后的文件 SHA。
它不会 reset 用户的已有修改；不匹配时改用新目录调查。

自定义路径：

```sh
bash scripts/setup-psd2live.sh --directory /path/to/isolated/psd2live
export PSD2LIVE_DIR=/path/to/isolated/psd2live
```

引擎是 GPL，不是 MIT；参见 [第三方声明](../THIRD_PARTY_NOTICES.md)。
本机缓存不会提交到仓库。验证过的补丁也不意味着上游新版本可直接套用。

## 配置本机官方 Core

从 [Live2D 官方 SDK](https://www.live2d.com/en/sdk/download/) 或现有合法安装中
取得对应 Core 组件，保留其许可。脚本不下载 SDK，也不自动接受协议。
设置包含 Java jar 和 native 库的目录：

```sh
export CUBISM_CORE_DIR=/path/to/your/local/core
# 可选：单独指定验证器使用的 JDK 21 java
export VALIDATOR_JAVA=/path/to/jdk-21/bin/java
```

案例使用已安装 Cubism Editor 资源目录中的 Java/native Core。
如果自己的分发包没有这些组件，不要拿 Web JS 或其它架构库改名替代 jar/dylib。
可以先做资源结构和 Web Core 检查，明确原生检查不可用；本 kit 的已验证打包路径
要求精确原生报告，所以需要补齐组件后再运行它，不能伪造一份通过 JSON。

## 首次端到端验证

按 [最小示例](../examples/minimal-model/README.md) 生成 14 个原创几何图层并导出。
输出目录必须为空；重复实验使用 `low-02`、`hd-02` 等新目录。
检查导出日志和 `*.export-warnings.txt`；CMO3/PSD 和 runtime 是不同产物。

如果希望核对官方基准，可自行获取 [Simple Model](https://www.live2d.com/en/learn/sample/simple-model/)
并遵守其素材条款。本仓库不镜像官方样例或把它称作 MIT 素材。
见 [工具地图](tooling.md) 的用途和许可说明。

## 网页与超分

[Upscayl 主仓库](https://github.com/upscayl/upscayl)与[发布页](https://github.com/upscayl/upscayl/releases)
提供应用获取入口；额外模型见 [Upscayl custom-models](https://github.com/upscayl/custom-models)。
本流程调用应用附带的本地 CLI，模型目录需要同名 `.param/.bin` 文件。

[网页模板说明](../templates/web-preview/README.md) 列出本地依赖文件名和准备命令。
`prepare-preview.py` 只接受用户指定的本地依赖，会生成可独立启动的预览目录。
默认端口 8793 被占用时选择另一个端口，不要关闭别的服务。

如需自动网页检查，在工作机安装 Playwright 与 Chromium；可使用已有模块并通过
`PLAYWRIGHT_MODULE` 指定其路径。测试脚本不会安装浏览器或访问摄像头。

[动漫超分说明](upscaling.md) 包含 NCNN 模型获取、实际使用指纹、命令参数和验证步骤。
本仓库不包含 `.bin/.param/.pth` 等权重。已有权重直接传 `--models`，不要求固定磁盘名。

## 仅检查 kit 本身

```sh
python3 -m unittest discover -s tests -v
bash scripts/validate.sh --kit
```

这些检查不需要 SDK 或网络，不等于模型导出成功。完整验证需结合原生和 Web 实测。
