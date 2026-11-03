import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { deleteAdminAiModel, fetchAdminAiModels, fetchAdminAiProviders, patchAdminAiModel, postAdminAiModel } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AiCatalogueModel } from '@/types/super-admin';
import { AiModelsPanel } from '../AiModelsPanel';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAiModels: vi.fn(),
  fetchAdminAiProviders: vi.fn(),
  postAdminAiModel: vi.fn(),
  patchAdminAiModel: vi.fn(),
  deleteAdminAiModel: vi.fn(),
}));

const tarifs = { input: '2', output: '10', cache_read: '0.125', cache_write: '2.5' };
const configuration: AiCatalogueModel = { id: null, provider: 'anthropic', model: 'modele-a', ...tarifs, active: true, origin: 'config', in_config: true, updated_at: null, uses: null };
const ajoute: AiCatalogueModel = { id: 7, provider: 'anthropic', model: 'modele-neuf', input: '0.00000000004', output: '0', cache_read: '0', cache_write: '0', active: true, origin: 'console', in_config: false, updated_at: '2026-10-31T10:00:00+00:00', uses: null };
const retire: AiCatalogueModel = { ...ajoute, id: 8, model: 'modele-retire', active: false };
const remplace: AiCatalogueModel = { ...configuration, id: 9, model: 'modele-b', input: '1', origin: 'console', updated_at: '2026-10-31T10:00:00+00:00' };
const reponse = (...data: AiCatalogueModel[]) => ({ data, meta: { usd_to_xof: '600' } });

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}><AiModelsPanel /></QueryClientProvider>));
}

const ligne = (modele: string) => screen.findByRole('row', { name: new RegExp(modele) });

describe('modèles IA (TCK-2448)', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminAiModels).mockReset().mockResolvedValue(reponse(configuration, ajoute, retire));
    vi.mocked(fetchAdminAiProviders).mockReset().mockResolvedValue({ data: [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, selectable: true, reason: null, host: 'api.anthropic.com', models: ['modele-a'] }] });
    vi.mocked(postAdminAiModel).mockReset().mockResolvedValue(reponse(configuration));
    vi.mocked(patchAdminAiModel).mockReset().mockResolvedValue(reponse(configuration));
    vi.mocked(deleteAdminAiModel).mockReset().mockResolvedValue(reponse(configuration));
  });

  it('liste par fournisseur, avec tous les chiffres des quatre tarifs et l’origine', async () => {
    renderPanel();

    const modele = await ligne('modele-a');
    expect(modele).toHaveTextContent('$2.00');
    expect(modele).toHaveTextContent('$10.00');
    expect(modele).toHaveTextContent('$0.125');
    expect(modele).toHaveTextContent('Configuration');
    expect(await ligne('modele-neuf')).toHaveTextContent('$0.00000000004');
    expect(await ligne('modele-neuf')).toHaveTextContent('Réglé ici');
    expect(await screen.findByRole('heading', { name: 'Anthropic' })).toBeInTheDocument();
  });

  it('un modèle retiré reste visible, atténué, et se rétablit', async () => {
    renderPanel();

    const modele = await ligne('modele-retire');
    expect(modele).toHaveTextContent('Retiré');
    expect(modele).toHaveClass('opacity-60');
    expect(await ligne('modele-a')).not.toHaveClass('opacity-60');

    await userEvent.click(within(modele).getByRole('button', { name: 'Rétablir modele-retire' }));

    expect(patchAdminAiModel).toHaveBeenCalledWith(8, { active: true });
  });

  it('retirer un modèle de la configuration crée sa ligne, avec ses tarifs', async () => {
    renderPanel();

    await userEvent.click(within(await ligne('modele-a')).getByRole('button', { name: 'Retirer modele-a' }));

    expect(postAdminAiModel).toHaveBeenCalledWith({ provider: 'anthropic', model: 'modele-a', ...tarifs, active: false });
    expect(patchAdminAiModel).not.toHaveBeenCalled();
  });

  it('un retrait refusé nomme les rôles, les usages et les chaînes de repli qui l’emploient', async () => {
    vi.mocked(patchAdminAiModel).mockRejectedValue(new ApiError(409, {
      code: 'ai.model_in_use',
      uses: { roles: ['redaction'], usages: ['radar.extraction'], fallback_roles: ['vision'] },
    }));
    renderPanel();

    await userEvent.click(within(await ligne('modele-neuf')).getByRole('button', { name: 'Retirer modele-neuf' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('il ne peut pas être retiré');
    expect(alerte).toHaveTextContent('Chaînes réglées ici : Rédaction.');
    expect(alerte).toHaveTextContent('Modèle forcé de : radar.extraction.');
    expect(alerte).toHaveTextContent('Chaînes de repli de la configuration : Vision.');
  });

  it('une ligne qui remplace la configuration y revient, et seule celle-là', async () => {
    vi.mocked(fetchAdminAiModels).mockResolvedValue(reponse(configuration, ajoute, remplace));
    renderPanel();

    await userEvent.click(within(await ligne('modele-b')).getByRole('button', { name: 'Revenir au tarif de la configuration pour modele-b' }));
    expect(deleteAdminAiModel).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revenir à la configuration' }));

    expect(deleteAdminAiModel).toHaveBeenCalledWith(9);
    expect(within(await ligne('modele-a')).queryByRole('button', { name: /Revenir/ })).not.toBeInTheDocument();
  });

  it('le retour d’un modèle retiré dit qu’il le rétablit, et s’annule sans rien écrire', async () => {
    vi.mocked(fetchAdminAiModels).mockResolvedValue(reponse({ ...remplace, active: false }));
    renderPanel();

    await userEvent.click(within(await ligne('modele-b')).getByRole('button', { name: 'Revenir au tarif de la configuration pour modele-b' }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent('Ce modèle a été retiré : y revenir le rétablit');
    await userEvent.click(within(dialogue).getByRole('button', { name: 'Annuler' }));
    expect(deleteAdminAiModel).not.toHaveBeenCalled();
  });

  it('le retour d’un modèle actif ne parle pas de rétablir', async () => {
    vi.mocked(fetchAdminAiModels).mockResolvedValue(reponse(remplace));
    renderPanel();

    await userEvent.click(within(await ligne('modele-b')).getByRole('button', { name: 'Revenir au tarif de la configuration pour modele-b' }));

    expect(await screen.findByRole('dialog')).not.toHaveTextContent('le rétablit');
  });

  it('une ligne ajoutée ici ne propose aucun retour : elle n’a pas de configuration où revenir', async () => {
    vi.mocked(fetchAdminAiModels).mockResolvedValue(reponse(ajoute));
    renderPanel();

    expect(within(await ligne('modele-neuf')).queryByRole('button', { name: /Revenir/ })).not.toBeInTheDocument();
  });

  it('un modèle retiré encore employé le dit, en nommant ses emplois, sans atténuer l’avertissement', async () => {
    const employe: AiCatalogueModel = { ...retire, uses: { roles: ['redaction'], usages: ['radar.extraction'], fallback_roles: [] } };
    vi.mocked(fetchAdminAiModels).mockResolvedValue(reponse(employe, ajoute));
    renderPanel();

    const modele = await ligne('modele-retire');
    expect(modele).toHaveTextContent('Retiré, mais encore employé : Rédaction, radar.extraction.');
    expect(modele).not.toHaveClass('opacity-60');
    expect(await ligne('modele-neuf')).not.toHaveTextContent('encore employé');
  });

  it('le titre d’un identifiant long se coupe, et la colonne du dialogue ne s’élargit pas à son contenu', async () => {
    const long = 'x'.repeat(255);
    vi.mocked(fetchAdminAiModels).mockResolvedValue(reponse({ ...ajoute, model: long }));
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: `Corriger le tarif de ${long}` }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveClass('grid-cols-[minmax(0,1fr)]');
    expect(within(dialogue).getByRole('heading')).toHaveClass('pr-6', 'break-all');
  });

  it('le formulaire dit que l’identifiant est celui du fournisseur et qu’un tarif nul veut dire gratuit', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un modèle' }));

    expect(screen.getByText(/L’identifiant exact du fournisseur/)).toBeInTheDocument();
    expect(screen.getByText(/« gratuit au token », et non « inconnu »/)).toBeInTheDocument();
  });

  it('un tarif absent bloque l’ajout, un tarif nul passe, en chaînes jamais arrondies', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un modèle' }));

    await userEvent.type(screen.getByLabelText('Identifiant du modèle'), 'editeur/modele:gratuit');
    await userEvent.type(screen.getByLabelText('Entrée ($/M tokens)'), '0,00000000004');
    await userEvent.type(screen.getByLabelText('Sortie ($/M tokens)'), '0');
    await userEvent.type(screen.getByLabelText('Lecture en cache ($/M tokens)'), '0');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Écriture en cache ($/M tokens)'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(postAdminAiModel).toHaveBeenCalledWith({
      provider: 'anthropic', model: 'editeur/modele:gratuit', input: '0.00000000004', output: '0', cache_read: '0', cache_write: '0',
    });
  });

  it('corriger un tarif d’une ligne de la console la modifie', async () => {
    renderPanel();
    await userEvent.click(within(await ligne('modele-neuf')).getByRole('button', { name: 'Corriger le tarif de modele-neuf' }));

    expect(screen.queryByLabelText('Identifiant du modèle')).not.toBeInTheDocument();
    const entree = screen.getByLabelText('Entrée ($/M tokens)');
    expect(entree).toHaveValue('0.00000000004');
    await userEvent.clear(entree);
    await userEvent.type(entree, '1.5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(patchAdminAiModel).toHaveBeenCalledWith(7, { input: '1.5', output: '0', cache_read: '0', cache_write: '0' });
  });

  it('corriger un tarif d’un modèle de la configuration crée sa ligne', async () => {
    renderPanel();
    await userEvent.click(within(await ligne('modele-a')).getByRole('button', { name: 'Corriger le tarif de modele-a' }));

    const entree = screen.getByLabelText('Entrée ($/M tokens)');
    await userEvent.clear(entree);
    await userEvent.type(entree, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(postAdminAiModel).toHaveBeenCalledWith({ provider: 'anthropic', model: 'modele-a', ...tarifs, input: '3' });
  });
});
