/**
 * LES PORTÉES `.dark` DU DÉPÔT, DÉRIVÉES — TCK-459.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE RAISONNEMENT FAUX QUE CE MODULE REMPLACE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-371, statut `done`, écrivait deux fois : *« Aucune classe `.dark` n'est jamais posée (aucun
 * `ThemeProvider`, aucun `prefers-color-scheme`), donc rien de tout cela n'est atteignable
 * aujourd'hui. »* Cette phrase justifiait de laisser un contraste à **1,05:1** — pratiquement du
 * blanc sur blanc — sur `AppTopbar`.
 *
 * **La prémisse était fausse.** La classe est posée, en toutes lettres, sur des composants livrés.
 * L'angle mort est nommable : la vérification cherchait un MÉCANISME (`ThemeProvider`,
 * `next-themes`, `documentElement.classList`) — les trois sont bien absents, ce qui la rendait
 * convaincante — et **pas une classe littérale dans un `className`**, qui est pourtant la façon la
 * plus simple de poser une classe. *Chercher l'outil et pas le geste : on ne trouve alors que les
 * usages sophistiqués.*
 *
 * La CONCLUSION, elle, tient : `AppTopbar` n'est monté que par `AppShell` et `AdminShell`, et
 * aucune portée `.dark` ne les enveloppe. **C'est ce qui rend le défaut dangereux plutôt
 * qu'anodin** — un raisonnement faux qui conclut juste est le plus difficile à corriger, rien ne le
 * contredit donc rien ne le rejoue. Ce module transforme la conclusion en CONDITION VÉRIFIÉE :
 * le jour où quelqu'un met `AppShell` sous une portée `.dark` — exactement ce que `SuperAdminShell`
 * a fait pour sa barre latérale, et par un portail de surcroît — la garde rougit.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA LISTE SE DÉRIVE, ET PAS AVEC UN `grep`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Deux corrections successives de cette erreur ont chacune reconduit le défaut :
 *
 *  · la première a énuméré DEUX composants alors qu'il y en avait trois — le troisième est un
 *    `<SheetContent className="dark …">` rendu dans un PORTAIL, donc hors position d'arbre ;
 *  · la seconde a écrit une commande `grep` qui faisait **3 sur 7** sur un banc d'écritures, et
 *    rendait pourtant le bon compte, les trois posages réels écrivant `dark` en premier.
 *    *Une commande qui rend le bon nombre sur les cas existants n'est pas une dérivation, c'est
 *    une énumération déguisée.*
 *
 * D'où la lecture par AST plutôt que par ligne. Elle ferme en outre le cas que l'en-tête de
 * `contraste-wcag.ts` déclarait **hors de portée de tout `grep`** : `clsx({ dark: actif })` écrit
 * la classe en CLÉ D'OBJET, et `dark:` est par ailleurs le préfixe de la variante Tailwind — aucun
 * motif textuel ne peut les distinguer. Un lecteur d'arbre, si.
 *
 * ⚠ Ce qui reste hors de portée, et qu'il faut savoir : une classe assemblée à l'exécution
 * (`` `${theme} flex` ``), et une portée posée par du DOM impératif (`classList.add('dark')`).
 * Aucun des deux n'existe aujourd'hui dans `src/` ; le second est cherché par le test de ce module.
 */
import { balisesSousLaClasse, clotureDImport, importsDe, nommer, RACINE_SRC, sourcesDe } from './analyse-statique';
import { join } from 'node:path';

/** La classe littérale qui bascule les jetons du bloc `.dark` de `globals.css`. */
export const CLASSE_SOMBRE = 'dark';

export interface PorteeSombre {
  /** Le fichier qui POSE la classe, relatif à `src/`. */
  readonly fichier: string;
  /** Les balises JSX de son sous-arbre — l'élément porteur compris. */
  readonly balises: readonly string[];
}

/** Toutes les portées `.dark` de `src/`, dérivées de l'arbre JSX. Jamais écrites. */
export function porteesSombres(): PorteeSombre[] {
  const out: PorteeSombre[] = [];
  for (const fichier of sourcesDe(RACINE_SRC, /\.tsx$/)) {
    const balises = balisesSousLaClasse(fichier, CLASSE_SOMBRE);
    if (balises.length > 0) out.push({ fichier: nommer(fichier), balises });
  }
  return out;
}

/**
 * Les FICHIERS qu'une portée `.dark` peut faire rendre — le fichier porteur, les composants de son
 * sous-arbre, et tout ce que ceux-ci atteignent.
 *
 * Sur-approximation assumée (clôture d'IMPORT, pas de rendu) : une garde doit couvrir plus que ce
 * qui s'affiche, jamais moins.
 */
export function fichiersSousPorteeSombre(): Set<string> {
  const out = new Set<string>();
  for (const portee of porteesSombres()) {
    const source = join(RACINE_SRC, portee.fichier);
    out.add(portee.fichier);
    const imports = importsDe(source);
    const cibles = portee.balises
      .map((balise) => imports.get(balise.split('.')[0]!))
      .filter((f): f is string => f !== undefined);
    for (const atteint of clotureDImport(cibles)) out.add(nommer(atteint));
  }
  return out;
}

/**
 * L'élément est-il, dans le DOM RENDU, sous une portée `.dark` ?
 *
 * ⚠ Cette fonction est la moitié FAIBLE du contrôle, et il faut savoir pourquoi : une portée qui
 * traverse un portail atterrit au niveau du `body`, hors position d'arbre. Un raisonnement sur
 * l'ancêtre DOM ne l'aurait pas trouvée. C'est {@link fichiersSousPorteeSombre} qui la voit.
 */
export function estSousPorteeSombre(element: Element): boolean {
  for (let courant: Element | null = element; courant; courant = courant.parentElement) {
    if (courant.classList.contains(CLASSE_SOMBRE)) return true;
  }
  return false;
}
