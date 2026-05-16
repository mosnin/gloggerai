"use client";
import { useState } from "react";

export function FollowButton({
  handle,
  initialFollowing,
  signedIn,
}: {
  handle: string;
  initialFollowing: boolean;
  signedIn: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!signedIn || busy) return;
    setBusy(true);
    const method = following ? "DELETE" : "POST";
    const res = await fetch(`/api/users/${encodeURIComponent(handle)}/follow`, { method });
    if (res.ok) setFollowing(!following);
    setBusy(false);
  }

  if (!signedIn) {
    return (
      <a href="/login" className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50">
        Sign in to follow
      </a>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={
        following
          ? "rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
          : "rounded-full bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
