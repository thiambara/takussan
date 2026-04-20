'use client';

import { useAuth } from '@/context/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function ProfileSecuritySection() {
  const { user } = useAuth();
  const verified = Boolean(user?.email_verified_at);

  return (
    <section className="space-y-4 rounded-2xl bg-[#fcf2eb] p-6">
      <div>
        <h2 className="text-lg font-bold text-[#1f1b17]">Sécurité</h2>
        <p className="text-sm text-[#43474e]">Gérez l&apos;accès à votre compte.</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#43474e]">Vérification de l&apos;email</p>
        <p className="text-sm text-[#1f1b17]">
          {verified ? 'Votre email est vérifié.' : "Votre email n'est pas encore vérifié."}
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-[#43474e]">Changer le mot de passe</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Input type="password" placeholder="Mot de passe actuel" disabled />
          <Input type="password" placeholder="Nouveau mot de passe" disabled />
        </div>
        <Button variant="outline" className="rounded-md" disabled>
          Bientôt disponible
        </Button>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#43474e]">Sessions actives</p>
        <p className="text-sm text-[#43474e]">Bientôt disponible</p>
      </div>
    </section>
  );
}
