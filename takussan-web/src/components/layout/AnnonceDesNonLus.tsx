'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CADENCE_NON_LUS_HORS_MESSAGERIE_MS, useNonLusTotal } from '@/lib/queries/conversations-list';

interface AnnonceDesNonLusProps {
  /** Le compte que montre la pastille de « Messagerie » (`useCompteursDuMenu`, donc `useUnreadCount`). */
  readonly compte: number;
  /** La barre sonde ses compteurs (sous `md`). Hors de là, rien à annoncer, et la ligne de base s'oublie. */
  readonly actif: boolean;
}

interface Suivi {
  /** Le dernier compte LU — `null` tant qu'aucune lecture n'a abouti. */
  readonly base: number | null;
  /** Le compte annoncé, `null` : la région est vide. */
  readonly annonce: number | null;
}

/**
 * TCK-2481 (revue, I1 — WCAG 4.1.3) — la région live du compte de non-lus sous `md`, sur `/app`.
 *
 * Le bouton flottant mobile portait la seule région `aria-live` de ce compte visible sous `md` ; il
 * ne se rend plus là où la barre d'onglets porte « Messagerie », et la pastille de l'onglet est
 * muette (`aria-hidden`, le compte est dans le nom accessible — qu'aucun lecteur d'écran n'annonce
 * quand il change). Cette région le remplace, avec SON texte (`messaging.widget.unreadInline`).
 *
 * - Montée DANS la barre (`md:hidden`) : dès `md`, c'est le badge du lanceur de bureau qui annonce,
 *   jamais les deux à la fois.
 * - Elle n'annonce qu'une HAUSSE : vide au montage ; la première lecture est une ligne de base, pas
 *   une nouvelle. `useUnreadCount` rend 0 pendant le chargement et sur une erreur : la ligne de base
 *   attend donc la requête partagée en succès, lue par un observateur PASSIF (`enabled: false`), qui
 *   ne lance aucune requête.
 * - Une baisse vide la région : remonter au même compte change son texte, donc s'annonce encore.
 */
export function AnnonceDesNonLus({ compte, actif }: AnnonceDesNonLusProps) {
  const t = useTranslations('messaging.widget');
  const { isSuccess } = useNonLusTotal({ enabled: false, refetchInterval: CADENCE_NON_LUS_HORS_MESSAGERIE_MS });
  const lu = actif && isSuccess;
  const [suivi, setSuivi] = useState<Suivi>({ base: null, annonce: null });
  // Ajusté pendant le rendu (patron React « valeur précédente »), pas dans un effet.
  if (lu && suivi.base !== compte) {
    setSuivi({ base: compte, annonce: suivi.base !== null && compte > suivi.base ? compte : null });
  } else if (!actif && suivi.base !== null) {
    setSuivi({ base: null, annonce: null });
  }
  return (
    <p aria-live="polite" className="sr-only" data-slot="annonce-non-lus">
      {suivi.annonce === null ? null : t('unreadInline', { count: suivi.annonce })}
    </p>
  );
}
