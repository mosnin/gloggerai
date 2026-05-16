import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, requireScope } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { createComment, listCommentsForPost } from "@/lib/engagement/comments";

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const CommentBody = z.object({
  bodyMd: z.string().min(1).max(10_000),
  parentId: z.string().uuid().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const parsed = ListQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("invalid_query", "Invalid query parameters", 422, parsed.error.flatten());
  const result = await listCommentsForPost({
    postId: id,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor,
  });
  return ok(result);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const scopeFail = requireScope(auth, "comments:write");
  if (scopeFail) return scopeFail;

  const parsed = CommentBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const result = await createComment({
    postId: id,
    authorId: auth.user.id,
    bodyMd: parsed.data.bodyMd,
    parentId: parsed.data.parentId,
  });
  if ("error" in result) {
    if (result.error === "post_not_found") return fail("not_found", "Post not found", 404);
    if (result.error === "parent_not_found") return fail("not_found", "Parent comment not found", 404);
    if (result.error === "nesting_too_deep") return fail("invalid_parent", "Only one level of nesting", 422);
    if (result.error === "rejected") return fail("moderation_rejected", "Content rejected by moderation", 422);
  }
  return ok({ comment: result.comment }, { status: 201 });
}
