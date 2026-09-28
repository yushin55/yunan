import { readdir, readFile, writeFile } from "node:fs/promises";
const source = new URL("../backend/app/content/topics/", import.meta.url);
const names = (await readdir(source))
  .filter((name) => name.endsWith(".json"))
  .sort();
const topics = await Promise.all(
  names.map(async (name) =>
    JSON.parse(await readFile(new URL(name, source), "utf8")),
  ),
);
if (new Set(topics.map((topic) => topic.topicId)).size !== topics.length)
  throw new Error("Duplicate topicId");
const active = topics.filter((topic) => topic.active);
await writeFile(
  new URL("../frontend/src/data/topics.json", import.meta.url),
  JSON.stringify(active, null, 2) + "\n",
  "utf8",
);
console.log(
  `Synced ${active.length} active topic packs to the practice mode. Run backend/build.py for complete content validation.`,
);
