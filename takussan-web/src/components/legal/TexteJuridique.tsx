import type { ReactNode } from 'react';

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

const CLASSES_TITRE = {
  1: 'mt-10 font-display text-2xl font-semibold tracking-tight text-foreground text-balance',
  2: 'mt-8 font-display text-xl font-semibold tracking-tight text-foreground text-balance',
  3: 'mt-6 font-display text-lg font-semibold text-foreground',
} as const;

export interface TexteJuridiqueProps {
  readonly source: string;
}

export function TexteJuridique({ source }: TexteJuridiqueProps) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-foreground/90 text-pretty">
      {analyserTexteJuridique(source).map((bloc, i) => {
        if (bloc.type === 'titre') {
          const Balise = (['h2', 'h3', 'h4'] as const)[bloc.niveau - 1]!;
          return (
            <Balise key={i} className={CLASSES_TITRE[bloc.niveau]}>
              {enLigne(bloc.texte)}
            </Balise>
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
