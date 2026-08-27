import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

/**
 * TCK-370, défaut n°1 — **le fil entre les deux bouts d'une redirection**.
 *
 * Mesuré le 2026-08-27, avant ce ticket :
 *
 *     $ grep -rn "tags-platform-managed" takussan-web/src/
 *     src/app/(dashboard)/admin/settings/tags/page.tsx:6:  redirect('/admin?notice=tags-platform-managed');
 *
 * Une seule occurrence — celle qui l'ÉCRIT. L'utilisateur cliquait sur « Tags », se retrouvait
 * sur le tableau de bord, et rien à l'écran ne disait qu'il avait été redirigé ni pourquoi.
 *
 * ⚠ **Ce que ce fichier refuse de faire, et c'est le point.** Un test qui vérifierait que
 * `AdminNotice` sait rendre la chaîne `'tags-platform-managed'` serait vert avec un émetteur
 * qui poste `?notice=tags`, `?raison=…`, ou plus rien du tout : il cocherait « le bandeau
 * existe » sans rien dire du fil. Le test ci-dessous part donc du VRAI émetteur — il exécute
 * `/admin/settings/tags`, intercepte l'URL que `redirect()` reçoit, en extrait `notice`, et
 * n'injecte QUE cette valeur-là dans la vraie page `/admin`. Changer un seul des deux côtés le
 * fait rougir.
 */

const redirectMock = vi.fn((url: string) => {
  // `redirect()` de Next ne rend pas : il lève. Sans ça, la page continuerait après l'appel.
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({
    id: 1,
    first_name: 'Awa',
    last_name: 'Ndiaye',
    full_name: 'Awa Ndiaye',
    roles: ['agency_admin'],
    agency_id: 7,
    avatar_url: null,
  }),
}));

vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: async () => undefined,
  resolveAgencyOrNull: async () => null,
}));

// TCK-375 a fait lire la session par cette page (bloc des files d'attente) : sans ce simulacre,
// `cookies()` est appelé hors d'un contexte de requête Next et lève avant que le bandeau soit
// rendu. Le sujet de ce fichier reste le FIL de la redirection, pas la session — d'où un jeton
// constant et une agence résolue à `null`, qui ne changent rien à ce qui est asserté ici.
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

// Le tableau de bord lui-même n'est pas le sujet : `null` fait rendre l'état dégradé, qui ne
// dépend d'aucune donnée.
vi.mock('@/lib/queries/dashboard-agency', () => ({
  fetchDashboardAgency: async () => null,
}));

vi.mock('@/components/dashboard/admin/AgencyDegradedState', () => ({
  AgencyDegradedState: () => <div data-testid="degraded" />,
}));

async function urlDeRedirectionDesTags(): Promise<string> {
  const { default: PageTags } = await import('../settings/tags/page');
  await expect(PageTags()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return redirectMock.mock.calls.at(-1)![0];
}

describe('/admin/settings/tags → /admin', () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirige vers /admin en emportant un motif', async () => {
    const url = await urlDeRedirectionDesTags();

    expect(url.startsWith('/admin?')).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('notice')).toBeTruthy();
  });

  it("l'écran d'arrivée explique la redirection", async () => {
    const url = await urlDeRedirectionDesTags();
    const notice = new URLSearchParams(url.split('?')[1]).get('notice')!;

    const { default: PageAdmin } = await import('../page');
    render(await PageAdmin({ searchParams: Promise.resolve({ notice }) }));

    const bandeau = screen.getByRole('status');
    expect(bandeau).toHaveTextContent('Les tags sont gérés par la plateforme');
    // Le libellé vient du dictionnaire : si la clé manquait, `mockTraductionsServeur` rendrait le
    // CHEMIN de la clé, et cette assertion-ci rougirait au lieu de passer sur une chaîne vide.
    expect(bandeau).toHaveTextContent(/référentiel des tags est maintenu par Takussan/);
  });

  it("ne peint rien pour un motif inconnu venu de la barre d'adresse", async () => {
    const { default: PageAdmin } = await import('../page');
    render(await PageAdmin({ searchParams: Promise.resolve({ notice: 'nimporte-quoi' }) }));

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByTestId('admin-notice')).toBeNull();
  });

  it('ne peint rien quand aucun motif ne voyage', async () => {
    const { default: PageAdmin } = await import('../page');
    render(await PageAdmin({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByTestId('admin-notice')).toBeNull();
  });
});

/**
 * TCK-430 — LA DÉCISION, pas seulement le fil.
 *
 * TCK-370 a réparé le `?notice=` ; ce ticket-ci a borné sa valeur. Re-mesuré le 2026-08-27 :
 *
 *     $ grep -rn "settings/tags" takussan-web/src/ | grep -v __tests__
 *     src/lib/admin/notices.ts:8 · :12 · :22          (trois commentaires)
 *     $ grep -rn 'href="/admin/settings/tags"' takussan-web/src/
 *     (aucun résultat)
 *
 * Décision retenue : **assumer la souche**. Elle a un ayant droit réel — entre TCK-066 et
 * TCK-213 la route montait `TagsManager` et DEUX bandeaux d'onglets y menaient (le détail et
 * ses commandes sont en tête de `settings/tags/page.tsx`). Elle répond donc à d'anciens
 * marque-pages, et à eux seuls.
 *
 * Ce test est le TRIPWIRE de cette décision. Il ne vérifie pas qu'un lien existe : il vérifie
 * qu'il n'en existe toujours aucun. Le jour où quelqu'un en ajoute un, il rougit — non pas
 * parce que le lien serait interdit, mais parce qu'un chemin entrant vers une page qui redirige
 * aussitôt est le deuxième geste mort, et qu'il faut alors ouvrir un vrai écran plutôt qu'une
 * entrée de menu. *Une décision qui ne vit que dans un commentaire se défait au premier réflexe.*
 *
 * ⚠ **CE QUE CE TRIPWIRE NE VOIT PAS**, relevé en revue et écrit ici plutôt que laissé à
 * découvrir. Deux bornes, aucune ne cache de lien aujourd'hui :
 *
 *  1. **Les fichiers de TEST** (`__tests__/`, `*.test.tsx`) sont écartés par `fichiersSources`.
 *     Délibéré : ce fichier-ci cite la route à chaque ligne, il rougirait sur lui-même.
 *  2. **Tout ce qui n'est ni `.ts` ni `.tsx`** — en particulier `src/messages/*.json`. Vérifié le
 *     2026-08-27, `grep -rn "settings/tags" src/messages/` : aucun résultat. Un libellé de menu
 *     n'est de toute façon pas un `href` ; c'est le fichier qui porte le lien qui compte, et il
 *     est en `.tsx`.
 *
 * Ce que le tripwire voit, en revanche, il le voit strictement : la route ET un producteur de
 * navigation sur la MÊME ligne, commentaires écartés. Les trois lignes de `lib/admin/notices.ts`
 * qui citent la route sont des explications et ne comptent pas — sans quoi la garde rougirait sur
 * de la documentation juste.
 */
describe('/admin/settings/tags — la souche est assumée (TCK-430)', () => {
  const SRC = path.resolve(__dirname, '../../../..'); // → src/
  const SOUCHE = path.join(SRC, 'app/(dashboard)/admin/settings/tags');

  function fichiersSources(dir: string): string[] {
    const sortie: string[] = [];
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const complet = path.join(dir, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === '__tests__' || entree.name === 'node_modules') continue;
        sortie.push(...fichiersSources(complet));
      } else if (/\.(ts|tsx)$/.test(entree.name) && !/\.(test|spec)\.tsx?$/.test(entree.name)) {
        sortie.push(complet);
      }
    }
    return sortie;
  }

  it('ne porte aucun lien entrant — et la page dit pourquoi', () => {
    // Un LIEN, pas une mention : la route et un producteur de navigation sur la même ligne. Les
    // trois lignes de `lib/admin/notices.ts` qui la citent sont des commentaires explicatifs et
    // ne doivent pas compter — sans quoi cette garde rougirait sur de la documentation juste.
    const producteur = /href|router\s*\.\s*(push|replace)|\b(permanent)?[Rr]edirect\s*\(/i;
    const liens: string[] = [];

    for (const fichier of fichiersSources(SRC)) {
      if (fichier.startsWith(SOUCHE)) continue; // la souche elle-même n'est pas un chemin entrant
      fs.readFileSync(fichier, 'utf8')
        .split('\n')
        .forEach((ligne, i) => {
          const nue = ligne.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
          if (nue.includes('/admin/settings/tags') && producteur.test(nue)) {
            liens.push(`${path.relative(SRC, fichier)}:${i + 1}`);
          }
        });
    }

    expect(liens).toEqual([]);

    // Et la souche PORTE sa raison d'être, en tête, avec ses commandes de mesure — sinon la
    // ligne du `grep` ci-dessus reste inexplicable sans lire le ticket (AC de TCK-430).
    const source = fs.readFileSync(path.join(SOUCHE, 'page.tsx'), 'utf8');
    expect(source).toMatch(/SOUCHE DE REDIRECTION ASSUM/);
    expect(source).toMatch(/TCK-213/);
    expect(source).toMatch(/marque-pages/);
  });
});
