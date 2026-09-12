# License scope and attribution

The root MIT license covers this kit's original documentation, prompts,
standalone scripts and web UI code, except where a file or directory says otherwise.
It does not relicense upstream projects, SDKs, model weights or user artwork.

| Component | Treatment in this repository |
| --- | --- |
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

This project is not affiliated with Live2D Inc.
