'use client';

import { Search, Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useDemandeDePublication } from '@/lib/queries/demande-de-publication';

interface PreuvesDuDepartProps {
  /** La ville du bien, quand le départ la connaît ; sinon l'API nomme la plus recherchée. */
  readonly ville?: string | null;
  readonly className?: string;
}

/**
 * TCK-2603 — la carte sauge du départ de `/publish` (maquette `app-entree-publier`, « Preuves ») : combien de
 * recherches visent la ville cette semaine, chiffre vrai lu dans le journal anonyme (ADR-0088, cinquième sortie).
 *
 * TCK-2934 — la carte n'est JAMAIS absente : elle porte toujours la preuve « 0 F de commission », et le chiffre des
 * recherches s'y ajoute à gauche quand l'API en rend un (au-dessus du seuil). Sous le seuil (`null`), en échec ou en
 * attente : la preuve de la commission seule — ni zéro, ni squelette, ni message d'erreur.
 *
 * « 0 F de commission » est une promesse, tenue par le code (vérifié le 2026-11-15) :
 * - publier ne débite rien : `PropertyController::store` ne lit que le quota (`QuotaResolver::assertCanCreateActiveListing`),
 *   et les seuls débits de crédits du dépôt sont ceux du Booster (`PropertyBoostController`, `BoostPurchaseService`),
 *   un geste facultatif d'après la publication ;
 * - l'espace où `/publish` publie est un espace particulier (`preparerLEspace` de `PublierSansCompte` ne rend `pret`
 *   que là), né sans abonnement (`HostIndividualOnboardingService`), et un espace sans abonnement a une commission
 *   de plateforme de 0 % (`QuotaResolver::effectivePlatformFeePctForAgency`, figée au paiement par
 *   `PaymentPlatformFeeObserver`).
 * Si un abonnement payant devenait automatique pour les particuliers, ces deux libellés (ici et l'assurance
 * « Gratuit, sans commission » de `FeuilleSansCompte`) seraient à retirer.
 *
 * Le nombre est groupé par `useFormatteurs().nombre()` (U+00A0, décision n° 11), jamais par le `#` d'un pluriel
 * ICU, qui grouperait en U+202F (TCK-2714).
 */
export function PreuvesDuDepart({ ville = null, className }: PreuvesDuDepartProps) {
  const t = useTranslations('publishRedirect.preuves');
  const { nombre } = useFormatteurs();
  const { data } = useDemandeDePublication(ville);
  const demande = data?.data;
  const total = typeof demande?.searches_7d === 'number' ? demande.searches_7d : null;

  const commission = (
    <div className="flex items-center gap-3 p-3" data-preuve="commission">
      <Tag className="size-5 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
      <p className="text-ui leading-tight text-encre-douce">
        <span className="block font-display text-[1.1875rem] font-semibold tabular-nums text-foreground">{t('commissionChiffre')}</span>
        {t('commission')}
      </p>
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-xl border border-accent/20 bg-accent/[0.08]',
        total !== null && 'grid grid-cols-[1.25fr_1fr] divide-x divide-accent/20',
        className,
      )}
      data-preuves-du-depart=""
    >
      {demande && total !== null ? (
        <div className="flex items-center gap-3 p-3" data-preuve="recherches">
          <Search className="size-5 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-ui leading-tight text-encre-douce">
            <span className="block font-display text-[1.1875rem] font-semibold tabular-nums text-foreground">
              {nombre(total)}
            </span>
            {t('recherches', { ville: demande.city })}
          </p>
        </div>
      ) : null}
      {commission}
    </div>
  );
}
