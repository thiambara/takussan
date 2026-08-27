'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Ce que rend {@link useEtatUrl}. Trois lectures, trois écritures — et aucune écriture qui
 * touche un filtre sans toucher la page.
 */
export interface EtatUrl {
  /** La valeur d'un paramètre, `''` quand il est absent. */
  readonly lire: (cle: string) => string;
  /** `true` quand le paramètre vaut `'1'`. La forme des booléens dans une URL de ce dépôt. */
  readonly lireBooleen: (cle: string) => boolean;
  /** La page courante, bornée à 1. Un `page=0`, `page=-3` ou `page=abc` rend 1. */
  readonly page: number;
  /**
   * Pose (ou retire, sur `null`) un ou plusieurs filtres.
   *
   * ⚠ **Ramène TOUJOURS à la page 1 et abandonne la sélection.** Ce n'est pas une politesse :
   * c'est la seule raison d'être de cette fonction. Voir le bloc de tête.
   */
  readonly poserFiltres: (maj: Readonly<Record<string, string | null>>) => void;
  /**
   * Change la page. **Les filtres restent ; la sélection, non.**
   *
   * ⚠ Le « et rien d'autre » qui tenait ici jusqu'à la revue de TCK-376 disait l'inverse du
   * code : `allerALaPage` retire `selected` comme `poserFiltres` le fait, et pour la même
   * raison — une sélection est une position dans une liste, et changer de page change la liste.
   * Voir « Pourquoi `selected` tombe avec la page » dans le bloc de tête. *Un commentaire
   * d'interface qui contredit son implémentation rend le retrait de celle-ci plausible comme
   * nettoyage.*
   */
  readonly allerALaPage: (page: number) => void;
  /** Sélectionne une ligne de la file. Ne touche ni aux filtres ni à la page. */
  readonly selectionner: (id: number | null) => void;
}

/*
 * ⚠ Ce hook n'expose DÉLIBÉRÉMENT ni « tout réinitialiser » ni « des filtres sont posés ».
 * Les deux avaient été écrits, testés, et n'étaient appelés par aucun écran : une API que seule
 * sa propre suite exerce est un mutant survivant en attente — on peut l'amputer sans rien casser
 * de visible. La remise à zéro des filtres n'est pas dans le delta de TCK-376 ; le jour où un
 * écran la demande, elle revient avec son appelant.
 */

/** Les deux clés que `poserFiltres` retire systématiquement. */
const CLES_DE_POSITION = ['page', 'selected'] as const;

/**
 * L'état d'un écran de console rangé dans l'URL — ce qui filtre, la page, la ligne ouverte.
 *
 * ## Pourquoi un hook et pas trois `useState`
 *
 * Trois écrans d'`/admin` rangeaient déjà leur état dans la barre d'adresse (`/admin/team`,
 * `/admin/finances`, `/admin/users`) et trois autres non — dont les deux files de modération, qui
 * perdaient leurs filtres au rechargement et ne se partageaient pas par un lien. Le geste est le
 * même partout ; ce qui différait à chaque copie, c'est le détail ci-dessous.
 *
 * ## Le retour à la page 1 est STRUCTUREL, pas disciplinaire
 *
 * Poser un filtre depuis la page 7 sans revenir à la page 1 rend une file vide — et l'écran dit
 * alors « aucun résultat » alors que la réponse est ailleurs. La revue de TCK-363 a relevé
 * exactement ce défaut : le `params.delete('page')` était écrit à la main sur **un écran sur
 * trois**, parce que rien ne l'imposait.
 *
 * Ici, il n'y a **aucun chemin** qui pose un filtre sans retirer `page` : `poserFiltres` est la
 * seule écriture de filtre exposée, et elle retire `page` et `selected` inconditionnellement. Un
 * appelant qui oublierait la règle ne peut pas l'enfreindre — il n'a pas de fonction pour ça.
 *
 * `allerALaPage` est le geste inverse, et il est le seul à écrire `page`.
 *
 * ## Pourquoi `selected` tombe avec la page
 *
 * Une sélection est une position dans une liste. Changer le filtre change la liste : garder
 * l'ancien identifiant, c'est demander au panneau de détail d'afficher une ligne qui n'y est
 * peut-être plus. Les files retombent alors sur leur premier élément, ce qu'elles font déjà.
 * Un lien COLLÉ, lui, garde sa sélection — on ne retire que sur une interaction.
 */
export function useEtatUrl(): EtatUrl {
  const router = useRouter();
  const searchParams = useSearchParams();

  const lire = useCallback((cle: string) => searchParams.get(cle) ?? '', [searchParams]);

  const lireBooleen = useCallback((cle: string) => searchParams.get(cle) === '1', [searchParams]);

  const page = useMemo(() => {
    const brut = Number.parseInt(searchParams.get('page') ?? '1', 10);
    return Number.isFinite(brut) && brut >= 1 ? brut : 1;
  }, [searchParams]);

  const ecrire = useCallback(
    (mute: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mute(params);
      const qs = params.toString();
      // `?` seul et non `''` : une chaîne vide passée à `router.replace` conserve la query
      // string courante au lieu de la vider — c'est la forme retenue par TCK-363.
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  const poserFiltres = useCallback(
    (maj: Readonly<Record<string, string | null>>) => {
      ecrire((params) => {
        for (const [cle, valeur] of Object.entries(maj)) {
          if (valeur) params.set(cle, valeur);
          else params.delete(cle);
        }
        for (const cle of CLES_DE_POSITION) params.delete(cle);
      });
    },
    [ecrire],
  );

  const allerALaPage = useCallback(
    (suivante: number) => {
      ecrire((params) => {
        if (suivante <= 1) params.delete('page');
        else params.set('page', String(suivante));
        // Changer de page change la liste : cf. « Pourquoi `selected` tombe avec la page » dans
        // le bloc de tête. ⚠ Ce `delete` a été un mutant SURVIVANT jusqu'à la revue de TCK-376 —
        // son jumeau de `poserFiltres` était gardé, pas lui. Il l'est désormais
        // (`useEtatUrl.test.tsx`, « allerALaPage abandonne la sélection »).
        params.delete('selected');
      });
    },
    [ecrire],
  );

  const selectionner = useCallback(
    (id: number | null) => {
      ecrire((params) => {
        if (id === null) params.delete('selected');
        else params.set('selected', String(id));
      });
    },
    [ecrire],
  );

  return { lire, lireBooleen, page, poserFiltres, allerALaPage, selectionner };
}
