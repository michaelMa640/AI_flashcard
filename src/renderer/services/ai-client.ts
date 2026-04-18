import { buildUserPrompt } from "../../shared/ai-prompt.js";
import type { FormState, StructuredData } from "../../shared/flashcard-types.js";
import { normalizeStructuredData, parseModelJson } from "../../shared/structured-parser.js";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function requestStructuredData(form: FormState): Promise<StructuredData> {
  const url = form.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const userPrompt = buildUserPrompt(form);

  const firstAttempt = await fetch(url, {
    method: "POST",
    headers: buildHeaders(form.apiKey),
    body: JSON.stringify(buildPayload(form, userPrompt, true)),
  });

  const response = await recoverUnsupportedJsonMode(firstAttempt, url, form, userPrompt);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const message = data.choices?.[0]?.message?.content;

  if (!message) {
    throw new Error("返回结果中没有 message.content");
  }

  return normalizeStructuredData(parseModelJson(message), form);
}

async function recoverUnsupportedJsonMode(
  response: Response,
  url: string,
  form: FormState,
  userPrompt: string,
) {
  if (response.ok) {
    return response;
  }

  if (![400, 404, 415, 422].includes(response.status)) {
    return response;
  }

  return fetch(url, {
    method: "POST",
    headers: buildHeaders(form.apiKey),
    body: JSON.stringify(buildPayload(form, userPrompt, false)),
  });
}

function buildHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function buildPayload(form: FormState, userPrompt: string, preferJsonMode: boolean) {
  const payload: Record<string, unknown> = {
    model: form.model,
    temperature: 0.3,
    messages: [
      { role: "system", content: form.systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };

  if (preferJsonMode) {
    payload.response_format = { type: "json_object" };
  }

  return payload;
}
