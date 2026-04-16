# Design & UI Guidelines — Takussan

Ces directives s'appliquent à **toutes les interfaces** de Takussan. Elles priment sur les choix par défaut des composants tiers.

## Philosophie visuelle

- **Moderne et épuré** : chaque écran ne montre que ce dont l'utilisateur a besoin à cet instant. Pas de surcharge d'information.
- **Accueillant et chaleureux** : l'immobilier est un acte de vie fort — l'interface doit inspirer confiance et sérénité, pas anxiété.
- **Professionnel sans être froid** : l'esthétique est proche des meilleures apps PropTech (Airbnb, Houzz) — pas d'un back-office générique.
- **Cohérence avant tout** : un seul style de bouton principal, une seule façon d'afficher un état vide, une seule famille d'icônes.

## Typographie

- Police principale : **Geist** (déjà configurée dans le layout). Ne pas introduire d'autre police sans raison forte.
- Hiérarchie stricte : `h1` → titre de page, `h2` → section, `h3` → sous-section, `p` → contenu courant.
- Taille minimale de corps : **14px** (16px préféré). Jamais de texte en dessous de 12px.
- Interligne confortable : `leading-relaxed` (1.625) pour le texte courant.
- Poids : 400 (corps), 500 (labels), 600 (titres de section), 700 (titres de page). Éviter le 900/black.

## Palette de couleurs

- **Neutrals** : base de gris chauds (`stone` ou `zinc` Tailwind) plutôt que gris froids.
- **Couleur primaire** : un seul accent (à définir lors du premier ticket UI — ex. terracotta, bleu ardoise, vert sauge). Une fois défini, l'appliquer partout de façon cohérente.
- **Feedback** : vert pour succès, rouge pour erreur, orange pour avertissement, bleu pour info — couleurs sémantiques Tailwind standard.
- **Contraste** : ratio minimum **4.5:1** pour le texte courant (WCAG AA). Toujours vérifier avant de livrer.
- **Fond** : blanc cassé (`stone-50` / `zinc-50`) en lieu et place du blanc pur `#fff` pour réduire la fatigue visuelle.

## Espacement & Layout

- **Espace blanc généreux** : toujours pencher en faveur de plus d'espace, pas moins.
- Utiliser les **espacements Tailwind standard** (multiples de 4px). Pas de valeurs arbitraires (`p-[13px]`) sauf cas exceptionnel documenté.
- Grille : 12 colonnes sur desktop, 4 sur mobile. Pas de layout "pleine largeur" non contenu — max-width `7xl` (1280px) pour le contenu principal.
- Sections de page : padding vertical minimum `py-8` (desktop `py-12`).

## Composants

- **Arrondis** : `rounded-xl` pour les cartes et modales, `rounded-lg` pour les boutons et inputs, `rounded-full` pour les avatars/badges.
- **Ombres** : légères et subtiles (`shadow-sm` ou `shadow-md`). Jamais de `shadow-2xl` sur un élément courant.
- **Bouton principal** : plein (filled), couleur primaire, label court et actionnable (verbe + objet). Un seul CTA principal par écran.
- **Bouton secondaire** : outline ou ghost, jamais aussi saillant que le primaire.
- **États interactifs** : tous les éléments cliquables ont un état `hover` visible et un état `focus-visible` accessible (outline ou ring).
- **Transitions** : `transition-all duration-150 ease-in-out` pour les interactions rapides (hover, focus). `duration-300` pour les ouvertures de panneaux/modales.
- **États vides** : illustrés avec un court message d'encouragement + un CTA. Jamais un simple "Aucun résultat."
- **Loading** : skeleton loaders (pas de spinners centrés sur page entière sauf première charge).

## Images & Médias

- Toujours utiliser le composant `next/image` avec `sizes` appropriés — jamais de `<img>` brut.
- Images de biens : ratio **3:2** ou **4:3**, jamais portrait. Fond de remplacement `stone-200` pendant le chargement.
- Pas de stock photos génériques (maison parfaite + famille souriante). Préférer des visuels minimalistes ou des illustrations vectorielles cohérentes.
- Icônes : une seule bibliothèque (ex. Lucide React). Taille standard `16px` inline, `20px` dans les boutons, `24px` standalone.

## Ton & Micro-copy

- **Accueillant** : s'adresser à l'utilisateur directement ("Vos propriétés", "Ajoutez votre premier bien").
- **Clair et direct** : pas de jargon technique, pas de termes métier obscurs sans définition contextuelle.
- **Labels d'action** : verbe à l'infinitif ("Ajouter un bien", "Envoyer le quittancement") — jamais "OK", "Valider", "Submit".
- **Messages d'erreur** : expliquer ce qui s'est passé + comment corriger. Jamais "Une erreur est survenue."
- **Confirmations destructives** : toujours demander une confirmation explicite avec description de la conséquence.
