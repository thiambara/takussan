/**
 * LES TONS DES TROIS DOUBLONS ABSORBÉS, SUR LEURS PROPRES SURFACES — TCK-472 (AC3).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SECOND FICHIER DE CONTRASTE, ET NON UN ÉLARGISSEMENT DU PREMIER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `StatusBadge.contraste-tck-450.test.tsx` mesure **un seul ton** (`success`) sur les sept surfaces
 * de la console. Son périmètre est écrit dans son en-tête et il le tient. Celui-ci mesure **tous
 * les tons employés par les trois doublons que TCK-472 absorbe**, sur les surfaces de CES
 * fichiers-là — dont deux que TCK-450 n'avait aucune raison de connaître :
 *
 *  · `customer-dashboard/CustomerList.tsx:112` — `hover:bg-muted` PLEIN sur la carte mobile ;
 *  · `property-dashboard/PropertyList.tsx:224` — `bg-card` de la carte mobile.
 *
 * *Un aplat semi-transparent de la couleur de son propre texte a un contraste qui DÉPEND du fond.*
 * Absorber un composant sans remesurer ses surfaces, c'est déplacer sa couleur en espérant que le
 * fond de l'autre écran lui aille.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LA RE-MESURE A RENDU, ET QUI CONTREDIT LE TICKET
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * TCK-472 s'ouvrait sur une hypothèse : `PropertyList` posait `bg-success/15` pour `sold`, aplat
 * que TCK-450 avait écarté à **4,29:1**. Le ticket demandait explicitement de ne pas la recopier.
 * Bien lui en a pris — **elle est fausse pour ce fichier**. Mesuré le 2026-08-30 :
 *
 *     `bg-success/15 text-success`, thème clair
 *       --card (DataTable) ......................................... 4,99:1  ✓
 *       bg-muted/30 sur --card (PropertyList:209, ligne survolée) ... 4,77:1  ✓
 *       bg-primary/5 sur --card (PropertyList:210, sélectionnée) .... 4,69:1  ✓
 *       bg-card (PropertyList:224, carte mobile) ................... 4,99:1  ✓
 *       bg-muted PLEIN ............................................. 4,29:1  ✗
 *
 * `bg-muted` PLEIN est la surface qui fait tomber `/15` — et **`PropertyList` ne la pose nulle
 * part** : ses lignes sont `hover:bg-muted/30` et `bg-primary/5`. Le doublon n'échouait donc PAS
 * sur ses propres surfaces. *Le défaut établi était la DUPLICATION ; le contraste était une
 * hypothèse, et l'hypothèse ne tenait pas.*
 *
 * Le fichier qui pose vraiment `bg-muted` plein est `CustomerList.tsx:112` — l'autre doublon, celui
 * que le ticket ne soupçonnait pas — et c'est là que le défaut de contraste était réel :
 * `qualified` y portait `bg-primary/5 text-primary`, soit **4,24:1 en clair** et **3,73:1 en
 * sombre**. Deux échecs AA, dans les deux thèmes, trouvés en mesurant l'autre fichier.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE TROU DÉCLARÉ : `danger` N'EST PAS MESURÉ ICI, ET IL EST SOUS AA
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/test/contraste-wcag.ts` ne porte PAS `--destructive` — délibérément, son en-tête le dit :
 * `globals.css` le déclare en `oklch(…)`, seul jeton non hexadécimal, et l'inventer serait pire
 * que l'omettre. Ce fichier respecte ce choix : les tons mesurés ci-dessous sont ceux que le
 * harnais sait résoudre.
 *
 * ⚠ **Le ton `danger` a donc été mesuré HORS de ce test, et il échoue.** `--destructive` a été
 * relevé au moteur de rendu le 2026-08-30 (canvas 1×1, Chrome headless, témoins `#ffffff` et
 * `#fcf9f3` rendus à l'identique — sans quoi le relevé mesurerait la gestion de couleur) :
 * **#e7000b** en clair, **#ff6467** en sombre. D'où `bg-destructive/10 text-destructive` :
 *
 *     thème clair  3,41 à 3,99:1 sur les sept surfaces — ✗ sur les sept
 *     thème sombre 3,96 à 5,30:1 — ✗ sur trois
 *
 * #e7000b sur blanc plafonne à 3,99:1 : **aucun alpha d'aplat ne rattrape une encre trop claire.**
 * La correction est au niveau du jeton et touche `Badge`, `Button`, `toast` et les bandeaux — son
 * propre ticket, hors du périmètre de TCK-472. Écrit ici, en toutes lettres, parce qu'un ton
 * absent d'un fichier de contraste se lit comme un ton qui passe.
 *
 * ⚠ Ces chiffres sont un RELEVÉ. Le test ci-dessous recalcule tout depuis le badge RENDU ; si le
 * commentaire et le test divergent un jour, c'est le commentaire qui est périmé.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusTone } from '@/components/console';
import { PROPERTY_STATUS_TONE } from '@/components/property-dashboard/PropertyStatusBadge';
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
 * Les tons que les trois doublons emploient APRÈS absorption, moins `danger` (cf. le trou déclaré
 * en tête). La liste est écrite et non dérivée : elle affirme quels tons les écrans absorbés
 * portent, et un ton qui apparaîtrait sans passer par ici est le défaut qu'on garde.
 */
const TONS_MESURABLES: readonly StatusTone[] = ['neutral', 'success', 'attention', 'info'];

interface Surface {
  readonly nom: string;
  /** Le fichier qui la pose — sans lui, la « surface réelle » est une supposition. */
  readonly site: string;
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

/**
 * Les surfaces des TROIS fichiers absorbés, et d'eux seuls.
 *
 * `bg-muted` PLEIN y figure au titre de `CustomerList` — pas de `PropertyList`, qui ne le pose
 * nulle part. La distinction n'est pas un détail de rédaction : c'est elle qui fait que
 * l'hypothèse du ticket tombe pour l'un et tient pour l'autre.
 */
const SURFACES: readonly Surface[] = [
  {
    nom: '--card',
    site: 'console/DataTable.tsx:140 — la table du bureau, PropertyList ET CustomerList',
    hex: (j) => resoudreCouleur('card', j),
  },
  {
    nom: '--background',
    site: 'app/(dashboard)/app/properties/[id]/page.tsx — la fiche du bien, page nue',
    hex: (j) => resoudreCouleur('background', j),
  },
  {
    nom: 'bg-muted/30 sur --card',
    site: 'property-dashboard/PropertyList.tsx:209 — ligne survolée',
    hex: surface('muted', 0.3, 'card'),
  },
  {
    nom: 'bg-primary/5 sur --card',
    site: 'property-dashboard/PropertyList.tsx:210 — ligne sélectionnée',
    hex: surface('primary', 0.05, 'card'),
  },
  {
    nom: 'bg-muted/50 sur --card',
    site: 'ui/table.tsx:74 — `hover:bg-muted/50`, toute ligne de DataTable',
    hex: surface('muted', 0.5, 'card'),
  },
  {
    nom: 'bg-muted PLEIN',
    site: 'customer-dashboard/CustomerList.tsx:112 — `hover:bg-muted` sur la carte mobile',
    hex: (j) => resoudreCouleur('muted', j),
  },
  {
    nom: 'bg-card (carte mobile)',
    site: 'property-dashboard/PropertyList.tsx:224 — `rounded-xl bg-card p-3`',
    hex: (j) => resoudreCouleur('card', j),
  },
];

const THEMES = [
  { nom: 'clair', jetons: JETONS_CLAIR },
  { nom: 'sombre', jetons: JETONS_SOMBRE },
] as const;

/** Les utilitaires de couleur INCONDITIONNELS du badge rendu — cf. le fichier sœur TCK-450. */
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

/**
 * ⚠ `aplat` et `encre` sont LUS UNE FOIS PAR TON, jamais par surface. `render()` s'accumule dans
 * le même `it` : relire le badge à chaque surface ferait trouver sept nœuds pour un `data-testid`,
 * et le test rougirait sur son propre harnais au lieu de mesurer quoi que ce soit.
 */
function ratioRendu(
  couleurs: { encre: string; aplat: string },
  surfaceHex: string,
  jetons: Readonly<Record<string, string>>,
): number {
  const { aplat, encre } = couleurs;
  const u = litUtilitaireDeCouleur(aplat, 'bg')!;
  const e = litUtilitaireDeCouleur(encre, 'text')!;
  const fond = versRvb(surfaceHex);
  const plaque: Rvb = composer(versRvb(resoudreCouleur(u.jeton, jetons)), fond, u.alpha);
  const texte: Rvb =
    e.alpha === 1
      ? versRvb(resoudreCouleur(e.jeton, jetons))
      : composer(versRvb(resoudreCouleur(e.jeton, jetons)), plaque, e.alpha);
  return contraste(texte, plaque);
}

describe('<StatusBadge> — les tons des doublons absorbés, sur leurs surfaces (TCK-472)', () => {
  it.each(THEMES)(
    'AC3 — les quatre tons mesurables tiennent 4,5:1 sur les 7 surfaces absorbées — thème $nom',
    ({ jetons }) => {
      const echecs: string[] = [];
      for (const tone of TONS_MESURABLES) {
        const couleurs = couleursRendues(tone);
        for (const s of SURFACES) {
          const ratio = ratioRendu(couleurs, s.hex(jetons), jetons);
          if (ratio < SEUIL_AA_TEXTE) {
            echecs.push(`${tone} sur ${s.nom} → ${fmt(ratio)} < ${fmt(SEUIL_AA_TEXTE)} — ${s.site}`);
          }
        }
      }
      expect(echecs, echecs.join('\n')).toEqual([]);
    },
  );

  /**
   * L'ancien aplat de `PropertyList`, mesuré comme le ticket le demande : *sur ses propres
   * surfaces*, pas sur celles de la console. Le résultat CONTREDIT le ticket, et c'est le point —
   * une garde qui n'écrirait que le verdict attendu ne mesurerait rien.
   *
   * ⚠ Ce test ne défend pas `/15` : il défend le RAISONNEMENT. La raison d'absorber `PropertyList`
   * est la duplication, pas le contraste, et la suite le dira si quelqu'un rouvre le sujet.
   */
  it('AC3 — `bg-success/15` passait AA sur les surfaces de PropertyList, et échouait sur `bg-muted` plein', () => {
    // Quatre : les trois posées par le fichier lui-même (lignes 209, 210, 224) plus le `--card`
    // du `DataTable` qui les porte. `bg-muted` PLEIN n'en fait PAS partie — c'est tout le point.
    const surfacesDePropertyList = SURFACES.filter((s) => s.site.includes('PropertyList'));
    expect(surfacesDePropertyList.length, 'les surfaces de PropertyList sont nommées').toBe(4);

    const mesurer = (hexFond: string) => {
      const fond = versRvb(hexFond);
      const plaque: Rvb = composer(versRvb(resoudreCouleur('success', JETONS_CLAIR)), fond, 0.15);
      return contraste(versRvb(resoudreCouleur('success', JETONS_CLAIR)), plaque);
    };

    for (const s of surfacesDePropertyList) {
      expect(mesurer(s.hex(JETONS_CLAIR)), `${s.nom} — ${s.site}`).toBeGreaterThanOrEqual(
        SEUIL_AA_TEXTE,
      );
    }
    // Et la surface que PropertyList ne pose PAS, celle qui a fait descendre la console à `/10`.
    expect(mesurer(resoudreCouleur('muted', JETONS_CLAIR))).toBeLessThan(SEUIL_AA_TEXTE);
  });

  /**
   * AC2 — la table `statut du bien → ton` est l'unique décision, et elle ne rend que des tons du
   * DS. L'assertion porte sur la table ENTIÈRE : un statut de plus, un statut de moins, un ton
   * déplacé, et elle rougit. C'est la leçon de l'AC1 du fichier sœur.
   */
  it('AC2 — `PROPERTY_STATUS_TONE` est la table attendue, entière', () => {
    expect(PROPERTY_STATUS_TONE).toEqual({
      draft: 'neutral',
      archived: 'neutral',
      available: 'success',
      published: 'success',
      sold: 'info',
      rented: 'info',
      pending: 'attention',
      pending_review: 'attention',
      under_maintenance: 'attention',
      unavailable: 'attention',
      rejected: 'danger',
    });
  });
});
