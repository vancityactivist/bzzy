# bzzy brand

The mark is bzzy's four status colours as dots on a rounded tile, next to a lowercase "bzzy" wordmark set in Geist SemiBold.

| File | Use |
| --- | --- |
| `bzzy-mark.svg` | The mark on a dark tile. It's the favicon and the default. |
| `bzzy-mark-light.svg` | The mark on a white tile, for light backgrounds. |
| `bzzy-mark-square.svg` | Full-bleed square with no corners or border, for app icons the OS rounds itself (iOS, maskable). |
| `bzzy-lockup-dark.svg` | Mark + wordmark for dark backgrounds. |
| `bzzy-lockup-light.svg` | Mark + wordmark for light backgrounds. |

The wordmark in the lockups is outlined, so the files don't need the font installed. Geist is under the SIL Open Font License.

## Geometry

All sizes are on a 64 × 64 grid.

- Tile: 64 × 64, corner radius 15, 1.5 hairline border (white at 14% on dark, black at 14% on light).
- Dots: radius 6.75, centred at 20.5 and 43.5 on both axes.
- Dot order, reading left to right and top to bottom: free `#16a34a`, busy `#dc2626`, do not disturb `#7c3aed`, away `#ea580c`. These are the app's status colours. Always use all four, in this order.
- Lockup: the tile is as tall as the "b"'s ascender, and their bottoms sit on the baseline. The gap between them is 20 units, and the tracking is -0.03 em.

## In the code

- `app/src/components/brand.tsx` (`BzzyMark`) is the inline mark. It takes its tile colours from `--mark-tile` and `--mark-line`, falling back to the app's `--card` and `--line-strong`, so it follows light and dark mode.
- `app/src/app/icon.svg`, `favicon.ico` (16, 32 and 48 px) and `apple-icon.png` (180 px) are the browser and home-screen icons.
- `app/public/logo.png` (512 px) is the logo in the site's structured data.

The mark was explored with Runway image generation in November 2026 and then redrawn by hand as vectors. Every round is in the project files under `logo/`.
