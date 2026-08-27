import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-370, défaut n°3 — **un endpoint sans appelant**.
 *
 * Mesuré le 2026-08-27, avant ce ticket :
 *
 *     $ grep -rn "regenerate-watermarks" takussan-web/src/
 *     (aucun résultat)
 *
 * `POST /api/agencies/{agency}/regenerate-watermarks` existait depuis TCK-106, poussait un
 * `RegenerateAgencyWatermarksJob` et rendait 202 — et rien du front ne l'appelait.
 *
 * ⚠ Le test qui compte n'est pas « le bouton existe » : c'est **qu'un clic seul ne déclenche
 * rien**. Une regénération sur toutes les photos de tous les biens de l'agence est exactement le
 * geste qu'on ne veut pas voir partir sur un clic distrait, et un bouton câblé en direct
 * cocherait « l'action part » tout aussi bien.
 */

const actionMock = vi.fn();

vi.mock('@/app/actions/admin-agency', () => ({
  regenerateAgencyWatermarksAction: (agencyId: number) => actionMock(agencyId),
}));

async function monte() {
  const { RegenerateWatermarksCard } = await import('../RegenerateWatermarksCard');
  return render(withIntl(<RegenerateWatermarksCard agencyId={7} />));
}

describe('<RegenerateWatermarksCard>', () => {
  beforeEach(() => {
    actionMock.mockReset();
    actionMock.mockResolvedValue({ ok: true, data: { queued: true, agency_id: 7 } });
  });

  it("ne part PAS au premier clic : elle demande confirmation, et dit ce qu'elle va toucher",
    async () => {
      const user = userEvent.setup();
      await monte();

      await user.click(screen.getByRole('button', { name: /Regénérer les filigranes/ }));

      expect(actionMock).not.toHaveBeenCalled();
      expect(await screen.findByText('Regénérer tous les filigranes ?')).toBeInTheDocument();
      expect(
        screen.getByText(/Toutes les photos de tous les biens de l'agence/),
      ).toBeInTheDocument();
    });

  it('annuler referme sans rien envoyer', async () => {
    const user = userEvent.setup();
    await monte();

    await user.click(screen.getByRole('button', { name: /Regénérer les filigranes/ }));
    await screen.findByText('Regénérer tous les filigranes ?');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(actionMock).not.toHaveBeenCalled();
  });

  it("confirmer appelle l'endpoint UNE fois, avec l'agence, et ne prétend pas que c'est fini",
    async () => {
      const user = userEvent.setup();
      await monte();

      await user.click(screen.getByRole('button', { name: /Regénérer les filigranes/ }));
      await user.click(await screen.findByRole('button', { name: 'Lancer la regénération' }));

      await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
      expect(actionMock).toHaveBeenCalledWith(7);
      // 202 : le travail part en file. Le libellé dit « se poursuit en arrière-plan », pas
      // « terminé ».
      expect(
        await screen.findByText(/la regénération se poursuit en arrière-plan/),
      ).toBeInTheDocument();
    });

  it("affiche le refus du serveur plutôt que de masquer le bouton", async () => {
    // La garde serveur est `primary_admin_id === user->id` ou super-admin — plus étroite que
    // l'`isAdmin` qui ouvre la page. Un agency_admin secondaire DOIT voir le refus.
    actionMock.mockResolvedValue({ ok: false, status: 403, message: 'Action non autorisée.' });
    const user = userEvent.setup();
    await monte();

    await user.click(screen.getByRole('button', { name: /Regénérer les filigranes/ }));
    await user.click(await screen.findByRole('button', { name: 'Lancer la regénération' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Action non autorisée.');
  });
});
