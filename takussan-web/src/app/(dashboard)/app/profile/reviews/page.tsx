import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { ProfileReviewsList } from '@/components/profile/ProfileReviewsList';

export default async function ProfileReviewsPage() {
  // Force a session check — if the user isn't authenticated, getMeAction
  // redirects them to /auth/login.
  const user = await getMeAction();
  const isOwner = user.roles.includes('owner');

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
          <span>Avis</span>
        </nav>
        <h1 className="text-2xl font-bold text-app-ink">
          {isOwner ? 'Avis reçus' : 'Vos avis'}
        </h1>
        <p className="text-sm text-app-ink-muted">
          {isOwner
            ? 'Consultez les avis publiés sur vos biens et répondez quand nécessaire.'
            : 'Retrouvez ici vos séjours et baux éligibles à un avis public.'}
        </p>
      </header>

      <ProfileReviewsList roles={user.roles} />
    </ProfileLayout>
  );
}
