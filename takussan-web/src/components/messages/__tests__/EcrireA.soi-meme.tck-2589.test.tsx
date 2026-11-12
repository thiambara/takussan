/**
 * TCK-2589 — `EcrireA` ne se rend jamais vers soi-même : on ne s'écrit pas, et depuis TCK-2632
 * `filter[participant]=<soi>` rend 422 — le geste ouvrirait un brouillon vers son propre compte.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { EcrireA } from '../EcrireA';

const auth = vi.hoisted(() => ({ user: { id: 5 } as { id: number } | null }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: auth.user, isLoading: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/queries/conversations', () => ({ useTrouverLeFilDirect: () => vi.fn() }));
vi.mock('@/components/messages/BrouillonDirect', () => ({ BrouillonDirect: () => null }));

const rendu = (id: number | null) => render(withIntl(<EcrireA personne={{ id, nom: 'Awa Sarr' }} libelle="Écrire" titre="Écrire à Awa Sarr" />));

describe('EcrireA', () => {
  it('vers un autre compte : le geste', () => {
    auth.user = { id: 5 };
    rendu(42);
    expect(screen.getByRole('button', { name: 'Écrire' })).toBeInTheDocument();
  });

  it('vers soi-même : rien', () => {
    auth.user = { id: 42 };
    rendu(42);
    expect(screen.queryByRole('button', { name: 'Écrire' })).toBeNull();
  });

  it('sans compte : rien', () => {
    auth.user = { id: 5 };
    rendu(null);
    expect(screen.queryByRole('button', { name: 'Écrire' })).toBeNull();
  });
});
