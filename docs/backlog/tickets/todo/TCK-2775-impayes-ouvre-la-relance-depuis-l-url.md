---
id: TCK-2775
title: "L'écran Impayés ouvre la relance depuis son URL : l'accueil y mène au lieu d'embarquer la relance"
status: todo
phase: P2
family: front
estimate: S
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: [TCK-2624, TCK-2660]
blocks: [TCK-2818]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models: []
tags: [front, impayes, relance, accueil, dictionnaire, poids]
---

## Objectif utilisateur

L'admin qui touche « Relancer » sur son accueil arrive sur l'écran Impayés avec la relance déjà ouverte —
la feuille de l'échéance touchée, ou la file guidée des échéances de bail pour « Relancer tout » — sans
retoucher le geste. L'accueil, lui, ne charge plus le code ni les libellés de la relance.

## Contexte

TCK-2624 (lot 1, décision 4 validée le 2026-11-13 avec ce suivi) monte la relance de la famille 6 **sur**
l'accueil : `FeuilleDeRelance` pour une échéance, `FileDeRelance` + `useFileDeRelance` pour « Relancer
tout ». C'est conforme à AC6 (WhatsApp depuis le téléphone de l'admin, journal écrit par l'API, aucun envoi
par Takussan), mais le graphe d'imports de l'accueil atteint alors `admin`, `lease` et `payments` : la
frontière `(dashboard)/app/(accueil)` de `src/i18n/namespaces.json` est passée de 27 à 45 % (mesuré 44,7 %),
le même cas que la fiche du bien (TCK-2639, décision 7, suivi TCK-2758).

Deux voies règlent le poids ; ce ticket prend celle qui ne touche pas aux clés, TCK-2758 l'autre. Le
porteur choisit l'ordre ; les deux peuvent coexister.

## Contrat de données

Aucun endpoint touché. Les lectures restent celles de l'écran Impayés (`payments/history` filtré
`days_late_min=1`, trié `-days_late`, plafond `per_page` 100 de `PaymentController::history`).

## Contraintes strictes (métier)

- **Une seule relance** (décision du porteur du 2026-11-10, point 14 a) : l'écran Impayés ouvre SA feuille et
  SA file, aucune copie.
- L'URL n'écrit rien : arriver sur `…?relance=…` ouvre la feuille ou la file, aucun envoi ni journal tant que
  l'admin n'a pas agi ; un rechargement ne rejoue pas un geste déjà noté.
- Une échéance nommée par l'URL et absente des impayés (soldée entre-temps, autre agence) n'ouvre rien et le
  dit ; l'écran reste utilisable.
- Ordre de la file : celui de « Relancer tout » de l'écran (`ordreDeLaFile`), échéances de bail seules.

## Delta à produire

- [x] `/app/agency/finances?tab=impayes&relance=<id d'échéance>` ouvre `FeuilleDeRelance` de cette échéance ;
  `&relance=file` démarre la file guidée (`useFileDeRelance().demarrer`).
- [x] Le paramètre est retiré de l'URL une fois lu (`history.replaceState`, cf. Notes), pour qu'un retour arrière ne rouvre pas.
- [x] L'accueil de l'admin (TCK-2624) mène à ces URL au lieu de monter la relance ; `FeuilleDeRelance`,
  `FileDeRelance` et `useLireLesEcheancesARelancer` quittent son graphe d'imports.
- [x] `src/i18n/namespaces.json` régénéré (`--update`) : `admin`, `lease`, `payments` quittent la frontière
  `(dashboard)/app/(accueil)` si plus rien ne les lit ; plafond resserré sur la mesure.

## Critères d'acceptation

- [x] AC1 — `…?tab=impayes&relance=77` ouvre la feuille de relance de l'échéance 77 ; aucun appel non-GET au
  chargement.
- [x] AC2 — `…?tab=impayes&relance=file` ouvre la file sur l'échéance de bail la plus en retard ; une échéance de
  réservation n'y entre pas.
- [x] AC3 — `…&relance=999` (absente) : rien ne s'ouvre, un message le dit, la table s'affiche.
- [x] AC4 — Après lecture, l'URL ne porte plus `relance` ; un retour arrière ne rouvre rien.
- [x] AC5 — « Relancer » de l'accueil (rangée et carte du téléphone) est un lien vers ces URL ; la frontière de
  l'accueil ne sert plus `admin` (mesure `check-i18n-namespaces.mjs --report`).
- [x] Ablation : ignorer le paramètre fait rougir AC1 et AC2 ; ne pas le retirer de l'URL fait rougir AC4.

## Hors périmètre

- Le déplacement des clés de la relance hors de `admin` (TCK-2758).
- La relance du bailleur ou de l'hôte (aucune relance de leur accueil).

## Notes d'implémentation (2026-11-14)

- **Preuves.** `src/components/admin/finances/impayes/__tests__/relance-de-l-adresse.tck-2775.test.tsx` (12 tests, sous
  `StrictMode`) : AC1 (feuille au téléphone, dossier en mode relance au bureau, aucun non-GET, une seule lecture), AC2
  (« 1 sur 3 », la réservation la plus en retard exclue, la file part de l'échéance de bail la plus en retard), AC3
  (999, et une réservation du même identifiant : rien ne s'ouvre, le message, la liste), AC4 (adresse remplacée sans
  `relance` ni `bail`, aucun `push`, remontage sans demande). `AFaireAdmin.tck-2624.test.tsx` : AC5 (les trois liens,
  aucun bouton de relance, aucune lecture à 100 depuis l'accueil). `finances/__tests__/relance-par-l-adresse.tck-2775.test.tsx` :
  la vraie page (`AdminFinancesClient` → `AdminFinancesTabs`) passe la demande à l'écran. Ablations sur le code final,
  une à une, md5 restauré : paramètre ignoré → 12/12 rouges (AC1, AC2…) ; retrait supprimé → 3 rouges dont AC4 ;
  réservations admises → 4 rouges ; garde de double lecture retirée → 2 rouges ; passage de la prop coupé dans
  `AdminFinancesTabs` → le test de la page rouge.
- **Mesure i18n** (`check-i18n-namespaces.mjs --report`) : la frontière `(dashboard)/app/(accueil)` passe de 34
  espaces · 104 717 o · **46,6 %** à 32 espaces · 71 842 o · **32,0 %** ; `admin` et `lease` la quittent (relevé des
  chaînes d'imports : plus aucune), `payments` reste (`CarteDuLoyer` du locataire). Le plafond se resserre par
  `--update` (52 → 37 %). L'échéance d'exemple de l'accueil lit donc ses libellés sous `accueil.admin.impayes.ligne`
  (copie des périodes d'`admin.finances.argent`) : la lecture de l'écran (`useLectureDImpaye`) tirait `admin`.
- **Écart au delta : `history.replaceState` et non `router.replace`.** Mesuré au navigateur (390 px, 2026-11-14) :
  `router.replace` s'écrit dans une transition, après l'ouverture de la file, et remplaçait l'entrée sentinelle de
  `useFermeAuRetour` — le geste retour ne fermait plus la file et ne quittait plus l'écran. Synchrone, le retrait la
  précède ; Next 16 reporte `replaceState` sur `useSearchParams`. Re-mesuré : retour 1 ferme la file, retour 2 rend
  l'accueil, « avant » ne rouvre rien ; au bureau, retour → accueil. Aucun `MISSING_MESSAGE`, aucune écriture au
  chargement (relevé CDP), y compris après avoir retiré `admin` et `lease` de la frontière de l'accueil
  (« 755 000 F · Loyer de décembre » lu sous les clés de l'accueil, aucune clé en clair). Le test d'ordre (retrait avant `pushState`) ne voit pas la transition de Next : la preuve
  de ce point est le relevé au navigateur.
- **`&bail=<bail>`** (ajouté) : sans filtre par identifiant dans `payments/history`, une échéance se retrouve en lisant
  les 100 plus en retard ; `bail` restreint la lecture au bail (`filter[entity_type]=lease`), pour une échéance au-delà
  (la fiche du bail, TCK-2818). Le message d'absence ne nomme pas de cause.
- **La lecture vient du composant Impayés, l'adresse de la page.** `Impayes` ne lit jamais l'adresse (Rapports le
  monte, TCK-2629) : `AdminFinancesClient` lit et retire le paramètre (`useRelanceDemandeeParLAdresse`) et le passe
  par `AdminFinancesTabs`. La lecture des échéances a quitté `lib/queries/accueil.ts` pour
  `impayes/lire-les-echeances.ts`.
- **Dépendances non `done`.** Ce ticket s'appuie sur ce que TCK-2624 (la rangée et la carte « Impayés » de l'accueil)
  et TCK-2660 (`FeuilleDeRelance`, le dossier, `FileDeRelance`) ont déjà livré sur la branche. Il ne dépend pas de leur
  reste : les AC de fidélité F1–F6 des deux, et les cases de TCK-2624 encore à cocher. Une reprise de la fidélité de
  l'accueil (TCK-2624) devra seulement savoir que « Relancer » y est un lien, au même habillage que le bouton d'avant. Les clés `accueil.admin.impayes.{rienARelancer,lectureEchouee,plafondAtteint}` sont retirées,
  leur équivalent vit sous `admin.finances.impayes.adresse` (le texte du plafond change : « depuis l'écran Impayés »
  n'a plus de sens sur l'écran).

- **Hors périmètre, signalé.** L'AC6 de TCK-2624 (« ouvre le geste de la famille 6 ») est désormais un lien vers
  l'écran qui l'ouvre. Aucun relevé de fidélité n'a été pris pour le passage bouton → lien : même `buttonVariants`,
  même classe ; à reprendre avec la fidélité de l'accueil.
