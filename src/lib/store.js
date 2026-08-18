import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX = 80;

export function createStore(dataDir, onAdd) {
  const file = path.join(dataDir, "samples.json");
  let samples = [];

  async function load() {
    try {
      const raw = await readFile(file, "utf8");
      samples = JSON.parse(raw);
      if (!Array.isArray(samples)) samples = [];
    } catch {
      samples = [];
    }
    const n = samples.length;
    samples = samples.filter((s) => !s.pending);
    if (samples.length !== n) await persist();
  }

  async function persist() {
    await mkdir(dataDir, { recursive: true });
    await writeFile(file, JSON.stringify(samples, null, 2));
  }

  return {
    load,
    list() {
      return samples.slice().reverse();
    },
    async add(sample) {
      samples.push(sample);
      if (samples.length > MAX) samples = samples.slice(-MAX);
      await persist();
      onAdd?.(sample);
      return sample;
    },
    async update(id, patch) {
      const index = samples.findIndex((s) => s.id === id);
      if (index < 0) return null;
      samples[index] = { ...samples[index], ...patch };
      await persist();
      onAdd?.(samples[index]);
      return samples[index];
    },
    async clear() {
      samples = [];
      await persist();
    },
  };
}
