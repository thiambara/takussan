import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  type Rvb,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '../contraste-wcag';

/**
 * TCK-658 (piste P07.02) — une encre de texte ne s'atténue pas par l'opacité.
 *
 * `text-warning/80` sur `bg-warning/10` rendait 3,53:1 ; `text-muted-foreground/70`, de 2,95 à
 * 3,03:1 ; les jours hors du mois du calendrier, 2,11:1. Le jeton plein tient déjà 4,5:1 : c'est
 * l'opacité, ajoutée pour « atténuer », qui faisait passer sous le seuil (WCAG 2.2 §1.4.3).
 *
 * 1. **Les sites de P07.02** sont mesurés tels qu'ils sont écrits : l'encre (alpha compris) est
 *    composée sur le fond où le composant la pose, dans les deux thèmes. Le site se retrouve par
 *    une ANCRE (le texte qu'il porte), pas par un numéro de ligne.
 * 2. **Le reste du dépôt est un cliquet à deux sens** : chaque fichier de `src/` (hors tests) qui
 *    porte encore une encre de texte translucide y est consigné avec son compte. Un site neuf
 *    échoue ; un site retiré échoue aussi, tant qu'on ne l'a pas sorti de {@link RESTANTS}.
 *
 * Jsdom n'a pas de moteur CSS : le test lit les FICHIERS.
 */

const RACINE = process.cwd();
const SRC = join(RACINE, 'src');

const THEMES = [
  ['clair', JETONS_CLAIR],
  ['sombre', JETONS_SOMBRE],
] as const;

interface Site {
  readonly nom: string;
  readonly fichier: string;
  /** Un texte unique du fichier, placé APRÈS la chaîne de classes du site. */
  readonly ancre: string;
  /** Le jeton de l'encre attendue sur ce site. */
  readonly encre: string;
  /** Les fonds possibles : une surface, et éventuellement un aplat translucide posé dessus. */
  readonly fonds: ReadonlyArray<readonly [surface: string, aplat?: readonly [string, number]]>;
}

const SUR_LES_SURFACES = [['card'], ['background']] as const;
const SUR_LES_SURFACES_ET_POPOVER = [['card'], ['background'], ['popover']] as const;
const SUR_L_APLAT_WARNING = [
  ['card', ['warning', 0.1]],
  ['background', ['warning', 0.1]],
] as const;

const SITES: readonly Site[] = [
  {
    nom: 'bannière de charte d’agence, description',
    fichier: 'src/components/agency/BrandingBanner.tsx',
    ancre: "{t('description')}",
    encre: 'warning',
    fonds: SUR_L_APLAT_WARNING,
  },
  {
    nom: 'bannière de résiliation anticipée, date d’effet',
    fichier: 'src/components/leases/EarlyTerminationBanner.tsx',
    ancre: "t('banner_effective'",
    encre: 'warning',
    fonds: SUR_L_APLAT_WARNING,
  },
  {
    nom: 'préfixe « Propriétaire »',
    fichier: 'src/components/property-dashboard/ProprietaireEtResponsable.tsx',
    ancre: "{t('ownerPrefix')}",
    encre: 'muted-foreground',
    fonds: SUR_LES_SURFACES,
  },
  {
    nom: 'préfixe « Responsable »',
    fichier: 'src/components/property-dashboard/ProprietaireEtResponsable.tsx',
    ancre: "{t('responsiblePrefix')}",
    encre: 'muted-foreground',
    fonds: SUR_LES_SURFACES,
  },
  {
    nom: 'demande de visite, « facultatif » du créneau',
    fichier: 'src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx',
    ancre: "{tVisit('optional')}",
    encre: 'muted-foreground',
    fonds: SUR_LES_SURFACES_ET_POPOVER,
  },
  {
    nom: 'demande de visite, « facultatif » des notes',
    fichier: 'src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx',
    ancre: "{t('notesOptional')}",
    encre: 'muted-foreground',
    fonds: SUR_LES_SURFACES_ET_POPOVER,
  },
  {
    nom: 'grille de disponibilités, horaires des périodes',
    fichier: 'src/components/service-providers/AvailabilityGrid.tsx',
    ancre: '{PERIOD_TIMES[period].from}',
    encre: 'muted-foreground',
    fonds: SUR_LES_SURFACES,
  },
];

/** La dernière chaîne de classes (`className="…"` ou littéral de `cn(…)`) avant l'ancre. */
function classesAvant(source: string, ancre: string, fichier: string): string[] {
  const fin = source.indexOf(ancre);
  expect(fin, `ancre « ${ancre} » introuvable dans ${fichier}`).toBeGreaterThan(-1);
  expect(source.indexOf(ancre, fin + 1), `ancre « ${ancre} » ambiguë dans ${fichier}`).toBe(-1);
  const avant = source.slice(0, fin);
  const chaines = [...avant.matchAll(/className="([^"]+)"/g)];
  expect(chaines.length, `aucune className avant « ${ancre} »`).toBeGreaterThan(0);
  return chaines[chaines.length - 1][1].split(/\s+/);
}

/** Les encres de repos d'une liste de classes (sans variante `hover:`, `[&>button]:`…). */
function encresDeRepos(classes: readonly string[]) {
  return classes
    .map((c) => litUtilitaireDeCouleur(c, 'text'))
    .filter((u): u is NonNullable<typeof u> => u !== null && u.variante === '');
}

function fondDe(
  [surface, aplat]: readonly [string, (readonly [string, number])?],
  jetons: Readonly<Record<string, string>>,
): Rvb {
  const base = versRvb(resoudreCouleur(surface, jetons));
  return aplat ? composer(versRvb(resoudreCouleur(aplat[0], jetons)), base, aplat[1]) : base;
}

function mesurer(
  encre: { jeton: string; alpha: number },
  fond: Rvb,
  jetons: Readonly<Record<string, string>>,
): number {
  const brute = versRvb(resoudreCouleur(encre.jeton, jetons));
  const posee = encre.alpha === 1 ? brute : composer(brute, fond, encre.alpha);
  return contraste(posee, fond);
}

describe('les sites de P07.02 tiennent 4,5:1', () => {
  for (const site of SITES) {
    const source = readFileSync(join(RACINE, site.fichier), 'utf8');
    for (const [theme, jetons] of THEMES) {
      it(`${site.nom}, thème ${theme}`, () => {
        const encres = encresDeRepos(classesAvant(source, site.ancre, site.fichier));
        expect(encres.map((e) => e.jeton), `${site.nom} : encre de repos`).toEqual([site.encre]);
        for (const f of site.fonds) {
          const ratio = mesurer(encres[0], fondDe(f, jetons), jetons);
          expect(ratio, `${site.nom}, ${theme}, sur ${f.flat().join(' ')} : ${fmt(ratio)}`)
            .toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
        }
      });
    }
  }

  // Le calendrier est le seul site écrit dans un `cn(defaults.outside, "…")`, et sa classe vise le
  // bouton du jour (`[&>button]:`), pas la cellule.
  const CALENDRIER = readFileSync(join(RACINE, 'src/components/ui/calendar.tsx'), 'utf8');
  for (const [theme, jetons] of THEMES) {
    it(`calendrier, jours hors du mois, thème ${theme}`, () => {
      const m = /outside:\s*cn\(defaults\.outside,\s*"([^"]+)"\)/.exec(CALENDRIER);
      expect(m, 'classe `outside` du calendrier introuvable').not.toBeNull();
      const encres = m![1]
        .split(/\s+/)
        .map((c) => litUtilitaireDeCouleur(c.replace(/^\[&>button\]:/, ''), 'text'))
        .filter((u): u is NonNullable<typeof u> => u !== null && u.variante === '');
      expect(encres.length, 'aucune encre sur les jours hors du mois').toBeGreaterThan(0);
      for (const encre of encres) {
        for (const f of SUR_LES_SURFACES_ET_POPOVER) {
          const ratio = mesurer(encre, fondDe(f, jetons), jetons);
          expect(ratio, `${theme}, sur ${f[0]} : ${fmt(ratio)}`).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
        }
      }
    });
  }
});

/**
 * Les encres de texte translucides qui restent après P07.02, par fichier.
 *
 * Ce n'est pas une licence : ce sont des sites que P07.02 ne nomme pas, et dont aucun n'a été
 * mesuré ici. Certains ne portent pas de texte (étoiles, icônes), d'autres sont des états
 * désactivés (exemptés par §1.4.3), d'autres sont peut-être des défauts. Les sortir un par un.
 * `text-primary-foreground/NN` n'est pas compté : c'est une encre inverse, posée sur une surface
 * colorée que le fichier ne déclare pas toujours.
 */
const RESTANTS: Readonly<Record<string, number>> = {
  'app/[locale]/(public)/properties/[slug]/components/PropertyReviewForm.tsx': 1,
  'app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx': 1,
  'components/admin/super/GlobalSearch.tsx': 1,
  'components/admin/super/agency-detail.tsx': 1,
  'components/favorites/FavoritesPopover.tsx': 1,
  'components/leases/LeasesList.tsx': 1,
  'components/legal/TexteJuridique.tsx': 1,
  'components/messages/MessagesPage.tsx': 1,
  'components/property-dashboard/PropertyList.tsx': 1,
  'components/property/cards/CardMeta.tsx': 1,
  'components/ui/calendar.tsx': 2, // jours désactivés (`disabled`), exemptés par §1.4.3
  'components/ui/tabs.tsx': 2,
};

const ENCRE_TRANSLUCIDE =
  /(?<![\w-])text-(?:muted-foreground|foreground|warning|destructive|success|primary|accent|info)\/\d+/g;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree !== '__tests__' && entree !== 'test') out.push(...sources(chemin));
    } else if (/\.tsx?$/.test(entree) && !/\.test\.tsx?$/.test(entree)) {
      out.push(chemin);
    }
  }
  return out;
}

describe('aucune encre de texte translucide neuve', () => {
  it('le relevé par fichier est exactement celui de RESTANTS', () => {
    const releve: Record<string, number> = {};
    for (const fichier of sources(SRC)) {
      const n = (readFileSync(fichier, 'utf8').match(ENCRE_TRANSLUCIDE) ?? []).length;
      if (n > 0) releve[relative(SRC, fichier).split(sep).join('/')] = n;
    }
    expect(releve).toEqual(RESTANTS);
  });
});
