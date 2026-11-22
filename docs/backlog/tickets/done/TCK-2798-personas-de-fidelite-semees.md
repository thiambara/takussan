---
id: TCK-2798
title: "Les personas des relevés de fidélité viennent d'un seeder idempotent et réversible"
status: done
phase: P2
family: technique
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models: []
tags: [back, seeders, demo, fidelite, personas, invitation, onboarding, outillage]
---

## Objectif utilisateur

Qui relève un écran de l'audit UX (invité, intervention d'origine, compte neuf, hôte) trouve sa persona dans
la base de démo locale, sans négocier d'écriture temporaire ni la défaire ensuite ; et l'outil de fidélité ne
révoque plus que les jetons des personas qu'on lui nomme.

## Contexte mesuré

- Décision 6a du porteur (2026-11-13) : un script idempotent unique fournit les personas, une fois pour toutes.
- Chaque relevé d'un écran que la démo n'atteint pas écrivait puis défaisait : `users.phone_verified_at` de
  trois comptes de la démo et une invitation 190 (TCK-2613), une invitation 189 (TCK-2611), deux comptes 187 et
  189 avec leurs 160 préférences et 6 lignes de journal (TCK-2608).
- Le 2026-11-13, `fidelite.mjs jetons --renouveler` a refrappé les jetons de **toutes** les personas :
  `jetons.php` révoque en base les jetons `fidelite-pixel` de chaque compte frappé ; les agents qui relevaient en
  même temps ont perdu leur session. Le fichier `~/.takussan-fidelite/jetons.json` était en outre réécrit d'après
  une lecture faite au début de l'appel (lecture-modification-écriture sans verrou).

## Décision sur TCK-2776

**TCK-2776 reste à part, non couvert, et hors de `depends_on`.** Il corrige la graine elle-même
(`UserSeeder`, `PropertySeeder` : l'agence 4 « Studio de Aminata » et son hôte `admin@studio-aminata.sn`), et
son AC1 attend un `migrate:fresh --seed` du porteur. Ce ticket-ci ne touche à aucune ligne de la graine : il
sème **un hôte parallèle**, `hote@personas.takussan.test`, dans son propre espace `individual`, bailleur de ses
trois biens. L'accueil de cet hôte rend `role: owner` et `portfolio_total` 3 (mesuré par la vraie route) ; il ne
montre ni visites, ni réservations, ni avis — l'hôte de la démo, une fois TCK-2776 livré, reste celui des relevés
qui ont besoin d'une activité.

## Personas

Toutes sous `@personas.takussan.test`. Mot de passe : celui des comptes de démo (`DemoUsersSeeder::DEFAULT_PASSWORD`).
Nom de persona = clé de `takussan-web/scripts/fidelite/personas.json`.

Colonne « Vu » : ce qui a été éprouvé le 2026-11-13 sur la base de démo locale — `nav.` = relevé `releve` de l'outil
au téléphone (390), écran reconnu à ses textes ; `API` = la route seule.

| Persona (outil) | E-mail | Rôle et état | Écran servi | Vu |
|---|---|---|---|---|
| `personas-gerant` | `gerant@personas.takussan.test` | admin de « Agence des personas » (`standard`, slug `personas-agence`) ; l'invitant de tous les invités | `/app` : accueil d'une agence presque vide (« Bonjour Mariama », KYC à compléter) | nav. |
| `personas-bailleur-invite` (invitation) | `bailleur-invite@personas.takussan.test` | **sans compte** : `OwnerProfile` `draft` sans titulaire, invitation `owner` `sent`, valable un an | `/invitations/accept?token={invitation}` — maquette `app-entree-invitation` (TCK-2611), sans compte ou connecté | nav. (« Mariama vous invite comme bailleur ») + API |
| `personas-agent-invite` (invitation) | `agent-invite@personas.takussan.test` | **sans compte** : `AgentProfile` `draft`, invitation `agent` `sent` | même écran, rôle agent | API |
| `personas-prestataire-invite` (invitation) | `prestataire-invite@personas.takussan.test` | **sans compte** : `ServiceProviderProfile` `draft`, collaboration `paused`, invitation `service_provider` `sent` | même écran, rôle prestataire | API |
| `personas-prestataire-intervention` | `prestataire-intervention@personas.takussan.test` | Demba Sow, numéro `+221700027910` vérifié ; profil prestataire `active`, une seule collaboration `active` ; invitation `accepted` avec `from_maintenance_request_id` (lien non consommé) ; demande « Fuite sous l'évier de la cuisine », plomberie, `open`, non assignée, Mermoz | `/onboarding/service-provider?sp=<id>` — écran a-2 « Prestataire » de `app-entree-assistants` (TCK-2613). **Sans `?sp=`, la page montre le panneau multi-agences.** L'id, en lecture seule : `php artisan tinker --execute='echo App\Models\Profiles\ServiceProviderProfile::query()->whereHas("user", fn($q)=>$q->where("email","prestataire-intervention@personas.takussan.test"))->value("id"), PHP_EOL;'` | nav. (« Une intervention vous attend », la demande) + API |
| `personas-orientation-awa` | `orientation-awa@personas.takussan.test` | Awa Diop, numéro `+221700027920` vérifié, aucune intention d'entrée, aucun profil | `/onboarding/intention` — écrans a-1 à a-4 de `app-entree-orientation` (TCK-2608) | nav. (« Bienvenue, Awa », trois portes) |
| `personas-orientation-sans-prenom` | `orientation-sans-prenom@personas.takussan.test` | prénom et nom vides, numéro `+221700027921` vérifié, aucune intention, aucun profil | `/onboarding/intention` — écran a-0 « Prénom » (TCK-2608) | nav. (« Comment vous appelez-vous ? ») |
| `personas-hote` | `hote@personas.takussan.test` | Fatou Ba, numéro `+221700027930` vérifié ; admin ET bailleur de « Espace de Fatou » (`individual`, slug `personas-espace-hote`), titulaire de ses 3 biens (`private`) | `/app` de l'hôte : « Ce mois » compte ses biens (contrepartie de TCK-2776) | nav. (« Bonjour Fatou », Espace de Fatou) + API (`owner`, 3) |

Les invités n'ont pas de compte, donc pas de jeton : `fidelite.mjs jetons` relit le jeton de leur invitation, et
`releve` / `balayer` le posent par `--invitation <persona>` à la place de `{invitation}` dans la requête de
`--url`. Le relevé garde le gabarit (`source.url`) ; `meta.reseau` masque le jeton (`<jeton>`).

## Contraintes strictes

- Aucune ligne de la graine n'est lue pour être modifiée : le seeder ne crée ou ne remet que ses lignes,
  repérées par le domaine (comptes) et par les slugs `personas-…` (agences, biens).
- Aucun envoi : ni service d'invitation ni d'onboarding (ils envoient courriel et SMS, `SpaceCreated`) ; lignes
  écrites comme `InvitationSeeder`. Les invitations en attente expirent dans un an et sont marquées rappelées :
  ni `remindPending()` ni `expire()` ne les prennent.
- Ni journal d'activité, ni index de recherche pendant le semis ; biens `private`.
- Semis et retrait refusés hors des environnements `local` et `testing` (des comptes au mot de passe connu, dont
  un gérant d'agence).
- Le retrait est exact et atomique : une ligne de la démo qui dépendrait d'une ligne des personas fait échouer la
  transaction entière.

## Delta produit

- [x] `takussan-api/database/seeders/Demo/PersonasDeFideliteSeeder.php` — le semis, idempotent et convergent.
- [x] `takussan-api/database/seeders/Demo/RetirerPersonasDeFideliteSeeder.php` — le retrait.
- [x] `takussan-api/tests/Feature/Seeders/PersonasDeFideliteSeederTest.php`.
- [x] `takussan-web/scripts/fidelite/fidelite.mjs` — `jetons` ne frappe que ce qui manque, `--renouveler` exige
  `--persona a,b` ; `--invitation` pour `releve` et `balayer` ; `balayer --persona aucune`.
- [x] `takussan-web/scripts/fidelite/jetons.php` — révocation limitée aux comptes demandés (inchangé), fichier
  relu sous verrou puis remplacé d'un bloc ; relecture des invitations.
- [x] `takussan-web/scripts/fidelite/personas.mjs` (+ `src/__tests__/fidelite-jetons.tck-2798.test.ts`) — la
  sélection des jetons et le remplissage de l'URL, purs et testés.
- [x] `takussan-web/scripts/fidelite/personas.json` — les huit personas ci-dessus.

## Critères d'acceptation

- [x] AC1 — Deux exécutions successives du seeder rendent le même nombre de lignes dans **chaque** table et les
  mêmes comptes ; le retrait rend le compte de chaque table d'avant le semis, et laisse un témoin
  `…@personas.takussan.test.example`. (Test, et base de démo locale : voir Notes.)
- [x] AC2 — `GET /api/me/profiles/{sp}/intervention-d-origine` rend la demande (`data.id`, `data.title`) au
  prestataire de l'intervention ; après un lien consommé et une demande assignée, une nouvelle exécution la rend
  de nouveau.
- [x] AC3 — Les trois invitations sont servies par `GET /api/public/invitations/{token}` ; six jours plus tard,
  `remindPending()` et `expire()` n'en prennent aucune ; aucun courriel ni notification.
- [x] AC4 — `jetons --renouveler` sans `--persona` échoue sans rien frapper ; `jetons --persona …` ne réécrit que
  les entrées nommées du fichier partagé.
- [x] AC5 — `GET /api/dashboard/me` de `personas-hote` rend `role: owner`, `portfolio_total` 3.

## Hors périmètre

- La graine de l'agence 4 (TCK-2776).
- Le relevé des écrans eux-mêmes (tickets de fidélité de chaque page).

## Notes d'implémentation

2026-11-13 :

- **Lancer** (depuis `takussan-api/`) :
  `php artisan db:seed --class='Database\Seeders\Demo\PersonasDeFideliteSeeder'` ;
  retrait : `php artisan db:seed --class='Database\Seeders\Demo\RetirerPersonasDeFideliteSeeder'`.
  Ni l'un ni l'autre n'est branché sur `DatabaseSeeder` : `migrate:fresh --seed` ne sème pas les personas.
- **Convergent** : une relance remet invitation utilisable, demande ouverte et non assignée, lien non consommé,
  intention effacée, numéros vérifiés. Exception : un invité dont l'invitation a été **acceptée** (un compte est
  né sur son e-mail) n'est pas ramené en arrière — la relance le signale ; retirer puis semer.
- **Le retrait** emporte aussi ce que les gestes ont accroché aux personas : jetons Sanctum, journal d'activité
  (sujet ou auteur), préférences de notification (cascade), agences dont une persona est titulaire (un « Publier »
  d'un compte d'orientation crée un espace). Puis il purge l'index de recherche de ce qu'il a retiré, après le
  commit (un index injoignable est signalé, sans échec).
- **Mesuré sur la base de démo locale (port 5433)** : décompte exact de chaque table (146) avant, après un
  semis, après un second semis : identique au premier (seule différence, la file `jobs`, au premier semis : quatre
  `RevalidatePublicPropertyPage` mises en file par `Address::saved` ; l'adresse n'est désormais réécrite que si
  elle change, et la relance n'en met plus aucune). Retrait : chaque table revient à son compte d'avant, sauf
  `scheduled_task_runs` (le planificateur, indépendant). Puis semé de nouveau : les personas sont en place.
  Par la vraie API locale, jetons relus par l'outil : intervention 200 avec la demande, accueil de l'hôte
  `owner` / 3, les trois invitations 200.
- **Outil, au navigateur** (front `:3000`, téléphone 390) : un relevé par persona de compte et un relevé de
  l'invitation du bailleur par `--persona aucune --invitation personas-bailleur-invite` ; chaque écran est celui
  du tableau. Dans le relevé de l'invitation, le jeton (brut ou encodé) apparaît **0** fois ; `source.url` garde
  le gabarit. Le jeton d'une invitation est relu de la base à chaque relevé : après un retrait puis un semis, il
  a changé, et l'ancien ouvrirait l'écran « lien invalide » en 200.
- La base de démo a été semée, relancée, retirée puis semée de nouveau : les identifiants des personas sont ceux
  du second semis.
- Jetons des huit personas frappés dans `~/.takussan-fidelite/jetons.json` par `jetons --persona …` : les 12
  entrées existantes du fichier sont intactes.
