# Combat Comic SFX Prompt Pack

## Purpose

This pack defines one image-generation prompt per combat word sprite. The
sprites supplement the existing 3D projectile and result effects with short,
camera-facing comic punctuation.

The visual direction follows `docs/visual-style-guide.md`: original adult
animated neo-noir, high-contrast painted-comic surfaces, ink-like contours,
painterly roughness, selective halftone and hatch texture, and controlled
cyan, magenta, amber, red, and cold-white accents over a dark base.

## Runtime Map

| Asset | Animation role | Gameplay meaning |
| --- | --- | --- |
| `comic-sfx-pew.png` | Projectile launch / early flight | Light, fast shot |
| `comic-sfx-thoom.png` | Projectile launch | Heavy shot variation |
| `comic-sfx-fwoosh.png` | Mid-flight arc | Fast projectile travel |
| `comic-sfx-zip.png` | One-frame flight accent | Extreme speed / pass-by |
| `comic-sfx-krak.png` | Primary hit result | Replaces the plain `HIT` label |
| `comic-sfx-blam.png` | Alternate hit result | Hit variation |
| `comic-sfx-boom.png` | Heavy impact result | Strong hit variation |
| `comic-sfx-splash.png` | Miss result | Replaces the plain `MISS` label |
| `comic-sfx-kaboom.png` | Sunk result | Replaces the plain `SUNK` label |

Recommended result mapping:

- `hit`: use `KRAK!` by default; occasionally select `BLAM!` or `BOOM!`.
- `miss`: use `SPLASH!`.
- `sunk`: use `KABOOM!`.

## Output Rules

- Generate exactly one isolated word sprite per prompt.
- Preserve the exact requested spelling and punctuation.
- Use a transparent RGBA background with generous uncropped padding.
- Source size: 1536x768 for flight words, 1024x1024 for impact words.
- Runtime target: 512 px wide for flight words and 384 px for impact words,
  compressed to transparent WebP and ideally under 100 KB each.
- Keep the lettering readable when displayed at 96-180 px on a portrait phone.
- Use a thick near-black ink contour so every sprite survives over bright VFX.
- Do not add a speech bubble, rectangular card, UI panel, scene, ship, or water
  background. The word and its attached motion/impact marks are the full asset.
- Generate the family with the same model, seed family, contour weight, and
  texture treatment when the image tool supports those controls.

## Animation Notes

- Flight words should face the camera, follow beside the projectile, and live
  for roughly 0.15-0.4 seconds.
- Hit and miss words should pop at the attacked cell for roughly 0.45-0.8
  seconds.
- `KABOOM!` may remain for roughly 0.9-1.3 seconds during the sunk sequence.
- Favor stepped scale and opacity changes over smooth floating motion.
- Avoid covering more than roughly a 3x3 cell area at the largest frame.

## Typography QA

Image generators often corrupt lettering. Reject an output if it has a wrong
letter, missing exclamation mark, duplicated glyph, extra word, watermark, or
cropped outline. If exact text remains unreliable, preserve the generated
burst and texture as reference, then redraw the lettering manually while
matching its ink weight and painterly breakup.

## Prompt Files

- `prompts/01-pew-flight.md`
- `prompts/02-thoom-launch.md`
- `prompts/03-fwoosh-flight.md`
- `prompts/04-zip-speed.md`
- `prompts/05-krak-hit.md`
- `prompts/06-blam-hit.md`
- `prompts/07-boom-impact.md`
- `prompts/08-splash-miss.md`
- `prompts/09-kaboom-sunk.md`
