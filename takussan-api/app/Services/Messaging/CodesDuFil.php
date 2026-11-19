<?php

namespace App\Services\Messaging;

use LogicException;

/**
 * TCK-2958 (ADR-0128 § 3) — le catalogue FERMÉ des codes d'une carte ou d'un événement du fil.
 *
 * Pour chaque code : le type d'objet admis (une clé de {@see SujetsDuFil}), la nature (`card` ou
 * `event`) et la liste des clés de `data` admises. {@see EvenementsDuFil}, seul écrivain d'une carte
 * ou d'un événement, refuse tout ce qui n'est pas ici.
 *
 * ⚠ `data` est lu par TOUT participant du fil, et `content` comme l'aperçu commun de la liste ne
 * portent que le code : jamais un montant, un coût, un prix, un téléphone, un e-mail ni une adresse.
 * Ce qui dépend du lecteur passe par la projection de l'objet ({@see ObjetsDesMessages}).
 * `CodesDuFilArchitectureTest` parcourt le catalogue entier et refuse ces motifs.
 *
 * Le front compose le libellé depuis le code (principe n° 5). Ce ticket pose les avis
 * d'intervention, `maintenance.<cause>` pour chaque `MaintenanceStatusChanged::CAUSE_*` ;
 * TCK-2961 et TCK-2964 ajoutent les leurs.
 */
final class CodesDuFil
{
    public const NATURE_CARTE = 'card';

    public const NATURE_EVENEMENT = 'event';

    /**
     * L'étape d'une intervention : des CODES (`status`, `from`) et des NOMS que tout participant du
     * fil connaît déjà (`provider_name`, le prestataire assigné ; `actor_name`, qui a fait le geste).
     */
    private const DONNEES_INTERVENTION = ['status', 'from', 'provider_name', 'actor_name'];

    /** TCK-2967 — ce qu'un loyer attend du locataire (payer) : clos par le paiement et par son reçu. */
    private const LOYER_ATTENDU = ['lease_payment.due_soon', 'lease_payment.overdue', 'lease_payment.reminded'];

    /** TCK-2967 — un devis qui attend sa décision : clos quand il est approuvé ou refusé. */
    private const DEVIS_EN_ATTENTE = ['maintenance.quote_submitted', 'maintenance.quote_awaiting_owner'];

    /** TCK-2967 — tout geste attendu d'une intervention, clos quand le travail est fait, confirmé ou clos d'office. */
    private const GESTES_D_INTERVENTION = ['maintenance.slot_requested', 'maintenance.quote_submitted', 'maintenance.quote_awaiting_owner'];

    /** TCK-2967 — le code de l'avis d'une intervention annulée (au lieu de `maintenance.transition`). */
    public const INTERVENTION_ANNULEE = 'maintenance.cancelled';

    /**
     * TCK-2967 — les codes qui attendent un geste (`attend`) et qu'aucun code du catalogue ne clôt, chacun
     * avec sa raison. `CloturesDuFilArchitectureTest` refuse un code attendu sans clôture absent d'ici, et
     * une entrée d'ici qui aurait trouvé sa clôture.
     *
     * @var array<string, string>
     */
    private const SANS_CLOTURE = [];

    /**
     * TCK-2967 (ADR-0128 § 7) — deux clés facultatives disent le cycle de vie du geste attendu :
     * - `attend` : le code peut porter un `action_for` non vide ({@see EvenementsDuFil::ecrire()} refuse
     *   un `action_for` non vide à tout autre code) ;
     * - `eteint` : les codes DU MÊME OBJET que ce code clôt. Un événement postérieur qui porte ce code
     *   cesse d'attendre quiconque sur les codes listés ({@see NonLus::gesteToujoursAttendu()}).
     *
     * @var array<string, array{objet: string, nature: string, data: list<string>, attend?: bool, eteint?: list<string>}>
     */
    private const CATALOGUE = [
        'maintenance.transition' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.assigned' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        // TCK-2967 (décision du porteur) — un prestataire retiré, ou qui refuse, n'a plus de créneau à poser, et son
        // devis n'attend plus personne : la réaffectation écrit ses propres événements.
        'maintenance.unassigned' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::GESTES_D_INTERVENTION],
        'maintenance.accepted' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.declined' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::GESTES_D_INTERVENTION],
        'maintenance.quote_requested' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.quote_submitted' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'attend' => true],
        'maintenance.quote_approved' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::DEVIS_EN_ATTENTE],
        'maintenance.quote_awaiting_owner' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'attend' => true, 'eteint' => ['maintenance.quote_submitted']],
        'maintenance.quote_rejected' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::DEVIS_EN_ATTENTE],
        'maintenance.completed' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::GESTES_D_INTERVENTION],
        'maintenance.confirmed' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::GESTES_D_INTERVENTION],
        'maintenance.contested' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.auto_closed' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::GESTES_D_INTERVENTION],
        // TCK-2967 — une intervention annulée (une transition vers `cancelled`) : plus rien n'y est attendu.
        'maintenance.cancelled' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION, 'eteint' => self::GESTES_D_INTERVENTION],

        // TCK-2961 (ADR-0128 § 3) — les objets parlent dans leur fil ({@see FilDeLObjet}). Des dates, des
        // codes et des identifiants : le montant d'une échéance se relit par sa projection, pour le lecteur.
        'lease_payment.due_soon' => ['objet' => 'lease_payment', 'nature' => self::NATURE_EVENEMENT, 'data' => ['due_date'], 'attend' => true],
        'lease_payment.overdue' => ['objet' => 'lease_payment', 'nature' => self::NATURE_EVENEMENT, 'data' => ['due_date', 'days_late'], 'attend' => true],
        'lease_payment.reminded' => ['objet' => 'lease_payment', 'nature' => self::NATURE_EVENEMENT, 'data' => ['due_date'], 'attend' => true],
        // `method` : le CODE du moyen (`PaymentMethod`), jamais un numéro ni un nom.
        'lease_payment.paid' => ['objet' => 'lease_payment', 'nature' => self::NATURE_EVENEMENT, 'data' => ['method'], 'eteint' => self::LOYER_ATTENDU],
        // Un reçu ne s'émet que pour une échéance réglée.
        'lease_payment.receipt_issued' => ['objet' => 'lease_payment', 'nature' => self::NATURE_EVENEMENT, 'data' => [], 'eteint' => self::LOYER_ATTENDU],
        'lease.notice_given' => ['objet' => 'lease', 'nature' => self::NATURE_EVENEMENT, 'data' => ['effective_date']],
        'lease.renewed' => ['objet' => 'lease', 'nature' => self::NATURE_EVENEMENT, 'data' => ['renewed_lease_id', 'start_date']],
        'inventory.awaiting_signature' => ['objet' => 'inventory', 'nature' => self::NATURE_EVENEMENT, 'data' => ['type'], 'attend' => true],
        // TCK-2967 — une partie a signé (`party` : le CODE du rôle, `tenant` ou `landlord`) : clôt l'attente
        // de tous, et attend à son tour les parties qui doivent encore signer. Signé par tous : `signed`.
        'inventory.signed_by_party' => ['objet' => 'inventory', 'nature' => self::NATURE_EVENEMENT, 'data' => ['type', 'party'], 'attend' => true, 'eteint' => ['inventory.awaiting_signature']],
        'inventory.signed' => ['objet' => 'inventory', 'nature' => self::NATURE_EVENEMENT, 'data' => ['type'], 'eteint' => ['inventory.awaiting_signature', 'inventory.signed_by_party']],
        // `slots` : le NOMBRE d'instants proposés (une valeur simple ; la liste est dans la demande de report).
        'maintenance.slot_requested' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => ['slots'], 'attend' => true],
        'maintenance.slot_set' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => ['scheduled_at'], 'eteint' => ['maintenance.slot_requested']],
        // La visite confirmée clôt l'autre moment proposé, qui attendait sa confirmation.
        'visit.confirmed' => ['objet' => 'property_visit', 'nature' => self::NATURE_EVENEMENT, 'data' => ['scheduled_at'], 'eteint' => ['visit.rescheduled']],
        'visit.rescheduled' => ['objet' => 'property_visit', 'nature' => self::NATURE_EVENEMENT, 'data' => ['scheduled_at'], 'attend' => true],
        // TCK-2967 — la visite annulée : l'autre moment proposé n'attend plus de confirmation.
        'visit.cancelled' => ['objet' => 'property_visit', 'nature' => self::NATURE_EVENEMENT, 'data' => [], 'eteint' => ['visit.rescheduled']],
        'booking.confirmed' => ['objet' => 'booking', 'nature' => self::NATURE_EVENEMENT, 'data' => []],

        // TCK-2964 (ADR-0128 § 4) — les cartes POSÉES par un participant (`POST …/cards`). Une seule carte
        // par type posable ({@see self::carteDePose()}). Le bien partagé ne copie rien : prix, titre et
        // photo se relisent par sa projection ; la visite proposée garde son instant (une date).
        'property.shared' => ['objet' => 'property', 'nature' => self::NATURE_CARTE, 'data' => []],
        'visit.proposed' => ['objet' => 'property_visit', 'nature' => self::NATURE_CARTE, 'data' => ['scheduled_at']],
    ];

    /** @return array<string, array{objet: string, nature: string, data: list<string>, attend?: bool, eteint?: list<string>}> le catalogue entier */
    public static function catalogue(): array
    {
        return self::CATALOGUE;
    }

    /** @return list<string> */
    public static function codes(): array
    {
        return array_keys(self::CATALOGUE);
    }

    public static function existe(string $code): bool
    {
        return array_key_exists($code, self::CATALOGUE);
    }

    /** @return array{objet: string, nature: string, data: list<string>, attend?: bool, eteint?: list<string>} */
    public static function entree(string $code): array
    {
        if (! self::existe($code)) {
            throw new LogicException("Code hors du catalogue du fil : « {$code} ».");
        }

        return self::CATALOGUE[$code];
    }

    /** TCK-2967 — le code peut-il porter un `action_for` non vide ? */
    public static function attend(string $code): bool
    {
        return (self::entree($code)['attend'] ?? false) === true;
    }

    /**
     * TCK-2967 — les couples (code éteint, code qui l'éteint) de tout le catalogue, dans l'ordre du
     * catalogue : la clause de {@see NonLus} s'écrit d'eux.
     *
     * @return list<array{0: string, 1: string}>
     */
    public static function clotures(): array
    {
        $couples = [];
        foreach (self::CATALOGUE as $code => $entree) {
            foreach ($entree['eteint'] ?? [] as $eteint) {
                $couples[] = [$eteint, $code];
            }
        }

        return $couples;
    }

    /** @return array<string, string> TCK-2967 — code attendu sans clôture → sa raison */
    public static function sansCloture(): array
    {
        return self::SANS_CLOTURE;
    }

    /**
     * TCK-2964 — le code de la carte qu'un participant pose pour un objet de type `$type` : la SEULE carte
     * du catalogue qui porte sur ce type. Un type sans carte, ou avec plusieurs, lève.
     */
    public static function carteDePose(string $type): string
    {
        $codes = array_keys(array_filter(
            self::CATALOGUE,
            fn (array $entree) => $entree['nature'] === self::NATURE_CARTE && $entree['objet'] === $type,
        ));
        if (count($codes) !== 1) {
            throw new LogicException("Le type « {$type} » n'a pas exactement une carte au catalogue.");
        }

        return $codes[0];
    }

    /** Le code de l'avis d'étape d'une intervention (`MaintenanceStatusChanged::$cause`). */
    public static function intervention(string $cause): string
    {
        return 'maintenance.'.$cause;
    }
}
