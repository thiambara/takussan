import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { AgencyQueues } from '../AgencyQueues';
import { TAB_VALUES } from '@/components/admin/finances/AdminFinancesTabs';

const mockFetchKyc = vi.fn();
const mockFetchModeration = vi.fn();
const mockApiRequest = vi.fn();

vi.mock('@/lib/queries/kyc', () => ({
  fetchAgencyKyc: (...args: unknown[]) => mockFetchKyc(...args),
}));

vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: (...args: unknown[]) => mockFetchModeration(...args),
}));

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'jeton-de-test', isLoading: false }),
}));

function monte(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

/**
 * `findByTestId` ne suffit PAS ici : chaque ligne existe DÈS le premier rendu, avec son libellé de
 * chargement. Elle résoudrait donc immédiatement, sur l'état d'avant la réponse. C'est la valeur
 * qu'on attend, pas l'élément.
 */
function attendValeur(id: string, texte: string | RegExp) {
  return waitFor(() => expect(screen.getByTestId(`queue-value-${id}`)).toHaveTextContent(texte));
}

/** Une réponse paginée dont la LISTE est vide mais dont `meta.total` ne l'est pas. */
function page(total: number) {
  return { data: [], meta: { total, current_page: 1, last_page: 1, per_page: 1 } };
}

describe('<AgencyQueues>', () => {
  beforeEach(() => {
    mockFetchKyc.mockReset();
    mockFetchModeration.mockReset();
    mockApiRequest.mockReset();
    mockFetchKyc.mockResolvedValue({ data: { id: 1, status: 'pending' } });
    mockFetchModeration.mockResolvedValue({ ...page(4), meta: { ...page(4).meta, pending_count: 4 } });
    mockApiRequest.mockResolvedValue(page(2));
  });

  it('rend les quatre files, chacune atteignable en un clic vers l’écran qui la traite', async () => {
    const { container } = monte(
      <AgencyQueues agencyId={7} agencyIsStandard overdueCount={3} />,
    );

    // Les quatre lignes sont là.
    for (const id of ['kyc', 'moderation', 'invitations', 'overdue']) {
      expect(await screen.findByTestId(`queue-row-${id}`)).toBeInTheDocument();
    }

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/admin/agency/kyc',
      '/admin/moderation/properties',
      '/admin/team',
      // ⚠ `?tab=impayes` fait partie de l'AC, pas de la décoration : `AdminFinancesTabs` ouvre
      // sinon sur « encaissements », et la ligne mènerait à côté de ce qu'elle annonce.
      '/admin/finances?tab=impayes',
    ]);

    // Toutes les destinations restent DANS la console : aucun lien ne sort vers `/app`.
    expect(hrefs.every((h) => h?.startsWith('/admin/'))).toBe(true);
  });

  it('le lien « impayés » vise un onglet qui EXISTE, vérifié contre la table de `AdminFinancesTabs`', async () => {
    const { container } = monte(<AgencyQueues agencyId={7} agencyIsStandard overdueCount={1} />);
    await screen.findByTestId('queue-row-overdue');

    const href = Array.from(container.querySelectorAll('a'))
      .map((a) => a.getAttribute('href') ?? '')
      .find((h) => h.startsWith('/admin/finances'));
    const onglet = new URL(href ?? '', 'https://x.test').searchParams.get('tab');

    // Un `?tab=` inconnu retombe en SILENCE sur « encaissements » (`isTabValue`) : le lien
    // mènerait à côté de ce que la ligne annonce, sans rien casser de visible.
    expect(TAB_VALUES as readonly string[]).toContain(onglet);
    expect(onglet).toBe('impayes');
  });

  it('lit le compte dans `meta.total`, jamais dans la liste rapatriée (AC4)', async () => {
    monte(<AgencyQueues agencyId={7} agencyIsStandard overdueCount={0} />);

    // `data` est VIDE et `meta.total` vaut 4 / 2. Un compteur dérivé de `data.length` rendrait
    // « Rien à traiter » sur les deux lignes — c'est exactement l'ablation de cet AC.
    await attendValeur('moderation', '4 biens à modérer');
    await attendValeur('invitations', '2 invitations en attente');

    // Et le compte est demandé au SERVEUR, sur une page d'un élément.
    expect(mockFetchModeration).toHaveBeenCalledWith('jeton-de-test', { perPage: 1 });
    const url = String(mockApiRequest.mock.calls[0][0]);
    expect(url).toContain('per_page=1');
    expect(url).toContain(`filter${encodeURIComponent('[status]')}=sent`);
  });

  it('dit qu’une file est VIDE, et le dit autrement qu’un compte INDISPONIBLE (AC2)', async () => {
    mockFetchModeration.mockResolvedValue(page(0));
    mockApiRequest.mockRejectedValue(new Error('boom'));

    monte(<AgencyQueues agencyId={7} agencyIsStandard overdueCount={0} />);

    // File vide : la ligne RESTE affichée, et elle dit qu'il n'y a rien.
    await attendValeur('moderation', 'Rien à traiter');
    expect(screen.getByTestId('queue-row-moderation')).toBeInTheDocument();
    expect(screen.getByTestId('queue-value-overdue')).toHaveTextContent('Rien à traiter');

    // Compte indisponible : un libellé DIFFÉRENT. Les deux rendraient « 0 » si on affichait le
    // nombre nu — et « 0 » sur une panne est un mensonge tranquille.
    await attendValeur('invitations', 'Compte indisponible');
  });

  it('en agence `individual`, ne rend NI la modération NI les invitations (AC3)', async () => {
    monte(<AgencyQueues agencyId={7} agencyIsStandard={false} overdueCount={1} />);

    // On attend que le dossier KYC ait répondu, pour que le « Compte indisponible » de CHARGEMENT
    // ne soit plus dans le document quand on affirme qu'il n'y en a aucun.
    await attendValeur('kyc', 'Dossier à compléter');

    expect(screen.getByTestId('queue-row-overdue')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-row-moderation')).not.toBeInTheDocument();
    expect(screen.queryByTestId('queue-row-invitations')).not.toBeInTheDocument();

    // L'absence ne se lit pas comme une erreur : aucun « Compte indisponible » n'est rendu à leur
    // place — la ligne n'existe simplement pas.
    expect(screen.queryByText('Compte indisponible')).not.toBeInTheDocument();

    // Et surtout : AUCUNE requête n'est émise pour ces deux files. Rendre la ligne à `null` en
    // laissant la requête partir donnerait un 403 par minute, invisible à l'écran.
    expect(mockFetchModeration).not.toHaveBeenCalled();
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('sur un `kind` INCONNU, garde les files : l’inconnu n’est pas un `individual`', async () => {
    monte(<AgencyQueues agencyId={7} agencyIsStandard={undefined} overdueCount={0} />);

    expect(await screen.findByTestId('queue-row-moderation')).toBeInTheDocument();
    expect(screen.getByTestId('queue-row-invitations')).toBeInTheDocument();
  });

  it('rend le STATUT du dossier KYC, et ne signale un geste que quand il y en a un', async () => {
    mockFetchKyc.mockResolvedValue({ data: { id: 1, status: 'submitted' } });
    const { unmount } = monte(<AgencyQueues agencyId={7} agencyIsStandard overdueCount={0} />);

    // `submitted` : le dossier est chez la plateforme. Ton `info`, pas `attention` — l'agence
    // n'a rien à faire, et l'afficher comme une tâche fabriquerait une file qui n'existe pas.
    await attendValeur('kyc', "En cours d'examen");
    expect(screen.getByTestId('queue-value-kyc')).toHaveAttribute('data-tone', 'info');
    unmount();

    mockFetchKyc.mockResolvedValue({ data: { id: 1, status: 'rejected' } });
    monte(<AgencyQueues agencyId={7} agencyIsStandard overdueCount={0} />);
    await attendValeur('kyc', 'Dossier à corriger');
    expect(screen.getByTestId('queue-value-kyc')).toHaveAttribute('data-tone', 'danger');
  });

  it('sans agence résolue, ne demande pas le dossier KYC', async () => {
    monte(<AgencyQueues agencyId={null} agencyIsStandard overdueCount={0} />);

    // La ligne reste, et elle dit qu'on ne sait pas — elle n'invente pas un statut.
    await attendValeur('moderation', '4 biens à modérer');
    expect(screen.getByTestId('queue-value-kyc')).toHaveTextContent('Compte indisponible');
    expect(mockFetchKyc).not.toHaveBeenCalled();
  });

  it('n’affiche aucune clé i18n brute', async () => {
    monte(<AgencyQueues agencyId={7} agencyIsStandard overdueCount={2} />);
    await attendValeur('moderation', /modérer/);
    await attendValeur('kyc', 'Dossier à compléter');
    attendAucuneCleBrute();
  });
});
