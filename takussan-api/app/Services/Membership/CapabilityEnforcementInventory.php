<?php

namespace App\Services\Membership;

use App\Models\Enums\Capability;

/**
 * TCK-587 (ADR-0031 §4) — les capacités du catalogue qu'AUCUN geste ne juge encore.
 *
 * Une capacité est **lue** si elle atteint une décision : `canActAt(Capability::X, …)`,
 * `can('x.y')`, ou une méthode `*Capability()` de policy dont l'ability est réellement invoquée.
 * Sur les 45 cas de l'enum, 31 n'en atteignaient aucune : l'éditeur de rôles les servait toutes,
 * et retirer `payouts.approve` à un rôle n'y changeait rien.
 *
 * Chaque cas est soit lu, soit inscrit ici avec le ticket (ou la dette) qui le branchera — jamais
 * les deux, jamais aucun. `scripts/check-capability-readers.mjs` (Repo CI) le vérifie et porte un
 * cliquet bilatéral sur la taille : l'inventaire ne peut que décroître, et le ticket qui branche
 * une capacité retire sa ligne dans le même commit.
 *
 * `GET /api/capabilities` l'expose (`not_enforced`) ; l'éditeur de rôles dit « sans effet pour
 * l'instant ». Une capacité inscrite reste cochable : on prépare un rôle.
 */
final class CapabilityEnforcementInventory
{
    /**
     * Valeur de la capacité → ce qui la branchera.
     *
     * @var array<string, string>
     */
    public const AWAITING = [
        'payouts.approve' => 'TCK-594',
        'agency.update_billing' => 'TCK-594',
        'agency.update_kyc' => 'TCK-601',
        'properties.moderate' => 'réservée plateforme',
        'reports.view_global' => 'réservée plateforme',
        'agency.update' => 'D-69',
        'agency.upgrade_request' => 'D-69',
        'payments.refund' => 'D-69',
        'messaging.broadcast' => 'D-69',
        'messaging.archive' => 'D-69',
    ];

    /** @return list<array{capability: string, ticket: string}> */
    public static function notEnforced(): array
    {
        $rows = [];
        foreach (self::AWAITING as $capability => $ticket) {
            $rows[] = ['capability' => $capability, 'ticket' => $ticket];
        }

        return $rows;
    }

    public static function isEnforced(Capability $capability): bool
    {
        return ! array_key_exists($capability->value, self::AWAITING);
    }
}
