import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (file) => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const manifest = await json('frontend/src/data/briefingAudio.json');
const rules = await json('frontend/src/data/rulesVideo.json');
const topics = await json('frontend/src/data/practiceTopics.json');

// The player deliberately skips recordings whose script differs. Catch stale narration
// here so editing a caption cannot silently remove the sound from a whole scene.
for (const [key, scenes] of [['_rules', rules.scenes], ...topics.map((topic) => [topic.topicId, topic.briefing.scenes])]) {
  test(`${key}: every scene has audible narration for its current script`, async () => {
    for (const [index, scene] of scenes.entries()) {
      const label = `${key}, scene ${index}: ${scene.title}`;
      const clip = manifest[key]?.[index];
      assert.ok(clip, `${label}: missing recording`);
      assert.deepEqual(clip.lines, scene.lines, `${label}: regenerate the narration after changing the script`);
      const digest = createHash('sha1').update(scene.lines.join('\n')).digest('hex').slice(0, 10);
      assert.equal(path.posix.basename(clip.file), `scene${index}-${digest}.mp3`, `${label}: stale audio file`);
      const file = await stat(path.join(root, 'frontend/public', clip.file));
      assert.ok(file.size > 1000, `${label}: missing or empty MP3`);
      assert.ok(clip.seconds > 0 && /[1-9]/.test(clip.mouth), `${label}: empty narration`);
      assert.ok(Math.abs(clip.mouth.length * 0.08 - clip.seconds) < 0.1, `${label}: animation and audio timing differ`);
    }
  });
}
