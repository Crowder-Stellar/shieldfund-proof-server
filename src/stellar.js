// Minimal Stellar StrKey check for account ids (G... addresses), so
// /api/address-to-field only derives recipient ids from real addresses.
// Format: base32( version byte | 32-byte ed25519 key | CRC16-XModem LE ).

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ACCOUNT_ID_VERSION = 6 << 3; // 0x30, encodes as a leading "G"

function base32Decode(str) {
  const out = [];
  let bits = 0;
  let value = 0;
  for (const ch of str) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function crc16XModem(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc;
}

function isValidAccountId(address) {
  if (typeof address !== "string" || !/^G[A-Z2-7]{55}$/.test(address)) return false;
  const decoded = base32Decode(address); // 56 chars * 5 bits = exactly 35 bytes
  if (decoded[0] !== ACCOUNT_ID_VERSION) return false;
  const checksum = decoded.readUInt16LE(33);
  return checksum === crc16XModem(decoded.subarray(0, 33));
}

module.exports = { isValidAccountId };
