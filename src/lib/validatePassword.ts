export interface PasswordChecks {
  minLength: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
}

export interface ValidationResult {
  valid: boolean;
  checks: PasswordChecks;
}

/**
 * Memvalidasi kriteria password:
 * - Minimal 8 karakter
 * - Mengandung huruf kecil (a-z)
 * - Mengandung huruf besar (A-Z)
 * - Mengandung angka (0-9)
 */
export function validatePassword(password: string = ""): ValidationResult {
  const checks: PasswordChecks = {
    minLength: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const valid = Object.values(checks).every(Boolean);
  return { valid, checks };
}
