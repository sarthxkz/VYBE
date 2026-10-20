package expo.modules.vybesignal

import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.UntrustedIdentityException
import org.signal.libsignal.protocol.ecc.ECKeyPair
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.fingerprint.NumericFingerprintGenerator
import org.signal.libsignal.protocol.kem.KEMKeyPair
import org.signal.libsignal.protocol.kem.KEMKeyType
import org.signal.libsignal.protocol.kem.KEMPublicKey
import org.signal.libsignal.protocol.message.CiphertextMessage
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyBundle
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import org.signal.libsignal.protocol.util.KeyHelper
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

private fun ByteArray.b64() = Base64.encodeToString(this, Base64.NO_WRAP)
private fun String.unb64() = Base64.decode(this, Base64.NO_WRAP)

class SignalError(code: String, message: String, cause: Throwable? = null) : CodedException(code, message, cause)

/** Exception class + message (never key material) so failures reported from phones say what actually broke. */
private fun Throwable.describe() = "${javaClass.simpleName}: ${message ?: ""}".take(300)

/**
 * JS bridge for the Signal protocol. Private keys, sessions and ratchet state never leave this module:
 * JS only receives public keys, ciphertext, and decrypted plaintext for display.
 */
class VybeSignalModule : Module() {
  private val store by lazy {
    VybeProtocolStore(SecureStateFile(appContext.reactContext ?: throw SignalError("NO_CONTEXT", "No Android context"), "vybe_signal.bin"))
  }
  private fun address(userId: String) = SignalProtocolAddress(userId, 1)
  private fun local() = address(store.localName)

  private fun requireRegistered() {
    if (!store.isRegistered) throw SignalError("NOT_REGISTERED", "Encryption keys not set up on this device")
  }

  private fun newPreKeys(count: Int): Map<String, Any> {
    val identity = store.identityKeyPair
    val ec = (0 until count).map {
      val id = store.nextId("nextPreKeyId")
      val kp = ECKeyPair.generate()
      store.storePreKey(id, PreKeyRecord(id, kp))
      mapOf("id" to id, "publicKey" to kp.publicKey.serialize().b64())
    }
    val kyber = (0 until count).map {
      val id = store.nextId("nextKyberId")
      val kp = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
      val sig = identity.privateKey.calculateSignature(kp.publicKey.serialize())
      store.storeKyberPreKey(id, KyberPreKeyRecord(id, System.currentTimeMillis(), kp, sig))
      mapOf("id" to id, "publicKey" to kp.publicKey.serialize().b64(), "signature" to sig.b64())
    }
    store.persist()
    return mapOf("preKeys" to ec, "kyberPreKeys" to kyber)
  }

  private fun newSignedPreKey(): Map<String, Any> {
    val identity = store.identityKeyPair
    val id = store.nextId("nextSignedId")
    val kp = ECKeyPair.generate()
    val sig = identity.privateKey.calculateSignature(kp.publicKey.serialize())
    store.storeSignedPreKey(id, SignedPreKeyRecord(id, System.currentTimeMillis(), kp, sig))
    // Keep the previous signed prekey for in-flight sessions; drop anything older.
    store.loadSignedPreKeys().sortedByDescending { it.id }.drop(2).forEach { store.removeSignedPreKey(it.id) }
    return mapOf("id" to id, "publicKey" to kp.publicKey.serialize().b64(), "signature" to sig.b64())
  }

  override fun definition() = ModuleDefinition {
    Name("VybeSignal")

    AsyncFunction("isRegistered") { store.isRegistered }

    /** Creates a fresh identity (first launch or reinstall) and returns the public registration payload. */
    AsyncFunction("createRegistration") { localUserId: String, oneTimeCount: Int ->
      store.initialize(IdentityKeyPair.generate(), KeyHelper.generateRegistrationId(false), localUserId)
      val identity = store.identityKeyPair
      val signed = newSignedPreKey()
      val lrId = store.nextId("nextKyberId")
      val lr = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
      val lrSig = identity.privateKey.calculateSignature(lr.publicKey.serialize())
      store.storeKyberPreKey(lrId, KyberPreKeyRecord(lrId, System.currentTimeMillis(), lr, lrSig))
      store.setLastResortKyberId(lrId)
      mapOf(
        "registrationId" to store.localRegistrationId,
        "identityKey" to identity.publicKey.serialize().b64(),
        "signedPreKey" to signed,
        "kyberPreKey" to mapOf("id" to lrId, "publicKey" to lr.publicKey.serialize().b64(), "signature" to lrSig.b64()),
      ) + newPreKeys(oneTimeCount.coerceIn(1, 100))
    }

    AsyncFunction("generatePreKeys") { count: Int ->
      requireRegistered()
      newPreKeys(count.coerceIn(1, 100))
    }

    AsyncFunction("rotateSignedPreKey") {
      requireRegistered()
      newSignedPreKey()
    }

    AsyncFunction("registrationId") {
      requireRegistered()
      store.localRegistrationId
    }

    AsyncFunction("hasSession") { userId: String -> store.isRegistered && store.containsSession(address(userId)) }

    AsyncFunction("processBundle") { bundle: Map<String, Any?> ->
      requireRegistered()
      try {
        @Suppress("UNCHECKED_CAST")
        val spk = bundle["signedPreKey"] as Map<String, Any?>
        @Suppress("UNCHECKED_CAST")
        val kyber = bundle["kyberPreKey"] as Map<String, Any?>
        @Suppress("UNCHECKED_CAST")
        val pre = bundle["preKey"] as Map<String, Any?>?
        val b = PreKeyBundle(
          (bundle["registrationId"] as Number).toInt(),
          1,
          pre?.let { (it["id"] as Number).toInt() } ?: PreKeyBundle.NULL_PRE_KEY_ID,
          pre?.let { ECPublicKey((it["publicKey"] as String).unb64()) },
          (spk["id"] as Number).toInt(),
          ECPublicKey((spk["publicKey"] as String).unb64()),
          (spk["signature"] as String).unb64(),
          IdentityKey((bundle["identityKey"] as String).unb64()),
          (kyber["id"] as Number).toInt(),
          KEMPublicKey((kyber["publicKey"] as String).unb64()),
          (kyber["signature"] as String).unb64(),
        )
        // Verifies the signed prekey and Kyber signatures against the identity key.
        SessionBuilder(store, address(bundle["userId"] as String), local()).process(b)
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw SignalError("INVALID_BUNDLE", "Could not start an encrypted session (${e.describe()})", e)
      }
    }

    AsyncFunction("encrypt") { userId: String, plaintextB64: String ->
      requireRegistered()
      try {
        val msg = SessionCipher(store, address(userId), local()).encrypt(plaintextB64.unb64())
        mapOf("type" to msg.type, "body" to msg.serialize().b64())
      } catch (e: org.signal.libsignal.protocol.NoSessionException) {
        throw SignalError("NO_SESSION", "No session", e)
      } catch (e: UntrustedIdentityException) {
        throw SignalError("UNTRUSTED_IDENTITY", "Identity changed", e)
      }
    }

    AsyncFunction("decrypt") { userId: String, type: Int, bodyB64: String ->
      requireRegistered()
      val cipher = SessionCipher(store, address(userId), local())
      try {
        val out = when (type) {
          CiphertextMessage.PREKEY_TYPE -> cipher.decrypt(PreKeySignalMessage(bodyB64.unb64()))
          CiphertextMessage.WHISPER_TYPE -> cipher.decrypt(SignalMessage(bodyB64.unb64()))
          else -> throw SignalError("BAD_TYPE", "Unknown message type")
        }
        out.b64()
      } catch (e: CodedException) {
        throw e
      } catch (e: org.signal.libsignal.protocol.DuplicateMessageException) {
        throw SignalError("DUPLICATE", "Already decrypted", e)
      } catch (e: Exception) {
        throw SignalError("DECRYPT_FAILED", "Could not decrypt message (${e.describe()})", e)
      }
    }

    /** Signal-style 60-digit safety number for comparing identities in person. */
    AsyncFunction("safetyNumber") { localUserId: String, remoteUserId: String, remoteIdentityB64: String ->
      requireRegistered()
      NumericFingerprintGenerator(5200)
        .createFor(2, localUserId.toByteArray(), store.identityKeyPair.publicKey, remoteUserId.toByteArray(), IdentityKey(remoteIdentityB64.unb64()))
        .displayableFingerprint.displayText
    }

    AsyncFunction("identityChanged") { userId: String -> store.identityChanged(userId) }
    AsyncFunction("acknowledgeIdentity") { userId: String -> store.acknowledgeIdentity(userId) }

    /** Called when a friend reinstalls: drop the old session so the next send fetches a fresh bundle. */
    AsyncFunction("resetSession") { userId: String -> if (store.isRegistered) store.deleteAllSessions(userId) }

    // Chat-backup key from the user's backup password: PBKDF2-HMAC-SHA256, 600k rounds (OWASP 2023), 256-bit.
    // Native because it is ~1 s of CPU here and minutes in JS. Runs off the main thread (AsyncFunction).
    AsyncFunction("deriveBackupKey") { password: String, saltB64: String ->
      val spec = PBEKeySpec(password.toCharArray(), saltB64.unb64(), 600_000, 256)
      try {
        SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded.b64()
      } finally {
        spec.clearPassword()
      }
    }

    /** Sign-out / account deletion: destroys all keys and sessions on this device. */
    AsyncFunction("wipe") { store.wipe() }
  }
}
