import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Mistral } from "@mistralai/mistralai";
import { DEPARTMENTS, PRICES, type Department } from "./config.js";

const anthropic = new Anthropic();
const openai = new OpenAI();
const google = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY ?? "" });

export interface LlmResult {
  department: Department;
  provider: string;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

const costOf = (model: string, inputTokens: number, outputTokens: number) => {
  const price = PRICES[model];
  if (!price) throw new Error(`No price entry for model "${model}" in config.ts`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
};

export const callLlm = async (
  department: Department,
  prompt: string,
): Promise<LlmResult> => {
  const { provider, model } = DEPARTMENTS[department];
  const start = Date.now();

  if (provider === "anthropic") {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return {
      department,
      provider,
      model,
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: costOf(model, response.usage.input_tokens, response.usage.output_tokens),
      durationMs: Date.now() - start,
    };
  }

  if (provider === "openai") {
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.choices[0]?.message?.content ?? "";
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    return {
      department,
      provider,
      model,
      text,
      inputTokens,
      outputTokens,
      costUsd: costOf(model, inputTokens, outputTokens),
      durationMs: Date.now() - start,
    };
  }

  if (provider === "google") {
    const response = await google.getGenerativeModel({ model }).generateContent(prompt);
    const text = response.response.text();
    const inputTokens = response.response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.response.usageMetadata?.candidatesTokenCount ?? 0;
    return {
      department,
      provider,
      model,
      text,
      inputTokens,
      outputTokens,
      costUsd: costOf(model, inputTokens, outputTokens),
      durationMs: Date.now() - start,
    };
  }

  const response = await mistral.chat.complete({
    model,
    messages: [{ role: "user", content: prompt }],
  });
  const firstContent = response.choices?.[0]?.message?.content;
  const text = typeof firstContent === "string" ? firstContent : "";
  const inputTokens = response.usage.promptTokens ?? 0;
  const outputTokens = response.usage.completionTokens ?? 0;
  return {
    department,
    provider,
    model,
    text,
    inputTokens,
    outputTokens,
    costUsd: costOf(model, inputTokens, outputTokens),
    durationMs: Date.now() - start,
  };
};
