# Game art provenance — October 2026

The Hill catalogue contains 570 answer references across 57 topics, plus a local thumbnail for every topic. The authoritative per-image source, original image URL, ownership note and local file are in `public/hill-art-official/manifest.json`. Product packaging, film artwork, character images and photographs remain the property of their respective creators. A source credit does not transfer copyright or imply that every reference is royalty-free. Contextual references are marked `illustrative` where applicable; replicas and promotional material are not presented as screenshots.

Downloaded references are served locally, so an external host becoming slow or refusing hotlinks cannot interrupt a round. Images are resized without stretching and displayed with `object-fit: contain`. Missing artwork has a readable fallback. `node scripts/audit-game-assets.cjs` decodes and checks every answer image; the Hill test also requires all 57 topic thumbnails.

## Original environment illustrations

`public/stage-art/haunted-{hall,library,kitchen,cellar,garden,tower,crypt,attic,conservatory,ballroom}.webp`, `vault-room.webp` and `split-stage.webp` were generated specifically for this product. Game text, vote labels, numbers, routes and results remain real HTML rather than baked into the images.

The haunted-room direction was: a wide original adventure environment, deliberate ink shapes, restrained painterly detail, matte midnight teal, aubergine and old gold, clear large shapes, a quiet upper quarter for the prompt and lower quarter for three choice labels; spooky and playful, no people, text, UI or gore. Each room received a distinct architectural description. The vault uses the same dark teal and brass palette with a circular mechanical door on the left and quiet space for the live range on the right. Split the Crowd uses two empty blue/plum platforms, restrained gold lighting and an audience silhouette, with quiet areas for real player tokens and counts.

## Original icon atlases

`curated/powerup-0.webp` through `powerup-9.webp` and `curated/superpower-0.webp` through `superpower-9.webp` are generated stylised concept illustrations, not official game assets. Each atlas used five columns and two rows with transparent cells, then was divided into individual WebP assets.

Power-up prompt subjects, in order: star, fire flower, mushroom, extra-life heart, winged speed boots, invincibility shield, crossed damage swords, invisible cloak, time-freeze hourglass, health potion. Direction: hand-inked outlines, controlled cel shading, matte jewel colours, gold details, clear silhouettes and no text or UI.

Superpower prompt subjects, in order: flight wings, invisible cloak, linked teleportation portals, bronze strength fist, time-control hourglass, mind-reading eye, fox becoming a bird, speed boots, healing heart with leaves, four elemental emblems. Direction: the same deliberate arcade illustration, equal visual weight, transparent background and no labels.

The pre-existing boss sprites and party art were retained. This release improves their presentation and reconnect outcome state; it does not claim a new 3D rig or Unity implementation.
