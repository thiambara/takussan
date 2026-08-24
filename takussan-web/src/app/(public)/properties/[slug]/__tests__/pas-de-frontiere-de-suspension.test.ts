import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Garde structurelle — TCK-335, AC17.
 *
 * ## Ce qu'elle empêche, et pourquoi elle ne ressemble pas à un test
 *
 * `notFound()` ne peut fixer un code HTTP que **tant que le premier octet n'est pas parti**. Un
 * `loading.tsx` ouvre une frontière de suspension sur son segment ET tous ses enfants : Next
 * envoie alors la coque immédiatement, avec le repli — et **le statut 200 avec elle**. Le
 * `notFound()` qui suit rend le bon écran et ne peut plus rien au code de réponse.
 *
 * Mesuré par ablation le 2026-08-21, sur `next dev` comme sur `next start` :
 *
 * ```
 * sonde `notFound()` sous /properties, SANS loading.tsx dans l'arbre  → 404
 * la même, AVEC properties/[slug]/loading.tsx                          → 200
 * ```
 *
 * `properties/[slug]/loading.tsx` a donc été **supprimé**, et le `loading.tsx` de la liste
 * déplacé dans le groupe `(liste)` pour qu'il ne couvre plus la fiche. Le coût est mesuré :
 * la fiche répond en **63 à 73 ms** (TTFB, `next start`, API locale, à chaud) — c'est ce que le
 * visiteur attend désormais avant la première peinture, contre un squelette instantané suivi de
 * ~900 ms d'attente dans la version cliente d'avant. Le gain est un **vrai 404** sur la seule
 * surface indexable du produit ; un soft-404 servi en 200 est ce que TCK-335 répare, et il aurait
 * été réintroduit ici par le correctif lui-même.
 *
 * ⚠ Cette garde porte sur la CAUSE, pas sur le symptôme : aucun harnais e2e n'existe dans ce
 * dépôt (`npm run test` = vitest/jsdom), donc le code HTTP lui-même n'est vérifiable qu'à la main.
 * Une garde qui ne peut pas observer l'effet doit au moins verrouiller ce qui le produit.
 */
const SEGMENT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LISTE = join(SEGMENT, '..', '(liste)');

describe('TCK-335 — la fiche ne vit sous aucune frontière de suspension', () => {
  it('n’a pas de loading.tsx dans son propre segment', () => {
    expect(
      existsSync(join(SEGMENT, 'loading.tsx')),
      'un loading.tsx ici fait rendre 200 à un vrai 404 — voir le docblock',
    ).toBe(false);
  });

  it('n’a pas de loading.tsx dans le segment parent /properties', () => {
    const parent = join(SEGMENT, '..');
    const fichiers = readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
    // Un `loading.tsx` posé ici couvrirait `[slug]` en plus de la liste.
    expect(fichiers).not.toContain('loading.tsx');
  });

  it('la liste garde le sien, confiné à son groupe de routes', () => {
    // Non-vacuité : si ce fichier disparaissait, les deux assertions ci-dessus
    // passeraient au vert en ayant simplement supprimé la fonctionnalité.
    expect(existsSync(join(LISTE, 'loading.tsx'))).toBe(true);
    expect(existsSync(join(LISTE, 'page.tsx'))).toBe(true);
  });
});
