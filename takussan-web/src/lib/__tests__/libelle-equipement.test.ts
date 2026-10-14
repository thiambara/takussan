import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { libelleEquipement, slugDuCatalogue, type TraducteurDuCatalogue } from '@/lib/libelle-equipement';

/**
 * TCK-633 — « Les équipements du catalogue sont traduits par leur slug ; un équipement saisi par
 * un annonceur s'affiche tel quel. »
 *
 * Le catalogue vit dans l'API (`TagCatalog::EQUIPEMENTS`, chargé à chaque déploiement) ; ses
 * traductions vivent ici (`property.amenityCatalog.<slug>`). Ce test lit le fichier PHP : un
 * équipement ajouté au catalogue sans ses trois traductions rougit ici, au lieu de s'afficher en
 * français à l'anglophone.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SOURCE = readFileSync(join(ROOT, 'takussan-api', 'app', 'Services', 'Tags', 'TagCatalog.php'), 'utf8');

function equipementsDuCatalogue(): string[] {
  const bloc = /const EQUIPEMENTS = \[([\s\S]*?)\];/.exec(SOURCE)?.[1] ?? '';
  return [...bloc.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
}

type Catalogue = Record<string, string>;
const CATALOGUES: Record<'fr' | 'en' | 'wo', Catalogue> = {
  fr: (fr as { property: { amenityCatalog: Catalogue } }).property.amenityCatalog,
  en: (en as { property: { amenityCatalog: Catalogue } }).property.amenityCatalog,
  wo: (wo as { property: { amenityCatalog: Catalogue } }).property.amenityCatalog,
};

function traducteur(catalogue: Catalogue): TraducteurDuCatalogue {
  const t = ((cle: string) => catalogue[cle]) as TraducteurDuCatalogue;
  t.has = (cle: string) => cle in catalogue;
  return t;
}

describe('le catalogue des équipements est traduit par slug (fr, en, wo)', () => {
  const noms = equipementsDuCatalogue();

  it('le catalogue de l’API se lit', () => {
    expect(noms.length).toBeGreaterThanOrEqual(30);
    expect(noms).toContain('Groupe électrogène');
    expect(noms).toContain("Citerne d'eau");
  });

  it('le slug est celui de Str::slug (TagCatalog::slugLibre)', () => {
    expect(slugDuCatalogue('Cuisine équipée')).toBe('cuisine-equipee');
    expect(slugDuCatalogue('Sécurité 24/7')).toBe('securite-247');
    expect(slugDuCatalogue("Citerne d'eau")).toBe('citerne-deau');
    expect(slugDuCatalogue('WiFi')).toBe('wifi');
  });

  it.each(['fr', 'en', 'wo'] as const)('%s : chaque équipement du catalogue a sa clé, et rien d’autre', (langue) => {
    const attendues = noms.map(slugDuCatalogue).sort();
    expect(Object.keys(CATALOGUES[langue]).sort()).toEqual(attendues);
    for (const valeur of Object.values(CATALOGUES[langue])) expect(valeur.trim()).not.toBe('');
  });
});

describe('libelleEquipement', () => {
  const groupe = { name: 'Groupe électrogène', slug: 'groupe-electrogene', status: 'approved' as const };

  it('un équipement du catalogue se traduit en anglais et en wolof', () => {
    expect(libelleEquipement(groupe, traducteur(CATALOGUES.en))).toBe('Backup generator');
    expect(libelleEquipement(groupe, traducteur(CATALOGUES.wo))).toBe(CATALOGUES.wo['groupe-electrogene']);
    expect(CATALOGUES.wo['groupe-electrogene']).not.toBe('Groupe électrogène');
  });

  it('un équipement saisi par un annonceur s’affiche tel quel, dans toutes les langues', () => {
    const puits = { name: 'Puits traditionnel', slug: 'puits-traditionnel', status: 'approved' as const };
    expect(libelleEquipement(puits, traducteur(CATALOGUES.en))).toBe('Puits traditionnel');
    expect(libelleEquipement(puits, traducteur(CATALOGUES.wo))).toBe('Puits traditionnel');
  });

  it('une proposition en attente s’affiche telle que saisie, même si son slug est connu', () => {
    const proposition = { name: 'Forage', slug: 'forage', status: 'pending' as const };
    expect(libelleEquipement(proposition, traducteur(CATALOGUES.en))).toBe('Forage');
  });

  it('sans slug (donnée ancienne), le nom en base', () => {
    expect(libelleEquipement({ name: 'Jacuzzi', slug: null }, traducteur(CATALOGUES.en))).toBe('Jacuzzi');
  });
});
