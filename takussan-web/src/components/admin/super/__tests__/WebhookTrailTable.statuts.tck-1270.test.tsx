/**
 * TCK-1270 (P146.05) — le journal des webhooks d'une intégration traduit le statut de chaque ligne
 * par le dictionnaire existant (`superAdmin.payments.journal.statuses`), et ne rend la valeur brute
 * que pour un statut inconnu. L'API ne pose que quatre valeurs (`IntegrationWebhookLog.php`).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { AdminIntegration, IntegrationWebhookLog } from '@/types/super-admin';
import { WebhookTrailTable } from '../integrations';

const integration = { id: 7, provider: 'wave', label: 'Wave' } as AdminIntegration;

function ligne(id: number, status: string): IntegrationWebhookLog {
  return {
    id,
    status,
    direction: 'inbound',
    event_type: 'payment.succeeded',
    payload: {},
    processed_at: null,
    created_at: '2026-10-01T10:00:00+00:00',
  };
}

describe('WebhookTrailTable — statut traduit (TCK-1270, P146.05)', () => {
  it('chaque statut posé par l’API se lit par son libellé, un inconnu reste brut', () => {
    const { container } = render(
      withIntl(
        <WebhookTrailTable
          integration={integration}
          logs={[ligne(1, 'received'), ligne(2, 'processed'), ligne(3, 'rejected'), ligne(4, 'failed'), ligne(5, 'inconnu')]}
          loading={false}
          error={null}
          onClose={() => {}}
        />,
      ),
    );

    const badges = [...container.querySelectorAll('[data-slot="badge"]')].map((b) => b.textContent);
    const libelles = fr.superAdmin.payments.journal.statuses;
    expect(badges).toEqual([libelles.received, libelles.processed, libelles.rejected, libelles.failed, 'inconnu']);
  });
});

describe('AgencyUpgradeRequestStatus — une seule déclaration (TCK-1270, P146.05)', () => {
  it('le type n’est déclaré qu’une fois dans `src`', () => {
    const racine = resolve(__dirname, '../../../..');
    const declarations: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) {
          if (nom !== '__tests__' && nom !== 'node_modules') parcourir(chemin);
        } else if (/\.tsx?$/.test(nom) && /export type AgencyUpgradeRequestStatus\s*=/.test(readFileSync(chemin, 'utf8'))) {
          declarations.push(chemin.slice(racine.length + 1));
        }
      }
    };
    parcourir(racine);
    expect(declarations).toEqual(['types/agency-upgrade.ts']);
  });
});
