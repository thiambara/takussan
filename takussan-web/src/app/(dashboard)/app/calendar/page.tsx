import { getMeAction } from '@/app/actions/auth';
import { CalendarPage } from '@/components/calendar/CalendarPage';

export const metadata = {
  title: 'Calendrier',
};

/**
 * TCK-072 — Calendrier agrégé agent/owner.
 *
 * Vue mois/semaine/jour/liste consolidant réservations courte durée et
 * visites planifiées. Scope et sécurité sont gérés côté back
 * (`/api/calendar`) en fonction du rôle de l'utilisateur.
 */
export default async function Page() {
  await getMeAction();
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
