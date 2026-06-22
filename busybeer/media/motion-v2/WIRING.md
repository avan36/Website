# motion-v2 — looping UI-motion clips

Three new looping clips for the busy beer marketing site, matching the visual
language of the existing `marketing/web/motion/` clips (`flavor-fill.mp4`,
`match-rank.mp4`, `phone-loop.mp4`). Same brand field, indigo `#5856d6` accents,
white grouped cards, system SF type, and seamless loops.

All clips are deterministic frame captures — the scene HTML exposes
`window.renderFrame(t)` (t ∈ [0,1) loop progress) and is rendered with
headless Chrome, then encoded with ffmpeg. They are reproducible:

```sh
cd marketing
# render frames (deviceScaleFactor 2 → output is 2× the CSS size)
node tools/render-motion.mjs discover-rate.html 1080 1080 120 /tmp/fr-discover
node tools/render-motion.mjs beyond-beer.html   1080 1080 120 /tmp/fr-beyond
node tools/render-motion.mjs story-reveal.html  1080 2160 120 /tmp/fr-story
# encode (squares ~CRF 28, taller phone clip ~CRF 30)
ffmpeg -y -framerate 30 -i /tmp/fr-discover/%04d.png -c:v libx264 -pix_fmt yuv420p \
  -movflags +faststart -crf 28 -vf "scale='trunc(iw/2)*2':'trunc(ih/2)*2'" \
  web/motion-v2/discover-rate.mp4
# (beyond-beer same; story-reveal uses -crf 30)
```

Scene HTML lives in `marketing/generators/motion/`, the render script in
`marketing/tools/render-motion.mjs`.

---

## 1. discover-rate.mp4

- **File:** `discover-rate.mp4` (+ `discover-rate.jpg` poster)
- **Dimensions:** 1080×1080, 4s, 30fps loop (encoded ~94 KB)
- **What it shows:** A white "Discover" diary card with four real Discover rows
  (Zombie Dust 8, Summer Shandy 7, Spaten Optimator 7.2, Pale Ale 6.5 — pulled
  from `screens/discover.png`). The rows are always present; the 0–10 score pills
  stamp in one-by-one with a count-up and a small overshoot pop (green ≥7, amber
  4–6.x — matching the app's `scoreColor`), then fade back out so the loop is seamless.
- **Where it goes:** The bento card **"Every pour, remembered"**, currently using
  the static `media/shots/discover.png`. Replace/augment that static screenshot
  with this clip (poster = `discover-rate.jpg`).
- **Suggested caption:** *Rate every drink — your palate remembers.*

## 2. beyond-beer.mp4

- **File:** `beyond-beer.mp4` (+ `beyond-beer.jpg` poster)
- **Dimensions:** 1080×1080, 4s, 30fps loop (encoded ~134 KB)
- **What it shows:** A white "Beyond beer" card. First your beer flavor bars fill
  (Hoppy 82, Malty 64, Roasty 71 — the flavor-axes language). Then the category
  chips **Wine / Cocktails / Spirits** light up indigo one-by-one, and a second
  "Translated for you" set of mini-bars morphs in beneath (Bold reds / Bitter &
  dry / Peated malt), each tinted to its category. Holds, then eases back to empty.
- **Where it goes:** The bento card **"Beyond beer"**, currently using the static
  `media/shots/categories.png`. Replace/augment that screenshot with this clip
  (poster = `beyond-beer.jpg`).
- **Suggested caption:** *Your beer palate, translated to every other drink.*

## 3. story-reveal.mp4

- **File:** `story-reveal.mp4` (+ `story-reveal.jpg` poster)
- **Dimensions:** 1080×2160 (phone-shaped, dark-titanium frame on the brand
  field), 4s, 30fps loop (encoded ~574 KB — larger because it is a full-bleed
  retina phone clip with rich gradients; still far smaller than the existing
  `phone-loop.mp4` at 2.3 MB)
- **What it shows:** The Wrapped "Taste, distilled" story. Three full-bleed
  gradient story cards cross-fade (≈0.5s easeInOut, the app's transition), with a
  segmented progress bar filling the active segment:
  1. **The Connoisseur** — deep purple→indigo critic card (`story-critic.png`)
  2. **That's your taste, so far** — plum recap panel (5 drinks · Beer · citrus ·
     The Connoisseur) (`story-summary.png`)
  3. **Your flavor fingerprint** — dark green card, citrus / fruity / bitter /
     hoppy (`story-flavors.png`)
  The last card cross-fades back to the first, so the loop is seamless.
- **Where it goes:** The **story showcase** section, currently using the static
  `media/shots/story-*.png` screenshots. Use this clip as the animated hero of
  that section (poster = `story-reveal.jpg`, which shows the recap card).
- **Suggested caption:** *Your taste, distilled — a little Wrapped for everything you've poured.*

---

## Quality notes

All three were self-verified by extracting frames across the timeline and at the
loop wrap:
- **discover-rate / beyond-beer** loop cleanly — end state equals start state
  (empty pills / empty bars), no jump at the wrap.
- **story-reveal** cross-fades are symmetric at every boundary including the
  card-3→card-1 wrap (verified the per-card opacities sum to ~1 throughout), so
  there is no black flash at the loop point. MP4 gradients are smooth with no
  visible banding at CRF 30.

No clips were compromised; all three match the polish of the existing
`flavor-fill.mp4` / `match-rank.mp4`.
