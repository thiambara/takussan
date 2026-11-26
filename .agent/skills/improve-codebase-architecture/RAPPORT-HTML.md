# Format du rapport HTML

Adapté de `HTML-REPORT.md` (`mattpocock/skills`, v1.3.2, MIT). Un seul fichier HTML autonome, dans le répertoire
temporaire du système, **jamais dans le dépôt**. Tailwind et Mermaid viennent de CDN : Mermaid pour ce qui a la forme
d'un graphe, des `div` et du SVG à la main pour le reste (masses, coupes). Mélanger les deux, sinon tout se ressemble.

## Squelette

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Relevé d'architecture — Takussan — {{date}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "neutral", securityLevel: "loose" });
    </script>
    <style>
      .couture { stroke-dasharray: 4 4; }
      .fuite { stroke: #dc2626; }
      .profond { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>…</header>
      <section id="candidats" class="space-y-10">…</section>
      <section id="recommandation">…</section>
    </main>
  </body>
</html>
```

## En-tête

Le dépôt, la date, le périmètre relevé (`takussan-api`, `takussan-web` ou les deux, et les points chauds retenus), et
une légende compacte : boîte pleine = module, trait pointillé = couture, flèche rouge = fuite, boîte épaisse et
sombre = module profond. Pas de paragraphe d'introduction : directement les candidats.

## Une carte par candidat

Les schémas portent le poids ; la prose est rare et emploie le vocabulaire sans cérémonie. Chaque candidat est un
`<article>` :

- **Titre** : court, nomme l'approfondissement (« Ramasser l'encaissement des loyers »).
- **Badges** : la force (`Forte` vert, `À explorer` ambre, `Spéculative` ardoise), et la catégorie des dépendances
  (`en processus`, `locale réelle`, `ports et adaptateurs`, `externe`).
- **Fichiers** : liste en `font-mono text-sm`.
- **Avant / après** : la pièce maîtresse, deux colonnes côte à côte.
- **Problème** : une phrase. **Solution** : une phrase.
- **Gains** : des puces de six mots au plus, dans le vocabulaire (« localité : les défauts au même endroit »,
  « levier : une interface, N appelants »). Pas de « plus maintenable » ni de « code plus propre ».
- **Encadré ADR** (s'il y a lieu) : une ligne sur fond ambre.

Si un schéma a besoin d'un paragraphe pour être compris, redessiner le schéma.

## Les schémas

Choisir la forme qui sert le candidat, et varier.

- **Graphe Mermaid** (`flowchart`, ou `sequenceDiagram` pour « avant : 6 allers-retours ; après : 1 ») : quand le
  propos est « X appelle Y qui appelle Z, et voyez le désordre ». Colorer les fuites en rouge (`classDef`), le module
  profond en sombre. L'envelopper dans une carte (`rounded-lg border bg-white p-4`).
- **Boîtes et flèches à la main** : quand la mise en page de Mermaid résiste — notamment pour un « après » qui doit
  peser comme un seul module épais aux internes grisés.
- **Coupe** : des bandes horizontales empilées pour les couches qu'un appel traverse ; avant, six couches minces qui
  ne font rien ; après, une bande épaisse.
- **Masses** : deux rectangles par module, surface d'interface et implémentation ; avant, presque égaux ; après,
  interface courte et implémentation haute.
- **Arbre d'appels replié** : avant, l'arbre en boîtes imbriquées ; après, la même chose repliée en une boîte, les
  appels devenus internes estompés dedans.

## Style

Éditorial plutôt que tableau de bord : de l'air, une seule couleur d'accent, du rouge pour les fuites, de l'ambre pour
les mises en garde. Schémas d'environ 320 px de haut, pour qu'avant et après tiennent côte à côte. Étiquettes de
modules en `text-xs uppercase tracking-wider`. Aucun script hormis Tailwind et Mermaid.

## Recommandation principale

Une carte plus grande : le nom du candidat, une phrase sur le pourquoi, un lien vers sa carte. Rien d'autre.
