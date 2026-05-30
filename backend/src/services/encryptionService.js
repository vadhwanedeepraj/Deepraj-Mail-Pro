"use strict";

const crypto = require("crypto");
const { ENCRYPTION_KEY } = require("../config/env");

const ALGORITHM  = "aes-256-gcm";
const KEY_BUFFER = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest(); // derived 32 bytes

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Generates a fresh random 12-byte IV per encryption (critical for GCM security).
 *
 * @param {string} plaintext
 * @returns {{ encrypted: string, iv: string, authTag: string }} All hex strings
 */
function encrypt(plaintext) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // 16-byte GCM authentication tag

  return {
    encrypted: encrypted.toString("hex"),
    iv:        iv.toString("hex"),
    authTag:   authTag.toString("hex"),
  };
}

/**
 * Decrypts a ciphertext produced by `encrypt()`.
 *
 * @param {string} encryptedHex - Hex-encoded ciphertext
 * @param {string} ivHex        - Hex-encoded IV
 * @param {string} authTagHex   - Hex-encoded GCM auth tag
 * @returns {string} Decrypted plaintext
 */
function decrypt(encryptedHex, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY_BUFFER,
    Buffer.from(ivHex, "hex")
  );

  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = { encrypt, decrypt };
