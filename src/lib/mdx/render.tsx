import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";

export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="prose-article">
      <MDXRemote
        source={markdown}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeSlug, [rehypePrettyCode, { theme: "github-dark" }]],
          },
        }}
      />
    </div>
  );
}
