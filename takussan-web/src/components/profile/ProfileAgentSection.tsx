import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface ProfileAgentSectionProps {
  user: User;
}

export function ProfileAgentSection({ user }: ProfileAgentSectionProps) {
  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">Profil professionnel</h2>
        <p className="text-sm text-app-ink-muted">Vos informations d&apos;agent immobilier.</p>
      </div>
      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">Bio professionnelle</label>
          <Textarea
            defaultValue={user.bio ?? ''}
            rows={4}
            placeholder="Décrivez votre expertise et vos spécialités"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">Spécialisations</label>
          <Input value="" disabled placeholder="Bientôt disponible" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">Numéro de licence</label>
          <Input placeholder="Ex: AGC-2025-0001" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-app-ink-muted">Agence liée</label>
          <Input value="" disabled placeholder="Non affilié" />
        </div>
      </div>
    </section>
  );
}
