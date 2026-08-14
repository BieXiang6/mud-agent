# Style field reference

## Semantic colors

| Field | Use |
|---|---|
| `background` | Page base when no custom background overrides it |
| `surface` | Cards, rows, and primary panels |
| `surfaceRaised` | Top bars, dialogs, and elevated regions |
| `surfaceMuted` | Secondary regions and subdued controls |
| `border` | Dividers and control outlines |
| `text` / `textMuted` | Primary and secondary copy |
| `primary` / `primaryHover` / `primaryContrast` | Main actions and text displayed on them |
| `danger` / `success` / `warning` | Semantic status accents |
| `overlay` | Modal mask |
| `inputBackground` / `codeBackground` | Editable fields and code/technical output |

Use CSS colors only: hex, rgb/rgba, hsl/hsla, `transparent`, or `currentColor`.

## Other groups

- `typography`: `fontFamily`, `fontSizeOffset` (-8 to 16 rpx), `lineHeight` (1 to 2.2).
- `shape`: `radiusSmall`, `radiusMedium`, `radiusLarge`, `borderWidth`.
- `layout`: `density`, `pagePadding`, `contentMaxWidth`, `controlHeight`.
- `effects`: `panelOpacity`, CSS `shadow`, and `backdropBlur`.
- `background`: page background with `type`, `source`, `fallbackColor`, `size`, `position`, `repeat`, `attachment`, and `overlay`.
- `backgrounds`: every slot accepts the same fields and independently supports `image` or `svg`.
  - General slots: `header`, `panel`, `dialog`, `primaryButton`, `secondaryButton`, `input`, `aiSummary`, and `quickEntry`.
  - Game blocks: `chat`, `commandPanel`, `aiPanel`, `quickPanel`, `aiContent`, and `statusPanel`.
  - AI sub-blocks: `aiTools`, `aiTaskDrawer`, `aiConversation`, and `aiComposer`.
  - Settings/content blocks: `profiles`, `form`, `skillList`, `accountCard`, `notice`, `intro`, `guide`, and `security`.
  - Login dialogs: `announcementDialog` and `helpDialog` (`dialog` controls the in-game protocol dialog).
  - Named blocks inherit `panel` until explicitly configured, so a general panel theme continues to affect them. `aiSummary` and `quickEntry` retain their product defaults until explicitly or indirectly customized.

To remove only selected block overrides, pass their names in `reset_app_style.backgroundSlots`. This restores inheritance from the general slot without resetting other backgrounds.

## Contrast starting points

- Dark: text `#eef2f5`, surface `#131a20`, background `#090c0f`, border `#34414c`.
- Light: text `#27312c`, surface `#f4eedf`, background `#e6dcc3`, border `#9b927d`.
- Place white text on a primary color only when the primary is sufficiently dark.
