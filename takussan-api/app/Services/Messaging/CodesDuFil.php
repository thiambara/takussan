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

    /**
     * @var array<string, array{objet: string, nature: string, data: list<string>}>
     */
    private const CATALOGUE = [
        'maintenance.transition' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.assigned' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.unassigned' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.accepted' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.declined' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.quote_requested' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.quote_submitted' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.quote_approved' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.quote_awaiting_owner' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.quote_rejected' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.completed' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.confirmed' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.contested' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
        'maintenance.auto_closed' => ['objet' => 'maintenance_request', 'nature' => self::NATURE_EVENEMENT, 'data' => self::DONNEES_INTERVENTION],
    ];

    /** @return array<string, array{objet: string, nature: string, data: list<string>}> le catalogue entier */
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

    /** @return array{objet: string, nature: string, data: list<string>} */
    public static function entree(string $code): array
    {
        if (! self::existe($code)) {
            throw new LogicException("Code hors du catalogue du fil : « {$code} ».");
        }

        return self::CATALOGUE[$code];
    }

    /** Le code de l'avis d'étape d'une intervention (`MaintenanceStatusChanged::$cause`). */
    public static function intervention(string $cause): string
    {
        return 'maintenance.'.$cause;
    }
}
