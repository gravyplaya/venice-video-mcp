---
name: venice-mcp-directing
description: Use when writing or improving the creative content of a venice-video-mcp production --- the episode concept, per-shot prompts, dialogue delivery, retakes, or multi-episode continuity. Bridges the separately-installed Seedance 2.0 Skill OS (the "director's brain") onto the venice-video-mcp tool surface so shots are DIRECTED (one intention drives camera, light, blocking, performance, sound) instead of decorated with "cinematic" adjectives. Load it alongside venice-mcp-pipeline.
---

# venice-mcp-directing

The **pipeline** skill tells you *which tool to call*. This skill tells you *what the creative content should say* before you call it.

It is a thin bridge to the **Seedance 2.0 Skill OS** (`emily2040/seedance-2.0`) --- a separately-installed agent-skill package that is pure directing/prompting knowledge with zero execution code. Venice ships **Seedance 2.0 (+ Fast)** as a video model family, and the harness routes most character work through Seedance-family R2V, so that directing knowledge applies almost verbatim --- *once you subtract the parts the venice stack already owns.*

Mental model:

- **Seedance OS = the director's brain.** How to read a scene, pick one intention, and make every instrument serve it.
- **venice-video-mcp + harness = the production crew.** Identity locking, QA, audio mix, assembly, delivery.
- **This skill = the seam.** It maps the brain's output onto the crew's fields, and calls out the three places their assumptions collide.

## When this skill is (and isn't) installed

Seedance OS is installed separately (it is not vendored into this repo). Typical targets: `.cursor/skills/seedance-20/`, `~/.claude/skills/seedance-20/`, or `.agents/skills/seedance-20/`. See the venice-video-mcp README "Directing layer" section.

- **If Seedance OS is present:** load the specific sub-skill named in the trigger table below at the moment it applies, then compile its output into the harness fields.
- **If it is NOT present:** you can still apply everything in the "Core directing rule" and "Reconciliations" sections below --- they are self-contained. The Seedance sub-skills add depth (worked genre derivations, multilingual vocab, failure atlases), not the base principle.

## Core directing rule (the whole point)

**Direct the scene, don't decorate it.** Most prompts ask a model for a "cinematic look" and stack adjectives. A director instead asks what the scene is *doing* --- the turn, the point of view, the power, the subtext --- names **one intention**, and derives camera, lens, light, blocking, performance, and sound from that single intention. Then holds **one directorial voice** across every shot of the episode and across episodes.

- Decorated: `epic cinematic shot of a woman reading a letter, emotional, beautiful lighting`
- Directed: `Medium close-up, eye-level; she lowers the letter and her hands go still as a slow push-in arrives; soft window light keeps her face plain; near-silence with one chair scrape --- the realization lands in the stilled hands, not a word.`

A reveal is not lit, framed, blocked, or performed like a goodbye. Refuse the generic answer; derive the specific one. This is exactly what belongs in a shot's `description` and in the `episode.workshop` concept.

## The mapping: Seedance OS sub-skill -> venice-video-mcp field

| When you are... | Load (Seedance OS) | Compile its output into (venice-video-mcp) |
|---|---|---|
| Turning a vague idea into a brief | `seedance-interview` / `seedance-interview-short` | the `episode.workshop` **concept** string |
| Planning a longer / multi-clip story | `seedance-sequence` | the `episode.workshop` concept + shot count; one directorial voice across shots |
| Writing a single shot's look | `directing-engine` | that shot's **`description`** in `script.json` (or `episode.insert_shot description`) |
| Killing generic "quality booster" wording | `seedance-antislop`, `vocab/en` (or `zh`/`ja`/`ko`/`es`/`ru`) | tightening every shot `description` before `episode.storyboard` |
| Handling a character/brand/celebrity/real person | `seedance-copyright` | a safer rewrite BEFORE `media.generate_videos` |
| A take is 80% right --- keep or redo? | `retake-protocol` | the `episode.qa` -> `episode.fix_panel` -> re-`qa` loop |
| Continuing/extending an accepted episode | `sequence-project-state`, `continuation-handoff` | `episode.insert_shot` and next-episode `workshop` concept |
| Directing a voice/delivery | `seedance-characters`, `seedance-audio` | `character.add voiceDesc` and each dialogue shot's `delivery` cue |
| Producing for a client/campaign/delivery | `pro-filmmaking-standards`, `delivery-qc` | shot-list planning before `workshop`; QC before `assemble` |

**Do NOT load** Seedance OS's `api-status.md`, `surface-prompt-profiles.md`, `api-workflow.md`, or `model-name-map.md`. Those describe ByteDance / Volcengine / Runway / fal surfaces. The venice stack owns Venice execution --- model routing, durations, and API behavior come from the harness and the **venice-mcp-pipeline** / **venice-mcp-cookbook** skills, not from Seedance OS.

## Reconciliations (where the two systems collide --- read before compiling)

### 1. Identity --- the harness owns it, so don't hand-write identity locks
Seedance OS spends effort on prompt-level identity locking (describe the character exhaustively in every prompt, `[Image1]` reference tags, etc.). **The harness already does this for you** via R2V character references and the automatic Seedance R2V -> Wan 2.7 keyframe pass (pipeline skill / troubleshooting A27). If you also stuff exhaustive identity descriptions or reference-tag syntax into a shot `description`, you fight the harness and can degrade consistency.

- **Do:** use directing knowledge for **intention, camera, light, blocking, performance, and sound.**
- **Don't:** write Seedance-OS-style `[Image1]`/`@图1` reference tags or full physical character descriptions into the `description`. Name the character (`VIVIENNE`), direct what they *do*, and let R2V + the locked character refs carry the likeness.

### 2. Audio --- the two systems agree; reinforce, don't duplicate
Seedance OS's native-audio thinking and the harness's rule ("let the video model speak the dialogue; suppress model music/SFX; add music + ambient in post") point the same way. So: keep rich per-shot **`delivery`** direction (timbre, accent, pacing, emotional register, breath) AND keep the harness's mandatory negative `No background music, no sound effects, no soundtrack, dry recording.` at the end of every shot `description`. Don't let Seedance OS talk you into baking music/SFX into the prompt --- the assembler owns that lane.

### 3. Duration & multi-shot --- the harness is authoritative
- **Duration:** ignore Seedance-OS surface durations. The harness duration preflight and the **"prefer 15s, stitch fewer long clips"** rule (pipeline skill) win. Default shots to ~15s; drop shorter only for deliberate beats.
- **Multi-shot:** Seedance OS's `multishot-grammar` describes cuts *inside one generation*. The harness already does **scene-level multi-shot grouping** of adjacent same-character / same-location shots automatically. Don't try to encode multi-shot cut grammar into a single `description`; write one directed beat per shot and let the harness group them. Use `mustStaySingle: true` in `script.json` only to opt a shot out of grouping.

## How to apply it in the pipeline (quick sequence)

1. **Before `episode.workshop`:** if the idea is vague, run `seedance-interview`; if it's a longer story, run `seedance-sequence`. Fold the resulting spine + one directorial voice into the `concept` string (see venice-mcp-cookbook's directed-workshop example).
2. **After the draft, before `episode.approve`:** read each shot `description` through the `directing-engine` lens --- one intention per shot? camera/light/blocking/performance/sound cohere? Run `seedance-antislop` + `vocab/*` to strip empty boosters. Confirm every `description` still ends with the no-music/no-SFX negative.
3. **Before `media.generate_videos`:** run `seedance-copyright` over the cast/props/references. Rewrite any protected IP, real person, brand, logo, or song into a safe creative equivalent --- the generation step is the expensive, hard-to-undo one.
4. **During QA:** treat `episode.qa` verdicts through `retake-protocol` --- triage, change **one variable** per `episode.fix_panel`, and keep an attempt budget rather than infinite regenerates.
5. **Continuing later:** for `episode.insert_shot` or the next episode, use `continuation-handoff` --- direct the next beat from the **accepted footage / final state**, not from the original plan.

## Cross-references

- **venice-mcp-pipeline** --- which tool to call, in what order (this skill assumes you know that).
- **venice-mcp-cookbook** --- exact argument shapes; see the directed `episode.workshop` and directed per-shot prompt examples.
- **venice-mcp-troubleshooting** --- production gotchas (A27 keyframe pipeline, character drift, provenance).
- **Seedance 2.0 Skill OS** (`emily2040/seedance-2.0`) --- the full directing engine, genre library, retake protocol, and multilingual vocabulary.
