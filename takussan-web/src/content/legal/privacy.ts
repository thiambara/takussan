/**
 * Politique de confidentialité (TCK-531).
 *
 * Rédigée le 2026-09-17 à la demande du porteur du produit, au regard de la loi sénégalaise
 * n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel et de son
 * décret d'application n° 2008-721 du 30 juin 2008. Les traitements, destinataires, traceurs et
 * durées décrits ici sont ceux RELEVÉS dans le code le même jour — un nouveau prestataire, un
 * nouveau traceur ou une nouvelle purge doit être reporté ici dans le même changement.
 *
 * ⚠ Trois engagements de ce texte ne sont pas encore tenus par le code et sont suivis par
 * TCK-537 : la conservation de la preuve du consentement, l'effacement des profils à la
 * suppression du compte, et les purges planifiées (journal d'activité, pièces de vérification,
 * demandes de contact). À faire relire par un avocat ; la déclaration à la CDP est un préalable à
 * la mise en production.
 */
import { A_COMPLETER, EDITEUR, HEBERGEURS, VERSION_DOCUMENTS } from './editeur';

export const fr = `
**Version en vigueur au ${VERSION_DOCUMENTS.date}.**

La présente politique explique quelles données personnelles ${EDITEUR.marque} traite, pourquoi, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer vos droits. Elle s’applique à la plateforme ${EDITEUR.site} et complète les conditions générales d’utilisation.

Nous traitons vos données dans le respect de la **loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel** et de son décret d’application n° 2008-721 du 30 juin 2008, sous le contrôle de la **Commission de protection des données personnelles (CDP)** du Sénégal.

# 1. Qui est responsable de vos données

## 1.1 ${EDITEUR.marque}

Le responsable du traitement des données relatives à votre compte et à l’usage de la plateforme est ${EDITEUR.denomination}, ${EDITEUR.siege}. Pour toute question relative à vos données : **${EDITEUR.courriels.donnees}**.

Formalités auprès de la CDP : ${A_COMPLETER} à compléter : numéro du récépissé de déclaration ou de l’autorisation délivrée par la CDP].

## 1.2 Les agences et professionnels

Les agences, propriétaires et professionnels qui utilisent la plateforme traitent eux aussi des données personnelles pour leur propre activité : fiches clients, prospects, locataires, garants, visiteurs, baux, encaissements. **Pour ces traitements, chaque professionnel est responsable du traitement** et ${EDITEUR.marque} n’agit que pour son compte, en qualité de sous-traitant. Si vous êtes client ou locataire d’une agence, c’est à elle qu’il convient d’adresser en priorité vos demandes relatives à ces données ; nous l’aiderons à y répondre.

# 2. Les données que nous traitons

## 2.1 Les données que vous nous fournissez

- **Compte** : nom, prénom, adresse électronique, mot de passe (conservé sous forme hachée, jamais en clair), numéro de téléphone, photo de profil, présentation, langue et fuseau horaire préférés.
- **Connexion par un tiers** : si vous choisissez Google, Facebook ou Apple, l’identifiant que ce service nous communique, votre nom et votre adresse électronique.
- **Profils professionnels et vérification** : selon votre rôle, numéro et copie de pièce d’identité, relevé d’identité bancaire, identifiant fiscal ou NINEA, RCCM, numéro de carte professionnelle, attestation d’assurance, spécialités, zones d’intervention et tarifs indicatifs.
- **Dossier locatif** : informations nécessaires à la conclusion et à la gestion d’un bail, y compris, lorsqu’un professionnel les demande, la situation professionnelle, les revenus et les informations relatives aux garants.
- **Annonces** : description, adresse et position du bien, photos, vidéos, plans, prix et conditions.
- **Échanges** : demandes de contact, de visite et de réservation, messages et pièces jointes, signalements de maintenance, avis et réponses.
- **États des lieux** : constatations, photos et signatures électroniques des parties.
- **Paiements** : montant, date, moyen de paiement, référence de la transaction, statut. Nous ne recevons ni vos codes secrets de paiement mobile ni les données complètes de vos cartes.

## 2.2 Les données collectées lors de l’utilisation

- **Données techniques et de sécurité** : adresse IP, type de navigateur et d’appareil, date de dernière connexion, sessions actives, journaux d’accès des serveurs.
- **Journal d’activité** : les opérations effectuées sur les éléments importants (biens, baux, paiements, profils, droits d’accès), avec leur auteur et leur date.
- **Préférences** : favoris, recherches enregistrées, préférences de notification.
- **Localisation précise** : la position de votre appareil, **uniquement si vous l’autorisez**, pour la recherche « autour de moi » ou pour placer un bien sur la carte.
- **Localisation approximative** : la ville et le pays déduits de votre adresse IP, pour vous proposer des biens proches.
- **Mesure d’audience** : des statistiques de fréquentation agrégées, sans cookie de suivi publicitaire.

## 2.3 Les données que d’autres nous transmettent

- Un professionnel peut enregistrer vos coordonnées lorsque vous êtes son client, son locataire, un garant ou un prestataire, ou vous inviter à rejoindre son espace.
- Un visiteur anonyme qui contacte un annonceur nous transmet son nom, son adresse électronique, son téléphone et son message ; nous enregistrons alors aussi son adresse IP et son navigateur pour prévenir les abus.

## 2.4 Données sensibles

Nous ne demandons **aucune donnée sensible** au sens de la loi (origine raciale ou ethnique, opinions politiques, convictions religieuses ou philosophiques, appartenance syndicale, santé, vie sexuelle, données génétiques, infractions et condamnations). N’en communiquez pas dans les messages, les annonces ou les documents.

# 3. Pourquoi nous les traitons, et sur quel fondement

- **Créer et gérer votre compte, vous authentifier, sécuriser l’accès** — exécution du contrat (conditions générales d’utilisation).
- **Publier les annonces, permettre la recherche, les contacts, les visites, les réservations et la messagerie** — exécution du contrat.
- **Fournir aux professionnels les outils de gestion** (baux, échéanciers, quittances, factures, états des lieux, maintenance, documents, tableaux de bord) — exécution du contrat conclu avec le professionnel.
- **Traiter les paiements, encaisser pour le compte des agences, calculer la commission et effectuer les reversements** — exécution du contrat et respect de nos obligations comptables et fiscales.
- **Vérifier l’identité et les justificatifs des professionnels et des propriétaires** — exécution du contrat, prévention de la fraude et respect de la réglementation relative à la lutte contre le blanchiment de capitaux.
- **Vous envoyer des notifications de service** (confirmation d’inscription, réinitialisation du mot de passe, visites, réservations, échéances, retards de paiement, alertes de recherche que vous avez demandées) — exécution du contrat.
- **Vous envoyer des notifications par SMS ou WhatsApp** — votre consentement, que vous activez et retirez dans vos préférences.
- **Utiliser votre position précise** — votre consentement, donné par l’autorisation de votre navigateur.
- **Modérer les contenus, traiter les signalements, prévenir la fraude et les abus, tenir le journal d’activité, assurer l’assistance** — la sécurité de la plateforme et de ses utilisateurs, nécessaire à l’exécution du contrat, et nos obligations légales.
- **Mesurer l’audience et améliorer la plateforme** — sur la base de statistiques agrégées qui ne permettent pas de vous identifier.
- **Répondre aux réquisitions des autorités et faire valoir nos droits en justice** — obligation légale.

Nous n’envoyons **aucune prospection commerciale** par courriel, SMS ou WhatsApp. Si nous le faisions un jour, ce serait uniquement avec votre consentement préalable, et vous pourriez le retirer à tout moment.

Nous ne prenons **aucune décision produisant des effets juridiques à votre égard sur le seul fondement d’un traitement automatisé**. Les décisions de vérification, de modération et de suspension sont prises par une personne.

# 4. Qui a accès à vos données

## 4.1 Les autres utilisateurs

- Les informations d’une annonce publiée sont publiques.
- Vos demandes de contact, de visite et de réservation, vos messages et votre profil sont communiqués au professionnel ou à l’annonceur concerné, et aux collaborateurs de son agence dans la limite de leurs droits d’accès.
- Vos avis publiés sont publics, accompagnés de vos prénom, nom et photo de profil.

## 4.2 L’équipe ${EDITEUR.marque}

Seuls les membres habilités de notre équipe accèdent à vos données, dans la limite de ce que leur mission exige : vérification des dossiers, modération, assistance, sécurité. Leurs comptes sont protégés par une authentification à deux facteurs. Un accès d’assistance à votre espace est limité dans le temps et enregistré dans un journal.

## 4.3 Nos prestataires

Nous faisons appel à des prestataires qui traitent des données pour notre compte, sur nos instructions et sous obligation de confidentialité :

- **Hébergement et infrastructure** : ${HEBERGEURS.serveurs.nom} (Allemagne) — serveurs de l’application, de la base de données et des fichiers ; ${HEBERGEURS.reseau.nom} (États-Unis) — réseau de diffusion, protection contre les attaques et stockage des sauvegardes chiffrées ; ${HEBERGEURS.siteVercel.nom} (États-Unis) — diffusion du site public et mesure d’audience agrégée.
- **Courriel transactionnel** : Resend (États-Unis).
- **SMS** : Orange, LAfricaMobile et Mtarget, selon l’opérateur de votre numéro.
- **WhatsApp** : Meta Platforms (WhatsApp Business), uniquement si vous avez activé ce canal.
- **Paiement** : Wave, Orange Money et Lemon Squeezy, selon le moyen choisi.
- **Connexion par un tiers** : Google, Meta (Facebook) et Apple, uniquement si vous choisissez ce mode de connexion.
- **Cartographie** : OpenStreetMap, dont les serveurs reçoivent votre adresse IP lorsque la carte s’affiche.
- **Localisation approximative** : ipapi.co, qui reçoit votre adresse IP pour en déduire votre ville.

## 4.4 Les autorités

Nous communiquons des données aux autorités judiciaires, administratives ou fiscales lorsque la loi l’exige ou sur réquisition régulière.

**Nous ne vendons ni ne louons vos données personnelles.**

# 5. Transferts hors du Sénégal

Certains de nos prestataires sont établis ou stockent des données hors du Sénégal, notamment dans l’Union européenne et aux États-Unis. Conformément à la loi n° 2008-12, nous ne transférons des données vers un pays tiers que s’il assure un niveau de protection suffisant de la vie privée et des libertés, ou moyennant des garanties appropriées, notamment contractuelles, et après avoir accompli les formalités requises auprès de la CDP.

# 6. Combien de temps nous les conservons

- **Compte** : tant que le compte est actif. Après une demande de suppression, un délai de 30 jours permet de l’annuler ; les données d’identification du compte et des profils sont ensuite **effacées ou anonymisées**.
- **Pièces de vérification (KYC)** : pendant la relation, puis 5 ans après sa fin, sauf durée plus longue imposée par la réglementation relative à la lutte contre le blanchiment de capitaux.
- **Paiements, factures, reversements et pièces comptables** : **10 ans**, conformément à l’Acte uniforme OHADA relatif au droit comptable et à l’information financière. Ils sont alors détachés de votre identité autant que la loi le permet.
- **Baux, réservations et états des lieux** : pendant la durée de la relation contractuelle, puis pendant le délai de prescription applicable.
- **Demandes de contact d’un visiteur sans compte** : 3 ans à compter du dernier échange.
- **Messages** : tant que la conversation reste active pour l’un de ses participants, et au plus tard jusqu’à la suppression de la plateforme de l’agence concernée, sauf obligation de conservation.
- **Journal d’activité** : 12 mois.
- **Journaux d’accès des serveurs** : quelques jours, par rotation automatique.
- **Archive d’export de vos données** : 7 jours, puis suppression automatique.
- **Brouillons d’annonce non publiés** : 90 jours sans modification.
- **Sauvegardes** : conservées au plus 14 jours, puis écrasées.
- **Consentements** : le temps du consentement, puis 5 ans pour pouvoir en justifier.

# 7. Sécurité

Nous mettons en œuvre des mesures techniques et organisationnelles adaptées aux risques :

- chiffrement des échanges (HTTPS) ;
- mots de passe hachés, secrets de double authentification chiffrés ;
- authentification à deux facteurs proposée à tous et imposée aux administrateurs de la plateforme ;
- cloisonnement des données par agence et contrôle des droits d’accès à chaque requête ;
- liens de partage de documents temporaires, protégables par mot de passe ;
- journalisation des opérations sensibles et des accès d’assistance ;
- sauvegardes quotidiennes stockées hors du serveur principal.

Aucun système n’est infaillible. En cas de violation de données susceptible de présenter un risque pour vos droits, nous en informons la CDP et, lorsque la situation l’exige, les personnes concernées, dans les meilleurs délais.

# 8. Cookies et stockage local

Nous n’utilisons **aucun cookie publicitaire ni de traceur de réseau social**. Les éléments stockés sur votre appareil sont nécessaires au fonctionnement du site ou à votre confort :

- **auth_token** — vous garder connecté (7 jours) ;
- **takussan-session** — sécuriser votre session (2 heures) ;
- **active_profile_id** — mémoriser le profil sous lequel vous agissez (30 jours) ;
- **NEXT_LOCALE** — mémoriser votre langue (1 an) ;
- **stockage local du navigateur** — biens consultés récemment, favoris et comparateur hors connexion, dernier moyen de paiement choisi, localisation approximative (24 heures).

La mesure d’audience de Vercel fonctionne sans cookie et ne produit que des statistiques agrégées. Vous pouvez effacer ces éléments à tout moment depuis les réglages de votre navigateur ; certaines fonctions, dont la connexion, ne fonctionneront alors plus.

# 9. Vos droits

La loi n° 2008-12 vous reconnaît les droits suivants :

- **droit d’information** sur les traitements vous concernant, auquel répond la présente politique ;
- **droit d’accès** à vos données et d’en obtenir une copie ;
- **droit de rectification** et, lorsque les données sont inexactes, incomplètes, équivoques, périmées ou dont la conservation est interdite, **droit d’effacement** ;
- **droit d’opposition**, pour des motifs légitimes, à ce que vos données fassent l’objet d’un traitement, et sans frais ni justification à leur utilisation à des fins de prospection ;
- **droit de retirer votre consentement** à tout moment, pour les traitements qui en dépendent, sans remettre en cause ceux déjà réalisés.

Depuis votre compte, vous pouvez dès maintenant :

- modifier vos informations dans votre profil ;
- **télécharger une archive de vos données** depuis la rubrique Confidentialité ;
- gérer vos préférences de notification et désactiver SMS et WhatsApp ;
- **supprimer votre compte** depuis la rubrique Sécurité.

Pour toute autre demande, écrivez à **${EDITEUR.courriels.donnees}** en précisant votre demande. Nous pouvons vous demander de justifier de votre identité. Nous répondons dans un délai d’**un mois**. L’exercice de vos droits est gratuit, sauf demande manifestement abusive.

Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la **Commission de protection des données personnelles (CDP)** — www.cdp.sn.

# 10. Mineurs

La plateforme est réservée aux personnes âgées d’au moins 18 ans. Nous ne collectons pas sciemment de données concernant des mineurs. Si vous constatez qu’un mineur nous a transmis des données, écrivez-nous : nous les supprimerons.

# 11. Modification de la politique

Nous pouvons modifier la présente politique, notamment lorsque nous ajoutons un prestataire ou une fonctionnalité. Toute modification substantielle vous est notifiée avant son entrée en vigueur. La date de version figure en tête du document.

# 12. Nous contacter

- Données personnelles : ${EDITEUR.courriels.donnees}
- Courrier : ${EDITEUR.denomination}, à l’attention du responsable des données personnelles, ${EDITEUR.siege}
`;

export const en = `
**Version in force as of ${VERSION_DOCUMENTS.dateEn}.**

This policy explains what personal data ${EDITEUR.marque} processes, why, with whom it is shared, how long it is kept and how to exercise your rights. It applies to the ${EDITEUR.site} platform and supplements the terms of use.

We process your data in accordance with Senegal’s **Law No. 2008-12 of 25 January 2008 on the protection of personal data** and its implementing Decree No. 2008-721 of 30 June 2008, under the supervision of Senegal’s **Personal Data Protection Commission (CDP)**.

# 1. Who is responsible for your data

## 1.1 ${EDITEUR.marque}

The controller of the data relating to your account and your use of the platform is ${EDITEUR.denomination}, ${EDITEUR.siege}. For any question about your data: **${EDITEUR.courriels.donnees}**.

CDP formalities: ${A_COMPLETER} à compléter : numéro du récépissé de déclaration ou de l’autorisation délivrée par la CDP].

## 1.2 Agencies and professionals

Agencies, owners and professionals using the platform also process personal data for their own business: client and prospect records, tenants, guarantors, visitors, leases, collections. **For that processing, each professional is the controller** and ${EDITEUR.marque} acts only on its behalf as a processor. If you are a client or tenant of an agency, address requests about that data to the agency first; we will help it respond.

# 2. The data we process

## 2.1 Data you provide

- **Account**: first and last name, email address, password (stored hashed, never in clear text), phone number, profile photo, bio, preferred language and time zone.
- **Third-party sign-in**: if you choose Google, Facebook or Apple, the identifier that service gives us, your name and email address.
- **Professional profiles and verification**: depending on your role, identity document number and copy, bank details, tax ID or NINEA, RCCM, professional licence number, insurance certificate, specialities, service areas and indicative rates.
- **Rental file**: information needed to conclude and manage a lease, including, where a professional asks for it, employment, income and guarantor information.
- **Listings**: description, address and location of the property, photos, videos, plans, price and conditions.
- **Communications**: contact, visit and booking requests, messages and attachments, maintenance reports, reviews and replies.
- **Inventories**: findings, photos and the parties’ electronic signatures.
- **Payments**: amount, date, method, transaction reference and status. We never receive your mobile-money PINs or full card details.

## 2.2 Data collected through use

- **Technical and security data**: IP address, browser and device type, last sign-in date, active sessions, server access logs.
- **Activity log**: operations on key items (properties, leases, payments, profiles, access rights), with author and date.
- **Preferences**: favourites, saved searches, notification preferences.
- **Location**: your device’s precise position **only if you allow it**, for “near me” search or to place a property on the map; and an approximate location (city, country) inferred from your IP address to suggest nearby properties.
- **Audience measurement**: aggregated traffic statistics, without advertising tracking cookies.

## 2.3 Data others give us

- A professional may record your details when you are their client, tenant, guarantor or service provider, or invite you to join their space.
- An anonymous visitor contacting an advertiser gives us their name, email, phone and message; we then also record their IP address and browser to prevent abuse.

## 2.4 Sensitive data

We ask for **no sensitive data** within the meaning of the law (racial or ethnic origin, political opinions, religious or philosophical beliefs, trade-union membership, health, sex life, genetic data, offences and convictions). Please do not share any in messages, listings or documents.

# 3. Why we process it, and on what basis

- **Creating and managing your account, authenticating you, securing access** — performance of the contract (terms of use).
- **Publishing listings; enabling search, contacts, visits, bookings and messaging** — performance of the contract.
- **Providing management tools to professionals** — performance of the contract with the professional.
- **Processing payments, collecting on behalf of agencies, calculating commission and paying out** — performance of the contract and our accounting and tax obligations.
- **Verifying the identity and documents of professionals and owners** — performance of the contract, fraud prevention and anti-money-laundering rules.
- **Sending service notifications** (sign-up confirmation, password reset, visits, bookings, due dates, late payments, search alerts you requested) — performance of the contract.
- **Sending SMS or WhatsApp notifications** — your consent, which you turn on and off in your preferences.
- **Using your precise location** — your consent, given through your browser’s permission.
- **Moderating content, handling reports, preventing fraud and abuse, keeping the activity log, providing support** — the security of the platform and its users, necessary to perform the contract, and our legal obligations.
- **Measuring audience and improving the platform** — using aggregated statistics that do not identify you.
- **Responding to lawful requests from authorities and defending our rights** — legal obligation.

We send **no marketing** by email, SMS or WhatsApp. Should we ever do so, it would only be with your prior consent, which you could withdraw at any time. We make **no decision with legal effects on you based solely on automated processing**; verification, moderation and suspension decisions are made by a person.

# 4. Who can access your data

## 4.1 Other users

Published listing information is public. Your contact, visit and booking requests, messages and profile are shared with the professional or advertiser concerned and with their agency’s team members within their access rights. Published reviews are public, together with your first name, last name and profile photo.

## 4.2 The ${EDITEUR.marque} team

Only authorised team members access your data, as far as their tasks require (verification, moderation, support, security). Their accounts are protected by two-factor authentication. Support access to your space is time-limited and logged.

## 4.3 Our service providers

We use providers that process data on our behalf, on our instructions and under confidentiality obligations:

- **Hosting and infrastructure**: ${HEBERGEURS.serveurs.nom} (Germany) — application, database and file servers; ${HEBERGEURS.reseau.nom} (United States) — content delivery, attack protection and storage of encrypted backups; ${HEBERGEURS.siteVercel.nom} (United States) — delivery of the public website and aggregated audience measurement.
- **Transactional email**: Resend (United States).
- **SMS**: Orange, LAfricaMobile and Mtarget, depending on your number’s operator.
- **WhatsApp**: Meta Platforms (WhatsApp Business), only if you enabled this channel.
- **Payments**: Wave, Orange Money and Lemon Squeezy, depending on the method chosen.
- **Third-party sign-in**: Google, Meta (Facebook) and Apple, only if you choose that sign-in method.
- **Maps**: OpenStreetMap, whose servers receive your IP address when a map is displayed.
- **Approximate location**: ipapi.co, which receives your IP address to infer your city.

## 4.4 Authorities

We disclose data to judicial, administrative or tax authorities where the law requires it or upon a lawful request.

**We do not sell or rent your personal data.**

# 5. Transfers outside Senegal

Some providers are established or store data outside Senegal, notably in the European Union and the United States. In accordance with Law No. 2008-12, we only transfer data to a third country that ensures an adequate level of protection of privacy and freedoms, or subject to appropriate safeguards, including contractual ones, and after completing the required formalities with the CDP.

# 6. How long we keep it

- **Account**: while it is active. After a deletion request, a 30-day period allows you to cancel; the account’s and profiles’ identification data are then **erased or anonymised**.
- **Verification documents (KYC)**: for the relationship, then 5 years after it ends, unless anti-money-laundering rules require longer.
- **Payments, invoices, payouts and accounting records**: **10 years**, under the OHADA Uniform Act on Accounting and Financial Reporting, detached from your identity as far as the law allows.
- **Leases, bookings and inventories**: for the contractual relationship, then for the applicable limitation period.
- **Contact requests from visitors without an account**: 3 years from the last exchange.
- **Messages**: while the conversation remains active for one of its participants, and at the latest until the agency concerned is removed from the platform, unless retention is required.
- **Activity log**: 12 months.
- **Server access logs**: a few days, by automatic rotation.
- **Data export archive**: 7 days, then automatically deleted.
- **Unpublished listing drafts**: 90 days without changes.
- **Backups**: kept for at most 14 days, then overwritten.
- **Consents**: for as long as the consent applies, then 5 years so that it can be evidenced.

# 7. Security

We apply technical and organisational measures appropriate to the risks: encrypted connections (HTTPS); hashed passwords and encrypted two-factor secrets; two-factor authentication available to all and mandatory for platform administrators; data segregation by agency and access-rights checks on every request; temporary, optionally password-protected document-sharing links; logging of sensitive operations and support access; daily backups stored off the main server. No system is infallible. If a data breach is likely to put your rights at risk, we notify the CDP and, where required, the individuals concerned as soon as possible.

# 8. Cookies and local storage

We use **no advertising cookies or social-network trackers**. Items stored on your device are needed for the site to work or for your convenience:

- **auth_token** — keeps you signed in (7 days);
- **takussan-session** — secures your session (2 hours);
- **active_profile_id** — remembers the profile you act under (30 days);
- **NEXT_LOCALE** — remembers your language (1 year);
- **browser local storage** — recently viewed properties, offline favourites and comparison list, last payment method chosen, approximate location (24 hours).

Vercel’s audience measurement works without cookies and produces aggregated statistics only. You can clear these items at any time in your browser settings; some features, including staying signed in, will then stop working.

# 9. Your rights

Law No. 2008-12 gives you the right to be **informed** (this policy); to **access** your data and obtain a copy; to have it **corrected** and, where it is inaccurate, incomplete, ambiguous, outdated or unlawfully kept, **erased**; to **object**, on legitimate grounds, to its processing, and at no cost and without reason to its use for marketing; and to **withdraw your consent** at any time for processing based on it, without affecting processing already carried out.

From your account you can already edit your profile, **download an archive of your data** from the Privacy section, manage notification preferences and turn off SMS and WhatsApp, and **delete your account** from the Security section.

For any other request, write to **${EDITEUR.courriels.donnees}**. We may ask you to prove your identity and will reply within **one month**. Exercising your rights is free unless a request is manifestly abusive. If you believe your rights have not been respected, you may complain to the **Personal Data Protection Commission (CDP)** — www.cdp.sn.

# 10. Minors

The platform is for people aged 18 and over. We do not knowingly collect data about minors; if you find that a minor has sent us data, write to us and we will delete it.

# 11. Changes to this policy

We may update this policy, in particular when we add a provider or a feature. Material changes are notified before they take effect. The version date appears at the top of the document.

# 12. Contact us

- Personal data: ${EDITEUR.courriels.donnees}
- Post: ${EDITEUR.denomination}, for the attention of the data protection officer, ${EDITEUR.siege}
`;

/**
 * Wolof : vide À DESSEIN — cf. `terms.ts`. La page affiche le français avec une mention.
 */
export const wo = ``;
