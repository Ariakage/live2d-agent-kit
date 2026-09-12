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
| 网页自动检查 / JS 单元测试 | Node.js 22+（本次 22.23.1）、Playwright 与 Chromium |
| 摄像头识别（可选） | 本地 MediaPipe 固定文件；[按依赖锁获取、校准并测试](camera-tracking.md) |
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

## 依赖缓存缺失时怎样恢复

先确定缺失的是构建工具、运行依赖、已编译类还是浏览器。保存失败命令与原始错误、源代码提交及补丁身份，不要先删掉尚能使用的缓存。`ClassNotFoundException`、Gradle 下载失败、Playwright 找不到浏览器和模型解析失败应分别处理；它们不会因为都出现在导出/预览阶段就成为同一个模型问题。

### 优先恢复固定版本的正常构建

在隔离工作目录中核对 JDK 21、固定上游提交和 `engine-lock.json`，再让原 Gradle Wrapper 恢复依赖。沿用构建文件声明的仓库与版本，记录实际下载来源及 SHA；不要为绕过下载失败临时替换为“最新版”。Gradle 的离线模式只能使用已经存在的依赖，缺少所需模块时仍会失败；`--refresh-dependencies` 会重新检查依赖，不能被当作断网修复。见 [Gradle 缓存说明](https://docs.gradle.org/current/userguide/dependency_caching.html)。

### 已有编译类只能作为有记录的恢复路径

Pink Sakura 制作中曾保留同一工作版本已经编译好的 headless engine 类，在运行依赖缓存丢失后，从 Maven Central 补齐以下七个 JAR，恢复了 `low-06b` 的实际导出。该记录证明已有环境的运行入口恢复，**不是在干净环境中重新编译完整 psd2live、GUI、MCP 和全部依赖的验证**。

| 该次局部运行依赖 | 记录版本 |
| --- | --- |
| `org.jetbrains.kotlin:kotlin-stdlib` | 2.4.10 |
| `org.jetbrains.kotlin:kotlin-reflect` | 2.4.10 |
| `org.jetbrains.kotlinx:kotlinx-serialization-core-jvm` | 1.11.0 |
| `org.jetbrains.kotlinx:kotlinx-serialization-json-jvm` | 1.11.0 |
| `org.jetbrains.kotlinx:kotlinx-datetime-jvm` | 0.8.0 |
| `com.squareup.okio:okio-jvm` | 3.17.0 |
| `org.jdom:jdom` | 1.1.3 |

这七项是该次已编译入口实际需要的运行依赖，不是可替代 Gradle 的完整依赖锁文件。记录它们的坐标、版本、取得 URL、字节数与 SHA-256；JAR 和类文件保留在本机忽略目录，不提交到仓库，也不随角色运行包分发。

复用之前，要能说明编译类来自哪个源代码与补丁版本、编译工具版本，以及此后是否改过引擎/适配器。记录类文件树和入口类指纹，并写明文件树摘要的算法与排序规则；只保存一个无法解释的摘要不足以重建来源。源代码变更后应重新构建；不能拿旧类执行成功，声称新源码已经通过构建。临时手动 classpath 也应整理为相对工作目录记录，不复制个人缓存路径。

恢复后对新生成的 MOC 重新运行 Core 和资源检查，保留导出器自己的 warnings。若之后恢复了完整 Gradle 构建，应在新目录重跑并单独记录结果；已有类恢复、干净构建、最终美术与 VTS 验收分别报告。

### 浏览器模块与浏览器程序分别恢复

`PLAYWRIGHT_MODULE` 只指定 Node.js 模块，不会自动提供浏览器二进制或把默认浏览器改为 Chrome。先确认选中的 Playwright 包版本，再恢复它对应的浏览器。Playwright 官方说明不同版本对应特定浏览器版本，也允许通过 `channel: 'chrome'` 选择已安装的 Google Chrome；品牌浏览器与默认 headless shell 的行为需要分别验证。见 [Playwright 浏览器说明](https://playwright.dev/docs/browsers)。

此次恢复实际使用 Playwright **1.63.0** 与已安装的 Google Chrome **152.0.7977.83**，完成 Pink Sakura 最终高清模型的 22 项 Web 自动检查和 55 个姿态、80 帧画布检查。Web Core 为 5.1.0，WebGL 最大纹理尺寸实测 16384；浏览器实际收到的 MOC 和图集 SHA 与交付文件一致。结果见 [Web 检查报告](../examples/pink-sakura/verification/web-smoke.json)和[姿态记录](../examples/pink-sakura/verification/web-poses.json)，视觉与 VTS 验收分别记录。

仓库检查脚本支持通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome` 显式指定已有 Chromium/Chrome 程序，并在报告中记录实际版本。它与 `PLAYWRIGHT_MODULE` 分工不同；未设置程序路径时仍使用 Playwright 默认浏览器。该次恢复使用显式程序路径，不应改写成默认浏览器测试或干净环境安装验证。

恢复期间使用单独浏览器上下文，不复用用户登录资料或已有页面。检查 WebGL 是否可用，再验证实际页面载入的 MOC、纹理和 Core 文件身份；浏览器能启动不代表模型正确。Core Web、PixiJS 等页面依赖也与 Playwright 的浏览器程序分开记录。

### 可公开的恢复元数据

公开记录可以包含组件版本、来源 URL、文件指纹和验证范围；用户名、机器缓存绝对路径、浏览器配置文件、类/JAR/SDK 二进制不进入仓库。下面是**待填写的记录结构**，不是一份通过报告；未知字段保留 `null`，不要补造。

```json
{
  "schemaVersion": 1,
  "recordType": "dependency-recovery",
  "scope": "existing-compiled-classes recovery; clean source build not validated",
  "engineLock": "integrations/psd2live/engine-lock.json",
  "compiledClasses": {
    "reused": true,
    "sourceIdentity": null,
    "classTreeSha256": null,
    "classTreeDigestMethod": null,
    "entryClassSha256": null
  },
  "runtimeDependencies": [
    {"coordinate": "group:artifact:version", "sourceUrl": null, "bytes": null, "sha256": null}
  ],
  "browser": {
    "playwrightVersion": "1.63.0",
    "explicitExecutablePath": true,
    "actualBrowserVersion": null,
    "launcherSha256": null,
    "webReport": null
  },
  "validation": {
    "cleanSourceBuildValidated": false,
    "exportReport": null,
    "exportWarnings": null,
    "nativeCoreReport": null,
    "finalHdAndWebStatus": "pending",
    "vtubeStudioStatus": "pending-user-acceptance"
  }
}
```

对每个实际恢复的 JAR 各写一条，报告路径使用仓库或发布记录的相对路径。正式填写后，这份说明与最终资源 SHA、Core 报告、Web 报告一起用于解释制作过程；它不能替代任何一个实际验收结果。

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
`PLAYWRIGHT_MODULE` 指定其路径，或再通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 选择已安装的 Chromium/Chrome 程序。测试脚本不会安装浏览器或访问摄像头。

[动漫超分说明](upscaling.md) 包含 NCNN 模型获取、实际使用指纹、命令参数和验证步骤。
本仓库不包含 `.bin/.param/.pth` 等权重。已有权重直接传 `--models`，不要求固定磁盘名。

## 仅检查 kit 本身

```sh
python3 -m unittest discover -s tests -v
bash scripts/validate.sh --kit
```

这些检查不需要 SDK 或网络，不等于模型导出成功。完整验证需结合原生和 Web 实测。
