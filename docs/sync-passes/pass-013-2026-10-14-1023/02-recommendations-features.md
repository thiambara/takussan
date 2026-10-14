# 02 — Recommandations à `features.md`

> Passe 013 — 2026-10-14 10:23. Conventions et limites : `00-summary.md`.
> Mesurée sur `docs/convergence-specs-lot-3` `b3793a0a` (lots 1 à 3 de convergence appliqués) :
> `docs/features.md` sha1 `3c3c46ff` (725 lignes), `docs/models-spec.md` sha1 `a745a8ce` (5095 lignes,
> 99 sections). Base de dev migrée lue en lecture seule (222 migrations du dépôt + 5 du paquet
> `lemonsqueezy/laravel`), sans les deux migrations de TCK-639 (#378).

Seize recommandations, mesurées sur le code et la base. Les recommandations F1 à F16 des passes 011 et
012 ont été appliquées par les lots 1 et 3 de convergence, **sauf F4** (« permissions granulaires »,
reprise ici en FA1 — troisième passe) **et F11** (accusés de lecture : non appliquée parce que la
mesure la contredit — un groupe compte jusqu'à 20 participants, le déclencheur d'EF5 est atteint ; la
décision revient au porteur, par ticket).

## Résumé des actions

| ID | Ligne | Action | Priorité |
|----|-------|--------|----------|
| FB1 | §2.3 l.542 | « Notifications push web et mobile » (P1) n'a **aucun** support — le seul ❌ de la passe : reclasser (P3 / EF) ou ouvrir un ticket | **Haute — ❌** |
| FA1 | §1.1 l.89 | « permissions granulaires » d'un collaborateur : aucune colonne, rôle seulement (F4, troisième passe) | Haute — faux |
| FA3 | §1.5 l.221, 222 | Free Money et Stripe n'ont aucun pilote de paiement en ligne ; Lemon Squeezy, livré, n'est pas nommé | Haute — faux |
| FA2 | §1.3 l.154 | L'acompte est déjà calculé par l'API (TCK-530) | Moyenne — faux |
| FB2 | §1.7 l.273 | « en temps réel » est faux (diffusion à `log` partout) | Moyenne — faux |
| FB3 | §1.9 l.351 | Qui signe pour le bailleur | Moyenne |
| FB4 | §2.1 l.487 | Règle d'auto-bascule du profil actif | Moyenne |
| FB5 | §2.1 l.493 | Audit du changement de profil actif : non livré | Moyenne — faux |
| FB6 | §2.9 l.666 | L'expéditeur n'est pas réglable | Moyenne — faux |
| FB8 | §2.1 prose l.497 | La machine à états commune d'onboarding n'existe pas | Moyenne — faux |
| FB9 | §2.2 l.520 | `tenant` et `customer` ne sont pas portés par un profil | Moyenne |
| FA4 | §1.1 l.79 | Format de la référence d'un bien | Basse |
| FA5 | §1.1 l.104, §1.3 l.174 | Deux P3 livrées | Basse |
| FB7 | — | Sept P3 de fonctionnalités livrées | Basse |
| FA6 | §1.2 l.141 | L'alerte WhatsApp sans compte est éteinte par défaut | Basse |
| FA7 | §1.4 l.187 | Langue d'un locataire sans compte | Basse |

---

## Texte intégral — §1.1 à §1.6


#### FA1 — §1.1 l.89 : « permissions granulaires » d'un collaborateur (F4, troisième passe)
**Constat.** La ligne promet « part de commission explicite et permissions granulaires ». `property_collaborators`
n'a pas de colonne `permissions` (`\d`, §8 qui le dit en toutes lettres) : un collaborateur porte un
`role` parmi quatre (`manager`, `co_owner`, `agent`, `viewer`) et une part. F4 des passes 011 et 012,
ni appliquée ni écartée par les lots 1-3 (le lot 1 a appliqué F1, F2, F3, F5, F16 ; le lot 3 F6 à F15).
**Proposition.** Remplacer « et permissions granulaires » par « et un rôle (agent, gestionnaire,
co-propriétaire, lecteur) » ; si des permissions par collaborateur sont voulues, les sortir en ligne P2/P3
distincte, sans modèle aujourd'hui.

#### FA2 — §1.3 l.154 : l'acompte est déjà calculé par l'API
**Constat.** La ligne présente le 30 % comme une « estimation affichée dans le tunnel » à déplacer un
jour au backend par `GET /api/bookings/quote`. Depuis TCK-530, `BookingQuote` calcule total et acompte
**à l'écriture**, depuis le bien et les dates (location `daily` : prix × nuits ; `weekly` : prix × nuits
/ 7 ; `monthly` / `yearly` refusée — elle relève du bail ; vente : le prix), arrondi au franc. Aucune
route `quote` n'existe ; le client n'envoie plus de montant.
**Proposition.** Réécrire : « Paiement d'acompte et solde — acompte = 30 % du total, calculé par l'API à
la demande depuis le bien et les dates (une location mensuelle ou annuelle relève du bail, §1.4) (TCK-530) ».
Retirer la phrase sur l'endpoint futur.

#### FA3 — §1.5 l.221 et l.222 : les fournisseurs de paiement en ligne
**Constat.** Les deux lignes nomment Free Money (et l.221 Stripe) parmi les passerelles. Pilotes de
paiement mesurés : Wave, Orange Money, Lemon Squeezy (`PaymentGatewayService`, `PaymentProvider`).
Free Money n'existe que comme moyen de **versement** (l.233, `PayoutMethodKind`) et comme moyen saisi à la
main ; Stripe n'a qu'une fiche d'identifiants au registre des intégrations, sans pilote. Le lecteur
croit payable en ligne ce qui ne l'est pas.
**Proposition.** l.221 : « Intégration d'une passerelle de paiement — livrées : Wave, Orange Money,
Lemon Squeezy ; Free Money et Stripe sans pilote à ce jour ». l.222 : « (Wave / Orange Money) ».

#### FA4 — §1.1 l.79 : le format de la référence
**Constat.** L'exemple `TK-2025-001` suggère un rang continu. La référence est `TK-` + année + six
caractères aléatoires (`Property::booted()`), unique en base.
**Proposition.** « (ex : TK-2026-7QK2ZD — année et suffixe aléatoire) ». Même correction dans §3 (MA10).

#### FA5 — §1.1 l.104 et §1.3 l.174 : deux P3 livrées
**Constat.** La détection des doublons (§74-75, ADR-0054) et l'abonnement iCalendar personnel (§72,
ADR-0034) sont en production de code, écran compris. Le lot 3 a promu pour la même raison les lignes
« commissions » (P3 → P1) et « absence datée » (P3 → P1).
**Proposition.** Les reclasser P2 (ordre de leur livraison, TCK-597 et TCK-591), ou garder P3 en ajoutant
« — livré » ; décider une règle pour toutes les P3 livrées, que la passe suivante appliquera.

#### FA6 — §1.2 l.141 : l'alerte WhatsApp sans compte est éteinte par défaut
**Constat.** `SEARCH_ALERTS_WHATSAPP_ENABLED=false` dans `config/search_alerts.php`, `.env.example` et
`.env.docker` ; §87 le dit, la ligne présente WhatsApp comme disponible.
**Proposition.** Ajouter « (WhatsApp derrière un drapeau, éteint par défaut) ».

#### FA7 — §1.4 l.187 : la langue d'un locataire sans compte
**Constat.** Un locataire sans compte est relancé en français, explicitement (`ContactSansCompte`) : la
fiche client ne porte aucune langue.
**Proposition.** « dans sa langue (celle de son compte ; sans compte, le français) ».

---


## Texte intégral — §1.7 à §2.10


#### FB1 — §2.3 l.542 : la ligne P1 « Notifications push web et mobile » n'a aucun support
**Constat.** Aucun abonnement push ni jeton d'appareil, en spec, en base ou en code ; le canal `push`
est une diffusion qui n'est pas provisionnée (`BROADCAST_CONNECTION=log`, D-65). Une ligne MVP qui
promet ce que rien ne porte.
**Proposition.** La réécrire sur le modèle de l.275 : « Notifications push web et mobile — non livré :
aucun abonnement de navigateur ni jeton d'appareil n'est stocké ; l'interrupteur `push` du profil et la
case `push` des préférences n'ont pas de transport (D-65) », et la ramener en P2 (ou P3), à trancher
par le porteur.

#### FB2 — §1.7 l.273 : « en temps réel » est faux
**Constat.** Le front interroge l'API toutes les 3 s (fil), 10 s (liste), 30 s (cloche) ; aucun
transport de diffusion (D-65, décision du porteur du 2026-10-06).
**Proposition.** « Notification in-app (rafraîchie par interrogation périodique, pas en temps réel —
D-65) + email ».

#### FB3 — §1.9 l.351 : qui signe pour le bailleur
**Constat.** `LandlordSignatory` accepte le bailleur pour lui-même **ou** un membre du personnel de
l'agence du bail détenant `leases.sign`, pour son compte ; §24 le décrit
(`owner_signed_on_behalf_of_user_id`).
**Proposition.** Remplacer « chacune par un tracé et pour elle-même seulement — un collaborateur du
bien ne signe jamais pour le bailleur » par « chacune par un tracé ; le bailleur signe pour lui-même,
ou un membre du personnel de l'agence détenant `leases.sign` signe pour lui au titre du mandat (qui et
pour qui sont enregistrés) ; un collaborateur du bien ne signe jamais pour le bailleur ».

#### FB4 — §2.1 Profils l.487 : règle d'auto-bascule
**Proposition.** « Bascule automatique du profil actif quand les profils **actifs** de l'utilisateur
sont tous dans **une seule agence** (plusieurs profils de la même agence tolérés) ; jamais entre deux
agences ». Même correction dans Règle 4 (MB15).

#### FB5 — §2.1 Profils l.493 : audit du changement de profil actif non livré
**Proposition.** Ajouter « — le changement de profil actif n'est pas journalisé aujourd'hui ; les
créations et suspensions le sont (`team_member_suspended`, traits `Auditable`) ».

#### FB6 — §2.9 l.666 : l'expéditeur n'est pas réglable
**Proposition.** « Configuration des gabarits d'e-mail (`notification_templates`) ; l'expéditeur relève
de la configuration d'environnement, pas de la console » — ou ouvrir un ticket s'il doit l'être.

#### FB7 — Priorités P3 de fonctionnalités livrées
**Constat.** l.305 (TCK-594, §77), l.601 (§64), l.602 (§65), l.622 et 623 (TCK-600, §59), l.678
(TCK-572, §60), l.679 (§58) sont livrées et modélisées, et restent P3 — la note de priorisation
(« P3 = futur ») les dit à faire.
**Proposition.** Les requalifier (P2) ou les annoter « livré (TCK-NNN) », à trancher par le porteur.

#### FB8 — §2.1 Onboarding, prose l.497 : la machine à états commune n'existe pas
**Proposition.** Remplacer « Tous les profils traversent la même machine à états `draft → pending →
active → suspended | expired | archived` » par les statuts réels, en renvoyant à `models-spec.md` :
propriétaire `draft/active/inactive/blocked`, agent et prestataire `draft/active/inactive/suspended`,
admin d'agence `active/suspended/archived` ; l'expiration est celle de l'**invitation**, pas du profil.

#### FB9 — §2.2 l.520 : `tenant` et `customer` ne sont pas portés par un profil
**Proposition.** « … `agency_admin`, `agent`, `owner`, `service_provider` (portés par le profil
polymorphe correspondant, scopés par son agence) ; `customer` et `tenant` dérivés — plancher de toute
identité, bail actif (Règle 5, TCK-492) ».
