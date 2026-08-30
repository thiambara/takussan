import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User, UserRole } from '@/types/user';

/**
 * TCK-379 — AC2, la moitié que le test de composant ne voit pas : LE CÂBLAGE.
 *
 * `InventoryList.test` éprouve que le bouton apparaît quand `canCreate` vaut `true`, et qu'il
 * disparaît sinon. Il resterait vert si la page passait `canCreate={false}` à tout le monde —
 * c'est-à-dire si le geste n'existait pour AUCUN rôle réel. C'est ici qu'on lit ce que la page
 * décide, rôle par rôle, à partir de §1.9 de `docs/features.md` (créer un inventaire : 🧑‍💼).
 */

const me = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => me.user }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));

const rendu = vi.hoisted(() => ({ dernierCanCreate: undefined as boolean | undefined }));
vi.mock('@/components/inventory', () => ({
  InventoryList: (props: { canCreate?: boolean }) => {
    rendu.dernierCanCreate = props.canCreate;
    return null;
  },
}));

async function canCreatePour(roles: UserRole[]): Promise<boolean | undefined> {
  me.user = { id: 1, roles } as unknown as User;
  rendu.dernierCanCreate = undefined;
  const { default: Page } = await import('../(liste)/page');
  const arbre = await Page();
  // On monte l'arbre sans DOM : le composant enfant enregistre sa prop au rendu.
  const { renderToStaticMarkup } = await import('react-dom/server');
  renderToStaticMarkup(arbre);
  return rendu.dernierCanCreate;
}

describe('/app/inventories — à qui la page ouvre le geste de création', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it.each(['agent', 'agency_admin', 'super_admin'] as UserRole[])(
    'ouvre la création à un %s',
    async (role) => {
      expect(await canCreatePour([role])).toBe(true);
    },
  );

  it.each(['customer', 'tenant', 'owner', 'service_provider'] as UserRole[])(
    'ne l’ouvre pas à un %s',
    async (role) => {
      // « Rien ici n'élargit un accès » : le bailleur n'apparaît en §1.9 que sur la SIGNATURE
      // (P2), pas sur la création. Sans cette moitié-là, un correctif qui mettrait
      // `canCreate` à `true` sans condition cocherait les trois tests ci-dessus.
      expect(await canCreatePour([role])).toBe(false);
    },
  );
});
