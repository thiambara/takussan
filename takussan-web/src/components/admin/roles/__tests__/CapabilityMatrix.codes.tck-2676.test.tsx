import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CapabilityCatalogue } from '@/types/agency-role';
import { CapabilityMatrix } from '../CapabilityMatrix';

/**
 * TCK-2676 — « des mots et non des codes » sur la matrice des rôles.
 *
 * Le catalogue est lu dans la SOURCE de l'API (`App\Models\Enums\Capability`, et l'inventaire des
 * capacités sans effet), à la manière des `*.parity.test.ts` : un cas ajouté côté serveur sans son
 * libellé côté front s'afficherait « Autre capacité » — ce test rougit avant.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que les libellés soient justes, ni que l'infobulle s'affiche au
 * survol (jsdom ne rend pas les `title`) — il tient qu'elle est posée.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const ENUM = join(ROOT, 'takussan-api', 'app', 'Models', 'Enums', 'Capability.php');
const INVENTAIRE = join(ROOT, 'takussan-api', 'app', 'Services', 'Membership', 'CapabilityEnforcementInventory.php');

function catalogueDuBack(): { catalogue: CapabilityCatalogue; codes: string[] } {
  const php = readFileSync(ENUM, 'utf8');
  expect(php, `enum Capability introuvable dans ${ENUM}`).toContain('enum Capability: string');
  const codes = [...php.matchAll(/case\s+\w+\s*=\s*'([a-z_]+\.[a-z_]+)';/g)].map((m) => m[1]);
  expect(codes.length, 'aucun cas extrait de Capability — la garde n’aurait rien vérifié').toBeGreaterThan(40);

  const reservees = [...(php.match(/function platformReserved\(\)[\s\S]*?\];/)?.[0] ?? '').matchAll(/self::(\w+)/g)]
    .map(([, cas]) => php.match(new RegExp(`case\\s+${cas}\\s*=\\s*'([^']+)'`))?.[1])
    .filter((c): c is string => Boolean(c));
  expect(reservees.length).toBeGreaterThan(0);

  const inventaire = readFileSync(INVENTAIRE, 'utf8');
  const bloc = inventaire.match(/const AWAITING = \[([\s\S]*?)\];/)?.[1] ?? '';
  const sansEffet = [...bloc.matchAll(/'([a-z_]+\.[a-z_]+)'\s*=>/g)].map((m) => m[1]);
  expect(sansEffet.length).toBeGreaterThan(0);

  const domaines = [...new Set(codes.map((c) => c.split('.')[0]))];
  return {
    codes,
    catalogue: {
      domains: domaines.map((domain) => ({
        domain,
        capabilities: codes.filter((c) => c.startsWith(`${domain}.`)),
      })),
      total: codes.length,
      platform_reserved: reservees,
      not_enforced: sansEffet.map((capability) => ({ capability, ticket: 'D-69' })),
    },
  };
}

const { catalogue: CATALOGUE, codes: CODES } = catalogueDuBack();
const RESERVEES = new Set(CATALOGUE.platform_reserved);
const SANS_EFFET = new Set((CATALOGUE.not_enforced ?? []).map((r) => r.capability));
const ATTRIBUABLES = CODES.filter((c) => !RESERVEES.has(c) && !SANS_EFFET.has(c));

describe('<CapabilityMatrix> — des mots et non des codes (TCK-2676)', () => {
  it('AC1 — aucun code `domaine.verbe` dans le texte visible ; chaque code au survol de sa ligne', () => {
    const { container } = render(
      withIntl(<CapabilityMatrix catalogue={CATALOGUE} value={[]} onChange={vi.fn()} />),
    );

    const texte = container.textContent ?? '';
    const brutsALEcran = CODES.filter((code) => texte.includes(code));
    expect(brutsALEcran, 'codes rendus tels quels').toEqual([]);
    // Ni code, ni repli : chaque cas de l'enum a son libellé (et son domaine).
    expect(screen.queryAllByText('Autre capacité'), 'capacités sans libellé au dictionnaire').toEqual([]);
    for (const { domain } of CATALOGUE.domains) {
      expect(screen.queryByText(domain), `domaine « ${domain} » sans libellé`).not.toBeInTheDocument();
    }

    for (const code of CODES) {
      const ligne = container.querySelector(`label[data-capability="${code}"]`);
      expect(ligne, code).toHaveAttribute('title', code);
      // Sur la case aussi : c'est elle que le lecteur d'écran annonce, le `title` en description.
      expect(ligne?.querySelector('input[type="checkbox"]'), code).toHaveAttribute('title', code);
    }
  });

  it('AC2 — le compte ne porte que les capacités qui agissent ; les sans effet sont désactivées, en bas, raison écrite', () => {
    const { container } = render(
      withIntl(<CapabilityMatrix catalogue={CATALOGUE} value={[...CODES]} onChange={vi.fn()} />),
    );

    expect(screen.getByTestId('capability-matrix-count')).toHaveTextContent(
      `${ATTRIBUABLES.length} sur ${ATTRIBUABLES.length} capacités accordées`,
    );

    for (const code of SANS_EFFET) {
      if (RESERVEES.has(code)) continue;
      const ligne = container.querySelector(`label[data-capability="${code}"]`) as HTMLElement;
      expect(ligne.querySelector('input'), code).toBeDisabled();
      expect(screen.getByTestId(`capability-not-enforced-reason-${code}`)).toHaveTextContent(
        "Aucun geste de l'application ne vérifie encore cette capacité",
      );
      // En bas de son domaine : aucune capacité attribuable ne la suit dans la liste.
      const suivantes: string[] = [];
      for (let li = ligne.closest('li')?.nextElementSibling; li; li = li.nextElementSibling) {
        suivantes.push(li.querySelector('label')?.getAttribute('data-capability') ?? '');
      }
      expect(suivantes.filter((c) => !SANS_EFFET.has(c)), `${code} n'est pas en bas de son domaine`).toEqual([]);
    }

    // Un domaine dont rien n'agit (la messagerie) ne lit pas « 0/0 ».
    expect(container.textContent).not.toContain('0/0');
  });

  it('les raccourcis ne retirent ni n’ajoutent une capacité sans effet : aucun droit ne change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const accordee = [...SANS_EFFET].find((c) => !RESERVEES.has(c)) as string;
    render(
      withIntl(<CapabilityMatrix catalogue={CATALOGUE} value={[accordee]} onChange={onChange} />),
    );

    await user.click(screen.getByRole('button', { name: 'Tout décocher' }));
    expect(onChange).toHaveBeenLastCalledWith([accordee]);

    await user.click(screen.getByRole('button', { name: 'Tout cocher' }));
    const emis = onChange.mock.lastCall?.[0] as string[];
    expect([...emis].sort()).toEqual([accordee, ...ATTRIBUABLES].sort());
  });
});
