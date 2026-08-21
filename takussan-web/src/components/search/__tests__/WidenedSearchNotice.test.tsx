import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { WidenedSearchNotice } from '../WidenedSearchNotice';

/**
 * TCK-338 — les DEUX situations de repli ne se disent pas de la même façon, et c'est tout
 * l'enjeu de ce fichier.
 *
 * Un composant qui nommerait toujours les mots de la requête passerait le premier cas sans
 * broncher et mentirait dans le second : sur `studio piscine`, chaque mot existe (44 et 3
 * biens), c'est leur intersection qui est vide. Désigner l'un des deux serait **inventer un
 * coupable**. Les tests ci-dessous vérifient donc autant ce qui est ÉCRIT que ce qui ne l'est
 * pas.
 */

describe('WidenedSearchNotice — un terme ne correspond à rien', () => {
  it('nomme le terme, annonce le compte élargi et propose de le retirer', async () => {
    const onRetirerTerme = vi.fn();
    render(
      withIntl(
        <WidenedSearchNotice
          termesSansResultat={['Saly']}
          totalElargi={63}
          onRetirerTerme={onRetirerTerme}
          onEffacerRecherche={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Aucun bien ne correspond à « Saly ».');
    // Le compte vient du bloc `search`, et il est ANNONCÉ : sans lui, l'étiquette dirait à
    // l'utilisateur que sa recherche a échoué alors que 63 biens sont affichés dessous.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Voici les 63 biens qui correspondent à une partie de vos mots.',
    );

    await userEvent.click(screen.getByRole('button', { name: /Retirer « Saly »/ }));
    expect(onRetirerTerme).toHaveBeenCalledWith('Saly');
    attendAucuneCleBrute();
  });

  it('propose UN bouton par terme, chacun portant son propre mot', async () => {
    const onRetirerTerme = vi.fn();
    render(
      withIntl(
        <WidenedSearchNotice
          termesSansResultat={['Saly', 'dakr']}
          totalElargi={12}
          onRetirerTerme={onRetirerTerme}
          onEffacerRecherche={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Aucun bien ne correspond à ces mots : Saly, dakr.',
    );

    // Un bouton unique « Retirer ces mots » obligerait à tout défaire d'un coup : si « dakr »
    // est une faute de frappe et « Saly » une intention, l'utilisateur doit pouvoir trancher.
    await userEvent.click(screen.getByRole('button', { name: /Retirer « dakr »/ }));
    expect(onRetirerTerme).toHaveBeenCalledTimes(1);
    expect(onRetirerTerme).toHaveBeenCalledWith('dakr');
    attendAucuneCleBrute();
  });
});

describe('WidenedSearchNotice — chaque mot existe, leur intersection non', () => {
  it('ne nomme AUCUN mot et propose d’effacer les mots-clés', async () => {
    const onRetirerTerme = vi.fn();
    const onEffacerRecherche = vi.fn();
    render(
      withIntl(
        <WidenedSearchNotice
          termesSansResultat={[]}
          totalElargi={44}
          onRetirerTerme={onRetirerTerme}
          onEffacerRecherche={onEffacerRecherche}
        />,
      ),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Aucun bien ne réunit tous vos mots.');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Voici les 44 biens qui correspondent à une partie de vos mots.',
    );

    // ⚠ L'assertion qui porte le ticket : PAS de mot désigné, et pas de bouton « Retirer ».
    expect(screen.queryByText(/Aucun bien ne correspond à/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();

    // Mais une issue quand même : un message qui ne propose rien est le cul-de-sac qu'on
    // cherche à éviter.
    await userEvent.click(screen.getByRole('button', { name: /Effacer les mots-clés/ }));
    expect(onEffacerRecherche).toHaveBeenCalledTimes(1);
    expect(onRetirerTerme).not.toHaveBeenCalled();
    attendAucuneCleBrute();
  });

  it('reste honnête quand le repli lui-même ne rend aucun bien', () => {
    render(
      withIntl(
        <WidenedSearchNotice
          termesSansResultat={['Saly']}
          totalElargi={0}
          onRetirerTerme={vi.fn()}
          onEffacerRecherche={vi.fn()}
        />,
      ),
    );

    // Le pluriel `=0` existe pour ça : « Voici les 0 biens » est la phrase qu'on ne veut pas.
    expect(screen.getByRole('status')).toHaveTextContent('Aucun bien proche à vous proposer.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Voici');
    attendAucuneCleBrute();
  });
});

describe('WidenedSearchNotice — les trois locales portent le libellé', () => {
  it('rend l’anglais, pas le repli français', () => {
    render(
      withIntl(
        <WidenedSearchNotice
          termesSansResultat={['Saly']}
          totalElargi={63}
          onRetirerTerme={vi.fn()}
          onEffacerRecherche={vi.fn()}
        />,
        'en',
      ),
    );

    // `src/i18n/request.ts` deep-merge `fr` sous TOUTE locale : une clé sans traduction
    // anglaise s'affiche EN FRANÇAIS, sans erreur ni test rouge. D'où cette assertion.
    expect(screen.getByRole('status')).toHaveTextContent('No property matches “Saly”.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Aucun bien');
  });

  it('rend le wolof, pas le repli français', () => {
    render(
      withIntl(
        <WidenedSearchNotice
          termesSansResultat={[]}
          totalElargi={44}
          onRetirerTerme={vi.fn()}
          onEffacerRecherche={vi.fn()}
        />,
        'wo',
      ),
    );

    expect(screen.getByRole('status')).toHaveTextContent('Gisunu benn kër bu boole say baat yépp.');
    expect(screen.getByRole('status')).not.toHaveTextContent('Aucun bien');
  });
});
