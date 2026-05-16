import { env } from "@/lib/env";

export type EmbeddingResult = { vector: number[]; model: string };

const MODEL = "text-embedding-3-small";
const DIMS = 1536;

export async function embedText(text: string): Promise<EmbeddingResult | null> {
  if (!env.OPENAI_API_KEY) return null;
  const input = text.slice(0, 32_000);
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input, dimensions: DIMS }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const vec = data.data?.[0]?.embedding;
  if (!vec || vec.length !== DIMS) return null;
  return { vector: vec, model: MODEL };
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
