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
    <section className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">{t('typeLabel')}</label>
        <Input value="" disabled placeholder={t('comingSoon')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t('properties')}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">—</p>
        </div>
        <div className="rounded-2xl bg-card/60 p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t('activeTenants')}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">—</p>
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
