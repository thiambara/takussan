# Passe 014 — Recommandations pour `docs/features.md`

**Trois recommandations nouvelles (FC1-FC3).** Les seize de la passe 013 (FB1, FA1-FA7, FB2-FB9)
restent ouvertes et ne sont pas répétées : `features.md` n'a pas changé depuis
([texte intégral](../pass-013-2026-10-14-1023/02-recommendations-features.md)).

| ID | Ligne | Objet | Priorité |
|----|-------|-------|----------|
| FC1 | §2.9 l.671 | Deux voies d'écriture des paramètres globaux, dont une sans journal | **Moyenne — décision au porteur** |
| FC2 | §2.1 l.510 | La carte « Mise en service » n'est plus sur `/admin` | Basse — rédactionnelle |
| FC3 | §2.2 l.528 | L'éditeur de rôles n'est plus à `/admin/roles` | Basse — rédactionnelle |

---

#### FC1 — §2.9 l.671 : la voie brute des paramètres globaux

**Constat.** La ligne promet des paramètres globaux « seules des clés lues par l'application, écrites
par une seule voie validée et journalisée ». La voie du catalogue (`/super-admin/settings`,
`/api/admin/settings`) la tient. La route brute `/api/settings`, servie dans la console depuis
TCK-648 (`/super-admin/settings/global`), refuse les clés du catalogue et `enum.*` mais crée, modifie
et supprime toute autre clé globale, sans journal. Aucune de ces clés n'est lue par le code : la ligne
est fausse sur « seules » et « une seule voie », pas sur l'effet.

**Proposition — au choix du porteur :**

- **(a) Écrire la voie brute.** Ajouter à la ligne : « ; un éditeur brut de la table (`/super-admin/settings/global`) écrit les autres clés globales, qu'aucun code ne lit, sans journal ».
- **(b) La retirer** pour la portée `global` (la route garde la portée `agency`), et ouvrir un ticket :
  la ligne devient vraie telle quelle.

#### FC2 — §2.1 l.510 : « Carte « Mise en service » de l'agence sur `/admin` »

**Constat.** Depuis TCK-647, la carte vit sur le tableau de bord d'agence `/app/overview/agency`.
Elle n'a jamais été montrée à une agence `individual` (`/admin` exigeait `standard`), ce que la ligne
ne dit pas.

**Proposition.** Remplacer « sur `/admin` » par « sur le tableau de bord d'agence (agences `standard`,
[§2.5](#25-reporting--tableaux-de-bord)) ».

#### FC3 — §2.2 l.528 : « écran `/admin/roles` »

**Constat.** L'éditeur de rôles est à `/app/agency/roles` depuis TCK-649 ; `/admin/roles` rend 404.

**Proposition.** Remplacer « (écran `/admin/roles`) » par « (écran `/app/agency/roles`) ».
