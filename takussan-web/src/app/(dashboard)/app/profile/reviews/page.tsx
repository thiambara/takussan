import type { Metadata } from 'next';
import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { ProfileReviewsList } from '@/components/profile/ProfileReviewsList';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

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
      <PageHeader
        eyebrow={
          <span className="normal-case tracking-normal">
            <Link
              href="/app/profile"
              className="-my-1 inline-flex min-h-6 items-center rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('breadcrumbProfile')}
            </Link>
            <span aria-hidden="true" className="mx-1">
              /
            </span>
            <span>{t('breadcrumbCurrent')}</span>
          </span>
        }
        title={t('title')}
        description={t('subtitle')}
      />

      <ProfileReviewsList roles={user.roles} />
    </ProfileLayout>
  );
}
