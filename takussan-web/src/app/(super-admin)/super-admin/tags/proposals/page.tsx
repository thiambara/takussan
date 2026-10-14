import { FileDePropositions } from '@/components/admin/super/FileDePropositions';

/** TCK-633 (AC5, ADR-0062 §7) — les équipements saisis hors du catalogue. */
export default function SuperAdminTagProposalsPage() {
  return <FileDePropositions genre="tags" />;
}
