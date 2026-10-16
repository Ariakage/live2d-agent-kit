# psd2live 版本与后续制作记录

整理日期：2026-10-17。早期 kit 文档只记录了固定 manifest 导出链，遗漏了后续 Shironeko 中实际使用的 GUI/MCP、Swing 变形器和物理导入。本页补齐这些操作，并保留各条路线的适用范围。

## 三个版本分别做了什么

| 版本 / 固定提交 | 实际使用 | 在本仓库中的位置 |
| --- | --- | --- |
| 早期引擎 [`5526f2e`](https://github.com/tsunehimatoi/psd2live/tree/5526f2e16b57e5f83d34f33730d6fa26d8bc8695) + kit 补丁 | manifest / PSD 导入、模型导出、高清图集注入 | Minimal 与 Pink Sakura 的公开复现入口；由 `engine-lock.json` 锁定 |
| **1.3.0** [`3f2958f`](https://github.com/tsunehimatoi/psd2live/tree/3f2958f3959ced5a14e5af979f87079879ea02b5) | GUI 保存 `.psd2live`、MCP 双侧后发 Swing 试验、CMO 导入后继续绑定、后续身体和肘袖修改 | Shironeko 后续制作工具链；不自动替换 Pink 的导出器 |
| **1.4.0** [`dbc25f7`](https://github.com/tsunehimatoi/psd2live/tree/dbc25f7143d45c355082b9e1a069deccd5952040) | `PhysicsAuthoring.import` 与 `Cmo3PhysicsInjector` 将运行时物理写回 CMO | r31 的物理导入步骤；不是整个模型都迁移到了 1.4 |

版本号已与本地 checkout 的 `build.gradle.kts`、提交 ID 和制作报告核对。这些是当时实际用过的版本，不表示它们是今天的上游最新版。当前 kit 安装脚本仍锁定第一行；旧补丁、manifest 适配器和报告不能直接套到另两行。

## 1.3：GUI/MCP 确实做过编辑

先从已有高清图集与图层位置重建高清 PSD，再在 GUI 中导入并保存独立 `.psd2live`。中性基础稿保留了 29 层，暂时排除了备用手形、闭眼、张嘴与特效。随后通过内置 MCP 的 `swing` 工具，对左右外后发各创建一组 Warp 和摆锤。

- MCP 工程从 18 个参数增至 20 个，新增 `ParamSwingBackOuterR/L`，发根固定、发梢摆动。
- 工程保存、重新打开和导出均有记录；17 个往返姿态用于检查轮廓连续性。
- 这份基础工程缺少原模型的完整表情和动作，保留为隔离试验，没有替换正式 r29。
- `view` 的 `motion` 分支在当时 Apple Silicon 环境报错：`Cubism SDK preview requires x86_64/amd64`。这次失败被保留；静态姿态不能冒充动态物理验证，后续另用 Web/WASM 播放检查。

因此，“psd2live MCP 只评估过、从未使用”不再准确；同时，不能将这个自动绑定的 GUI 工程称为后续正式模型的全部来源。

### 保留已有绑定的 CMO 路线

另一条路线通过 `Cmo3Import` 读取原 CMO，再用 **`SwingAuthoring.put`** 包裹实际后发 ArtMesh。它保留了原有 56 个参数、45 个网格和两页高清图集，添加两条 Swing 参数，得到 58 参数候选；原有动作与表情文件继续随包保留。

一次失败尝试把 Swing 加到旧的共享变形器上，参数虽存在，实际网格却没有移动。改为目标 ArtMesh 独立包裹后才得到可见形变。对新参数应检查 Drawable 的顶点或画面变化，不能只看参数面板。

候选通过了 145 个官方 Core 姿态，并分别做浏览器扫值、回程与物理播放检查。它还出现过 `WeldDivergence` 导出提示，不能由网页通过推定 Cubism 编辑、重新排图集也安全。后续 r31 的身体拆层与局部 Warp、r34～r37 的肘袖修复继续使用 1.3 工具链和角色专用代码；这些私有源素材与补丁没有移入 Pink Sakura。

## 1.4：把物理写回可编辑源

原 CMO 内只有 8 组物理，运行包里的 `physics3.json` 已有 18 组。若只从该 CMO 再导出，后来加入的物理会丢失。

在 r31 的独立源文件副本上，实际调用了 **`PhysicsAuthoring.import` + `Cmo3PhysicsInjector`**，将 18 组物理写回 CMO，然后重新读取检查：

| 检查项 | 当时的结果 |
| --- | --- |
| 物理 | 18 组、60 FPS，62 个输入、25 个输出、44 个顶点；顺序与数值一致 |
| 参数与结构 | 58 参数、51 Drawable、41 变形器，导入前后保持一致 |
| 纹理 | 三页尺寸不变；224 个内嵌 PNG 字节一致 |
| 几何抽样 | 31 个姿态，最大变化为 0.0 原画像素 |
| 缺失参数 / 被停用组 | 均为空 |

这是程序化 CMO 读写和数值比对。虽然 1.4 的 [MCP 物理接口](https://github.com/tsunehimatoi/psd2live/blob/dbc25f7143d45c355082b9e1a069deccd5952040/docs/zh/guide/PHYSICS.md)也提供导入、模拟和调参能力，上述记录使用的是 Kotlin API，不应改称一次成功的 MCP 物理调用。

保存版本较新的 CMO 曾被本机较旧 Cubism Editor 提示兼容风险，当时取消了加载。因此没有完成兼容 Editor 中的打开、保存、重导出验收；运行包仍需保留外部 `physics3.json`。

## 在自己的工程里使用

1. **选定路线。** 复现 Pink / Minimal 用现有 [setup](setup.md)；尝试新版 GUI/MCP 或继续编辑已有 CMO，用独立 checkout 和工程副本。保留原模型、运行物理、动作、表情与图集。
2. **保存真正的源工程。** `.psd2live` 是可继续编辑的工程，`.psd2live.json` 是导出诊断文件，两者不能互换。重新导入 PSD 通常会重新自动绑定，不会继承旧模型的全部参数。
3. **读取当前 schema。** 从 GUI 的“工具 → MCP”获取实际端点及本地 token，先列工具，再用 `inspect` 读取对象 ID 和 `state`。新版使用 `inspect`、`swing`、`deform` 等公开工具名，不照搬旧内部接口名。
4. **先改一个部件。** 选择真实 ArtMesh、确认父级，固定根部，小幅创建 Warp/关键形；再加物理。`asset.split` 只能分配已有像素，遮挡区域仍需补画。
5. **完整检查并保存。** 测中性、极值、中间值、反向和重复；参数改变后核对实际画面。修改按返回的新 `state` 顺序进行，超时后先查询状态，避免重复写入。

以下仅准备隔离的 1.3 checkout。需要 JDK 21，首次 Gradle 构建需联网；它不会自动安装 kit 的旧补丁。

```sh
git clone https://github.com/tsunehimatoi/psd2live.git work/psd2live-1.3
git -C work/psd2live-1.3 checkout --detach 3f2958f3959ced5a14e5af979f87079879ea02b5
cd work/psd2live-1.3
./gradlew run
```

如要研究 1.4 物理功能，另建目录并固定 `dbc25f7143d45c355082b9e1a069deccd5952040`。不要直接覆盖已有 checkout 或将构建、SDK、token、个人绝对路径提交到 Git。

## 记录与复现边界

[整理后的历史记录](verification/psd2live-authoring-history.json)包含固定提交、关键结果和原报告指纹；个人路径已移除。它是对本地保留报告的核对摘要，**不是本次重新执行 GUI、MCP 或角色构建的通过报告**。私有角色源文件和试验工程不公开，所以这些记录用于解释方法，不能当作 Pink 在新版引擎下的完整复现证明。

若要升级 kit 的默认导出器，需另外适配公开配方及补丁，从干净目录重新导出 Minimal 和 Pink，核对参数、纹理、物理及连续动作后再更新 `engine-lock.json`。本次只补齐版本与方法记录。

相关入口：[1.3 MCP](https://github.com/tsunehimatoi/psd2live/blob/3f2958f3959ced5a14e5af979f87079879ea02b5/docs/zh/agent/MCP_AUTHORING.md) · [1.3 Swing](https://github.com/tsunehimatoi/psd2live/blob/3f2958f3959ced5a14e5af979f87079879ea02b5/docs/zh/guide/SWING.md) · [1.4 物理](https://github.com/tsunehimatoi/psd2live/blob/dbc25f7143d45c355082b9e1a069deccd5952040/docs/zh/guide/PHYSICS.md) · [MCP 接入](../mcp/README.md) · [连续动作验收](workflow.md)
