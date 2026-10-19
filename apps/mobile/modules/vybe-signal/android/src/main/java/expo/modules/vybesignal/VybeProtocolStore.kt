package expo.modules.vybesignal

import android.util.Base64
import org.json.JSONObject
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.NoSessionException
import org.signal.libsignal.protocol.ReusedBaseKeyException
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.groups.state.SenderKeyRecord
import org.signal.libsignal.protocol.state.IdentityKeyStore
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SignalProtocolStore
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import java.util.UUID

private fun ByteArray.b64() = Base64.encodeToString(this, Base64.NO_WRAP)
private fun String.unb64() = Base64.decode(this, Base64.NO_WRAP)
private fun skey(a: SignalProtocolAddress) = "${a.name}.${a.deviceId}"

/**
 * Signal protocol state, persisted as one encrypted JSON document.
 * shortcut: rewrites the whole file on each mutation; fine for a few hundred sessions, move to SQLCipher beyond that.
 */
class VybeProtocolStore(private val file: SecureStateFile) : SignalProtocolStore {
  private var root: JSONObject = file.read()?.let { JSONObject(String(it, Charsets.UTF_8)) } ?: JSONObject()

  private fun section(name: String): JSONObject = root.optJSONObject(name) ?: JSONObject().also { root.put(name, it) }
  private fun save() = file.write(root.toString().toByteArray(Charsets.UTF_8))

  val isRegistered get() = root.has("identity")
  val localName: String get() = root.getString("localName")

  @Synchronized fun initialize(identity: IdentityKeyPair, registrationId: Int, localName: String) {
    root = JSONObject()
    root.put("identity", identity.serialize().b64())
    root.put("registrationId", registrationId)
    root.put("localName", localName)
    save()
  }

  @Synchronized fun wipe() {
    root = JSONObject()
    file.delete()
  }

  @Synchronized fun nextId(counter: String): Int {
    val id = root.optInt(counter, 1)
    root.put(counter, if (id >= 0xFFFFFF) 1 else id + 1)
    return id
  }

  @Synchronized fun persist() = save()

  /** Users whose identity key changed since we last saw them (cleared when acknowledged). */
  @Synchronized fun identityChanged(name: String) = section("changed").has(name)
  @Synchronized fun acknowledgeIdentity(name: String) {
    section("changed").remove(name)
    save()
  }

  // IdentityKeyStore
  override fun getIdentityKeyPair() = IdentityKeyPair(root.getString("identity").unb64())
  override fun getLocalRegistrationId() = root.getInt("registrationId")

  @Synchronized override fun saveIdentity(address: SignalProtocolAddress, key: IdentityKey): IdentityKeyStore.IdentityChange {
    val ids = section("identities")
    val prev = ids.optString(address.name, "")
    val next = key.serialize().b64()
    if (prev == next) return IdentityKeyStore.IdentityChange.NEW_OR_UNCHANGED
    ids.put(address.name, next)
    if (prev.isNotEmpty()) section("changed").put(address.name, true)
    save()
    return if (prev.isEmpty()) IdentityKeyStore.IdentityChange.NEW_OR_UNCHANGED else IdentityKeyStore.IdentityChange.REPLACED_EXISTING
  }

  // Trust on first use; a changed key is accepted but flagged so the UI shows "safety number changed".
  override fun isTrustedIdentity(address: SignalProtocolAddress, key: IdentityKey, direction: IdentityKeyStore.Direction) = true

  @Synchronized override fun getIdentity(address: SignalProtocolAddress): IdentityKey? =
    section("identities").optString(address.name, "").takeIf { it.isNotEmpty() }?.let { IdentityKey(it.unb64()) }

  // PreKeyStore
  @Synchronized override fun loadPreKey(id: Int): PreKeyRecord =
    section("preKeys").optString(id.toString(), "").takeIf { it.isNotEmpty() }?.let { PreKeyRecord(it.unb64()) }
      ?: throw InvalidKeyIdException("no prekey $id")
  @Synchronized override fun storePreKey(id: Int, record: PreKeyRecord) { section("preKeys").put(id.toString(), record.serialize().b64()); save() }
  @Synchronized override fun containsPreKey(id: Int) = section("preKeys").has(id.toString())
  @Synchronized override fun removePreKey(id: Int) { section("preKeys").remove(id.toString()); save() }

  // SignedPreKeyStore
  @Synchronized override fun loadSignedPreKey(id: Int): SignedPreKeyRecord =
    section("signed").optString(id.toString(), "").takeIf { it.isNotEmpty() }?.let { SignedPreKeyRecord(it.unb64()) }
      ?: throw InvalidKeyIdException("no signed prekey $id")
  @Synchronized override fun loadSignedPreKeys(): List<SignedPreKeyRecord> =
    section("signed").let { s -> s.keys().asSequence().map { SignedPreKeyRecord(s.getString(it).unb64()) }.toList() }
  @Synchronized override fun storeSignedPreKey(id: Int, record: SignedPreKeyRecord) { section("signed").put(id.toString(), record.serialize().b64()); save() }
  @Synchronized override fun containsSignedPreKey(id: Int) = section("signed").has(id.toString())
  @Synchronized override fun removeSignedPreKey(id: Int) { section("signed").remove(id.toString()); save() }

  // KyberPreKeyStore. One-time Kyber keys are deleted on use; the last-resort key is kept.
  @Synchronized override fun loadKyberPreKey(id: Int): KyberPreKeyRecord =
    section("kyber").optString(id.toString(), "").takeIf { it.isNotEmpty() }?.let { KyberPreKeyRecord(it.unb64()) }
      ?: throw InvalidKeyIdException("no kyber prekey $id")
  @Synchronized override fun loadKyberPreKeys(): List<KyberPreKeyRecord> =
    section("kyber").let { s -> s.keys().asSequence().map { KyberPreKeyRecord(s.getString(it).unb64()) }.toList() }
  @Synchronized override fun storeKyberPreKey(id: Int, record: KyberPreKeyRecord) { section("kyber").put(id.toString(), record.serialize().b64()); save() }
  @Synchronized override fun containsKyberPreKey(id: Int) = section("kyber").has(id.toString())

  @Synchronized override fun markKyberPreKeyUsed(id: Int, signedPreKeyId: Int, baseKey: ECPublicKey) {
    if (id == root.optInt("lastResortKyberId", -1)) {
      // Last-resort key may be reused, but never with the same base key (replay protection).
      val used = section("lastResortUsed")
      val tag = "$signedPreKeyId:${baseKey.serialize().b64()}"
      if (used.has(tag)) throw ReusedBaseKeyException("reused base key")
      used.put(tag, true)
    } else {
      section("kyber").remove(id.toString())
    }
    save()
  }

  @Synchronized fun setLastResortKyberId(id: Int) { root.put("lastResortKyberId", id) }

  // SessionStore
  @Synchronized override fun loadSession(address: SignalProtocolAddress): SessionRecord =
    section("sessions").optString(skey(address), "").takeIf { it.isNotEmpty() }?.let { SessionRecord(it.unb64()) } ?: SessionRecord()
  @Synchronized override fun loadExistingSessions(addresses: List<SignalProtocolAddress>): List<SessionRecord> =
    addresses.map { a ->
      section("sessions").optString(skey(a), "").takeIf { it.isNotEmpty() }?.let { SessionRecord(it.unb64()) }
        ?: throw NoSessionException("no session for $a")
    }
  @Synchronized override fun getSubDeviceSessions(name: String): List<Int> = emptyList()
  @Synchronized override fun storeSession(address: SignalProtocolAddress, record: SessionRecord) { section("sessions").put(skey(address), record.serialize().b64()); save() }
  @Synchronized override fun containsSession(address: SignalProtocolAddress) = section("sessions").has(skey(address))
  @Synchronized override fun deleteSession(address: SignalProtocolAddress) { section("sessions").remove(skey(address)); save() }
  @Synchronized override fun deleteAllSessions(name: String) {
    val s = section("sessions")
    s.keys().asSequence().filter { it.startsWith("$name.") }.toList().forEach { s.remove(it) }
    save()
  }

  // SenderKeyStore: group messaging is not used (1:1 chats only).
  override fun storeSenderKey(sender: SignalProtocolAddress, distributionId: UUID, record: SenderKeyRecord) =
    throw UnsupportedOperationException("group messaging not supported")
  override fun loadSenderKey(sender: SignalProtocolAddress, distributionId: UUID): SenderKeyRecord? = null
}
