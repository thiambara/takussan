import { getMeAction } from '@/app/actions/auth';
import { CalendarPage } from '@/components/calendar/CalendarPage';
import { assertCanReachAgentArea } from '@/lib/auth/guards';

export const metadata = {
  title: 'Calendrier',
};

export default async function Page() {
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Calendrier</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vos réservations et visites planifiées dans une vue unifiée.
        </p>
      </div>
      <CalendarPage />
    </div>
  );
}
