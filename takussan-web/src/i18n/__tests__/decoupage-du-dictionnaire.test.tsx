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

describe('les providers imbriqués COMPLÈTENT leur parent (P105.02)', () => {
  it('un provider imbriqué rend aussi les espaces de son parent', () => {
    // `use-intl` REMPLACE le dictionnaire du parent quand on lui passe `messages`
    // (`messages: void 0 === i ? w?.messages : i`). `IntlProvider` fusionne donc lui-même
    // `useMessages()` et le sien : c'est ce qui permet à la table de ne porter que le
    // DIFFÉRENTIEL de chaque frontière (amendement d'ADR-0022 du 2026-10-25). Sans la fusion,
    // ce rendu lève : `homepage` n'est que chez le parent.
    const { container } = render(
      <IntlProviderRacine locale="fr" messages={sousEnsemble(['homepage'])}>
        <IntlProvider messages={sousEnsemble(['nav'])}>
          <Consommateur espace="homepage.row" cle="viewAll" />
        </IntlProvider>
      </IntlProviderRacine>,
    );
    expect(container.textContent).toBe(
      (fr as { homepage: { row: { viewAll: string } } }).homepage.row.viewAll,
    );
  });

  it('et ses propres espaces, sur trois niveaux', () => {
    const { container } = render(
      <IntlProviderRacine locale="fr" messages={sousEnsemble(['homepage'])}>
        <IntlProvider messages={sousEnsemble(['nav'])}>
          <IntlProvider messages={{}}>
            <Consommateur espace="nav" cle="login" />
          </IntlProvider>
        </IntlProvider>
      </IntlProviderRacine>,
    );
    expect(container.textContent).toBe((fr as { nav: { login: string } }).nav.login);
  });

  it('un espace absent de TOUTE la chaîne lève toujours', () => {
    expect(() =>
      render(
        <IntlProviderRacine locale="fr" messages={sousEnsemble(['homepage'])}>
          <IntlProvider messages={sousEnsemble(['nav'])}>
            <Consommateur espace="crm.pipeline" cle="title" />
          </IntlProvider>
        </IntlProviderRacine>,
      ),
    ).toThrow();
  });

  it('la locale s’hérite — sans quoi les layouts devraient tous être `async`', () => {
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
    const servis = Object.keys(await messagesPour('[locale]/(public)'));
    expect(servis.sort()).toEqual([...(table.frontieres['[locale]/(public)'] as readonly string[])].sort());
  });

  it('rend le contenu réel, pas une coquille — un sous-ensemble n’est pas un appauvrissement', async () => {
    const servis = (await messagesPour('[locale]/(public)')) as Arbre;
    expect(servis.homepage).toEqual((fr as Arbre).homepage);
  });

  /**
   * TCK-1489 (P105.03) — `messagesPour` recopie la RÉFÉRENCE de chaque espace, jamais une copie.
   * Depuis l'amendement d'ADR-0022 du 2026-10-25, deux frontières imbriquées ne partagent plus
   * d'espace (la table est différentielle) ; l'identité reste gardée, parce que c'est elle qui
   * laisse Flight réduire à une référence un espace qu'un futur changement servirait deux fois.
   * `toEqual` passerait sur une copie ; `toBe` rougit si un clonage revient.
   */
  it('rend pour chaque espace le MÊME objet que le dictionnaire de la requête', async () => {
    const agence = await messagesPour('(dashboard)/app/agency');
    const noms = Object.keys(agence);

    expect(noms.length).toBeGreaterThan(0);
    for (const nom of noms) expect(agence[nom], nom).toBe((fr as Arbre)[nom]);
  });

  it('laisse dehors le back-office : c’est tout l’objet du ticket', async () => {
    const servis = await messagesPour('[locale]/(public)');
    expect(servis).not.toHaveProperty('superAdmin');
    expect(servis).not.toHaveProperty('admin');
    expect(servis).not.toHaveProperty('crm');
  });
});

describe('la table dérivée', () => {
  const frontieres = table.frontieres as Record<string, readonly string[]>;

  /** Les frontières parentes d'un identifiant, de la plus proche à la racine. */
  const parentsDe = (id: string): string[] =>
    id === '.'
      ? []
      : [
          ...Object.keys(frontieres)
            .filter((p) => p !== id && p !== '.' && id.startsWith(p + '/'))
            .sort((a, b) => b.length - a.length),
          '.',
        ];

  it('ne répète dans aucune frontière un espace que sert déjà l’un de ses parents (P105.02)', () => {
    // La table est DIFFÉRENTIELLE : `IntlProvider` fusionne le dictionnaire de son parent, donc un
    // espace répété ne serait qu'un octet payé deux fois — et renvoyé à chaque navigation.
    for (const [id, noms] of Object.entries(frontieres)) {
      for (const parent of parentsDe(id)) {
        const repetes = frontieres[parent]!.filter((n) => noms.includes(n));
        expect(repetes, `« ${id} » répète des espaces de « ${parent} »`).toEqual([]);
      }
    }
  });

  it('porte le PLANCHER à la racine, d’où toute frontière l’hérite', () => {
    // `validation` et `errors` n'apparaissent au point de rendu sous AUCUN littéral : les clés sont
    // fabriquées par concaténation (`PREFIXE_VALIDATION`, `CLE_I18N_ERREUR_API`) et voyagent comme
    // des DONNÉES. Sans ce plancher, tout message de formulaire s'afficherait en clé brute.
    for (const socle of table.plancher) expect(frontieres['.'], 'la racine a perdu le plancher').toContain(socle);
    for (const id of Object.keys(frontieres)) {
      const chaine = [id, ...parentsDe(id)].flatMap((f) => frontieres[f]!);
      for (const socle of table.plancher) expect(chaine, `« ${id} » n’hérite pas du plancher`).toContain(socle);
    }
  });

  it('ne déclare que des espaces qui existent au dictionnaire', () => {
    const connus = new Set(Object.keys(fr));
    for (const [id, noms] of Object.entries(frontieres)) {
      for (const nom of noms) expect(connus, `« ${id} » déclare « ${nom} »`).toContain(nom);
    }
  });

  it('ne sert au navigateur aucun espace que seul le serveur lit (P105.04)', () => {
    // `meta` (les `generateMetadata`), `serverActions` (les actions serveur) et `publicLeadErrors`
    // (un `getTranslations()` racine d'action) ne sont lus que par `getTranslations`, qui résout
    // contre le dictionnaire entier de la requête. Les sérialiser coûtait ~1,5 Ko gzip par document.
    for (const [id, noms] of Object.entries(frontieres)) {
      for (const serveur of ['meta', 'serverActions', 'publicLeadErrors']) {
        expect(noms, `« ${id} » sert « ${serveur} »`).not.toContain(serveur);
      }
    }
  });

  it('sert `property` à la console super-admin — l’espace que seul le repli de constantes trouve', () => {
    // `SuperAdminPropertiesFilters` n'écrit aucun `useTranslations('property…')` : il passe
    // `PROPERTY_ENUM_NAMESPACES.status`. Une table écrite à la main aurait cassé cet écran, et
    // rien — ni build, ni lint, ni types, ni tests — ne l'aurait dit.
    const chaine = ['(super-admin)/super-admin', ...parentsDe('(super-admin)/super-admin')];
    expect(chaine.flatMap((f) => frontieres[f]!)).toContain('property');
  });
});
