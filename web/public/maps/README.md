# CS2 map card tiles

Served at `/maps/<map_id>.jpg` and referenced by `games.available_maps[].image_url`
(set for the standard CS2 pool by migration `0093_cs2_map_thumbnails.sql`).
`GameMapCard.vue` renders them at `height=80` with `cover` and overlays the map
name at the bottom.

## What they are

Each tile is 640×360 (16:9, comfortably above the render size so they stay sharp
on retina and in the larger map-pool picker):

- the map's **official in-game thumbnail** — the screenshot Valve ships in the
  game depot, so the scene is the one players recognise;
- the map's **official icon badge**, right of centre;
- a bottom scrim, because the card writes the map name in white and several of
  these scenes (Dust II, Mirage) are near blown out.

Composition keeps the badge vertically centred: `cover`-cropping a 16:9 source
into an 80px-tall card eats roughly the top and bottom sixth, so anything placed
near an edge gets clipped.

JPEG rather than PNG — these are photographs, and PNG made them roughly ten
times larger for no visible gain. ~45 KB each, ~320 KB for the set.

## Provenance

Source assets come from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons),
which scrapes icons, radar overheads, in-game thumbnails and overview data
straight from the CS2 game depot on every Valve update:

| Asset | Path in that repo |
| --- | --- |
| Thumbnail (used here) | `images/thumbs/<map>_png.png` |
| Icon badge (used here) | `images/<map>.png` |
| Radar overhead | `images/radars/<map>_radar_psd.png` |
| Index of all of the above | `data/available.json` |

The underlying artwork is Valve's; that repository publishes no licence of its
own. Assets are vendored here rather than hotlinked so the site does not depend
on a third-party CDN at render time.

Replace or remove them freely: `image_url` is per-map and admin-editable through
the game config dialog, so pointing a map at different art is a UI change, not a
code change.

## Regenerating

Needs `gh` and `uv`. Fetch `data/available.json` for the badge paths, pull
`images/thumbs/<map>_png.png` per map, cover-fit to 640×360, composite the badge
thumbnailed to 96px at `x = W - 96 - 26` and vertically centred, apply a 150px
bottom scrim ramping to ~65% black, and save as progressive JPEG at quality 82.
