import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';

interface ProfileOwnerSectionProps {
  user: User;
}

export async function ProfileOwnerSection(_props: ProfileOwnerSectionProps) {
  const t = await getTranslations('profile.owner');
  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">{t('title')}</h2>
        <p className="text-sm text-app-ink-muted">{t('subtitle')}</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-app-ink-muted">{t('typeLabel')}</label>
        <Input value="" disabled placeholder={t('comingSoon')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/60 p-4">
          <p className="text-xs font-semibold text-app-ink-muted">{t('properties')}</p>
          <p className="mt-1 text-2xl font-bold text-app-ink">—</p>
        </div>
        <div className="rounded-2xl bg-white/60 p-4">
          <p className="text-xs font-semibold text-app-ink-muted">{t('activeTenants')}</p>
          <p className="mt-1 text-2xl font-bold text-app-ink">—</p>
        </div>
      </div>
      <div>
        <Link
          href="/app/properties"
          className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
        >
          {t('goToProperties')}
        </Link>
      </div>
    </section>
  );
}
