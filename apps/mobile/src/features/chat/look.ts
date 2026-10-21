// Chat themes and presence labels. Pure (no native imports) so they are unit-tested.

export type ChatTheme = {
  id: string;
  name: string;
  /** Background gradient, top to bottom. */
  bg: [string, string];
  /** Your bubbles' gradient. White text on both stops must stay readable. */
  mine: [string, string];
  theirs: string;
  dark: boolean;
};

export const THEMES: ChatTheme[] = [
  { id: 'grape', name: 'Grape Night', bg: ['#1B1035', '#3A1D6E'], mine: ['#7C4DFF', '#B0247A'], theirs: 'rgba(255,255,255,0.14)', dark: true },
  { id: 'sunset', name: 'Sunset', bg: ['#FFD3A5', '#FD6585'], mine: ['#C2410C', '#9D174D'], theirs: '#FFFFFF', dark: false },
  { id: 'ocean', name: 'Ocean', bg: ['#0F2027', '#2C5364'], mine: ['#0369A1', '#0E7490'], theirs: 'rgba(255,255,255,0.14)', dark: true },
  { id: 'lime', name: 'Lime', bg: ['#F4FFE0', '#C9F29B'], mine: ['#15803D', '#166534'], theirs: '#FFFFFF', dark: false },
  { id: 'bubblegum', name: 'Bubblegum', bg: ['#FFE4F2', '#FFB8DC'], mine: ['#DB2777', '#9D174D'], theirs: '#FFFFFF', dark: false },
  { id: 'midnight', name: 'Midnight', bg: ['#000000', '#14121F'], mine: ['#4F46E5', '#7C3AED'], theirs: '#26232F', dark: true },
];

export const themeById = (id: string | null | undefined) => THEMES.find((t) => t.id === id) ?? null;

/** "Active now", "Active 5m ago", "Active 3h ago", "Active yesterday". Null when unknown or older than a week. */
export function activeLabel(online: boolean | null | undefined, lastActiveAt: string | null | undefined, now = Date.now()) {
  if (online) return 'Active now';
  if (!lastActiveAt) return null;
  const min = Math.floor(Math.max(0, now - Date.parse(lastActiveAt)) / 60_000);
  if (min < 1) return 'Active just now';
  if (min < 60) return `Active ${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Active ${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Active yesterday';
  return d < 7 ? `Active ${d}d ago` : null;
}

/** Compact time for the chats list: "now", "4m", "2h", "3d", "5w". */
export function shortAgo(t: number, now = Date.now()) {
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}
