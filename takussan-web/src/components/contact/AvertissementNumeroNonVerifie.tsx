import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PhoneOff } from 'lucide-react';

interface Props {
  /** `phone_verified_at` du compte connecté (`GET /api/auth/me`). */
  readonly phoneVerifiedAt: string | null | undefined;
  /** Le nombre d'annonces en ligne que la page affiche : sans annonce en ligne, rien à dire. */
  readonly annoncesEnLigne: number;
}

/**
 * TCK-633 (lot C, tour 2 — décision de la session sur D10) — une annonce en ligne dont le contact
 * n'a plus de numéro vérifié RESTE en ligne, mais ce numéro n'est servi au public ni par
 * « Appeler » ni par WhatsApp (`PropertyContactNumbers`, côté API). L'annonceur l'apprend ici,
 * avec le chemin vers la vérification, plutôt que par l'absence d'appels.
 */
export function AvertissementNumeroNonVerifie({ phoneVerifiedAt, annoncesEnLigne }: Props) {
  const t = useTranslations('property.contacts');
  if (phoneVerifiedAt || annoncesEnLigne <= 0) return null;

  return (
    <div
      role="status"
      data-testid="avertissement-numero-non-verifie"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
    >
      <PhoneOff className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-pretty">{t('unverifiedWarning')}</p>
      <Link href="/app/profile#coordonnees" className="font-semibold text-primary underline">
        {t('unverifiedLink')}
      </Link>
    </div>
  );
}
