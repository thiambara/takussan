import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.bookings');
  return { title: t('metaTitle') };
}
import { isSuperAdmin } from '@/lib/roles';
import { BookingsList } from '@/components/bookings/BookingsList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { getTranslations } from 'next-intl/server';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.bookings');
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/bookings
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <BookingsList />
    </div>
  );
}
