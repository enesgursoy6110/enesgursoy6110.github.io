// Same v1 contract as Flutter EncryptedBackupCodec and RankingBackupAttachment.
// Decryption is local. Neither the backup nor its password is uploaded.
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validProof(value) {
  return value !== null && typeof value === 'object' &&
    typeof value.profileId === 'string' && uuid.test(value.profileId) &&
    typeof value.recoveryCode === 'string' && /^[0-9a-f]{64}$/.test(value.recoveryCode);
}
export class BackupError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function bytes(value, size) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new BackupError('invalid');
  }
  const result = Uint8Array.from(atob(value), char => char.charCodeAt(0));
  if (size !== undefined && result.length !== size) throw new BackupError('invalid');
  return result;
}
export async function proofFromBackup(file, password, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new BackupError('unavailable');
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BACKUP_BYTES) {
    throw new BackupError('invalid');
  }
  let clear;
  try {
    const envelope = JSON.parse(await file.text());
    if (envelope?.format !== 'routelog-backup' || envelope.version !== 1) throw new BackupError('invalid');
    const salt = bytes(envelope.salt, 16);
    const nonce = bytes(envelope.nonce, 12);
    const mac = bytes(envelope.mac, 16);
    const data = bytes(envelope.data);
    // Protect against a file implementation lying about its size as well.
    if (data.length > MAX_BACKUP_BYTES || typeof password !== 'string') throw new BackupError('invalid');
    const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey({name:'PBKDF2', salt, iterations:120000, hash:'SHA-256'}, material,
      {name:'AES-GCM', length:256}, false, ['decrypt']);
    const sealed = new Uint8Array(data.length + mac.length);
    sealed.set(data); sealed.set(mac, data.length);
    clear = new Uint8Array(await subtle.decrypt({name:'AES-GCM', iv:nonce, tagLength:128}, key, sealed));
    const payload = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(clear));
    const section = payload?.ranking;
    if (section == null) throw new BackupError('noProfile');
    const proof = {profileId: section.profile_id, recoveryCode: section.recovery_code};
    if (section.version !== 1 || !validProof(proof)) throw new BackupError('noProfile');
    return Object.freeze(proof); // Never expose tables, coordinates or names.
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('invalid'); // No password/code/native error in messages.
  } finally {
    clear?.fill(0); // Immutable strings/GC cannot guarantee complete zeroization.
  }
}
