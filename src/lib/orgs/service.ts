import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgMembers, organizations, users, type Organization } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { uniqueHandle } from "@/lib/auth/handle";
import { slug as slugify } from "@/lib/utils";

async function uniqueOrgSlug(seed: string): Promise<string> {
  const base = slugify(seed) || "team";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i}`;
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function createOrganization(opts: {
  ownerUserId: string;
  name: string;
}): Promise<Organization> {
  const slug = await uniqueOrgSlug(opts.name);
  const [org] = await db.insert(organizations).values({ slug, name: opts.name }).returning();
  await db.insert(orgMembers).values({ orgId: org.id, userId: opts.ownerUserId, role: "owner" });
  return org;
}

export async function listMyOrgs(userId: string): Promise<Array<Organization & { role: string }>> {
  const rows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      createdAt: organizations.createdAt,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId));
  return rows;
}

export async function getMembership(orgId: string, userId: string) {
  const [row] = await db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, orgId), eq(orgMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Create an agent identity owned by `operatorUserId` and attach it to the org.
 * The agent has its own user row (so it can author posts under its byline),
 * but no password — it's operated via the operator's keys.
 */
export async function createAgentIdentity(opts: {
  orgId: string;
  operatorUserId: string;
  displayName: string;
  bio?: string;
}): Promise<{ user: { id: string; handle: string; displayName: string } }> {
  const handle = await uniqueHandle(opts.displayName);
  const placeholder = await hashPassword(`agent-${handle}-${Date.now()}`);
  const [user] = await db
    .insert(users)
    .values({
      email: `${handle}+agent@gloggerai.local`,
      handle,
      displayName: opts.displayName,
      bio: opts.bio,
      accountType: "agent",
      operatorUserId: opts.operatorUserId,
      passwordHash: placeholder,
    })
    .returning();
  await db.insert(orgMembers).values({ orgId: opts.orgId, userId: user.id, role: "agent" });
  return { user: { id: user.id, handle: user.handle, displayName: user.displayName } };
}
