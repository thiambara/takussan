/**
 * Ce que le découpage du dictionnaire (TCK-337) promet RÉELLEMENT — et le seul moyen de le
 * falsifier.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE PLUTÔT QU'UNE MESURE DE POIDS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le critère naturel de ce ticket — « le poids de la page baisse » — est **coché par le pire
 * correctif possible** : `messages={{}}` donne le meilleur chiffre du lot, et ne fait rougir ni
 * `next build`, ni ESLint, ni `tsc --noEmit`, ni les ~810 tests. next-intl se contente d'un
 * `MISSING_MESSAGE` en console et peint le chemin de la clé à l'écran.
 *
 * Un chiffre ne peut donc pas servir de critère ici. Ce qui le peut, c'est une propriété qu'un
 * dictionnaire vide viole : **un espace de noms absent doit LEVER**. C'est ce que les cas
 * ci-dessous vérifient, y compris sur `messages={{}}` lui-même.
 */
import { render } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { IntlProvider, IntlProviderRacine } from '../IntlProvider';
import { messagesPour } from '../messages';
import { surErreurIntl } from '../erreurs';
import table from '../namespaces.json';

vi.mock('next-intl/server', () => ({ getMessages: async () => fr }));

type Arbre = Record<string, unknown>;

const sousEnsemble = (noms: readonly string[]): Arbre => {
  const out: Arbre = {};
  for (const n of noms) if ((fr as Arbre)[n] !== undefined) out[n] = (fr as Arbre)[n];
  return out;
};

/** Un consommateur minimal : il lit UNE clé, dans UN espace de noms. */
function Consommateur({ espace, cle }: { espace: string; cle: string }) {
  const t = useTranslations(espace);
  return <span>{t(cle)}</span>;
}

let erreurs: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // React journalise tout jet de rendu ; on ne veut pas de ce bruit, mais on ne veut pas non plus
  // masquer le `console.error` de `surErreurIntl` en production — d'où l'espion, pas le silence.
  erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  erreurs.mockRestore();
  vi.unstubAllEnvs();
});

describe('la politique d’erreur — ce qui rend le découpage falsifiable', () => {
  it('LÈVE hors production sur un espace de noms absent', () => {
    expect(() =>
      render(
        <IntlProviderRacine locale="fr" messages={sousEnsemble(['nav'])}>
          <Consommateur espace="homepage.row" cle="viewAll" />
        </IntlProviderRacine>,
      ),
    ).toThrow();
  });

  it('LÈVE sur `messages={{}}` — le correctif qui donnerait le meilleur chiffre', () => {
    expect(() =>
      render(
        <IntlProviderRacine locale="fr" messages={{}}>
          <Consommateur espace="homepage.row" cle="viewAll" />
        </IntlProviderRacine>,
      ),
    ).toThrow();
  });

  it('ne lève PAS quand l’espace est servi', () => {
    const { container } = render(
      <IntlProviderRacine locale="fr" messages={sousEnsemble(['homepage'])}>
        <Consommateur espace="homepage.row" cle="viewAll" />
      </IntlProviderRacine>,
    );
    expect(container.textContent).toBe(
      (fr as { homepage: { row: { viewAll: string } } }).homepage.row.viewAll,
    );
  });

  it('en PRODUCTION, journalise au lieu de lever — une clé absente ne tue pas la page', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const erreur = { code: 'MISSING_MESSAGE', message: 'absente' } as never;
    expect(() => surErreurIntl(erreur)).not.toThrow();
    expect(erreurs).toHaveBeenCalledWith(erreur);
  });

  it('ne lève que sur MISSING_MESSAGE — les autres codes ne concernent pas le découpage', () => {
    const erreur = { code: 'ENVIRONMENT_FALLBACK', message: 'timeZone' } as never;
    expect(() => surErreurIntl(erreur)).not.toThrow();
  });
});

describe('le piège des providers imbriqués', () => {
  it('un provider imbriqué REMPLACE le dictionnaire du parent, il ne le complète pas', () => {
    // C'est la contrainte mesurée au code de `use-intl` (`messages: void 0 === i ? w?.messages : i`)
    // et c'est elle qui impose que chaque entrée de la table soit CUMULÉE. Si ce test passait au
    // vert avec un ensemble non cumulé, la table pourrait l'être aussi — et elle ne le serait plus
    // le jour où quelqu'un l'allègerait.
    expect(() =>
      render(
        <IntlProviderRacine locale="fr" messages={sousEnsemble(['homepage'])}>
          <IntlProvider messages={sousEnsemble(['nav'])}>
            <Consommateur espace="homepage.row" cle="viewAll" />
          </IntlProvider>
        </IntlProviderRacine>,
      ),
    ).toThrow();
  });

  it('la locale, ELLE, s’hérite — sans quoi les layouts devraient tous être `async`', () => {
    const { container } = render(
      <IntlProviderRacine locale="fr" messages={sousEnsemble(['homepage'])}>
        <IntlProvider messages={sousEnsemble(['homepage', 'nav'])}>
          <Consommateur espace="homepage.row" cle="viewAll" />
        </IntlProvider>
      </IntlProviderRacine>,
    );
    expect(container.textContent).toBe(
      (fr as { homepage: { row: { viewAll: string } } }).homepage.row.viewAll,
    );
  });
});

describe('messagesPour', () => {
  it('ne rend QUE les espaces déclarés pour la frontière', async () => {
    const servis = Object.keys(await messagesPour('(public)'));
    expect(servis.sort()).toEqual([...(table.frontieres['(public)'] as readonly string[])].sort());
  });

  it('rend le contenu réel, pas une coquille — un sous-ensemble n’est pas un appauvrissement', async () => {
    const servis = (await messagesPour('(public)')) as Arbre;
    expect(servis.homepage).toEqual((fr as Arbre).homepage);
  });

  it('laisse dehors le back-office : c’est tout l’objet du ticket', async () => {
    const servis = await messagesPour('(public)');
    expect(servis).not.toHaveProperty('superAdmin');
    expect(servis).not.toHaveProperty('admin');
    expect(servis).not.toHaveProperty('crm');
  });
});

describe('la table dérivée', () => {
  const frontieres = table.frontieres as Record<string, readonly string[]>;

  it('donne à chaque frontière l’ensemble CUMULÉ de ses parents', () => {
    for (const [id, noms] of Object.entries(frontieres)) {
      if (id === '.') continue;
      const parents = Object.keys(frontieres).filter((p) => p !== id && p !== '.' && id.startsWith(p + '/'));
      for (const parent of [...parents, '.']) {
        const manquants = frontieres[parent]!.filter((n) => !noms.includes(n));
        expect(manquants, `« ${id} » n’hérite pas de « ${parent} »`).toEqual([]);
      }
    }
  });

  it('porte le PLANCHER partout — les deux espaces qu’aucun scan ne peut voir', () => {
    // `validation` et `errors` n'apparaissent au point de rendu sous AUCUN littéral : les clés sont
    // fabriquées par concaténation (`PREFIXE_VALIDATION`, `CLE_I18N_ERREUR_API`) et voyagent comme
    // des DONNÉES. Sans ce plancher, tout message de formulaire s'afficherait en clé brute.
    for (const [id, noms] of Object.entries(frontieres)) {
      for (const socle of table.plancher) {
        expect(noms, `« ${id} » a perdu le plancher`).toContain(socle);
      }
    }
  });

  it('ne déclare que des espaces qui existent au dictionnaire', () => {
    const connus = new Set(Object.keys(fr));
    for (const [id, noms] of Object.entries(frontieres)) {
      for (const nom of noms) expect(connus, `« ${id} » déclare « ${nom} »`).toContain(nom);
    }
  });

  it('sert `property` à la console super-admin — l’espace que seul le repli de constantes trouve', () => {
    // `SuperAdminPropertiesFilters` n'écrit aucun `useTranslations('property…')` : il passe
    // `PROPERTY_ENUM_NAMESPACES.status`. Une table écrite à la main aurait cassé cet écran, et
    // rien — ni build, ni lint, ni types, ni tests — ne l'aurait dit.
    expect(frontieres['(super-admin)/super-admin']).toContain('property');
  });
});
