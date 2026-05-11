---
name: venice-mcp-cookbook
description: Use when calling any of the venice-video-mcp tools and you need a concrete, copyable example of the tool arguments. Provides one example per action across all 6 tools, with every argument spelled out and reasonable defaults explained.
---

# venice-mcp-cookbook

Concrete, copy-paste examples for every action across the six MCP tools. Every example shows the full args object the agent should pass to the tool call.

Conventions:
- `project` accepts a slug like `"the-audacity"` (resolved against `$HARNESS_WORKSPACE/output/`) or an absolute path.
- All booleans are real booleans, not strings.
- `episode` and `shot` are integers (1-based).
- Coercion is enabled: passing `"1"` for a number works, but prefer real numbers.

---

## series

### `series.new`
```json
{
  "action": "new",
  "name": "The Audacity",
  "concept": "A wildly sarcastic talk show host interviews guests and dispenses weaponized life advice.",
  "genre": "comedy",
  "setting": "An absurdly lavish talk show studio with gold accents, velvet chairs, dramatic backlighting, and a live audience that gasps on cue."
}
```

### `series.list`
```json
{ "action": "list" }
```

### `series.set_aesthetic`
Always include style + palette + lighting. lens and film have sensible defaults but specifying them locks in tighter consistency.
```json
{
  "action": "set_aesthetic",
  "project": "the-audacity",
  "style": "Hyper-stylized cinematic illustration, glossy editorial drama, late-night talk show glamour",
  "palette": "Rich golds, deep burgundy, midnight black, hot studio whites, occasional electric teal accents",
  "lighting": "Dramatic three-point studio lighting with rim glow, volumetric haze, warm key light",
  "lens": "Shallow depth of field, medium close-ups with bokeh background",
  "film": "Clean high-end digital with subtle film grain, cinematic color grading"
}
```

### `series.explore_aesthetic`
```json
{ "action": "explore_aesthetic", "project": "the-audacity", "count": 5 }
```

---

## character

### `character.add` (human)
```json
{
  "action": "add",
  "project": "the-audacity",
  "name": "VIVIENNE",
  "gender": "female",
  "age": "late 30s",
  "description": "Strikingly beautiful Black woman with high cheekbones, perfectly arched eyebrows, warm brown skin, sleek shoulder-length black hair, full lips, fierce dark brown eyes, statuesque presence",
  "wardrobe": "Tailored designer power suit in deep burgundy with gold statement earrings, killer heels, lapel microphone clipped to her collar",
  "voiceDesc": "Rich warm contralto with honeyed diction that drips sarcasm. Smooth and commanding. Perfect comedic timing with deliberate pauses before punchlines.",
  "skipImages": false
}
```

### `character.add` (non-human --- e.g. an animal or creature)
Use `baseTraits` to override the default human anatomy hints.
```json
{
  "action": "add",
  "project": "rugrat-saga",
  "name": "PIMON",
  "gender": "male",
  "age": "young adult",
  "description": "Sleek silver-tabby cat with intelligent green eyes, a slight nick in the left ear, expressive whiskers",
  "wardrobe": "Worn leather collar with a brass key charm",
  "baseTraits": "tabby cat, feline, four legs, no thumbs, fur"
}
```

### `character.audition_voices`
Generates 5 candidate voices. Sample text defaults to a generic line; pass one that captures the character's typical cadence for better picks.
```json
{
  "action": "audition_voices",
  "project": "the-audacity",
  "character": "VIVIENNE",
  "sampleText": "Bless your heart, but you absolutely do NOT have the audacity for what you're about to ask me.",
  "count": 5
}
```

### `character.lock`
```json
{
  "action": "lock",
  "project": "the-audacity",
  "character": "VIVIENNE",
  "voiceId": "Serena",
  "voiceName": "Serena"
}
```

---

## episode

### `episode.new`
```json
{
  "action": "new",
  "project": "the-audacity",
  "title": "The Audacity of Hustle Culture"
}
```

### `episode.workshop`
LLM-drafts the shot-by-shot script via Venice chat completions. Stop and let the user review/edit the output before approving.
```json
{
  "action": "workshop",
  "project": "the-audacity",
  "episode": 1,
  "concept": "Vivienne demolishes the modern hustle-culture gospel after Chad pitches her his crypto-coaching empire.",
  "model": "llama-3.3-70b"
}
```

### `episode.approve`
```json
{ "action": "approve", "project": "the-audacity", "episode": 1, "notes": "Locked --- ship it." }
```

### `episode.storyboard`
Generates panels for every shot in the approved script. Refinement is on by default (multi-edit pass to fix character drift). Set `force: true` to regenerate panels that already exist.
```json
{
  "action": "storyboard",
  "project": "the-audacity",
  "episode": 1,
  "refine": true,
  "editModel": "seedream-v5-lite-edit",
  "cfgScale": 10,
  "skipApproval": false,
  "force": false,
  "debug": false
}
```

### `episode.qa`
Vision-based QA against character references. Optional `shots` filter for re-checking specific shots.
```json
{
  "action": "qa",
  "project": "the-audacity",
  "episode": 1,
  "model": "qwen-2.5-vl",
  "shots": "3-7"
}
```

### `episode.qa_approve`
```json
{ "action": "qa_approve", "project": "the-audacity", "episode": 1 }
```

### `episode.fix_panel`
Multi-edit a single panel to correct drift. Pass `characters` if only specific characters need correction; pass `prompt` to override the auto-generated edit prompt.
```json
{
  "action": "fix_panel",
  "project": "the-audacity",
  "episode": 1,
  "shot": 5,
  "characters": "VIVIENNE,CHAD",
  "editModel": "seedream-v5-lite-edit"
}
```

### `episode.insert_shot`
Add a new shot to an approved script after a specific shot id. The harness assigns a suffix-letter id (`5b`, `5c`, ...) so existing shot numbers stay stable for already-rendered panels and clips. After inserting, re-run `episode.storyboard` and `media.generate_videos` to materialize the new shot only — existing shots are not regenerated.

```json
{
  "action": "insert_shot",
  "project": "the-audacity",
  "episode": 1,
  "after": "5",
  "description": "Wide reaction shot: studio audience erupts in laughter; Vivienne smirks while Chad's confidence visibly cracks.",
  "shotType": "action",
  "duration": "4s",
  "motion": "high",
  "characters": "VIVIENNE,CHAD",
  "transition": "CUT"
}
```

With dialogue (speaker is required when dialogue is set):

```json
{
  "action": "insert_shot",
  "project": "the-audacity",
  "episode": 1,
  "after": "5b",
  "description": "Vivienne leans into the camera, deadpan close-up.",
  "shotType": "close-up",
  "duration": "3s",
  "motion": "low",
  "characters": "VIVIENNE",
  "dialogue": "Bless your heart, Chad.",
  "speaker": "VIVIENNE",
  "transition": "FADE"
}
```

---

## media

### `media.generate_videos`
Long-running. Set a `progressToken` in `_meta` to receive shot-by-shot updates. Use `skipQa: true` only if you've already manually verified the storyboard.
```json
{
  "action": "generate_videos",
  "project": "the-audacity",
  "episode": 1,
  "skipQa": false
}
```

### `media.override_audio`
Replace the model-native audio with Venice TTS dialogue and/or generated SFX.
```json
{
  "action": "override_audio",
  "project": "the-audacity",
  "episode": 1,
  "dialogue": true,
  "sfx": true
}
```

### `media.generate_music`
```json
{
  "action": "generate_music",
  "project": "the-audacity",
  "episode": 1,
  "prompt": "Late-night talk show theme: brassy, confident, slightly sarcastic, with a wink. 110 BPM.",
  "duration": "60"
}
```

### `media.validate`
Default validates the assembled episode. Set `videoOutputs: true` to check raw shot orientation/duration before assembly.
```json
{ "action": "validate", "project": "the-audacity", "episode": 1, "videoOutputs": true }
```

---

## assemble

### `assemble.assemble`
Final mix. All flags default to `true` --- pass `false` to skip a layer.
```json
{
  "action": "assemble",
  "project": "the-audacity",
  "episode": 1,
  "subtitles": true,
  "music": true,
  "ambient": true,
  "ambientVolume": 0.3,
  "dialogueReplace": true,
  "nativeVolume": 0.2
}
```

### `assemble.produce`
One-shot: videos -> music -> assemble. Only use after script approval and (ideally) QA approval.
```json
{
  "action": "produce",
  "project": "the-audacity",
  "episode": 1,
  "withTts": true,
  "skipMusic": false
}
```

### `assemble.edit_transcribe`
Always run this before any cut. `--aligned-from` is for content with a ground-truth script (Venice TTS, scripted reads).
```json
{
  "action": "edit_transcribe",
  "dir": "output/raw-takes/2026-05-04",
  "out": "output/raw-takes/edit/takes_packed.md",
  "model": "base.en",
  "language": "en",
  "include": "*.mp4,*.mov,*.m4a,*.wav,*.mp3",
  "alignedFrom": "scripts/raw-takes/config.ts",
  "speakerMap": "scripts/raw-takes/speaker-map.json"
}
```

### `assemble.edit_render`
Composites overlays (drawtext + WebM/PNG sequences) onto a base video using a manifest. Always preserves prior renders via versioned filenames.
```json
{
  "action": "edit_render",
  "manifest": "output/raw-takes/edit/overlays.json",
  "font": "/Library/Fonts/Arial Unicode.ttf",
  "skipArchive": false,
  "dryRun": false
}
```

### `assemble.edit_timeline`
Single PNG (filmstrip + waveform + optional word labels) for one segment of a video. Used at decision points during cut review --- not for blanket frame dumping.
```json
{
  "action": "edit_timeline",
  "video": "output/raw-takes/edit/final-edit.mp4",
  "start": 12.3,
  "end": 16.1,
  "out": "/tmp/cut-review-12-16.png",
  "width": 1600,
  "frames": 8,
  "silenceDb": -30,
  "silenceMin": 0.18,
  "wordsJson": "output/raw-takes/edit/final.words.json"
}
```

### `assemble.export_timeline`
Export a finished episode as an XML timeline you can import into Final Cut Pro X, Premiere Pro, or DaVinci Resolve and continue cutting. Requires `media.generate_videos` to have completed — there's nothing to lay onto a timeline otherwise. The output filename uses a format-specific extension so multiple exports can coexist:

| `format`   | Output                                          | Editor              |
|------------|-------------------------------------------------|---------------------|
| `fcpxml`   | `episode-NNN.fcpxml`                            | Final Cut Pro X     |
| `premiere` | `episode-NNN.premiere.xml` (xmeml v5)           | Adobe Premiere Pro  |
| `davinci`  | `episode-NNN.resolve.fcpxml` (DaVinci-tuned)    | DaVinci Resolve     |

```json
{
  "action": "export_timeline",
  "project": "the-audacity",
  "episode": 1,
  "format": "fcpxml",
  "fps": 24,
  "width": 1920,
  "height": 1080
}
```

For Premiere:
```json
{ "action": "export_timeline", "project": "the-audacity", "episode": 1, "format": "premiere" }
```

For DaVinci Resolve:
```json
{ "action": "export_timeline", "project": "the-audacity", "episode": 1, "format": "davinci" }
```

---

## inspect

### `inspect.list`
```json
{ "action": "list" }
```

### `inspect.series`
```json
{ "action": "series", "project": "the-audacity" }
```

### `inspect.episode`
```json
{ "action": "episode", "project": "the-audacity", "episode": 1 }
```

### `inspect.shot`
```json
{ "action": "shot", "project": "the-audacity", "episode": 1, "shot": 5 }
```

### `inspect.models`
```json
{ "action": "models", "category": "video" }
```
Categories: `video`, `image`, `edit`, `tts`, `music`, `sfx`, `all`.

### `inspect.voices`
```json
{ "action": "voices", "provider": "kokoro" }
```
Providers: `kokoro`, `qwen3`, `all`.

---

## Failure response shape

When a tool call fails, the structuredContent looks like:
```json
{
  "ok": false,
  "message": "harness command failed (exit 1)",
  "command": "venice-video storyboard-episode -p ... -e 1 ...",
  "code": 1,
  "stdoutTail": "...last 30 lines of stdout...",
  "stderrTail": "...last 30 lines of stderr..."
}
```

Read `stderrTail` first --- the harness writes structured errors there.
