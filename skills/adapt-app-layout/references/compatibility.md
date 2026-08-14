# Compatibility reference

| Capability | Electron PC | uni-app mobile |
|---|---|---|
| HTTPS/raster background | Supported | Supported |
| Raw SVG background | Supported | Supported in app WebView |
| Absolute local path | Supported and converted to `file:///` | Avoid; use app-relative or platform sandbox paths |
| Fixed background | Supported | Falls back to scroll behavior on some WebViews |
| Backdrop blur | Detect at runtime | Treat as unsupported |
| Wide content cap | Useful on large windows | Usually leave disabled |

Safe shared defaults:

- `density`: 0.9–1.05
- `controlHeight`: at least 54 rpx
- `lineHeight`: 1.4–1.7
- `attachment`: `scroll`
- `background.size`: `cover`
- Always provide `background.fallbackColor` and a contrast-preserving `background.overlay`.
