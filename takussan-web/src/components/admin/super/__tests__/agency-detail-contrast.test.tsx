/**
 * LE MOTIF « ENCRE HÉRITÉE, FOND REPEINT » — TCK-471.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST GARDÉ ICI, ET CE QUI NE L'EST PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le bandeau « Actions de modération » posait `bg-foreground text-background` sur sa `<section>`.
 * Ce couple **retourne deux propriétés, il ne retourne pas les jetons** : le bouton
 * `variant="outline"` repeint son fond en `bg-background` (#fcf9f3) sans poser d'encre, hérite le
 * `text-background` (#fcf9f3) du conteneur, et rend **1,00:1** — mesuré sur l'application servie
 * le 2026-08-30, `/super-admin/agencies/5`, avant correction. Le libellé n'existait pas
 * visuellement ; le bouton, lui, occupait sa place et se cliquait.
 *
 * ⚠ **Ce fichier ne teste PAS « la ligne 300 contient `dark` ».** Une assertion de chaîne cocherait
 * aussi la régression : `dark bg-foreground text-background` la satisferait en reconduisant le
 * défaut. Ce qui est éprouvé ici est le MOTIF — *une encre déclarée par un ancêtre, posée sur un
 * fond qu'un descendant repeint* — mesuré sur l'arbre RENDU, avec la table de jetons que la portée
 * impose. Le détecteur est le même code pour le bandeau réel et pour le banc d'ablation ; c'est ce
 * qui interdit qu'il soit vacuité.
 *
 * **La moitié STATIQUE et repo-large de la garde est ailleurs** : `scripts/check-heritage-encre.mjs`
 * relit tout `src/`, résout les variantes de `buttonVariants` et refuse le motif partout. Les deux
 * sont nécessaires : le script voit les 870 fichiers que ce test ne monte pas, ce test voit ce que
 * le rendu compose et que la lecture de texte ne peut pas prédire.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE TROU DÉCLARÉ : `--destructive`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `contraste-wcag.ts` n'a **pas** de valeur pour `--destructive` — `globals.css` le déclare en
 * `oklch(…)`, seul jeton non hexadécimal des deux blocs, et l'en-tête de ce module explique
 * pourquoi l'inventer serait pire que l'omettre. Le bouton *Suspendre* est donc **compté et non
 * mesuré** ici. Il l'a été dans le navigateur, sur l'application servie (2026-08-30) :
 *
 *     Vérifier    #fcf9f3 sur #a85332  5,06:1   →  #1f1812 sur #c87a52  5,31:1
 *     Suspendre   #e7000b sur #331611  3,48:1   →  #ff6467 sur #4c2723  4,48:1
 *     Déverifier  #fcf9f3 sur #fcf9f3  1,00:1   →  #fcf9f3 sur #29221c  14,91:1
 *
 * ⚠ *Suspendre* était **déjà sous le seuil AA avant la correction** (3,48:1) et y reste de peu
 * (4,48:1) : c'est un défaut de la variante `destructive` de `components/ui/button.tsx` — elle rend
 * ~4,0:1 sur une carte claire, partout dans le dépôt — et non de ce bandeau. Il n'est pas corrigé
 * ici : le corriger demanderait de toucher la primitive partagée, ce qui est un autre delta.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';
import { withIntl } from '@/test/intl';
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
} from '@/test/contraste-wcag';
import { CLASSE_SOMBRE, estSousPorteeSombre } from '@/test/portees-sombres';
import type { AdminAgencyDetail } from '@/types/super-admin';

import { AgencyModerationActionsMenu } from '../agency-detail';

const AGENCE = {
  id: 5,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  status: 'active',
  is_verified: true,
  verified_at: '2026-05-01T10:00:00+00:00',
  primary_admin_id: 4,
  license_number: 'LIC-221',
  email: 'contact@dakar.test',
  phone: '+221770000000',
  logo_url: null,
  properties_count: 18,
  members_count: 7,
  created_at: '2026-01-15T10:00:00+00:00',
  last_activity_at: '2026-05-08T12:00:00+00:00',
  website: null,
  description: null,
  commission_rate: null,
  currency: 'XOF',
  founded_at: null,
  public_url: '/agences/dakar-immo',
  primary_admin: null,
  address: null,
} as unknown as AdminAgencyDetail;

function enveloppe(enfant: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(withIntl(<QueryClientProvider client={queryClient}>{enfant}</QueryClientProvider>));
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// LE DÉTECTEUR DE MOTIF
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** Le fond que l'élément se peint LUI-MÊME au repos, `dark:` compris sous une portée sombre. */
function fondPropre(element: Element, sombre: boolean): { jeton: string; alpha: number } | null {
  const variantesActives = sombre ? ['', 'dark'] : [''];
  let retenu: { jeton: string; alpha: number } | null = null;
  for (const classe of element.classList) {
    const u = litUtilitaireDeCouleur(classe, 'bg');
    if (!u || u.jeton === 'transparent') continue;
    if (!variantesActives.includes(u.variante)) continue;
    // La variante `dark:` gagne sur la classe nue : c'est l'ordre de la cascade sous `.dark`.
    if (u.variante === 'dark' || retenu === null) retenu = { jeton: u.jeton, alpha: u.alpha };
  }
  return retenu;
}

/** L'encre que l'élément déclare LUI-MÊME au repos, ou `null` s'il l'hérite. */
function encrePropre(element: Element, sombre: boolean): { jeton: string; alpha: number } | null {
  const variantesActives = sombre ? ['', 'dark'] : [''];
  let retenu: { jeton: string; alpha: number } | null = null;
  for (const classe of element.classList) {
    const u = litUtilitaireDeCouleur(classe, 'text');
    if (!u || u.jeton === 'transparent') continue;
    if (!variantesActives.includes(u.variante)) continue;
    if (u.variante === 'dark' || retenu === null) retenu = { jeton: u.jeton, alpha: u.alpha };
  }
  return retenu;
}

/**
 * Le fond OPAQUE réellement sous l'élément — son fond propre s'il en a un, sinon celui du premier
 * ancêtre qui peint, chaque voile composé sur ce qu'il recouvre. Même composition que le
 * navigateur, et la même que `fondHerite()` de `contraste-wcag.ts` ; refaite ici parce qu'il faut
 * tenir compte des variantes `dark:` sous une portée sombre, ce que l'original ne fait pas.
 */
function fondOpaque(element: Element | null, sombre: boolean, jetons: Record<string, string>): string {
  if (!element) return resoudreCouleur('background', jetons);
  const propre = fondPropre(element, sombre);
  const dessous = fondOpaque(element.parentElement, sombre, jetons);
  if (!propre) return dessous;
  if (propre.alpha === 1) return resoudreCouleur(propre.jeton, jetons);
  return versHex(
    composer(versRvb(resoudreCouleur(propre.jeton, jetons)), versRvb(dessous), propre.alpha),
  );
}

interface CoupleHerite {
  readonly balise: string;
  readonly encre: string;
  readonly fond: string;
  readonly ratio: number;
  readonly provenance: string;
}

/**
 * LE MOTIF : tout élément qui **repeint son fond** sans poser d'encre, apparié à l'encre du
 * premier ancêtre qui en déclare une.
 *
 * ⚠ Un élément sans texte propre est ignoré : une pastille vide ne porte pas de libellé, et
 * l'apparier produirait un faux rouge — le défaut de forme que `couples-de-contraste.ts` documente
 * de son côté (`after:bg-foreground` apparié à une encre qui ne s'affiche jamais dessus).
 *
 * `jetonsInconnus` recueille les jetons que la table ne sait pas résoudre (`destructive`) : ils
 * sont COMPTÉS, jamais mesurés contre une valeur de repli.
 */
function couplesEncreHeritee(
  racine: Element,
  jetonsInconnus: string[] = [],
): CoupleHerite[] {
  const sombre = estSousPorteeSombre(racine);
  const jetons = sombre ? JETONS_SOMBRE : JETONS_CLAIR;
  const trouves: CoupleHerite[] = [];

  for (const element of [racine, ...racine.querySelectorAll('*')]) {
    if ((element.textContent ?? '').trim() === '') continue;
    if (!fondPropre(element, sombre)) continue; // il ne repeint rien : rien à hériter DE TRAVERS
    if (encrePropre(element, sombre)) continue; // il pose son encre : le motif ne le concerne pas

    let ancetre = element.parentElement;
    let encre: { jeton: string; alpha: number } | null = null;
    while (ancetre && !encre) {
      encre = encrePropre(ancetre, sombre);
      if (!encre) ancetre = ancetre.parentElement;
    }
    if (!encre || !ancetre) continue; // aucune encre héritée : le navigateur rendra `--foreground`

    let fond: string;
    let hexEncre: string;
    try {
      fond = fondOpaque(element, sombre, jetons);
      hexEncre = resoudreCouleur(encre.jeton, jetons);
    } catch (erreur) {
      jetonsInconnus.push(`${element.tagName.toLowerCase()} : ${(erreur as Error).message}`);
      continue;
    }
    const posee = encre.alpha === 1
      ? versRvb(hexEncre)
      : composer(versRvb(hexEncre), versRvb(fond), encre.alpha);
    trouves.push({
      balise: element.tagName.toLowerCase(),
      encre: versHex(posee),
      fond,
      ratio: contraste(posee, versRvb(fond)),
      provenance: `text-${encre.jeton} hérité de <${ancetre.tagName.toLowerCase()}>`,
    });
  }
  return trouves;
}

afterEach(() => cleanup());

describe('bandeau « Actions de modération » — encre héritée sur fond repeint (TCK-471)', () => {
  it("AC3 — le détecteur REFUSE le motif : c'est le banc qui l'établit, pas une chaîne de classes", () => {
    // Le motif exact d'avant TCK-471, reconstruit à la main : un conteneur qui pose le couple
    // `bg-foreground text-background`, et dedans un bouton dont le fond vient d'une VARIANTE.
    // Si ce banc ne rougissait pas, tout le reste de ce fichier serait vert par vacuité.
    const { container } = enveloppe(
      <section className="rounded-xl bg-foreground p-4 text-background">
        <span>Actions de modération</span>
        <Button size="sm" variant="outline">Déverifier</Button>
      </section>,
    );
    const fautifs = couplesEncreHeritee(container.firstElementChild!)
      .filter((c) => c.ratio < SEUIL_AA_TEXTE);

    expect(fautifs.length, 'le motif reconstruit passe le détecteur : il ne garde rien').toBeGreaterThan(0);
    // Le chiffre de TCK-471, RECALCULÉ et non recopié : #fcf9f3 sur #fcf9f3.
    expect(fautifs.map((c) => `${c.encre} sur ${c.fond} = ${fmt(c.ratio)}`))
      .toContain('#fcf9f3 sur #fcf9f3 = 1,00:1');
  });

  it("AC3 — et il ne rougit PAS sur une surface claire ordinaire (pas de faux positif)", () => {
    const { container } = enveloppe(
      <section className="rounded-xl bg-card p-4 text-card-foreground">
        <span>Actions</span>
        <Button size="sm" variant="outline">Déverifier</Button>
      </section>,
    );
    expect(couplesEncreHeritee(container.firstElementChild!).filter((c) => c.ratio < SEUIL_AA_TEXTE))
      .toEqual([]);
  });

  it('AC1/AC3 — le bandeau RENDU ne porte aucun couple hérité sous le seuil AA', () => {
    const inconnus: string[] = [];
    const { container } = enveloppe(<AgencyModerationActionsMenu agency={AGENCE} />);
    const section = container.querySelector('section')!;

    const couples = couplesEncreHeritee(section, inconnus);
    const fautifs = couples
      .filter((c) => c.ratio < SEUIL_AA_TEXTE)
      .map((c) => `${c.balise} · ${c.provenance} : ${c.encre} sur ${c.fond} = ${fmt(c.ratio)}`);
    expect(fautifs, 'un descendant repeint son fond et hérite une encre illisible').toEqual([]);

    // Une garde qui n'a plus rien à mesurer rend le même vert qu'une garde satisfaite : le bouton
    // `outline` DOIT être passé au détecteur, sans quoi le vert ci-dessus ne dit rien.
    const deverifier = Array.from(section.querySelectorAll('button'))
      .find((b) => /bg-background/.test(b.className));
    expect(deverifier, "le bouton `outline` n'est plus dans le bandeau : le détecteur mesure du vide")
      .toBeDefined();
    // Et c'est bien CELUI que TCK-471 a trouvé invisible — pas un autre `outline` qui aurait pris
    // sa place. Le libellé s'écrit sans accent sur le premier « e » ; il vient de `fr.json`.
    expect(deverifier!.textContent).toContain('Déverifier');
    expect(couples.some((c) => c.balise === 'button'), 'aucun bouton apparié').toBe(true);

    // `--destructive` est un trou DÉCLARÉ, pas un oubli : il doit rester le seul.
    expect(inconnus.join(' | ')).toMatch(/^$|destructive/);
  });

  it('AC1/AC2 — la portée sombre est bien posée, et les trois boutons sont là', () => {
    const { container } = enveloppe(<AgencyModerationActionsMenu agency={AGENCE} />);
    const section = container.querySelector('section')!;

    // La forme retenue : une SURFACE sombre, pas un couple de propriétés retournées.
    expect(section.classList.contains(CLASSE_SOMBRE)).toBe(true);
    expect(estSousPorteeSombre(section)).toBe(true);
    // …et surtout : le couple qui retournait les propriétés sans retourner les jetons a disparu.
    expect(section.className).not.toMatch(/\bbg-foreground\b/);
    expect(section.className).not.toMatch(/\btext-background\b/);

    const boutons = Array.from(section.querySelectorAll('button'));
    expect(boutons).toHaveLength(3);
    // AC2 : les trois sont mesurés, pas seulement celui qui était en cause. Les deux voisins
    // gardent leur variante — un correctif qui les aurait dégradés se verrait ici et dans le
    // relevé navigateur de l'en-tête.
    expect(boutons.map((b) => (/bg-primary/.test(b.className) && 'default')
      || (/bg-destructive/.test(b.className) && 'destructive')
      || (/bg-background/.test(b.className) && 'outline')
      || 'inconnue')).toEqual(['default', 'destructive', 'outline']);
  });
});
