// In-memory Signal protocol client used to drive the real API in tests (same library family as the app).
import { randomUUID } from 'node:crypto';
import * as S from '@signalapp/libsignal-client';

class Stores {
  identity = S.IdentityKeyPair.generate();
  registrationId = 1 + Math.floor(Math.random() * 16000);
  sessions = new Map<string, S.SessionRecord>();
  identities = new Map<string, S.PublicKey>();
  preKeys = new Map<number, S.PreKeyRecord>();
  signed = new Map<number, S.SignedPreKeyRecord>();
  kyber = new Map<number, S.KyberPreKeyRecord>();

  session = new (class extends S.SessionStore {
    constructor(private s: Stores) {
      super();
    }
    async saveSession(a: S.ProtocolAddress, r: S.SessionRecord) {
      this.s.sessions.set(a.toString(), r);
    }
    async getSession(a: S.ProtocolAddress) {
      return this.s.sessions.get(a.toString()) ?? null;
    }
    async getExistingSessions(as: S.ProtocolAddress[]) {
      return as.map((a) => this.s.sessions.get(a.toString())!);
    }
  })(this);

  identityStore = new (class extends S.IdentityKeyStore {
    constructor(private s: Stores) {
      super();
    }
    async getIdentityKey() {
      return this.s.identity.privateKey;
    }
    async getLocalRegistrationId() {
      return this.s.registrationId;
    }
    async saveIdentity(a: S.ProtocolAddress, k: S.PublicKey) {
      const prev = this.s.identities.get(a.toString());
      this.s.identities.set(a.toString(), k);
      return prev && !prev.equals(k) ? S.IdentityChange.ReplacedExisting : S.IdentityChange.NewOrUnchanged;
    }
    async isTrustedIdentity(a: S.ProtocolAddress, k: S.PublicKey) {
      const prev = this.s.identities.get(a.toString());
      return !prev || prev.equals(k);
    }
    async getIdentity(a: S.ProtocolAddress) {
      return this.s.identities.get(a.toString()) ?? null;
    }
  })(this);

  preKeyStore = new (class extends S.PreKeyStore {
    constructor(private s: Stores) {
      super();
    }
    async savePreKey(id: number, r: S.PreKeyRecord) {
      this.s.preKeys.set(id, r);
    }
    async getPreKey(id: number) {
      return this.s.preKeys.get(id)!;
    }
    async removePreKey(id: number) {
      this.s.preKeys.delete(id);
    }
  })(this);

  signedStore = new (class extends S.SignedPreKeyStore {
    constructor(private s: Stores) {
      super();
    }
    async saveSignedPreKey(id: number, r: S.SignedPreKeyRecord) {
      this.s.signed.set(id, r);
    }
    async getSignedPreKey(id: number) {
      return this.s.signed.get(id)!;
    }
  })(this);

  kyberStore = new (class extends S.KyberPreKeyStore {
    constructor(private s: Stores) {
      super();
    }
    async saveKyberPreKey(id: number, r: S.KyberPreKeyRecord) {
      this.s.kyber.set(id, r);
    }
    async getKyberPreKey(id: number) {
      return this.s.kyber.get(id)!;
    }
    async markKyberPreKeyUsed() {}
  })(this);
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

export class SignalClient {
  st = new Stores();
  constructor(public userId: string) {}
  addr = (userId: string) => S.ProtocolAddress.new(userId, 1);

  /** Generates keys and returns the PUT /keys/device payload (public parts only). */
  registration(oneTimeCount = 5) {
    const priv = this.st.identity.privateKey;
    const spk = S.PrivateKey.generate();
    const spkSig = priv.sign(spk.getPublicKey().serialize());
    this.st.signed.set(1, S.SignedPreKeyRecord.new(1, Date.now(), spk.getPublicKey(), spk, spkSig));
    const lastResort = S.KEMKeyPair.generate();
    const lrSig = priv.sign(lastResort.getPublicKey().serialize());
    this.st.kyber.set(1000, S.KyberPreKeyRecord.new(1000, Date.now(), lastResort, lrSig));
    const preKeys = [];
    const kyberPreKeys = [];
    for (let i = 1; i <= oneTimeCount; i++) {
      const k = S.PrivateKey.generate();
      this.st.preKeys.set(i, S.PreKeyRecord.new(i, k.getPublicKey(), k));
      preKeys.push({ id: i, publicKey: b64(k.getPublicKey().serialize()) });
      const kk = S.KEMKeyPair.generate();
      const sig = priv.sign(kk.getPublicKey().serialize());
      this.st.kyber.set(i, S.KyberPreKeyRecord.new(i, Date.now(), kk, sig));
      kyberPreKeys.push({ id: i, publicKey: b64(kk.getPublicKey().serialize()), signature: b64(sig) });
    }
    return {
      registrationId: this.st.registrationId,
      identityKey: b64(this.st.identity.publicKey.serialize()),
      signedPreKey: { id: 1, publicKey: b64(spk.getPublicKey().serialize()), signature: b64(spkSig) },
      kyberPreKey: { id: 1000, publicKey: b64(lastResort.getPublicKey().serialize()), signature: b64(lrSig) },
      preKeys,
      kyberPreKeys,
    };
  }

  async startSession(bundle: {
    userId: string;
    registrationId: number;
    identityKey: string;
    signedPreKey: { id: number; publicKey: string; signature: string };
    kyberPreKey: { id: number; publicKey: string; signature: string };
    preKey: { id: number; publicKey: string } | null;
  }) {
    const b = S.PreKeyBundle.new(
      bundle.registrationId,
      1,
      bundle.preKey?.id ?? null,
      bundle.preKey ? S.PublicKey.deserialize(unb64(bundle.preKey.publicKey)) : null,
      bundle.signedPreKey.id,
      S.PublicKey.deserialize(unb64(bundle.signedPreKey.publicKey)),
      unb64(bundle.signedPreKey.signature),
      S.PublicKey.deserialize(unb64(bundle.identityKey)),
      bundle.kyberPreKey.id,
      S.KEMPublicKey.deserialize(unb64(bundle.kyberPreKey.publicKey)),
      unb64(bundle.kyberPreKey.signature),
    );
    await S.processPreKeyBundle(b, this.addr(bundle.userId), this.addr(this.userId), this.st.session, this.st.identityStore);
  }

  async encrypt(to: string, recipientRegistrationId: number, text: string) {
    const c = await S.signalEncrypt(new TextEncoder().encode(text), this.addr(to), this.addr(this.userId), this.st.session, this.st.identityStore);
    return { clientMsgId: randomUUID(), recipientId: to, recipientRegistrationId, type: c.type(), body: b64(c.serialize()) };
  }

  async decrypt(from: string, type: number, body: string) {
    const bytes = unb64(body);
    const out =
      type === S.CiphertextMessageType.PreKey
        ? await S.signalDecryptPreKey(
            S.PreKeySignalMessage.deserialize(bytes),
            this.addr(from),
            this.addr(this.userId),
            this.st.session,
            this.st.identityStore,
            this.st.preKeyStore,
            this.st.signedStore,
            this.st.kyberStore,
          )
        : await S.signalDecrypt(S.SignalMessage.deserialize(bytes), this.addr(from), this.addr(this.userId), this.st.session, this.st.identityStore);
    return new TextDecoder().decode(out);
  }
}
