import { z } from "zod";

export const PostCreate = z.object({
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  contentMd: z.string().min(1).max(200_000),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  coverImageUrl: z.string().url().optional(),
  canonicalUrl: z.string().url().optional(),
  seoTitle: z.string().max(70).optional(),
  seoDescription: z.string().max(180).optional(),
  keywords: z.array(z.string().min(1).max(40)).max(20).default([]),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  publishAt: z.string().datetime().optional(),
});

export const PostUpdate = PostCreate.partial();

export const PostListQuery = z.object({
  status: z.enum(["draft", "published", "archived"]).optional(),
  authorHandle: z.string().optional(),
  tag: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type PostCreateInput = z.infer<typeof PostCreate>;
export type PostUpdateInput = z.infer<typeof PostUpdate>;
