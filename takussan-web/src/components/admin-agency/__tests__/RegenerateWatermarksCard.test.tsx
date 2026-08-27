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

  /**
   * **La panne que l'action serveur ne peut PAS attraper.**
   *
   * `regenerateAgencyWatermarksAction` mappe les erreurs de l'API en `{ ok: false, message }`.
   * Elle ne peut rien contre une panne du transport qui la porte : réseau coupé, déploiement en
   * cours, 500 du runtime des server actions. L'appel *rejette* alors — il ne rend rien à mapper.
   *
   * Mesuré avant correctif, avec exactement ce double : `alert` = AUCUN, `status` = AUCUN, le
   * dialogue se referme, et une « Unhandled Error » remonte dans vitest. L'utilisateur confirme
   * une opération lourde et l'écran ne dit rien — alors il reclique.
   *
   * Ce test rougit sans le `try/catch` (ablation A12) et lui seul.
   */
  it("dit la panne de TRANSPORT au lieu de se taire quand l'action rejette", async () => {
    actionMock.mockRejectedValue(new Error('TypeError: Failed to fetch'));
    const user = userEvent.setup();
    await monte();

    await user.click(screen.getByRole('button', { name: /Regénérer les filigranes/ }));
    await user.click(await screen.findByRole('button', { name: 'Lancer la regénération' }));

    // Un message, et un message qui ORIENTE : le serveur n'a pas été joint.
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre le serveur.');
    // ⚠ Et surtout PAS de succès : se taire est mauvais, mentir serait pire.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  /**
   * Le versant opposé du même correctif. Un `catch` qui laisserait le dialogue de confirmation
   * ouvert donnerait un second bouton « Lancer la regénération » à cliquer, sur un traitement qui
   * a peut-être déjà démarré côté serveur — la panne peut être au RETOUR.
   */
  it('referme la confirmation même quand l’appel explose', async () => {
    actionMock.mockRejectedValue(new Error('500'));
    const user = userEvent.setup();
    await monte();

    await user.click(screen.getByRole('button', { name: /Regénérer les filigranes/ }));
    await user.click(await screen.findByRole('button', { name: 'Lancer la regénération' }));

    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Lancer la regénération' }),
    ).not.toBeInTheDocument();
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
