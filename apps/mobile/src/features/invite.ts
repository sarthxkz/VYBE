import { API_URL } from '@/api/client';

// Invites point at a small page on our own server (deploy/web/invite) that offers the APK and opens
// vybe://invite/<username> when the app is installed. Contacts never leave the phone.
export const inviteUrl = (username: string) =>
  `${API_URL}/invite/?u=${encodeURIComponent(username)}`;

export const inviteMessage = (username: string) =>
  `Join me on Vybe, a private map for friends 🗺️ Add me: @${username} ${inviteUrl(username)}`;

/** sms: link with the invite prefilled. Keeps + and digits only so a contact's formatting can't inject params. */
export function smsLink(phone: string, username: string) {
  const number = phone.replace(/[^\d+]/g, '');
  return number ? `sms:${number}?body=${encodeURIComponent(inviteMessage(username))}` : null;
}

export const mailLink = (email: string, username: string) =>
  `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Join me on Vybe')}&body=${encodeURIComponent(inviteMessage(username))}`;
