import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { AutourDeMoi, RAYON_PAR_DEFAUT_KM } from '../AutourDeMoi';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';

/**
 * TCK-346 — la commande de rayon, et le refus comme ÉTAT.
 *
 * | test | régression attrapée | pourquoi une régression ne le cocherait pas |
 * |---|---|---|
 * | position obtenue | le patch qui n'emporte pas le rayon | `radius_km` manquerait, et `normaliserGeo` effacerait le point à la sérialisation |
 * | refus rendu | un `throw` ou un `console.error` à la place d'un message | rien ne s'afficherait, et l'utilisateur croirait au silence |
 * | API absente | l'accès direct à `navigator.geolocation` | jsdom n'en a pas : le composant lèverait au lieu de rendre `unavailable` |
 * | rayon actif re-cliqué | un `radius_km: undefined` qui laisse le point | le point survivrait, invisible, dans l'URL et dans les recherches sauvegardées |
 * | trois langues | une clé absente de `en`/`wo` | le deep-merge de `src/i18n/request.ts` rendrait le FRANÇAIS sans erreur ni test rouge |
 */

function geolocalisationQuiRepond(coords: { latitude: number; longitude: number }) {
  return {
    getCurrentPosition: vi.fn((ok: PositionCallback) =>
      ok({ coords, timestamp: 0 } as unknown as GeolocationPosition)),
  };
}

function geolocalisationQuiEchoue(code: number) {
  return {
    getCurrentPosition: vi.fn((_ok: PositionCallback, ko?: PositionErrorCallback | null) =>
      ko?.({ code, message: '' } as GeolocationPositionError)),
  };
}

describe('<AutourDeMoi> — poser le point', () => {
  it('pose le point ET un rayon par défaut : un point seul ne filtrerait rien', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(
      <AutourDeMoi
        lat={undefined} lng={undefined} radiusKm={undefined}
        onChange={onChange}
        geolocalisation={geolocalisationQuiRepond({ latitude: 14.6928, longitude: -17.4467 })}
      />,
    ));

    await user.click(screen.getByRole('button', { name: fr.search.filters.aroundMe.use }));

    expect(onChange).toHaveBeenCalledWith({
      lat: 14.6928, lng: -17.4467, radius_km: RAYON_PAR_DEFAUT_KM,
    });
  });

  it('CONSERVE le rayon choisi quand on actualise la position', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(
      <AutourDeMoi
        lat={14.5} lng={-17.1} radiusKm={25}
        onChange={onChange}
        geolocalisation={geolocalisationQuiRepond({ latitude: 14.6, longitude: -17.2 })}
      />,
    ));

    await user.click(screen.getByRole('button', { name: fr.search.filters.aroundMe.change }));

    expect(onChange).toHaveBeenCalledWith({ lat: 14.6, lng: -17.2, radius_km: 25 });
  });
});

describe('<AutourDeMoi> — le refus est un chemin, pas une exception', () => {
  it('rend le message de refus et ne pose AUCUN filtre', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(
      <AutourDeMoi
        lat={undefined} lng={undefined} radiusKm={undefined}
        onChange={onChange}
        geolocalisation={geolocalisationQuiEchoue(1)}
      />,
    ));

    await user.click(screen.getByRole('button', { name: fr.search.filters.aroundMe.use }));

    expect(screen.getByRole('status')).toHaveTextContent(fr.search.filters.aroundMe.denied);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('distingue une PANNE d’un refus', async () => {
    const user = userEvent.setup();
    render(withIntl(
      <AutourDeMoi
        lat={undefined} lng={undefined} radiusKm={undefined}
        onChange={vi.fn()}
        geolocalisation={geolocalisationQuiEchoue(3 /* TIMEOUT */)}
      />,
    ));

    await user.click(screen.getByRole('button', { name: fr.search.filters.aroundMe.use }));

    expect(screen.getByRole('status')).toHaveTextContent(fr.search.filters.aroundMe.failed);
  });

  it('rend « indisponible » quand le navigateur n’a pas l’API — cas de jsdom', async () => {
    const user = userEvent.setup();
    // Aucune `geolocalisation` injectée, et jsdom n'expose pas `navigator.geolocation` :
    // c'est le chemin réel d'un navigateur sans l'API, pas une simulation.
    render(withIntl(
      <AutourDeMoi
        lat={undefined} lng={undefined} radiusKm={undefined} onChange={vi.fn()}
      />,
    ));

    await user.click(screen.getByRole('button', { name: fr.search.filters.aroundMe.use }));

    expect(screen.getByRole('status')).toHaveTextContent(fr.search.filters.aroundMe.unavailable);
  });
});

describe('<AutourDeMoi> — le rayon', () => {
  it('change le rayon sans toucher au point', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(
      <AutourDeMoi lat={14.69} lng={-17.44} radiusKm={5} onChange={onChange} />,
    ));

    await user.click(screen.getByRole('button', { name: '10 km' }));

    expect(onChange).toHaveBeenCalledWith({ radius_km: 10 });
  });

  it('retire la géographie ENTIÈRE quand on re-clique le rayon actif', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(
      <AutourDeMoi lat={14.69} lng={-17.44} radiusKm={5} onChange={onChange} />,
    ));

    await user.click(screen.getByRole('button', { name: '5 km' }));

    // Retirer le rayon seul laisserait un point sans consommateur : invisible dans l'interface,
    // et pourtant enregistré dans l'URL puis dans la recherche sauvegardée.
    expect(onChange).toHaveBeenCalledWith({ radius_km: undefined, lat: undefined, lng: undefined });
  });

  it('n’offre le choix du rayon QU’UNE FOIS le point posé', () => {
    render(withIntl(
      <AutourDeMoi lat={undefined} lng={undefined} radiusKm={undefined} onChange={vi.fn()} />,
    ));
    expect(screen.queryByRole('button', { name: '5 km' })).toBeNull();
  });
});

describe('TCK-346 — les trois langues, que le deep-merge rendrait invisibles', () => {
  /**
   * `src/i18n/request.ts` fusionne `fr` SOUS chaque locale : une clé absente de `en` ou de `wo`
   * s'affiche en français, sans erreur, sans avertissement et sans test rouge. Comparer les
   * libellés rendus au dictionnaire FRANÇAIS est donc le seul signal disponible.
   */
  it.each([
    ['en', en.search.filters.aroundMe.denied],
    ['wo', wo.search.filters.aroundMe.denied],
  ] as const)('rend le refus en %s, et pas le repli français', async (locale, attendu) => {
    const user = userEvent.setup();
    const { unmount } = render(withIntl(
      <AutourDeMoi
        lat={undefined} lng={undefined} radiusKm={undefined}
        onChange={vi.fn()}
        geolocalisation={geolocalisationQuiEchoue(1)}
      />,
      locale,
    ));

    const dictionnaire = locale === 'en' ? en : wo;
    await user.click(
      screen.getByRole('button', { name: dictionnaire.search.filters.aroundMe.use }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(attendu);
    expect(attendu).not.toBe(fr.search.filters.aroundMe.denied);
    unmount();
  });
});
