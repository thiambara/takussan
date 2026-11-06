import { describe, expect, it } from 'vitest';
import { replierPourRecherche } from '@/components/ui/combobox';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { CATALOGUE } from '../catalogue';
import { decouperLesMots } from '../palette';

/**
 * TCK-2482 (A9) — les synonymes de la palette vivent dans les messages, par identifiant de destination.
 * Une clé qui ne nomme aucune destination (identifiant renommé, destination retirée) serait un synonyme
 * mort : la garde la refuse. Et l'AC2 tient à un mot : « loyer » ne doit mener qu'aux paiements.
 */
type Messages = { nav: { palette: { synonymes: Record<string, string> } } };
const IDS = new Set<string>(CATALOGUE.map((d) => d.id));
const LANGUES: [string, Messages][] = [['fr', fr as unknown as Messages], ['en', en as unknown as Messages], ['wo', wo as unknown as Messages]];

/** Les destinations dont un synonyme porte un mot qui COMMENCE par `debut` (la règle de A3). */
function porteurs(m: Messages, debut: string): string[] {
  return Object.entries(m.nav.palette.synonymes)
    .filter(([, v]) => decouperLesMots(v).some((s) => replierPourRecherche(s).split(' ').some((w) => w.startsWith(debut))))
    .map(([id]) => id);
}

describe('TCK-2482 — les synonymes de la palette', () => {
  it.each(LANGUES)('%s : chaque clé nomme une destination du catalogue', (_langue, m) => {
    expect(Object.keys(m.nav.palette.synonymes).filter((id) => !IDS.has(id))).toEqual([]);
  });

  it.each(LANGUES)('%s : aucun synonyme vide', (_langue, m) => {
    expect(Object.entries(m.nav.palette.synonymes).filter(([, v]) => decouperLesMots(v).length === 0)).toEqual([]);
  });

  it('AC2 — « loyer » ne mène qu’aux paiements (fr), « rent » de même (en)', () => {
    expect(porteurs(fr as unknown as Messages, 'loyer')).toEqual(['paiements']);
    expect(porteurs(en as unknown as Messages, 'rent')).toEqual(['paiements']);
  });

  it('« clients » mène au CRM', () => {
    expect(porteurs(fr as unknown as Messages, 'crm')).toContain('clients');
  });
});
