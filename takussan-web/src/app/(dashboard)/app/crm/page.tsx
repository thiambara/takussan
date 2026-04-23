import { permanentRedirect } from 'next/navigation';

/**
 * TCK-042 — the CRM section moved from `/app/crm` to `/app/customers`.
 * Keeping a permanent redirect so any bookmarked links still resolve.
 */
export default function Page() {
  permanentRedirect('/app/customers');
}
