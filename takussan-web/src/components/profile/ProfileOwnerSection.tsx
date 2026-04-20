import Link from 'next/link';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';

interface ProfileOwnerSectionProps {
  user: User;
}

export function ProfileOwnerSection(_props: ProfileOwnerSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl bg-[#fcf2eb] p-6">
      <div>
        <h2 className="text-lg font-bold text-[#1f1b17]">Espace bailleur</h2>
        <p className="text-sm text-[#43474e]">Vue d&apos;ensemble de votre activité propriétaire.</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-[#43474e]">Type de bailleur</label>
        <Input value="" disabled placeholder="Bientôt disponible" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/60 p-4">
          <p className="text-xs font-semibold text-[#43474e]">Biens</p>
          <p className="mt-1 text-2xl font-bold text-[#1f1b17]">—</p>
        </div>
        <div className="rounded-2xl bg-white/60 p-4">
          <p className="text-xs font-semibold text-[#43474e]">Locataires actifs</p>
          <p className="mt-1 text-2xl font-bold text-[#1f1b17]">—</p>
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
