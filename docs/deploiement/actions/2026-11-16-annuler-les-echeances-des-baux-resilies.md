---
titre: "Jouer une fois l'annulation des échéances des baux résiliés avant TCK-1151 (lease:cancel-dues-after-exit), --dry-run d'abord"
type: donnee
tickets: [TCK-607]
cles: []
creee: 2026-11-16
preview: fait
production: a-faire
---

## Quoi faire

Depuis TCK-1151 (2026-10-21), une résiliation annule les échéances de loyer et de charges dont la
période commence après la sortie. Les baux résiliés **avant** n'ont pas été repris : leurs échéances
postérieures sont restées `pending`, `late` ou `failed`. Depuis TCK-607, les tâches de pénalité et de
relance ne les visent plus, mais elles restent affichées comme dues et payables. TCK-607 a livré
`lease:cancel-dues-after-exit`, qui les annule (`cancelled`, jamais supprimées) — avec, comme une
résiliation d'aujourd'hui (TCK-2375), l'échéance de **caution** encore due du bail —, journalisées
`lease_termination_schedule_cancelled` avec `repair: TCK-607`. La commande ne se joue pas au
déploiement : une personne la lance une fois par environnement.

1. `php artisan lease:cancel-dues-after-exit --dry-run` dans le conteneur de l'API : la passe est
   jouée dans une transaction annulée, la sortie dit bail par bail ce qui serait annulé.
2. Relire les lignes « engagées, à rembourser à la main » : une échéance postérieure à la sortie déjà
   réglée, en partie réglée ou sous un paiement en ligne ouvert **n'est pas annulée**. Son
   remboursement est un geste humain, hors de cette commande.
3. Si rien ne surprend : relancer sans `--dry-run`, et garder la sortie avec le relevé.

Aucun état de l'environnement n'est supposé ici : la sortie du `--dry-run` dit s'il y a quelque chose
à reprendre (zéro bail touché est un résultat possible).

## Comment vérifier

Un second passage, `--dry-run` ou non, rend « 0 échéance(s) annulée(s), 0 caution(s) due(s)
annulée(s) ». Seules les échéances engagées restent listées à chaque passage (leurs baux comptent
alors parmi les « bail(s) touché(s) »).

## Historique
- 2026-11-16 · preview · fait · Claude (session, pour le porteur) · 0 bail touché, 0 échéance annulée (4 baux sans date de sortie ignorés)
- 2026-11-16, préproduction — promotion #1691 (`ac2a32f66`, fusionnée 23:27:40 Z, `images.yml` 43979477538 vert à 23:34:49 Z) ; `lease:cancel-dues-after-exit --dry-run` puis réel :
  « 0 bail(s) touché(s), 0 échéance(s) annulée(s), 0 caution(s) due(s) annulée(s), 0 échéance(s) engagée(s) laissée(s),
  4 bail(s) sans date de sortie » (#212, #246, #280, #314 : résiliés sans date de sortie, ignorés). Rien à reprendre.
