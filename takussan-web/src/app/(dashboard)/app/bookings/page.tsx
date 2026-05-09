import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Réservations' };
import { isSuperAdmin } from '@/lib/roles';
import { BookingsList } from '@/components/bookings/BookingsList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';

export default async function Page() {
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/bookings
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title="Réservations" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Réservations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez vos demandes de réservation
        </p>
      </div>
      <BookingsList />
    </div>
  );
}
