import fs from "node:fs";
import path from "node:path";

let cachedSystemPrompt: string | null = null;

export function loadSystemPrompt(): string {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt;
  }

  const promptPath = path.resolve(process.cwd(), "system.md");
  const rawPrompt = fs.readFileSync(promptPath, "utf8").trim();

  if (!rawPrompt) {
    throw new Error("system.md exists but is empty.");
  }

  cachedSystemPrompt = rawPrompt;
  return cachedSystemPrompt;
}

export function clearSystemPromptCache(): void {
  cachedSystemPrompt = null;
}
