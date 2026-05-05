import { z } from "zod";

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY!;
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_MODEL = "nvidia/nemotron-nano-12b-v2-vl";

type Message = { role: string; content: string | unknown[] };

export function extractJson(text: string): string {
  text = text.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  return start !== -1 ? text.slice(start) : text;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) throw err; // don't retry 4xx
      if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function chat(
  messages: Message[],
  opts: { temperature?: number; maxTokens?: number } = {}
): Promise<string> {
  return withRetry(async () => {
    const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 8192,
        temperature: opts.temperature ?? 0.7,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = new Error(`NVIDIA API ${res.status}: ${await res.text()}`);
      (err as { status?: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    return data.choices[0].message.content as string;
  });
}

export async function chatJson<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  opts: { temperature?: number } = {}
): Promise<T> {
  // Serialize schema to JSON Schema so the model knows exact field names
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema), null, 2);

  const systemMsg: Message = {
    role: "system",
    content: `/no_think\nYou must respond with valid JSON that matches this schema exactly. No markdown, no explanation, only JSON.\n\nSchema:\n${jsonSchema}`,
  };

  const fullMessages = [systemMsg, ...messages];
  const raw = await chat(fullMessages, { temperature: opts.temperature ?? 0.3, maxTokens: 8192 });
  const cleaned = extractJson(raw);

  try {
    return schema.parse(JSON.parse(cleaned));
  } catch (err) {
    console.warn("[chatJson] parse failed, attempting repair:", String(err).slice(0, 200));
    const repairMessages: Message[] = [
      ...fullMessages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `That response failed validation: ${err}. Return only valid JSON matching the schema exactly.`,
      },
    ];
    const repairRaw = await chat(repairMessages, { temperature: 0.1, maxTokens: 8192 });
    return schema.parse(JSON.parse(extractJson(repairRaw)));
  }
}
