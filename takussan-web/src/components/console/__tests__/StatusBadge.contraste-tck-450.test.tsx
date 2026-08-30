/**
 * LA TABLE DES TONS DE `StatusBadge`, ENTIÈRE, ET LE CONTRASTE DU TON `success` — TCK-450.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL NE LIT PAS LA SOURCE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le ton `success` rendait `bg-accent/15 text-accent` — l'accent de MARQUE, celui des badges
 * *featured*. Deux défauts en un : un `success` qui porte la teinte de « mis en avant », et un
 * contraste sous AA dans les deux thèmes. TCK-450 tranche les deux d'une ligne.
 *
 * Une garde de ce changement peut se tromper de deux façons, et les deux ont un précédent dans ce
 * dépôt :
 *
 *  1. **Contrôler la ligne modifiée.** `expect(classes).toContain('bg-success/10')` est vert même
 *     si, dans le même geste, `danger` est devenu `bg-success/10` lui aussi. C'est ce que l'AC1
 *     refuse en toutes lettres : **l'assertion porte sur la table ENTIÈRE.** Les cinq tons sont
 *     donc rendus et confrontés à un ensemble EXACT — un ton en trop, un ton en moins, un jeton
 *     déplacé : rouge.
 *  2. **Écrire le ratio attendu à la main.** Un test qui compare `4.60` à une constante
 *     recopiée mesure le presse-papier. Ici l'encre et l'aplat sont **lus sur le badge rendu**
 *     (`litUtilitaireDeCouleur`), puis composés et mesurés. Rétablir `bg-accent/15 text-accent`
 *     fait donc rougir AC1 *et* AC2 sans qu'aucune valeur n'ait à changer ici — c'est l'AC6, et
 *     c'est une propriété de la construction, pas une promesse.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES SEPT SURFACES, ET POURQUOI IL EN FAUT SEPT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC2 demande la mesure « sur la surface RÉELLE de chaque famille d'appelant, pas seulement sur
 * `--card` ». Un aplat semi-transparent de la couleur de son propre texte a un contraste qui
 * DÉPEND du fond : plus le fond fonce, plus l'aplat fonce, plus le texte s'y noie. Mesurer sur la
 * surface la plus claire, c'est mesurer le meilleur cas.
 *
 * Les sept surfaces ci-dessous ne sont pas une liste de prudence : chacune est écrite dans un
 * fichier qui monte un `StatusBadge`. La plus sévère — `bg-muted` PLEIN — n'est PAS dans le
 * relevé de TCK-450, et c'est elle qui a fait descendre l'aplat de `/15` à `/10` :
 * `admin/super/kyc-queue.tsx:210` et `admin/super/moderation.tsx:241` écrivent tous deux
 * `cn(selectedId === … && 'bg-muted')` sur la ligne, et `kyc-queue` rend un `StatusBadge` dans
 * cette ligne-là. Une ligne sélectionnée est un état ordinaire de ces deux écrans.
 *
 * ⚠ Trou déclaré : `ui/table.tsx` déclare aussi `data-[state=selected]:bg-muted` et
 * `has-aria-expanded:bg-muted/50`. **Aucun appelant ne pose `data-state="selected"` ni
 * `aria-expanded` sur une ligne** au 2026-08-29 (`grep -rn --include='*.tsx' 'data-state=' src`
 * → aucune ligne) : ces deux variantes ne sont pas mesurées ici parce qu'elles ne s'affichent
 * nulle part. Elles produiraient exactement les mêmes fonds que les deux dernières lignes du
 * tableau, qui elles sont posées à la main.
 *
 * ⚠ `variant="outline"` de `Badge` apporte `[a]:hover:bg-muted` — un fond PLEIN qui remplacerait
 * l'aplat. Il ne s'applique que si le badge est rendu en `<a>`, ce que `StatusBadge` ne fait
 * jamais (il ne passe pas `render`). Écrit ici plutôt que laissé croire mesuré.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES RATIOS, MESURÉS LE 2026-08-29 (AC2 : « le chiffre est écrit dans le fichier avec sa date »)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 *                                                        AVANT              APRÈS
 *   surface                                         accent/15 (✗)     success/10 (✓)
 *   ──────────────────────────────────────────────  ─────────────     ──────────────
 *   clair  --card ...................................... 4,52:1            5,37:1
 *   clair  --background ................................ 4,31:1            5,12:1
 *   clair  bg-muted/30 sur --background (KYC) .......... 4,18:1            4,96:1
 *   clair  bg-muted/30 sur --card (PropertyList) ....... 4,32:1            5,13:1
 *   clair  bg-muted/50 sur --card (ligne survolée) ..... 4,19:1            4,97:1
 *   clair  bg-muted sur --card (ligne sélectionnée) .... 3,88:1            4,60:1  ← le pire
 *   clair  bg-primary/5 sur --card (PropertyList) ...... 4,33:1            5,04:1
 *   sombre --card ...................................... 3,66:1            6,26:1
 *   sombre --background ................................ 4,05:1            6,97:1
 *   sombre bg-muted/30 sur --background (KYC) .......... 3,74:1            6,40:1
 *   sombre bg-muted/30 sur --card (PropertyList) ....... 3,47:1            5,92:1
 *   sombre bg-muted/50 sur --card (ligne survolée) ..... 3,34:1            5,70:1
 *   sombre bg-muted sur --card (ligne sélectionnée) .... 3,05:1            5,17:1
 *   sombre bg-primary/5 sur --card (PropertyList) ...... 3,58:1            5,85:1
 *
 * Le ton actuel échouait donc sur **13 des 14 couples** ; le jeton d'état passe sur les 14, avec
 * 4,60:1 pour pire cas. Le seuil est 4,5:1 (WCAG 2.2 §1.4.3) et non 3:1 : `Badge` porte
 * `text-xs`, c'est du texte normal.
 *
 * ⚠ Ces chiffres sont un RELEVÉ, pas une entrée du test. Le test les recalcule à chaque
 * exécution depuis le badge rendu ; s'ils divergent un jour, c'est le commentaire qui est périmé.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusTone } from '@/components/console';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
  type Rvb,
} from '@/test/contraste-wcag';

/**
 * LA TABLE ATTENDUE, ENTIÈRE — l'objet de l'AC1.
 *
 * Elle est recopiée du composant à dessein : c'est un test de NON-DÉRIVE, et une table dérivée du
 * code qu'elle garde ne garde rien. Un ton qui change ici sans raison écrite est le défaut.
 */
const TONS_ATTENDUS: Readonly<Record<StatusTone, readonly string[]>> = {
  neutral: ['bg-muted', 'text-muted-foreground'],
  success: ['bg-success/10', 'text-success'],
  attention: ['bg-warning/12', 'text-warning'],
  danger: ['bg-destructive/10', 'text-destructive'],
  info: ['bg-secondary', 'text-secondary-foreground'],
};

const TONS = Object.keys(TONS_ATTENDUS) as StatusTone[];

/** Une surface sur laquelle un appelant réel pose la pastille. */
interface Surface {
  readonly nom: string;
  /** Le fichier qui la pose — sans lui, la « surface réelle » est une supposition. */
  readonly site: string;
  /** Rend la surface OPAQUE, dans la table de jetons donnée. */
  readonly hex: (jetons: Readonly<Record<string, string>>) => string;
}

const surface = (jeton: string, alpha: number, sous: string) =>
  (jetons: Readonly<Record<string, string>>) =>
    versHex(
      composer(
        versRvb(resoudreCouleur(jeton, jetons)),
        versRvb(resoudreCouleur(sous, jetons)),
        alpha,
      ),
    );

const SURFACES: readonly Surface[] = [
  {
    nom: '--card',
    site: 'console/DataTable.tsx:140 — le conteneur de toutes les tables de la console',
    hex: (j) => resoudreCouleur('card', j),
  },
  {
    nom: '--background',
    site: 'la page nue — super-admins/page.tsx, user-detail.tsx, system-health.tsx',
    hex: (j) => resoudreCouleur('background', j),
  },
  {
    nom: 'bg-muted/30 sur --background',
    site: 'kyc/KycUploader.tsx:176 — la pastille « document fourni » (TCK-385)',
    hex: surface('muted', 0.3, 'background'),
  },
  {
    nom: 'bg-muted/30 sur --card',
    site: 'property-dashboard/PropertyList.tsx:206 — ligne survolée',
    hex: surface('muted', 0.3, 'card'),
  },
  {
    nom: 'bg-muted/50 sur --card',
    site: 'ui/table.tsx:74 — `hover:bg-muted/50`, toute ligne de DataTable',
    hex: surface('muted', 0.5, 'card'),
  },
  {
    nom: 'bg-muted sur --card (ligne sélectionnée)',
    site: 'admin/super/kyc-queue.tsx:210 et admin/super/moderation.tsx:241 — `bg-muted` PLEIN',
    hex: (j) => resoudreCouleur('muted', j),
  },
  {
    nom: 'bg-primary/5 sur --card',
    site: 'property-dashboard/PropertyList.tsx:207 — ligne sélectionnée',
    hex: surface('primary', 0.05, 'card'),
  },
];

const THEMES = [
  { nom: 'clair', jetons: JETONS_CLAIR },
  { nom: 'sombre', jetons: JETONS_SOMBRE },
] as const;

/**
 * Les utilitaires de couleur INCONDITIONNELS du badge rendu.
 *
 * « Inconditionnels » écarte `[a]:hover:bg-muted` et `focus-visible:ring-ring/50`, qui ne sont pas
 * la couleur du ton. `litUtilitaireDeCouleur` écarte de son côté `text-xs`, qui partage le
 * préfixe d'une encre sans en être une.
 */
function couleursRendues(tone: StatusTone): { encre: string; aplat: string } {
  render(<StatusBadge tone={tone} label="X" data-testid={`badge-${tone}`} />);
  const classes = Array.from(screen.getByTestId(`badge-${tone}`).classList);

  const retenir = (prefixe: 'bg' | 'text') =>
    classes
      .map((c) => ({ c, u: litUtilitaireDeCouleur(c, prefixe) }))
      .filter(({ u }) => u !== null && u.variante === '')
      .map(({ c }) => c);

  const aplats = retenir('bg');
  const encres = retenir('text');
  expect(aplats, `${tone} : un seul aplat inconditionnel`).toHaveLength(1);
  expect(encres, `${tone} : une seule encre inconditionnelle`).toHaveLength(1);
  return { aplat: aplats[0]!, encre: encres[0]! };
}

describe('<StatusBadge> — la table des tons et son contraste (TCK-450)', () => {
  /**
   * AC1. L'assertion porte sur les CINQ tons à la fois : une substitution qui déplacerait un
   * second ton — `danger` devenu `bg-success/10`, par exemple — passerait un contrôle ligne à
   * ligne et rougit ici.
   */
  it('AC1 — la table ENTIÈRE des tons est celle attendue, et aucune n’emprunte `accent`', () => {
    const rendu = Object.fromEntries(
      TONS.map((tone) => {
        const { aplat, encre } = couleursRendues(tone);
        return [tone, [aplat, encre]];
      }),
    );

    expect(rendu).toEqual(
      Object.fromEntries(TONS.map((t) => [t, [...TONS_ATTENDUS[t]]])),
    );

    // Le point du ticket, énoncé séparément pour que l'échec le nomme : plus aucun ton n'emprunte
    // l'accent de marque. `--accent` reste la teinte des badges *featured*, et rien d'autre.
    for (const [tone, classes] of Object.entries(rendu)) {
      for (const classe of classes as string[]) {
        expect(classe, `le ton ${tone} emprunte l’accent de MARQUE`).not.toMatch(/(^|-)accent(\/|$)/);
      }
    }
  });

  /**
   * AC2. Le seuil est celui du TEXTE NORMAL — `Badge` porte `text-xs`, donc 4,5:1 et non les 3:1
   * d'un objet graphique.
   */
  it.each(THEMES)(
    'AC2 — le ton `success` tient 4,5:1 sur les 7 surfaces réelles — thème $nom',
    ({ jetons }) => {
      const { aplat, encre } = couleursRendues('success');
      const u = litUtilitaireDeCouleur(aplat, 'bg')!;
      const e = litUtilitaireDeCouleur(encre, 'text')!;

      const echecs: string[] = [];
      for (const s of SURFACES) {
        const fond = versRvb(s.hex(jetons));
        const plaque: Rvb = composer(versRvb(resoudreCouleur(u.jeton, jetons)), fond, u.alpha);
        const texte: Rvb =
          e.alpha === 1 ? versRvb(resoudreCouleur(e.jeton, jetons))
            : composer(versRvb(resoudreCouleur(e.jeton, jetons)), plaque, e.alpha);
        const ratio = contraste(texte, plaque);
        if (ratio < SEUIL_AA_TEXTE) {
          echecs.push(
            `${encre} sur ${aplat} posé sur ${s.nom} (${versHex(plaque)}) → ${fmt(ratio)} `
            + `< ${fmt(SEUIL_AA_TEXTE)} — ${s.site}`,
          );
        }
      }

      expect(echecs, echecs.join('\n')).toEqual([]);
    },
  );
});
