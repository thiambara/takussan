import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/components/ui/button';

interface NoAgencyStateProps {
  title?: string;
}

export function NoAgencyState({ title }: NoAgencyStateProps) {
  const t = useTranslations('errors.noAgency');

  return (
    <div className="space-y-6">
      {title && (
        <div>
          <h1 className="text-2xl font-bold text-app-ink">{title}</h1>
        </div>
      )}
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-app-surface-1 p-12 text-center">
        <Building2 className="size-10 text-app-accent" />
        <p className="text-sm font-semibold text-app-ink">{t('title')}</p>
        <p className="text-xs text-app-ink-muted">{t('body')}</p>
        <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
