import type { Metadata } from 'next';
import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { ProfileReviewsList } from '@/components/profile/ProfileReviewsList';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.profileReviews');
  return { title: t('metaTitle') };
}

export default async function ProfileReviewsPage() {
  const t = await getTranslations('dashboard.pages.profileReviews');
  // Force a session check — if the user isn't authenticated, getMeAction
  // redirects them to /auth/login.
  const user = await getMeAction();

  return (
    <ProfileLayout>
      <header className="space-y-1">
        <nav className="text-sm text-muted-foreground">
          <Link href="/app/profile" className="hover:underline">
            {t('breadcrumbProfile')}
          </Link>
          <span aria-hidden="true" className="mx-1">
            /
          </span>
          <span>{t('breadcrumbCurrent')}</span>
        </nav>
        <h1 className="font-display text-2xl font-bold text-foreground">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <ProfileReviewsList roles={user.roles} />
    </ProfileLayout>
  );
}
