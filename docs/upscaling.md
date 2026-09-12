# 动漫超分：保持原脸、alpha 与绑定坐标

本方法来自一次已完成的本地 4× 图集超分实践。它提升纹理采样质量；不会自动修复错误拆层、接缝、缺少的发丝或穿帮。

原始项目入口：[Upscayl](https://github.com/upscayl/upscayl)、
[Upscayl custom-models](https://github.com/upscayl/custom-models)。
下面分别说明应用、CLI 与权重的获取及复现方式。

## 实际选用的工具与模型

查阅日期：2026-09-12。

| 项目 | 本次基线 |
| --- | --- |
| 推理工具 | [Upscayl 2.15.0](https://github.com/upscayl/upscayl/releases/tag/v2.15.0) 安装包中的 `upscayl-bin`；CLI 源码为 [upscayl-ncnn](https://github.com/upscayl/upscayl-ncnn) |
| 模型名 | `realesr-animevideov3-x4`，NCNN 的同名 `.param` 与 `.bin` 两个文件 |
| 比例与分块 | 4×；tile 256；`-j 1:1:1`；输出 PNG；同一 GPU 一次运行一个任务 |
| 实测机器 | macOS / Apple M4；其他 GPU 需先验证，不以此推断通用性能 |
| 比較对象 | 本地 `4x-AnimeSharp-fp32`；本角色小样中线条和虹膜对比更强，AnimeVideo 更符合已认可的柔和脸部 |

这是该角色小样的目视选择，不是通用模型排名。缩回原分辨率的 RMSE 只能描述像素偏差，不能评判角色是否可爱、接缝是否消失。本次数值更低的候选也没有被直接选为最终模型。

### 获取方式

1. 从 [Upscayl 官方发布页](https://github.com/upscayl/upscayl/releases)取得适合操作系统的应用或从其 CLI 仓库按当前说明构建；检查本机 `upscayl-bin -h`。
2. 从 [Upscayl custom-models](https://github.com/upscayl/custom-models#digital-art) 获取 `models` 中的 `realesr-animevideov3-x4.param` 和 `.bin`。两者基名必须完全一致；设置 `--models` 为包含这两个文件的目录。
3. 记录下载 URL、版本/提交、文件大小、SHA-256 与许可。权重文件不进入 kit 或示例目录；用户已有模型可直接指定其本地目录。

Real-ESRGAN 作者的[动漫模型说明](https://github.com/xinntao/Real-ESRGAN/blob/master/docs/anime_video_model.md)解释了 `realesr-animevideov3` 的来源。其 PyTorch `.pth` 不能直接交给本 NCNN 命令；不要仅修改扩展名。Upscayl custom-models 收集了不同作者的模型，不能把某一个模型的许可推广到全部模型。应用/CLI 为 AGPL-3.0，Real-ESRGAN 上游为 BSD-3-Clause，见[工具表](tooling.md#许可与获取边界)。

本次使用的权重指纹可供历史对照，**不是上游签名或任意新版下载的强制值**：

```text
realesr-animevideov3-x4.param
  bytes: 3077
  sha256: 850a248e7c14c27e5bd8cf7265113a9441036a7db63963bb8aa5169d788a435e
realesr-animevideov3-x4.bin
  bytes: 1247368
  sha256: 548a36f9c3f4ab8da56cd3b13badf23968bee207b396dad14d04b830e5f2ab2d
```

### 已核对的固定权重下载源

2026-09-12 另行使用 `curl --fail --location` 从 custom-models 固定提交
[`4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef`](https://github.com/upscayl/custom-models/tree/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models)
实际下载以下文件。两次下载均返回 HTTP 200，字节数及本地计算的 SHA-256 与上面的制作权重记录完全一致：

- [realesr-animevideov3-x4.param（固定提交原始文件）](https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x4.param)
- [realesr-animevideov3-x4.bin（固定提交原始文件）](https://raw.githubusercontent.com/upscayl/custom-models/4b6d2cfa59c7442af115dfc6e50fd8d7d40b96ef/models/realesr-animevideov3-x4.bin)

可机器读取的来源、固定提交、文件大小和摘要见
[`tools/upscale-model-lock.json`](../tools/upscale-model-lock.json)。这是对公开取得路径的独立核对；不改变历史制作记录，也不将 SHA 当作上游签名。复现时下载这两个同名文件并核对摘要，随后把所在目录传给 `--models`。本仓库仅保存获取记录，未纳入下载的权重文件。

## 先修原图结构

把头发图层单独放在深灰、浅灰与棋盘背景上。实际遇到过“鬓发遮罩顺便切下背带、衣服和黑色腰线”：这些像素跟着头发移动，覆盖身体底图上的完整背带，造成断口。超分把断口变得更清晰，却无法分清哪些像素属于头发。

正确顺序是：确认底层衣服完整 → 重画精确的头发 alpha 外轮廓与内部空隙 → 保留真正的灰色描边和细发丝 → 检查透明层、原分辨率中性位、两侧摆发和头身反向动作 → 再做超分。不要让背带跟随头发或钉死发尾来遮掩错误切片。

嘴部同理：带着一块肤色的嘴贴片在 `MouthSmile × MouthOpen` 联动时容易出现矩形色块。先让嘴周肤色属于脸部底层，嘴层只保留嘴的形状与必要半透明过渡，再检查参数组合。

## 为什么最终超分图集

若导入器仍把 4× PNG 缩回原始图层的 `w/h`，仅替换素材文件并不会提高最终运行时纹理分辨率。另一方面，逐层超分后重新打包又可能改变 UV、遮罩和导出结果。

本 kit 使用修补后的路径：先在原逻辑画布上完成拆层、图集排布与绑定，然后用 **同一布局、同一页数、统一整数倍** 的高清 PNG 替换纹理页。图集像素从例如 2048² 变为 8192²，而逻辑画布、网格位置和归一化 UV 保持不变。补丁还保留原打包尺寸供位置验证使用。

`export_texture_source_sha256` 绑定低清页的精确字节：只要重新拆层、改遮罩或重新打包导致低清页变化，旧超分页就应拒绝注入并重新生成。严禁为了通过检查而把新哈希填进旧超分结果。

包装脚本在推理前把所有低清页固定到输出目录的 `source-atlases/`，RGB 准备和 alpha 合成均读取同一快照，报告记录快照 SHA。全部推理结束后还会检查原图集是否变化；若被另一导出改写，本轮会失败退出、保留 `complete: false` 的诊断报告，并移除 `manifest-hd.json`。此时重新导出与超分到新目录，不复用失败结果。

先规划最终纹理尺寸。包装脚本的 `--max-texture-size` 默认 **8192**，允许配置 1024–16384；这是防止误生成过大纹理的上限，不是自动探测到的 GPU 能力。默认条件下，4× 的低清页每边最多 2048。通用最小样例使用 `atlas_size: 1024`，对应 4096 的高清页；不要把适配器的较大默认页尺寸不加判断地套到所有模型。

若任一低清页在 4× 后超限，脚本会在推理前拒绝。应先调整 `config.atlas_size`，重新导出为更小的低清页，再基于新页布局超分；低清和高清之间仍保持相同页数和布局。只减小 NCNN tile 不会减小最终 PNG；它仅影响推理分块。只有确认最终浏览器/运行时的纹理上限及内存余量后，才提高 `--max-texture-size`，不以最大允许值绕过检查。

## 运行步骤

先按 [setup](setup.md)完成工具安装，并得到通过检查的低清导出目录。以下命令从 kit 根目录运行，路径替换为当前用户工作区：

```sh
bash scripts/upscale-atlas.sh \
  --manifest work/character/manifest.json \
  --export work/character/low \
  --output work/character/upscale \
  --binary /path/to/upscayl-bin \
  --models /path/to/models \
  --model realesr-animevideov3-x4 \
  --max-texture-size 8192

bash scripts/export-model.sh \
  work/character/upscale/manifest-hd.json \
  work/character/hd
```

超分脚本输出新 `manifest-hd.json`；原 manifest 保持不变。生成配置含当前机器的资产绝对路径，属于本地工作产物，不能直接当作跨机器公开模板。

### RGB 和 alpha 分开处理

透明 PNG 的 RGB 背景即使不可见，也会影响神经网络对边缘的预测。`AtlasAlpha.java` 在不修改原 alpha 的情况下，把可见边缘颜色向透明 texel 延伸 32 个原始像素，再把准备后的 RGB 交给 NCNN。超分完成后，原 alpha 独立按整数倍 bicubic 插值并与神经 RGB 合并。

下面是单页低层命令，便于调试；通常使用上面的包装脚本批量处理并记录哈希：

```sh
java -Xmx2g --source 21 scripts/AtlasAlpha.java \
  prepare work/atlas.png work/atlas-rgb.png

/path/to/upscayl-bin \
  -i work/atlas-rgb.png -o work/atlas-rgb-4x.png \
  -m /path/to/models -n realesr-animevideov3-x4 \
  -z 4 -s 4 -t 256 -j 1:1:1 -f png

java -Xmx4g --source 21 scripts/AtlasAlpha.java \
  combine work/atlas.png work/atlas-rgb-4x.png work/atlas-rgba-4x.png
```

`-z/-s` 等参数以本机 CLI 帮助为准；上述组合验证过 Upscayl 2.15.0 附带的二进制，其他 Real-ESRGAN CLI 可能不同。GPU 不兼容或显存不足时先缩小小样/分块；不要悄悄切换成普通插值并报告神经超分成功。

alpha 仍继承原遮罩拓扑，不能凭超分凭空生成缺失细节。32px 颜色延伸也不会修正错误图层归属；图集间距不足时应重新处理排布/边缘，而非接受相邻图层颜色串入。

## 超分后的验收

- 比较每页尺寸、页数、原图哈希、模型权重哈希与日志；检查 uniform 4×，输出 PNG 的 alpha 存在。
- 只改变纹理的导出，低清和高清 `.moc3` 应逐字节一致；若不一致，解释并重新验证几何，而不是笼统声称“坐标没变”。
- 用官方 Core 验证实际高清包；在网页显示同一 MOC3 / 图集，确认服务器、磁盘和 ZIP 文件哈希一致，避免旧缓存。
- 重新查看眼睛完全睁开、接近睁开、半闭和闭眼；嘴笑/张口组合；头身相反的大角度；独立摆发；发根/发尾/背带/颈圈等局部。
- 检查 WebGL 最大纹理尺寸和遮罩缓冲区。高分辨率图集配上低分辨率 clipping mask 仍会出现台阶；本次预览提升到硬件支持范围内的 1024 mask，并重新目视检查。
- 分别记录高清运行时与编辑素材的分辨率。高清 runtime 图集不意味着源 PSD 的所有图层都已成为 4× 可编辑图层；不要把这些产物混为一谈。

最后把实际 runtime 包交给 VTube Studio 用户验收；网页成功不替代其渲染器的结果。
