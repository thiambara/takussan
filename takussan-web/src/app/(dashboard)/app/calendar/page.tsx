import { forbidden } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { CalendarPage } from '@/components/calendar/CalendarPage';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';

export const metadata = {
  title: 'Calendrier',
};

/**
 * TCK-072 — Calendrier agrégé agent/owner.
 *
 * Vue mois/semaine/jour/liste consolidant réservations courte durée et
 * visites planifiées. Scope et sécurité sont gérés côté back
 * (`/api/calendar`) en fonction du rôle de l'utilisateur.
 *
 * Role gate : l'agrégateur calendrier n'a de sens que pour agent /
 * owner / admin (il scope par `property.user_id` / `agency_id` /
 * collaborateur accepté, pas par `customer_id`). Un customer n'y
 * trouverait jamais ses propres réservations — on renvoie donc 403
 * avant de servir la page, en accord avec la contrainte métier du
 * ticket et le gate sidebar.
 */
export default async function Page() {
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isOwner(user.roles) || isAdmin(user.roles))) {
    forbidden();
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Calendrier</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Vos réservations et visites planifiées dans une vue unifiée.
        </p>
      </div>
      <CalendarPage />
    </div>
  );
}
