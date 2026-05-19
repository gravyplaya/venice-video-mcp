---
name: venice-mcp-troubleshooting
description: Use when a venice-video-mcp tool call fails, returns ok=false, hangs, produces wrong output (wrong aspect ratio, character drift, duration error, missing audio), or when the agent needs to know which production gotchas to avoid before driving an expensive operation. Catalogs every known failure mode with cause and fix.
---

# venice-mcp-troubleshooting

If a tool call fails or produces wrong output, find the symptom below and apply the fix BEFORE retrying. The retry is expensive; the diagnosis is free.

Most fixes lift directly from the harness's `CLAUDE.md` "Learned Anti-Patterns" log --- this skill is the MCP-shaped index into that log.

## Setup failures (server won't start or no tools work)

### S1. `venice-video-harness binary not found`
**Symptom:** Every tool call fails with this message.
**Cause:** The MCP can't locate the harness CLI.
**Fix (pick one):**
- In the harness repo: `npm install && npm run build && npm link` so `venice-video` is on PATH.
- Set env var `HARNESS_BIN=/abs/path/to/venice-video-harness/dist/mini-drama/cli.js`.
- Set env var `HARNESS_PATH=/abs/path/to/venice-video-harness` (must contain a built `dist/`).

### S2. `VENICE_API_KEY not set`
**Symptom:** Harness exits with auth error.
**Fix:** Set `VENICE_API_KEY` in the MCP server's environment. In Cursor, add it to `env` in `.cursor/mcp.json`. Never commit it.

### S3. `ffmpeg: command not found`
**Symptom:** `assemble.assemble` / `produce` / `edit_render` / `edit_timeline` fail.
**Fix:** Install ffmpeg + ffprobe. macOS: `brew install ffmpeg`. Required on PATH.

### S4. `tsx: command not found` during edit_*
**Symptom:** `assemble.edit_transcribe`, `edit_render`, `edit_timeline` can't spawn tsx.
**Cause:** The MCP runs harness scripts via `node_modules/.bin/tsx` inside the harness root.
**Fix:** Run `npm install` inside the harness repo so `node_modules/.bin/tsx` exists.

### S5. `inspect.list` returns 0 series in a workspace that has them
**Cause:** `HARNESS_WORKSPACE` not set, so the MCP looks in the cwd of the server process (typically wrong).
**Fix:** Set `HARNESS_WORKSPACE=/abs/path/to/venice-video-harness` in the MCP env. The MCP will look under `<workspace>/output/<slug>/` first, then `<workspace>/<slug>/`.

## Production anti-patterns (lifted from harness CLAUDE.md)

These are **rules** to obey when planning tool calls --- not just things to fix after they break.

### A1. Never group shots with different characters into multi-shot units
The harness's planner already handles this, but if you bypass it (calling Venice video endpoints directly outside the MCP) you'll lose R2V identity anchoring. Shots cutting between different speakers must each be R2V singles with reference images. Talk shows, interviews, panels: every character shot is R2V.

### A2. Front-load STYLE in every prompt + use cfg_scale 10 for character refs
If you customize prompts via `episode.fix_panel { prompt }`:
- Put the aesthetic/style description at the START of the prompt, not the end.
- Add a `STYLE REMINDER:` suffix to lock it in.
- Add `photorealistic, photograph, photo` to the negative prompt for stylized aesthetics.
- Use `cfg_scale: 10` for character references and storyboard panels (lower values like 7 cause style drift between angles).

### A3. Shot duration — prefer 15s, native max on Seedance 2.0 and HappyHorse 1.0
- Seedance 2.0 (all variants) accepts every integer 4s–15s natively. HappyHorse 1.0 accepts 3s–15s. `veo3.1-fast-image-to-video` only accepts 4s/6s/8s. Wan 2.7 also generates long shots for lip-sync.
- **15s is the recommended default**, applied automatically by the MCP for `episode.insert_shot { duration }`. For a 30s beat, prefer 2x15s over 5x6s — identity stays anchored, costs are lower, motion has room to breathe. Drop below 15s only for deliberate short beats (hard cut, sight gag, reaction stinger).
- If you bypass the MCP and call the harness CLI directly with a duration outside the model's allowed set, the harness will auto-snap to the nearest valid value and log `duration auto-snapped`. This now surfaces in the MCP response as a `warnings[]` entry — read it before assuming the output is what you asked for, and fix the offending duration in `script.json`.
- `episode.workshop`'s default script LLM tends to produce too many short shots. The MCP description for `episode.workshop.concept` now tells the agent to instruct the LLM to target 15s shots; you should also include that in the concept string when calling workshop manually.

### A4. R2V always defaults to 9:16 if you don't pass an aspect ratio
The harness pipeline now derives aspect ratio from `series.storyboardAspectRatio`. Never hardcode `9:16` unless you actually want vertical. After `media.generate_videos`, **always run `media.validate { videoOutputs: true }`** to verify all shots match the expected orientation.

### A5. Multi-edit crops foreheads on 16:9 close-ups
Venice multi-edit returns 1024x1024. Restoring 16:9 crops ~25% top + bottom. Close-ups with logos/sigils on foreheads, headwear, or chin detail will lose them.
**Rule:** For close-up character shots that need forehead/chin detail, generate the panel from scratch (don't `fix_panel` an existing one). The harness's `panel-fixer.ts` warns when this risk applies.

### A6. Inverted pipeline for tight close-ups
For tight close-up character shots, multi-edit can't override the base face because it's too dominant in frame. Instead, start from the character's `profile.png` reference and edit the background onto it (the inverted approach). This is how `episode.fix_panel` works under the hood for close-ups; if you're scripting custom edits, do the same.

### A7. Lighting must match consecutive shots in the same location
Independent panel generation produces wildly different lighting interpretations of the same scene. For consecutive shots in the same location, the second shot's prompt MUST explicitly reference the lighting established in the first, and ideally the prior panel goes in as a multi-edit style reference.

### A8. Silhouette characters need `silhouetteCharacters` field
If a character appears as a distant silhouette (not a face-detail shot), don't put them in `characters: []` (which triggers "no people" negative prompts) and don't put them in normal characters (which triggers R2V routing). Use `silhouetteCharacters` in the script.

### A9. Don't say "VVV" or "triple-V" for the Venice logo
The Venice AI logo is two ornate skeleton keys crossed in an X with a chevron/open-book at the top. Always describe that geometry in prompts. Never use "VVV" or "triple-V" shorthand.

### A10. Never pass logo PNGs as multi-edit references
Multi-edit interprets reference images literally. A mostly-white/transparent logo PNG gets composited as an overlay rather than treated as a design pattern. **Describe logos in text prompts only.** Reserve multi-edit reference slots for character face/body and scene environment refs.

### A11. Seedance 2.0 blocks face-bearing non-seedream images
The harness defaults to Seedance 2.0 for video, which has a provenance gate: face-bearing input images must be produced by `seedream-v5-lite` / `seedream-v5-lite-edit`. Object/establishing/atmosphere images can come from any family.
**What to watch for:** If `media.generate_videos` 4xx's with a Seedance error, check `inspect.shot` --- you'll see a `provenance.json` sidecar identifying the wrong-family image. Either re-generate that panel with seedream, or override `videoDefaults` in `series.json` to a non-Seedance family (Kling O3 + Veo).

The compatibility behaviour is controlled by `videoDefaults.seedanceCompatibility`:
- `prompt` (default in TTY) — list offending files and wait for `fallback` or `launder`.
- `fallback` (default in CI / non-TTY) — reroute that shot to `kling-o3-standard-reference-to-video` (R2V) or `veo3.1-fast-image-to-video` (i2v); other shots in the run stay on Seedance.
- `launder` — re-render incompatible images through `seedream-v5-lite-edit` with a "preserve image" prompt, archive the originals, then continue with Seedance.

`inspect.series` now surfaces this value; check it before retrying a Seedance failure.

### A12. Scene-level multi-shot can group consecutive shots into one unit
v2.1.x default: the planner groups adjacent shots that share characters + location into a single Seedance multi-shot generation. Stdout reads `unit X of Y (covers shots A-B)`, not `shot N of M`. Consequences:
- A single unit failure costs you the whole unit, not one shot. Retries re-render the unit.
- Mid-unit `episode.fix_panel` is fine --- it edits the panel, not the unit boundary. Re-run `media.generate_videos` after.
- Mid-unit `episode.insert_shot` splits the unit because the inserted shot has a new id (`5b`). That's intentional --- it preserves identity continuity across the inserted shot without re-rendering the rest.

To disable scene-level grouping for a specific shot, set `mustStaySingle: true` in `script.json` for that shot.

### A13. Motion-classified routing changes model per shot
A dialogue shot with `motion: 'low' | 'medium'` and `faceVisible: true` routes to `wan-2-7-image-to-video` for lip-sync. High-motion or face-occluded shots stay on the R2V model. Implications:
- The model used in stdout will not always match `series.videoDefaults.actionModel`.
- Wan 2.7 needs an `audioUrl` ≥ 3s --- the harness pads short clips automatically but a missing `audioUrl` falls back to R2V silently.
- Wan 2.7 i2v has **no** `reference_image_urls` --- its single `image_url` is the only identity anchor. Harness ≥ 2.2.0 auto-keyframes from a Seedance R2V pass so identity stays locked; see A27 for the automatic pipeline and its opt-out levers.
- To force a specific shot back to the default model, set `motion: 'high'` or `faceVisible: false` in `script.json`.

Override the lip-sync model globally via `videoDefaults.lipSyncModel` in `series.json`.

## Editing-pipeline anti-patterns

### A14. Never frame-dump before transcribing
**Symptom:** Agent starts generating timeline PNGs of an entire video to "decide where to cut."
**Cost:** 30 minutes at 24fps = 43,200 frames at ~1,500 tokens each = 64M tokens of noise. The LLM cannot hold that and will fabricate.
**Rule:** Always run `assemble.edit_transcribe` first, read `takes_packed.md` (~12KB), and call `assemble.edit_timeline` only at explicit decision points (resolving an ambiguous pause, comparing two takes, verifying a mouth-close before a cut).

### A15. Never render a cut without explicit user confirmation
**Rule:** After proposing a cut strategy from `takes_packed.md`, post a summary (sources, estimated duration, trim rules, transitions) in plain text and **wait for "yes / revise / cancel"** before invoking the cut renderer. The render is cheap to launch and expensive to throw away. This is non-negotiable per the harness's video-editing skill.

### A16. Don't auto-trim filler-word/silence gaps
Kokoro TTS renders `...` in scripts as intentional ~0.6s breath beats --- they're creative pacing, not dead air. Filler-word detectors must:
- Skip gaps that originated from a `...` in aligned mode.
- Always require user confirmation before any filler trim lands.
- Treat `you know` / `i mean` as content for some speakers.
The harness's `silence.ts` already excludes `...` --- if you're hand-rolling silence detection outside the MCP, replicate that.

### A17. Overlays go in a SEPARATE pass, not the EDL render
The EDL render produces `final-edit.mp4`. Overlays (lower-thirds, title cards, callouts) compose on top via `assemble.edit_render` to produce `delivered.mp4`. **Do not bake overlays into the EDL pass** --- if the user asks for a wording change you'd throw away the entire cut.

### A18. Always archive prior renders before re-rendering
**Rule:** Never overwrite `<stem>.<ext>` --- rename existing to `<stem>-v<N>.<ext>` first. The harness's `render-overlay.ts` does this by default; the workspace's `shot-asset-safety` rule requires it for shot files. **`skipArchive: true` should never be passed** unless the user explicitly says "discard the prior render."

## Audio / mix anti-patterns (v2.1.x)

### A19. Music cues conflict with single-bed `media.generate_music`
When `script.json` has a `musicCues[]` array, the assembler renders each cue and crossfades between adjacent cues. If you ALSO ran `media.generate_music`, the cues win --- the single bed at `audio/music.mp3` is ignored. **Rule:** check for `musicCueCount > 0` via `inspect.episode` before calling `media.generate_music`. If cues exist, skip `generate_music` unless the user wants a uniform bed.

### A20. Per-shot `musicHold` overrides the cue envelope
Each shot can carry `musicHold: 'sustain' | 'swell' | 'drop' | 'stinger'`. This is LAYERED on top of the containing cue's `musicHold`. If a shot is unexpectedly silent under the music bed, look for `musicHold: 'drop'` --- it ducks the bed to -inf for the shot's range. Likewise `'stinger'` injects a 0.4s pulse +6dB and returns to bed; if you hear an unexpected hit, check the shot's automation.

### A21. LUFS final pass changes the perceived loudness
v2.1.x default targets -16 LUFS integrated / -1 dBTP true peak. If a user complains the final mix is quieter than the source media, that's the LUFS pass. Override via `script.audioMix.lufsTarget` (e.g. `-14` for streaming-loud) and `script.audioMix.truePeakDb`. Don't disable it project-wide; it's the loudness standard the harness assumes downstream tools (subtitles, transcoder) rely on.

### A22. SFX clips are trimmed to 2s with a 0.3s fade by default
Long SFX from `elevenlabs-sound-effects-v2` (which can return 5-10s clips) are auto-trimmed to ≤2.0s with a 0.3s fade-out. If you need a longer SFX cue, override per-episode via `script.audioMix.sfxMaxDurationSec` and `sfxFadeOutSec`.

### A23. Wan 2.7 audio_url has a 3s minimum
Wan 2.7 returns HTTP 400 if `audio_url` is shorter than 3 seconds. The harness pads automatically (look for `padded audio_url N.NNs -> 3.00s` in stdout). If you see a Wan 2.7 4xx and no padding line, the input audio may be missing or unreadable --- check that `audioUrl` resolves and decodes via `ffprobe`.

### A24. Ambient layer names are NOT free-form
Only four ambient slot names are recognised downstream: `rain-heavy`, `rain`, `crowd`, `quiet-night`. The MCP `media.generate_ambient` action enforces the enum on input. If you bypass it (write your own file directly) and use a different filename, `assemble.assemble` and `assemble.mix_audio` will silently ignore it. To add a custom slot, you'd need to fork the harness's `assembler.ts` / `mix-episode-audio.ts` --- usually it's easier to coerce the audio into one of the four named slots.

### A25. `assemble.mix_audio` overwrites `assemble.assemble`'s output
Both actions write `episode-NNN-final.mp4` (and `mix_audio` also writes `episode-NNN-final-nosubs.mp4`). Last writer wins. Decide per-episode which mixer to use; running both in sequence just throws away the first mix. Use `inspect.episode` to see which file is current --- the `final-nosubs.mp4` presence indicates `mix_audio` ran last.

### A26. `mix_audio` falls back to mostly-native audio when no ambient layers exist
If no `ambient-*.mp3` files are present in `<episodeDir>/audio/`, the per-shot mixer still runs but its ambient track is silent. The output isn't broken --- it just sounds like the basic assembler. Run `media.generate_ambient` first (one or more layers) to get the actual benefit of `mix_audio` over `assemble.assemble`.

### A27. Wan 2.7 dialogue clips drift on identity --- the harness auto-keyframes from Seedance R2V (harness ≥ 2.2.0)
**Symptom:** A `wan-2-7-image-to-video` lip-sync clip starts on-model in frame 1 but the character's face slides off the reference mid-clip --- different facial structure, wrong eye color, drifting hair.
**Cause:** Wan 2.7 i2v exposes no `reference_image_urls`. Its only identity anchor is the single `image_url` keyframe. With a panel-derived keyframe (panels are generated by image models without strong 4-angle character conditioning), Wan has nothing strong to lock onto.
**Status:** Automated in harness 2.2.0 (CLAUDE.md rule 32). On every matching shot, `media.generate_videos` now runs:

1. **Stage A** --- Seedance R2V identity-lock render via `videoDefaults.characterConsistencyModel` with all character refs, no audio → `shot-NNN-r2v-keyframe.mp4`.
2. **Stage B** --- ffmpeg extracts frame 1 → `shot-NNN-r2v-keyframe.png`.
3. **Stage C** --- `wan-2-7-image-to-video` runs with that keyframe as `image_url` and the dialogue MP3 as `audio_url`. If the MP3 isn't on disk and the character has a locked voice, Stage C inline-TTS-renders it at the canonical `audio/dialogue-shot-NNN.mp3` so the assembler picks it up later (no need to run `media.override_audio --dialogue` first).

You'll see `Stage A/3:` / `Stage B/3:` / `Stage C/3:` lines in the streamed progress output and a `seedanceKeyframe` block in each shot's `.video.json`.

**Apply when (planner decides automatically):** Single-character dialogue, visible face, `motion` is `low | medium`.
**Skip when (planner decides automatically):** No dialogue, `motion: 'high'`, `faceVisible: false`, NARRATOR / V.O., or ≥2 speakers (Wan 2.7 R2V `per_reference_audio` handles those).

**Cost:** ~$0.85 per matching shot total (Seedance R2V + Wan 2.7 i2v --- roughly 2× the single-pass Wan price). `media.generate_videos` reports the per-episode count at start.

**Opt-out levers** (use only when the user explicitly asks to bypass the rule):
- **Per-shot:** set `disableSeedanceKeyframe: true` on the shot in `script.json`, then re-run `media.generate_videos`. Use when the user wants to preserve a manually retouched panel as the Wan keyframe.
- **Per-series:** set `videoDefaults.seedanceKeyframeForWan: false` in `series.json`. Use when the user is cost-sensitive and accepts identity drift across the entire series.
- **Per-run:** the harness CLI accepts `--no-seedance-keyframe`. The MCP doesn't expose this directly; the per-series flag plus a re-run achieves the same effect.

**If the rule-32 pipeline errors:** The harness logs the failure and falls back to the existing panel-anchored single-pass render. Look for `⚠ Seedance R2V keyframe pipeline failed (...); falling back to panel-anchored single-pass render.` in stdout and a `seedanceKeyframe: { attempted: true, success: false, reason }` block in the shot's `.video.json`. Most common cause is a Stage A Seedance compatibility rejection --- run `inspect.series` to verify `videoDefaults.imageDefaults.generationModel` matches the Seedance face-bearing requirements (see A12).

For pre-2.2.0 harness installs, the manual two-stage workflow still works: see git history of this skill for the legacy steps.

## Tool-specific failure modes

### `series.new` succeeds but `series.list` doesn't show it
**Cause:** Workspace mismatch. The series was created in one workspace; you're listing in another.
**Fix:** Set `HARNESS_WORKSPACE` consistently. `inspect.list` reports the workspace it searched.

### `episode.workshop` returns generic-sounding shots
**Cause:** Concept too vague, or the chat model isn't dialed in.
**Fix:** Pass a more specific `concept` and try a stronger model: `model: "llama-3.1-405b"` or another available chat model. Inspect available models via `inspect.models` (filter by purpose elsewhere; chat models live in the harness's chat client config).

### `episode.storyboard` says "no script approved"
**Cause:** You skipped `episode.approve` (or the user edited script.json after approval).
**Fix:** Run `episode.approve { project, episode }`, then retry storyboard.

### `episode.qa` returns 404 for every shot ("vision model … isn't available on Venice's chat endpoint" / "model ID is stale")
**Cause:** The configured vision model has been deprecated and sunset by Venice. Historically this was `qwen-2.5-vl` (sunset 2025-09-22), and pre-fix MCP installs still hard-defaulted to it. Venice promises sunset routing to "a model of similar processing power" but vision LLMs in particular routinely 404 cleanly after the date.
**Fix:**
1. Pass an explicit current vision model on the call: `episode.qa { project, episode, model: "qwen3-6-27b" }` (well-priced Qwen 3.6 27B with vision support as of 2026-05). The MCP's current default is already `qwen3-6-27b`.
2. To confirm what's actually live and what's deprecated, run `inspect.models { category: "vision", live: true }`. The response includes a `deprecated[]` array of any models with a pending `deprecation.date` and a `recommended.defaultVision` field (Venice's `default_vision` trait pointer, currently `qwen3-vl-235b-a22b` — capable but ~6x the input cost of `qwen3-6-27b`).
3. If you're on an old MCP that still defaults to `qwen-2.5-vl`, update the MCP or always pass `model` explicitly.

### `episode.qa` flags every shot
**Cause:** Aesthetic drift from cfg_scale too low, or character refs themselves are inconsistent.
**Fix:** First, regenerate the character refs (see harness `add-character` --- it produces 4 angle images). Verify they're stylistically consistent. Then storyboard with `cfgScale: 10`.

### `media.generate_videos` hangs or times out
**Cause:** Venice queue is slow under load. Default poll loop in the harness handles it, but the MCP-side `runHarness` doesn't time out by default.
**Fix:** The harness streams progress lines; if you don't see any for >5 minutes, check `VENICE_API_KEY` and Venice's status page. Aborting the MCP request kills the child process.

### `assemble.assemble` produces a final mp4 with no audio
**Cause:** `dialogueReplace: true` but no Venice TTS dialogue was generated.
**Fix (now the default path):** Pass `dialogueReplace: false` and `nativeVolume: 1.0` to use the video model's native audio. As of 2026-05 the MCP defaults are exactly this — native dialogue from Seedance/Wan/HappyHorse, music and ambient added in post — because Venice's TTS voices are still limited in range. Only flip `dialogueReplace: true` (and also run `media.override_audio { dialogue: true }` upstream) when the user explicitly wants TTS for accent control, language swap, or to fix a botched native take.

### Final mp4 has unwanted music or sound effects baked into the dialogue track
**Cause:** Video model generated its own background music / SFX because the shot prompt didn't suppress them.
**Fix:** Edit `script.json` shot prompts to include the negative `no background music, no sound effects, no soundtrack, dry recording`, then re-run `media.generate_videos` for the affected shots. The `episode.workshop` description now tells the script LLM to add this negative automatically; if you see baked-in music, the workshop concept was probably missing that guidance — re-workshop with it included.

### Native dialogue sounds wrong (accent, emotion, pacing off)
**Cause:** The video model's native dialogue is driven by the shot prompt's voice/delivery description. Sparse description → bland or off-character delivery.
**Fix:**
1. First, beef up `voiceDesc` on `character.add` (timbre, accent, pacing, emotional register, breath placement). The richer the description, the more in-character the native dialogue.
2. In the shot's `description`/prompt, include per-shot delivery direction (e.g. "deliberate pacing, dry sarcasm, long beat before the punchline").
3. If the model still can't hit the target, fall back to Venice TTS for that shot: `media.override_audio { dialogue: true }` for the episode + `assemble.assemble { dialogueReplace: true, nativeVolume: 0.2 }`. This costs more and sounds more synthetic but gives deterministic delivery.

### `assemble.edit_transcribe` finds 0 sources
**Cause:** `dir` doesn't exist or `include` glob doesn't match.
**Fix:** Default include is `*.mp4,*.mov,*.m4a,*.wav,*.mp3,*.mkv,*.webm`. Verify with `ls` (or just `inspect.list` adjacent to the dir).

### `assemble.export_timeline` succeeds but the NLE shows no clips
**Cause:** No `shot-NNN.mp4` files exist in `<episodeDir>/scene-001/`. The XML still imports but has nothing to lay on the timeline.
**Fix:** Run `media.generate_videos` first. The export reads from the rendered shot files, not from `script.json`.

### Venice returns a "silent rejection" (200 OK with no output file)
**Symptom:** A tool exits 0 but the expected output file is missing or zero bytes.
**Cause:** Venice intermittently returns a successful HTTP response with no actual generation. v2.1.x catches most of these via the rejection guard, but it can still leak past with a structured retry message.
**Fix:** Check the stderr tail for `silent rejection detected, retry N/3`. If you see `silent rejection persisted after 3 retries`, re-queue the call --- the upstream model is degraded.

## When to escalate

Stop and ask the user when:
- The harness returns an error you don't recognize (paste `stderrTail` to them).
- A retry would cost a long render (>5 minutes) and you're not sure the previous failure was transient.
- The user's request implies overriding a non-negotiable rule above (e.g. "skip QA and just produce", "render before I confirm").
- `inspect` shows the workspace is in a state inconsistent with the user's request (e.g. they said "edit episode 3" but only episode 1 exists).
