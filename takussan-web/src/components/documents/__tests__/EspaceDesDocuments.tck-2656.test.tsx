/**
 * TCK-2656 — `/app/documents` selon le profil ACTIF : le personnel de l'agence garde la bibliothèque,
 * tout autre profil ouvre son coffre ; tant que les profils ne sont pas lus, ni l'un ni l'autre.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render as rendu, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { withIntl } from '@/test/intl';

const etat = { agence: null as number | null, enCours: false, vue: null as string | null };
const render = (ui: ReactElement) => rendu(withIntl(ui));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(etat.vue ? `vue=${etat.vue}` : '') }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ isPending: etat.enCours }) }));
vi.mock('@/hooks/usePersonnelActif', () => ({ useAgenceDuPersonnelActif: () => etat.agence }));
vi.mock('../DocumentsLibrary', () => ({
  DocumentsLibrary: ({ recherche }: { recherche?: boolean }) => <p>{recherche ? 'bibliothèque en recherche' : 'bibliothèque'}</p>,
}));
vi.mock('../coffre/CoffreDeDocuments', () => ({ CoffreDeDocuments: () => <p>coffre</p> }));

import { EspaceDesDocuments } from '../EspaceDesDocuments';

beforeEach(() => {
  etat.agence = null;
  etat.enCours = false;
  etat.vue = null;
});

describe('TCK-2656 — la bibliothèque ou le coffre', () => {
  it('le personnel actif d’une agence garde la bibliothèque, sous son en-tête', () => {
    etat.agence = 3;
    render(<EspaceDesDocuments enTeteDeLaBibliotheque={<h1>Bibliothèque de l’agence</h1>} />);
    expect(screen.getByText('bibliothèque')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bibliothèque de l’agence' })).toBeInTheDocument();
    expect(screen.queryByText('coffre')).not.toBeInTheDocument();
  });

  it('le locataire, le bailleur et le prestataire ouvrent leur coffre', () => {
    render(<EspaceDesDocuments enTeteDeLaBibliotheque={<h1>Bibliothèque de l’agence</h1>} />);
    expect(screen.getByText('coffre')).toBeInTheDocument();
    expect(screen.queryByText('bibliothèque')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bibliothèque de l’agence' })).not.toBeInTheDocument();
  });

  it('ni l’un ni l’autre tant que les profils se lisent', () => {
    etat.enCours = true;
    render(<EspaceDesDocuments enTeteDeLaBibliotheque={<h1>Bibliothèque de l’agence</h1>} />);
    expect(screen.queryByText('coffre')).not.toBeInTheDocument();
    expect(screen.queryByText('bibliothèque')).not.toBeInTheDocument();
  });
});

describe('TCK-2656, décision 2 (c) — la recherche des profils du coffre', () => {
  it('`?vue=recherche` rend au locataire la recherche serveur de ses documents, et le chemin du retour', () => {
    etat.vue = 'recherche';
    render(<EspaceDesDocuments enTeteDeLaBibliotheque={<h1>Bibliothèque de l’agence</h1>} />);
    expect(screen.getByText('bibliothèque en recherche')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Chercher un document' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour aux documents' })).toHaveAttribute('href', '/app/documents');
    expect(screen.queryByText('coffre')).not.toBeInTheDocument();
  });

  it('le personnel garde sa bibliothèque sous son propre en-tête, même avec `?vue=recherche`', () => {
    etat.vue = 'recherche';
    etat.agence = 3;
    render(<EspaceDesDocuments enTeteDeLaBibliotheque={<h1>Bibliothèque de l’agence</h1>} />);
    expect(screen.getByRole('heading', { name: 'Bibliothèque de l’agence' })).toBeInTheDocument();
    expect(screen.getByText('bibliothèque')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chercher un document' })).not.toBeInTheDocument();
  });
});
