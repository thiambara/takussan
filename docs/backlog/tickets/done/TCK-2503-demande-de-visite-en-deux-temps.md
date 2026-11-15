---
id: TCK-2503
title: Demande de visite en deux temps : quand, puis qui, et un écran de suite
status: done
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: [TCK-2501, TCK-2502]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
tags: [front, visits, mobile, audit-ux]
---

## Objectif utilisateur

Le chercheur demande une visite sans compte en deux écrans qui tiennent chacun sans défiler, et sait ce qui va se passer ensuite.

## Contrat de données

`POST /api/public/properties/{slug}/visit-request` avec `date` + `preferred_window` (TCK-2502) ; `scheduled_at` reste possible.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=visite&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Quand ? », « Qui ? », « Envoyée », téléphone et bureau.
- Quand : quatre jours proposés et une tranche de la journée ; Qui : nom et téléphone (+221 déjà posé), e-mail facultatif ; Envoyée : ce qui va se passer, et la prochaine action (dossier, alerte).
- Sous `md`, une feuille plein écran avec bouton collant ; en bureau, un dialogue de 520 px au plus, ou la carte de réservation.
- Récapitulatif du bien en tête de chaque écran.

## Contraintes strictes (métier)

- Aucun compte demandé ; connecté, nom et téléphone sont préremplis.
- Le type de visite se replie (sur place par défaut) ; les quatre types restent choisissables.
- Les textes légaux d'information sur les données (TCK-590) restent.

## Delta à produire

- [ ] Parcours en deux écrans puis écran de suite, lancé depuis la barre de la fiche (TCK-2501).
- [ ] Tests : envoi par tranche ; préremplissage connecté ; bouton toujours visible ; erreurs 422 rendues sur le bon champ.

## Critères d'acceptation

- [ ] AC1 — À 360 px, chaque écran tient sans défilement et son bouton est visible.
- [ ] AC2 — Une demande « jeudi, après-midi » envoie `date` + `preferred_window=afternoon` (vérifié au réseau) et affiche l'écran de suite.
- [ ] AC3 — Le parcours complet se fait au clavier seul en bureau.

## Hors périmètre

- Le choix d'une heure parmi les disponibilités de l'agent.
- Le dépôt de dossier (« Postuler »).

## Notes d'implémentation

**Mesures avant de coder (2026-11-09, `feat/audit-ux-vague-2`)** — ce que le ticket et la maquette affirmaient, ce que le code rend :

- **Trois tranches, pas quatre.** La maquette `?p=visite&a=a` propose Matin / Midi / Après-midi / Soir ; l'API (`VisitWindow`) n'en connaît que trois : `morning` (début 09:00), `afternoon` (14:00), `evening` (17:00), heure de Dakar. « Midi » n'existe pas : retiré.
- **Fenêtre de 30 jours, pas 60.** `TrancheDeVisite::MAX_DAYS = 30` (aujourd'hui inclus, J+30 inclus) ; les 60 jours de l'ancien calendrier étaient ceux de `visit-slots`, que la demande par tranche n'appelle plus.
- **Une tranche entamée est refusée** (`visits.window_started`) : le front grise, le jour même, les tranches dont le début (Dakar) est passé, et ne propose « aujourd'hui » que s'il reste une tranche.
- **Pas de champ « Me répondre sur WhatsApp »** dans `VisitRequestPublicPropertyRequest` : l'interrupteur de la maquette n'est pas rendu. Ni délai de réponse de l'agent ni jours de visite dans `PropertyOwnerLite` : « confirme en général en ~2 h », « fait visiter du lundi au samedi » ne sont pas rendus (rien d'affiché plutôt qu'un chiffre inventé).
- **« Ton numéro n'est transmis qu'à Sokhna »** n'est pas sûr : la demande va aux destinataires de `ContactLeadService::recipientsFor` (plusieurs possibles). La mention de TCK-590 (`MentionDeConfidentialite`) reste, seule.
- **Connecté** : l'ancienne boîte masquait nom et téléphone. Le contrôleur (`PublicPropertyController::visitRequest`, l. 880-882) prend `visitor_name` / `visitor_phone` envoyés AVANT ceux du compte : les champs sont désormais rendus préremplis depuis le compte (`full_name`, `phone`) et envoyés.
- La maquette tutoie ; le site vouvoie.

**Livré et mesuré (2026-11-09).**

- **Au réseau (AC2)** — demande envoyée depuis la fiche `appartement-3-chambres-a-mermoz-pE41ZD`, visiteur anonyme. Corps de l'action serveur : `{"date":"2026-11-11","preferred_window":"afternoon","type":"in_person","visitor_name":…,"visitor_phone":"+221771234567"}`, sans aucun `scheduled_at`. Réponse `{"ok":true}`. L'écran de suite affiche « Mercredi 11 novembre, l'après-midi — heure à fixer » et jamais « 14:00 ».
- **À 360 × 780 (AC1)** — l'écran Envoyée débordait d'abord de 90 px sous le bouton collant (corps : `scrollHeight` 737 pour `clientHeight` 647). Correction : la barre de titre de 56 px est retirée de cet écran seulement, la croix flotte au coin, et les espacements sont resserrés. Le contenu mesure ensuite 681 px pour 703 disponibles, avec un nom de contact long (« Awa Diop (navigateur) »).
- **Les écrans Quand et Qui tiennent dans le viewport.** À 360, Qui : 647 = 647. À 390 × 844 : Quand 480 / 681, Qui 554 / 711, Envoyée 638 / 767. Aucun défilement horizontal du document.
- **À 1440 × 900** — dialogue de 520 px. Hauteurs : Quand 575, Qui 590, Envoyée 608.
  - Parcours au clavier : on va d'une tranche à l'autre avec les flèches, l'anneau de focus est visible, on valide par Tab puis Entrée sur « Continuer ». Le focus passe alors sur « Comment vous joindre ? ».
  - Le calendrier « Autre date » s'ouvre et reste ouvert dans le navigateur. Le 9 décembre (J+30) est actif, le 10 (J+31) est grisé. Choisir le 20 novembre ferme le popover et met « Autre date : Vendredi 20 novembre » en `aria-pressed`. Échap ne ferme que le popover.
  - « Préparer mon dossier » ferme la demande et ouvre la boîte de dossier : « Connectez-vous pour postuler » en anonyme.
  - Après un envoi, fermer puis rouvrir la boîte la remet à zéro.
- **Préremplissage d'un compte** — le nom passe par `nomCompletDe` (`@/lib/identite`, `check-nom-affichable`). Sans nom, le champ reste vide plutôt que d'y mettre l'e-mail ou le numéro.
- **Gardes partagées touchées** :
  - `surface-publique.contraste.test.ts` : deux lignes d'ardoise retirées, `group-hover:bg-foreground/10` et `bg-destructive/10` de l'ancienne boîte, qui n'existent plus.
  - `eslint-suppressions.json` : l'entrée `PropertyVisitDialog` retirée (`no-misused-promises` 1, `no-autofocus` 1). C'est une baisse.
  - Le compte d'encres inverses de mes fichiers est ramené à celui de HEAD.
- **Ablations : 15, toutes rouges puis restaurées**, md5 identique à chaque fois. Elles portent sur : la borne `<=` de la tranche entamée, le premier jour ouvert, J+31, `scheduled_at` ajouté à la charge, le soir à 18:00, une tranche entamée qu'on pourrait choisir, le retour à l'écran 1 sur un 422 de date ou de tranche, l'erreur placée sous le bon fieldset, le préremplissage d'un compte, une tranche entamée qui resterait retenue, le bandeau sur une erreur de champ, le pied hors de la zone qui défile, le focus déplacé, les coordonnées retenues, et l'action « dossier » seulement pour une location au dossier.

**Corrections de la revue adverse (2026-11-09).**

- **Aucune heure de fin inventée.** L'API ne connaît que le début des tranches (`VisitWindow::startTime`). Les cartes affichent désormais « Matin · à partir de 9 h », « Après-midi · à partir de 14 h » et « Fin de journée · à partir de 17 h », avec une espace insécable pour que « 14 h » ne se coupe pas à 360 px. L'aide devient « L'agence vous propose ensuite une heure précise. » : `ConfirmPropertyVisitRequest` n'impose pas que l'heure confirmée tombe dans la tranche, donc on ne le promet plus.
- **Décision 3a gardée là où elle vit.** `__tests__/dossier-apres-visite.test.tsx` rend `PropertyDetailContent` (ses enfants sont doublés). « Préparer mon dossier » est proposé pour une location au mois, et jamais pour une vente ni pour un séjour court. Inverser la condition rend les 3 tests rouges.
- **L'horloge de la boîte avance.**
  - Elle se relit à l'ouverture puis toutes les 15 s, et l'heure réelle est relue au clic. Une tranche qui commence pendant que la boîte est ouverte se grise et n'est plus retenue.
  - Si elle commence pendant qu'on remplit l'écran 2, « Envoyer » ramène à l'écran 1 avec « Ce moment de la journée vient de commencer : choisissez-en un autre. », et rien ne part.
- **Compte connecté sans téléphone.** Il peut envoyer, comme avant : le téléphone est marqué « (facultatif) » et n'est pas envoyé (`visitor_phone` est nullable pour un authentifié). Un numéro saisi doit rester valide.
- **Focus initial** sur le premier contrôle de l'écran, c'est-à-dire le premier jour proposé ou le choix déjà fait, et non plus « Fermer ».
- **À 360 × 740**, contenu et place disponible :

  | Écran | Contenu | Disponible |
  |---|---|---|
  | Quand | 497 | 577 |
  | Qui | 554 | 607 |
  | Envoyée | 631 | 663 |

  Sur l'écran Envoyée, c'est le cas le plus long : « en fin de journée » et un contact sur deux lignes.
- **Écart assumé avec la lettre du ticket.** L'écran Qui ne reprend pas le récapitulatif du bien, seulement la puce jour · tranche avec « Modifier ». C'est fidèle à la maquette (`ContenuQui` n'a pas de `RecapBien`). Les écrans Quand et Envoyée l'ont tous les deux.
- **Nettoyage de la base de dev locale** (127.0.0.1:5433) : suppression des visites 2563 à 2566 créées par la revue, et des visites 2560 à 2562 et 2567 (« Awa Diop TCK2503 ») de mes propres essais au navigateur.

**Partager et favori sur la photo, au téléphone (2026-11-09).** Cette demande vient de la session, pour coller à la maquette de la fiche (approche A) et au relevé `docs/qa/audit-ux-2026-11/entetes-mobiles.md`.

- **Sous `md`**, `GestesSurPhoto` se pose dans l'`action` de l'en-tête sur photo de TCK-2568 (`EnTeteDePage variante="sur-photo"`), à droite du retour.
  - Le partage ouvre la boîte de partage de la fiche.
  - Le favori est le `FavoriteButton` partagé. Une prop facultative `surPhoto` lui donne la pastille pleine du retour, sans changer son rendu ailleurs.
  - `PropertyHeader` n'affiche ces deux boutons qu'à partir de `md` (`hidden md:inline-flex`). Le comparateur reste au bout de la rangée des pastilles (`pr-32` → `pr-14`).
- **Mesuré à 390 × 844** :
  - retour 44 × 44 à (12, 12) ;
  - partager 40 × 40 à (290, 14) et favori 40 × 40 à (338, 14), avec une zone tactile de 44 px ;
  - les deux boutons sous le titre sont masqués, le comparateur est à (346, 446) ;
  - `scrollWidth − innerWidth = 0` ;
  - le cœur passe au terracotta puis revient ; le partage ouvre « Partager cette annonce ».
- **À 800 et à 1440 :** les gestes sur la photo sont masqués et « Partager · Ajouter · Comparer » restent sous le titre, comme avant. À 800, la rangée de retour fait 56 px. À 1440, aucun défilement horizontal.

**Contre-vérification 2 (2026-11-09).**

- **Le pied de l'écran 1** n'annonce plus que la tranche réellement choisie (`resumeDuChoix`). Il se vide (« Choisissez un jour et un moment. ») dès qu'elle commence, en même temps que « Continuer » se désactive. Testé avec une horloge simulée, et l'ablation rend le test rouge.
- **Le cœur plein est terracotta (`text-primary`) partout.** Le `fill-destructive` de `PropertyHeader` a été retiré pour s'aligner sur `FavoriteButton`. Testé, et l'ablation rend le test rouge.
