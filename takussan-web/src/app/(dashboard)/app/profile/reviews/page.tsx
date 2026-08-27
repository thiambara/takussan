import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { ProfileReviewsList } from '@/components/profile/ProfileReviewsList';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

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
            <Link href="/app/profile" className="hover:underline">
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
