# 验证记录索引 / Verification records

这里按阶段收录检查。读一份报告时，先核对它的提交或文件 SHA，再看实际执行了哪条链路。源包可重建、引擎能编译和摄像头能驱动模型分别记录，任一项都不替代用户的 VTube Studio 验收。

| 要核实的问题 | 记录与身份 | 已验证范围 | 不包含的范围 |
| --- | --- | --- | --- |
| 已提交仓库是否缺少隐藏素材？ | [源包检查](source-package-7f391f4.json)，提交 `7f391f432615cfb46460e63e2555dabc98a0a9f9` | `git archive` 新副本；59 项 Python、28 项 Node 测试；三张眉毛图字节一致；重建 Pink 24 层和 Minimal 16 层 | 不联网，不编译引擎，不导出 MOC，不执行 Core、超分或摄像头 |
| 没有旧编译缓存，能否导出？ | [冷构建目录](cold-build/README.md)，`2afd9d2` 源包加明确记录的公开源码修改 | 完整源码编译；Minimal 导出、192 个 Core 姿态、22 项 Web 检查；公开 Pink 配方导出及 202 个 Core 姿态 | 不把修改后的构建归给未经修改的旧提交；没有重做 Pink 超分/91 帧画布矩阵或摄像头 |
| 最终模型是否能接收真实摄像头？ | [物理摄像头报告](camera-tracking.json)，包含代码与实际收到的模型/图集 SHA | 16 项检查；面部、双眉、双肩输入；校准、停帧回正、接管与释放；CSP 阻断 SDK 日志 | 非识别准确率基准；未验证髋部俯仰精度、独立手臂/手指或 VTS |
| 新迁移选项是否改变默认模型行为？ | [默认捕捉配置回归](capture-defaults/README.md)，记录新版脚本与模板 SHA | Pink 原配置 `[]`；22 项真实 WebGL 检查；未接管额外物理参数；零设备申请 | 合成输入，没有重做 Pink 物理摄像头或完整姿态截图矩阵 |

## 已提交源包：7f391f4

[source-package-7f391f4.json](source-package-7f391f4.json) 是本次原报告的逐字节副本，`passed: true`。其内容不含本机绝对路径；`work/minimal/assets/...` 是审计副本中新生成文件的相对路径。副本最初没有 `work/`、`.cache/`、`outputs/` 或 `dist/`。

三个眉毛 PNG 由公开的 `prepare-brows.cjs` 与源图重新生成，并逐项核对发布字节。Pink 的八张图像依赖均位于源包内，24 层 manifest SHA 为 `dfebae919a530dbc5eee1077c1ad2eed000147f70f5b0b3ed35027651270d571`，与已记录的 LOW 制作输入一致。Minimal 从 Java 源码生成 16 层。源包 JSON 保留了 Python 的 59 项测试摘要及 Node 检查通过状态；同提交的 Node 测试另行复核为 28 项通过。

这份报告中的 `cleanEngineBuildValidated` 与 `nativeCoreValidated` 均为 `false`，符合检查器实际没有执行编译器或 Core 的范围。后续文档提交不会改变被审计的提交身份。可固定该提交重新执行：

```sh
python3 scripts/check-source-package.py \
  --ref 7f391f432615cfb46460e63e2555dabc98a0a9f9 \
  --report work/source-package-7f391f4.json
```

需要本机 Git、Python、Node.js 22+ 与 JDK 21。具体环境可用检查器的 `--java`、`--node` 指定。报告中的执行耗时可能不同；不要因此改写这里保留的原报告。

## 真实摄像头与网络边界

物理摄像头记录对应最终带眉毛的高清 Pink Sakura。20 秒采样期间累计 187 次推理，80 次状态采样中 67 次面部可见、77 次肩部可见；平均 `inferenceFps` 状态指标为 8.45。两眉的实际 Core 参数均跨过中性值。关闭设备后所有 track 为 ended，音频轨道和未捕获页面错误均为 0。这些样本数不是识别率基准。

SDK 仍尝试发送使用统计。报告中有三次 `connect-src` 违反策略事件，外部网络请求事件为 0；也检查了关闭识别器时的日志发送。这里验证的是 `Content-Security-Policy: connect-src 'self'` 在发送前阻止外连，不能表述为“SDK 不含遥测”。换用其它服务器须保留相同策略。安装命令则确实需要联网，已从空目录取得全部 12 个锁定文件，共 45,157,730 字节，再完成离线验证。

摄像头报告列出的八个代码/依赖文件指纹及实际载入的 MOC/图集指纹，已与 `7f391f4` 发布快照核对。后续的 `captureHoldDefaults` 迁移选项修改了控制器与页面代码；这里保留原测试身份，不把旧设备报告改称新代码的设备验收。该选项默认空配置 `[]`，另通过 22 项真实 WebGL 回归；非空配置由控制器单元测试覆盖。完整启动命令、数据映射、隐私来源与测试命令见[摄像头指引](../camera-tracking.md)。运行 `check-camera.cjs --physical-camera` 会实际申请设备，源包自检不会。

其它角色须按[已有模型迁移指引](../migrate-existing-model.md)重新检查参数绑定、左右眼/眉命名、方向映射和资源身份，再运行自己的设备测试；不能继承 Pink 的通过记录。

## 报告文件指纹

以下 SHA-256 对应当前保留的报告字节，方便下载后核对。它们不是数字签名，也不覆盖今后的改动。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| [source-package-7f391f4.json](source-package-7f391f4.json) | 4,986 | `fd24852710032c33bf9404945241936efd54903852dd9f800388051cff30afd9` |
| [camera-tracking.json](camera-tracking.json) | 18,256 | `285af2201643f8bef8fe6da7c81e24b24d41947441cca52f3e18bcd4c47470b6` |
| [cold-build/summary.json](cold-build/summary.json) | 5,218 | `3c72e0cf5f489011f47b37546d7a01a0ee57d3f756fc55bf222bc1baf8a5cdbd` |

冷构建摘要还列出了其余十份子报告的 SHA；本轮逐项核对相符，未改写这些历史证据。Pink 的原生、Web、视觉与超分记录继续保留在[角色验证目录](../../examples/pink-sakura/verification/README.md)。
