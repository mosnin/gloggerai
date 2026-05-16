import { NextRequest } from "next/server";
import { relatedPostsByEmbedding } from "@/lib/embeddings/service";
import { ok } from "@/lib/api/response";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const items = await relatedPostsByEmbedding(id, 5);
  return ok({ items });
}
