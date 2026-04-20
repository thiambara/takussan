import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';

interface ProfileCustomerSectionProps {
  user: User;
}

export function ProfileCustomerSection(_props: ProfileCustomerSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl bg-[#fcf2eb] p-6">
      <div>
        <h2 className="text-lg font-bold text-[#1f1b17]">Préférences de recherche</h2>
        <p className="text-sm text-[#43474e]">Bientôt disponible</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#43474e]">Type de bien préféré</label>
          <Input value="" disabled placeholder="Bientôt disponible" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#43474e]">Budget max (FCFA)</label>
          <Input value="" disabled placeholder="Bientôt disponible" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-semibold text-[#43474e]">Villes favorites</label>
          <Input value="" disabled placeholder="Bientôt disponible" />
        </div>
        <div className="flex items-center justify-between rounded-md bg-white/60 px-3 py-2 md:col-span-2">
          <div>
            <p className="text-sm font-semibold text-[#1f1b17]">Alertes email</p>
            <p className="text-xs text-[#43474e]">Bientôt disponible</p>
          </div>
          <div
            aria-disabled="true"
            className="h-5 w-9 rounded-full bg-[#eae1da] opacity-60"
          />
        </div>
      </div>
    </section>
  );
}
