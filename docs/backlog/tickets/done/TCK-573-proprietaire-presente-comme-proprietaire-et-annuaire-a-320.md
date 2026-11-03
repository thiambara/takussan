---
id: TCK-573
title: "Un propriétaire est présenté comme propriétaire sur sa fiche /agents, dans l'annuaire et dans l'équipe d'une agence ; annuaire /agents à 320 px : cibles de 44 px et champ de recherche lisible"
status: done
phase: P2
family: full
estimate: S
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
  models: []
tags: [full, fiche-agent, annuaire, fiche-agence, seo, donnees-structurees, mobile, a11y, retour-testeur]
---

## Objectif utilisateur

Un visiteur qui ouvre la fiche d'un particulier qui publie — un propriétaire — lit « Propriétaire »,
jamais « Agent immobilier » : dans le titre de l'onglet, sur la page, dans l'annuaire `/agents`,
dans l'équipe d'une agence, et les moteurs de recherche reçoivent la même chose. Les liens existants
vers `/agents/<slug>` continuent d'aboutir. Sur un téléphone de 320 px, chaque ville de l'annuaire
se touche au pouce et le champ de recherche se lit en entier.

## Contexte

**Décision du porteur (2026-09-24), qui relâche TCK-436 (§ 1, option b)** : un propriétaire garde sa
page publique sous `/agents/<slug>` (liens existants depuis les fiches de bien, l'équipe d'agence et
le sitemap : pas de 404), mais il y est présenté comme **propriétaire** — titre, `<title>`,
métadonnées, libellé, données structurées (`Person`, pas `RealEstateAgent`). Même règle pour
l'annuaire. Restes de TCK-560 (hors périmètre de son unité).

Mesures prises avant correctif, 2026-09-24, pile locale :

- `curl /fr/agents/owner.agency4` → **200**, `<title>Property Owner — Agent immobilier — Takussan</title>`,
  un nœud JSON-LD `"@type":"RealEstateAgent"`.
- `GET /api/public/agents/owner.agency4` : **aucun champ** ne distinguait un propriétaire d'un agent
  (`specialty`, `agency`, `years_of_experience` à `null`, rien d'autre). Le front ne pouvait pas le
  savoir.
- SQL sur la base de développement : les **44** profils de l'index public portent un
  `OwnerProfile`, **aucun** un `AgentProfile` ou un `AgencyAdminProfile`. L'annuaire `/agents` est
  donc, en développement, un annuaire de propriétaires — titré « Agents & conseillers », « Les
  professionnels derrière les annonces », chaque carte donnant le nom de l'agence sous le nom de la
  personne (« Oumy Sow / Thiès Properties » se lit « agent de Thiès Properties »).
- `GET /api/public/agencies/dakar-immo` : `stats.agents` = **18**, dont **11 propriétaires** (et
  7 agents ou admins). La fiche d'agence affichait « 18 agents pour t'accompagner » et la statistique
  « Agents : 18 ».
- Annuaire `/fr/agents?city=Dakar`, CDP, émulation tactile : puces de villes et « Effacer les
  filtres » à **36 px** de haut aux quatre largeurs (320, 360, 390, 1366). À 320 px, champ de
  **168 px** à côté de « Rechercher » en toutes lettres (110 px) : texte d'exemple de 178 px pour
  168, rendu « Nom d'un ager » (capture). En et wo tenaient (bouton plus court).

## Ce qui change

**API** — `PublicProfileFacts::rolesPublics()` : `agent` pour un professionnel de l'immobilier en
exercice (`AgentProfile` ou `AgencyAdminProfile` **actif**, ou `BrokerProfile`, que la fiche de
bien présente déjà comme agent), `owner` pour tout le reste — repli sûr : chaque personne listée
est le bailleur d'un bien (TCK-142). Trois requêtes quel que soit N. Émis en `public_role` par
`GET /api/public/agents` (chaque ligne), `GET /api/public/agents/{slug}` et l'équipe de
`GET /api/public/agencies/{slug}` ; `stats.agents` de l'agence ne compte plus que les agents.
Projection fixe, sans `allowedFields()`, comme avant (docblock de `public-profiles.ts`) : une clé de
plus, aucune donnée personnelle.

**Front** —
- Fiche `/agents/[slug]` : `<title>` et Open Graph « {nom} — Propriétaire » ; l'eyebrow s'ouvre sur
  la qualité (« Propriétaire · Dakar » / « Agent immobilier · Dakar · Location ») ; « Agent chez »
  et le texte vide « Cet agent prépare… » réservés aux agents.
- `jsonLdAgent()` : tout ce qui n'est pas explicitement `agent` est une `Person` (nom, URL,
  description, image, téléphone, ville) — sans `aggregateRating` ni `parentOrganization`, que
  `Person` n'admet pas.
- Annuaire : chaque carte dit « Propriétaire · <agence> » ou « Agent immobilier · <agence> » ; la
  page devient « Agents & propriétaires / Les personnes derrière les annonces », les métadonnées
  « Agents immobiliers et propriétaires [à <ville>] » ; texte d'exemple « Nom ou prénom ».
- Équipe d'agence (`TeamStrip`) : la qualité sur chaque carte ; titre « N interlocuteurs pour
  t'accompagner », flèches « interlocuteurs » ; la statistique « Agents » ne compte que les agents.
- `ProfileFilters` : puces et « Effacer » en `min-h-11 pointer-fine:min-h-9` (44 px au doigt, 36 à
  la souris) ; sous `sm`, le bouton de recherche ne garde que son icône (44 × 44), son nom
  « Rechercher » restant lu (`sr-only sm:not-sr-only`) ; au-delà de `md`, champ et bouton ne
  descendent à 40 px qu'à la souris (`md:pointer-fine:h-10`) — sur une tablette tactile, `md:h-10`
  seul les rendait à **40 px** (mesuré à 768 × 1024 et 1024 × 768 en émulation tactile, reprise du
  2026-09-24).

## Critères d'acceptation

- [x] AC1 — `GET /api/public/agents/owner.agency4` → `public_role: owner` ;
      `/api/public/agents/dakar-immo-agent-1` → `agent` ; `/api/public/agencies/dakar-immo` →
      `stats.agents` = 7 (mesuré). `tests/Feature/Public/PublicRoleTest.php` (7 tests : fiche,
      agent suspendu / **admin suspendu** / admin actif / courtier, **tout statut autre
      qu'`active`** des deux enums — agent `draft`, `inactive`, `suspended`, admin `suspended`,
      `archived` —, index, équipe, et **l'équipe juge le rôle par la règle** — agent suspendu →
      `owner`, admin actif et courtier → `agent`, reprise du 2026-09-24) — ablation :
      règle forcée à `agent` → 4 rouges ; statistique non filtrée → 1 rouge ; courtier retiré → 1
      rouge ; `->active()` retiré côté **admin d'agence** → 1 rouge (réparation 1) ; `active()` affaibli en « tout sauf `suspended` », côté agent puis côté
      admin → 1 rouge chacun (réparation 2) ; rôle de l'équipe lu sur la seule présence d'un
      `AgentProfile` de l'agence → 1 rouge (reprise des défauts mineurs) ; **dans l'équipe d'une
      agence, « agent » veut dire agent DE CETTE AGENCE** — un agent ou un admin actif d'une autre
      agence qui publie sous l'enseigne y est `owner`, et hors de `stats.agents` ; sa fiche
      `/agents/{slug}` le dit toujours `agent` (réparation 1 des défauts mineurs : code d'avant →
      1 rouge, conjonction retirée → 1 rouge) ; restauré à l'identique (md5). `tests/Feature/Public` :
      264 verts (avant réparation 2).
- [x] AC2 — `curl /fr|en|wo/agents/owner.agency4` : `<title>Property Owner — Propriétaire |
      Property owner | Boroom kër — Takussan</title>`, un seul nœud `"@type":"Person"`, aucun
      `RealEstateAgent`, eyebrow « Propriétaire » ; `/fr/agents/dakar-immo-agent-1` garde « Ousmane
      Ndiaye — Agent immobilier » et `RealEstateAgent` (mesuré). `page.server.test.tsx` (3 tests
      TCK-573) et `jsonld-profil.test.ts` (3) — ablations : titre forcé agent, qualité forcée agent,
      `Person` retiré → rouges. **Repli** : un `public_role` absent ou inconnu est présenté en
      propriétaire (titre, eyebrow, `Person`) — `it.each` dans les deux fichiers ; les mutations de
      la vérification (`!== 'owner'` au titre, `=== 'owner'` au balisage) → 4 rouges, le titre
      seul → 2 rouges (réparation 2).
- [x] AC3 — annuaire `/fr|en|wo/agents?city=Dakar` à 320, 360, 390 et 1366 : cartes
      « Propriétaire · Thiès Properties » / « Property owner · … » / « Boroom kër · … » ;
      `IndexDeProfils.test.tsx` (2 tests) — ablation → rouge.
- [x] AC4 — fiche `/fr/agencies/dakar-immo` à 1366 et 320 : 11 cartes « Propriétaire », 7 « Agent
      immobilier », titre « 18 interlocuteurs pour t'accompagner », statistique « 7 Agents »
      (mesuré) ; `TeamStrip.tck-573.test.tsx` — ablation → rouge.
- [x] AC5 — annuaire à 320/360/390 (fr, en, wo), émulation tactile : puces et « Effacer » à
      **44 px**, bouton de recherche 44 × 44 au premier plan (`elementFromPoint`), champ de
      236/276/306 px, texte d'exemple entier (largeur du texte mesurée au canvas `measureText` dans
      la police calculée du champ, comparée à la largeur de contenu du champ — `clientWidth` moins
      les marges intérieures ; `scrollWidth` n'en dit rien, un `placeholder` ne le fait pas
      varier), 0 px de défilement
      horizontal ; à 1366 (souris) puces et « Effacer » à 36 px, bouton « Rechercher » en toutes
      lettres (mesuré). Re-mesuré à la reprise (CDP, `matchMedia('(pointer: coarse)')` relevé
      avec chaque mesure) : champ de **236/276/306 px** à 320/360/390 (texte d'exemple 120 px pour
      188/228/258 de contenu en fr ; en 128, wo 101), bouton 44 × 44 au premier plan, puces et
      « Effacer » 44 px, 0 px de défilement horizontal, `innerWidth` égal à la largeur demandée ;
      **tablette tactile** 768 × 1024 et 1024 × 768 : champ et bouton 44 px (40 avant la reprise),
      puces 44 ; 1366 souris : puces 36, champ et bouton 40. `ProfileFilters.test.tsx` (3 tests,
      contrat de classes : jsdom ne pose aucune mise en page) — ablations des trois règles →
      rouges, restaurées à l'identique (md5).
- [x] AC6 — cliquet de contraste de la surface publique inchangé (7 verts) ; `check-i18n` et
      `check-i18n-namespaces` verts ; `tsc --noEmit` 0 ; ESLint 0 sur les fichiers touchés.
- [x] AC7 — fiche d'un propriétaire RATTACHÉ à une agence (`/fr/agents/thies-properties-owner-2`,
      360 tactile) : « Oumy Sow — Propriétaire », eyebrow « Propriétaire », aucun « Agent chez »,
      nœud `Person` ; « Retour » 85 × 44 au premier plan sur les fiches d'agent et d'agence à 320,
      360, 390 et 1366 (mesuré à la reprise).
- [ ] AC8 — rejoué sur preview.takussan.com (authentification Basic : hors de portée de l'agent).
- [x] AC9 — le contact d'une fiche nomme son destinataire (réparation 2). `/fr/agents/owner.agency4`
      à 1366 (souris) : dialogue « Vos coordonnées sont transmises à ce propriétaire. Aucun compte
      n'est requis. », toast « Message envoyé. / Le propriétaire vous recontactera sous peu. » ;
      en à 390 tactile (feuille mobile puis dialogue) « …forwarded to this owner… » / « The owner
      will get back to you shortly. » ; wo à 320 tactile « …jox boroom kër bii… » / « Boroom kër gi
      dina la jokkoo ci lu gàtt. » ; contrôle `/fr/agents/dakar-immo-agent-1` à 1366 « …à cet
      agent… » / « L'agent vous recontactera sous peu. », en à 360 « this agent » / « The agent
      will get back… » (CDP, envoi par le pot de miel : l'API répond 201 **sans rien écrire** —
      0 piste « Mesure U3 » en base, vérifié). `ContactSheet.tck-573.test.tsx` (4 tests :
      propriétaire, rôle absent → propriétaire, agent, anglais) — ablation : les deux props retirées
      de `ContactSheet` → 4 rouges ; la page qui ne transmet plus `recipientRole` → 2 rouges
      (`page.server.test.tsx`) ; restaurées (md5).

## Hors périmètre

- Les écrans « Agent introuvable » / « Agent momentanément indisponible » : le serveur n'a alors
  rien dit de la personne, la qualité n'est pas connue. À neutraliser (« Profil introuvable ») si
  le porteur le veut.
- La carte de contact d'une fiche de bien (`PropertyAgentCard`) garde sa propre règle
  (`PropertyResource::actsAsAgent()`, relative à l'agence du bien) : elle affiche l'agence ou
  « Particulier », jamais « Agent immobilier » pour un propriétaire. Les deux règles coexistent ;
  les unifier est un autre ticket.
- L'URL `/agents/<slug>` elle-même (décision du porteur : pas de redirection).
- ~~Le formulaire de contact d'une **fiche de bien** garde le texte « transmises à l'agent du
  bien », y compris pour un bien publié par un particulier~~ — corrigé par la session, voir
  « Reprise par la session » ci-dessous.
- Sur mobile, la feuille « Contacter » reste ouverte sous le formulaire (mesuré : deux
  `role=dialog` montés) et réapparaît après l'envoi. Antérieur à ce ticket, sans effet sur la
  qualité affichée ; non modifié.
- `docs/features.md` : la ligne proposée est remise à la session (collision).

## Notes d'implémentation

- API : `app/Services/Public/PublicProfileFacts.php` (`rolesPublics`),
  `app/Http/Controllers/Public/PublicAgentController.php`, `PublicAgencyController.php` ; aucune
  ressource neuve (tableaux composés dans les contrôleurs, comme avant).
- Front : `app/[locale]/(public)/agents/[slug]/page.tsx`, `lib/jsonld-profil.ts`,
  `lib/queries/public-agent.ts`, `public-profiles.ts`, `public-agency.ts`,
  `components/public/index/{ProfileCard,IndexDeProfils,ProfileFilters}.tsx`,
  `components/public/profile/TeamStrip.tsx`, `components/public/profile/ContactSheet.tsx`
  (`recipientRole`), `components/public/AnonymousLeadDialog.tsx` (`successBody`).
- i18n : `publicProfile.roles.{agent,owner}`, `agents.publicPage.{metaTitleOwner,emptyBodyOwner}` ;
  réécrites : `publicProfileIndex.agents.{eyebrow,heading,intro,searchPlaceholder}`,
  `meta.agents.*`, `agency.publicPage.teamHeading`, `publicProfile.team.{prevAria,nextAria}` ;
  réparation 2 : `publicProfile.contact.{leadDescriptionAgent,leadDescriptionOwner,leadSuccessAgent,leadSuccessOwner}`.

## Reprise du 2026-09-24 (unité U3, v4)

Le premier jet de ce ticket a été écrit par une tentative interrompue de l'unité, sans rapport. Tout
ce qui est coché ci-dessus a été **ré-exécuté** à la reprise, rien n'a été repris sur parole :

- API : `PublicRoleTest` 4/4 ; `tests/Feature/Public` 264 verts ; ablations rejouées — règle
  forcée à `owner` → 4 rouges, courtier retiré → 1, `->active()` retiré → 1, statistique non
  filtrée → 1 ; restaurées (md5). Pint propre.
- Front : 11 ablations rejouées (titre, eyebrow, « Agent chez », `Person`, qualité de carte,
  qualité d'équipe, puces, `sr-only`, et les deux règles de tablette) → chacune rouge, restaurée
  (md5). `tsc --noEmit` 0, ESLint 0, `check-i18n` et `check-i18n-namespaces` verts, cliquet de
  contraste 7 verts (compte inchangé).
- **Défaut trouvé à la reprise, corrigé** : champ et bouton à 40 px sur tablette tactile (cf. AC5).
- **Casse d'une autre unité, absorbée dans les tests** : TCK-572 fait monter les bandeaux du site
  (clients, React Query) par `NavbarSpacer` ; les trois tests de page de ce périmètre
  (`IndexDeProfils.test.tsx`, `agents/[slug]` et `agencies/[slug]/page.server.test.tsx`), qui ne
  montent pas de `QueryClientProvider`, rougissaient à 20 tests (« No QueryClient set »). La cale
  y est simulée comme la barre et le pied le sont déjà : du décor de page, hors de leur sujet.
- `curl` : 44/44 slugs de l'index en 200 sur `/fr/agents/<slug>` ; `/fr|en|wo/agents/owner.agency4`
  titrés « Propriétaire | Property owner | Boroom kër », un nœud `Person`, zéro `RealEstateAgent`.

## Réparation 1 du 2026-09-24 (unité U3) — les quatre défauts mineurs de la vérification

- **`->active()` de `AgencyAdminProfile` non gardé — reproduit, corrigé.** Le retirer de
  `PublicProfileFacts::rolesPublics()` laissait `PublicRoleTest` à 4/4 verts (mesuré : « 4 passed
  (14 assertions) ») : un admin d'agence suspendu serait passé pour « Agent immobilier » sans
  qu'aucun test ne le voie. Le test des profils suspendus crée désormais aussi un admin suspendu
  (`AgencyAdminProfile::factory()->suspended()`) et affirme `public_role: owner`. Ablation rejouée :
  `->active()` retiré côté admin → « 1 failed, 3 passed » ; restauré par copie, md5
  `e7a6d32d8a2f0f0065c6810451ed259d` identique ; 4/4 verts (15 assertions), Pint propre.
- **Chiffres périmés de l'AC5 (234/274/304) — reproduit, corrigé.** Re-mesuré au navigateur
  (CDP, tactile, `pointer: coarse` vrai) : champ **236** (fr et wo à 320), **276** (en à 360),
  **306** (fr à 390) ; texte d'exemple entier, bouton 44 × 44, 0 px de défilement horizontal.
  La première phrase de l'AC5 porte désormais ces chiffres ; même correction dans TCK-560
  (« Hors périmètre »).
- Au passage : la mesure relève des boutons `aria-pressed` de **0 px** de haut à 320. Ce ne sont
  pas des puces de l'annuaire : ce sont les six catégories de la barre publique (`NAV`,
  « Appartement » … « Bureau »), masquées sous `md`. Aucun défaut.
- **Libellé « Les agents » du pied de page — reproduit, NON corrigé ici (hors périmètre).** Le
  lien du pied vers `/agents` dit encore fr « Les agents », en « Agents », wo « Jaayekat yi »
  (`footer.professionals.agents`), alors que l'annuaire s'intitule « Agents & propriétaires ».
  Changer la clé fait rougir `components/home/__tests__/Footer.test.tsx:161`, qui asserte le nom
  du lien et n'appartient à aucune unité de cette vague : remis à la session, avec le texte
  proposé.

## Réparation 2 du 2026-09-24 (unité U3) — le contact, et trois gardes manquantes

- **Majeur — le contact présentait le propriétaire en agent. Reproduit, corrigé.** Sur
  `/fr/agents/owner.agency4` (`public_role: owner`), le formulaire anonyme disait « Vos coordonnées
  sont transmises à l'agent du bien » et le toast « L'agent vous recontactera sous peu » : les deux
  libellés par défaut d'`AnonymousLeadDialog` (`publicContact.description`, `successBody`), que
  `ContactSheet` ne surchargeait pas. « du bien » était faux même pour un agent — une fiche de
  personne n'a pas de bien. `ContactSheet` reçoit la qualité (`recipientRole`, passé par la page
  depuis `public_role`) et fournit description et corps du toast, par la nouvelle prop
  `successBody` du dialogue partagé ; le repli est `owner`, comme partout sur ces fiches. La piste
  arrive bien à la personne (`recipient_user_id`, `PublicAgentController::contactLead`) : « à ce
  propriétaire » est exact. Mesures et ablations : AC9.
- **Statuts d'agent non gardés. Reproduit, corrigé.** `active()` remplacé par
  `where('status', '!=', 'suspended')` laissait `PublicRoleTest` à 4/4 : un profil `draft` ou
  `inactive`, un admin `archived` seraient passés pour agents. Le test neuf tire les statuts des
  enums (`AgentProfileStatus`, `AgencyAdminProfileStatus`) : un statut ajouté demain est éprouvé
  sans retour ici. Ablations côté agent et côté admin → 1 rouge chacune ; 5/5 verts (23
  assertions), Pint propre.
- **Repli « rôle inconnu → propriétaire » non gardé. Reproduit, corrigé.** Cf. AC2.
- **Méthode de l'AC5. Exacte, corrigée.** `scrollWidth` d'un champ ne dépend pas de son
  `placeholder` ; l'AC cite désormais la mesure au canvas qui fonde le verdict. Re-mesuré :
  fr 320 → 120 px de texte pour 188 de contenu, en 360 → 128 pour 228, wo 390 → 101 pour 258.
- **Libellé « Les agents » du pied de page : toujours reporté** (hors périmètre, cf. réparation 1) — corrigé ensuite par la session, voir la dernière section.

## Reprise par la session (2026-09-24) — les deux restes remis

- **Contact d'une fiche de bien.** `PropertyContactMessageDialog` reçoit `destinataireEstAgent`
  (le `is_agent` du destinataire que la fiche annonce, `primary_contact ?? owner`, calculé par
  `PropertyResource::actsAsAgent()`). Un bien reçu par un particulier dit « Vos coordonnées sont
  transmises au propriétaire du bien » et « Le propriétaire vous recontactera sous peu », dans les
  deux chemins (anonyme et connecté) ; sans indication, le texte de l'agent reste. Clés
  `publicContact.descriptionOwner` et `successBodyOwner` (fr/en/wo). Tests :
  `PropertyContactMessageDialog.test.tsx` (+3) ; correctif retiré → **2 rouges**.
- **Pied de page.** `footer.professionals.agents` dit « Agents & propriétaires » / « Agents &
  owners » / « Ajaŋ ak boroom kër » — le titre de l'annuaire, mot pour mot. `Footer.test.tsx:161`
  suit.

## Reprise des défauts mineurs (2026-09-24)

**Défaut de garde, reproduit.** Dans l'équipe de `GET /api/public/agencies/{slug}`,
`public_role` (`PublicAgencyController.php:297`, `$roles[(int) $u->id] ?? 'owner'`) n'était éprouvé
qu'avec « propriétaire sans profil » et « agent actif ». Mutation du vérificateur, rejouée :
`'public_role' => $profile !== null ? 'agent' : 'owner'` (le rôle lu sur la seule présence d'un
`AgentProfile` rattaché à l'agence, tous statuts) → `PublicRoleTest` **5/5 verts**. Or cette
mutation présente en « agent » un profil **suspendu** — qui reste dans l'équipe, la liste des
membres n'étant pas filtrée par statut —, et en « propriétaire » un **admin d'agence actif** ou un
**courtier** qui publie sous l'enseigne, faute d'`AgentProfile`.

**Aucun défaut de code** : le contrôleur délègue déjà à `PublicProfileFacts::rolesPublics()`
(`AgentProfile` ou `AgencyAdminProfile` **actif**, ou `BrokerProfile` → `agent` ; le reste →
`owner`). Seule la garde manquait.

**Test ajouté** : `test_l_equipe_suit_la_regle_des_roles_publics_et_non_la_presence_d_un_profil_d_agent`
— une agence avec un agent suspendu, un admin actif et un courtier publiant sous l'enseigne ;
attendu `{admin: agent, agent suspendu: owner, courtier: agent}` et `stats.agents` = 2. Vert sur le
code (6/6, 26 assertions). Mutation ci-dessus → **1 rouge** (le nouveau test seul : « two arrays
are identical »), 5 verts ; restauré par `cp`, md5 `06ab79e7…` identique. Pint propre.

**Observé, non traité (hors du défaut signalé)** : un agent dont le profil est **suspendu** reste
listé dans l'équipe publique de son agence — désormais sous « Propriétaire », ce qui est juste pour
le rôle, mais sa présence même dans l'équipe relève d'une décision produit que ce ticket ne prend
pas.

## Reprise des défauts mineurs (2026-09-24) — réparation 1 (M3)

Défaut mineur de la vérification adverse : `rolesPublics()` compte comme professionnel un
`AgentProfile` ou un `AgencyAdminProfile` actif **dans n'importe quelle agence**
(`app/Services/Public/PublicProfileFacts.php:296-318`, aucun filtre `agency_id`).

**Reproduit** par un test écrit d'abord :
`test_un_agent_d_une_autre_agence_qui_publie_sous_l_enseigne_y_est_presente_en_proprietaire`. Une
agence A réunit un agent actif de B et un admin actif de B, qui publient chacun sous l'enseigne A un
bien dont ils sont bailleurs, et un agent actif de A. Sur le code d'avant, **rouge** : les deux
personnes de B sont rendues `agent` dans l'équipe de A (attendu `owner`), et comptées dans
`stats.agents`.

**Corrigé dans `PublicAgencyController`** (le service partagé n'est pas touché ; la fiche
individuelle `/agents/{slug}`, qui ne parle d'aucune agence, garde la règle telle quelle). Le rôle
dans l'équipe est la **conjonction** de `rolesPublics()` et d'un profil `AgentProfile` ou
`AgencyAdminProfile` **actif dans cette agence** ; un courtier (`BrokerProfile`, rattaché à aucune
agence) reste `agent`. Une requête de plus par profil, bornée à l'équipe (`whereIn`).

**Mesures** : `PublicRoleTest` 7/7 (30 assertions) ; `tests/Feature/Public/{PublicRole,
PublicProfileIndex,PublicProfile,AgentContactLead}Test.php` 49/49 ; Pint propre. **Ablations**
(copie dans `scratchpad/ablation/M3/`, restauration par `cp`, md5 `c77e52af…` identique) : contrôleur
d'avant → 1 rouge (le nouveau test) ; conjonction neutralisée (`$professionnelsIci->has(…)` → `true`)
→ 1 rouge ; mutation d'origine `$profile !== null ? 'agent' : 'owner'` → toujours 1 rouge.

**Toujours hors du ticket** : la présence même d'un agent suspendu dans l'équipe publique (voir la
section précédente) — décision produit.
