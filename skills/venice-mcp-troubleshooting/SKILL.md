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

### A3. Atmosphere model duration validation
`veo3.1-fast-image-to-video` only accepts 4s/6s/8s. Seedance 2.0 (current default) accepts 4s/5s/8s/10s/12s/15s --- not all integers. The harness auto-snaps invalid durations to the nearest valid value with a warning. If you see "duration auto-snapped" in stdout, your script is using a duration the model doesn't support natively --- fix it in `script.json`.

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

### `episode.qa` flags every shot
**Cause:** Aesthetic drift from cfg_scale too low, or character refs themselves are inconsistent.
**Fix:** First, regenerate the character refs (see harness `add-character` --- it produces 4 angle images). Verify they're stylistically consistent. Then storyboard with `cfgScale: 10`.

### `media.generate_videos` hangs or times out
**Cause:** Venice queue is slow under load. Default poll loop in the harness handles it, but the MCP-side `runHarness` doesn't time out by default.
**Fix:** The harness streams progress lines; if you don't see any for >5 minutes, check `VENICE_API_KEY` and Venice's status page. Aborting the MCP request kills the child process.

### `assemble.assemble` produces a final mp4 with no audio
**Cause:** `dialogueReplace: true` but no Venice TTS dialogue was generated.
**Fix:** Run `media.override_audio { dialogue: true }` BEFORE assembly, OR pass `dialogueReplace: false` and `nativeVolume: 1.0` to use the model-native audio.

### `assemble.edit_transcribe` finds 0 sources
**Cause:** `dir` doesn't exist or `include` glob doesn't match.
**Fix:** Default include is `*.mp4,*.mov,*.m4a,*.wav,*.mp3,*.mkv,*.webm`. Verify with `ls` (or just `inspect.list` adjacent to the dir).

## When to escalate

Stop and ask the user when:
- The harness returns an error you don't recognize (paste `stderrTail` to them).
- A retry would cost a long render (>5 minutes) and you're not sure the previous failure was transient.
- The user's request implies overriding a non-negotiable rule above (e.g. "skip QA and just produce", "render before I confirm").
- `inspect` shows the workspace is in a state inconsistent with the user's request (e.g. they said "edit episode 3" but only episode 1 exists).
