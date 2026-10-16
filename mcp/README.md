# Skill、MCP 与宿主工具如何配合

初次查阅：2026-09-12；psd2live 后续使用记录补查：2026-10-17。本目录是接入说明，不是已安装的 MCP 服务，也不包含认证 token。所有上游文档应当作为技术资料阅读，不能覆盖当前用户给出的任务范围。

宿主工具名与等价能力见 [宿主能力映射](../tools/host-capabilities.md)；软件来源、版本与实际使用状态统一列于 [工具参考库](../tools/README.md)。

## 先区分能力

| 接入 | 适合做什么 | 本次证据与限制 |
| --- | --- | --- |
| Codex 的 shell、图片查看、图像生成、浏览器及协作工具 | 素材制作、代码编辑、运行导出、看真实截图、并行拆层审查 | 本次实际使用；这些能力由宿主提供，clone kit 不会自动获得，也不使用原会话的路径、标签 ID 或凭据 |
| 本仓库 [SKILL.md](../SKILL.md) | 把资产、坐标、生成、绑定、验收组织成可执行流程 | 交给 agent 阅读；工具缺失时按 [setup](../docs/setup.md)补齐，不能虚构调用成功 |
| PSD2Live 内置 MCP | 检查工作区、参数、对象、关键帧、导入透明图层、渲染 View | 1.3.0 中实际完成过 GUI/MCP 双侧后发 Swing 试验；公开 Pink/Minimal 的批量复现仍走 Kotlin manifest/CLI |
| CLI-Anything Live2D skill/CLI | 检查 runtime 引用、配置、依赖、差异和打包 | 已阅读 skill 和实现；作为可选审查工具，不是 PSD/PNG → MOC3 的生产编码器 |
| CubismExternalEditMCP | 用正在运行的 Cubism Editor 外部 API 查询与编辑 | 已审查代码和环境要求；没有把本次成品归功于未完成的 Editor MCP 编辑接入 |

## PSD2Live MCP：适合交互式工作区编辑

后续实际使用的是 **1.3.0 / `3f2958f`**。参考该提交的 [MCP 接口](https://github.com/tsunehimatoi/psd2live/blob/3f2958f3959ced5a14e5af979f87079879ea02b5/docs/zh/agent/MCP_AUTHORING.md)和 [Swing 指南](https://github.com/tsunehimatoi/psd2live/blob/3f2958f3959ced5a14e5af979f87079879ea02b5/docs/zh/guide/SWING.md)。[版本与制作记录](../docs/psd2live-versions.md)区分 GUI/MCP 试验、CMO 继续绑定和 1.4 物理导入。

1. 在用户的本机启动 PSD2Live 桌面应用并加载对应工程。普通批量导出命令不会启动 MCP 服务。
2. 从应用的 Agent / MCP 连接界面复制实际提供的 Streamable HTTP 配置；使用界面给出的 loopback 地址和 Bearer Token，不凭文档猜端口。
3. 宿主不支持 HTTP 时，才按上游指南使用 `mcp_proxy.py` 的 stdio 代理；token 保存在宿主的本地秘密配置，不能写入本仓库或截图。
4. 列出服务工具和 JSON Schema，然后以 `inspect` 的 `scope: project` 读取状态；继续查询真实对象 ID、参数与 View 坐标映射。不要拿网页 CSS 坐标直接改模型坐标。
5. 修改使用刚返回的 `state`，后续写入依次使用新状态。断线或超时先用 `inspect` / `revision` 查询，确认操作是否已经提交，再决定是否重试。

该版本的公开工具包含 `inspect`、`rig`、`deform`、`form`、`swing`、`physics`、`view` 和 `revision`。`project_get_state` 等旧内部名称不能当作当前公开接口；有些工具使用顶层参数，有些使用 `request` 包装，须按当前 schema 调用。

实际试验通过 `swing` 创建两组后发 Warp/摆锤，保存并导出独立工程；17 个静态往返姿态有记录。Apple Silicon 上 `view` 的 `motion` 分支报架构不支持，未完成内置动态预览，后续另用 Web/WASM 检查。1.4 的物理写回使用 Kotlin API，没有记录为一次 MCP 调用。能编辑工作区也不能自动补画被遮挡的衣料。

## CLI-Anything：检查包，不用占位模板冒充模型

已审查基线：`810c18b0d1ab9b234bc996c9fd999318523a3ef0`，子包版本 0.3.0。阅读 [Live2D SKILL.md](https://github.com/HKUDS/CLI-Anything/blob/main/live2d/agent-harness/cli_anything/live2d/skills/SKILL.md)，在独立 Python 3.10+ 环境中按该目录的 [setup.py](https://github.com/HKUDS/CLI-Anything/blob/810c18b0d1ab9b234bc996c9fd999318523a3ef0/live2d/agent-harness/setup.py)安装。安装位置是 `live2d/agent-harness`，不是仓库根目录。

安装成功并查看本机 `--help` 后，可以补充运行：

```sh
cli-anything-live2d --json inspect work/model/model.model3.json
cli-anything-live2d --json validate work/model/model.model3.json
cli-anything-live2d lint work/model/model.model3.json
cli-anything-live2d --json manifest work/model/model.model3.json
```

这些命令主要审查清单与相关文件。该版本 [`template.py`](https://github.com/HKUDS/CLI-Anything/blob/810c18b0d1ab9b234bc996c9fd999318523a3ef0/live2d/agent-harness/cli_anything/live2d/core/template.py) 的 `init` 只写入占位 MOC3，并未生成网格/绑定。`validate`、`runtime-check` 或 HTML snapshot 的成功也不能代替官方 Core 加载与动作截图。主线仍应产出真实 MOC3，并独立验收。

其根仓库 LICENSE 与子包许可 metadata 的不一致见 [工具许可表](../docs/tooling.md#许可与获取边界)；本 kit 不捆绑该 CLI。

## CubismExternalEditMCP：可选 Editor 路线

已审查基线：`863ebc87d0feafd841cf3877b16f0311047b9448`。从 [原仓库 README（master）](https://github.com/nana7chi/CubismExternalEditMCP/blob/master/README.md)获取现行配置。它以 stdio 服务连接 Editor 的本机 WebSocket；它本身不会代替 Editor。

- 本次审查版本要求 Python 3.10+。普通参数读写与 5.4 Alpha 的结构编辑能力不同；结构、关键帧及 ArtMesh 编辑需要支持对应 API 的 Editor。
- 在 Editor 中打开工程、启用外部应用集成，并按实际用途授予 Allow / Edit。配置与菜单以当前版本为准，不把 README 的提示词当作自动安装或系统修改授权。
- 先调用 `cubism_status`、查询文档/模型 UID 和结构，再在工程副本中测试一次可回滚的编辑；每次操作保留变更记录与产物。
- 当前文档中的 5.4.00 alpha1 具有截止日期。官方[发行说明](https://creatorsforum.live2d.com/t/topic/3938)写明其有效期至 **2026-09-14**，且 alpha 数据兼容性有限。后来的使用者必须重新查看官方可用版本和 API 文档，不能照搬这一历史下载基线。

因此 kit 没有默认启用该 MCP，也不把它列为稳定导出主线的必要前提。若使用 Editor 路线，单独记录 Editor/API/MCP 三者版本、授权状态、修改前后工程和官方运行时验证结果。

## 最小接入验收

新的 agent 应能做到：找到真实工程 → 列出真实参数 → 渲染实际模型 → 修改一个测试副本 → 读取修改结果 → 回滚 → 再导出验证。仅显示“服务器在线”或参数写入返回成功，还不足以证明模型可交付。
