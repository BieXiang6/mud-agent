---
name: adapt-app-layout
description: Adapt this MUD client's appearance and layout across Electron PC and uni-app mobile runtimes. Use when the user asks for desktop/mobile compatibility, responsive density, safe backgrounds, readable scaling, wide-screen constraints, touch-friendly controls, or cross-platform review of an application style. 重新进入app生效。
---

# Adapt App Layout

Adjust application style without assuming PC-only CSS or mobile-only dimensions.

Loading this Skill enables the appearance tools for the current AI task. The Skill and tools remain active across later turns; do not load it again.

## Workflow

1. Call `get_app_style` and inspect `capabilities.platform`, `formFactor`, viewport, safe area, and feature flags.
2. Preserve the user's visual direction while adjusting only layout, typography, effects, and background behavior needed for compatibility.
3. Use portable values first. Apply shared decisions with `mode=both`.
4. Call `configure_app_style` once with the smallest coherent patch.
5. Explain any platform fallback, especially fixed backgrounds and backdrop blur, and always tell the user “重新进入app生效”.

## PC Guidance

- Use `contentMaxWidth` when long lines or controls stretch excessively on wide windows.
- Allow slightly higher density only when controls remain readable.
- Use `attachment=fixed` only when `supportsFixedBackground` is true.
- Use backdrop blur only when supported; keep an opaque-enough surface fallback.
- Accept absolute image file paths only for PC-specific local backgrounds.

## uni-app Guidance

- Keep touch controls comfortably sized; do not make `controlHeight` or density aggressively compact.
- Prefer `attachment=scroll` because fixed background behavior varies across WebViews.
- Use app-relative assets, HTTPS images, data images, or raw self-contained SVG.
- Account for narrow screens and safe areas. Avoid a restrictive `contentMaxWidth` on mobile.
- Treat backdrop blur as optional decoration and rely on `panelOpacity`, surface colors, and overlays for readability.

## Cross-platform Background Rule

Support both image and SVG in the page background, general component slots, and named block slots such as `chat`, `dialog`, `aiPanel`, and `aiConversation`. Named blocks inherit the general `panel` slot until explicitly configured. Set a fallback color and contrast overlay for either format. For SVG, use raw markup with a `viewBox` so it scales across PC and mobile aspect ratios.

Read [references/compatibility.md](references/compatibility.md) for the capability matrix and safe defaults.
