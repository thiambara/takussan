import { Construction } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StubPlaceholderProps {
  label: string;
  description?: string;
}

export function StubPlaceholder({ label, description }: StubPlaceholderProps) {
  const t = useTranslations('errors.stub');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-app-surface-1 p-12 text-center">
      <Construction className="size-10 text-app-accent" />
      <p className="text-sm font-semibold text-app-ink">{t('title')}</p>
      <p className="text-xs text-app-ink-muted">{description ?? label}</p>
    </div>
  );
}
