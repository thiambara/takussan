'use client';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';

/**
 * TCK-598 (V8, contrainte 9) — « Téléphone vérifié », dans l'identité du contact.
 *
 * Il ne dit que ce que l'API dérive de `phone_verified_at` : un booléen. Aucune « identité
 * vérifiée » n'est affichée, parce que le modèle de données n'en porte pas — un badge qui
 * promettrait plus que ce qui a été vérifié serait pire que pas de badge. Faux ou absent : rien.
 */
export function PropertyPhoneVerifiedBadge({ verified }: { readonly verified: boolean | undefined }) {
  const t = useTranslations('property.detail.trust');
  if (verified !== true) return null;

  return (
    <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-accent">
      <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
      {t('phoneVerified')}
    </p>
  );
}
