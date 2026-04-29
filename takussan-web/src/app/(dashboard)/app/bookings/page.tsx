import { getMeAction } from '@/app/actions/auth';
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
        <h1 className="text-2xl font-bold text-app-ink">Réservations</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Gérez vos demandes de réservation
        </p>
      </div>
      <BookingsList />
    </div>
  );
}
