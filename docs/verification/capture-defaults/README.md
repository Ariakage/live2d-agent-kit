# Capture defaults regression

On 2026-09-13 (Asia/Shanghai), the updated preview template loaded the public Pink Sakura HD runtime with its original configuration. The generated `captureHoldDefaults` value was `[]`.

- [Web regression](web-smoke.json): 22 checks passed, zero warnings/errors, zero camera requests. The report records actual browser response hashes, Core/WebGL identity and visible parameter bindings.
- [Parameter ownership](default-ownership.json): neither the capture controller nor its generated configuration held extra parameters. `ParamEyeBallForm` retained a nonzero native physics output while simulation ran; hair and neckwear physics were not claimed by capture.
- [Summary and source identities](summary.json): the exact tested template/script hashes, browser version and model/atlas hashes. The prepared page used those unchanged source files.

This was a synthetic-input WebGL regression. It did not open a camera or repeat the complete pose-image matrix. Nonempty hold profiles are covered by `tests/test_capture_controller.cjs`; other models need their own visual and physical-device checks. The earlier [physical-camera report](../camera-tracking.json) continues to identify its `7f391f4` source snapshot.

These three reports are byte-identical copies of the local test output. Their loopback URL records a temporary service that was stopped after testing.

| Report | SHA-256 |
| --- | --- |
| `summary.json` | `f63658d5c1db6946f8785b90ff93fe45230c6ff3cfa70d83a8e494dcd6ea17a1` |
| `default-ownership.json` | `e14099c09a792a0fd2c081f2330063b086a2a737c309d372b45331cdf0d365a5` |
| `web-smoke.json` | `69e1880f5f6d644dacbdf97bd52b40a51bd8f0d2fafa040113acf451de62ecaa` |
