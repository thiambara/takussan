import { FileDePropositions } from '@/components/admin/super/FileDePropositions';

/** TCK-633 (AC5) — les quartiers saisis hors du référentiel, à approuver, renommer, fusionner ou refuser. */
export default function SuperAdminGeoProposalsPage() {
  return <FileDePropositions genre="geo" />;
}
