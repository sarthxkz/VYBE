// Vybe Assistant: answers common questions instantly, on the phone (no server, nothing you type leaves the app
// unless you choose "Email support"). Pure so it's unit-tested.
// shortcut: keyword matching, not an AI model. Upgrade to an LLM behind our server if questions outgrow the FAQ.

export const SUPPORT_EMAIL = 'supportadmin.vybe@gmail.com';

export type Faq = { id: string; q: string; a: string; keys: string[] };

export const FAQ: Faq[] = [
  { id: 'who-sees', q: 'Who can see my location?', keys: ['who', 'see', 'location', 'visible', 'map', 'spot', 'track', 'privacy'],
    a: 'Only friends you allow. Choose "All friends" or pick people in Location sharing. Blocked people never see you, and nobody does while Ghost Mode is on.' },
  { id: 'ghost', q: 'What is Ghost Mode?', keys: ['ghost', 'hide', 'invisible', 'disappear', 'hidden'],
    a: 'Ghost Mode hides you from the map instantly and deletes your current spot from our server. Tap 👻 Ghost at the top of the map to switch it on or off.' },
  { id: 'location-off', q: 'My location isn’t updating', keys: ['location', 'updating', 'stopped', 'stops', 'old', 'off', 'gps', 'battery', 'background', 'wrong'],
    a: 'Allow location "All the time" for Vybe, and turn off battery optimization for Vybe in Android settings. Vybe updates about every 2 minutes; Android may delay it in battery saver.' },
  { id: 'not-sending', q: 'My messages say “Not sent”', keys: ['message', 'messages', 'send', 'sending', 'sent', 'failed', 'fail', 'chat', 'deliver'],
    a: 'Check your connection, then hold the message and tap "Retry sending". Both of you need the latest Vybe version; if it keeps failing, ask your friend to open Vybe once so their encryption keys are set up.' },
  { id: 'e2ee', q: 'Are my chats private?', keys: ['private', 'encrypted', 'encryption', 'secure', 'read', 'e2ee', 'signal', 'safe'],
    a: 'Yes. Chats, photos in chat, voice messages, reactions and chat themes are end-to-end encrypted with the Signal protocol. Our server only ever holds scrambled data it can’t read.' },
  { id: 'safety', q: 'Safety number changed', keys: ['safety', 'number', 'changed', 'verify', 'reinstalled'],
    a: 'Your friend probably reinstalled Vybe or got a new phone. To be sure, open the chat menu (⋮) → Verify safety number, and compare it with them in person.' },
  { id: 'backup', q: 'How do I keep my chats on a new phone?', keys: ['backup', 'restore', 'new', 'phone', 'history', 'lost', 'old', 'switch', 'chats'],
    a: 'Turn on Chat backup (You → Chat backup) and choose a password. On your new phone, sign in and enter the same password to restore. We can’t reset that password: without it the backup can’t be opened, by anyone.' },
  { id: 'blink', q: 'What is a Blink?', keys: ['blink', 'once', 'view', 'disappearing', 'instant', 'expire'],
    a: 'A Blink is a photo for your friends that each of them can open once. It disappears from their inbox after they view it, and from everywhere after 24 hours. You can see who opened it in Sent.' },
  { id: 'stories', q: 'How do stories work?', keys: ['story', 'stories', 'post', 'seen', 'viewers'],
    a: 'Tap "Your story" at the top of Chats to add a photo. All your friends can watch it for 24 hours. Open your own story to see who’s seen it, or delete it any time.' },
  { id: 'voice', q: 'How do I send a voice message?', keys: ['voice', 'audio', 'record', 'mic', 'microphone', 'note'],
    a: 'In a chat, hold the 🎙️ button, speak, and release to send. Slide left to cancel. If nothing records, allow the microphone for Vybe in Android settings.' },
  { id: 'theme', q: 'How do I change the chat background?', keys: ['theme', 'background', 'wallpaper', 'color', 'colour'],
    a: 'Open a chat and tap the 🎨 palette at the top. Pick a theme; you both see the one you choose.' },
  { id: 'code', q: 'I didn’t get my verification code', keys: ['code', 'verification', 'verify', 'email', 'otp', 'mail', 'arrive', 'spam'],
    a: 'Codes come from supportadmin.vybe@gmail.com and usually arrive within a minute. Check Spam and Promotions, and make sure the email address is typed correctly. You can ask for a new code on the same screen.' },
  { id: 'password', q: 'I forgot my password', keys: ['forgot', 'password', 'reset', 'login', 'sign'],
    a: 'On the sign-in screen tap "Forgot password?" and we’ll email you a reset code. (Your chat backup password is separate and can’t be reset.)' },
  { id: 'block', q: 'Someone is bothering me', keys: ['block', 'report', 'bothering', 'harass', 'spam', 'abuse', 'creepy', 'stalk'],
    a: 'Open their profile and tap Block. They can’t find you, message you, send you photos or see your location. You can report them too; reports go to our moderators.' },
  { id: 'friends', q: 'How do I add friends?', keys: ['add', 'friend', 'friends', 'invite', 'contacts', 'username', 'find', 'request'],
    a: 'Go to Friends → Add to search by username, or Invite friends to send a link from your contacts or any app. They appear on your map once they accept and share with you.' },
  { id: 'notifications', q: 'I’m not getting notifications', keys: ['notification', 'notifications', 'alerts', 'alert', 'ping', 'sound', 'vibrate'],
    a: 'Allow notifications for Vybe in Android settings and check You → Notifications. Notifications arrive fastest while Vybe is open or location sharing is on.' },
  { id: 'vibe', q: 'How do I set my vibe or avatar?', keys: ['vibe', 'mood', 'avatar', 'emoji', 'status', 'bitmoji', 'look'],
    a: 'Tap your avatar at the top of the map to set a vibe; friends see it for 24 hours. To change your avatar, go to You → Avatar.' },
  { id: 'events', q: 'How do events on the map work?', keys: ['event', 'events', 'party', 'hotspot', 'hotspots', 'pin'],
    a: 'Centre the map where it’s happening and tap the 📅 button to create an event. Your friends see it on their map until it ends. Hotspots show where several friends are together.' },
  { id: 'update', q: 'How do I update Vybe?', keys: ['update', 'version', 'apk', 'install', 'new', 'latest'],
    a: 'Most updates install themselves: just reopen Vybe. When a bigger update needs a download, you’ll see an "Update available" banner with a button.' },
  { id: 'delete', q: 'How do I delete my account or data?', keys: ['delete', 'account', 'remove', 'data', 'export', 'download', 'erase'],
    a: 'You → Privacy dashboard lets you export the data we hold about you. Delete account (in Account security) removes your profile, friendships, location, photos and keys right away.' },
];

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);

/** Best matching FAQ for a question, or null when nothing fits well enough. */
export function answer(question: string): Faq | null {
  const ws = words(question);
  if (!ws.length) return null;
  let best: Faq | null = null;
  let bestScore = 0;
  for (const f of FAQ) {
    // A word counts if it starts like a keyword ("sending" ~ "send"); the FAQ's own title words count a little.
    const title = words(f.q);
    const score = ws.reduce((n, w) => n + (f.keys.some((k) => w.startsWith(k) || k.startsWith(w) && w.length > 3) ? 2 : 0) + (title.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = f;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Pre-filled support email with the chat so far, so nobody has to explain twice. */
export function supportMailto(transcript: { fromMe: boolean; text: string }[], version: string) {
  const body = [
    'Hi Vybe team,',
    '',
    '(Describe the problem here.)',
    '',
    '— Assistant chat —',
    ...transcript.map((m) => `${m.fromMe ? 'Me' : 'Assistant'}: ${m.text}`),
    '',
    `App version: ${version}`,
  ].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Vybe support')}&body=${encodeURIComponent(body)}`;
}
