import OpenAI from "openai";
import { parseJsonFromModel } from "../lib/json.js";
import { loadSystemPrompt } from "../prompt/systemPrompt.js";

type JsonTaskRunner = <T>(userTaskPrompt: string) => Promise<T>;
type ImageOcrRunner = (input: ImageOcrTaskInput) => Promise<ImageOcrTaskResult>;
type JsonTaskType = "default" | "wording";
type JsonTaskOptions = {
  taskType?: JsonTaskType;
  model?: string;
};
type ImageOcrTaskInput = {
  mimeType: string;
  base64Data: string;
};
type ImageOcrTaskResult = {
  extractedText: string;
  warnings?: string[];
};

let openAIClient: OpenAI | null = null;
let jsonTaskRunnerForTests: JsonTaskRunner | null = null;
let imageOcrRunnerForTests: ImageOcrRunner | null = null;

function getDefaultModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function getDefaultVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini";
}

export function resolveJsonTaskModel(options: JsonTaskOptions = {}): string {
  if (typeof options.model === "string" && options.model.trim().length > 0) {
    return options.model.trim();
  }
  if (options.taskType === "wording") {
    const wordingModel = process.env.OPENAI_WORDING_MODEL?.trim();
    if (wordingModel) {
      return wordingModel;
    }
  }
  return getDefaultModel();
}

function getClient(): OpenAI {
  if (openAIClient) {
    return openAIClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

export async function runJsonTask<T>(
  userTaskPrompt: string,
  options: JsonTaskOptions = {}
): Promise<T> {
  if (jsonTaskRunnerForTests) {
    return jsonTaskRunnerForTests<T>(userTaskPrompt);
  }

  const model = resolveJsonTaskModel(options);

  const runOnce = async (prompt: string): Promise<T> => {
    const completion = await getClient().chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: loadSystemPrompt()
        },
        {
          role: "user",
          content: `${prompt}\n\nReturn only JSON.`
        }
      ]
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    if (!raw) {
      throw new Error("Model returned an empty response.");
    }

    return parseJsonFromModel<T>(raw);
  };

  try {
    return await runOnce(userTaskPrompt);
  } catch (error) {
    const retryPrompt = `${userTaskPrompt}\n\nYou must reply with a single JSON object. Do not include any extra text.`;
    return await runOnce(retryPrompt);
  }
}

export async function runImageOcrTask(input: ImageOcrTaskInput): Promise<ImageOcrTaskResult> {
  if (imageOcrRunnerForTests) {
    return imageOcrRunnerForTests(input);
  }
  const dataUrl = `data:${input.mimeType};base64,${input.base64Data}`;
  const completion = await getClient().chat.completions.create({
    model: getDefaultVisionModel(),
    messages: [
      {
        role: "system",
        content:
          "You extract text from invoice/job-note images. Return JSON only with shape {\"extractedText\":\"...\",\"warnings\":[\"...\"]}. Keep wording as written. Do not summarize."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract all readable text from this image. Include line breaks where clear. If uncertain, add a short warning."
          },
          {
            type: "image_url",
            image_url: { url: dataUrl }
          }
        ] as OpenAI.Chat.Completions.ChatCompletionContentPart[]
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  if (!raw) {
    throw new Error("Model returned an empty OCR response.");
  }
  const parsed = parseJsonFromModel<{
    extractedText?: unknown;
    warnings?: unknown;
  }>(raw);
  const extractedText =
    typeof parsed.extractedText === "string" ? parsed.extractedText.trim() : "";
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return { extractedText, warnings };
}

export function setJsonTaskRunnerForTests(runner: JsonTaskRunner | null): void {
  jsonTaskRunnerForTests = runner;
}

export function setImageOcrRunnerForTests(runner: ImageOcrRunner | null): void {
  imageOcrRunnerForTests = runner;
}
