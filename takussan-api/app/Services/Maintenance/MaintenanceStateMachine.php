<?php

namespace App\Services\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;

/**
 * TCK-592 — LA machine d'état d'une intervention, et la seule.
 *
 * Deux tables vivaient séparément — `MaintenanceRequestService::TRANSITIONS` (cycle générique) et
 * `MaintenanceQuoteWorkflow::TRANSITIONS` (devis) — sans aucune notion d'acteur. La première n'avait
 * aucune clé pour les états de devis : une demande en `quote_requested`, `quote_submitted` ou
 * `rejected` ne pouvait plus être annulée. Et `PATCH …/{id}` écrivait `status` par `fill()->save()`
 * sans passer par aucune des deux : le prestataire assigné posait `approved` sur son propre devis.
 *
 * Deux questions, deux réponses ici :
 *
 *  1. **La transition existe-t-elle ?** {@see self::TRANSITIONS} — un refus est un **422**.
 *  2. **Cet acteur peut-il la demander ?** {@see self::actorAllows()} — un refus est un **403**,
 *     rendu par `MaintenanceRequestPolicy::transitionTo()`.
 *
 * Trois acteurs, jamais exclusifs (un bailleur peut être demandeur de son propre bien) :
 *
 *  - **prestataire** (`assigned_to`, collaboration active) : démarrer et terminer. Jamais
 *    `cancelled`, jamais `closed` — il ne clôt pas seul (P10).
 *  - **donneur d'ordre** (bailleur du bien, personnel de l'agence) : tout, sauf soumettre un devis.
 *  - **demandeur** : confirmer (`completed → closed`) ou contester (`completed → in_progress`).
 */
final class MaintenanceStateMachine
{
    public const ACTOR_PROVIDER = 'provider';

    public const ACTOR_PRINCIPAL = 'principal';

    public const ACTOR_REQUESTER = 'requester';

    /**
     * La table UNIQUE : cycle générique et devis, y compris l'annulation depuis les états de devis.
     *
     * @var array<string, list<string>>
     */
    public const TRANSITIONS = [
        'open' => ['acknowledged', 'assigned', 'quote_requested', 'in_progress', 'cancelled'],
        'acknowledged' => ['assigned', 'quote_requested', 'in_progress', 'cancelled'],
        'assigned' => ['quote_requested', 'in_progress', 'cancelled'],
        'quote_requested' => ['quote_submitted', 'cancelled'],
        'quote_submitted' => ['approved', 'rejected', 'cancelled'],
        'rejected' => ['quote_submitted', 'cancelled'],
        'approved' => ['in_progress', 'cancelled'],
        'in_progress' => ['completed', 'cancelled'],
        'completed' => ['closed', 'in_progress'],
        'closed' => [],
        'cancelled' => [],
    ];

    /**
     * Les cibles que `PUT …/status` accepte. Les autres ont leur endpoint, qui porte ce que le
     * générique ignorerait : le montant et les pièces d'un devis, sa date de validité, le plafond du
     * bailleur, le commentaire d'une contestation. Les laisser passer par le générique rouvrirait
     * exactement le contournement que ce fichier ferme.
     */
    public const GENERIC_TARGETS = ['acknowledged', 'assigned', 'in_progress', 'completed', 'closed', 'cancelled'];

    public const TERMINAL = ['closed', 'cancelled'];

    public function canTransition(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        return in_array($to->value, self::TRANSITIONS[$from->value] ?? [], true);
    }

    /**
     * La cible passe-t-elle par l'endpoint générique ? `completed → in_progress` n'y passe pas :
     * c'est une contestation, qui porte un commentaire (`POST …/contest-resolution`).
     */
    public function isGeneric(MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        if ($from === MaintenanceStatus::Completed && $to === MaintenanceStatus::InProgress) {
            return false;
        }

        return in_array($to->value, self::GENERIC_TARGETS, true);
    }

    public function isTerminal(?MaintenanceStatus $status): bool
    {
        return $status !== null && in_array($status->value, self::TERMINAL, true);
    }

    /**
     * La matrice (acteur, cible). Elle ne dit pas si la transition EXISTE — c'est la table —, elle
     * dit si cet acteur a le droit de la demander.
     */
    public function actorAllows(string $actor, MaintenanceStatus $from, MaintenanceStatus $to): bool
    {
        return match ($actor) {
            // Une demande `completed` appartient au demandeur et au donneur d'ordre : le prestataire
            // ne la relance pas lui-même.
            self::ACTOR_PROVIDER => $from !== MaintenanceStatus::Completed
                && in_array($to, [MaintenanceStatus::InProgress, MaintenanceStatus::Completed], true),
            self::ACTOR_PRINCIPAL => $to !== MaintenanceStatus::QuoteSubmitted,
            self::ACTOR_REQUESTER => $from === MaintenanceStatus::Completed
                && in_array($to, [MaintenanceStatus::Closed, MaintenanceStatus::InProgress], true),
            default => false,
        };
    }

    /**
     * Les cibles atteignables depuis l'état courant, dans l'ordre de la table.
     *
     * @return list<MaintenanceStatus>
     */
    public function targetsFrom(MaintenanceRequest $mr): array
    {
        $from = $mr->status ?? MaintenanceStatus::Open;

        return array_map(
            static fn (string $value): MaintenanceStatus => MaintenanceStatus::from($value),
            self::TRANSITIONS[$from->value] ?? [],
        );
    }
}
