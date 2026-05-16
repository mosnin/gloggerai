"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Author = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type CommentItem = {
  id: string;
  bodyMd: string;
  createdAt: string;
  moderationStatus: string;
  author: Author;
  replyCount: number;
};

export function PostEngagement({
  postId,
  initialClaps,
  initialBookmarked,
  signedIn,
  isAuthor,
}: {
  postId: string;
  initialClaps: { total: number; mine: number };
  initialBookmarked: boolean;
  signedIn: boolean;
  isAuthor: boolean;
}) {
  const [claps, setClaps] = useState(initialClaps);
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busyClap, setBusyClap] = useState(false);
  const [busyBookmark, setBusyBookmark] = useState(false);

  async function clap() {
    if (!signedIn || busyClap) return;
    const next = Math.min(50, claps.mine + 1);
    setBusyClap(true);
    const optimistic = { total: claps.total + (next - claps.mine), mine: next };
    setClaps(optimistic);
    const res = await fetch(`/api/posts/${postId}/claps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: next }),
    });
    if (res.ok) setClaps(await res.json());
    setBusyClap(false);
  }

  async function toggleBookmark() {
    if (!signedIn || busyBookmark) return;
    setBusyBookmark(true);
    if (bookmarked) {
      await fetch(`/api/me/bookmarks/${postId}`, { method: "DELETE" });
      setBookmarked(false);
    } else {
      const res = await fetch(`/api/me/bookmarks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      if (res.ok) setBookmarked(true);
    }
    setBusyBookmark(false);
  }

  return (
    <div className="mt-10 flex items-center gap-4 border-y border-neutral-200 py-4">
      <button
        onClick={clap}
        disabled={!signedIn || busyClap || isAuthor}
        className="flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        aria-label="Clap"
      >
        <span>Clap</span>
        <span className="font-semibold tabular-nums">{claps.total}</span>
        {claps.mine > 0 ? <span className="text-emerald-700">(you: {claps.mine})</span> : null}
      </button>
      <button
        onClick={toggleBookmark}
        disabled={!signedIn || busyBookmark}
        className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        aria-pressed={bookmarked}
      >
        {bookmarked ? "Bookmarked" : "Bookmark"}
      </button>
      {!signedIn ? (
        <span className="ml-auto text-xs text-neutral-500">
          <Link href="/login" className="underline">Sign in</Link> to clap or bookmark
        </span>
      ) : null}
    </div>
  );
}

export function PostComments({
  postId,
  initialComments,
  signedIn,
  meId,
}: {
  postId: string;
  initialComments: CommentItem[];
  signedIn: boolean;
  meId: string | null;
}) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!signedIn || !body.trim() || submitting) return;
    setSubmitting(true);
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyMd: body }),
    });
    if (res.ok) {
      const data = await res.json();
      const c = data.comment;
      setComments((prev) => [
        {
          id: c.id,
          bodyMd: c.bodyMd,
          createdAt: c.createdAt,
          moderationStatus: c.moderationStatus,
          author: { id: meId ?? "", handle: "you", displayName: "You", avatarUrl: null },
          replyCount: 0,
        },
        ...prev,
      ]);
      setBody("");
    }
    setSubmitting(false);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <section className="mt-12 border-t border-neutral-200 pt-8">
      <h2 className="font-sans text-xl font-bold tracking-tight">Responses ({comments.length})</h2>
      {signedIn ? (
        <div className="mt-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What did you think?"
            rows={3}
            className="w-full rounded-md border border-neutral-300 p-3 text-sm focus:border-neutral-500 focus:outline-none"
            maxLength={10_000}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={submit}
              disabled={submitting || !body.trim()}
              className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Respond
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">
          <Link href="/login" className="underline">Sign in</Link> to respond.
        </p>
      )}

      <ul className="mt-6 space-y-6">
        {comments.map((c) => (
          <li key={c.id} className="rounded-md border border-neutral-200 p-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <Link href={`/@${c.author.handle}`} className="font-medium hover:underline">
                  {c.author.displayName}
                </Link>
                <span className="ml-2 text-neutral-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
              {meId === c.author.id ? (
                <button onClick={() => remove(c.id)} className="text-xs text-neutral-500 hover:text-red-700">
                  delete
                </button>
              ) : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-800">{c.bodyMd}</p>
            {c.replyCount > 0 ? (
              <p className="mt-2 text-xs text-neutral-500">{c.replyCount} repl{c.replyCount === 1 ? "y" : "ies"}</p>
            ) : null}
          </li>
        ))}
        {comments.length === 0 ? <li className="text-sm text-neutral-500">No responses yet.</li> : null}
      </ul>
    </section>
  );
}
