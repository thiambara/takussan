'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

import { updateContactPreferencesAction } from '@/app/actions/contact-preferences';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-633 (lot C) — la case « Ce numéro reçoit WhatsApp » d'un numéro du compte, enregistrée au
 * geste. Le bouton WhatsApp d'une annonce ne vise qu'un numéro ainsi déclaré.
 */
export function CaseWhatsApp({
  champ,
  id,
}: {
  readonly champ: 'phone_whatsapp' | 'secondary_phone_whatsapp';
  readonly id: string;
}) {
  const t = useTranslations('profile.contact');
  const { user, setUser } = useAuth();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
        <input
          id={id}
          type="checkbox"
          checked={user?.[champ] === true}
          disabled={enCours || !user}
          data-testid={`${champ}-toggle`}
          onChange={(e) => {
            const valeur = e.target.checked;
            setErreur(null);
            demarrer(async () => {
              const r = await updateContactPreferencesAction({ [champ]: valeur });
              if (r.ok) setUser(r.user);
              else setErreur(r.message);
            });
          }}
          className="size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
        />
        {t('whatsappLabel')}
      </label>
      {erreur ? (
        <p role="alert" className="text-xs text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
