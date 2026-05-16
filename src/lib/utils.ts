import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import slugify from "slugify";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true }).slice(0, 80);
}

export function excerptFromMarkdown(md: string, length = 180): string {
  const stripped = md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > length ? stripped.slice(0, length).trimEnd() + "…" : stripped;
}

export function wordCount(md: string): number {
  return md.trim().split(/\s+/).filter(Boolean).length;
}
