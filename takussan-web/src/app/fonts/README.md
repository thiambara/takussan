# Polices versionnées — ADR-0074

Le build ne télécharge plus aucune police : les fichiers vivent ici et sont chargés par
`next/font/local` (`src/app/layout.tsx`, `src/app/[locale]/(public)/playground/page.tsx`).
Avant, `next/font/google` les demandait à Google Fonts à chaque `next build`, et ses pannes
intermittentes cassaient le build des PR et celui de l'image.

## Provenance

Paquets npm **Fontsource** (`@fontsource-variable/*`, version **5.3.0**), qui republient les
fichiers de Google Fonts. Seuls les `.woff2` utiles sont copiés ; les paquets ne sont **pas** des
dépendances du front.

| Fichier | Paquet | Révision Google | Octets | Lu par |
|---|---|---|---:|---|
| `bricolage-grotesque-latin-wght-normal.woff2` | `@fontsource-variable/bricolage-grotesque` | v9 | 41 344 | layout racine, préchargé |
| `bricolage-grotesque-latin-ext-wght-normal.woff2` | idem | v9 | 18 668 | layout racine, à la demande |
| `dm-sans-latin-wght-normal.woff2` | `@fontsource-variable/dm-sans` | v17 | 36 932 | layout racine, préchargé |
| `dm-sans-latin-ext-wght-normal.woff2` | idem | v17 | 18 228 | layout racine, à la demande |
| `fraunces-latin-wght-normal.woff2` | `@fontsource-variable/fraunces` | v38 | 36 620 | `/playground` |
| `fraunces-latin-wght-italic.woff2` | idem | v38 | 45 656 | `/playground` |
| `inter-latin-wght-normal.woff2` | `@fontsource-variable/inter` | v20 | 48 256 | `/playground` |
| `manrope-latin-wght-normal.woff2` | `@fontsource-variable/manrope` | v20 | 24 836 | `/playground` |

Total : 270 540 octets de `.woff2` (264 Kio). Une route publique en précharge 78 276 (les deux
fichiers `latin` du layout racine).

## Ce qui a été choisi, et pourquoi

- **Fichiers variables à axe `wght` seul** (les fichiers `*-wght-*` de Fontsource), pas les
  variantes `opsz`, `wdth`, `full` ou `standard`. C'est ce que servait Google pour les appels
  `next/font/google` qu'ils remplacent : sans option `axes`, Google ne livre que l'axe `wght` et
  fige les autres (`opsz` de DM Sans, Fraunces et Inter) à leur valeur par défaut. Vérifié le
  2026-10-24 : même axe, même nombre de caractères dans la `cmap`, même révision.
- **Sous-ensemble `latin`**, plus **`latin-ext` pour Bricolage et DM Sans** : `next/font/google`
  ne préchargeait que `latin`, mais déclarait aussi la face `latin-ext` avec son `unicode-range`.
  C'est elle qui rend le « ŋ » du wolof (`src/messages/wo.json`). Le playground, qui ne sert
  qu'en développement, s'en passe.
- **Graisses** : la plage déclarée à `localFont` reproduit les graisses demandées à Google, pas
  l'axe entier du fichier (`'400 700'` pour Bricolage et DM Sans, `'400 600'` pour Fraunces).

## Licence

Les cinq familles sont sous **SIL Open Font License 1.1** : un fichier `OFL-<famille>.txt` par
famille, copié tel quel du paquet (`LICENSE`). L'OFL autorise la redistribution des fontes, y
compris dans un logiciel, tant que la licence les accompagne et qu'on ne les vend pas seules.

## Mettre à jour

Dans un répertoire neuf, hors du dépôt :

```bash
npm pack @fontsource-variable/dm-sans    # une famille à la fois
tar -xzf fontsource-variable-dm-sans-*.tgz
ls package/files | grep -E '^dm-sans-latin(-ext)?-wght-'
cat package/metadata.json                # révision Google (`version`) et axes
```

Copier les fichiers de même nom ici, et `package/LICENSE` en `OFL-<famille>.txt` ; mettre à jour
le tableau ci-dessus. Les `unicode-range` du layout racine viennent de `package/wght.css` du
même paquet : les reprendre s'ils ont changé. Rien n'est exécuté depuis le paquet, et il n'entre
pas dans `package.json`.
