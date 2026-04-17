# Plan d'implémentation - Page d'accueil Takussan

Convertir le design Stitch en composants React/Next.js modulaires pour takussan-web.

## Étapes

1. **Setup environnement**
   - Créer `.stitch/designs/` pour les ressources
   - Créer `scripts/fetch-stitch.sh` pour télécharger les designs
   - Télécharger HTML et screenshot depuis Stitch MCP

2. **Analyse design**
   - Extraire Tailwind config du HTML Stitch
   - Créer `resources/style-guide.json`
   - Identifier les composants modulaires (Navbar, Hero, PropertyCard, CategoryGrid, Footer)

3. **Création data layer**
   - `src/data/mockData.ts` avec biens, catégories, textes

4. **Composants React**
   - `Navbar.tsx` - Navigation glassmorphism
   - `Hero.tsx` - Hero avec headline et barre de recherche
   - `PropertyCard.tsx` - Carte bien avec badge transaction
   - `PropertyGrid.tsx` - Grille responsive de biens
   - `CategoryGrid.tsx` - Grille catégories
   - `Footer.tsx` - Footer riche
   - `HomePage.tsx` - Assemblage final

5. **Wiring**
   - Mettre à jour `page.tsx` pour render HomePage
   - Configurer layout avec Geist font

6. **Validation**
   - Lancer `npm run dev` et vérifier le rendu

## Fichiers générés
- Composants modulaires dans `src/components/`
- Hooks dans `src/hooks/`
- Data mock dans `src/data/`
- Styles Tailwind synchronisés avec le design system Stitch
