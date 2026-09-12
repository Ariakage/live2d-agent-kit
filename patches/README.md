# Tested engine patch (GPL-3.0-only)

Apply only to psd2live commit `5526f2e16b57e5f83d34f33730d6fa26d8bc8695`.
The original GPL-3.0 license and notices still apply. The patch changes mesh
sampling for small features, source-pixel face/eye handling, head/body hair
attachment, atlas extrusion and checked high-resolution texture injection.
The new `TextureOverride.kt` keeps UV packing dimensions separate from exported
texture dimensions and rejects stale source-atlas SHA-256 values.

These are tested additions for this workflow, not a claim that upstream HEAD
already has identical behavior. Use `scripts/setup-psd2live.sh`; it refuses an
unexpected checkout rather than resetting or overwriting user changes.
