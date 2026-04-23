import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { NotificationPreferencesMatrix } from '@/components/profile/NotificationPreferencesMatrix';

export default async function ProfileNotificationsPage() {
  // Force a session check — if the user isn't authenticated, getMeAction
  // redirects them to /auth/login.
  await getMeAction();

  return (
    <ProfileLayout>
      <header className="space-y-1">
        <nav className="text-sm text-app-ink-muted">
          <Link href="/app/profile" className="hover:underline">
            Profil
          </Link>
          <span aria-hidden="true" className="mx-1">
            /
          </span>
          <span>Notifications</span>
        </nav>
        <h1 className="text-2xl font-bold text-app-ink">
          Préférences de notifications
        </h1>
        <p className="text-sm text-app-ink-muted">
          Choisissez quels événements vous recevez sur chaque canal.
        </p>
      </header>

      <NotificationPreferencesMatrix />
    </ProfileLayout>
  );
}
