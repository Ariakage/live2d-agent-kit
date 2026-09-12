# 从公开文件复现

Pink Sakura 的五张制作源图、最终遮罩坐标、配方生成器和引擎补丁均在仓库中。忽略的 `work/` 保存迭代输出，`.cache/` 保存另行获取的工具；它们不是公开示例生成 manifest 所需的隐藏素材。本页区分已经实际重跑的范围与仍需完成的导出验证。

## 干净源包审计结果

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

需要 Git、Python 3.10+、Node.js 与 JDK 21。在仓库根目录执行：

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

## 在空环境中继续完整导出

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
