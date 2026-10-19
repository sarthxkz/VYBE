import { requireNativeModule } from 'expo';

export type SignedKey = { id: number; publicKey: string; signature: string };
export type PreKeys = { preKeys: { id: number; publicKey: string }[]; kyberPreKeys: SignedKey[] };
export type Registration = PreKeys & { registrationId: number; identityKey: string; signedPreKey: SignedKey; kyberPreKey: SignedKey };
export type Bundle = {
  userId: string;
  registrationId: number;
  identityKey: string;
  signedPreKey: SignedKey;
  kyberPreKey: SignedKey;
  preKey: { id: number; publicKey: string } | null;
};

type VybeSignalModule = {
  isRegistered(): Promise<boolean>;
  createRegistration(localUserId: string, oneTimeCount: number): Promise<Registration>;
  generatePreKeys(count: number): Promise<PreKeys>;
  rotateSignedPreKey(): Promise<SignedKey>;
  registrationId(): Promise<number>;
  hasSession(userId: string): Promise<boolean>;
  processBundle(bundle: Bundle): Promise<void>;
  /** plaintext and body are base64 */
  encrypt(userId: string, plaintextB64: string): Promise<{ type: 2 | 3; body: string }>;
  decrypt(userId: string, type: number, bodyB64: string): Promise<string>;
  safetyNumber(localUserId: string, remoteUserId: string, remoteIdentityB64: string): Promise<string>;
  identityChanged(userId: string): Promise<boolean>;
  acknowledgeIdentity(userId: string): Promise<void>;
  resetSession(userId: string): Promise<void>;
  wipe(): Promise<void>;
};

export default requireNativeModule<VybeSignalModule>('VybeSignal');
