import OpenAI from "openai";
import { parseJsonFromModel } from "../lib/json.js";
import { loadSystemPrompt } from "../prompt/systemPrompt.js";

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
type JsonTaskRunner = <T>(userTaskPrompt: string) => Promise<T>;

let openAIClient: OpenAI | null = null;
let jsonTaskRunnerForTests: JsonTaskRunner | null = null;

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

export async function runJsonTask<T>(userTaskPrompt: string): Promise<T> {
  if (jsonTaskRunnerForTests) {
    return jsonTaskRunnerForTests<T>(userTaskPrompt);
  }

  const runOnce = async (prompt: string): Promise<T> => {
    const completion = await getClient().chat.completions.create({
      model: DEFAULT_MODEL,
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

export function setJsonTaskRunnerForTests(runner: JsonTaskRunner | null): void {
  jsonTaskRunnerForTests = runner;
}
