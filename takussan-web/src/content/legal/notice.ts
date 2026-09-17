/**
 * Mentions légales (TCK-531).
 *
 * Rédigées le 2026-09-17 à la demande du porteur du produit. Elles répondent à l'obligation
 * d'identification du prestataire posée par la loi n° 2008-08 du 25 janvier 2008 sur les
 * transactions électroniques et son décret d'application n° 2008-720 du 30 juin 2008 relatif au
 * commerce électronique. Toutes les valeurs viennent de `editeur.ts` : c'est là, et seulement là,
 * que les `[⚠ à compléter : …]` se remplissent.
 *
 * L'attribution OpenStreetMap n'est pas une politesse : la licence ODbL des données
 * cartographiques l'exige.
 */
import { A_COMPLETER, EDITEUR, HEBERGEURS, VERSION_DOCUMENTS } from './editeur';

export const fr = `
**Version en vigueur au ${VERSION_DOCUMENTS.date}.**

# Éditeur

Le site ${EDITEUR.site} et la plateforme ${EDITEUR.marque} sont édités par :

- **${EDITEUR.denomination}**
- ${EDITEUR.formeJuridique}
- Siège social : ${EDITEUR.siege}
- RCCM : ${EDITEUR.rccm}
- NINEA : ${EDITEUR.ninea}
- Téléphone : ${EDITEUR.telephone}
- Courriel : ${EDITEUR.courriels.contact}

**Directeur de la publication** : ${EDITEUR.directeurPublication}.

# Hébergement

- **${HEBERGEURS.serveurs.nom}**, ${HEBERGEURS.serveurs.adresse}, Allemagne — serveurs de l’application, de la base de données et des fichiers.
- **${HEBERGEURS.siteVercel.nom}**, ${HEBERGEURS.siteVercel.adresse}, États-Unis — diffusion du site public.
- **${HEBERGEURS.reseau.nom}**, ${HEBERGEURS.reseau.adresse}, États-Unis — réseau de diffusion, protection contre les attaques et stockage des sauvegardes chiffrées.

# Nature du service

${EDITEUR.marque} est une plateforme de mise en relation et de gestion immobilière. Les annonces sont publiées sous la responsabilité de leurs auteurs — propriétaires, hôtes particuliers et agences. ${EDITEUR.marque} n’est pas partie aux contrats conclus entre les utilisateurs, n’est ni établissement de crédit, ni établissement de paiement, ni émetteur de monnaie électronique, et les paiements en ligne sont exécutés par des prestataires de paiement tiers. Les conditions générales d’utilisation précisent ces points.

# Données personnelles

Le traitement des données personnelles est décrit dans la politique de confidentialité, conformément à la loi n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel.

- Contact : ${EDITEUR.courriels.donnees}
- Formalités auprès de la Commission de protection des données personnelles (CDP) : ${A_COMPLETER} à compléter : numéro du récépissé ou de l’autorisation]

# Propriété intellectuelle

La marque ${EDITEUR.marque}, le nom de domaine, la charte graphique, les textes, les logiciels et les bases de données de la plateforme sont protégés par la législation applicable au Sénégal, notamment l’Accord de Bangui instituant l’Organisation africaine de la propriété intellectuelle (OAPI). Toute reproduction, représentation ou extraction, totale ou partielle, sans autorisation écrite préalable est interdite.

Les photos et descriptions des annonces appartiennent à leurs auteurs, qui en garantissent les droits.

# Crédits

- Données cartographiques : © les contributeurs d’OpenStreetMap, disponibles sous licence Open Database License (ODbL).
- Icônes : Lucide, sous licence ISC.

# Signaler un contenu

Pour signaler une annonce, un avis ou un contenu que vous estimez illicite, utilisez la fonction de signalement de la plateforme ou écrivez à ${EDITEUR.courriels.juridique}, en précisant l’adresse de la page concernée, la nature du contenu et les raisons pour lesquelles il vous paraît illicite. Nous examinons chaque signalement dans les meilleurs délais.

# Droit applicable

Le présent site est soumis au droit sénégalais. Les modalités de règlement des litiges figurent dans les conditions générales d’utilisation.
`;

export const en = `
**Version in force as of ${VERSION_DOCUMENTS.dateEn}.**

# Publisher

The ${EDITEUR.site} website and the ${EDITEUR.marque} platform are published by:

- **${EDITEUR.denomination}**
- ${EDITEUR.formeJuridique}
- Registered office: ${EDITEUR.siege}
- Trade register (RCCM): ${EDITEUR.rccm}
- Business identification number (NINEA): ${EDITEUR.ninea}
- Phone: ${EDITEUR.telephone}
- Email: ${EDITEUR.courriels.contact}

**Publication director**: ${EDITEUR.directeurPublication}.

# Hosting

- **${HEBERGEURS.serveurs.nom}**, ${HEBERGEURS.serveurs.adresse}, Germany — application, database and file servers.
- **${HEBERGEURS.siteVercel.nom}**, ${HEBERGEURS.siteVercel.adresse}, United States — delivery of the public website.
- **${HEBERGEURS.reseau.nom}**, ${HEBERGEURS.reseau.adresse}, United States — content delivery, attack protection and storage of encrypted backups.

# Nature of the service

${EDITEUR.marque} is a real-estate matching and management platform. Listings are published under the responsibility of their authors — owners, individual hosts and agencies. ${EDITEUR.marque} is not a party to contracts between users and is not a credit institution, payment institution or electronic money issuer; online payments are carried out by third-party payment providers. The terms of use give further details.

# Personal data

The processing of personal data is described in the privacy policy, in accordance with Senegal’s Law No. 2008-12 of 25 January 2008 on the protection of personal data.

- Contact: ${EDITEUR.courriels.donnees}
- Formalities with the Personal Data Protection Commission (CDP): ${A_COMPLETER} à compléter : numéro du récépissé ou de l’autorisation]

# Intellectual property

The ${EDITEUR.marque} brand, domain name, design, texts, software and databases are protected by the law applicable in Senegal, including the Bangui Agreement establishing the African Intellectual Property Organization (OAPI). Any reproduction, representation or extraction, in whole or in part, without prior written permission is prohibited. Listing photos and descriptions belong to their authors, who warrant the rights to them.

# Credits

- Map data: © OpenStreetMap contributors, available under the Open Database License (ODbL).
- Icons: Lucide, under the ISC licence.

# Reporting content

To report a listing, review or content you consider unlawful, use the platform’s report feature or write to ${EDITEUR.courriels.juridique}, stating the page address, the content concerned and why you believe it is unlawful. We review every report promptly.

# Governing law

This website is governed by Senegalese law. Dispute resolution is set out in the terms of use.
`;

/**
 * Wolof : vide À DESSEIN — cf. `terms.ts`. La page affiche le français avec une mention.
 */
export const wo = ``;
