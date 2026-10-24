import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { KycEcheance } from '../KycEcheance';

/**
 * TCK-1453 (P163.02) — le dossier échoit le jour d'échéance à 00:00 (`KycWorkflowService::expiryOf`)
 * et passe « Expirée » ce jour-là : « valable jusqu'au » nomme donc la VEILLE, dernier jour où la
 * vérification vaut. La pièce, elle, garde « Expire le » et sa date.
 */
describe('<KycEcheance kind="dossier"> — « valable jusqu’au » la veille de l’échéance', () => {
  afterEach(() => vi.useRealTimers());

  it('échéance lointaine au 25 : valable jusqu’au 24', () => {
    vi.useFakeTimers({ now: new Date('2026-06-01T10:00:00Z'), toFake: ['Date'] });
    render(withIntl(<KycEcheance kind="dossier" value="2026-10-25T00:00:00.000000Z" />));
    expect(screen.getByTestId('kyc-echeance-valid')).toHaveTextContent("Vérification valable jusqu'au 24 oct. 2026");
  });

  it('échéance proche au 25 : valable jusqu’au 24, signalée', () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T10:00:00Z'), toFake: ['Date'] });
    render(withIntl(<KycEcheance kind="dossier" value="2026-10-25T00:00:00.000000Z" />));
    expect(screen.getByTestId('kyc-echeance-soon')).toHaveTextContent("Vérification valable jusqu'au 24 oct. 2026");
  });

  it('le jour même, « Échue le 25 » : la règle d’expiration ne change pas', () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T10:00:00Z'), toFake: ['Date'] });
    render(withIntl(<KycEcheance kind="dossier" value="2026-10-25T00:00:00.000000Z" />));
    expect(screen.getByTestId('kyc-echeance-expired')).toHaveTextContent('Échue le 25 oct. 2026');
  });

  it('une pièce garde sa date : « Expire le 25 »', () => {
    vi.useFakeTimers({ now: new Date('2026-06-01T10:00:00Z'), toFake: ['Date'] });
    render(withIntl(<KycEcheance value="2026-10-25" />));
    expect(screen.getByTestId('kyc-echeance-valid')).toHaveTextContent('Expire le 25 oct. 2026');
  });
});
