/**
 * Types offered by the KYC file pickers: exactly `AcceptedUploads::KYC_MIMETYPES`
 * (takussan-api). `image/*` let a GIF or an AVIF through, refused in 422.
 * Kept in sync by `accept-des-televersements.parity.tck-1888.test.tsx`.
 *
 * Module à part (TCK-2150) : `kyc-components.tsx` (console super-admin) et « Vos pièces » (`VosPieces.tsx`) le lisent
 * sans importer de composant, donc sans en embarquer les espaces de traduction.
 */
export const KYC_MIME_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
].join(',');
