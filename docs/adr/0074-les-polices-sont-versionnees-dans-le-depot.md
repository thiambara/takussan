# ADR-0074 — Les polices sont versionnées dans le dépôt et chargées par `next/font/local`

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Décision du porteur** : option 1a du 2026-10-24, après le rouge de la promotion #1370

## Contexte

Le front charge ses polices par `next/font/google`. La fonction ne passe pas par le navigateur. Elle
télécharge les fichiers chez Google Fonts **pendant `next build`**, puis les sert depuis notre
domaine. Le build dépend donc du réseau et de la réponse de Google, à chaque fois.

Cinq familles sont concernées :
- Bricolage Grotesque et DM Sans, dans `src/app/layout.tsx`, préchargées par toutes les routes ;
- Fraunces, Inter et Manrope, dans `src/app/[locale]/(public)/playground/page.tsx`. Cette page rend
  404 dans toute image déployée (TCK-794), mais elle est compilée par chaque build et ses polices sont
  téléchargées comme les autres.

Le même build tourne à trois endroits :
- dans `web-ci` (job « Web ») ;
- dans l'image du front construite par la CI des PR ;
- dans `images.yml`, qui déploie la préproduction.

Quand Google répond mal, Turbopack échoue sans que le code y soit pour rien :
`next/font/google queries have exactly one entry`, puis
`Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'`, une fois par
fichier de police. Le dernier cas date du 2026-10-23 à 23:56 Z : l'image du front de la promotion
#1370 (run 40042273874) a échoué sur Fraunces, alors que la CI web de `pre-dev` était verte sur ses
trois derniers pushs. La réponse jusqu'ici était de relancer le job. Elle est écrite dans la mémoire
de la session sous deux formes : Vercel avant ADR-0028, puis l'image du front. Elle ne supprime pas
la panne. Elle rend chaque promotion et chaque déploiement dépendants d'une relance manuelle.

## Décision

**Les fichiers de police sont versionnés dans le dépôt et chargés par `next/font/local`. Aucun
fichier de `takussan-web/src` n'importe `next/font/google`.**

- Les fichiers sont les `.woff2` variables. Bricolage Grotesque et DM Sans ont deux fichiers chacune,
  comme `next/font/google` les servait jusqu'ici :
  - `latin`, préchargé ;
  - `latin-ext`, chargé à la demande par son `unicode-range`. Ce fichier n'est pas un luxe : le
    wolof s'écrit avec `ŋ` (U+014B), que `wo.json` contient 295 fois.

  Le paramètre `subsets` de `next/font/google` ne règle que le préchargement. Le CSS garde aussi les
  faces `latin-ext` et les charge à la demande. Ne versionner que `latin` aurait fait passer le wolof
  sur la police de repli. Le playground, qui rend 404 en préproduction, ne garde que `latin`.
- Les fichiers viennent des paquets Fontsource (`@fontsource-variable/*`), qui ne sont pas des
  dépendances du projet : seuls les fichiers sont copiés. Leur dossier porte la licence de chaque
  famille (SIL Open Font License 1.1, qui autorise la redistribution) et un `README.md` qui dit leur
  provenance, leur version et comment les mettre à jour.
- `next/font/local` n'applique qu'un `unicode-range` par appel. Chaque fichier a donc son propre
  appel :
  - `--font-bricolage` et `--font-dm-sans` portent le `latin` ;
  - `--font-bricolage-ext` et `--font-dm-sans-ext` portent le `latin-ext`, sans police de repli.
- `next/font/local` nomme chaque famille d'après la constante JS. Les tokens de `globals.css`
  (`@theme inline`) lisent donc les variables, et non plus les noms en dur (`"DM Sans"`,
  `"Bricolage Grotesque"`). Sans cette modification, tout le site serait tombé sur `ui-sans-serif`.
- Dans ces tokens, la variable `-ext` vient en tête. Sa face ne couvre pas l'espace (U+0020) : elle
  ne fixe pas les métriques de la ligne, et le texte latin la traverse sans la télécharger.
- Les graisses déclarées sont celles demandées à Google (`400 700`), pas l'étendue de l'axe du
  fichier. Un `font-light` rend donc en 400, comme avant.
- Le sous-ensemble `vietnamese`, que Google déclarait pour Bricolage, n'est pas repris : aucun
  texte de `src` ne l'utilise.
- Une garde de la suite du front refuse tout import de `next/font/google` dans `src`.

## Conséquences

- **Le build ne fait plus aucun appel réseau pour les polices.** La panne disparaît des trois
  builds, déploiement de préproduction compris, au lieu d'y devenir plus rare.
- **Rien ne change pour l'utilisateur.** `next/font/google` servait déjà les fichiers depuis notre
  domaine, et aucune requête ne partait vers Google au rendu.
- **Le dépôt porte quelques centaines de Ko de binaires.** Une mise à jour de police devient un
  geste explicite, avec la nouvelle version dans le `README.md` du dossier. Google ne la fait plus
  en silence au build suivant.
- **Le rendu du wolof est conservé.** Le fichier `latin-ext` n'est téléchargé que par une page qui
  contient l'un de ses caractères.
- **Les tests qui doublaient `next/font/google`** doublent désormais `next/font/local`. La garde
  des polices préchargées par le layout racine est conservée.

## Application

- `takussan-web/src/app/layout.tsx` (quatre appels `localFont`) et
  `takussan-web/src/app/[locale]/(public)/playground/page.tsx` ;
- `takussan-web/src/app/fonts/`, avec licences et `README.md` ;
- `takussan-web/src/app/globals.css` : les tokens de famille lisent les variables de `next/font` ;
- `src/app/__tests__/polices-du-layout-racine.test.ts` : la garde contre `next/font/google` (et
  `fonts.googleapis.com`, `fonts.gstatic.com`) dans `src/`, et contre tout préchargement du
  `latin-ext`.
