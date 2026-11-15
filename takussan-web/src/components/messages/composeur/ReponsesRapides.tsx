'use client';

import { useTranslations } from 'next-intl';

/**
 * TCK-2632 — les réponses rapides de l'agent (maquette `app-messagerie`, `ReponsesRapides`) : une
 * liste FIXE de libellés du front, jamais émise par l'API (principe 5) ; leur réglage par l'agence
 * est hors périmètre. La puce porte un libellé court ; elle INSÈRE une phrase entière dans le champ,
 * que l'agent relit, complète et envoie lui-même — rien ne part au toucher.
 */
export const REPONSES_RAPIDES = ['disponible', 'visite', 'pieces', 'prixFerme'] as const;
export type ReponseRapide = (typeof REPONSES_RAPIDES)[number];

interface ReponsesRapidesProps {
  readonly onChoisir: (phrase: string) => void;
}

export function ReponsesRapides({ onChoisir }: ReponsesRapidesProps) {
  const t = useTranslations('messaging.composer.reponsesRapides');
  return (
    <div
      role="group"
      aria-label={t('aria')}
      data-slot="reponses-rapides"
      className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {REPONSES_RAPIDES.map((cle) => (
        <button
          key={cle}
          type="button"
          onClick={() => onChoisir(t(`${cle}.phrase`))}
          className="inline-flex h-8 flex-none items-center whitespace-nowrap rounded-full border border-border bg-background px-3 text-ui font-medium text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t(`${cle}.libelle`)}
        </button>
      ))}
    </div>
  );
}

/** La phrase s'ajoute à ce qui est déjà écrit, séparée d'une espace ; un champ vide la prend telle quelle. */
export function insererLaReponse(saisie: string, phrase: string): string {
  const avant = saisie.replace(/\s+$/, '');
  return avant ? `${avant} ${phrase}` : phrase;
}
