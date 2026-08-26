import { Construction } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface StubPlaceholderProps {
  label: string;
  description?: string;
}

export function StubPlaceholder({ label, description }: StubPlaceholderProps) {
  const t = useTranslations('errors.stub');

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-card p-12 text-center">
      <Construction className="size-10 text-primary" />
      <p className="text-sm font-semibold text-foreground">{t('title')}</p>
      <p className="text-xs text-muted-foreground">{description ?? label}</p>
    </div>
  );
}
