# License scope and attribution

The root MIT license covers this kit's original documentation, prompts,
standalone scripts and web UI code, except where a file or directory says otherwise.
It does not relicense upstream projects, SDKs, model weights or user artwork.

| Component | Treatment in this repository |
| --- | --- |
| `assets/readme/banner.png` | User-requested header illustration derived from Pink Sakura with built-in Imagegen. Its [source record and CC BY 4.0 terms](assets/readme/README.md) are separate from the root MIT code/document license. |
| `examples/pink-sakura/` named artwork and runtime assets | User-authorized inclusion for this example only; [CC BY 4.0 asset scope](examples/pink-sakura/LICENSE.md) and [image/model provenance](examples/pink-sakura/ATTRIBUTION.md). Recipe code and original documentation remain MIT. The original reference's ChatGPT Image2.5 attribution is user supplied, not independently verified; later generated underpaintings have a separate source record. |
| `patches/psd2live-agent-kit.patch` | Changes against tsunehimatoi/psd2live at `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`; contains GPL upstream context; distributed under GPL-3.0-only. |
| `integrations/psd2live/*.kt` | Kit integration compiled with the GPL engine; distributed under GPL-3.0-only, not the root MIT license. |
| psd2live | Downloaded to an ignored local cache; retain its original LICENSE and notices. No upstream binary or sample artwork is committed here. |
| Upscayl / upscayl-ncnn | External AGPL-3.0 tools; not bundled or relicensed. |
| Real-ESRGAN / anime weights | External acquisition only; Real-ESRGAN is BSD-3-Clause. Check the actual weight author and distribution notice, particularly for custom models. |
| Live2D Cubism Core, Framework and sample data | Not included. Core is proprietary; Framework has the Live2D Open Software License. Sample artwork has separate conditions. Obtain required components from their official distributions and retain their notices. |
| PixiJS / pixi-live2d-display | Not vendored; external MIT dependencies. The Cubism bundle also contains Framework code with separate Live2D terms. |
| CLI-Anything / CubismExternalEditMCP | Linked and evaluated only, not bundled. See the version-specific license notes in `docs/tooling.md` and `mcp/README.md`. |

The complete GPL text for the integration and patch is in
[third_party/GPL-3.0.txt](third_party/GPL-3.0.txt). Upstream authors retain copyright
in original source. The patch is a modification, not an official upstream release.

References: [psd2live license](https://github.com/tsunehimatoi/psd2live/blob/5526f2e16b57e5f83d34f33730d6fa26d8bc8695/LICENSE),
[Upscayl license](https://github.com/upscayl/upscayl/blob/main/LICENSE),
[Real-ESRGAN license](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE),
[Cubism Framework license](https://github.com/Live2D/CubismWebFramework/blob/develop/LICENSE.md).

The Pink Sakura exception does not authorize including any previous private character,
unrelated user artwork, SDK, application binary or upscale model weights. Public runtime
assets use their own listed license; licensing those assets does not relicense their tools.

This project is not affiliated with Live2D Inc.
