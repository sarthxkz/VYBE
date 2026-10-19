import { Redirect } from 'expo-router';

// Placeholder route behind the center tab button, which opens the camera modal instead.
export default function Snap() {
  return <Redirect href="/camera" />;
}
