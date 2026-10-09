import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { getTutorialVoiceLines } from "../src/tutorial/tutorialVoiceLines.js";
import { TUTORIAL_VOICES, TUTORIAL_VOICE_NAME, TUTORIAL_VOICE_TIMINGS } from "../src/tutorial/tutorialVoiceCatalog.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = new URL("../asset-sources/voices/xiaotao/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("generated-audios.json", source), "utf8"));
const voice = JSON.parse(readFileSync(new URL("voice.json", source), "utf8"));
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ?
  Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;

test("published tutorial recordings match the current text and selected voice", () => {
  const lines = getTutorialVoiceLines();
  assert.equal(new Set(lines.map(({ id }) => id)).size, lines.length);
  assert.equal(new Set(lines.map(({ text }) => text)).size, lines.length);
  assert.equal(Object.keys(manifest.clips).length, lines.length, "Every tutorial dialogue needs a recording");
  assert.equal(Object.keys(TUTORIAL_VOICES).length, Object.keys(manifest.clips).length);
  assert.equal(manifest.voice, TUTORIAL_VOICE_NAME);
  assert.equal(manifest.model, "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign");
  assert.equal(manifest.method, "voice_design");
  for (const [id, clip] of Object.entries(manifest.clips)) {
    const line = lines.find((line) => line.id === id);
    assert.ok(line, `Unknown dialogue: ${id}`);
    const { text } = line;
    assert.equal(TUTORIAL_VOICES[text], `/audios/xiaotao/${clip.file}`, id);
    assert.equal(clip.text, text, `Stale recording: ${id}`);
    const profileName = voice.line_profiles?.[id];
    let parameters = manifest.seed + manifest.design_description;
    if (profileName) {
      const profile = voice.delivery_profiles[profileName];
      const recipe = { profile: profileName, seed: profile.seed ?? voice.generation_seed,
        description: voice.design_description + profile.description_suffix,
        generation: { ...manifest.generation, ...profile.generation }, audio_processing: profile.audio_processing };
      assert.deepEqual(clip.recipe, recipe, id);
      parameters = JSON.stringify(canonical(recipe));
    } else assert.equal(clip.recipe, undefined, id);
    assert.equal(clip.fingerprint, hash(manifest.model + manifest.reference_sha256 + parameters + text), id);
    const originalInvitation = id === "invitation" && text === readFileSync(new URL("reference.txt", source), "utf8").trim();
    assert.equal(clip.method, originalInvitation ? "original_selected_audition" : "voice_design", id);
    const file = new URL(`../public/audios/xiaotao/${clip.file}`, import.meta.url);
    assert.ok(statSync(file).size > 5000, `Empty recording: ${id}`);
    assert.equal(hash(readFileSync(file)), clip.sha256, `Damaged recording: ${id}`);
    assert.ok(clip.duration_seconds > 1 && clip.duration_seconds < 60, id);
  }
});

test("the voice reference is the selected energetic sweet audition", () => {
  const voice = JSON.parse(readFileSync(new URL("voice.json", source), "utf8"));
  const referenceHash = hash(readFileSync(new URL("reference.wav", source)));
  assert.equal(voice.name, "元气甜妹");
  assert.equal(referenceHash, voice.reference_sha256);
  assert.equal(referenceHash, manifest.reference_sha256);
  const referenceText = readFileSync(new URL("reference.txt", source), "utf8").trim();
  const invitation = manifest.clips.invitation;
  if (referenceText === getTutorialVoiceLines()[0].text) {
    assert.equal(invitation.method, "original_selected_audition");
    assert.equal(invitation.sha256, referenceHash);
  } else {
    assert.equal(invitation.method, "voice_design");
    assert.notEqual(invitation.sha256, referenceHash);
  }
  assert.equal(voice.generation_method, "voice_design");
  assert.equal(manifest.design_description, voice.design_description);
  assert.ok(referenceText.length > 0);
});

test("every published dialogue has subtitle timings tied to its exact recording and text", () => {
  assert.equal(Object.keys(TUTORIAL_VOICE_TIMINGS).length, getTutorialVoiceLines().length);
  for (const { id, text } of getTutorialVoiceLines()) {
    const clip = manifest.clips[id], length = Array.from(text).length;
    const cues = TUTORIAL_VOICE_TIMINGS[text];
    assert.ok(cues?.length, `Missing subtitle alignment: ${id}`);
    assert.deepEqual(cues, clip.subtitle_cues, id);
    assert.equal(clip.subtitle_alignment.audio_sha256, clip.sha256, id);
    assert.equal(clip.subtitle_alignment.text_sha256, hash(text), id);
    assert.equal(clip.subtitle_alignment.model, "Qwen/Qwen3-ForcedAligner-0.6B", id);
    let previousTime = 0, previousEnd = 0;
    for (const cue of cues) {
      assert.ok(Number.isFinite(cue.time) && cue.time >= previousTime && cue.time <= clip.duration_seconds, id);
      assert.ok(Number.isInteger(cue.end) && cue.end > previousEnd && cue.end <= length, id);
      previousTime = cue.time; previousEnd = cue.end;
    }
    assert.equal(previousEnd, length, id);
  }
});
