import { redirect } from 'next/navigation';

/**
 * TCK-132 — the cross-tenant properties view moved to `/super-admin/properties`
 * (the agency_admin dashboard owns `/admin/*`, see TCK-131). The old super_admin
 * stub at this path now permanently redirects to the new home.
 */
export default function Page() {
  redirect('/super-admin/properties');
}
