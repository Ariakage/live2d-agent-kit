# 通用最小模型

这是 MIT 许可的原创几何测试角色，验证图层→PSD/CMO3/MOC3→真实运行时链路，
不代表成品美术质量，也不使用原对话中的角色图片。生成物写入忽略的 `work/`。
使用 512×768 逻辑画布、1024×1024 图集；做 4× 超分后纹理为 4096×4096，逻辑坐标不变。
实际链路检查结果见 [复现记录](../../docs/verification.md)。

从仓库根目录运行（先按 setup 配置 JDK 21）：

```sh
java --source 21 examples/minimal-model/GenerateExample.java work/minimal/assets
bash scripts/validate.sh --manifest work/minimal/assets/manifest.json
bash scripts/setup-psd2live.sh
bash scripts/export-model.sh work/minimal/assets/manifest.json work/minimal/low
bash scripts/validate_core.sh work/minimal/low/Minimal.moc3 work/minimal/core-report.json
bash scripts/validate.sh --model work/minimal/low/Minimal.model3.json --core-report work/minimal/core-report.json
```

最后两步需要用户已有的官方 Java/native Core，并设置 `CUBISM_CORE_DIR`。
没有 Core 时仍可进行素材及文件结构检查，但不得标为原生验收通过。
重新运行时使用新输出目录，避免混用旧纹理或模型。

用自己的分层图替换几何素材后，需要重新测量位置、拆层和参数范围。
不要把本示例的坐标或默认绑定当作所有人物适用的模板。
