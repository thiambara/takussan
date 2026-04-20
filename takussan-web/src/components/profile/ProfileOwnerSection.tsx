import Link from 'next/link';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';

interface ProfileOwnerSectionProps {
  user: User;
}

export function ProfileOwnerSection(_props: ProfileOwnerSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">Espace bailleur</h2>
        <p className="text-sm text-app-ink-muted">Vue d&apos;ensemble de votre activité propriétaire.</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-app-ink-muted">Type de bailleur</label>
        <Input value="" disabled placeholder="Bientôt disponible" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/60 p-4">
          <p className="text-xs font-semibold text-app-ink-muted">Biens</p>
          <p className="mt-1 text-2xl font-bold text-app-ink">—</p>
        </div>
        <div className="rounded-2xl bg-white/60 p-4">
          <p className="text-xs font-semibold text-app-ink-muted">Locataires actifs</p>
          <p className="mt-1 text-2xl font-bold text-app-ink">—</p>
        </div>
      </div>
      <div>
        <Link
          href="/app/properties"
          className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
        >
          Accéder à mes biens
        </Link>
      </div>
    </section>
  );
}
