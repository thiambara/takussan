/**
 * Conditions générales d'utilisation (TCK-531).
 *
 * Rédigées le 2026-09-17 à la demande du porteur du produit, pour le droit sénégalais et
 * l'espace OHADA / UEMOA, à partir de ce que la plateforme FAIT réellement (relevé dans le code le
 * même jour). ⚠ À faire relire par un avocat inscrit au barreau du Sénégal avant l'ouverture de la
 * production : un texte juridique engage l'éditeur, et aucune relecture interne n'en tient lieu.
 *
 * Règle de rédaction : ce texte ne promet rien que le code ne fasse. Un engagement qu'impose la
 * loi et que le code ne tient pas encore est suivi par un ticket, pas passé sous silence.
 *
 * Markdown réduit (cf. `README.md` de ce dossier). `fr` FAIT FOI ; `en` est une traduction de
 * courtoisie ; `wo` vide → la page affiche le français avec une mention.
 */
import { EDITEUR, VERSION_DOCUMENTS } from './editeur';

export const fr = `
**Version en vigueur au ${VERSION_DOCUMENTS.date}.**

Les présentes conditions générales d’utilisation (les « Conditions ») régissent l’accès à la plateforme ${EDITEUR.marque}, accessible à l’adresse ${EDITEUR.site}, et son utilisation. Elles forment un contrat entre vous et ${EDITEUR.denomination} (« ${EDITEUR.marque} », « nous »), dont l’identité complète figure dans les mentions légales.

Lisez-les attentivement : en créant un compte, en publiant une annonce ou en envoyant une demande de réservation, vous déclarez les avoir lues et les accepter sans réserve.

# 1. Objet de la plateforme

${EDITEUR.marque} est une plateforme numérique de mise en relation et de gestion immobilière au Sénégal. Elle permet notamment :

- aux visiteurs et aux clients de rechercher des biens à louer ou à vendre, de les enregistrer en favoris, de contacter un professionnel, de demander une visite ou une réservation ;
- aux propriétaires, aux hôtes particuliers et aux agences immobilières de publier des annonces et de gérer leurs biens, leurs baux, leurs encaissements, leurs états des lieux, leurs documents et leur relation client ;
- aux prestataires de service d’intervenir sur les demandes de maintenance qui leur sont confiées.

**${EDITEUR.marque} agit comme un intermédiaire technique.** Sauf mention expresse contraire, nous ne sommes ni propriétaire, ni bailleur, ni vendeur, ni mandataire immobilier des biens présentés, et nous ne sommes pas partie aux contrats de bail, de vente, de réservation ou de prestation conclus entre les utilisateurs. Ces contrats sont conclus directement entre les parties concernées, qui en assument seules l’exécution.

# 2. Définitions

- **Utilisateur** : toute personne qui accède à la plateforme, avec ou sans compte.
- **Client** : l’utilisateur qui recherche un bien, envoie une demande de contact, de visite ou de réservation, ou qui est locataire ou acquéreur.
- **Annonceur** : l’utilisateur qui publie une annonce — propriétaire, hôte particulier ou agence.
- **Agence** : l’espace professionnel ouvert sur la plateforme. Une agence « individuelle » est créée par un particulier qui publie son propre bien ; une agence « standard » est une structure professionnelle vérifiée, qui peut réunir plusieurs collaborateurs.
- **Professionnel** : l’agence standard, l’agent immobilier, le prestataire de service ou toute personne qui utilise la plateforme dans le cadre de son activité commerciale ou libérale.
- **Profil** : le rôle sous lequel un utilisateur agit auprès d’une agence (client, propriétaire, agent, administrateur d’agence, prestataire). Un même compte peut porter plusieurs profils.
- **Contenu** : toute information, texte, photo, vidéo, document, avis ou message publié ou transmis par un utilisateur.

# 3. Acceptation, version et langue

Les Conditions applicables sont celles en vigueur à la date de votre action sur la plateforme. Leur date de version figure en tête du présent document.

Le français est la langue officielle de la République du Sénégal et la langue des présentes Conditions. **Seule la version française fait foi.** Les versions dans d’autres langues sont fournies à titre de courtoisie.

Conformément à la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques, votre acceptation exprimée par une case à cocher ou par un clic a la même valeur qu’une signature manuscrite et vous engage.

# 4. Accès à la plateforme

La consultation des annonces est libre et gratuite. Certaines fonctionnalités (favoris, messagerie, réservation, publication, gestion) exigent un compte.

Pour créer un compte, vous devez :

- être une personne physique **âgée d’au moins 18 ans** et jouir de votre pleine capacité juridique, ou agir au nom d’une personne morale que vous êtes habilité à représenter ;
- fournir des informations exactes, complètes et à jour, et les corriger dès qu’elles changent.

Les professionnels déclarent agir dans le cadre de leur activité et disposer de l’ensemble des autorisations, agréments, cartes professionnelles, immatriculations et assurances exigés par la réglementation sénégalaise pour l’exercer.

# 5. Compte et sécurité

Votre compte est personnel. Vous êtes responsable de la confidentialité de vos identifiants et de toute action accomplie depuis votre compte. Nous vous recommandons vivement d’activer l’authentification à deux facteurs, obligatoire pour certains comptes d’administration.

Vous pouvez vous connecter avec une adresse électronique et un mot de passe, ou par l’intermédiaire d’un compte Google, Facebook ou Apple. Nous pouvons vous demander de vérifier votre adresse électronique et votre numéro de téléphone.

Si vous constatez un usage non autorisé de votre compte, prévenez-nous sans délai à ${EDITEUR.courriels.contact}. Vous pouvez à tout moment consulter vos sessions actives et les révoquer.

Pour vous assister, et uniquement à cette fin, un membre habilité de l’équipe ${EDITEUR.marque} peut accéder temporairement à votre espace tel que vous le voyez. Cet accès est limité dans le temps et chaque accès est enregistré dans un journal.

# 6. Annonces

## 6.1 Engagements de l’annonceur

En publiant une annonce, l’annonceur garantit :

- qu’il est propriétaire du bien ou qu’il dispose d’un mandat ou d’une autorisation écrite lui permettant de le proposer à la location ou à la vente ;
- que les informations publiées sont exactes et sincères : nature et consistance du bien, surface, localisation, état, équipements, **nature du droit foncier** (titre foncier, bail, délibération ou autre), prix, charges, caution et conditions ;
- que les prix sont exprimés en francs CFA (XOF), sauf devise expressément indiquée, et qu’ils comprennent toutes les sommes exigibles du client, en dehors de celles qui sont clairement annoncées à part ;
- que les photos et vidéos représentent fidèlement le bien et qu’il détient les droits nécessaires à leur diffusion ;
- que le bien est effectivement disponible, et qu’il retirera ou mettra à jour l’annonce dès qu’il ne l’est plus ;
- que l’annonce ne comporte aucune condition discriminatoire fondée notamment sur l’origine, l’ethnie, la religion, le sexe, la situation familiale ou le handicap.

## 6.2 Rôle de ${EDITEUR.marque}

Chaque annonce reçoit une référence unique. Nous pouvons, sans y être tenus, examiner une annonce avant ou après sa publication, demander des justificatifs, la modifier pour en corriger la forme, la suspendre ou la retirer si elle méconnaît les présentes Conditions ou la loi.

Les photos peuvent être redimensionnées, converties et marquées du nom de l’agence afin d’être affichées sur la plateforme.

**Le contrôle que nous exerçons est limité** : il ne constitue ni une vérification du droit de propriété, ni une expertise du bien, ni une garantie de l’exactitude de l’annonce.

# 7. Professionnels et agences

## 7.1 Vérification

Pour accéder à certaines fonctionnalités, les agences et les professionnels transmettent un dossier de vérification : registre du commerce et du crédit mobilier (RCCM), numéro d’identification national des entreprises et des associations (NINEA), pièce d’identité du dirigeant, relevé d’identité bancaire, carte professionnelle ou attestation d’assurance, selon le profil. Le passage d’une agence individuelle à une agence standard est soumis à l’examen de ce dossier par ${EDITEUR.marque}.

Le badge « vérifié » signifie que les pièces demandées ont été fournies et examinées à la date de la vérification. Il ne garantit ni la solvabilité, ni la compétence, ni la probité du professionnel.

## 7.2 Abonnements et commission

L’usage professionnel de la plateforme peut être soumis à un abonnement. Les offres en vigueur, leur prix, leur période d’essai éventuelle, leurs limites (nombre d’annonces actives, de collaborateurs, d’agences) et, le cas échéant, **le taux de commission prélevé par ${EDITEUR.marque} sur les paiements encaissés par son intermédiaire**, sont communiqués au professionnel avant sa souscription. Le taux applicable à un paiement est celui en vigueur au jour de ce paiement.

Les prix sont exprimés en francs CFA hors taxes ; la taxe sur la valeur ajoutée et les autres taxes applicables s’y ajoutent au taux légal.

## 7.3 Données des tiers gérées par les professionnels

Les professionnels peuvent enregistrer sur la plateforme des informations relatives à des tiers : prospects, clients, locataires, garants, visiteurs, prestataires. **Pour ces données, le professionnel est responsable du traitement** au sens de la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel, et ${EDITEUR.marque} agit pour son compte en qualité de sous-traitant. Le professionnel s’engage à :

- ne collecter que les données nécessaires à son activité et à informer les personnes concernées ;
- disposer d’une base légale pour chaque traitement et accomplir, le cas échéant, les formalités auprès de la Commission de protection des données personnelles (CDP) ;
- ne pas enregistrer de données sensibles sans nécessité et sans les garanties exigées par la loi ;
- répondre aux demandes des personnes concernées, avec notre assistance lorsque cela est nécessaire.

${EDITEUR.marque} traite ces données uniquement sur instruction du professionnel, pour fournir le service, sous une obligation de confidentialité, et met en œuvre les mesures de sécurité décrites dans la politique de confidentialité.

## 7.4 Obligations réglementaires

Le professionnel demeure seul tenu des obligations propres à son activité, notamment en matière d’intermédiation immobilière, de fiscalité, de facturation, de tenue de comptabilité et de lutte contre le blanchiment de capitaux et le financement du terrorisme, telle qu’elle résulte de la législation uniforme de l’UEMOA applicable au Sénégal. Les outils de la plateforme l’y aident ; ils ne l’en dispensent pas.

# 8. Contacts, visites et messagerie

Un visiteur peut contacter l’annonceur depuis une annonce, sans compte, en laissant ses coordonnées. Ces coordonnées et son message sont transmis au professionnel responsable du bien, qui pourra le recontacter au sujet de sa demande.

La messagerie est réservée aux échanges relatifs aux biens, visites, réservations, baux et interventions. Il est interdit de l’utiliser pour de la prospection non sollicitée, pour contourner la plateforme dans le but de frauder, ou pour transmettre des contenus illicites.

Une visite est convenue entre le client et l’annonceur. Nous vous recommandons de vous rendre aux visites dans des conditions de sécurité raisonnables et de ne remettre aucun document original ni aucune somme à cette occasion sans reçu.

# 9. Réservations

## 9.1 Demande et confirmation

Le client adresse une demande de réservation pour des dates déterminées. Le montant total du séjour est calculé par la plateforme d’après le prix et la période de loyer fixés par l’annonceur, et vous est présenté avant l’envoi. **La demande ne vaut pas réservation** : la réservation n’est formée qu’après son acceptation par l’annonceur.

L’annonceur est libre d’accepter ou de refuser une demande. Une demande qui n’a pas reçu de réponse dans le délai fixé par l’agence expire automatiquement, sans frais pour le client.

## 9.2 Acompte, solde et caution

Sauf indication contraire affichée avant la demande, un **acompte de 30 % du montant total** est exigible à la confirmation, le solde étant dû selon les modalités convenues avec l’annonceur. Une caution peut être demandée : son montant, ses conditions de restitution et les retenues possibles sont fixés par l’annonceur et portés à la connaissance du client avant la réservation.

## 9.3 Annulation

Les conditions d’annulation et de remboursement sont celles de l’annonceur, communiquées au client avant la confirmation. À défaut de conditions particulières :

- le client qui annule avant le début du séjour peut perdre tout ou partie de l’acompte, dans la limite annoncée ;
- l’annonceur qui annule une réservation confirmée rembourse au client l’intégralité des sommes versées, sans préjudice de dommages et intérêts ;
- en cas d’impossibilité d’exécution due à un cas de force majeure, les sommes versées sont restituées, déduction faite des frais que l’annonceur justifie avoir engagés au profit du client.

${EDITEUR.marque} n’est pas tenue des remboursements dus par un annonceur, sauf lorsque les sommes ont été encaissées par son intermédiaire et n’ont pas encore été reversées ; elle les restitue alors dans les conditions de l’article 10.

# 10. Paiements

## 10.1 Prestataires de paiement

Les paiements en ligne sont exécutés par des prestataires de services de paiement tiers, agréés ou autorisés selon la réglementation applicable, notamment **Wave** et **Orange Money** pour les paiements en francs CFA, et Lemon Squeezy pour certains paiements en devises. Leurs propres conditions s’appliquent à l’opération de paiement.

**${EDITEUR.marque} n’est pas un établissement de crédit, ni un établissement de paiement, ni un émetteur de monnaie électronique.** Nous ne recevons ni ne conservons les codes secrets de vos comptes de paiement mobile ni les données complètes de vos cartes bancaires.

## 10.2 Encaissement pour le compte des annonceurs

Selon la configuration retenue par l’agence, un paiement est reçu :

- soit directement sur le compte de l’agence auprès du prestataire de paiement ;
- soit sur le compte de ${EDITEUR.marque}, **qui l’encaisse alors au nom et pour le compte de l’agence**, en qualité de mandataire d’encaissement. L’agence donne ce mandat en acceptant les présentes Conditions.

Dans le second cas, le paiement fait par le client entre les mains de ${EDITEUR.marque} est libératoire à l’égard de l’agence à concurrence du montant reçu. ${EDITEUR.marque} reverse périodiquement à l’agence les sommes encaissées, déduction faite de sa commission et des remboursements dus aux clients, et met à sa disposition le détail de chaque reversement.

## 10.3 Paiements hors plateforme

Les paiements réalisés en dehors de la plateforme (espèces, virement, chèque, transfert) relèvent de la seule relation entre les parties. Ils peuvent être enregistrés dans la plateforme à titre de suivi, sans que ${EDITEUR.marque} en garantisse la réalité.

**Mise en garde contre la fraude** : ne versez jamais d’argent pour un bien que vous n’avez pas visité ou dont vous n’avez pas vérifié que l’interlocuteur est en droit de le proposer ; méfiez-vous d’un prix anormalement bas ou d’une demande de paiement urgente ; exigez un reçu pour toute somme remise. Signalez-nous toute annonce suspecte.

## 10.4 Retards de paiement

Dans le cadre des baux gérés sur la plateforme, des relances automatiques peuvent être envoyées en cas d’impayé et des pénalités de retard peuvent être appliquées, **dans la seule mesure où le bail les prévoit** et dans le respect de la loi.

# 11. Outils de gestion locative

Les outils de gestion (baux, échéanciers, quittances, factures, états des lieux, documents, maintenance, tableaux de bord) sont fournis pour faciliter l’activité des utilisateurs. Ils ne constituent pas un conseil juridique, fiscal ou comptable.

Il appartient aux parties de s’assurer que leurs contrats respectent la législation en vigueur, notamment le Code des obligations civiles et commerciales, la réglementation des loyers et, pour les baux à usage professionnel, l’Acte uniforme OHADA relatif au droit commercial général.

Les signatures apposées par voie électronique sur un état des lieux sont horodatées et accompagnées d’une empreinte numérique permettant d’en vérifier l’intégrité ; elles ont la valeur probante que leur reconnaît la loi n° 2008-08 du 25 janvier 2008 sur les transactions électroniques.

Les documents partagés par lien temporaire restent sous la responsabilité de celui qui les partage.

# 12. Avis

Seul un utilisateur ayant effectivement visité ou loué un bien peut laisser un avis à son sujet, une seule fois. Un avis doit être sincère, se rapporter à une expérience personnelle et ne contenir ni propos injurieux, diffamatoires ou discriminatoires, ni données personnelles de tiers.

Les avis sont examinés avant leur publication. Nous pouvons refuser, masquer ou supprimer un avis qui ne respecte pas ces règles, ainsi que la réponse qui y est apportée. L’annonceur ou le professionnel concerné dispose d’un droit de réponse public. Tout utilisateur peut signaler un avis qu’il estime inapproprié.

Nous ne rémunérons pas les avis et n’en modifions pas le sens.

# 13. Comportements interdits

Il est interdit, notamment :

- de publier une annonce fictive, trompeuse ou portant sur un bien dont on ne peut disposer ;
- d’usurper l’identité d’une personne ou de se présenter faussement comme professionnel ;
- de publier ou transmettre un contenu illicite, violent, haineux, pornographique, diffamatoire ou attentatoire à la vie privée ou aux droits d’autrui ;
- de collecter des données d’autres utilisateurs à des fins étrangères à la plateforme, notamment par extraction automatisée ;
- de porter atteinte au fonctionnement ou à la sécurité de la plateforme, de tenter d’accéder sans autorisation à un système ou à un compte, ou d’introduire un programme malveillant — agissements réprimés par la loi n° 2008-11 du 25 janvier 2008 portant sur la cybercriminalité ;
- d’utiliser la plateforme pour blanchir des capitaux ou réaliser toute opération frauduleuse.

Tout utilisateur peut signaler une annonce, un avis ou un comportement depuis la plateforme ou à ${EDITEUR.courriels.juridique}. Nous examinons chaque signalement et y donnons la suite appropriée, y compris, s’il y a lieu, la transmission aux autorités compétentes.

# 14. Propriété intellectuelle

La plateforme, sa marque, son nom, sa charte graphique, ses logiciels et ses bases de données sont la propriété de ${EDITEUR.marque} ou de ses concédants, et sont protégés par la législation applicable au Sénégal, notamment l’Accord de Bangui instituant l’Organisation africaine de la propriété intellectuelle (OAPI) et la loi sénégalaise relative au droit d’auteur et aux droits voisins. Toute reproduction ou extraction non autorisée est interdite.

Vous restez titulaire des droits sur vos contenus. Vous nous concédez, pour la durée de leur publication et pour le monde entier, une licence non exclusive et gratuite de les héberger, reproduire, adapter (redimensionnement, conversion, marquage) et afficher, dans la seule mesure nécessaire au fonctionnement et à la promotion de la plateforme. Cette licence prend fin lorsque le contenu est retiré, sous réserve des copies de sauvegarde conservées pour une durée limitée et des contenus partagés par d’autres utilisateurs.

# 15. Responsabilité

Chaque utilisateur est responsable des contenus qu’il publie, des informations qu’il fournit et des engagements qu’il prend envers les autres utilisateurs.

${EDITEUR.marque} est tenue d’une obligation de moyens pour la fourniture de la plateforme. Notre responsabilité ne peut être engagée :

- pour l’inexécution ou la mauvaise exécution d’un contrat conclu entre utilisateurs ;
- pour l’inexactitude d’une annonce, d’un avis ou d’une information fournie par un utilisateur ;
- pour les interruptions dues à la maintenance, aux défaillances des réseaux de télécommunication ou d’électricité, aux prestataires tiers ou à un cas de force majeure.

Lorsque notre responsabilité est engagée à l’égard d’un professionnel, elle est limitée aux dommages directs et prévisibles, et plafonnée aux sommes qu’il nous a versées au cours des douze mois précédant le fait générateur.

Aucune stipulation des présentes Conditions n’a pour effet de limiter notre responsabilité en cas de faute lourde ou intentionnelle, de dommage corporel, ni de priver un client consommateur des droits que lui reconnaît la loi.

# 16. Disponibilité et évolution du service

Nous nous efforçons de rendre la plateforme accessible en permanence, sans pouvoir le garantir. Nous pouvons la faire évoluer, en modifier ou en retirer des fonctionnalités. Une modification substantielle d’une offre payante est annoncée au professionnel au moins trente (30) jours à l’avance ; il peut alors résilier son abonnement sans frais.

# 17. Suspension et fin du compte

## 17.1 Par l’utilisateur

Vous pouvez demander la suppression de votre compte depuis vos paramètres. La suppression prend effet à l’issue d’un **délai de trente (30) jours**, pendant lequel vous pouvez l’annuler ; un rappel vous est adressé avant son terme. Elle ne peut aboutir tant qu’un bail que vous gérez ou dont vous êtes partie est en cours.

À la suppression, vos données d’identification sont anonymisées. Les informations que la loi nous impose de conserver — notamment les pièces comptables, les paiements, les factures et les contrats — sont conservées pendant la durée légale, dans les conditions décrites dans la politique de confidentialité.

## 17.2 Par ${EDITEUR.marque}

En cas de manquement aux présentes Conditions, nous pouvons, après vous avoir invité à présenter vos observations sauf urgence ou manquement grave, retirer un contenu, suspendre ou bloquer votre compte, ou retirer la vérification d’une agence. En cas de fraude, d’atteinte à la sécurité ou de risque pour d’autres utilisateurs, la mesure peut être immédiate. Les sommes encaissées pour le compte d’une agence suspendue restent dues à qui de droit, sous réserve des droits des clients et des réquisitions des autorités.

# 18. Données personnelles

Le traitement de vos données personnelles est décrit dans la politique de confidentialité, qui fait partie intégrante des présentes Conditions.

# 19. Modification des Conditions

Nous pouvons modifier les présentes Conditions pour tenir compte d’une évolution de la plateforme ou de la loi. Toute modification substantielle vous est notifiée au moins quinze (15) jours avant son entrée en vigueur, par courriel ou par un message dans la plateforme. Si vous la refusez, vous pouvez supprimer votre compte ; à défaut, la poursuite de l’utilisation vaut acceptation.

# 20. Droit applicable et litiges

Les présentes Conditions sont régies par le **droit sénégalais**, y compris les actes uniformes de l’OHADA et la réglementation de l’UEMOA qui y sont applicables.

En cas de difficulté, écrivez-nous d’abord à ${EDITEUR.courriels.juridique} : nous nous engageons à vous répondre dans un délai de trente (30) jours. À défaut d’accord amiable, les parties peuvent recourir à une médiation, conformément à l’Acte uniforme OHADA relatif à la médiation.

À défaut de solution amiable :

- **entre ${EDITEUR.marque} et un professionnel**, tout litige relève de la compétence exclusive du **Tribunal de commerce hors classe de Dakar** ;
- **entre ${EDITEUR.marque} et un client consommateur**, le litige est porté devant la juridiction compétente selon les règles de droit commun, et le consommateur conserve la faculté de saisir les associations de consommateurs et les autorités compétentes.

Si une stipulation des présentes Conditions était déclarée nulle, les autres conserveraient leur plein effet.

# 21. Nous contacter

- Questions générales : ${EDITEUR.courriels.contact}
- Données personnelles : ${EDITEUR.courriels.donnees}
- Réclamations et signalements : ${EDITEUR.courriels.juridique}
- Courrier : ${EDITEUR.denomination}, ${EDITEUR.siege}
`;

export const en = `
**Version in force as of ${VERSION_DOCUMENTS.dateEn}.**

These general terms of use (the “Terms”) govern access to and use of the ${EDITEUR.marque} platform, available at ${EDITEUR.site}. They form a contract between you and ${EDITEUR.denomination} (“${EDITEUR.marque}”, “we”), whose full identity is given in the legal notice.

By creating an account, publishing a listing or sending a booking request, you confirm that you have read and accept these Terms.

# 1. Purpose of the platform

${EDITEUR.marque} is a digital real-estate platform for Senegal. It allows visitors and clients to search for properties to rent or buy, save favourites, contact a professional and request a visit or a booking; owners, individual hosts and agencies to publish listings and manage their properties, leases, collections, inventories, documents and client relations; and service providers to handle the maintenance requests assigned to them.

**${EDITEUR.marque} acts as a technical intermediary.** Unless expressly stated otherwise, we are not the owner, landlord, seller or real-estate agent of the properties shown, and we are not a party to the leases, sales, bookings or service contracts concluded between users. Those contracts are concluded directly between the parties, who alone are responsible for performing them.

# 2. Definitions

- **User**: anyone who accesses the platform, with or without an account.
- **Client**: a user who searches for a property, sends a contact, visit or booking request, or who is a tenant or buyer.
- **Advertiser**: a user who publishes a listing — owner, individual host or agency.
- **Agency**: a professional space on the platform. An “individual” agency is created by a private person publishing their own property; a “standard” agency is a verified professional organisation that may bring together several team members.
- **Professional**: a standard agency, real-estate agent, service provider or anyone using the platform in the course of a business or profession.
- **Profile**: the role in which a user acts for an agency. One account may hold several profiles.
- **Content**: any information, text, photo, video, document, review or message published or sent by a user.

# 3. Acceptance, version and language

The applicable Terms are those in force on the date of your action. French is the official language of the Republic of Senegal and the language of these Terms; **only the French version is binding**.

Under Law No. 2008-08 of 25 January 2008 on electronic transactions, acceptance given by ticking a box or clicking has the same effect as a handwritten signature.

# 4. Access

Browsing listings is free. Some features require an account. To open one, you must be **at least 18 years old** and have full legal capacity, or act on behalf of a legal entity you are authorised to represent, and provide accurate, complete and up-to-date information.

Professionals confirm that they act in the course of their business and hold every authorisation, licence, registration and insurance required by Senegalese law to carry it on.

# 5. Account and security

Your account is personal. You are responsible for keeping your credentials confidential and for all actions taken from your account. We strongly recommend enabling two-factor authentication, which is mandatory for some administration accounts. You may sign in with an email address and password or through a Google, Facebook or Apple account, and we may ask you to verify your email address and phone number.

Report any unauthorised use to ${EDITEUR.courriels.contact} without delay. You can review and revoke your active sessions at any time.

To assist you, and only for that purpose, an authorised member of the ${EDITEUR.marque} team may temporarily access your space as you see it. Such access is time-limited and every access is logged.

# 6. Listings

## 6.1 Advertiser’s commitments

By publishing a listing, the advertiser warrants that they own the property or hold a written mandate or authorisation to offer it; that the information is accurate and honest, including the **type of land title** (titre foncier, lease, délibération or other), price, charges, deposit and conditions; that prices are stated in CFA francs (XOF) unless another currency is expressly shown and include all sums payable by the client other than those clearly stated separately; that photos and videos faithfully depict the property and may lawfully be published; that the property is actually available; and that the listing contains no discriminatory condition.

## 6.2 Our role

Each listing receives a unique reference. We may, without being obliged to, review a listing before or after publication, request supporting documents, correct its form, suspend it or remove it if it breaches these Terms or the law. Photos may be resized, converted and watermarked with the agency’s name.

**Our review is limited**: it is neither a check of title, nor a survey of the property, nor a guarantee that the listing is accurate.

# 7. Professionals and agencies

## 7.1 Verification

To access some features, agencies and professionals submit verification documents — trade register number (RCCM), national business identification number (NINEA), the manager’s identity document, bank details, professional licence or insurance certificate, depending on the profile. Upgrading an individual agency to a standard agency is subject to our review of that file. The “verified” badge means the requested documents were provided and reviewed on the verification date; it does not guarantee the professional’s solvency, competence or integrity.

## 7.2 Subscriptions and commission

Professional use may require a subscription. The plans in force, their price, any trial period, their limits and, where applicable, **the commission rate ${EDITEUR.marque} withholds on payments collected through it** are disclosed before subscription. The rate applied to a payment is the one in force on the day of that payment. Prices are in CFA francs excluding taxes; VAT and other applicable taxes are added at the statutory rate.

## 7.3 Third-party data managed by professionals

Professionals may record information about third parties (prospects, clients, tenants, guarantors, visitors, service providers). **For that data, the professional is the data controller** within the meaning of Law No. 2008-12 of 25 January 2008 on the protection of personal data, and ${EDITEUR.marque} acts on its behalf as a processor. The professional undertakes to collect only necessary data and inform the individuals concerned, to have a legal basis and complete any formalities with the Personal Data Protection Commission (CDP), not to record sensitive data without need and legal safeguards, and to answer data-subject requests, with our help where needed. We process such data only on the professional’s instructions, under a duty of confidentiality, and apply the security measures described in the privacy policy.

## 7.4 Regulatory obligations

Professionals remain solely responsible for the obligations of their trade, including real-estate intermediation, tax, invoicing, bookkeeping and anti-money-laundering and counter-terrorist-financing rules under the WAEMU uniform legislation applicable in Senegal.

# 8. Contacts, visits and messaging

A visitor may contact an advertiser from a listing without an account by leaving their contact details; these and the message are passed to the professional in charge of the property, who may contact them about the request. Messaging is reserved for exchanges about properties, visits, bookings, leases and interventions; unsolicited prospecting, fraud and unlawful content are prohibited. Attend visits with reasonable care and do not hand over original documents or money without a receipt.

# 9. Bookings

## 9.1 Request and confirmation

The client sends a booking request for specific dates. The total amount is calculated by the platform from the price and rental period set by the advertiser and shown before sending. **A request is not a booking**: the booking is formed only once the advertiser accepts it. The advertiser is free to accept or refuse. A request left unanswered within the period set by the agency expires automatically at no cost to the client.

## 9.2 Deposit, balance and security deposit

Unless otherwise stated before the request, a **down payment of 30% of the total** is due on confirmation, with the balance due as agreed with the advertiser. A security deposit may be required; its amount, refund conditions and possible deductions are set by the advertiser and disclosed before booking.

## 9.3 Cancellation

The advertiser’s cancellation and refund conditions, disclosed before confirmation, apply. Failing specific conditions: a client who cancels before the stay may lose all or part of the down payment within the announced limit; an advertiser who cancels a confirmed booking refunds all sums paid, without prejudice to damages; if performance is impossible due to force majeure, sums paid are refunded less any costs the advertiser proves were incurred for the client. ${EDITEUR.marque} is not liable for refunds owed by an advertiser, except for sums collected through it and not yet paid out, which it refunds under section 10.

# 10. Payments

## 10.1 Payment providers

Online payments are carried out by third-party payment service providers, licensed or authorised under applicable regulations, including **Wave** and **Orange Money** for CFA franc payments and Lemon Squeezy for some foreign-currency payments. Their own terms govern the payment transaction. **${EDITEUR.marque} is not a credit institution, payment institution or electronic money issuer.** We never receive or store your mobile-money PINs or full card details.

## 10.2 Collection on behalf of advertisers

Depending on the agency’s configuration, a payment is received either directly into the agency’s account with the payment provider, or into ${EDITEUR.marque}’s account, **which then collects it in the name and on behalf of the agency** as collection agent — a mandate the agency grants by accepting these Terms. In that case, payment to ${EDITEUR.marque} discharges the client towards the agency up to the amount received. ${EDITEUR.marque} periodically pays the collected sums to the agency, less its commission and any refunds due to clients, and provides the details of each payout.

## 10.3 Off-platform payments

Payments made outside the platform (cash, transfer, cheque) concern only the parties. They may be recorded on the platform for tracking, without ${EDITEUR.marque} guaranteeing them.

**Fraud warning**: never pay for a property you have not visited, or without checking that the person is entitled to offer it; beware of abnormally low prices and urgent payment requests; always ask for a receipt. Report any suspicious listing to us.

## 10.4 Late payment

For leases managed on the platform, automatic reminders may be sent and late fees applied **only where the lease provides for them** and in compliance with the law.

# 11. Property-management tools

Management tools (leases, schedules, rent receipts, invoices, inventories, documents, maintenance, dashboards) are provided to facilitate users’ activity and are not legal, tax or accounting advice. The parties must ensure their contracts comply with the law in force, including the Senegalese Code of Civil and Commercial Obligations, rent regulations and, for business leases, the OHADA Uniform Act on General Commercial Law. Electronic signatures on inventories are time-stamped and fingerprinted to verify integrity, and carry the evidential value recognised by Law No. 2008-08. Documents shared by temporary link remain the responsibility of whoever shares them.

# 12. Reviews

Only a user who actually visited or rented a property may review it, once. Reviews must be honest, based on personal experience, and free of insulting, defamatory or discriminatory statements and of third parties’ personal data. Reviews are checked before publication; we may refuse, hide or delete a review, or a reply to it, that breaks these rules. The professional concerned has a public right of reply, and any user may report a review. We do not pay for reviews or change their meaning.

# 13. Prohibited conduct

It is prohibited, among other things, to publish fictitious or misleading listings or listings for property one cannot dispose of; to impersonate anyone or falsely claim to be a professional; to publish unlawful, violent, hateful, pornographic or defamatory content, or content infringing privacy or others’ rights; to harvest other users’ data, including by scraping; to interfere with the platform’s operation or security, attempt unauthorised access or introduce malware — offences under Law No. 2008-11 of 25 January 2008 on cybercrime; or to use the platform for money laundering or any fraud. Reports can be made from the platform or to ${EDITEUR.courriels.juridique}; we review each one and act accordingly, including by informing the competent authorities.

# 14. Intellectual property

The platform, its brand, name, design, software and databases belong to ${EDITEUR.marque} or its licensors and are protected by the law applicable in Senegal, including the Bangui Agreement establishing the African Intellectual Property Organization (OAPI) and Senegalese copyright law. You keep your rights in your content and grant us, for the duration of its publication and worldwide, a free, non-exclusive licence to host, reproduce, adapt (resize, convert, watermark) and display it as needed to operate and promote the platform. The licence ends when the content is removed, subject to time-limited backups and content shared by other users.

# 15. Liability

Each user is responsible for the content they publish, the information they provide and their commitments to other users. ${EDITEUR.marque} has a best-efforts obligation to provide the platform and is not liable for the non-performance of contracts between users, for inaccurate listings, reviews or user information, or for interruptions caused by maintenance, telecommunication or power failures, third-party providers or force majeure. Towards a professional, our liability is limited to direct and foreseeable damage and capped at the sums it paid us in the twelve months before the event. Nothing in these Terms limits our liability for gross negligence, wilful misconduct or personal injury, or deprives a consumer of statutory rights.

# 16. Availability and changes to the service

We strive to keep the platform available without guaranteeing it, and may change or withdraw features. A material change to a paid plan is announced to the professional at least thirty (30) days in advance, who may then cancel without charge.

# 17. Suspension and account closure

## 17.1 By the user

You can request account deletion from your settings. Deletion takes effect after **thirty (30) days**, during which you can cancel it; a reminder is sent beforehand. It cannot be completed while a lease you manage or are party to is in progress. On deletion, your identification data is anonymised; information we are legally required to keep (accounting records, payments, invoices, contracts) is retained for the statutory period, as described in the privacy policy.

## 17.2 By ${EDITEUR.marque}

If these Terms are breached, we may — after inviting you to respond, except in urgent or serious cases — remove content, suspend or block your account or withdraw an agency’s verification. In cases of fraud, security threats or risk to other users, action may be immediate. Sums collected on behalf of a suspended agency remain due to whoever is entitled to them, subject to clients’ rights and to requests from the authorities.

# 18. Personal data

The processing of your personal data is described in the privacy policy, which forms part of these Terms.

# 19. Changes to the Terms

We may amend these Terms to reflect changes to the platform or the law. Material changes are notified at least fifteen (15) days before they take effect, by email or in-app message. If you refuse them, you may delete your account; otherwise, continued use constitutes acceptance.

# 20. Governing law and disputes

These Terms are governed by **Senegalese law**, including the OHADA uniform acts and WAEMU regulations applicable in Senegal. In case of difficulty, first write to ${EDITEUR.courriels.juridique}; we will reply within thirty (30) days. Failing an amicable settlement, the parties may use mediation under the OHADA Uniform Act on Mediation. Otherwise, disputes **between ${EDITEUR.marque} and a professional** fall under the exclusive jurisdiction of the **Commercial Court of Dakar (Tribunal de commerce hors classe de Dakar)**; disputes **with a consumer** are brought before the court competent under ordinary rules, and the consumer may also contact consumer associations and the competent authorities. If any provision is held invalid, the others remain in full force.

# 21. Contact us

- General questions: ${EDITEUR.courriels.contact}
- Personal data: ${EDITEUR.courriels.donnees}
- Complaints and reports: ${EDITEUR.courriels.juridique}
- Post: ${EDITEUR.denomination}, ${EDITEUR.siege}
`;

/**
 * Wolof : vide À DESSEIN. Une traduction juridique en wolof demande un traducteur qui en réponde ;
 * une approximation serait pire que le renvoi au français, que la page fait avec une mention.
 */
export const wo = ``;
