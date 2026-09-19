/**
 * Memvalidasi kriteria password:
 * - Minimal 8 karakter
 * - Mengandung huruf kecil (a-z)
 * - Mengandung huruf besar (A-Z)
 * - Mengandung angka (0-9)
 */
function validatePassword(password = "") {
  const checks = {
    minLength: password.length >= 8,
    lowercase: /[a-z]/.test(password),
    uppercase: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
  };

  const valid = Object.values(checks).every(Boolean);
  return { valid, checks };
}

module.exports = { validatePassword };
