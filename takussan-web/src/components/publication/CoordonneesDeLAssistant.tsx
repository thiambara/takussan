'use client';

import { useTranslations } from 'next-intl';

import { ListeDesNumerosVerifies, numerosVerifies } from '@/components/contact/CoordonneesPublication';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { useAuth } from '@/context/AuthContext';
import { ROUTES_LEGALES } from '@/lib/legal-routes';

/**
 * TCK-2601 — ce qui reste à l'étape Finition de l'assistant connecté, une fois la saisie partie dans la
 * feuille de compte (`FeuilleDePublication`) : les numéros vérifiés que les visiteurs appelleront
 * (TCK-643, rien à compléter ne veut pas dire rien à montrer) et la phrase des CGU, que « Publier »
 * accepte (`accept_terms`). Rien ne s'y saisit.
 *
 * `numeroAVerifier` : la feuille demandera le numéro principal (non vérifié, ou dit tel par l'API) —
 * il n'est pas présenté comme vérifié.
 */
export function CoordonneesDeLAssistant({
  numeroAVerifier,
  contactEstSoi,
}: {
  readonly numeroAVerifier: boolean;
  readonly contactEstSoi: boolean;
}) {
  const t = useTranslations('property.form.publishContact');
  const { user } = useAuth();
  const numeros = contactEstSoi
    ? numerosVerifies(user).filter((n) => n.kind !== 'primary' || !numeroAVerifier)
    : [];
  const montrerCgu = !user?.terms_accepted_at;

  if (numeros.length === 0 && !montrerCgu) return null;

  return (
    <section aria-label={t('title')} className="space-y-3 rounded-lg border border-border bg-muted/30 p-4" data-testid="coordonnees-publication">
      {numeros.length > 0 ? (
        <>
          <h3 className="font-display text-base font-semibold text-foreground">{t('title')}</h3>
          <p className="text-xs text-muted-foreground">{numeros.length > 1 ? t('subtitleMany') : t('subtitle')}</p>
          <ListeDesNumerosVerifies numeros={numeros} />
        </>
      ) : null}
      {montrerCgu ? (
        <p className="text-xs text-muted-foreground" data-testid="phrase-cgu">
          {t.rich('terms', {
            lien: (morceau) => (
              <LienLocalise href={ROUTES_LEGALES.terms} target="_blank" className="underline underline-offset-2">
                {morceau}
              </LienLocalise>
            ),
          })}
        </p>
      ) : null}
    </section>
  );
}
