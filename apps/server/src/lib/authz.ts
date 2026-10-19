// Single source of truth for "who may see/do what". Every route and socket handler goes through here.
import { db, ordered, type Tx } from './db.js';

type Client = typeof db | Tx;

export async function areFriends(a: string, b: string, c: Client = db) {
  if (a === b) return false;
  const [userAId, userBId] = ordered(a, b);
  return (await c.friendship.count({ where: { userAId, userBId } })) > 0;
}

export async function isBlockedEither(a: string, b: string, c: Client = db) {
  return (
    (await c.block.count({
      where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    })) > 0
  );
}

/** Friends and not blocked in either direction. Basis for messaging and sharing. */
export async function canInteract(a: string, b: string, c: Client = db) {
  return (await areFriends(a, b, c)) && !(await isBlockedEither(a, b, c));
}

export const canMessage = canInteract;

/** Ids of `userId`'s friends, excluding anyone blocked either way. */
export async function friendIds(userId: string, c: Client = db) {
  const rows = await c.friendship.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    select: { userAId: true, userBId: true },
  });
  const ids = rows.map((r) => (r.userAId === userId ? r.userBId : r.userAId));
  if (!ids.length) return [];
  const blocks = await c.block.findMany({
    where: { OR: [{ blockerId: userId, blockedId: { in: ids } }, { blockedId: userId, blockerId: { in: ids } }] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
  return ids.filter((id) => !blocked.has(id));
}

/** Is `owner` currently sharing at all (ignoring audience)? */
export function isSharingActive(s: { mode: string; ghost: boolean; expiresAt: Date | null } | null, now = new Date()) {
  return !!s && s.mode !== 'OFF' && !s.ghost && (!s.expiresAt || s.expiresAt > now);
}

/**
 * Of `ownerIds`, which ones currently let `viewer` see their location?
 * Requires: accepted friendship, no block, sharing active, and (mode ALL or viewer granted).
 */
export async function locationVisibleOwners(viewer: string, ownerIds: string[], c: Client = db) {
  if (!ownerIds.length) return new Set<string>();
  const friends = new Set(await friendIds(viewer, c));
  const candidates = ownerIds.filter((id) => friends.has(id));
  if (!candidates.length) return new Set<string>();
  const settings = await c.locationSettings.findMany({
    where: { userId: { in: candidates } },
    select: { userId: true, mode: true, ghost: true, expiresAt: true },
  });
  const grants = new Set(
    (
      await c.locationGrant.findMany({ where: { viewerId: viewer, ownerId: { in: candidates } }, select: { ownerId: true } })
    ).map((g) => g.ownerId),
  );
  const now = new Date();
  return new Set(
    settings
      .filter((s) => isSharingActive(s, now) && (s.mode === 'ALL' || grants.has(s.userId)))
      .map((s) => s.userId),
  );
}

export async function canSeeLocation(owner: string, viewer: string, c: Client = db) {
  return (await locationVisibleOwners(viewer, [owner], c)).has(owner);
}

/** Viewers who may currently see `owner`'s location (for realtime fan-out). */
export async function locationViewers(owner: string, c: Client = db) {
  const s = await c.locationSettings.findUnique({ where: { userId: owner } });
  if (!isSharingActive(s)) return [];
  const friends = await friendIds(owner, c);
  if (s!.mode === 'ALL') return friends;
  const grants = await c.locationGrant.findMany({ where: { ownerId: owner, viewerId: { in: friends } }, select: { viewerId: true } });
  return grants.map((g) => g.viewerId);
}

/** Sender, or a listed recipient who has not been blocked by/blocked the sender. */
export async function canViewPhoto(postId: string, viewer: string, c: Client = db) {
  const post = await c.photoPost.findUnique({
    where: { id: postId },
    select: { senderId: true, recipients: { where: { recipientId: viewer }, select: { recipientId: true } } },
  });
  if (!post) return false;
  if (post.senderId === viewer) return true;
  return post.recipients.length > 0 && !(await isBlockedEither(post.senderId, viewer, c));
}

/** Download authorization for a stored media object. */
export async function canViewMedia(mediaId: string, viewer: string, c: Client = db) {
  const m = await c.mediaObject.findUnique({
    where: { id: mediaId },
    select: { ownerId: true, kind: true, audienceUserId: true, photoPost: { select: { id: true } } },
  });
  if (!m) return false;
  if (m.ownerId === viewer) return true;
  if (await isBlockedEither(m.ownerId, viewer, c)) return false;
  switch (m.kind) {
    case 'AVATAR':
      // Avatars are visible to any signed-in, non-blocked user (shown in search and requests).
      return true;
    case 'PHOTO':
      return !!m.photoPost && (await canViewPhoto(m.photoPost.id, viewer, c));
    case 'CHAT_BLOB':
      return m.audienceUserId === viewer && (await areFriends(m.ownerId, viewer, c));
  }
}
