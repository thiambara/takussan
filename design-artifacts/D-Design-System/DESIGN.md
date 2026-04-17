# Design System: Takussan Heritage

## Overview & Creative North Star

**Creative North Star: "The Modern Sahel"**

Ce design system s'éloigne de l'esthétique "Silicon Valley" stérile pour embrasser une philosophie "Moderne Sahel". Il équilibre l'autorité rigide de l'immobilier institutionnel avec la chaleur organique et rythmique des paysages sénégalais.

**Principe clé: Professionalisme Organique** — une stratégie de layout qui privilégie l'espace de respiration généreux, l'asymétrie intentionnelle et le layering tonal plutôt que les boîtes et lignes traditionnelles.

---

## Palette de Couleurs

### Couleurs Principales
| Token | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#022448` | Autorité et profondeur — navigation et actions primaires |
| **Primary Container** | `#1e3a5f` | CTA, boutons principaux — *bleu ardoise professionnel* |
| **Secondary** | `#7d5630` | Chaleur "Terracotta" — accents qui ancrent l'UI |
| **Tertiary** | `#002a1a` | Vert botanique profond — succès et confirmations |
| **Background** | `#fff8f5` | Blanc chaud stone — réduit la fatigue visuelle |

### Surfaces & Neutres
| Token | Hex | Usage |
|-------|-----|-------|
| **Surface** | `#fff8f5` | Fond de base |
| **Surface Container Low** | `#fcf2eb` | Zones de contenu secondaire |
| **Surface Container High** | `#f0e6e0` | Cartes au hover |
| **Surface Container Highest** | `#eae1da` | Zones d'interaction active |
| **On Surface** | `#1f1b17` | Texte principal (stone-900) |
| **On Surface Variant** | `#43474e` | Texte secondaire |
| **Outline** | `#74777f` | Bordures (15% opacity ghost) |

### Règle "No-Line"
**Interdit** : bordures 1px solides pour séparer les sections.
**À la place** : utiliser les shifts de couleur de fond (`surface` → `surface-container-low`).

---

## Typographie

### Police
- **Titres**: Manrope (headline font)
- **Corps**: Manrope (body font)
- **Labels**: Inter (label font)

### Échelle
| Style | Taille | Usage |
|-------|--------|-------|
| **Display-LG** | 3.5rem | Hero headlines — tracking tight (-0.02em) |
| **Headline-MD** | 1.75rem | Titres de propriétés |
| **Title-SM** | 1rem | Headers UI — poids bold |
| **Body-LG** | 1rem | Descriptions — line-height 1.6 |
| **Label-SM** | 0.6875rem | Métadonnées — all-caps, letter-spacing 0.05em |

---

## Composants

### Boutons
- **Primaire**: `primary` (#022448) fond, `on-primary` texte — `rounded-md` (0.375rem)
- **Secondaire**: `surface-container-highest` fond — subtil, élégant
- **Tertiaire**: Texte uniquement avec underline au hover en `secondary` (#7d5630)

### Cartes (Property Card)
- **Règle**: Pas de bordures, pas de lignes de séparation
- **Structure**: 32px de padding vertical entre items
- **Fond**: `surface-container-low` — au hover: `surface-container-high`
- **Images**: `rounded-xl` (0.75rem) sur toutes les images de propriétés

### Badges Vente/Location
- **"À Vendre"**: fond `#1e3a5f`, texte blanc, coin supérieur gauche
- **"À Louer"**: fond `#e7e5e4` (stone-200), texte `#1c1917` (stone-900)

### Inputs (Search Bar)
- **Style**: Minimaliste, pas de bordure
- **Fond**: `surface-container-highest`
- **Focus**: transition vers `surface-container-lowest` + ghost border `primary`

---

## Layout & Elevation

### Layering Tonal (pas de drop shadows)
- **Layer 0**: `surface` — fond
- **Layer 1**: `surface-container-low` — cartes de contenu
- **Layer 2**: `surface-container-highest` — modals ou états actifs

### Ombres Ambiantes (si nécessaire)
- **Couleur**: `on-surface` (#1f1b17) à 4% opacity
- **Blur**: 40px
- **Spread**: 0px

---

## Responsive

### Mobile-First Collapse (< 768px)
- Tous les layouts multi-colonnes deviennent single-column
- Pas de scroll horizontal (critical failure)
- Typo: headlines en `clamp()`, body minimum 1rem/14px
- Touch targets: minimum 44px

---

## Anti-Patterns (Interdits)

- ❌ Pas de "Scroll to explore", flèches rebondissantes
- ❌ Pas de gris pur — toujours des undertones "Stone" ou "Sand"
- ❌ Pas de bordures 100% opaques pour séparer le contenu
- ❌ Pas de dark mode — ce système célèbre le "Takussan" (golden hour)
- ❌ Pas de cramé de contenu — si doute, ajouter 16px d'espace
- ❌ Pas d'emojis
- ❌ Pas de données fake ("99.98% uptime", "124ms response")
- ❌ Pas de `LABEL // YEAR` formatting type "METRICS // 2024"

---

## Version

- **Nom**: Takussan Heritage
- **Mis à jour**: 2026-04-16
- **ID Stitch**: `a6516aceda3747ad8aeff1f839acbdc5`
