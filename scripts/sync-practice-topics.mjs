// Copies the reviewed topics into the frontend for the offline practice mode.
// The backend JSON stays the only source; backend/tests/test_practice_data.py checks the copy.
import { readdir, readFile, writeFile } from "node:fs/promises";

const source = new URL("../backend/app/content/topics/", import.meta.url);
const names = (await readdir(source)).filter((name) => name.endsWith(".json")).sort();
const topics = await Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(name, source), "utf8"))));
await writeFile(new URL("../frontend/src/data/practiceTopics.json", import.meta.url), JSON.stringify(topics, null, 2) + "\n", "utf8");
console.log(`Synced ${topics.length} topics to frontend/src/data/practiceTopics.json`);
