import { z } from 'zod';

const Project = z.string().min(1).describe('Series slug or absolute path to a series output directory');
const toNumber = (value: unknown): unknown => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return value;
};
const coercePositiveInt = (opts: { min?: number; max?: number } = {}) => {
  let schema = z.number().int().positive().finite();
  if (opts.min !== undefined) schema = schema.min(opts.min);
  if (opts.max !== undefined) schema = schema.max(opts.max);
  return z.preprocess(toNumber, schema);
};
const coerceFiniteNumber = (opts: { min?: number; max?: number } = {}) => {
  let schema = z.number().finite();
  if (opts.min !== undefined) schema = schema.min(opts.min);
  if (opts.max !== undefined) schema = schema.max(opts.max);
  return z.preprocess(toNumber, schema);
};
const Episode = coercePositiveInt().describe('Episode number (1-based)');
const Shot = coercePositiveInt().describe('Shot number (1-based)');

export const SeriesNew = z.object({
  action: z.literal('new'),
  name: z.string().min(1),
  concept: z.string().min(1),
  genre: z.string().default('drama'),
  setting: z.string().default(''),
}).strict();

export const SeriesList = z.object({
  action: z.literal('list'),
}).strict();

export const SeriesSetAesthetic = z.object({
  action: z.literal('set_aesthetic'),
  project: Project,
  style: z.string().min(1),
  palette: z.string().min(1),
  lighting: z.string().min(1),
  lens: z.string().default('cinematic depth of field'),
  film: z.string().default('digital illustration'),
}).strict();

export const SeriesExploreAesthetic = z.object({
  action: z.literal('explore_aesthetic'),
  project: Project,
  count: coercePositiveInt({ min: 1, max: 7 }).default(5),
}).strict();

export const SeriesInput = z.discriminatedUnion('action', [
  SeriesNew,
  SeriesList,
  SeriesSetAesthetic,
  SeriesExploreAesthetic,
]);

export const CharacterAdd = z.object({
  action: z.literal('add'),
  project: Project,
  name: z.string().min(1),
  gender: z.enum(['male', 'female', 'other']),
  age: z.string().default('mid 20s'),
  description: z.string().optional(),
  wardrobe: z.string().default('stylish contextual attire'),
  voiceDesc: z.string().optional(),
  baseTraits: z.string().optional(),
  skipImages: z.boolean().default(false),
}).strict();

export const CharacterAuditionVoices = z.object({
  action: z.literal('audition_voices'),
  project: Project,
  character: z.string().min(1),
  sampleText: z.string().optional(),
  count: coercePositiveInt({ min: 1, max: 10 }).default(5),
}).strict();

export const CharacterLock = z.object({
  action: z.literal('lock'),
  project: Project,
  character: z.string().min(1),
  voiceId: z.string().min(1),
  voiceName: z.string().optional(),
}).strict();

export const CharacterInput = z.discriminatedUnion('action', [
  CharacterAdd,
  CharacterAuditionVoices,
  CharacterLock,
]);

export const EpisodeNew = z.object({
  action: z.literal('new'),
  project: Project,
  title: z.string().min(1),
}).strict();

export const EpisodeWorkshop = z.object({
  action: z.literal('workshop'),
  project: Project,
  episode: Episode,
  concept: z.string().min(1),
  model: z.string().default('llama-3.3-70b'),
}).strict();

export const EpisodeApprove = z.object({
  action: z.literal('approve'),
  project: Project,
  episode: Episode,
  notes: z.string().optional(),
}).strict();

export const EpisodeStoryboard = z.object({
  action: z.literal('storyboard'),
  project: Project,
  episode: Episode,
  refine: z.boolean().default(true),
  editModel: z.string().default('seedream-v5-lite-edit'),
  cfgScale: coerceFiniteNumber({ min: 1, max: 10 }).optional(),
  debug: z.boolean().default(false),
  skipApproval: z.boolean().default(false),
  force: z.boolean().default(false),
}).strict();

export const EpisodeQa = z.object({
  action: z.literal('qa'),
  project: Project,
  episode: Episode,
  model: z.string().default('qwen-2.5-vl'),
  shots: z.string().optional(),
}).strict();

export const EpisodeQaApprove = z.object({
  action: z.literal('qa_approve'),
  project: Project,
  episode: Episode,
  notes: z.string().optional(),
}).strict();

export const EpisodeFixPanel = z.object({
  action: z.literal('fix_panel'),
  project: Project,
  episode: Episode,
  shot: Shot,
  characters: z.string().optional().describe('Comma-separated character names'),
  editModel: z.string().default('seedream-v5-lite-edit'),
  prompt: z.string().optional(),
}).strict();

export const EpisodeInput = z.discriminatedUnion('action', [
  EpisodeNew,
  EpisodeWorkshop,
  EpisodeApprove,
  EpisodeStoryboard,
  EpisodeQa,
  EpisodeQaApprove,
  EpisodeFixPanel,
]);

export const MediaGenerateVideos = z.object({
  action: z.literal('generate_videos'),
  project: Project,
  episode: Episode,
  skipQa: z.boolean().default(false),
}).strict();

export const MediaOverrideAudio = z.object({
  action: z.literal('override_audio'),
  project: Project,
  episode: Episode,
  dialogue: z.boolean().default(false),
  sfx: z.boolean().default(false),
}).strict();

export const MediaGenerateMusic = z.object({
  action: z.literal('generate_music'),
  project: Project,
  episode: Episode,
  prompt: z.string().optional(),
  duration: z.string().default('60'),
}).strict();

export const MediaValidate = z.object({
  action: z.literal('validate'),
  project: Project,
  episode: Episode,
  videoOutputs: z.boolean().default(false).describe('Run validate-video-outputs instead of validate-episode'),
}).strict();

export const MediaInput = z.discriminatedUnion('action', [
  MediaGenerateVideos,
  MediaOverrideAudio,
  MediaGenerateMusic,
  MediaValidate,
]);

export const AssembleAssemble = z.object({
  action: z.literal('assemble'),
  project: Project,
  episode: Episode,
  subtitles: z.boolean().default(true),
  music: z.boolean().default(true),
  ambient: z.boolean().default(true),
  ambientVolume: coerceFiniteNumber({ min: 0, max: 1 }).default(0.3),
  dialogueReplace: z.boolean().default(true),
  nativeVolume: coerceFiniteNumber({ min: 0, max: 1 }).default(0.2),
}).strict();

export const AssembleProduce = z.object({
  action: z.literal('produce'),
  project: Project,
  episode: Episode,
  withTts: z.boolean().default(false),
  skipMusic: z.boolean().default(false),
}).strict();

export const AssembleEditTranscribe = z.object({
  action: z.literal('edit_transcribe'),
  dir: z.string().min(1).describe('Directory of source media files'),
  out: z.string().min(1).describe('Output path for takes_packed.md'),
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large', 'tiny.en', 'base.en', 'small.en', 'medium.en']).default('base.en'),
  language: z.string().default('auto'),
  include: z.string().optional().describe('Comma-separated glob patterns'),
  alignedFrom: z.string().optional().describe('Path to a config file exporting VO_TEXT for aligned mode'),
  speakerMap: z.string().optional(),
  wordsOutDir: z.string().optional(),
  label: z.string().optional(),
}).strict();

export const AssembleEditRender = z.object({
  action: z.literal('edit_render'),
  manifest: z.string().min(1).describe('Overlay manifest JSON path'),
  font: z.string().optional(),
  skipArchive: z.boolean().default(false),
  dryRun: z.boolean().default(false),
}).strict();

export const AssembleEditTimeline = z.object({
  action: z.literal('edit_timeline'),
  video: z.string().min(1),
  out: z.string().min(1),
  start: coerceFiniteNumber({ min: 0 }),
  end: coerceFiniteNumber({ min: 0 }),
  width: coercePositiveInt({ max: 8192 }).default(1600),
  frames: coercePositiveInt({ max: 64 }).default(8),
  silenceDb: coerceFiniteNumber({ min: -100, max: 0 }).default(-30),
  silenceMin: coerceFiniteNumber({ min: 0, max: 10 }).default(0.18),
  wordsJson: z.string().optional(),
}).strict();

export const AssembleInput = z.discriminatedUnion('action', [
  AssembleAssemble,
  AssembleProduce,
  AssembleEditTranscribe,
  AssembleEditRender,
  AssembleEditTimeline,
]);

export const InspectInput = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('series'),
    project: Project,
  }).strict(),
  z.object({
    action: z.literal('episode'),
    project: Project,
    episode: Episode,
  }).strict(),
  z.object({
    action: z.literal('shot'),
    project: Project,
    episode: Episode,
    shot: Shot,
  }).strict(),
  z.object({
    action: z.literal('models'),
    category: z.enum(['video', 'image', 'edit', 'tts', 'music', 'sfx', 'all']).default('all'),
  }).strict(),
  z.object({
    action: z.literal('voices'),
    provider: z.enum(['kokoro', 'qwen3', 'all']).default('all'),
  }).strict(),
  z.object({
    action: z.literal('list'),
  }).strict(),
]);

export type SeriesInputT = z.infer<typeof SeriesInput>;
export type CharacterInputT = z.infer<typeof CharacterInput>;
export type EpisodeInputT = z.infer<typeof EpisodeInput>;
export type MediaInputT = z.infer<typeof MediaInput>;
export type AssembleInputT = z.infer<typeof AssembleInput>;
export type InspectInputT = z.infer<typeof InspectInput>;

export const SeriesShape = z.object({
  action: z.enum(['new', 'list', 'set_aesthetic', 'explore_aesthetic'])
    .describe('Action: new=create series, list=list all, set_aesthetic=lock aesthetic, explore_aesthetic=generate samples'),
  name: z.string().optional().describe('(new) series name'),
  concept: z.string().optional().describe('(new) series concept/premise'),
  genre: z.string().optional().describe('(new) genre, default "drama"'),
  setting: z.string().optional().describe('(new) general setting description'),
  project: Project.optional().describe('(set_aesthetic, explore_aesthetic) series slug or path'),
  style: z.string().optional().describe('(set_aesthetic) visual style'),
  palette: z.string().optional().describe('(set_aesthetic) color palette'),
  lighting: z.string().optional().describe('(set_aesthetic) lighting approach'),
  lens: z.string().optional().describe('(set_aesthetic) lens characteristics'),
  film: z.string().optional().describe('(set_aesthetic) film stock/texture'),
  count: z.coerce.number().int().min(1).max(7).optional().describe('(explore_aesthetic) number of variants, default 5'),
}).shape;

export const CharacterShape = z.object({
  action: z.enum(['add', 'audition_voices', 'lock'])
    .describe('Action: add=create character, audition_voices=audition Venice voices, lock=lock chosen voice'),
  project: Project.describe('series slug or path'),
  name: z.string().optional().describe('(add) character name'),
  gender: z.enum(['male', 'female', 'other']).optional().describe('(add) gender'),
  age: z.string().optional().describe('(add) age description, default "mid 20s"'),
  description: z.string().optional().describe('(add) physical description'),
  wardrobe: z.string().optional().describe('(add) default wardrobe'),
  voiceDesc: z.string().optional().describe('(add) voice description'),
  baseTraits: z.string().optional().describe('(add) custom base traits override'),
  skipImages: z.boolean().optional().describe('(add) skip reference image generation'),
  character: z.string().optional().describe('(audition_voices, lock) character name'),
  sampleText: z.string().optional().describe('(audition_voices) sample line'),
  count: z.coerce.number().int().min(1).max(10).optional().describe('(audition_voices) candidate count, default 5'),
  voiceId: z.string().optional().describe('(lock) Venice voice ID'),
  voiceName: z.string().optional().describe('(lock) display name'),
}).shape;

export const EpisodeShape = z.object({
  action: z.enum(['new', 'workshop', 'approve', 'storyboard', 'qa', 'qa_approve', 'fix_panel'])
    .describe('Action: new, workshop (LLM-generate script), approve, storyboard (generate panels), qa (vision QA), qa_approve, fix_panel (multi-edit refine)'),
  project: Project.describe('series slug or path'),
  episode: Episode.optional().describe('episode number (required for all actions except new where it is auto-assigned)'),
  title: z.string().optional().describe('(new) episode title'),
  concept: z.string().optional().describe('(workshop) episode concept'),
  model: z.string().optional().describe('(workshop) chat model, default llama-3.3-70b; (qa) vision model, default qwen-2.5-vl'),
  notes: z.string().optional().describe('(approve, qa_approve) approval notes'),
  refine: z.boolean().optional().describe('(storyboard) run multi-edit refinement, default true'),
  editModel: z.string().optional().describe('(storyboard, fix_panel) edit model, default seedream-v5-lite-edit'),
  cfgScale: z.coerce.number().optional().describe('(storyboard) prompt adherence 1-10'),
  debug: z.boolean().optional().describe('(storyboard) save prompt payloads'),
  skipApproval: z.boolean().optional().describe('(storyboard) skip script approval check'),
  force: z.boolean().optional().describe('(storyboard) regenerate all panels'),
  shots: z.string().optional().describe('(qa) shot range like "3-7" or "3,5,7"'),
  shot: Shot.optional().describe('(fix_panel) shot number'),
  characters: z.string().optional().describe('(fix_panel) comma-separated character names'),
  prompt: z.string().optional().describe('(fix_panel) custom edit prompt'),
}).shape;

export const MediaShape = z.object({
  action: z.enum(['generate_videos', 'override_audio', 'generate_music', 'validate'])
    .describe('Action: generate_videos (long-running), override_audio (Venice TTS or SFX), generate_music, validate'),
  project: Project.describe('series slug or path'),
  episode: Episode.describe('episode number'),
  skipQa: z.boolean().optional().describe('(generate_videos) skip QA approval check'),
  dialogue: z.boolean().optional().describe('(override_audio) override dialogue with Venice TTS'),
  sfx: z.boolean().optional().describe('(override_audio) generate SFX overrides'),
  prompt: z.string().optional().describe('(generate_music) music style/mood'),
  duration: z.string().optional().describe('(generate_music) seconds, default 60'),
  videoOutputs: z.boolean().optional().describe('(validate) run validate-video-outputs instead of validate-episode'),
}).shape;

export const AssembleShape = z.object({
  action: z.enum(['assemble', 'produce', 'edit_transcribe', 'edit_render', 'edit_timeline'])
    .describe('Action: assemble (mix audio + burn subs), produce (full pipeline), edit_transcribe, edit_render (overlays), edit_timeline (filmstrip+waveform PNG)'),
  project: Project.optional().describe('(assemble, produce) series slug or path'),
  episode: Episode.optional().describe('(assemble, produce) episode number'),
  subtitles: z.boolean().optional().describe('(assemble) burn-in subtitles, default true'),
  music: z.boolean().optional().describe('(assemble) mix music, default true'),
  ambient: z.boolean().optional().describe('(assemble) mix ambient bed, default true'),
  ambientVolume: z.coerce.number().optional().describe('(assemble) ambient volume 0-1, default 0.3'),
  dialogueReplace: z.boolean().optional().describe('(assemble) Venice dialogue replacement, default true'),
  nativeVolume: z.coerce.number().optional().describe('(assemble) native audio volume when dialogue replaced, default 0.2'),
  withTts: z.boolean().optional().describe('(produce) add Venice TTS replacement'),
  skipMusic: z.boolean().optional().describe('(produce) skip background music'),
  dir: z.string().optional().describe('(edit_transcribe) source media directory'),
  out: z.string().optional().describe('(edit_transcribe, edit_timeline) output path'),
  model: z.enum(['tiny', 'base', 'small', 'medium', 'large', 'tiny.en', 'base.en', 'small.en', 'medium.en']).optional().describe('(edit_transcribe) whisper model, default base.en'),
  language: z.string().optional().describe('(edit_transcribe) language, default auto'),
  include: z.string().optional().describe('(edit_transcribe) glob patterns'),
  alignedFrom: z.string().optional().describe('(edit_transcribe) path to config exporting VO_TEXT'),
  speakerMap: z.string().optional().describe('(edit_transcribe) speaker map JSON path'),
  wordsOutDir: z.string().optional().describe('(edit_transcribe) words.json output dir'),
  label: z.string().optional().describe('(edit_transcribe) source label'),
  manifest: z.string().optional().describe('(edit_render) overlay manifest JSON path'),
  font: z.string().optional().describe('(edit_render) font path'),
  skipArchive: z.boolean().optional().describe('(edit_render) skip archive of existing'),
  dryRun: z.boolean().optional().describe('(edit_render) print ffmpeg command without executing'),
  video: z.string().optional().describe('(edit_timeline) video file'),
  start: z.coerce.number().optional().describe('(edit_timeline) start sec'),
  end: z.coerce.number().optional().describe('(edit_timeline) end sec'),
  width: z.coerce.number().int().positive().optional().describe('(edit_timeline) PNG width, default 1600'),
  frames: z.coerce.number().int().positive().optional().describe('(edit_timeline) filmstrip frame count, default 8'),
  silenceDb: z.coerce.number().optional().describe('(edit_timeline) silence dB threshold, default -30'),
  silenceMin: z.coerce.number().optional().describe('(edit_timeline) min silence sec, default 0.18'),
  wordsJson: z.string().optional().describe('(edit_timeline) words.json for word labels'),
}).shape;

export const InspectShape = z.object({
  action: z.enum(['list', 'series', 'episode', 'shot', 'models', 'voices'])
    .describe('Action: list (all series), series (state), episode (status + scripts), shot (files), models (registry), voices (catalog)'),
  project: Project.optional().describe('(series, episode, shot)'),
  episode: Episode.optional().describe('(episode, shot)'),
  shot: Shot.optional().describe('(shot)'),
  category: z.enum(['video', 'image', 'edit', 'tts', 'music', 'sfx', 'all']).optional().describe('(models) filter category, default all'),
  provider: z.enum(['kokoro', 'qwen3', 'all']).optional().describe('(voices) filter provider, default all'),
}).shape;
