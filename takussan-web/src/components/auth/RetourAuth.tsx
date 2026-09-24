'use client';

import { ArrowLeft } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useSyncExternalStore, type MouseEvent } from 'react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { cn } from '@/lib/utils';

import { destinationPublique } from './lien-connexion';
import { pagePubliqueMemorisee } from './page-publique-memorisee';

/**
 * Les écrans où l'on arrive DEPUIS le site, et d'où l'on doit pouvoir y retourner.
 *
 * Les autres pages de `(auth)` n'en veulent pas : la vérification d'e-mail suit une inscription
 * (session ouverte — revenir en arrière ramènerait sur le formulaire qu'on vient d'envoyer), la
 * réinitialisation s'ouvre depuis un courriel, le retour OAuth est un transit de quelques
 * centaines de millisecondes. Chacune porte déjà son issue propre.
 */
export const PAGES_AVEC_RETOUR: readonly string[] = [
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
];

interface EntreeDHistorique {
  readonly url: string | null;
  readonly index: number;
}

interface NavigationApi {
  readonly currentEntry?: EntreeDHistorique | null;
  entries?: () => readonly EntreeDHistorique[];
}

/**
 * L'entrée d'historique JUSTE AVANT celle-ci est-elle une page du site PUBLIC ?
 *
 * ⚠ « Une page du site » ne suffit pas, et c'était le défaut (revue du 2026-09-23) : après une
 * déconnexion, `/app/messages` est REMPLACÉE par `/auth/login` et l'entrée précédente est `/app`.
 * `canGoBack` y répond vrai, et `router.back()` rouvrait la console de l'utilisateur déconnecté,
 * servie par le cache du routeur (« Bonjour Astou » affiché, `/api/auth/me` à 401). Le retour ne
 * suit donc l'historique que vers le site public.
 *
 * Sans Navigation API, aucune entrée ne se lit — et `document.referrer` ne décrit que le
 * CHARGEMENT du document, pas les navigations côté client qui l'ont suivi : il dirait « la
 * recherche » là où l'entrée précédente est la console. Réponse : non, et le lien fait le reste.
 */
export function entreePrecedenteEstPublique(): boolean {
  const navigation = (window as Window & { navigation?: NavigationApi }).navigation;
  const courante = navigation?.currentEntry;
  if (typeof navigation?.entries !== 'function' || courante == null || courante.index <= 0) return false;
  const precedente = navigation.entries()[courante.index - 1];
  if (precedente?.url == null) return false;
  try {
    const url = new URL(precedente.url);
    if (url.origin !== window.location.origin) return false;
    return destinationPublique(`${url.pathname}${url.search}`) !== null;
  } catch {
    return false;
  }
}

/** La mémoire ne change pas pendant qu'on est sur l'écran de connexion : rien à écouter. */
function sansAbonnement(): () => void {
  return () => {};
}

interface RetourAuthProps {
  /** Libellé traduit par le layout serveur. */
  readonly libelle: string;
  readonly className?: string;
}

function Retour({ libelle, className }: RetourAuthProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const redirect = destinationPublique(params.get('redirect'));

  // La mémoire vit dans `sessionStorage`, que le serveur ne voit pas : `null` au rendu serveur
  // et à l'hydratation, la valeur lue juste après — sans quoi les deux `href` divergeraient.
  const memorisee = useSyncExternalStore(sansAbonnement, pagePubliqueMemorisee, () => null);

  if (!PAGES_AVEC_RETOUR.includes(pathname)) return null;

  // Le lien, quand l'historique ne mène pas au site public : la page que la connexion devait
  // rouvrir si elle est publique, la dernière page publique vue dans l'onglet sinon, l'accueil en
  // dernier — jamais la console, jamais hors du site.
  const repli = redirect ?? memorisee ?? '/';

  function auClic(evenement: MouseEvent<HTMLAnchorElement>) {
    if (evenement.metaKey || evenement.ctrlKey || evenement.shiftKey || evenement.altKey || evenement.button !== 0) return;
    // L'historique quand il mène au site public : la page quittée revient telle quelle, filtres
    // ET défilement compris — ce qu'aucun lien ne rend.
    if (!entreePrecedenteEstPublique()) return;
    evenement.preventDefault();
    router.back();
  }

  // Les classes de `BoutonRetour` (fiches d'agent et d'agence) : même geste, même apparence. Le
  // composant n'est pas repris tel quel parce que sa règle — « une page du site précède » — est
  // précisément celle qui rouvrait la console après une déconnexion.
  return (
    <LienLocalise
      href={repli}
      onClick={auClic}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full py-1.5 pl-2 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
        // Le plancher de 44 px APRÈS `className`, comme dans `BoutonRetour` (TCK-560, W3) : le
        // layout passe une longue liste de classes, et aucune ne doit pouvoir le raboter.
        'min-h-11',
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {libelle}
    </LienLocalise>
  );
}

/**
 * Le retour des écrans de connexion — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * « Pas de possibilité de retour sur ma page de recherche » : sur mobile, la seule issue de
 * `/auth/login` était le logo, qui mène à l'ACCUEIL — la recherche en cours perdue.
 */
export function RetourAuth(props: RetourAuthProps) {
  return (
    <Suspense fallback={null}>
      <Retour {...props} />
    </Suspense>
  );
}
