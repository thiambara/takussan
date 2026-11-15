'use client';

import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from 'react';

import { useMessages } from 'next-intl';

import { IntlProvider } from '@/i18n/IntlProvider';
import type { FormeDEnTete } from '@/lib/navigation/en-tete-de-la-coque';

/**
 * TCK-2617 — ce qu'une page (ou un ÉTAT de page) déclare à l'en-tête du téléphone de `/app`. Tout est
 * facultatif : sans déclaration, la coque prend la forme et le titre dérivés de la route
 * (`lib/navigation/en-tete-de-la-coque.ts`), calculés au rendu serveur.
 */
export interface DeclarationDEnTete {
  /** Le titre court (texte : il est aussi le H1 d'une racine, et le nom d'un détail). */
  readonly titre?: string;
  /** La forme, quand la page la sait mieux que sa route (un tunnel sous une racine). */
  readonly forme?: FormeDEnTete;
  /** 0 ou 1 action de page d'une racine : un bouton icône de 40 px (`ActionDEnTete`). */
  readonly action?: ReactNode;
  /** Les actions secondaires d'un détail, rendues dans la feuille du bas de « ⋯ ». */
  readonly actions?: ReactNode;
  /** Plein écran : « Étape n sur total ». */
  readonly etape?: { readonly n: number; readonly total: number };
  /** Plein écran : une ligne sous le titre à la place de l'étape (« Visite de 10:00 · terminée à 10:35 », TCK-2581). */
  readonly sousTitre?: string;
  /** Plein écran : ce qui se pose à droite du titre (« Passer », TCK-2581) ; détail : une action directe (l'export, TCK-2659). */
  readonly droite?: ReactNode;
  /** Le repli du retour (ou du « ✕ ») quand la page en sait un plus juste que sa liste parente. */
  readonly repli?: string;
  /**
   * Une conversation ouverte : au téléphone, ni en-tête de coque ni barre d'onglets — l'en-tête du fil
   * porte la flèche. Un ÉTAT, pas une route : `/app/messages?conversation=…` garde son chemin.
   */
  readonly conversation?: boolean;
  /**
   * TCK-2635 — un formulaire à enregistrer (une section du profil) : au téléphone, la barre d'onglets
   * s'efface devant sa barre « Enregistrer » (maquette `app-profil`, `EcranApp sansOnglets`) ; l'en-tête
   * de détail reste, flèche comprise. ≠ `plein-ecran`, qui remplace la flèche par « ✕ ».
   */
  readonly formulaire?: boolean;
  /**
   * TCK-2836 — une sélection en cours (actions groupées) : au téléphone, la barre d'onglets s'efface
   * devant la barre d'actions de l'écran, posée dans l'emplacement de la coque. Déclarée par
   * `BarreDeSelectionDeLaCoque` tant qu'elle est montée : démontée (sélection vidée, page quittée), la
   * barre d'onglets revient.
   */
  readonly selection?: boolean;
}

/**
 * La priorité d'une déclaration : `page` (une page qui se déclare) l'emporte sur `en-tete-de-page`
 * (le titre que `PageHeader` déclare de lui-même), qui l'emporte sur la route.
 */
type Priorite = 'page' | 'en-tete-de-page';

interface Enregistrement {
  readonly priorite: Priorite;
  readonly declaration: DeclarationDEnTete;
}

type Declarer = (id: string, enregistrement: Enregistrement | null) => void;

/** Deux contextes : qui DÉCLARE ne se re-rend pas quand la déclaration change (pas de boucle). */
const ContexteDeclarer = createContext<Declarer | null>(null);
const ContexteDeclaration = createContext<DeclarationDEnTete>({});

/** La déclaration résultante : les champs `page` sur ceux d'`en-tete-de-page` ; la dernière montée l'emporte. */
function fusionner(enregistrements: ReadonlyMap<string, Enregistrement>): DeclarationDEnTete {
  const ordre = [...enregistrements.values()].sort((a, b) => (a.priorite === b.priorite ? 0 : a.priorite === 'page' ? 1 : -1));
  const sortie: Record<string, unknown> = {};
  for (const { declaration } of ordre) {
    for (const [cle, valeur] of Object.entries(declaration)) if (valeur !== undefined) sortie[cle] = valeur;
  }
  return sortie as DeclarationDEnTete;
}

export function FournisseurDEnTete({ children }: { readonly children: ReactNode }) {
  const [enregistrements, setEnregistrements] = useState<ReadonlyMap<string, Enregistrement>>(() => new Map());
  // Stable : `useState` d'une fonction, jamais recréée — les déclarants ne se re-rendent pas.
  const [declarer] = useState<Declarer>(() => (id: string, enregistrement: Enregistrement | null) => {
    setEnregistrements((avant) => {
      if (enregistrement === null && !avant.has(id)) return avant;
      const apres = new Map(avant);
      if (enregistrement === null) apres.delete(id);
      else apres.set(id, enregistrement);
      return apres;
    });
  });
  return (
    <ContexteDeclarer.Provider value={declarer}>
      <ContexteDeclaration.Provider value={fusionner(enregistrements)}>{children}</ContexteDeclaration.Provider>
    </ContexteDeclarer.Provider>
  );
}

/** La déclaration courante (vide hors fournisseur). */
export function useDeclarationDEnTete(): DeclarationDEnTete {
  return useContext(ContexteDeclaration);
}

/**
 * Déclare à l'en-tête du téléphone. Ne rend rien ; hors de la coque de `/app` (aucun fournisseur :
 * `/super-admin`, le site public, un test isolé), ne fait rien.
 *
 * `useLayoutEffect` : sur une navigation douce, le titre déclaré est posé AVANT la peinture.
 */
export function DeclarerEnTete({ priorite = 'page', ...declaration }: DeclarationDEnTete & { readonly priorite?: Priorite }) {
  const declarer = useContext(ContexteDeclarer);
  return declarer ? <Declarant declarer={declarer} priorite={priorite} declaration={declaration} /> : null;
}

/**
 * Ce que la page déclare (`action`, `actions`, `droite`) est MONTÉ par la coque, hors de l'arbre de la
 * page — donc, sans parade, sous le seul dictionnaire de la coque (`src/i18n/namespaces.json`). La fiche
 * du bien tombait au toucher de « ⋯ » (`MISSING_MESSAGE: visitPlanning.plan`, `PlanifierUneVisite` dans
 * ses `actions`), comme la fiche client avant elle (TCK-2589, lot E). Le dictionnaire de la PAGE, lu ici
 * dans son arbre, accompagne donc ses nœuds : `IntlProvider` le fusionne à celui de la coque, ce qui
 * redonne exactement celui de la page. Un nœud absent reste absent (pas de « ⋯ » vide).
 *
 * Seul le dictionnaire voyage : un autre contexte propre à la page (un fournisseur monté sous la coque)
 * n'accompagne pas les nœuds. Garde : `__tests__/en-tete-dictionnaire-de-la-page.test.tsx`.
 */
function Declarant({ declarer, priorite, declaration }: { readonly declarer: Declarer; readonly priorite: Priorite; readonly declaration: DeclarationDEnTete }) {
  const id = useId();
  const messages = useMessages();
  const { titre, forme, action, actions, etape, repli, conversation, formulaire, selection, sousTitre, droite } = declaration;
  // L'étape par ses deux nombres : un objet neuf à chaque rendu redéclarerait sans fin.
  const etapeN = etape?.n;
  const etapeTotal = etape?.total;
  useLayoutEffect(() => {
    const etapeDeclaree = etapeN !== undefined && etapeTotal !== undefined ? { n: etapeN, total: etapeTotal } : undefined;
    const sousLaPage = (noeud: ReactNode) => (noeud ? <IntlProvider messages={messages}>{noeud}</IntlProvider> : noeud);
    declarer(id, {
      priorite,
      declaration: { titre, forme, action: sousLaPage(action), actions: sousLaPage(actions), etape: etapeDeclaree, repli, conversation, formulaire, selection, sousTitre, droite: sousLaPage(droite) },
    });
  }, [declarer, id, priorite, messages, titre, forme, action, actions, etapeN, etapeTotal, repli, conversation, formulaire, selection, sousTitre, droite]);
  useLayoutEffect(() => () => declarer(id, null), [declarer, id]);
  return null;
}
