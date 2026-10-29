/**
 * lib/presentArtisan.ts
 * Langkah 6: Helper untuk menyajikan objek artisan ke klien.
 *
 * Aturan:
 * - Selalu hapus field `user` (privasi) dan `brandKey` (internal) dari output.
 * - `avatarUrl` efektif: artisan.avatarUrl ?? user.avatarUrl ?? null
 *   Official Store (userId null) tidak punya fallback.
 * - Bila `owner: true` (pemilik atau admin), tambahkan `ownAvatarUrl` (nilai kolom artisan.avatarUrl).
 * - Respons publik TIDAK memuat `ownAvatarUrl`.
 */

export interface ArtisanForPresent {
  avatarUrl?: string | null;
  brandKey?: string | null;
  user?: { avatarUrl?: string | null } | null;
  userId?: string | null;
  [key: string]: unknown;
}

export interface PresentArtisanOptions {
  /** Bila true, tambahkan ownAvatarUrl (kolom asli, bukan efektif). Gunakan untuk pemilik dan admin. */
  owner?: boolean;
}

export function presentArtisan(artisan: ArtisanForPresent, opts: PresentArtisanOptions = {}) {
  const ownAvatarUrl = artisan.avatarUrl ?? null;

  // Foto efektif: milik sendiri → foto akun → null
  // Official Store (userId null) tidak dapat fallback foto akun
  let effectiveAvatarUrl: string | null = ownAvatarUrl;
  if (effectiveAvatarUrl === null && artisan.userId) {
    effectiveAvatarUrl = artisan.user?.avatarUrl ?? null;
  }

  // Salin semua field, lalu override/bersihkan
  const { user: _user, brandKey: _brandKey, ...rest } = artisan as any;

  const result: Record<string, unknown> = {
    ...rest,
    avatarUrl: effectiveAvatarUrl,
  };

  if (opts.owner) {
    result.ownAvatarUrl = ownAvatarUrl;
  }

  return result;
}
