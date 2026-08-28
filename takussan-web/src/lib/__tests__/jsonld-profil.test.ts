import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ORIGINE_SITE } from '../alternates';
import { scriptJsonLd } from '../jsonld';
import { type AgencePubliee, type AgentPublie, jsonLdAgence, jsonLdAgent } from '../jsonld-profil';
import { jsonLdOrganisation, jsonLdSiteWeb } from '../jsonld-site';

const AGENCE: AgencePubliee = {
  slug: 'immo-dakar',
  name: 'Immo Dakar',
  description: 'Agence généraliste aux Almadies.',
  license_number: 'SN-2019-0042',
  email: 'contact@immo-dakar.test',
  phone: '+221 33 000 00 00',
  city: 'Dakar',
  logo_url: 'https://media.takussan.test/logos/immo-dakar.png',
  reviews: { average: 4.5, count: 12 },
};

const AGENT: AgentPublie = {
  slug: 'awa-diop',
  full_name: 'Awa Diop',
  bio: 'Spécialiste des Almadies.',
  phone: '+221 77 000 00 00',
  city: 'Dakar',
  specialty: 'Résidentiel haut de gamme',
  avatar_url: 'https://media.takussan.test/avatars/awa.png',
  agency: { name: 'Immo Dakar', slug: 'immo-dakar' },
  reviews: { average: 4.8, count: 7 },
};

/**
 * Les types que schema.org autorise à porter `aggregateRating`.
 *
 * Relevé sur https://schema.org/aggregateRating (« Instances of ... may appear as a value of these
 * properties »), et re-vérifié le 2026-08-28. **`Person` n'y est pas** — c'est le fait qui décide
 * du `@type` des deux profils, et il vivait jusqu'ici dans un docblock que rien ne gardait.
 */
const DOMAINE_AGGREGATE_RATING = [
  'Brand',
  'CreativeWork',
  'Event',
  'Offer',
  'Organization',
  'Place',
  'Product',
  'Service',
] as const;

/**
 * L'ascendance schema.org des types que ce dépôt émet ou pourrait émettre.
 *
 * Un `@type` absent de cette table fait ROUGIR plutôt que de passer : c'est la même règle que
 * pour les formes de `robots` du sitemap — *une valeur qu'on ne sait pas classer ne se range pas
 * du côté qui arrange.*
 */
const ANCETRES: Readonly<Record<string, readonly string[]>> = {
  RealEstateAgent: ['LocalBusiness', 'Organization', 'Place', 'Thing'],
  LocalBusiness: ['Organization', 'Place', 'Thing'],
  Organization: ['Thing'],
  Person: ['Thing'],
};

function porteLaNote(type: string): boolean {
  const ancetres = ANCETRES[type];
  if (!ancetres) {
    throw new Error(
      `@type « ${type} » absent de la table d'ascendance : ajoute-le avec ses ancêtres schema.org ` +
        `plutôt que de le laisser passer.`,
    );
  }
  return [type, ...ancetres].some((t) => (DOMAINE_AGGREGATE_RATING as readonly string[]).includes(t));
}

describe('TCK-435 — le `@type` des profils ADMET `aggregateRating`', () => {
  /*
   * ⚠️ **Cette décision n'était gardée par AUCUN test.** Remplacer `'RealEstateAgent'` par
   * `'Person'` dans `jsonLdAgent()` laissait 35 tests verts et `tsc` à 0 — mesuré. Or c'est
   * exactement la régression que le raisonnement schema.org existe pour interdire : un nœud
   * `Person` ne peut pas porter `aggregateRating`, donc la note que la page AFFICHE
   * disparaîtrait du balisage sans qu'un seul test bouge.
   *
   * Le test n'assère pas la CHAÎNE `RealEstateAgent` mais la PROPRIÉTÉ qui l'a fait choisir :
   * un futur `@type` mieux adapté (`RealEstateListing`, `ProfessionalService`…) passera s'il
   * admet la note, et `Person` échouera.
   */
  it.each([
    ['agence', () => jsonLdAgence(AGENCE, 'fr')],
    ['agent', () => jsonLdAgent(AGENT, 'fr')],
  ])('%s : son `@type` est dans le domaine d’`aggregateRating`', (_nom, fabrique) => {
    const type = fabrique()['@type'] as string;
    expect(porteLaNote(type), `« ${type} » ne peut pas porter aggregateRating`).toBe(true);
  });

  it('`Person` ne le pourrait PAS — c’est ce qui l’écarte', () => {
    // Le contrôle qui prouve que l'assertion ci-dessus discrimine : sans lui, une fonction
    // `porteLaNote` qui rendrait toujours `true` passerait les deux cas.
    expect(porteLaNote('Person')).toBe(false);
    expect(porteLaNote('RealEstateAgent')).toBe(true);
  });

  it('un `@type` inconnu de la table fait rougir plutôt que de passer', () => {
    expect(() => porteLaNote('ZzzTypeInvente')).toThrow(/ascendance/);
  });

  it('l’agence parente d’un agent porte aussi un type qui admet la note', () => {
    const parent = jsonLdAgent(AGENT, 'fr').parentOrganization as Record<string, unknown>;
    expect(porteLaNote(parent['@type'] as string)).toBe(true);
  });
});

describe('TCK-435 · AC2 — jamais de note sur zéro avis', () => {
  it('une agence à `count: 0` ne produit AUCUNE clé `aggregateRating`', () => {
    const noeud = jsonLdAgence({ ...AGENCE, reviews: { average: 0, count: 0 } }, 'fr');

    expect(noeud).not.toHaveProperty('aggregateRating');
    // Et surtout : pas de `ratingValue: 0` caché ailleurs. Une note de 0 sur 0 avis est une
    // affirmation fausse et une cause connue d'action manuelle.
    expect(JSON.stringify(noeud)).not.toContain('ratingValue');
  });

  it('un agent à `count: 0` non plus', () => {
    const noeud = jsonLdAgent({ ...AGENT, reviews: { average: null, count: 0 } }, 'fr');
    expect(noeud).not.toHaveProperty('aggregateRating');
  });

  it('une moyenne NULLE sur un compte positif n’est pas non plus balisée', () => {
    // L'API peut servir des avis sans note. Émettre `ratingValue: null` ou `0` inventerait la
    // seule chose que la page ne dit pas.
    const noeud = jsonLdAgence({ ...AGENCE, reviews: { average: null, count: 4 } }, 'fr');
    expect(noeud).not.toHaveProperty('aggregateRating');
  });

  it('l’absence totale de bloc `reviews` non plus', () => {
    const { reviews: _ignore, ...sansAvis } = AGENCE;
    expect(jsonLdAgence(sansAvis, 'fr')).not.toHaveProperty('aggregateRating');
  });

  it('une note RÉELLE est bien émise, avec ses bornes', () => {
    // Le contrôle d'ablation du test précédent : sans lui, une fabrique qui n'émettrait JAMAIS
    // de note passerait les quatre cas ci-dessus.
    const note = jsonLdAgence(AGENCE, 'fr').aggregateRating as Record<string, unknown>;
    expect(note).toMatchObject({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      reviewCount: 12,
      bestRating: 5,
      worstRating: 1,
    });
  });
});

describe('TCK-435 · AC3 — ni « null », ni `undefined`, ni clé vide', () => {
  const agenceNue: AgencePubliee = {
    slug: 'agence-nue',
    name: 'Agence Nue',
    description: null,
    license_number: null,
    email: null,
    phone: null,
    city: null,
    logo_url: null,
  };

  it('une agence dont tout est nul n’émet que ce qu’elle sait', () => {
    const noeud = jsonLdAgence(agenceNue, 'fr');
    const brut = JSON.stringify(noeud);

    expect(brut).not.toContain('null');
    expect(brut).not.toContain('undefined');
    expect(Object.keys(noeud).sort()).toEqual(['@context', '@id', '@type', 'name', 'url']);
  });

  it('un agent dont tout est nul non plus', () => {
    const noeud = jsonLdAgent(
      { slug: 'agent-nu', full_name: 'Agent Nu', bio: null, phone: null, city: null,
        specialty: null, avatar_url: null, agency: null },
      'fr',
    );

    expect(JSON.stringify(noeud)).not.toContain('null');
    expect(noeud).not.toHaveProperty('address');
    expect(noeud).not.toHaveProperty('parentOrganization');
  });

  it('une ville nulle n’émet AUCUN `PostalAddress`, plutôt qu’un objet vide', () => {
    expect(jsonLdAgence({ ...AGENCE, city: null }, 'fr')).not.toHaveProperty('address');
  });

  it('une chaîne VIDE est traitée comme une absence', () => {
    // Le cas que `sansVides` couvre en plus de `null` : l'API peut servir `""`.
    expect(jsonLdAgence({ ...AGENCE, description: '' }, 'fr')).not.toHaveProperty('description');
  });
});

describe('TCK-435 · AC4 — du JSON valide, `</script>` compris', () => {
  it.each([
    ['agence', () => jsonLdAgence({ ...AGENCE, description: 'Voir </script> ici' }, 'fr')],
    ['agent', () => jsonLdAgent({ ...AGENT, bio: 'Bio avec </script> dedans' }, 'fr')],
  ])('%s : la balise ne peut pas être fermée depuis la donnée', (_nom, fabrique) => {
    const rendu = scriptJsonLd(fabrique());

    expect(rendu).not.toContain('</script>');
    expect(rendu).not.toContain('<');
    expect(() => JSON.parse(rendu)).not.toThrow();
    // Et la donnée SURVIT à l'échappement : elle est échappée, pas supprimée.
    expect(JSON.stringify(JSON.parse(rendu))).toContain('</script>');
  });

  it('les autres formes que l’analyseur HTML traite sont échappées aussi', () => {
    // Un échappement qui ne reconnaîtrait que `</script>` littéral raterait `</SCRIPT >` et
    // `<!--`. On échappe TOUS les `<`, donc aucune ne passe.
    for (const hostile of ['</SCRIPT >', '<!--', '<script>', '</script>']) {
      const rendu = scriptJsonLd(jsonLdAgence({ ...AGENCE, description: hostile }, 'fr'));
      expect(rendu, hostile).not.toContain('<');
      expect(() => JSON.parse(rendu)).not.toThrow();
    }
  });
});

describe('les URL des profils', () => {
  it('sont absolues et préfixées de la langue servie', () => {
    expect(jsonLdAgence(AGENCE, 'en').url).toBe(`${ORIGINE_SITE}/en/agencies/immo-dakar`);
    expect(jsonLdAgent(AGENT, 'wo').url).toBe(`${ORIGINE_SITE}/wo/agents/awa-diop`);
  });

  it('l’`@id` est l’URL de la page — donc distinct par langue', () => {
    expect(jsonLdAgence(AGENCE, 'fr')['@id']).toBe(`${ORIGINE_SITE}/fr/agencies/immo-dakar`);
    expect(jsonLdAgence(AGENCE, 'en')['@id']).not.toBe(jsonLdAgence(AGENCE, 'fr')['@id']);
  });

  it('l’agence parente d’un agent est liée par son URL, pas par son nom seul', () => {
    const parent = jsonLdAgent(AGENT, 'fr').parentOrganization as Record<string, unknown>;
    expect(parent.url).toBe(`${ORIGINE_SITE}/fr/agencies/immo-dakar`);
  });
});

describe('TCK-441 — le balisage n’élargit pas le contact d’un agent', () => {
  it('aucun courriel dans le nœud d’un agent', () => {
    // L'adresse de CONNEXION d'un agent a quitté la charge publique (TCK-441) ; le balisage ne
    // peut pas la remettre. Le type d'entrée n'en porte pas de champ — ceci le constate côté
    // sortie, là où un ajout distrait se verrait.
    expect(JSON.stringify(jsonLdAgent(AGENT, 'fr'))).not.toContain('email');
  });

  it('le téléphone EST émis — la fiche publie déjà un lien `tel:`', () => {
    // Le contrôle symétrique : sans lui, un balisage qui n'émettrait aucun contact du tout
    // passerait le test ci-dessus tout en cessant de décrire la page.
    expect(jsonLdAgent(AGENT, 'fr').telephone).toBe(AGENT.phone);
  });

  it('le courriel d’AGENCE, lui, est publié — c’est une adresse d’entreprise', () => {
    expect(jsonLdAgence(AGENCE, 'fr').email).toBe(AGENCE.email);
  });
});

describe('TCK-435 · AC5 — Organization et WebSite, une seule fois par page', () => {
  const RACINE = join(process.cwd(), 'src');

  function fichiers(dossier: string, acc: string[] = []): string[] {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) fichiers(chemin, acc);
      else if (/\.tsx?$/.test(entree.name)) acc.push(chemin);
    }
    return acc;
  }

  const SOURCES = fichiers(RACINE).filter((f) => !f.includes('__tests__'));

  it('le balayage voit un nombre plausible de fichiers', () => {
    // Sans ce contrôle, un glob cassé rendrait les assertions ci-dessous vertes en ne mesurant
    // rien — le mode de défaillance que ce dépôt paie le plus cher.
    expect(SOURCES.length).toBeGreaterThan(500);
  });

  it.each(['jsonLdOrganisation', 'jsonLdSiteWeb'])(
    '%s n’est APPELÉ que depuis le layout du groupe public',
    (fabrique) => {
      const appelants = SOURCES.filter(
        (f) =>
          !f.endsWith(join('lib', 'jsonld-site.ts')) &&
          new RegExp(`${fabrique}\\(`).test(readFileSync(f, 'utf8')),
      ).map((f) => relative(RACINE, f));

      expect(appelants).toEqual([join('app', '[locale]', '(public)', 'layout.tsx')]);
    },
  );

  it('aucun composant partagé n’émet de `ld+json` — seules les pages et le layout le font', () => {
    // Le mode de défaillance que l'AC nomme : un `Navbar` ou un `Footer` qui porterait l'identité
    // du site la dupliquerait sur toute page qui monte les deux.
    const emetteurs = SOURCES.filter((f) => /ld\+json/.test(readFileSync(f, 'utf8'))).map((f) =>
      relative(RACINE, f),
    );

    expect(emetteurs).toEqual([join('lib', 'jsonld.tsx')]);
  });

  it('l’`@id` de l’organisation est le MÊME dans les trois langues', () => {
    // C'est la même organisation : trois `@id` en feraient trois entités distinctes qui portent
    // le même nom.
    const ids = (['fr', 'en', 'wo'] as const).map((l) => jsonLdOrganisation(l)['@id']);
    expect(new Set(ids).size).toBe(1);
  });

  it('l’`@id` du site, lui, est distinct par langue', () => {
    const ids = (['fr', 'en', 'wo'] as const).map((l) => jsonLdSiteWeb(l)['@id']);
    expect(new Set(ids).size).toBe(3);
  });

  it('le `WebSite` renvoie à l’organisation par son `@id`', () => {
    const editeur = jsonLdSiteWeb('fr').publisher as Record<string, unknown>;
    expect(editeur['@id']).toBe(jsonLdOrganisation('fr')['@id']);
  });

  it('la recherche déclarée pointe une URL que le site sert RÉELLEMENT', () => {
    const action = jsonLdSiteWeb('en').potentialAction as Record<string, unknown>;
    const cible = action.target as Record<string, unknown>;
    expect(cible.urlTemplate).toBe(`${ORIGINE_SITE}/en/properties?q={search_term_string}`);
  });

  it('n’invente ni logo ni compte social — aucun n’existe dans le dépôt', () => {
    const organisation = jsonLdOrganisation('fr');
    expect(organisation).not.toHaveProperty('logo');
    expect(organisation).not.toHaveProperty('sameAs');
  });
});
