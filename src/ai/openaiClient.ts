import OpenAI, { toFile } from "openai";
import { parseJsonFromModel } from "../lib/json.js";
import { loadSystemPrompt } from "../prompt/systemPrompt.js";

type JsonTaskRunner = <T>(userTaskPrompt: string, options?: JsonTaskOptions) => Promise<T>;
type ImageOcrRunner = (input: ImageOcrTaskInput) => Promise<ImageOcrTaskResult>;
type AudioTranscriptionRunner = (input: AudioTranscriptionTaskInput) => Promise<AudioTranscriptionTaskResult>;
type JsonTaskType = "default" | "wording";
type JsonTaskOptions = {
  taskType?: JsonTaskType;
  model?: string;
  maxCompletionTokens?: number;
  disableStructuredJsonResponse?: boolean;
};
type JsonTaskConfig = {
  model: string;
  systemPrompt: string;
  maxCompletionTokens?: number;
  temperature?: number;
  responseFormat?:
    | OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"]
    | undefined;
};
type ImageOcrTaskInput = {
  mimeType: string;
  base64Data: string;
};
type ImageOcrTaskResult = {
  extractedText: string;
  warnings?: string[];
};
type AudioTranscriptionTaskInput = {
  mimeType: string;
  fileName: string;
  fileData: Buffer;
};
type AudioTranscriptionTaskResult = {
  transcript: string;
};

let openAIClient: OpenAI | null = null;
let jsonTaskRunnerForTests: JsonTaskRunner | null = null;
let imageOcrRunnerForTests: ImageOcrRunner | null = null;
let audioTranscriptionRunnerForTests: AudioTranscriptionRunner | null = null;

const WORDING_SYSTEM_PROMPT = [
  "You rewrite invoice wording only.",
  "Preserve every number, date, id, quantity, rate, amount, total, and line-item order exactly.",
  "Do not add, remove, merge, split, or reorder line items.",
  'Do not start descriptions with prepositions like "of", "for", or "with".',
  "For short trade descriptions, prefer concise service noun phrases like 'Sink repair and cartridge replacement'.",
  "Return valid JSON only."
].join(" ");

function getDefaultModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function getDefaultWordingModel(): string {
  const configuredWordingModel = process.env.OPENAI_WORDING_MODEL?.trim();
  if (configuredWordingModel) {
    return configuredWordingModel;
  }
  const fallbackWordingModel = process.env.OPENAI_WORDING_MODEL_FALLBACK?.trim();
  if (fallbackWordingModel) {
    return fallbackWordingModel;
  }
  return getDefaultModel();
}

function getDefaultVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini";
}

function getDefaultAudioModel(): string {
  return process.env.OPENAI_AUDIO_MODEL ?? "gpt-4o-mini-transcribe";
}

export function resolveJsonTaskModel(options: JsonTaskOptions = {}): string {
  if (typeof options.model === "string" && options.model.trim().length > 0) {
    return options.model.trim();
  }
  if (options.taskType === "wording") {
    return getDefaultWordingModel();
  }
  return getDefaultModel();
}

export function resolveJsonTaskConfig(options: JsonTaskOptions = {}): JsonTaskConfig {
  const model = resolveJsonTaskModel(options);
  if (options.taskType === "wording") {
    return {
      model,
      systemPrompt: WORDING_SYSTEM_PROMPT,
      temperature: 0.2,
      maxCompletionTokens:
        Number.isFinite(options.maxCompletionTokens) && Number(options.maxCompletionTokens) > 0
          ? Math.floor(Number(options.maxCompletionTokens))
          : 400,
      responseFormat: options.disableStructuredJsonResponse ? undefined : { type: "json_object" }
    };
  }

  return {
    model,
    systemPrompt: loadSystemPrompt()
  };
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
    return jsonTaskRunnerForTests<T>(userTaskPrompt, options);
  }

  const config = resolveJsonTaskConfig(options);

  const runOnce = async (prompt: string, taskConfig: JsonTaskConfig): Promise<T> => {
    const completion = await getClient().chat.completions.create({
      model: taskConfig.model,
      max_completion_tokens: taskConfig.maxCompletionTokens,
      temperature: taskConfig.temperature,
      response_format: taskConfig.responseFormat,
      messages: [
        {
          role: "system",
          content: taskConfig.systemPrompt
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
    return await runOnce(userTaskPrompt, config);
  } catch (error) {
    const retryOptions: JsonTaskOptions =
      options.taskType === "wording"
        ? {
            ...options,
            disableStructuredJsonResponse: true,
            maxCompletionTokens: Math.min(
              2200,
              Math.max(
                900,
                Math.ceil((config.maxCompletionTokens ?? 600) * 1.75)
              )
            )
          }
        : options;
    const retryConfig = resolveJsonTaskConfig(retryOptions);
    const retryPrompt =
      options.taskType === "wording"
        ? `${userTaskPrompt}\n\nReturn a single raw JSON object with double-quoted keys and string values where needed. Do not wrap the JSON in markdown.`
        : `${userTaskPrompt}\n\nYou must reply with a single JSON object. Do not include any extra text.`;
    return await runOnce(retryPrompt, retryConfig);
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

export async function runAudioTranscriptionTask(
  input: AudioTranscriptionTaskInput
): Promise<AudioTranscriptionTaskResult> {
  if (audioTranscriptionRunnerForTests) {
    return audioTranscriptionRunnerForTests(input);
  }
  const file = await toFile(input.fileData, input.fileName, { type: input.mimeType });
  const response = await getClient().audio.transcriptions.create({
    model: getDefaultAudioModel(),
    file
  });
  const transcript = typeof response.text === "string" ? response.text.trim() : "";
  if (!transcript) {
    throw new Error("Model returned an empty transcription.");
  }
  return { transcript };
}

export function setJsonTaskRunnerForTests(runner: JsonTaskRunner | null): void {
  jsonTaskRunnerForTests = runner;
}

export function setImageOcrRunnerForTests(runner: ImageOcrRunner | null): void {
  imageOcrRunnerForTests = runner;
}

export function setAudioTranscriptionRunnerForTests(runner: AudioTranscriptionRunner | null): void {
  audioTranscriptionRunnerForTests = runner;
}
