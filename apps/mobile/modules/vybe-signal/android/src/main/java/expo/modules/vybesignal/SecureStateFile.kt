package expo.modules.vybesignal

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * A small file encrypted with AES-256-GCM under a non-exportable Android Keystore key.
 * Layout: [12-byte IV][ciphertext+tag]. Writes are atomic (AtomicFile).
 */
class SecureStateFile(context: Context, name: String) {
  private val file = AtomicFile(File(context.noBackupFilesDir, name))
  private val alias = "vybe_signal_state_v1"

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    gen.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return gen.generateKey()
  }

  fun read(): ByteArray? {
    if (!file.baseFile.exists()) return null
    val bytes = file.readFully()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, 12))
    return cipher.doFinal(bytes, 12, bytes.size - 12)
  }

  fun write(plain: ByteArray) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val out = cipher.iv + cipher.doFinal(plain)
    val stream = file.startWrite()
    try {
      stream.write(out)
      file.finishWrite(stream)
    } catch (e: Exception) {
      file.failWrite(stream)
      throw e
    }
  }

  fun delete() {
    file.delete()
    runCatching { KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias) }
  }
}
