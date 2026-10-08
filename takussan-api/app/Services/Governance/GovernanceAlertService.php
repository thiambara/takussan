<?php

namespace App\Services\Governance;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\Activity;
use App\Models\Integration;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Model\NotificationService;

/**
 * TCK-601 (E, ADR-0044 §3) — un acte de gouvernance avertit les admins ACTIFS de l'agence, sauf son
 * auteur, dans la langue de chacun (in-app + e-mail : le code n'a pas de préférence, une alerte de
 * sécurité ne se désactive pas).
 *
 * Déclenché par le JOURNAL lui-même (`Activity::created`), sur les tables ci-dessous : l'écrivain
 * d'un acte n'a rien à savoir de l'alerte, et un acte qui n'est pas journalisé ne peut pas être
 * signalé — les deux se tiennent. L'agence est celle de la ligne (résolue par son sujet, D).
 */
class GovernanceAlertService
{
    /** Événements nommés par leur écrivain. */
    public const EVENTS = [
        'role_capabilities_changed' => NotificationCode::GovernanceRoleCapabilitiesChanged,
        'data_exported' => NotificationCode::GovernanceDataExported,
        // TCK-594 — `PayoutApprovalThreshold::trace()` ; nom repris de sa branche, inerte avant sa fusion.
        'agency_payout_threshold_changed' => NotificationCode::GovernanceApprovalThresholdChanged,
    ];

    /** Événements de modèle (`Auditable`), par classe du sujet. */
    public const SUBJECT_EVENTS = [
        AgencyAdminProfile::class => [
            'created' => NotificationCode::GovernanceAdminAdded,
        ],
        Integration::class => [
            'created' => NotificationCode::GovernanceIntegrationChanged,
            'updated' => NotificationCode::GovernanceIntegrationChanged,
            'deleted' => NotificationCode::GovernanceIntegrationChanged,
        ],
    ];

    /** `data_exported` n'alerte que pour un export de données CRM (TCK-587). */
    public const CRM_EXPORT_ENTITIES = ['customers'];

    public function __construct(private readonly NotificationService $notifications) {}

    public function handle(Activity $activity): void
    {
        $code = $this->codeFor($activity);
        $author = $activity->causer;
        // Un acte de gouvernance a un AUTEUR : une écriture sans acteur (seeder, commande, migration)
        // n'est pas le geste d'un membre, et n'avertit personne.
        if ($code === null || $activity->agency_id === null || ! $author instanceof User) {
            return;
        }

        $params = $this->paramsFor($code, $activity, $author->full_name);

        foreach ($this->recipients((int) $activity->agency_id, $author->id) as $admin) {
            $this->notifications->send($admin, $code, $params, NotificationTarget::of('audit'));
        }
    }

    private function codeFor(Activity $activity): ?NotificationCode
    {
        $event = (string) $activity->event;

        if (isset(self::EVENTS[$event])) {
            if ($event === 'data_exported'
                && ! in_array($activity->properties?->get('entity'), self::CRM_EXPORT_ENTITIES, true)) {
                return null;
            }

            return self::EVENTS[$event];
        }

        return self::SUBJECT_EVENTS[$activity->subject_type][$event] ?? null;
    }

    /** @return array<string, string> */
    private function paramsFor(NotificationCode $code, Activity $activity, string $actor): array
    {
        $subject = $activity->subject;

        return match ($code) {
            NotificationCode::GovernanceRoleCapabilitiesChanged => ['role' => (string) ($subject?->name ?? ''), 'actor' => $actor],
            NotificationCode::GovernanceAdminAdded => ['member' => (string) ($subject?->user?->full_name ?? ''), 'actor' => $actor],
            NotificationCode::GovernanceIntegrationChanged => [
                'provider' => (string) ($subject?->provider ?? $activity->attribute_changes?->get('old')['provider'] ?? ''),
                'actor' => $actor,
            ],
            default => ['actor' => $actor],
        };
    }

    /** @return iterable<User> */
    private function recipients(int $agencyId, int $authorId): iterable
    {
        return AgencyAdminProfile::query()
            ->where('agency_id', $agencyId)
            ->active()
            ->with('user')
            ->get()
            ->pluck('user')
            ->filter(fn (?User $user) => $user !== null && $user->id !== $authorId)
            ->unique('id');
    }
}
