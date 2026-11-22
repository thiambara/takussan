import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { IntlProvider } from '@/i18n/IntlProvider';
import table from '@/i18n/namespaces.json';
import fr from '@/messages/fr.json';
import { DeclarerEnTete, FournisseurDEnTete, useDeclarationDEnTete } from '../en-tete-de-la-coque';

/**
 * Ce qu'une page déclare à l'en-tête de la coque (`action`, `actions`, `droite`) est MONTÉ par la
 * coque, hors de l'arbre de la page : sans parade, sous le seul dictionnaire de la coque. La fiche du
 * bien au téléphone tombait au toucher de « ⋯ » (`MISSING_MESSAGE: visitPlanning.plan`), comme celle du
 * client avant elle (TCK-2589, lot E). `DeclarerEnTete` porte donc avec ses nœuds le dictionnaire de la
 * page qui les déclare.
 *
 * La garde de la classe, pour TOUT appelant : la vraie primitive, le vrai fournisseur, un consommateur
 * qui rend les nœuds comme `EnTeteMobile`, la coque sous ses seules frontières (`.`, `(dashboard)`,
 * `(dashboard)/app`), la page sous le différentiel de la sienne, et toute clé manquante qui lève.
 */
type Messages = Record<string, unknown>;
const frontieres = table.frontieres as Record<string, string[]>;
const dico = fr as Messages;
const espaces = (noms: readonly string[]) => Object.fromEntries(noms.filter((n) => n in dico).map((n) => [n, dico[n]]));
const deLaCoque = espaces(['.', '(dashboard)', '(dashboard)/app'].flatMap((f) => frontieres[f] ?? []));
const deLaPage = espaces(frontieres['(dashboard)/app/properties'] ?? []);

function Traduit({ espace, cle }: { readonly espace: string; readonly cle: string }) {
  const t = useTranslations(espace);
  return <span>{t(cle)}</span>;
}

/** Ce que fait la coque : elle rend les nœuds déclarés dans SON arbre. */
function Coque() {
  const { action, actions, droite } = useDeclarationDEnTete();
  return (
    <div>
      <div data-testid="action">{action}</div>
      <div data-testid="actions">{actions}</div>
      <div data-testid="droite">{droite}</div>
      <p data-testid="plus">{actions ? 'avec ⋯' : 'sans ⋯'}</p>
    </div>
  );
}

function monter(declaration: Parameters<typeof DeclarerEnTete>[0]) {
  return render(
    <NextIntlClientProvider locale="fr" messages={deLaCoque} onError={(e) => { throw e; }}>
      <FournisseurDEnTete>
        <Coque />
        <IntlProvider messages={deLaPage}>
          <DeclarerEnTete {...declaration} />
        </IntlProvider>
      </FournisseurDEnTete>
    </NextIntlClientProvider>,
  );
}

describe('DeclarerEnTete — les nœuds déclarés se traduisent sous le dictionnaire de la page', () => {
  it('le dictionnaire de la coque ne porte pas ceux de la fiche du bien (prémisse)', () => {
    expect('visitPlanning' in deLaCoque).toBe(false);
    expect('property' in deLaCoque).toBe(false);
    expect('visitPlanning' in deLaPage && 'property' in deLaPage).toBe(true);
  });

  it('actions, action et droite, montés par la coque, lisent les espaces de la page', () => {
    monter({
      forme: 'detail',
      actions: <Traduit espace="visitPlanning.plan" cle="cta" />,
      action: <Traduit espace="propertyDashboard.actions" cle="published" />,
      droite: <Traduit espace="visitPlanning.plan" cle="property" />,
    });
    expect(screen.getByTestId('actions')).toHaveTextContent('Planifier une visite');
    expect(screen.getByTestId('action')).toHaveTextContent('Bien publié.');
    expect(screen.getByTestId('droite')).toHaveTextContent('Bien');
  });

  it('les espaces de la coque restent lus', () => {
    monter({ forme: 'detail', actions: <Traduit espace="nav.coque" cle="retour" /> });
    expect(screen.getByTestId('actions')).toHaveTextContent('Retour');
  });

  it('sans actions, pas de « ⋯ » : rien n’est enveloppé', () => {
    monter({ forme: 'detail', titre: 'Villa Ngor' });
    expect(screen.getByTestId('plus')).toHaveTextContent('sans ⋯');
  });

  it('hors de la coque (ni fournisseur ni dictionnaire), ne fait rien et ne lève pas', () => {
    expect(() => render(<DeclarerEnTete forme="detail" actions={<span>geste</span>} />)).not.toThrow();
  });
});
