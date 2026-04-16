# Prompt Stitch — Page d'accueil Takussan

---

## Contexte projet

**Takussan** est une plateforme immobilière sénégalaise (Dakar). Le nom vient du wolof et signifie "la maison" / "le chez-soi". C'est une PropTech qui connecte visiteurs, agents immobiliers et bailleurs — avec le WhatsApp comme canal de contact principal (réalité du marché dakarois).

**Stack technique** : Next.js 16, Tailwind CSS 4, shadcn/ui, Lucide icons, Geist font.

**Philosophie visuelle** : moderne et épuré, accueillant et chaleureux, professionnel sans être froid. Proche des meilleures PropTech (Airbnb, Houzz) — pas un back-office générique. Immobilier = acte de vie fort → l'interface doit inspirer confiance et sérénité.

---

## Ce que je veux

La **page d'accueil publique** — la toute première page qu'un visiteur découvre en arrivant sur takussan.sn. C'est le moment zéro de la relation. Le visiteur doit ressentir en 3 secondes : "Ici, je peux trouver mon chez-moi à Dakar."

---

## Sections de la page (de haut en bas)

### 1. Hero section — L'instant décisif

- **Grande image/illustration immersive** en arrière-plan : une scène de vie dakaroise liée à l'habitat (terrasse avec vue, quartier animé, intérieur chaleureux). Pas de stock photo générique famille souriante — plutôt une ambiance, une lumière, une atmosphère.
- **Barre de recherche centrale** : un champ unique bien visible avec placeholder "Rechercher un bien à Dakar…" + bouton "Rechercher". C'est l'action principale — elle doit être impossible à manquer.
- **Tagline** : une phrase courte et frappante en wolof/français qui capture l'essence. Exemples d'inspiration : "San la bopp soxna" / "Votre chez-vous à Dakar" / "Takussan — la maison, enfin". À toi de trouver la bonne formule.
- **Sous-titre** : "Appartements, villas, bureaux — vente et location à Dakar" (ou similaire).
- Le hero doit prendre **au moins 80vh** — le visiteur doit scroll pour découvrir la suite.

### 2. Section "Biens en vedette" — La preuve sociale immédiate

- **Titre** : "Biens en vedette" ou "Sélection du moment"
- **Grille de PropertyCards** (4 colonnes desktop, 2 tablette, 1 mobile) montrant les biens mis en avant par les agents.
- Chaque carte contient : photo du bien (ratio 3:2), prix en XOF, type (villa, appartement…), transaction (vente/location), quartier/ville, badge "Vedette" subtil.
- Les cartes doivent avoir un **hover élégant** (léger lift + shadow, pas de flash).
- **CTA** : "Voir tous les biens" → lien vers la page recherche.

### 3. Section "Derniers ajouts" — L'effet fraîcheur

- Même structure que "Biens en vedette" mais avec un titre comme "Arrivages récents" ou "Nouveautés".
- Montre que la plateforme est vivante, alimentée régulièrement.
- Badge "Nouveau" sur les cartes.

### 4. Section "Comment ça marche" — Réassurance

- 3 étapes illustrées par des icônes Lucide (pas de photos) :
  1. 🔍 **Explorez** — "Parcourez les biens disponibles à Dakar"
  2. 💬 **Contactez** — "Échangez directement avec l'agent via WhatsApp"
  3. 🏠 **Emménagez** — "Visitez, signez, installez-vous"
- Layout horizontal sur desktop, vertical sur mobile.
- Ton simple, direct, pas de jargon.

### 5. Section "Pourquoi Takussan" — Différenciateur

- 3-4 arguments avec icônes :
  - **Local** : "Conçu pour le marché dakarois — quartiers, prix en XOF, WhatsApp"
  - **Direct** : "Contact direct agent ↔ visiteur, pas de intermédiaire"
  - **Vérifié** : "Annonces vérifiées par des agents immobiliers agréés"
  - **Simple** : "Zéro inscription requise pour parcourir et contacter"
- Pas de longs paragraphes — une ligne par argument.

### 6. Footer — Navigation secondaire

- Logo Takussan + baseline courte
- Liens : Accueil, Biens, À propos, Contact
- Réseaux sociaux (icônes)
- Mentions légales
- Langue : FR / EN / WO (sélecteur discret)

---

## Palette de couleurs

- **Primaire** : bleu profond (confiance, autorité) — ex: `#1e3a5f` ou similaire
- **Secondaire** : terre/sable (ancrage sénégalais, chaleur) — ex: `#c4956a` ou terracotta douce
- **Accent** : vert subtil (confirmation, espoir) — ex: `#2d6a4f`
- **Fond** : blanc cassé (`stone-50`) — pas de blanc pur
- **Neutrals** : gris chauds (stone/zinc) — pas de gris froids
- **Contraste** : minimum 4.5:1 (WCAG AA)

---

## Contraintes strictes

- **Responsive** : mobile-first obligatoire. La majorité du trafic sénégalais est mobile.
- **Pas de stock photos génériques** (maison parfaite + famille souriante). Préférer ambiances, lumières, illustrations vectorielles.
- **Pas de surcharge** : chaque section respire, espacement généreux (`py-12` desktop, `py-8` mobile).
- **Animations** : au scroll (fade-in, slide-up), mais **sobres** — pas de UI qui flash.
- **Skeletons** pour les sections qui chargent des données (biens en vedette, derniers ajouts).
- **Tailles images biens** : ratio 3:2, jamais portrait.
- **Devise** : XOF (Franc CFA), formatage avec espaces : "25 000 000 XOF"
- **Icônes** : Lucide uniquement, ligne fine.
- **Typographie** : Geist, hiérarchie stricte (h1 → page, h2 → section, h3 → sous-section).
- **Bouton principal** : un seul CTA principal par section, plein, couleur primaire.
- **États interactifs** : hover visible, focus-visible accessible.
- **Pas de dark mode** pour cette page (mode clair uniquement).

---

## Ton & personnalité

- **Accueillant** comme un "come in" sénégalais — la teranga
- **Direct** : pas de blabla, chaque mot compte
- **Local** : on est à Dakar, pas à Paris ni San Francisco — les références (quartiers, XOF, WhatsApp) ancrent la plateforme dans sa réalité
- **Confiant** : on sait ce qu'on fait, on n'a pas besoin de crier

---

## Ce que je ne veux PAS

- Pas de carousel auto-rotatif (les visiteurs n'attendent pas)
- Pas de video background (bande passante Sénégal)
- Pas de pop-up/bannière cookie géante
- Pas de compteurs animés ("+500 biens !")
- Pas de témoignages clients (pas encore de clients)
- Pas de section blog/actualités (pas encore de contenu)
- Pas de comparateur ou features P2/P3

---

## Résultat attendu

Un design complet de la page d'accueil en **3 breakpoints** : mobile (375px), tablette (768px), desktop (1280px). Chaque section doit être visible et lisible. L'ensemble doit donner l'impression d'une plateforme professionnelle, locale, et prête à servir.
