// Product copy in one place, so terms stay consistent: "friends", "share your location", "Ghost Mode".
// Errors follow: what happened + how to fix it. CTAs start with a verb.

export const intro = [
  { title: 'Your people, on one map', body: 'See where your friends are hanging out, only when they choose to share.' },
  { title: 'Snap it. Send it. Just to them.', body: 'Share spontaneous photos with the friends you pick. Nobody else.' },
  { title: 'Chats only you two can read', body: 'Messages are end-to-end encrypted. Not even Vybe can read them.' },
  { title: "You're always in control", body: 'Pick who sees you, share for an hour, or go Ghost in one tap.' },
];

export const permission = {
  locationTitle: 'Show up on your friends’ map',
  locationBody: 'Vybe uses your location only while you share it, and only the friends you choose can see it. You can stop anytime.',
  locationCta: 'Allow location',
  backgroundTitle: 'Keep your spot fresh',
  backgroundBody:
    'To update your spot about every 2 minutes while Vybe is closed, Android needs "Allow all the time". You’ll see a notification whenever sharing is on. Without it, your spot updates only while Vybe is open.',
  backgroundCta: 'Open settings',
  backgroundSkip: 'Only while using the app',
  deniedTitle: 'Location is off for Vybe',
  deniedBody: 'You can still see friends who share with you. To share your own spot, allow location in Settings.',
  cameraTitle: 'Snap photos for friends',
  cameraBody: 'Vybe needs the camera to take photos. They’re sent only to the friends you pick.',
  cameraCta: 'Allow camera',
  servicesOff: 'Location services are off. Turn them on in your phone’s settings to share your spot.',
};

export const ghost = {
  title: 'Ghost Mode',
  on: 'You’re invisible. Your spot was removed from your friends’ maps and nothing new is shared.',
  off: 'Friends you share with can see your spot.',
};

export const errors: Record<string, string> = {
  NETWORK: "Can't reach Vybe right now. Check your connection and try again.",
  INVALID_CREDENTIALS: 'That email and password don’t match. Try again or reset your password.',
  EMAIL_NOT_VERIFIED: 'Almost there! We sent a new code to your email. Enter it to finish signing up.',
  INVALID_CODE: 'That code didn’t work. It may have expired. Request a new one and try again.',
  RATE_LIMITED: 'Too many tries. Take a short break and try again in a few minutes.',
  USERNAME_TAKEN: 'That username is taken. Try adding a number or an underscore.',
  ACCOUNT_SUSPENDED: 'This account is suspended. Contact support if you think this is a mistake.',
  VALIDATION_ERROR: 'Some details aren’t quite right. Check the highlighted fields.',
  USER_NOT_FOUND: 'We couldn’t find that person.',
  ALREADY_FRIENDS: 'You’re already friends.',
  CANNOT_MESSAGE: 'You can only message friends.',
  INVALID_IMAGE: 'That file isn’t a photo we can use. Try a JPEG or PNG.',
  FILE_TOO_LARGE: 'That photo is too big. Try a smaller one.',
  REAUTH_FAILED: 'That password isn’t right, so we didn’t delete anything.',
  GOOGLE_SIGNIN_DISABLED: 'Google sign-in isn’t available yet. Use email instead.',
};

export const errorText = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return (code && errors[code]) || 'Something went wrong. Please try again.';
};
