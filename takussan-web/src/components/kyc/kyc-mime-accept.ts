/**
 * Types offered by the KYC file pickers: exactly `AcceptedUploads::KYC_MIMETYPES`
 * (takussan-api). `image/*` let a GIF or an AVIF through, refused in 422.
 * Kept in sync by `accept-des-televersements.parity.tck-1888.test.tsx`.
 *
 * Module à part (TCK-2150) : `kyc-components.tsx` le lit sans importer `KycUploader`, dont les
 * espaces de traduction ne sont pas déclarés sur la console super-admin.
 */
export const KYC_MIME_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
].join(',');
