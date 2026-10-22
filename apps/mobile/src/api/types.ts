// Response shapes of the Vybe API (see API.md). Kept by hand; the server is the source of truth.

import type { AvatarLook } from '@/ui/character';

export type Mood = { emoji: string; text: string | null; setAt: string };
export type PublicUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarMediaId: string | null;
  avatarStyle: AvatarLook | null;
  bio: string | null;
  /** Friends only, and only while fresh (24 h). */
  mood?: Mood | null;
};
export type Relationship = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

export type Me = PublicUser & {
  email: string;
  showPresence: boolean;
  hasPassword: boolean;
  hasGoogle: boolean;
  role: 'USER' | 'ADMIN';
  createdAt: string;
};

export type Friend = PublicUser & { online: boolean | null; lastActiveAt: string | null };
export type FriendRequest = { id: string; createdAt: string; user: PublicUser };

export type LocationPoint = { lat: number; lng: number; accuracy: number | null; capturedAt: string; receivedAt: string };
export type FriendLocation = { user: PublicUser; sharing: boolean; location: LocationPoint | null };

export type SharingMode = 'OFF' | 'ALL' | 'SELECTED';
export type LocationSettings = { mode: SharingMode; ghost: boolean; expiresAt: string | null; updatedAt: string; active: boolean; grants: string[] };

export type PhotoPost = {
  id: string;
  caption: string | null;
  /** "Blink" in the app (API name: instant): opens once per friend, gone after viewing or at expiresAt (24 h). */
  instant: boolean;
  expiresAt: string | null;
  createdAt: string;
  mediaId: string;
  media: { width: number | null; height: number | null };
  sender: PublicUser;
  viewedAt?: string | null;
};

export type Session = { id: string; deviceName: string | null; createdAt: string; lastUsedAt: string; current: boolean };
export type NotificationPrefs = { friendRequests: boolean; photos: boolean; messages: boolean; security: boolean };
export type AuthTokens = { accessToken: string; refreshToken: string; expiresIn: number };

/** One photo in someone's story (friends only, 24 h). `viewCount` is present only on your own stories. */
export type Story = {
  id: string;
  mediaId: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
  media: { width: number | null; height: number | null };
  seen: boolean;
  viewCount?: number;
};
export type StoryGroup = { user: PublicUser; stories: Story[]; unseen: number };
export type StoryFeed = { mine: StoryGroup | null; friends: StoryGroup[] };
