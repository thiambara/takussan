<?php

namespace App\Services\Pont;

/**
 * TCK-2980 (ADR-0132 § 0) — un message reçu, en FORME NEUTRE : tout ce que le pont lit d'un message entrant, quel que
 * soit le canal. Le pilote la produit ({@see CanalDuPont::lireWebhook()}) ; {@see PontEntrant} et
 * {@see RoutageEntrant} ne lisent qu'elle.
 */
final class MessageEntrant
{
    public function __construct(
        /** Le nom du canal ({@see CanalDuPont::nom()}). */
        public readonly string $canal,
        /** Le numéro de la personne, en E.164 (ou l'identifiant de la personne sur le canal). */
        public readonly string $telephone,
        /** Le numéro d'entreprise auquel il s'adresse, tel que le fournisseur le nomme. */
        public readonly string $numeroDEntreprise,
        /** L'identifiant du message chez le fournisseur : la clé d'idempotence. */
        public readonly string $identifiant,
        /** Le texte (ou le libellé du bouton touché), borné ; `null` pour un média seul. */
        public readonly ?string $texte,
        /** L'identifiant du message cité (la personne y répond, ou touche un de ses boutons). */
        public readonly ?string $cite = null,
        /** Le charge utile d'un bouton de réponse, s'il en porte une. */
        public readonly ?string $reponseBouton = null,
        /** Le type de média (`image`, `audio`, `document`…) quand le message n'est pas un texte ; jamais téléchargé. */
        public readonly ?string $media = null,
        /** Le nom de profil que la personne s'est donné sur le canal. */
        public readonly ?string $nomDeProfil = null,
        /** L'horodatage du fournisseur (secondes Unix), s'il en donne un. */
        public readonly ?int $horodatage = null,
    ) {}
}
