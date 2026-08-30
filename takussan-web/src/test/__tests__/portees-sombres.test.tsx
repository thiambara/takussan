/**
 * LA TOLÉRANCE À 1,05:1 EST DÉSORMAIS CONDITIONNELLE ET VÉRIFIÉE — TCK-459.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARDE, ET POURQUOI CE N'EST PAS « LE CONTRASTE D'APPTOPBAR »
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `AppTopbar` porte `bg-foreground` avec du `text-white` dessus. En thème CLAIR c'est 17,5:1 ; sous
 * une portée `.dark`, `--foreground` vaut `#fcf9f3` et le couple tombe à **1,04:1** — du blanc sur
 * du blanc. TCK-371 a décidé de ne pas le corriger, et cette décision REPOSAIT SUR UNE PRÉMISSE
 * FAUSSE (« aucune classe `.dark` n'est jamais posée »). La classe est posée, sur trois composants
 * livrés, dont un par un portail.
 *
 * La conclusion survit — aucune de ces portées n'enveloppe `AppTopbar` — mais elle survivait par
 * accident. Ce fichier la transforme en condition VÉRIFIÉE : *« une décision de ne pas corriger
 * doit reposer sur une raison vraie »*, et une raison vraie qui n'est pas rejouée redevient une
 * croyance au premier changement.
 *
 * ⚠ **Les deux ensembles comparés sont DÉRIVÉS, aucun n'est écrit :**
 *
 *   · les portées `.dark` — lues dans l'arbre JSX de tout `src/` (`portees-sombres.ts`) ;
 *   · les composants TOLÉRÉS — ceux dont tous les couples tiennent en thème clair et dont au
 *     moins un tombe sous son seuil en thème sombre (`couples-de-contraste.ts`). `AppTopbar` en
 *     fait partie, et **quinze autres composants aussi** : la garde vaut donc pour tout couple
 *     toléré, pas pour le seul cas de TCK-371. Un composant neuf entre dans l'un ou l'autre
 *     ensemble sans que personne ne l'y déclare.
 *
 * Un test qui recopierait l'une des deux listes passerait le jour où une quatrième portée
 * apparaît — et il y en a déjà eu une par portail que personne n'avait vue.
 */
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import type { User } from '@/types/user';

import { RACINE_SRC, balisesSousLaClasse, nommer, sourcesDe } from '../analyse-statique';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  contraste,
  fmt,
  fondsPossibles,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '../contraste-wcag';
import { couplesDuFichier } from '../couples-de-contraste';
import { CLASSE_SOMBRE, estSousPorteeSombre, fichiersSousPorteeSombre, porteesSombres } from '../portees-sombres';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null, user: null, logout: vi.fn() }),
}));

const { AppTopbar } = await import('@/components/layout/AppTopbar');

const UTILISATEUR = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agency_admin'],
  avatar_url: null,
} as unknown as User;

function rendreBarreHaute(sousPorteeSombre: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const barre = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppTopbar user={UTILISATEUR} onMenuToggle={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return render(withIntl(sousPorteeSombre ? <div className="dark">{barre}</div> : barre));
}

/**
 * Les couples texte/fond d'un sous-arbre RENDU qui tombent sous le seuil AA, mesurés avec la table
 * de jetons que sa portée impose.
 *
 * C'est le contrôle proprement dit : il ne demande pas « la classe est-elle là ? », il MESURE ce
 * que la portée fait au couple. Sous `.dark`, le `text-white` de la barre est comparé à
 * `--foreground` = `#fcf9f3`, et rend 1,04:1.
 */
function couplesFautifs(racine: Element): string[] {
  const jetons = estSousPorteeSombre(racine) ? JETONS_SOMBRE : JETONS_CLAIR;
  const echecs: string[] = [];
  for (const element of [racine, ...racine.querySelectorAll('*')]) {
    if ((element.textContent ?? '').trim() === '') continue;
    for (const classe of element.classList) {
      const encre = litUtilitaireDeCouleur(classe, 'text');
      if (!encre || encre.variante !== '' || encre.jeton === 'transparent') continue;
      const hex = versRvb(resoudreCouleur(encre.jeton, jetons));
      for (const fond of fondsPossibles(element, jetons)) {
        const dessous = versRvb(fond.hex);
        const posee = encre.alpha === 1
          ? hex
          : (hex.map((c, i) => c * encre.alpha + dessous[i]! * (1 - encre.alpha)) as unknown as typeof hex);
        const ratio = contraste(posee, dessous);
        if (ratio < 4.5) echecs.push(`${classe} sur ${fond.provenance} [${fond.etat}] = ${fmt(ratio)}`);
      }
    }
  }
  return [...new Set(echecs)];
}

afterEach(() => cleanup());

describe('portées `.dark` — la tolérance de TCK-371 est conditionnelle et gardée (TCK-459)', () => {
  it('AC3 — la dérivation voit les SEPT écritures de la classe, et pas ce qui lui ressemble', () => {
    // Le banc qui a fait échouer la commande `grep` de la correction précédente : elle en voyait
    // TROIS sur sept, en rendant pourtant le bon compte sur les cas existants.
    const racine = mkdtempSync(join(tmpdir(), 'portees-'));
    const cas: readonly (readonly [string, string, boolean])[] = [
      ['debut', '<div className="dark flex" />', true],
      ['fin', '<div className="flex dark" />', true],
      ['milieu', '<div className="flex dark bg-x" />', true],
      ['cn', "<div className={cn('dark', x)} />", true],
      ['gabarit', '<div className={`dark ${x}`} />', true],
      ['cle-objet', '<div className={clsx({ dark: actif })} />', true],
      ['multiligne', '<div\n  className={`flex\n  dark\n  bg-x`}\n/>', true],
      // …et ce qui lui RESSEMBLE sans être elle.
      ['prop', '<UserMenu variant="dark" />', false],
      ['variante-tailwind', '<div className="dark:bg-x" />', false],
      ['prefixe', '<div className="darkroom" />', false],
    ];
    const manques: string[] = [];
    for (const [nom, jsx, attendu] of cas) {
      const fichier = join(racine, `${nom}.tsx`);
      writeFileSync(fichier, `export function C() { return (${jsx}); }\n`);
      const vu = balisesSousLaClasse(fichier, CLASSE_SOMBRE).length > 0;
      if (vu !== attendu) manques.push(`${nom} : vu=${vu}, attendu=${attendu}`);
    }
    expect(manques, 'la dérivation des portées ne fait pas 10 sur 10 sur son banc').toEqual([]);
  });

  it('AC3 — les portées réelles sont DÉRIVÉES, portail compris', () => {
    const portees = porteesSombres();
    // Le compte n'est PAS l'assertion : il changera. Ce qui est asserté, c'est que la dérivation
    // ramasse le cas qu'aucun raisonnement sur l'arbre DOM n'aurait trouvé.
    expect(portees.length).toBeGreaterThanOrEqual(3);
    const parFichier = new Map(portees.map((p) => [p.fichier, p]));
    const portail = parFichier.get('components/layout/SuperAdminShell.tsx');
    expect(portail, 'la portée posée sur un `<SheetContent>` de PORTAIL a disparu du relevé').toBeDefined();
    expect(portail!.balises).toContain('SheetContent');
  });

  it("AC3 — aucune portée n'est posée par du DOM impératif, seul angle mort restant", () => {
    // `classList.add('dark')` échapperait à la lecture d'arbre. Il n'existe pas ; on le vérifie
    // plutôt que de l'écrire dans un commentaire.
    // ⚠ `src/test/` est écarté, et pour la raison que `check-chart-contrast.mjs` documente de son
    // côté : le harnais CITE le motif qu'il interdit (l'en-tête de `portees-sombres.ts` nomme
    // `classList.add('dark')` comme son angle mort). *Une garde qui rougit sur la documentation de
    // sa propre règle se fait désarmer avant d'avoir servi.*
    const impératifs = sourcesDe(RACINE_SRC, /\.tsx?$/)
      .filter((f) => !nommer(f).startsWith('test/'))
      .filter((f) => /classList\.(add|toggle)\(\s*['"`]dark/.test(readFileSync(f, 'utf8')))
      .map(nommer);
    expect(impératifs).toEqual([]);
  });

  it('AC2 — aucun composant TOLÉRÉ ne se trouve sous une portée `.dark` (deux ensembles dérivés)', () => {
    const sousPortee = fichiersSousPorteeSombre();
    const toleres: string[] = [];
    for (const fichier of sourcesDe(RACINE_SRC, /\.tsx$/)) {
      const clair = couplesDuFichier(fichier, JETONS_CLAIR, false).couples.filter((c) => c.ratio < c.seuil);
      if (clair.length > 0) continue; // il a d'autres défauts : ce n'est pas une TOLÉRANCE
      const sombre = couplesDuFichier(fichier, JETONS_SOMBRE, true).couples.filter((c) => c.ratio < c.seuil);
      if (sombre.length === 0) continue;
      toleres.push(`${nommer(fichier)} (pire ${fmt(Math.min(...sombre.map((c) => c.ratio)))} en sombre)`);
    }

    // Une garde qui n'a plus rien à comparer rend le même vert qu'une garde satisfaite.
    expect(toleres.length, 'aucun composant toléré relevé — le relevé est cassé').toBeGreaterThan(5);
    expect(toleres.some((t) => t.startsWith('components/layout/AppTopbar.tsx')),
      'AppTopbar, le composant de TCK-371, est sorti du relevé').toBe(true);

    const rompus = toleres.filter((t) => sousPortee.has(t.split(' ')[0]!));
    expect(
      rompus,
      'composant(s) dont le couple TOLÉRÉ en thème sombre est désormais ATTEIGNABLE : la tolérance '
      + 'de TCK-371 ne tient plus, il faut corriger le couple ou retirer la portée',
    ).toEqual([]);
  });

  it("AC2 — le contrôle RECONNAÎT une portée posée pour de vrai autour d'AppTopbar", () => {
    // L'ablation ne se simule pas : on place réellement la barre sous `<div className="dark">`.
    const normal = rendreBarreHaute(false);
    const entete = normal.container.querySelector('header')!;
    expect(estSousPorteeSombre(entete)).toBe(false);
    expect(couplesFautifs(entete), 'la barre haute est saine hors de toute portée sombre').toEqual([]);
    cleanup();

    const ablation = rendreBarreHaute(true);
    const enteteSombre = ablation.container.querySelector('header')!;
    expect(estSousPorteeSombre(enteteSombre)).toBe(true);
    const fautifs = couplesFautifs(enteteSombre);
    expect(fautifs.length, 'placée sous une portée `.dark`, la barre doit être REFUSÉE').toBeGreaterThan(0);
    // Et le chiffre de TCK-371, recalculé plutôt que recopié.
    expect(fautifs.some((f) => f.includes('text-white sur hérité — bg-foreground')), fautifs.join(' | ')).toBe(true);
    // 1,05:1 — le chiffre exact de TCK-371, recalculé et non recopié.
    expect(fautifs).toContain('text-white sur hérité — bg-foreground [repos] = 1,05:1');
    expect(Math.min(...fautifs.map((f) => Number(f.split('= ')[1]!.replace(',', '.').replace(':1', '')))))
      .toBeLessThan(1.1);
  });
});
