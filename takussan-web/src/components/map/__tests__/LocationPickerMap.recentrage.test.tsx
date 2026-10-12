import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';

import { LocationPickerMap } from '../LocationPickerMap';

/**
 * TCK-633 — `center` de `MapContainer` n'est lu qu'au montage. Une position collée, ou une ville
 * choisie après coup, doit DÉPLACER la carte : sinon le marqueur se pose hors de la vue, et
 * l'utilisateur croit que rien ne s'est passé.
 */
afterEach(() => vi.restoreAllMocks());

function centres(espion: { readonly mock: { readonly calls: readonly unknown[][] } }): string[] {
  return espion.mock.calls.map((appel) => {
    const c = L.latLng(appel[0] as L.LatLngExpression);
    return `${c.lat},${c.lng}`;
  });
}

describe('LocationPickerMap — le recentrage', () => {
  it('se centre sur la ville choisie APRÈS le montage', () => {
    const espion = vi.spyOn(L.Map.prototype, 'setView');
    const { rerender } = render(<LocationPickerMap lat={null} lng={null} onChange={() => {}} />);
    espion.mockClear();

    rerender(<LocationPickerMap lat={null} lng={null} centre={{ latitude: 14.7915, longitude: -16.9359 }} onChange={() => {}} />);

    expect(centres(espion)).toContain('14.7915,-16.9359');
  });

  it('suit une position posée hors de la vue', () => {
    const espion = vi.spyOn(L.Map.prototype, 'setView');
    const { rerender } = render(<LocationPickerMap lat={14.69} lng={-17.44} onChange={() => {}} />);
    espion.mockClear();

    rerender(<LocationPickerMap lat={12.56} lng={-16.27} onChange={() => {}} />);

    expect(centres(espion)).toContain('12.56,-16.27');
  });
});
