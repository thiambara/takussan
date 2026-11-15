import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { CE_QUE_CA_DEBLOQUE, lignesDeDeblocage, type LigneDeDeblocage } from '@/lib/pieces/ce-que-ca-debloque';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import { CeQueCaDebloque, VosPieces } from '../VosPieces';

/**
 * TCK-2947 — « Vos pièces » : « Ce que ça débloque » ne rend que les lignes qu'une règle de l'API tient
 * (`CE_QUE_CA_DEBLOQUE`, chacune avec sa citation), et la phrase de vérification ne promet aucun délai ni vérificateur
 * qu'aucune règle ne tient (relevé du ticket).
 */
const reseau = vi.hoisted(() => ({
  pieces: [
    { code: 'cni', required: true, kind: 'file', state: 'missing', file: null },
    { code: 'rib', required: true, kind: 'file', state: 'missing', file: null },
    { code: 'ninea', required: false, kind: 'file_and_number', state: 'missing', file: null, number_masked: null },
  ],
}));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', activeProfileId: 'owner:3', user: { id: 5 } }) }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: undefined }) }));
vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: vi.fn(async (path: string) => {
      if (path === '/api/me/pieces') return { data: reseau.pieces };
      throw new Error(`requête inattendue : ${path}`);
    }),
  };
});

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<VosPieces />}</QueryClientProvider>));
}

describe('« Vos pièces » — TCK-2947', () => {
  it('AC1 — bailleur : l’aside rend EXACTEMENT les lignes déclarées (aucune règle ne les tient aujourd’hui), la légende reste', async () => {
    rendre();
    await waitFor(() => expect(document.querySelectorAll('[role="row"][data-piece]')).toHaveLength(3));
    const aside = document.querySelector('aside')!;
    const rendues = [...aside.querySelectorAll('[data-slot="ce-que-ca-debloque"] li')].map((li) => li.getAttribute('data-piece'));
    expect(rendues).toEqual(lignesDeDeblocage(['cni', 'rib', 'ninea']).map((l) => l.code));
    // La liste déclarée est vide (relevé du ticket) : ni la carte ni son titre ne paraissent.
    expect(CE_QUE_CA_DEBLOQUE).toEqual([]);
    expect(aside.querySelector('[data-slot="ce-que-ca-debloque"]')).toBeNull();
    expect(aside.querySelector('[data-slot="legende-des-etats"]')).not.toBeNull();
  });

  it('chaque ligne déclarée cite la règle de l’API qui la tient (fichier:ligne)', () => {
    for (const l of CE_QUE_CA_DEBLOQUE) expect(l.regle).toMatch(/^[\w/]+\.php:\d+(-\d+)?$/);
  });

  it('une ligne déclarée paraît pour un profil qui a la pièce, et pour lui seul, dans l’ordre de la liste', () => {
    const liste: LigneDeDeblocage[] = [
      { code: 'rib', regle: 'app/Exemple.php:1' },
      { code: 'license', regle: 'app/Exemple.php:2' },
      { code: 'cni', regle: 'app/Exemple.php:3' },
    ];
    expect(lignesDeDeblocage(['cni', 'rib', 'ninea'], liste).map((l) => l.code)).toEqual(['rib', 'cni']);
    render(withIntl(<CeQueCaDebloque lignes={lignesDeDeblocage(['cni', 'rib'], liste)} />));
    expect(screen.getByText('Ce que ça débloque')).toBeInTheDocument();
    expect([...document.querySelectorAll('[data-slot="ce-que-ca-debloque"] li')].map((li) => li.getAttribute('data-piece'))).toEqual([
      'rib',
      'cni',
    ]);
  });

  it('AC2 — aucun délai de vérification n’est une règle : ni « 48 h » ni vérificateur nommé, la variante sans délai', async () => {
    rendre();
    await waitFor(() => expect(screen.getAllByText('Vous pouvez utiliser votre espace en attendant.').length).toBeGreaterThan(0));
    expect(document.body.textContent).not.toMatch(/48\s*h|sous \d+|vérifie/i);
    expect(JSON.stringify(fr.pieces)).not.toMatch(/48\s*h/);
    expect(JSON.stringify(en.pieces)).not.toMatch(/48\s*h/);
  });
});
