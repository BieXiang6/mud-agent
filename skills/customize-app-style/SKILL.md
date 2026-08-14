---
name: customize-app-style
description: Customize this MUD client's visual appearance through AI, including colors, typography, spacing, density, corners, borders, shadows, panel transparency, and general or per-block image/SVG backgrounds. Use when the user asks to design, restyle, theme, beautify, personalize, preview, or reset the application's UI on PC or uni-app. 重新进入app生效。
---

# Customize App Style

Create coherent, readable application themes with `get_app_style`, `configure_app_style`, and `reset_app_style`.

Loading this Skill enables its appearance tools for the current AI task. The Skill and tools remain active across later turns; do not load it again.

## Workflow

1. Call `get_app_style` before changing anything. Inspect the active mode, current overrides, editable fields, viewport, and platform capabilities.
2. Infer a complete visual direction from the user's request. Ask only when a missing preference would materially change the result.
3. Apply one coherent patch with `configure_app_style`. Prefer semantic color roles over isolated values.
4. Preserve contrast between `text`/`textMuted` and `background`/`surface`. Keep controls distinguishable through `primary`, `border`, and focus/hover colors.
5. For typography, shape, layout, or effects intended to be shared, use `mode=both`. Configure separate dark and light palettes when appearance should follow the theme toggle.
6. Summarize the visual direction and every significant change. Always tell the user “重新进入app生效”. Offer `reset_app_style` as the reversible fallback.

## Backgrounds

- Use `background` for the page. Use the general `backgrounds.panel` slot to style all panel-like regions together, or a named `backgrounds` block slot such as `chat`, `dialog`, `aiPanel`, or `aiConversation` to change only that region. Named block slots override the general panel style only when explicitly configured; otherwise they keep inheriting it.
- General component slots are `header`, `panel`, `dialog`, `primaryButton`, `secondaryButton`, `input`, `aiSummary`, and `quickEntry`. Per-block slots are listed in `get_app_style.editableFields.backgrounds` and in the field reference. Every slot supports the same image and SVG formats. `aiSummary` and `quickEntry` retain their product defaults until a related style or their dedicated background slot is explicitly customized.
- Use `type=image` with an HTTPS URL, relative app asset path, supported data URL, or PC absolute file path.
- Use `type=svg` with complete raw `<svg>...</svg>` text. Keep SVG self-contained: no scripts, event handlers, `foreignObject`, or external references.
- Always set `fallbackColor`. Use `overlay` when the background may reduce text contrast.
- Prefer `attachment=scroll` for uni-app. Use `fixed` only when capabilities report support.
- Use `size=cover` for artwork, `contain` for a complete motif, and `repeat` for seamless patterns.
- To undo only one block override without disturbing general backgrounds, call `reset_app_style` with `backgroundSlots` and omit `sections`.

## Design Rules

- Change related surfaces together: background, surface, raised surface, input, code, border, and overlay.
- Keep body text comfortably readable; avoid extreme font offsets and line heights.
- Use panel opacity below 1 only with a background and sufficient overlay/contrast.
- Keep density near 1 unless the user explicitly wants compact or spacious UI.
- Use `contentMaxWidth` to control very wide PC layouts; keep `0` for edge-to-edge layouts.
- Never place CSS declarations, `url(...)`, scripts, or HTML in color/effect fields.

Read [references/style-fields.md](references/style-fields.md) when choosing exact fields or constructing a complete palette.
