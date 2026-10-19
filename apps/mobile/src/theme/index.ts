import { useColorScheme } from 'react-native';
import { dark, light } from './tokens';

export * from './tokens';

export function useColors() {
  return useColorScheme() === 'dark' ? dark : light;
}
