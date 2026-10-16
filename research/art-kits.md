# Low-poly art kits for the Office

Ticket: [04-art-kit-research](https://github.com/Mo7ammedFawzy/ai-office/issues/5). Researched 2026-10-16.

**Question:** which free, commercially usable low-poly kits can build a preview-1-style Office (cosy isometric rooms, chibi Characters at desks) on a Radeon HD 7470-class GPU (1 GB VRAM, WebGL only) with React Three Fiber?

**Method:** I read the authors' own pages for licence and tier facts. For Kenney and KayKit I also downloaded the free packs into a temp scratchpad (not the repo) and parsed the GLB/glTF JSON. That gave exact triangle counts, joint counts, animation clip names and file sizes. Numbers marked *(measured)* come from those files. Everything else is quoted from the cited page.

---

## Shortlist

| | **A. Kenney Mini Characters + Furniture Kit** | **B. KayKit Adventurers + Furniture Bits** | **C. Quaternius Ultimate Modular Men/Women (+ Universal Animation Library)** | **D. Kenney Blocky Characters 2.0** (fallback Characters) |
|---|---|---|---|---|
| **Licence** | CC0 1.0 for both packs ([mini-characters](https://kenney.nl/assets/mini-characters), [furniture-kit](https://kenney.nl/assets/furniture-kit)). The bundled `License.txt` says "Creative Commons Zero, CC0", and credit is optional. | CC0 1.0 ([adventurers](https://kaylousberg.itch.io/kaykit-adventurers), [furniture-bits](https://kaylousberg.itch.io/furniture-bits)). The GitHub `LICENSE.txt` agrees. The itch page asks you not to resell unmodified copies. | CC0 ([women](https://quaternius.com/packs/ultimatemodularwomen.html), [men](https://quaternius.com/packs/ultimatemodularcharacters.html), [UAL](https://quaternius.itch.io/universal-animation-library)). **Caveat:** poly.pizza labels a Quaternius model "CC BY 3.0" ([example](https://poly.pizza/m/cwYvO5UauX)), so take the licence from quaternius.com or itch, not mirrors. | CC0 1.0 ([blocky-characters](https://kenney.nl/assets/blocky-characters)) |
| **Price** | Free | Free tier. EXTRA ($3.95+ furniture, $7.95+ characters) adds models and 3 alternate textures. | Free. UAL: 45 clips free, 120+ in Pro ($9.99+). | Free |
| **Format** | GLB, FBX, OBJ, DAE, STL (furniture). GLB and FBX (characters). *(measured)* | glTF/GLB and FBX, plus OBJ for furniture | FBX, OBJ, glTF, Blend. The page lists both glTF and GLB, which is inconsistent. UAL Pro ships FBX and GLB. | GLB, FBX *(measured)* |
| **Office furniture** | **Strong.** 140 models *(measured)*: `desk`, `deskCorner`, `chairDesk`, `computerScreen`, `computerKeyboard`, `computerMouse`, `laptop`, 4 plants, 9 lounge sofas/chairs, bookcases, lamps, rugs, `trashcan`, `kitchenCoffeeMachine`, `wall`/`wallWindow`/`wallDoorway`/`wallCorner`, `floorFull`/`floorHalf`/`floorCorner`, doorways | **Partial in the free tier.** The free 1.0 repo has 53 models *(measured)*: chairs, armchair, couch, tables, shelves, cacti, lamps, rugs, picture frames, books. It has **no desk or computer**. The itch captions show office desks, chairs and computers, apparently in the paid EXTRA. No walls or floors (those are in KayKit's other packs). | **Weak.** No office pack. [Ultimate House Interior](https://quaternius.com/packs/ultimatehomeinterior.html) (CC0, 123 models, FBX/OBJ/Blend) and [Ultimate Furniture](https://quaternius.com/packs/ultimatefurniture.html) (20 models) don't list desks or computers. Pair with Kenney furniture. | n/a (pair with A's furniture) |
| **Characters** | 12 chibi figures (`character-male-a…f`, `character-female-a…f`) plus aids (glasses, canes) and wheelchairs *(measured)* | 5 free fantasy adventurers (knight, barbarian, rogue, rogue-hooded, mage, ranger). EXTRA adds 3 more. | Women: 10 characters. Men: 11 characters. Outfits include **Casual, Formal, Suit, Worker**, plus Adventurer, Medieval, Punk, SciFi, Soldier, Witch (glTF file names in the author's Drive) | 18 characters (`character-a…r`) *(measured)* |
| **Rig** | Skinned, **7 joints** (root, legs, torso, arms, head) *(measured)* | Skinned, **41 joints** *(measured)*, chibi-proportioned | Humanoid rig. A "humanoid rig version" is included. | **No skin.** Rigid node animation of 7 parts *(measured)* |
| **Animations we need** | 32 clips *(measured)*: `idle` ✓, `walk` ✓, `sit` ✓, `interact-left/right` (usable as typing), `emote-yes` (nod, usable as a hand-raise stand-in). **No wave, no typing.** | 76 clips per character *(measured)*: `Idle` ✓, `Walking_A/B/C` ✓, `Sit_Chair_Down/Idle/StandUp` ✓, `Interact`, `Use_Item`, `Spellcasting` (looped, usable as typing), `Cheer` (two-arm wave). **No dedicated typing or single-hand wave.** | 24 clips per pack ("10 Different characters with 24 animations"). **Clip names are not verified**: the Drive download hit a quota limit. UAL (CC0) adds sitting and emotes in 45 free / 120+ Pro clips on a rig that is "compatible with … Mixamo". | 27 clips *(measured)*: same set as A minus crouch/jump/fall. Has `idle`, `walk`, `sit`, `interact-*`, `emote-yes`. |
| **Tris / size** | Characters 690–876 tris, about 250 KB per GLB, all 12 sharing one 8.7 KB `colormap.png` *(measured)*. Furniture averages 191 tris (max 992), 140 GLBs total 1.96 MB, untextured (material colours) *(measured)*. Zips: 2.3 MB + 4.9 MB. | Knight.glb is 6,952 tris and **3.66 MB** (embedded texture plus 76 clips) *(measured)*. Furniture uses one 1024² gradient atlas (page says it can be downsampled to 128²). Free zips: 12 MB (characters), 3.6 MB (furniture). | Not stated on the page. The older Quaternius low-poly characters are typically a few thousand tris (unverified). Avoid [Universal Base Characters](https://quaternius.itch.io/universal-base-characters) at about 13k tris average. | **72 tris** per character, about 110 KB per GLB *(measured)*. 2.1 MB zip. |
| **Variability** | 12 fixed looks with a shared palette texture, so recolour by swapping or tinting `colormap.png`. Aids add glasses or a wheelchair. No separate hair or clothes meshes (only `body-mesh` + `head-mesh`). | 5 looks plus accessory props. EXTRA adds 3 alternate textures per character. | **Best**: "each character is divided into 4 models that can be swapped" (head/hair, torso, legs, feet), so mix-and-match is possible across 21 characters. | 18 looks, one texture each (`texture-a.png`…). Recolour by texture. |
| **Style fit (cosy chibi office)** | Excellent. Big-head chibi with matching office furniture from the same author. | Chibi look fits well, but the outfits are fantasy armour and robes. | Office clothes fit (Suit, Casual, Worker), but the proportions are less chibi. | Minecraft-ish blocks, not chibi. Ultra-light fallback only. |

---

## Notes

### GPU budget fit (HD 7470, 1 GB, WebGL)
- **A** is about as light as these kits get. Take 10 Rooms × 6 Characters × about 800 tris (≈48k tris), add a few hundred Kenney furniture pieces at about 190 tris (≈60k). That is far below what a GCN 1.0 / TeraScale card struggles with. All Kenney Characters share one 8.7 KB texture, and the furniture has none, so VRAM use is negligible.
- **B** costs roughly 9× the triangles per Character and 41-joint skinning. 60 Characters ≈ 420k tris is still probably workable with `frameloop="demand"` and the ~30 fps cap, but it leaves far less headroom. Each GLB is 3.6 MB because every Character file embeds all 76 clips. In three.js you can load the clips once and play them on every Character that shares the rig.
- In every kit, the Characters of one pack share a rig. Load clips once and bind them with `useAnimations` on each clone (`SkeletonUtils.clone`), so you don't re-parse per Character.

### Missing animations (typing, wave)
None of the shortlisted kits ships a dedicated "typing" or "wave" clip. Options, cheapest first:
1. **Reuse what's there.** Typing = `sit` + looping `interact-*` (Kenney) or `Sit_Chair_Idle` blended with `Use_Item`/`Spellcasting` (KayKit). Needs-you = `emote-yes` / `Cheer`, plus a bubble or icon.
2. **Procedural layer.** For Kenney's 7-joint rig, add a small sine bob on `arm-left`/`arm-right` while seated ("typing") and a raised `arm-right` rotation ("hand up"). That is a few lines in `useFrame`, and it fits the low-poly look.
3. **Quaternius Universal Animation Library** (CC0, 45 free / 120+ Pro clips, "universal humanoid rig … ready for retargeting", sitting and emotes). [itch](https://quaternius.itch.io/universal-animation-library). It is a CC0 alternative to Mixamo for full humanoid rigs (B, C). It **won't fit Kenney's 7-joint rig.**
4. **Mixamo.** The Adobe FAQ says characters and animations are royalty-free for personal, commercial and non-profit projects, and it requires an Adobe ID ([Adobe FAQ](https://helpx.adobe.com/ca/creative-cloud/faq/mixamo-faq.html)). An Adobe community FAQ says you may not redistribute the raw character or animation files, e.g. as asset packs, and may not use them to train ML models ([community FAQ, 2022](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775)). Shipping them inside the app is fine. Committing the raw FBX files to a public repo is the grey area. Mixamo's 65-bone realistic rig needs retargeting to chibi proportions, and the clips look off on big-head bodies. It is **not CC0**, so keep it a last resort.

### Licence details
- All four kits are **CC0 1.0** on the author's own page or bundled licence file (Kenney `License.txt`, KayKit `LICENSE.txt` in the [GitHub repo](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0)). Credit is optional for all of them. KayKit's itch page adds a request (not a licence term) not to resell unmodified copies.
- **Don't take a licence from a mirror.** poly.pizza shows "CC BY 3.0" on a Quaternius model the author publishes as CC0. If assets come from poly.pizza, record the licence the author gives at the source.

### Unknowns (not verified)
- Quaternius Ultimate Modular clip names and triangle counts. The Google Drive download returned "Quota exceeded". Download one glTF from the [author's Drive folder](https://drive.google.com/drive/folders/1720N9IGyQHXYvtvZJzazhxtTTlz-y2Vf) when building the prototype.
- Exact contents of the KayKit Furniture Bits EXTRA tier (desks and computers). They appear only in image captions.

---

## Recommendation (for the prototype; the user chooses by eye)

**Start the prototype with A: Kenney Mini Characters + Kenney Furniture Kit.** Both are CC0 and GLB, from one author in one visual style. The 140 furniture models cover every office need: desks, desk chairs, monitors, keyboards, laptops, plants, sofas, walls, floors, doors and windows. The Characters are under 900 tris on one tiny shared texture, and they already have `idle`/`walk`/`sit`/`interact`. Fill the typing and hand-raise gaps with a procedural arm layer. Store Character appearance as data: `{ model: "character-female-c", tint?, accessory?: "aid-glasses" }`.

For a **side-by-side look**, put B's KayKit Adventurers (richer animation, including `Sit_Chair_*` and `Cheer`, chibi proportions) in the same Kenney-furnished room. The trade-off is fantasy outfits and about 9× the triangles. Quaternius (C) is the pick if mix-and-match office outfits (Suit, Casual, Worker) matter more than the chibi look. Its clip list still needs checking. Blocky (D) is the safety net if the GPU struggles.

## Sources
- Kenney: https://kenney.nl/assets/mini-characters · https://kenney.nl/assets/furniture-kit · https://kenney.nl/assets/blocky-characters (zips inspected; `License.txt` inside each)
- KayKit: https://kaylousberg.itch.io/kaykit-adventurers · https://kaylousberg.itch.io/furniture-bits · https://kaylousberg.itch.io/kaykit-character-animations · https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 · https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0
- Quaternius: https://quaternius.com/packs/ultimatemodularwomen.html · https://quaternius.com/packs/ultimatemodularcharacters.html · https://quaternius.com/packs/ultimatehomeinterior.html · https://quaternius.com/packs/ultimatefurniture.html · https://quaternius.itch.io/universal-animation-library · https://quaternius.itch.io/universal-base-characters
- poly.pizza licence mismatch: https://poly.pizza/m/cwYvO5UauX
- Mixamo: https://helpx.adobe.com/ca/creative-cloud/faq/mixamo-faq.html · https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/m-p/13234775
- CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
