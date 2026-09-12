# 从公开文件复现

Pink Sakura 的制作源图、眉毛分解源文件、最终遮罩坐标、配方生成器和引擎补丁均在仓库中。忽略的 `work/` 保存迭代输出，`.cache/` 保存另行获取的工具；它们不是公开示例生成 manifest 所需的隐藏素材。**2026-09-12 已完成独立空缓存起步的完整源码编译、16 层 Minimal 导出及实际 Core/Web 验证。** 本页保留较早快速审计的未完成记录，并分别说明后续验证。

## 已提交源码包：7f391f4

提交 `7f391f432615cfb46460e63e2555dabc98a0a9f9` 已再次通过独立 `git archive` 检查。新副本初始没有 `work/`、`.cache/`、`outputs/` 或 `dist/`：59 项 Python 与 28 项 Node 测试通过；三张眉毛素材重新生成后与发布字节一致；Pink 重建 24 个源层、Minimal 重建 16 个几何层。Pink manifest 与实际制作记录 SHA 相同，八张图像依赖全部在源包内。

原报告及其 SHA 保留在[已提交源包记录](verification/source-package-7f391f4.json)和[验证索引](verification/README.md)。该检查不联网、不编译引擎、不导出 MOC、不执行 Core 或摄像头，因此 `cleanEngineBuildValidated` 与 `nativeCoreValidated` 保持 `false`。这与下面单独完成的冷源码编译结果并不冲突；冷构建使用的是较早源包加已记录的公开修改，不能直接称作对 `7f391f4` 的又一次完整冷编译。

## 完整源码构建结果

本次从提交 `2afd9d2ac29d1ef93c39b86215c3d81d89cb7f6d` 的 `git archive` 建立新副本。初始引擎目录、Gradle 缓存及副本内 `work/`、`.cache/`、`build/` 均不存在；没有复制旧应用类、JAR 或生产工程。构建期间加入了当前公开的 16 层 Minimal 生成器，以及本页说明的源码获取和可选网络恢复脚本，逐个记录 SHA。因此这是“该源包加已记录的公开脚本修改”的实测，不追溯声称旧提交本身包含新增功能。

| 检查 | 实际结果 |
| --- | --- |
| 引擎身份 | 新获取 psd2live `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`；累计补丁及 8 个源码 SHA 与锁文件一致 |
| 源码范围 | `--source-only` 保留全部主/测试源码及资源，核对 432 个必要文件，无缺失；仍完整编译 GUI/MCP 源码 |
| JDK / Gradle | 已安装 Zulu JDK 21.0.11；另行新下载官方 Gradle 9.6.1，ZIP 的 SHA-256 与官方校验文件一致 |
| 联网依赖 | 新建 relay 缓存和新 `GRADLE_USER_HOME`；446 个成功下载的文件均有官方来源 URL、大小与 SHA，所有 JAR 通过 ZIP CRC 检查 |
| 源码编译 | `--no-build-cache --rerun-tasks` 完整执行 `compileKotlin`；1899 个新 `.class`，成功调用 `ManifestExportKt` |
| Minimal 导出 | 16 个源层，生成真实 MOC3、CMO3、PSD 和 1024² 图集；19 参数、18 Drawable |
| 原生 Core | 新导出文件在 Core 6.0.257 中通过 192 个姿态检查，errors/warnings 均为空 |
| 实际 WebGL | Chrome 152.0.7977.83 / Playwright 1.63.0 / Web Core 5.1.0：22 项检查通过，19 个参数均测得绑定变化，没有摄像头请求 |
| 公共脚本入口 | 使用显式 `PSD2LIVE_GRADLE` 再调用 `export-model.sh` 成功；这是重用本次新编译输出的入口复跑，单独记录 |
| 当前 Pink 公开配方 | 单独复制公开 generator/JSON/source，重建 24 层 manifest；8 张图像依赖全部在副本中，眉毛三张衍生图确定性重建一致，真实 LOW 导出成功；新文件 Core 202 姿态检查通过 |

Minimal 新 MOC 的 SHA-256 为 `dded5ca479232e5e74a94ac52681efa13faef73d2ac0174a22a365e0b94b98c9`；1024² 图集为 `da54af0069a6122a3da0a6cd101d153ca498d77f98af9d4ffced99f5ece9a42d`。浏览器实际收到的二者指纹与这次原生 Core 输入一致。

同一份新编译引擎从公开 Pink 配方导出的 LOW MOC 为 `ba9c30d1a8a6382dad388caa67bf0baad944fc618b171bcb95613e4f7b6b19ae`，与当前仓库 4× 高清版 MOC 逐字节一致；新文件在原生 Core 中通过 202 个姿态，24 参数、26 Drawable，errors/warnings 均为空。这项补测没有重新执行 NCNN 超分或 Pink 的 91 帧画布检查；原有高清图集与该轮视觉验收继续由 Pink 自己的验证记录说明。

这次冷启动经历了网络恢复：完整 Git 获取首先遇到 `curl 18 / early EOF`；源码模式成功后，Gradle 直接 HTTPS 下载很慢，relay 首次运行也曾超过读取超时。增加受限的 curl 断点重试和本构建的等待时间后，使用**本次新下载的依赖**继续，重试前仍无应用编译类。成功的全编译/导出命令用时 11 分 21 秒；这不是整次审计耗时，也不是首次命令无错误通过。原始命令、时间、初始空目录状态、来源/校验清单和编译输出树均已记录。

此外，上游 Wrapper 的 Gradle ZIP 下载因 `networkTimeout=10000`、`retries=0` 超时。成功全编译使用的是先前在同一冷审计中通过 curl 新取得并验 SHA 的官方 Gradle，而非旧 Gradle 应用缓存。下面的 `PSD2LIVE_GRADLE` 入口公开了这一可选路径；默认 Wrapper、引擎构建文件和全局 Gradle 配置均不因此改写。

验收边界仍需保留：Minimal 导出器提示若干左右层共享语义名，以及 CMO3 从图集重建可编辑图层、未保留原 PSD 来源编辑链；原生 Core 无警告不消除这些提示。此次未执行官方 Editor GUI、VTube Studio、跨机器/跨平台或离线构建验收，也未重做 Minimal 的整套画布极值矩阵。下载记录是实际来源证据，不是完整 Gradle 依赖校验锁，更不承诺 CMO3 等所有产物逐字节可重复。

本轮完整记录见 [冷构建验证目录](verification/cold-build/README.md)：含 [范围摘要](verification/cold-build/summary.json)、[命令与失败重试](verification/cold-build/commands.json)、[446 项下载来源](verification/cold-build/dependency-downloads.json)和[1899 个新类的输出树](verification/cold-build/compiled-output-tree.json)。记录只包含元数据，不包含 JAR、SDK、类文件或模型二进制。

## 历史：干净源包快速审计

2026-09-12 对提交 `5632612e95a766512487f3e8e138cdb98400e0ec` 执行了 `git archive HEAD`，在新的临时目录解包。副本最初不存在 `work/`、`.cache/`、`outputs/` 或 `dist/`，没有复制制作机的引擎类、JAR、SDK、超分权重或旧角色文件。

| 检查 | 该次实际结果 |
| --- | --- |
| 源包内的单元测试 | 原提交的 30 项全部通过 |
| `validate.sh --kit` | 通过；仅结构、链接和启发式检查 |
| Pink 公开配方重新生成 | 22 个源图层，5 张图像依赖全部位于源包内 |
| Pink manifest 指纹 | `850504efa98ef2aa56d5d1ca022a853e607c02d699d144e8793612db0013e84a`，与实际低分导出输入逐字节一致 |
| 通用最小示例重新生成 | JDK 21 从公开 Java 源码生成 14 个 PNG 图层与 manifest；结构检查通过 |
| 最小示例 manifest 指纹 | `8c9a29eda758fba36b21ee0e8ff714db3435abc99964032c3149bdb580c8b6ca` |
| 全新 psd2live 获取与补丁应用 | 从上游获取固定提交成功；仓库累计补丁应用成功，8 个修改文件与锁定 SHA 一致 |
| 空 Gradle 缓存完整导出 | **未完成**：已下载 Gradle 9.6.1，约 6 分钟后仍等待插件 classpath 的 HTTPS artifact 下载，快速审计在此主动停止 |

最后一项使用 JDK 21、新的引擎 checkout 和独立 `GRADLE_USER_HOME`，没有复用旧编译类。停止时尚未进入 `compileKotlin`，没有产出新的 MOC，也没有出现可归因于源代码的编译错误。线程栈停留在 Gradle `DownloadAction` / TLS socket 读取阶段；这是一项尚未完成的联网构建，不能写成“干净构建通过”，也不能据此断言源码无法编译。

这次新增的源包检查器还有两项边界测试：拒绝 archive 越界路径/符号链接，以及拒绝 manifest 从包外借用隐藏填充图。加入后，本地测试总计 32 项通过；它们不追溯改变被审计历史提交中的测试数量。

## 一条命令检查已提交源包

需要 Git、Python 3.10+、Node.js 22+ 与 JDK 21。在仓库根目录执行：

```sh
python3 scripts/check-source-package.py --report work/source-package-report.json
```

默认只检查 `HEAD` 的已提交文件，不包含工作区未提交修改。它在临时目录执行测试、kit 检查、Pink manifest 重建和最小素材生成，核对源图依赖没有逃出包，并比较 Pink 的已记录 manifest SHA。运行结束后自动删除临时副本，报告保留在指定位置。

可指定提交或本机运行环境：

```sh
python3 scripts/check-source-package.py \
  --ref HEAD \
  --java /path/to/jdk-21/bin/java \
  --node /path/to/node \
  --report work/source-package-report.json
```

此检查器不下载依赖、不调用旧类、不执行模型导出、超分或 Core。报告中的 `cleanEngineBuildValidated` 与 `nativeCoreValidated` 因而保持 `false`。实际导出验证使用下一节的独立流程。

## 在空环境中执行完整导出

可以新 clone 仓库，也可以在仓库根目录用已提交文件建立独立副本：

```sh
AUDIT_DIR="$(mktemp -d)"
git archive --format=tar --output="$AUDIT_DIR/source.tar" HEAD
mkdir "$AUDIT_DIR/kit"
tar -xf "$AUDIT_DIR/source.tar" -C "$AUDIT_DIR/kit"
cd "$AUDIT_DIR/kit"

# JAVA_HOME 指向本机 JDK 21；不修改其它项目的 Gradle 配置。
export PATH="$JAVA_HOME/bin:$PATH"
export GRADLE_USER_HOME="$AUDIT_DIR/gradle-user-home"
java --source 21 examples/minimal-model/GenerateExample.java work/minimal/assets
bash scripts/setup-psd2live.sh
bash scripts/export-model.sh work/minimal/assets/manifest.json work/minimal/low
```

成功后先检查导出日志、warnings 和最小模型，再处理角色。Pink 的最终公开制作输入可直接重建：

```sh
node examples/pink-sakura/build-manifest.cjs
bash scripts/validate.sh --manifest examples/pink-sakura/manifest.json
bash scripts/export-model.sh examples/pink-sakura/manifest.json work/pink-sakura/low
```

导出输出目录必须为空；后续重试使用新目录。实际完成编译、MOC 导出、原生 Core 和 Web 检查后，分别记录结果，不用旧的通过报告为新文件背书。JDK、Core、浏览器、超分工具及权重的获取说明见 [setup](setup.md)、[超分](upscaling.md) 与 [最小示例](../examples/minimal-model/README.md)。

## 可选：减少源码下载和恢复慢连接

默认安装仍获取完整上游 checkout。若只需从源码编译、测试和导出，可显式跳过上游样例 PSD、图集和文档图片：

```sh
bash scripts/setup-psd2live.sh --source-only --directory work/cold-engine
export PSD2LIVE_DIR="$PWD/work/cold-engine"
```

这个选项只影响新 checkout 的取得方式：固定提交、所有 `src/main`、`src/test`、嵌入资源、`.agent` 参考、Gradle Wrapper、许可证及根构建文件仍保留；同一累计补丁及八项源码 SHA 照常验证。它不裁掉 GUI/MCP 源码，也不复用以前的编译类。已存在的用户 checkout 不会被缩小。上游分发打包任务引用了 `docs/` 等目录，制作完整上游发行包时使用默认完整获取方式。

如果当前网络下 Gradle 的 HTTPS 下载很慢，而命令行 curl 可用，可以显式启用
[`maven-curl-relay.py`](../scripts/maven-curl-relay.py)。它只绑定 `127.0.0.1`，固定映射 Maven Central、Gradle Plugin Portal 和 Google Maven；通过 HTTPS 取得依赖、记录每个文件的来源 URL、字节数和 SHA-256，并支持本次缓存中的断点续传。Gradle 仍负责选择依赖版本和编译完整源码。

先在一个终端启动新 relay：

```sh
python3 scripts/maven-curl-relay.py --cache work/cold-curl --require-empty
```

在同一仓库的第二个终端中，配置 JDK 21 后执行：

```sh
export PSD2LIVE_MAVEN_RELAY="$(python3 -c 'import json; print(json.load(open("work/cold-curl/relay.json"))["url"])')"
export GRADLE_USER_HOME="$PWD/work/cold-gradle"
export PSD2LIVE_DIR="$PWD/work/cold-engine"
java --source 21 examples/minimal-model/GenerateExample.java work/cold-minimal/assets
bash scripts/export-model.sh work/cold-minimal/assets/manifest.json work/cold-minimal/low
```

冷构建审计需让上述缓存和输出目录最初不存在；脚本不删除已有目录。若网络中断，可重新启动 relay 时省略 `--require-empty`，继续本次已经新下载的依赖，重新读取端口，再重试尚未产生输出的构建。应记录这次恢复，不能把一次恢复写成首次命令无错误通过。relay 的 `requests.jsonl` 和 `records/` 保存取得记录，失败传输的片段留在 `partial/`；这些目录均应在忽略的 `work/` 内。

该选项不读取其它工程的 Gradle 缓存、`~/.m2` 或已编译引擎，不关闭 TLS 校验、不修改全局代理。启用时只对这个构建放宽读取等待，使完整依赖文件取得后再返回 Gradle。完成后在 relay 终端按 Ctrl+C 停止。若普通 Gradle 下载正常，无需启用它。

### Wrapper 发行包下载超时时

relay 只处理 Maven 依赖，不接管 Gradle Wrapper 的发行包下载。如果 Wrapper 本身因连接超时失败，可另外取得**与固定上游匹配的 Gradle 9.6.1**，验证官方 SHA 后显式指定启动脚本：

```sh
mkdir -p work/gradle-distribution
curl --fail --location --retry 3 \
  https://services.gradle.org/distributions/gradle-9.6.1-bin.zip \
  --output work/gradle-distribution/gradle-9.6.1-bin.zip
curl --fail --location --retry 3 \
  https://services.gradle.org/distributions/gradle-9.6.1-bin.zip.sha256 \
  --output work/gradle-distribution/gradle-9.6.1-bin.zip.sha256
python3 - <<'PY'
import hashlib
from pathlib import Path
p = Path('work/gradle-distribution/gradle-9.6.1-bin.zip')
expected = Path(str(p) + '.sha256').read_text().strip().split()[0]
assert hashlib.sha256(p.read_bytes()).hexdigest() == expected, 'Gradle SHA mismatch'
PY
python3 -m zipfile -e work/gradle-distribution/gradle-9.6.1-bin.zip work/gradle-distribution
export PSD2LIVE_GRADLE="$PWD/work/gradle-distribution/gradle-9.6.1/bin/gradle"
bash scripts/export-model.sh work/cold-minimal/assets/manifest.json work/cold-minimal/low
```

本次验证的 ZIP 为 140,682,664 字节，SHA-256 为 `9c0f7faeeb306cb14e4279a3e084ca6b596894089a0638e68a07c945a32c9e14`。此入口只选择 Gradle 启动脚本，仍执行同一套源码 `classes` 和导出任务；不会加载历史七个 JAR 运行恢复方案。`PSD2LIVE_GRADLE` 未设置时仍调用引擎 Wrapper。

## 导出链依赖审计

| 入口 | 公开依赖与作用 |
| --- | --- |
| [`setup-psd2live.py`](../scripts/setup-psd2live.py) | 从 [`engine-lock.json`](../integrations/psd2live/engine-lock.json) 读取上游 URL、提交和 SHA；验证公开累计补丁，应用并逐项核对源码。默认 `.cache/psd2live` 是新建 checkout 的目标，可用 `--directory` 更换 |
| [`export-model.sh`](../scripts/export-model.sh) | 从脚本所在位置解析 kit 根目录，读取指定 manifest；通过新引擎 Gradle `classes` 构建，再调用 `ManifestExportKt`；可用 `PSD2LIVE_DIR` 指定独立引擎 |
| [`psd2live-init.gradle`](../scripts/psd2live-init.gradle) | 将仓库 [`integrations/psd2live`](../integrations/psd2live/README.md) 的 Kotlin 源码加入编译；任务依赖 `classes`，没有引用制作机 `headless-libs` 或旧类目录 |
| [`ExtractPsd.kt`](../integrations/psd2live/ExtractPsd.kt) | 使用固定引擎内的 `PsdReader` 与 `PreviewRenderer`，读取用户给定 PSD 后生成 PNG/manifest；不要求原对话的 PSD |
| [`build-manifest.cjs`](../examples/pink-sakura/build-manifest.cjs) | 按文件自身目录读取公开 JSON 与源图；源图位置、遮罩和生成填充参考均随 Pink example 发布 |

审计未发现这些入口隐式引用原角色目录、忽略的手工补丁或旧编译类。上游构建脚本仍包含 Compose、LWJGL、MCP 等依赖；目前的 `classes` 路径并非一套只含七个 JAR 的全新 headless 源码构建。历史制作中的七个 JAR 恢复记录说明的是**已有编译产物的运行恢复**，不可作为干净编译的完整依赖清单。

[`engine-lock.json`](../integrations/psd2live/engine-lock.json) 锁定引擎提交和本 kit 修改文件，并不是所有 Gradle 传递依赖的校验锁。网络依赖仍按固定上游构建文件的仓库与版本解析；尚未完成跨机器、跨平台或离线完整构建验证。若需要严格、可离线的构建复现，应另行完成依赖镜像、完整校验锁及新环境导出测试，再更新验证范围。

## 不随仓库分发的内容

- Live2D 官方 SDK/Core、官方样例按其条款另行获取；它们不是缺失的角色源图。
- Upscayl 与 NCNN 权重按 [工具说明](tooling.md) 和 [超分说明](upscaling.md) 获取。Pink 保存了实际模型名称、版本/指纹与命令参数，但不重新分发权重。
- `.cache/`、`work/` 中的 classes、JAR、临时 PNG、失败遮罩方案及制作日志不构成公开配方的输入。必要的最终输入已进入 example；历史记录保留其验证范围。
- 原图与补画是固定输入。公开源图可以复用；重新向图像生成服务发送同一提示，并不承诺产生字节相同的图片。

本 kit 已提供可直接载入的 Pink runtime，并记录其真实 Core/Web 验证。源图生成、清单重建、完整源码编译、MOC 导出、超分纹理和运行时验收是不同阶段，分别验证和陈述。
