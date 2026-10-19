// Product-specific drafts that describe what the code actually does.
// DRAFT: requires review by qualified counsel before public launch. Not legal advice.

export const REVIEW_NOTICE = 'Draft — pending legal review before public launch.';

type Doc = { title: string; sections: { h: string; p: string }[] };

export const docs: Record<string, Doc> = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      { h: 'The short version', p: 'Vybe is for friends. Your location is shown only to accepted friends you choose, only while you share it. Photos go only to the friends you pick. Chats are end-to-end encrypted, so we can’t read them.' },
      { h: 'What we collect', p: 'Account: email, password hash (Argon2id) or Google account ID, username, display name, optional bio and profile photo.\nSocial: friend requests, friendships, blocks, reports you file.\nLocation: while sharing is on, your latest position (latitude, longitude, accuracy, time captured and time received). We keep only the latest point, never a history.\nPhotos: images you send and their recipients. We re-encode images and remove metadata such as GPS.\nChats: encrypted messages are stored only until delivered, then deleted. We can see sender, recipient and time while a message waits for delivery; never the content. Your public encryption keys are stored so friends can start chats.\nDevice & security: device name, sign-in sessions, push-notification token, IP addresses on security events.' },
      { h: 'How we use it', p: 'To run the features you use (showing friends where you are, delivering photos and messages, notifications), to keep accounts secure (rate limits, suspicious sign-in detection), and to handle reports of abuse. We do not sell your data or use it for advertising.' },
      { h: 'Who can see what', p: 'Location: accepted friends allowed by your settings (all friends or chosen friends), never blocked users, never anyone while Ghost Mode is on.\nPhotos: you and the friends you sent them to.\nProfile: signed-in users can see your username, display name, bio and photo, except people you blocked.\nService providers: our server host (Oracle Cloud), email delivery provider, Google (sign-in, if used) and Firebase Cloud Messaging (notifications, which contain no message content).' },
      { h: 'How long we keep it', p: 'Current location: deleted when you stop sharing or turn on Ghost Mode, and in any case 24 hours after it was received.\nUndelivered encrypted messages: up to 30 days.\nPhotos: until you or the sender deletes them, or the account is deleted.\nSecurity logs: 90 days.\nBackups: encrypted, kept for 14 days, then deleted.' },
      { h: 'Your choices and rights', p: 'Turn sharing off or on, choose who sees you, set a timer or use Ghost Mode. Block or report anyone. Export the data our server holds about you from the Privacy dashboard. Delete your account at any time: it removes your profile, friendships, location, photos, keys and sessions from our live database immediately; backups roll off within 14 days. Depending on where you live you may have additional rights (access, correction, deletion, objection).' },
      { h: 'Security', p: 'TLS for all traffic, Signal-protocol end-to-end encryption for chats, encryption keys stored in Android Keystore-protected storage, private media served only to authorized users, and a database that is never exposed to the internet. No system is perfectly secure; we will notify affected users of breaches as the law requires.' },
      { h: 'Children', p: 'Vybe is not for children under 13 (or the minimum age in your country).' },
      { h: 'Contact', p: 'Questions about privacy: use Help & support in the app.' },
    ],
  },
  terms: {
    title: 'Terms of Service',
    sections: [
      { h: 'Using Vybe', p: 'You must meet the minimum age in your country (at least 13) and give accurate account information. Keep your password safe; you are responsible for activity on your account.' },
      { h: 'Your content', p: 'You own the photos and messages you share. You give us the limited permission needed to store and deliver them to the people you choose. Don’t share content you don’t have the right to share.' },
      { h: 'Acceptable use', p: 'Follow the Community Guidelines. Don’t track people without their consent, harass, impersonate, spam, or attempt to break or overload the service.' },
      { h: 'Location features', p: 'Location is approximate and may be delayed: Android can limit background updates. Never rely on Vybe for emergencies or safety-critical decisions.' },
      { h: 'What we can’t promise', p: 'We can’t stop recipients from saving or screenshotting what you send them, and deleting a photo can’t recall copies already saved elsewhere. The service is provided as is, to the extent the law allows.' },
      { h: 'Suspension and termination', p: 'We may suspend accounts that break these terms or the Community Guidelines. You can delete your account at any time.' },
      { h: 'Open source', p: 'The Vybe app includes libsignal, licensed under AGPL-3.0. The app’s source is made available under compatible terms.' },
      { h: 'Changes', p: 'We will tell you in the app before material changes take effect.' },
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    sections: [
      { h: 'Consent first', p: 'Only share someone’s location, photos or messages with their consent. Never pressure someone to share their location.' },
      { h: 'Be kind', p: 'No harassment, bullying, threats, hate or stalking.' },
      { h: 'Keep it legal and safe', p: 'No sexual content involving minors (we report it to authorities), no non-consensual intimate images, no promotion of violence or self-harm, no sale of illegal goods.' },
      { h: 'Be yourself', p: 'No impersonation or fake accounts. No spam.' },
      { h: 'Reporting', p: 'Report people or photos from their profile or the photo viewer. Blocking is instant and the other person isn’t notified.' },
    ],
  },
  help: {
    title: 'Help & Support',
    sections: [
      { h: 'My friend’s spot looks old', p: 'Vybe asks for an update about every 2 minutes, but Android may delay updates when the phone is idle or in battery saver. The card always shows when the spot was last updated.' },
      { h: 'Sharing keeps stopping', p: 'Allow location “All the time” for Vybe and turn off battery optimization for Vybe in Android settings. You’ll see a notification while sharing is on.' },
      { h: 'Safety number changed', p: 'Your friend probably reinstalled Vybe or got a new phone. To be sure, compare safety numbers in person from the chat menu.' },
      { h: 'I got a new phone', p: 'Sign in on the new phone. Your friends and photos are there; chat history stays on the old phone because only it has the keys.' },
      { h: 'Someone is bothering me', p: 'Block them from their profile. They can’t find you, message you, send you photos or see your location. You can also report them.' },
    ],
  },
  licenses: {
    title: 'Open-source licenses',
    sections: [
      { h: 'libsignal (Signal Messenger, LLC)', p: 'AGPL-3.0-only. Provides the Signal protocol used for end-to-end encrypted chat.' },
      { h: 'React Native, Expo and Expo modules', p: 'MIT License.' },
      { h: 'MapLibre Native / MapLibre React Native', p: 'BSD-2-Clause and MIT licenses.' },
      { h: 'Map data', p: '© OpenStreetMap contributors (ODbL). Tiles by OpenFreeMap, styles © OpenMapTiles.' },
      { h: 'TanStack Query, Zustand', p: 'MIT License.' },
      { h: 'Bricolage Grotesque, Inter', p: 'SIL Open Font License 1.1.' },
      { h: 'Full notices', p: 'A complete list of dependencies and their licenses ships with the source code (see THIRD_PARTY_NOTICES in the repository).' },
    ],
  },
};
