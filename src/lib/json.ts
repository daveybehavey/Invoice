export function parseJsonFromModel<T>(raw: string): T {
  const normalized = stripMarkdownCodeFence(raw);

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const objectStart = normalized.indexOf("{");
    const objectEnd = normalized.lastIndexOf("}");

    if (objectStart === -1 || objectEnd === -1 || objectEnd <= objectStart) {
      throw new Error("Model response did not contain valid JSON.");
    }

    const possibleJson = normalized.slice(objectStart, objectEnd + 1);
    return JSON.parse(possibleJson) as T;
  }
}

function stripMarkdownCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}
