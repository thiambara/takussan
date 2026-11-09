import type { ReactNode } from 'react';
import { Link as IconeLien } from 'lucide-react';

/**
 * Le rendu d'un texte juridique — un sous-ensemble de markdown, et rien de plus (TCK-531).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN RENDU MAISON, ET POURQUOI SI PETIT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le dépôt n'a aucune dépendance markdown, et un texte juridique n'a besoin que de titres, de
 * paragraphes, de listes et d'un peu de gras. Ce composant construit des éléments React — jamais
 * `dangerouslySetInnerHTML` — donc une balise collée dans le texte s'affiche comme du texte.
 *
 * Grammaire reconnue, et elle seule (`src/content/legal/README.md` la donne au porteur) :
 *
 *   `# `, `## `, `### `     → titres (h2, h3, h4 : le h1 de la page est le nom du document)
 *   ligne vide              → sépare les blocs
 *   `- ` / `* `             → liste à puces
 *   `1. `                   → liste numérotée
 *   `**gras**`              → gras, dans tout bloc
 *
 * Des lignes consécutives d'un même paragraphe sont jointes par un espace, comme en markdown.
 */

type Bloc =
  | { readonly type: 'titre'; readonly niveau: 1 | 2 | 3; readonly texte: string }
  | { readonly type: 'paragraphe'; readonly texte: string }
  | { readonly type: 'liste'; readonly ordonnee: boolean; readonly items: string[] };

const TITRE = /^(#{1,3})\s+(.*)$/;
const PUCE = /^[-*]\s+(.*)$/;
const NUMERO = /^\d+[.)]\s+(.*)$/;

export function analyserTexteJuridique(source: string): Bloc[] {
  const blocs: Bloc[] = [];
  let paragraphe: string[] = [];
  let liste: { ordonnee: boolean; items: string[] } | null = null;

  const fermer = () => {
    if (paragraphe.length > 0) blocs.push({ type: 'paragraphe', texte: paragraphe.join(' ') });
    if (liste) blocs.push({ type: 'liste', ...liste });
    paragraphe = [];
    liste = null;
  };

  for (const brute of source.replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.trim();
    if (ligne === '') {
      fermer();
      continue;
    }
    const titre = TITRE.exec(ligne);
    if (titre) {
      fermer();
      blocs.push({ type: 'titre', niveau: titre[1]!.length as 1 | 2 | 3, texte: titre[2]! });
      continue;
    }
    const puce = PUCE.exec(ligne);
    const numero = puce ? null : NUMERO.exec(ligne);
    if (puce || numero) {
      const ordonnee = numero !== null;
      if (paragraphe.length > 0 || (liste && liste.ordonnee !== ordonnee)) fermer();
      liste ??= { ordonnee, items: [] };
      liste.items.push((puce ?? numero)![1]!);
      continue;
    }
    if (liste) {
      // Une ligne sans marqueur qui suit un élément de liste le prolonge.
      const items = liste.items;
      items[items.length - 1] = `${items[items.length - 1]} ${ligne}`;
      continue;
    }
    paragraphe.push(ligne);
  }
  fermer();
  return blocs;
}

/**
 * TCK-2516 — une entrée du sommaire : un titre de PREMIER niveau (`# `) du texte, et son ancre.
 */
export interface EntreeDeSommaire {
  readonly ancre: string;
  readonly titre: string;
}

/** Le texte d'un titre tel qu'il s'affiche : sans les marqueurs `**` du gras. */
const texteNu = (texte: string) => texte.replace(/\*\*([^*]+)\*\*/g, '$1');

/**
 * Les ancres de chaque titre, dans l'ordre du texte — la SEULE fonction qui les calcule : le
 * sommaire et le rendu la partagent, ils ne peuvent donc pas se contredire.
 *
 * L'ancre est la POSITION de la partie (`partie-6`), et ses sous-parties `partie-6-1`… — jamais un
 * texte « slugifié » : une coquille corrigée dans un titre, ou la page lue dans une autre langue,
 * ne doivent pas casser un lien envoyé sur WhatsApp. Les CGU françaises et anglaises ont le même
 * plan, donc les mêmes ancres. Un sous-titre placé avant toute partie est rangé sous `partie-0`.
 */
function ancresDesTitres(blocs: readonly Bloc[]): Map<number, string> {
  const ancres = new Map<number, string>();
  let partie = 0;
  let sousPartie = 0;
  blocs.forEach((bloc, i) => {
    if (bloc.type !== 'titre' || bloc.niveau === 3) return;
    if (bloc.niveau === 1) {
      partie += 1;
      sousPartie = 0;
      ancres.set(i, `partie-${partie}`);
    } else {
      sousPartie += 1;
      ancres.set(i, `partie-${partie}-${sousPartie}`);
    }
  });
  return ancres;
}

/**
 * TCK-2516 · AC1 — le sommaire d'un texte juridique : ses titres de premier niveau, dans l'ordre.
 * Ajouter un `# ` au texte l'ajoute au sommaire, sans autre écriture.
 */
export function sommaireJuridique(source: string): EntreeDeSommaire[] {
  const blocs = analyserTexteJuridique(source);
  const ancres = ancresDesTitres(blocs);
  return blocs.flatMap((bloc, i) =>
    bloc.type === 'titre' && bloc.niveau === 1 ? [{ ancre: ancres.get(i)!, titre: texteNu(bloc.texte) }] : [],
  );
}

/** `**gras**` → `<strong>` ; tout le reste reste du texte. */
function enLigne(texte: string): ReactNode[] {
  return texte.split(/(\*\*[^*]+\*\*)/g).map((morceau, i) =>
    /^\*\*[^*]+\*\*$/.test(morceau) ? (
      <strong key={i} className="font-semibold text-foreground">
        {morceau.slice(2, -2)}
      </strong>
    ) : (
      morceau
    ),
  );
}

/**
 * TCK-2516 — `scroll-mt-*` : la `Navbar` est FIXE (69 px au téléphone, ~77 px au bureau) et, au
 * téléphone, la barre de lecture colle sous elle. Sans marge, `#partie-17` ouvrirait la page le
 * titre caché derrière elles.
 */
const MARGE_TITRE = { 1: 'mt-10', 2: 'mt-8', 3: 'mt-6' } as const;

const CLASSES_TITRE = {
  1: 'min-w-0 scroll-mt-32 font-display text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground text-balance lg:scroll-mt-28 lg:text-2xl',
  2: 'min-w-0 scroll-mt-32 font-display text-lg font-semibold tracking-[-0.01em] text-foreground text-balance lg:scroll-mt-28 lg:text-xl',
  3: 'font-display text-lg font-semibold text-foreground',
} as const;

export interface TexteJuridiqueProps {
  readonly source: string;
  /**
   * TCK-2516 — le nom accessible du lien d'ancre posé à côté de chaque titre de partie. Sans lui,
   * le lien n'est pas rendu (ce composant ne lit aucun dictionnaire : c'est la page qui traduit).
   *
   * Court et FIXE (« Lien vers cette partie ») : le lien est le FRÈRE qui suit le titre, jamais son
   * enfant (revue). Dedans, il entrait dans le nom accessible du titre — la liste des titres d'un
   * lecteur d'écran lisait « 17. Suspension et fin du compte Lien vers la partie « 17. Suspension
   * et fin du compte » » ; à côté, le titre se nomme de son seul texte, et le lien suit le titre
   * qu'il désigne, ce qui suffit à le situer.
   */
  readonly libelleAncre?: string;
}

export function TexteJuridique({ source, libelleAncre }: TexteJuridiqueProps) {
  const blocs = analyserTexteJuridique(source);
  const ancres = ancresDesTitres(blocs);
  return (
    <div className="space-y-4 text-base leading-[1.7] text-foreground/90 text-pretty">
      {blocs.map((bloc, i) => {
        if (bloc.type === 'titre') {
          const Balise = (['h2', 'h3', 'h4'] as const)[bloc.niveau - 1]!;
          const ancre = ancres.get(i);
          const titre = (
            <Balise
              key={i}
              id={ancre}
              className={
                ancre && libelleAncre ? CLASSES_TITRE[bloc.niveau] : `${MARGE_TITRE[bloc.niveau]} ${CLASSES_TITRE[bloc.niveau]}`
              }
            >
              {enLigne(bloc.texte)}
            </Balise>
          );
          if (!ancre || !libelleAncre) return titre;
          return (
            <div key={i} className={`group flex items-start gap-1.5 ${MARGE_TITRE[bloc.niveau]}`}>
              {titre}
              <a
                href={`#${ancre}`}
                aria-label={libelleAncre}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring group-hover:opacity-100"
              >
                <IconeLien className="size-4" aria-hidden="true" />
              </a>
            </div>
          );
        }
        if (bloc.type === 'liste') {
          const Liste = bloc.ordonnee ? 'ol' : 'ul';
          return (
            <Liste
              key={i}
              className={`space-y-2 ps-6 ${bloc.ordonnee ? 'list-decimal' : 'list-disc'} marker:text-muted-foreground`}
            >
              {bloc.items.map((item, j) => (
                <li key={j}>{enLigne(item)}</li>
              ))}
            </Liste>
          );
        }
        return <p key={i}>{enLigne(bloc.texte)}</p>;
      })}
    </div>
  );
}
