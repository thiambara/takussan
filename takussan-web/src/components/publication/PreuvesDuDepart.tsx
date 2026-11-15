'use client';

import { Search } from 'lucide-react';
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
 * - **Rien sans chiffre** : sous le seuil (`null`), en échec ou en attente, la carte n'est pas rendue — ni zéro, ni
 *   squelette, ni message d'erreur (AC3).
 * - **Un seul chiffre** : le second de la maquette (« 0 F de commission ») n'est pas écrit, la commission dépend du
 *   plan de l'espace qui publie (ADR-0093, `FeuilleSansCompte`) ; la carte perd sa seconde colonne.
 * - Le nombre est groupé par `useFormatteurs().nombre()` (U+00A0, décision n° 11), jamais par le `#` d'un pluriel
 *   ICU, qui grouperait en U+202F (TCK-2714).
 */
export function PreuvesDuDepart({ ville = null, className }: PreuvesDuDepartProps) {
  const t = useTranslations('publishRedirect.preuves');
  const { nombre } = useFormatteurs();
  const { data } = useDemandeDePublication(ville);
  const demande = data?.data;
  if (!demande || typeof demande.searches_7d !== 'number') return null;

  return (
    <div className={cn('rounded-xl border border-accent/20 bg-accent/[0.08]', className)} data-preuves-du-depart="">
      <div className="flex items-center gap-3 p-3">
        <Search className="size-5 flex-none text-accent" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-ui leading-tight text-encre-douce">
          <span className="block font-display text-[1.1875rem] font-semibold tabular-nums text-foreground">
            {nombre(demande.searches_7d)}
          </span>
          {t('recherches', { ville: demande.city })}
        </p>
      </div>
    </div>
  );
}
