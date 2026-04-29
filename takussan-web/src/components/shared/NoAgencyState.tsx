import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

interface NoAgencyStateProps {
  title?: string;
}

export function NoAgencyState({ title }: NoAgencyStateProps) {
  return (
    <div className="space-y-6">
      {title && (
        <div>
          <h1 className="text-2xl font-bold text-app-ink">{title}</h1>
        </div>
      )}
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-app-surface-1 p-12 text-center">
        <Building2 className="size-10 text-app-accent" />
        <p className="text-sm font-semibold text-app-ink">
          Aucune agence rattachée à votre compte
        </p>
        <p className="text-xs text-app-ink-muted">
          En tant que super-administrateur sans agence, vous n&apos;avez pas encore accès à cette
          section. Rattachez-vous à une agence depuis le panneau d&apos;administration.
        </p>
        <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
          Aller à l&apos;administration
        </Link>
      </div>
    </div>
  );
}
