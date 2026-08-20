import { getTranslations } from 'next-intl/server';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface ProfileAgentSectionProps {
  user: User;
}

export async function ProfileAgentSection({ user }: ProfileAgentSectionProps) {
  const t = await getTranslations('profile.agent');
  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">{t('title')}</h2>
        <p className="text-sm text-app-ink-muted">{t('subtitle')}</p>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">{t('bioLabel')}</label>
          <Textarea
            defaultValue={user.bio ?? ''}
            rows={4}
            placeholder={t('bioPlaceholder')}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">{t('specialtiesLabel')}</label>
          <Input value="" disabled placeholder={t('comingSoon')} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">{t('licenseLabel')}</label>
          <Input placeholder={t('licensePlaceholder')} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">{t('agencyLabel')}</label>
          <Input value="" disabled placeholder={t('noAgency')} />
        </div>
      </div>
    </section>
  );
}
