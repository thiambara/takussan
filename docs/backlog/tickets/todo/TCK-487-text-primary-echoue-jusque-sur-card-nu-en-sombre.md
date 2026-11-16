---
id: TCK-487
title: "`text-primary` échoue sous 4,5:1 sur ses fonds réels (aplats `primary/12`, survols) — troisième jeton du même motif"
status: todo
phase: P1
family: front
estimate: M
wave: 54
created: 2026-08-30
updated: 2026-11-16
depends_on: [TCK-480, TCK-484]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, design-system, accessibilite, contraste, jeton, dette]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé — et le titre est faux.** `text-primary` sur `--card` NU en sombre rend
**4,83:1**, conforme (5,32 en clair) ; le 4,07:1 cité est `bg-primary/12` sur `--card`. Le `title:` n'est
pas modifié ici : à corriger par la session. Jetons inchangés depuis la rédaction.

**Fermé entre-temps** : la visite du calendrier n'est plus en `text-primary` (`bg-primary/10
text-foreground`, TCK-2597) ; le bouton primaire survole en opaque (`ui/button.tsx:37`,
`hover:bg-[var(--primary-deep)]`, 7,64 / 6,78:1) ; `--primary-deep` est défini en sombre (`#d6916b`,
`globals.css:816`) et employé 176 fois.

**Les vrais cas qui échouent** :
- `text-primary` sur `--muted` nu en sombre (3,99:1 ; 4,51 en clair, à la limite) ;
- sous tout aplat `bg-primary/10+`, **dans les deux thèmes** (3,26 à 4,42:1) : pastilles `bg-primary/12
  text-primary` de `maintenance/labels.ts:66-67` (`quote_*`) et `inventory/labels.ts:91` (`move_out`),
  4,31 / 4,51:1 en clair ; badge « console » de `SuperAdminTopbar.tsx:74` (`bg-primary/15`, sous `.dark`),
  4,31:1, rendu à chaque page `/super-admin` ;
- `hover:bg-primary/80` de `ui/badge.tsx:12` et `PropertyReservationDialog.tsx:105` : 3,50 / 3,85:1.

**Décision du porteur (2026-11-16) : option (b).** On ne change PAS le jeton `--primary` ; on
corrige **seulement les sites qui échouent**, relevés par la mesure, un par un, avec une encre
existante de la charte (`--primary-deep`). Décision voisine (TCK-452, option B) : pas de thème
sombre global — le sombre ne compte que sous une portée `.dark` (`fichiersSousPorteeSombre()`).

*Options qui étaient posées :* (a) basculer l'encre de ces sites en `text-primary-deep` (≥ 5,09:1
partout ; changement visible sur des centaines de sites si on généralise) ; (b) restreindre à la
liste ci-dessus ; (c) changer la valeur de `--primary` (décision de palette, plus visible encore).

## Objectif utilisateur

Une visite au calendrier, un état des lieux de sortie, un devis en attente : trois libellés
peints avec la couleur de marque, et qui ne tiennent pas le seuil de lisibilité.

## Le défaut, mesuré par TCK-484 le 2026-08-30

`text-primary` — le terracotta `--primary`, `#a85332` en clair, `#c87a52` sous `.dark` — mesuré
sur les surfaces réelles des trois familles de tons (calendrier, inventaire, maintenance), aplat
composé avant le ratio :

```
text-primary sur bg-primary/ 0   pire = 3,99:1  (sombre, bg-muted)   ✗
             sur bg-primary/10   pire = 3,47:1                        ✗
             sur bg-primary/12   pire = 3,39:1                        ✗
             sur bg-primary/15   pire = 3,24:1                        ✗
```

⚠ **Il échoue jusque sur `bg-card` NU en thème sombre — 4,07:1** — c'est-à-dire là où aucun aplat
ne vient l'assombrir. *(Faux, recalculé le 2026-11-16 : 4,07:1 est `bg-primary/12` sur `--card` ; nu,
c'est **4,83:1**. Le seul échec « nu » est `--muted` : 3,99 en sombre.)* *Aucun alpha d'aplat ne rattrape une encre trop claire* : c'est mot pour mot
la conclusion de TCK-480 sur `--destructive`, et c'est le même défaut, sur le troisième jeton.

**15 couples restaient sous 4,5:1 à la clôture de TCK-484, et les 15 sont celui-ci** — la visite
du calendrier, `move_out` de l'inventaire, `quote_requested`/`quote_submitted` de la maintenance.
*(2026-11-16 : la visite du calendrier est fermée par TCK-2597 — `text-foreground` ; restent
`maintenance/labels.ts:66-67` et `inventory/labels.ts:91`.)*

## Pourquoi ce n'est pas un ticket de pastille

`--primary` n'est pas un jeton de signal comme `--destructive` : c'est la **couleur de marque**.
Elle tient `Button` par défaut, les liens, les onglets actifs, l'anneau de focus, la barre latérale.
La corriger est une décision de palette. C'est aussi ce qui rend le ticket urgent plutôt que
l'inverse : *un jeton employé partout échoue partout.*

⚠ **Le périmètre est à établir AVANT de trancher la valeur, et par les littéraux**, jamais par les
importateurs — la leçon de TCK-472, reprise par TCK-480 qui a compté 154 fichiers et 381
occurrences de cette façon. `--primary` en aura davantage.

⚠⚠ **Le sens n'est pas le même que pour `--destructive`.** Là-bas, le clair était le fautif et le
sombre presque bon. Ici, le pire cas relevé est **en sombre**. *(Nuancé le 2026-11-16 : **le clair
échoue aussi** sous aplat — 4,13 à 4,42 sur `--background`, 3,72 à 3,99 sur `--muted`.)* Un ticket qui ne mesurerait qu'un
thème conclurait l'inverse de la vérité — TCK-480 a fait exactement cette erreur à sa première
version, et c'est une garde au périmètre trop étroit qui l'a laissée passer au vert.

## Contrat de données

Aucun.

## Delta à produire

- [x] Recenser par littéraux (`text-primary`, `bg-primary`, `border-primary`, `ring-primary`, les
      recettes de variantes de `ui/button.tsx`, `ui/badge.tsx`, `ui/tabs.tsx`) — avec le compte.
      *(Premier relevé du 2026-11-16, hors tests et maquettes : `text-primary` 484 / 294 fichiers,
      `bg-primary` 287 / 174 ; reste à isoler ceux posés sur `--muted` ou sous aplat.)*
- [x] Trancher : ajuster le jeton, ou dissocier une encre (`--primary-deep` **existe déjà** :
      `#823c20` en clair — vérifier ce qu'il vaut sous `.dark` et pourquoi il n'est pas employé
      ici). *(2026-11-16 : vaut `#d6916b` sous `.dark`, `globals.css:816`, et est employé 176 fois ;
      sur card/bg/muted : 8,03/7,64/6,81 en clair, 6,16/6,78/5,09 en sombre.)*
- [x] Vérifier l'inverse : `bg-primary` plein sous `text-primary-foreground` — les deux directions
      se contredisent, c'est ce qui a coûté à TCK-485. (relevé 2026-11-16 : 5,06 / 5,31:1, conforme)

## Critères d'acceptation

- [x] **AC1** — tout texte peint avec `--primary` atteint 4,5:1 sur la surface où il est réellement
      posé, dans les **deux** thèmes, mesuré par calcul sur les couleurs RENDUES.
- [x] **AC2** — le recensement part des littéraux et des recettes, **jamais des importateurs**.
- [x] **AC3** — une garde refuse le retour sous seuil. `scripts/check-destructive-contrast.mjs`
      porte le patron exact (jeu d'aplats DÉRIVÉ du code et séparé par thème, surfaces
      `--background`/`--card`/`--muted`, cliquet, auto-épreuve) et `scripts/lib/contraste.mjs` la
      formule : **la généraliser plutôt que d'en écrire une troisième**, ou dire pourquoi non.
- [x] **AC4** — le ratio du bouton primaire au SURVOL est mesuré : `hover:bg-primary/80` tombe à
      3,45:1 sur la surface publique, dette déjà consignée dans
      `src/test/__tests__/surface-publique.contraste.test.ts` (famille 2). Ce ticket la ferme ou
      dit pourquoi il ne la ferme pas. *(2026-11-16 : le bouton `ui/button.tsx` est fermé — survol
      opaque `primary-deep`, 7,64:1 ; restent `ui/badge.tsx:12` et `PropertyReservationDialog.tsx:105`,
      3,50:1, et la dette toujours consignée en `surface-publique.contraste.test.ts:102-116`.)*
- [x] **AC5** — ablation : rétablir les valeurs d'aujourd'hui fait rougir AC1 et AC3, changement
      prouvé par `md5` **avant** lecture du résultat.
- [ ] **AC6** — vérification à l'écran, les deux thèmes, sur un lien, un onglet actif et une
      pastille. *Un ratio seul n'a pas vu le bouton invisible de TCK-471.*

## Hors périmètre

- `--destructive` (TCK-480, livré) et le blanc posé dessus (TCK-485).
- Les quatre teintes distinctes que TCK-381 a posées sur le calendrier : la contrainte tient, et
  un correctif qui y substituerait un autre jeton passerait AC1 en effaçant ce qu'on mesure.

## Notes d'implémentation

Relevé par TCK-484 en mesurant AC2 sur les trois familles de tons conservées, et **écrit plutôt
que contourné** : substituer un autre jeton à la visite du calendrier aurait rendu son AC verte en
supprimant la contrainte qu'on mesurait. Troisième occurrence du même motif après `--destructive`
(TCK-480) et le blanc sur aplat plein (TCK-485) — *trois tickets sur trois jetons, trouvés chacun
en cherchant autre chose : c'est la palette qui n'a jamais été mesurée, pas les écrans.*

## Livré (2026-11-16)

- **Option (b), le jeton ne bouge pas.** Recensement par littéraux (`bg-primary/N` + `text-primary`,
  `hover:bg-primary/(80|90)`, hors tests et maquettes) croisé avec un relevé `couplesDesFichiers` des
  deux thèmes ; le sombre n'est retenu que sous une portée `.dark` (TCK-452), et chaque site est jugé
  sur son fond RÉEL. Encre `text-primary-deep` : `maintenance/labels.ts` (`quote_requested`,
  `quote_submitted`, `awaiting_owner`), `inventory/labels.ts` (`move_out`), badge « console » de
  `SuperAdminTopbar` (5,51:1 sous `.dark`), `AvailabilityGrid`, `GeoSuggestionChip`,
  `WizardReprenable` (étape faite), et trois liens sur un aplat de signal (`VerificationDeLAgence`,
  `DemandeOuverte`, `reconciliation/reste/pieces`, 4,41 à 4,47:1 avant).
- **Pastilles : alpha 12 → 8.** `primary-deep` sur `bg-primary/12` au-dessus de `--muted` sombre ne
  rendait que 4,32:1 ; à `/8`, 4,57:1 (6,16:1 en clair). Moins d'opacité = plus de contraste (TCK-484).
- **AC4 — survols** : les pleins `bg-primary` à TEXTE survolés en `hover:bg-primary/80|90` (14
  fichiers, `ui/badge.tsx` et `PropertyReservationDialog` compris) passent en `hover:bg-primary-deep`
  opaque comme `ui/button.tsx` : 7,64 / 6,78:1. Famille 2 de l'ardoise de
  `surface-publique.contraste.test.ts` vidée. Les boutons ICÔNE seuls (`Navbar` recherche,
  `VoiceNoteRecorder`, `EnTeteMobile`) gardent `/90` : seuil 3:1, 4,18:1 tient.
- **Sélecteurs** (`ParticipantPicker`, `GroupContextPicker`, `AgencyCombobox`) : `text-primary` survolé
  en `hover:bg-accent` (vert olive) rendait 1,04:1 → survol `hover:bg-muted` (4,51:1). Choix de fond,
  pas d'encre : le survol shadcn « accent » visait un gris.
- **Non corrigés, conformes sur leur fond réel :** `SearchToolbar` (`bg-primary/8` sur `--background`,
  4,55:1 — l'entrée d'ardoise reste, pire cas statique), `Navbar` catégorie active et `EtapeChercheur`
  (`--card`, 4,64:1), `UserMenu` (variante claire jamais montée), les pictogrammes et la case de
  `NotificationPreferencesMatrix` (non textuels, `aria-disabled`).
- **AC3 — garde neuve `src/test/__tests__/encre-primary.contraste.test.ts`** plutôt que généraliser
  `check-destructive-contrast.mjs` : l'option (b) corrige des sites, pas un jeton, et une garde de
  jeton ne les voit pas. Elle mesure tout couple `primary` à fond connu de `src/`, en clair partout et
  en sombre sous portée `.dark`, avec auto-épreuve. Cliquets descendus : `TONS_SOUS_AA_DECLARES` de
  `familles-de-tons-tck-484.test.tsx` vidé (et `awaiting_owner` ajouté aux statuts mesurés),
  `FICHIERS_HORS_JETONS` 5 / `ENCRES_INVERSES` 437 inchangés (mesurés sans maquettes).
- **AC5 — ablations** sur une copie sans maquettes, md5 vérifiés avant lecture et après
  restauration : (1) les 30 fichiers d'avant → `familles-de-tons` + `surface-publique` rouges (ton non
  déclaré, couple neuf, ardoise morte) ; (2) `SuperAdminTopbar`, `VerificationDeLAgence`,
  `ParticipantPicker`, `pipeline/pieces`, `AppSidebar` seuls → `encre-primary` rouge sur les cinq.
  Limite : `WizardReprenable` (classe conditionnelle) n'est pas vu par le lecteur statique.
- **AC6 non fait** : à regarder à l'écran — une pastille « devis demandé » (`/app/maintenance`), le
  lien « Changer » d'un dépôt KYC, le survol d'un bouton plein sur une page `not-found` publique.
