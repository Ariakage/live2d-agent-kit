# PNG 清单、PSD 输入与坐标约定

本文对应 kit 的 [ManifestExport.kt](../integrations/psd2live/ManifestExport.kt) 与固定版本 psd2live。它说明常用字段和高级选项的适用条件，不是自动拆层或自动测量面部的承诺。复制字段前，先查看当前源码和实际导入预览。

## 两条输入路线

**已有分层 PSD**：先提取可见、非空的光栅图层，再检查生成的 PNG 清单与原 PSD 的外观。

```sh
bash scripts/extract-psd.sh inputs/character.psd work/character/extracted
bash scripts/export-model.sh work/character/extracted/manifest.json work/character/low
```

两个输出目录都应是新目录，或尚无文件的目录。提取器保留读取到的画布尺寸、层名、位置、透明度和层顺序；它会跳过隐藏或空层，不会把 PSD 的完整组结构、混合模式、效果或原有 Cubism 绑定写入 manifest。复杂 PSD 先对照原软件的合成图，不能仅凭“提取成功”认为所有效果都保真。

不同 PSD 组可能包含同名图层，提取器不会自动重命名；本 kit 的 manifest 检查会拒绝重复层名。导出前给每层设置唯一且保留语义的名称，例如 `front hair-inner-r`、`front hair-outer-r`，再核对它们仍被识别为前发和正确左右。不要仅依赖已丢失的组路径区分图层。

**独立透明 PNG 或一张母图拆出的多块区域**：手写 manifest，使用相对它所在目录的路径。将同一坐标系内的素材、遮罩与配置一起纳入修订记录。此处的 manifest 是 kit 的导入配方；导出的 `.model3.json` 是另一种 runtime 引用清单，不能互换。

最小可运行图形样例见 [examples/minimal-model](../examples/minimal-model/)。下面只是说明字段的通用示意，不附带这些图片，也没有包含足以完成一个角色的全部图层：

```json
{
  "name": "MyCharacter",
  "width": 512,
  "height": 768,
  "config": { "atlas_size": 2048 },
  "layers": [
    { "name": "topwear", "path": "parts/body.png", "x": 128, "y": 256, "z": 10 },
    { "name": "face", "path": "parts/face.png", "x": 160, "y": 96, "z": 20 }
  ]
}
```

## 先明确五种坐标

| 坐标 | 原点与单位 | 对应数据 |
| --- | --- | --- |
| 源图 | `path` 指向的完整 PNG 左上角，源图像素 | `source_polygons`、各种 source holes、采样点、`crop` |
| crop 局部 | 裁剪框左上角，缩放前像素 | 去底 `processing` 的种子点；源图点须先减去 crop 左上角 |
| 模型画布 | 顶层 `width/height` 画布左上角，逻辑像素 | 图层 `x/y/w/h`、`face_bounds_override`、眼角/眼睑曲线等绑定测量 |
| atlas | 打包器生成的纹理页左上角，纹理像素 | 打包位置及输出 PNG；不要从源图坐标直接推断 |
| 归一化 UV | 纹理采样坐标，由导出器建立 | 高清替页保留这些值，不能把它们也乘以 4 |

例如源图 crop 为 `[64,32,128,128]`，输出图层放在 `[100,200]`，并缩为 `64×64`，则源图点 `(80,48)` 对应画布点 `(108,208)`。概念映射为：

```text
canvasX = round(x) + (sourceX - cropLeft) × outputWidth / cropWidth
canvasY = round(y) + (sourceY - cropTop)  × outputHeight / cropHeight
```

像素覆盖与重采样还包含像素中心和取整行为，不能用公式代替边缘截图检查。导入器最终去除透明外边时，会把去掉的边距加回层 bounds；不需要手动再补一次位置。

## 实际处理顺序

```text
读完整 PNG
  → 在源图坐标里选择多边形、排除空隙、执行显式底图修补
  → crop
  → 可选纯色背景去底（processing 种子是 crop 局部坐标）
  → 可选去绿
  → scale 或 w/h 缩放
  → 可选清理缩放后的残留绿边
  → 去透明外边并补偿层位置
  → 语义分类、网格与参数绑定、图集排布、导出
```

不要将母图坐标多边形平移到 crop 内再填进 `source_polygons`；那会被错误地执行两次位移。也不要用网页截图像素当源图坐标。

## 常用字段

| 位置 / 字段 | 用途与默认值 |
| --- | --- |
| 顶层 `name` | 输出基名；非字母数字、`_`、`-` 字符会被替换为 `_`，建议直接使用唯一英文基名 |
| 顶层 `width`、`height` | 逻辑画布尺寸；亦支持 `canvas_width`、`canvas_height` 别名，但一份清单统一一种写法 |
| 顶层 `layers` | 非空图层列表。每层至少包含 `name`、`path` |
| 层 `path` | PNG 路径；相对路径相对于 manifest 目录；本地绝对路径可用于工作产物，但不适合分享模板 |
| 层 `x`、`y` | 经 crop/resize 后图层左上角在画布的位置，默认 0，最终取整 |
| 层 `crop` | `[left,top,width,height]`，必须在完整源图范围内；省略时用整张图 |
| 层 `scale` | 默认 1；先算裁剪图的目标尺寸，显式 `w` 或 `h` 分别覆盖对应维度 |
| 层 `w`、`h` | 目标像素宽高，可非等比缩放；与 `scale` 并用容易改变比例，优先只用一种策略 |
| 层 `z` | 默认 0；值越大越靠前。给不同前后关系明确数值，不依赖同值层顺序 |
| 层 `opacity` | 0–1，默认 1；真正全透明的图片会被导入器拒绝 |
| 顶层 `import_only` | 默认 false；true 时只输出导入后的 source PSD、合成预览与切片等检查资料，不生成绑定和 MOC3 |
| 顶层 `config` | 导出/绑定配置；省略时走通用配置。高级 source-pixel 面部配方不会自动启用 |

输入合成验收可先在一个 manifest 修订中启用 `import_only`，检查 `<name>.source-preview.png` 和 `imported-parts/`。转入绑定阶段时将其设为 false，并使用新的输出目录。

## 层名决定行为，左右是角色自身左右

本适配层把 `name` 交给上游 `LayerClassifier`；没有用一个任意 `tag` 字段取代分类。可识别前缀后接明确后缀，如 `front hair-side-r`。优先采用这些已核对的名字：

| 内容 | 层名示例 |
| --- | --- |
| 脸 / 颈部 / 脸部细节 | `face`、`neck`、`face detail` |
| 前发 / 后发 | `front hair-bangs`、`front hair-side-l`、`back hair-r` |
| 眼部 | `eyewhite-l`、`irides-l`、`eyelash-l`、`eye_close-l`、`eyebrow-l`；另一侧用 `-r` |
| 口部 | `mouth_open`、`mouth_close`；按实际素材另加 `tooth-t`、`tooth-b`、`tongue` |
| 衣服与肢体 | `topwear`、`bottomwear`、`handwear-l/r`、`legwear-l/r`、`footwear-l/r` |
| 配饰 / 道具 | `headwear`、`neckwear`、`ears-l/r`、`objects` |

表格中的 `-l/r` 表示分别命名为 `-l` 或 `-r`，不是包含斜杠的字面层名。`-l` 是角色自己的左侧，在未镜像的正面原画中位于画面右侧；`-r` 相反。源码 `ComponentSplitter` 也将画面左半像素分到 `Side.RIGHT`，`RigBuilder` 将 `Side.LEFT` 绑定到 `ParamEyeLOpen`。不要因预览的镜像开关再交换文件名。

名称正确不等于素材正确：`eyelash` 的闭眼变形不能自动分离同一片里的皮肤、刘海和眼白。细发层若带入衣服像素，衣服会跟随发丝；命名、父级和 alpha 必须共同审查。

## 源图遮罩：保留、挖空与填色

所有 `source_*` 遮罩点均在完整 `path` 图片坐标中；`source_polygons` 是多个至少三点的闭合多边形的并集。下面仅演示一个通用矩形选区与矩形空隙：

```json
{
  "name": "objects-test",
  "path": "source/sheet.png",
  "source_polygons": [[[16,16],[144,16],[144,144],[16,144]]],
  "source_alpha_holes": [[[48,48],[80,48],[80,80],[48,80]]],
  "source_mask_antialias": true,
  "crop": [16,16,128,128],
  "x": 200,
  "y": 300,
  "z": 30
}
```

- `source_alpha_holes` **始终减 alpha**，即使同层启用了肤色或头发底图填补，也不会把这些空隙重新填上。它适用于背景透出的发丝缝、装饰孔洞。
- `source_holes` 是可以分配填补方法的孔洞；没有相关填补时会挖空。启用 sample、gradient、fill image 或 skin base 后，部分孔洞会改为底图修复区域。因此不能在已有肤色填补的层里把所有背景空隙都写成 `source_holes`。
- 未显式使用颜色过滤或填补时，遮罩选择保留源 RGB，只改 alpha。它不是图像语义分割器；边界仍需人工/agent 对照母图测量。
- `source_mask_antialias` 默认 false；true 使用 4×4 子像素覆盖来平滑 alpha。硬切适合需要像素级互补拼回的区域；细线边缘可试 AA，但相邻半透明层叠加仍需检查。
- `source_mask_feather` 默认 0，以源图像素计，沿选择外边界**向内**衰减 alpha，不向外模糊 RGB。它不能补出缺失底图；细发丝可能被过大羽化削掉。孔洞边缘不是这项外边界羽化的目标。
- `source_polygons_expand`、`source_holes_expand` 都是非负的向外扩展；后者会扩大被排除/填补区域。`source_hole_expansions` 按索引为各个 `source_holes` 增加扩展量。不存在把负值当作收缩的约定。
- `source_alpha_fade_y: [opaqueY, transparentY]` 可在源图 Y 方向做渐隐，适合已有足够重叠底图的接缝，不应在背景上凭空制造淡边。

AA、expand、fade 等修饰选项应搭配显式 `source_polygons` 或孔洞选择使用。当前导入器只在发现遮罩/填补入口字段时进入源图遮罩分支，不能依赖单独写 `source_mask_antialias` 就处理整张 PNG。

## 隐藏部分补全与肤色贴片

先选择一个可解释的局部方法；不要默认给每层加修补字段。

| 方法 | 何时使用 | 必须检查 |
| --- | --- | --- |
| `source_hole_fill_sample: [x,y]` | 被遮挡区域色彩平坦，可由一个明确源图像素近似 | 该点是整数源图坐标；填色是否在运动后显露为色块 |
| `source_hole_fill_gradients` | 小片底色存在平滑渐变，能指定孔洞索引与四个真实采样位置 | 周围线条、阴影是否进入采样；不要把渐变当作复杂纹理补画 |
| `source_hole_fill_image` | 已有干净、补全过的底图，需要在声明的孔洞中取其 RGB | `path` 的 `source_rect` 映射到模型 `canvas_rect`；孔洞仍是当前原图坐标；只在所选 footprint 内修补并保留原 alpha |
| `source_skin_patch` | 需要把嘴等细线从周围肤色中分开，避免移动一个不透明肤色矩形 | `base` 与 `feature` 必须引用同一源图和同一矩形边界；先检查重建误差，再测嘴形/张口联动 |

`source_hole_fill_image` 可指定 `hole_indices`、`feather_px` 和显式 `despill_green`；其去绿同样默认 false。不同于普通 `crop`，`canvas_rect` 在最终逻辑画布上，导入器会反算回本层源图的修补范围。它保留原 alpha，因此不会自动把原本透明、缺失的皮肤变成完整底图。

`source_skin_patch` 的 `rect` 是完整源图里的 `[left,top,width,height]`，还需要可读取的四边像素。`mode: "base"` 通过 `hole_indices` 在底层重建边界匹配的肤色；`mode: "feature"` 提取该矩形内的前景细线并消除外围肤色，`contrast_floor` 控制低对比内容阈值。这个方法适合小的连续底色区域，不能盲用于复杂眼影、纹理或大面积补画。

颜色过滤 `source_color_filter`、`source_hole_color_filters` 是更高级的局部筛选手段。使用前应查看实现支持的过滤器类型、指定窄小区域，并检查是否误伤真实灰线/高光；不要靠全局“白色删除”来扣白发。

## 原生透明与绿幕输入

优先用已有正确 alpha 的 PNG，不填 `solid_background`。只有实际使用纯色背景素材时，才在层或顶层设置例如 `solid_background: "#00FF00"`，并根据局部问题设置 `background_tolerance`、`processing` 和可选 `auto_seed_matte`。

`processing.background_points` 等种子属于 **crop 后、scale 前** 的图片坐标。`processing.edge_width` 是去底处理提示，和 `source_mask_feather` 的源图选区羽化不是一回事。

**本 kit 的 `green_despill` 默认 false，且只在该层显式设为 true、背景为 `#00FF00` 时启用。** 有真实绿色的角色不要套用。`neutral_green_despill` 只是选择去绿算法，不会开启去绿；它可来自层或顶层。旧角色的去绿设置不能成为新角色的全局默认值。

## 高级绑定配方需重新测量

通用输入先省略下面的选项。导出一版，核对脸型、中性姿态与图层分配，再为明确问题选择配方。除每层的 `parent_deformer` 外，下表字段都放在顶层 `config` 对象里。

| 配方 / 主要字段 | 采用条件 |
| --- | --- |
| 保留源像素：`preserve_source_raster`，别名 `source_pixel_head` | 已有用户确认的脸，准备以原图像素细分面部；它不自动抠出五官或隐藏层。默认 false |
| 画布脸框：`face_bounds_override` | 实际脸区与自动推测不符；填写新角色画布里的脸框，不能把包含长发的整层 bounds 当脸 |
| 独立闭眼：`source_closed_eyes`、左右 `source_eye_corners_*` / `source_closed_eye_corners_*` | 已制作完整闭眼睫毛层，并测出开眼/闭眼端点；坐标均为最终逻辑画布像素 |
| 连续闭眼：`source_continuous_lid`、`source_open_eye_curve_l/r`、`source_eye_closure_depth`、`source_lid_open_thickness` | 端点闭合已正确，需要进一步修眼角连续性和接近睁眼时的厚度；每侧需要自己的曲线与采样。不是任意脸的自动检测开关 |
| 面部与头身幅度：`head_strength`、`head_roll_strength`、`body_strength`、`hair_follow_strength`、`initial_head_angle_z` | 控制已确认配方的动作幅度，先小角度再扩大；不应靠降低幅度掩盖切片带入衣服 |
| 独立发丝：`independent_hair_physics`、`hair_swing_strength` | 每根图层 alpha 与根部连接已正确，需要独立摆动；默认不开启 |
| 领带：`tie_physics`、`tie_swing_strength` | 素材确为长条领饰；适配器会筛选长宽比大于 2 且名字以 `neckwear` 开头的图层，别把长发误命名成领饰 |
| 嘴形：`cute_mouth_form`、`mouth_outline` | 已有合适口部素材；检查嘴形和张口二维网格，再组合转头，不能只测单个滑块 |
| `parent_deformer` | 确定需要重设父级，且查询过实际生成的 `Deform...` 名称；不要凭命名猜父级或用它修错误 alpha |

`source_pixel_shallow_blink` 虽有默认值，也不意味着省略整套 source-pixel 配方时自动测量眼睛。所有眼角、曲线、肤色修补矩形、发丝边界都属于每个新角色的测量资料，应保存来源截图和诊断结果，不要复用某个旧角色的数字。

高清相关 `config.export_texture_pages`、`config.export_texture_source_sha256` 应由 [超分流程](upscaling.md)根据当前低清导出生成。改变 crop、mask、z、名字或绑定配置后先重新导出并验证，不继续使用旧图集哈希。
