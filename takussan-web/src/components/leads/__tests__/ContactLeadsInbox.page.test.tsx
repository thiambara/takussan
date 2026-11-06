/**
 * TCK-2479 (revue, I1) — la page appartient au filtre. Le filtre vit dans `?filtre=` ; la pastille
 * « À traiter » du menu le change par un `<Link>`, SANS démonter la page. Une page gardée d'un autre
 * filtre lisait au-delà de la dernière : l'API rendait une page vide, la pagination (`last_page > 1`)
 * ne se rendait pas, et la demande annoncée par la pastille n'était visible nulle part.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { ContactLeadsInbox } from '../ContactLeadsInbox';

const LEAD = vi.hoisted(() => ({
  id: 1, property_id: 10, agency_id: 3, recipient_user_id: 7, channel: 'form', source: 'whatsapp', medium: 'share',
  name: 'Awa Diop', email: 'awa@example.sn', phone: '+221771234567', message: 'Bonjour', handled_at: null,
  handled_by_id: null, customer_id: null, created_at: '2026-10-01T09:00:00Z',
  property: { id: 10, title: 'Villa', slug: 'villa' }, recipient: { id: 7, first_name: 'Fatou', last_name: 'Ndiaye' },
}));
const etat = vi.hoisted(() => ({ recherche: '', lectures: [] as Array<[string, number]> }));

vi.mock('@/lib/queries/contact-leads', () => ({
  useContactLeads: (filtre: string, page: number) => {
    etat.lectures.push([filtre, page]);
    // « Toutes » : 5 pages ; « À traiter » et « Traitées » : une seule.
    const lastPage = filtre === 'all' ? 5 : 1;
    // Comme `paginate` de Laravel : une page au-delà de la dernière est VIDE.
    const vide = page > lastPage;
    return { data: { data: vide ? [] : [LEAD], meta: { total: 1, last_page: lastPage } }, isLoading: false, isError: false };
  },
  useContactLead: () => ({ data: undefined, isError: false }),
  useHandleLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConvertLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignLead: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.recherche),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/components/console/Pagination', () => ({
  Pagination: ({ onChange }: { onChange: (n: number) => void }) => (
    <button type="button" onClick={() => onChange(3)}>page-3</button>
  ),
}));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: { data: [] }, isLoading: false }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: ['agent'], agency_id: 3 } }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

beforeEach(() => {
  etat.recherche = 'filtre=all';
  etat.lectures = [];
});

describe('<ContactLeadsInbox> — la page appartient au filtre (TCK-2479, revue I1)', () => {
  it('la pastille (?filtre=todo) suivie depuis « Toutes » page 3 lit « À traiter » page 1, et montre la demande', () => {
    const { rerender } = render(withIntl(<ContactLeadsInbox />));
    fireEvent.click(screen.getByRole('button', { name: 'page-3' }));
    expect(etat.lectures.at(-1)).toEqual(['all', 3]);

    // `<Link href="/app/leads?filtre=todo">` : même page montée, autre `?filtre=`.
    etat.recherche = 'filtre=todo';
    rerender(withIntl(<ContactLeadsInbox />));

    expect(etat.lectures.at(-1)).toEqual(['todo', 1]);
    expect(etat.lectures).not.toContainEqual(['todo', 3]);
    expect(screen.getByText('Awa Diop')).toBeInTheDocument();
  });

  it('revenir au filtre d’avant par l’URL repart lui aussi de la page 1', () => {
    const { rerender } = render(withIntl(<ContactLeadsInbox />));
    fireEvent.click(screen.getByRole('button', { name: 'page-3' }));

    etat.recherche = 'filtre=todo';
    rerender(withIntl(<ContactLeadsInbox />));
    etat.recherche = 'filtre=all';
    rerender(withIntl(<ContactLeadsInbox />));

    expect(etat.lectures.at(-1)).toEqual(['all', 1]);
  });

  it('une page choisie sous un filtre qui ne change pas est gardée', () => {
    const { rerender } = render(withIntl(<ContactLeadsInbox />));
    fireEvent.click(screen.getByRole('button', { name: 'page-3' }));
    // Une autre clé de l'URL change (`?lead=`), pas le filtre.
    etat.recherche = 'filtre=all&lead=9';
    rerender(withIntl(<ContactLeadsInbox />));

    expect(etat.lectures.at(-1)).toEqual(['all', 3]);
  });
});
