<?php

namespace App\Services\Property;

use App\Domain\Notifications\NotificationCode;
use App\Domain\Notifications\NotificationTarget;
use App\Models\DuplicateSuspicion;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\User;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use App\Services\Model\NotificationService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class PropertyModerationService
{
    public function __construct(private readonly NotificationService $notifications) {}

    /**
     * Approve a property: transition to `available`, record approver + timestamp,
     * emit an activity log entry, notify the property owner.
     *
     * TCK-597 (ADR-0043 §4, §5) — l'approbation est la décision que la modération attend : elle
     * passe outre la modération d'agence par {@see Property::withoutModerationGate()}, son seul
     * appelant. Sur un bien VERROUILLÉ par la plateforme, seul un super-admin approuve, et son
     * approbation lève le verrou ; un admin d'agence reçoit 403 (la policy le refuse déjà, ce
     * service le redit pour tout autre appelant).
     */
    public function approve(Property $property, User $admin): Property
    {
        abort_code_if(
            $property->isUnderPlatformHold() && ! $admin->isSuperAdmin(),
            403,
            'moderation.platform_hold'
        );
        abort_code_unless(
            $property->status === PropertyStatus::PendingReview,
            422,
            'property.not_pending_moderation'
        );

        Property::withoutModerationGate(fn () => DB::transaction(function () use ($property, $admin) {
            $property->forceFill([
                'status' => PropertyStatus::Available,
                'approved_at' => now(),
                'approved_by_user_id' => $admin->id,
                'rejected_at' => null,
                'rejected_by_user_id' => null,
                'rejection_reason' => null,
                'platform_hold_at' => null,
                'platform_hold_by_id' => null,
                'platform_hold_reason' => null,
            ])->save();

            activity('Property')
                ->performedOn($property)
                ->causedBy($admin)
                ->withProperties(['old_status' => 'pending_review', 'new_status' => 'available'])
                ->event('property.approved')
                ->log('Bien approuvé');
        }));

        $owner = $property->owner;
        if ($owner) {
            $owner->notify(new PropertyApprovedNotification($property));
        }

        return $property->refresh();
    }

    /**
     * Reject a property: transition to `rejected`, record rejecter + reason +
     * timestamp, emit an activity log entry, notify the property owner.
     */
    public function reject(Property $property, User $admin, string $rejectionReason): Property
    {
        abort_code_unless(
            $property->status === PropertyStatus::PendingReview,
            422,
            'property.not_pending_moderation'
        );

        DB::transaction(function () use ($property, $admin, $rejectionReason) {
            $property->update([
                'status' => PropertyStatus::Rejected,
                'rejected_at' => now(),
                'rejected_by_user_id' => $admin->id,
                'rejection_reason' => $rejectionReason,
                'approved_at' => null,
                'approved_by_user_id' => null,
            ]);

            activity('Property')
                ->performedOn($property)
                ->causedBy($admin)
                ->withProperties([
                    'old_status' => 'pending_review',
                    'new_status' => 'rejected',
                    'rejection_reason' => $rejectionReason,
                ])
                ->event('property.rejected')
                ->log('Bien refusé');
        });

        $owner = $property->owner;
        if ($owner) {
            $owner->notify(new PropertyRejectedNotification($property, $rejectionReason));
        }

        return $property->refresh();
    }

    /**
     * Resubmit a rejected property for review: transition back to `pending_review`,
     * clear rejection fields, reset submitted_at, emit an activity log entry.
     */
    public function resubmit(Property $property, User $actor): Property
    {
        abort_code_unless(
            $property->status === PropertyStatus::Rejected,
            422,
            'property.resubmit_not_rejected'
        );

        DB::transaction(function () use ($property, $actor) {
            $property->update([
                'status' => PropertyStatus::PendingReview,
                'submitted_at' => now(),
                'rejection_reason' => null,
                'rejected_at' => null,
                'rejected_by_user_id' => null,
            ]);

            activity('Property')
                ->performedOn($property)
                ->causedBy($actor)
                ->withProperties(['old_status' => 'rejected', 'new_status' => 'pending_review'])
                ->event('property.resubmitted')
                ->log('Bien resoumis pour modération');
        });

        return $property->refresh();
    }

    /**
     * TCK-597 (ADR-0043 §4) — trancher un signalement AGIT sur l'annonce.
     *
     *  - `hide`   : `rejected` + `private` + `published_at` effacé + verrou plateforme ;
     *  - `remove` : verrou plateforme, puis suppression douce ;
     *  - `reject` : classé sans suite, le bien est inchangé.
     *
     * Pour `hide` et `remove`, TOUS les signalements ouverts du bien sont clos avec la même
     * décision : le bien a quitté le site, ils n'ont plus rien à demander. Le publieur est notifié
     * avec le motif ; chaque signalant CONNECTÉ apprend l'issue (un anonyme n'a pas d'adresse).
     *
     * Avant : la méthode posait `resolved_at` et rien d'autre — l'annonce restait publiée et
     * indexée quelle que soit la décision.
     */
    public function resolveReport(PropertyReport $report, User $admin, string $decision, ?string $reason, ?string $reasonCode = null): PropertyReport
    {
        $motif = $reason !== null && $reason !== '' ? $reason : $reasonCode;

        /** @var Collection<int, PropertyReport> $closed */
        [$property, $closed] = DB::transaction(function () use ($report, $admin, $decision, $reason, $reasonCode, $motif) {
            $property = Property::withTrashed()->whereKey($report->property_id)->lockForUpdate()->firstOrFail();

            if (in_array($decision, ['hide', 'remove'], true)) {
                $this->hold($property, $admin, $motif, $reasonCode);

                if ($decision === 'remove') {
                    $property->delete();
                }

                $reports = PropertyReport::query()
                    ->where('property_id', $property->id)
                    ->open()
                    ->lockForUpdate()
                    ->get();
            } else {
                $reports = PropertyReport::query()->whereKey($report->getKey())->lockForUpdate()->get();
            }

            foreach ($reports as $open) {
                $open->update([
                    'resolved_at' => now(),
                    'decision' => $decision,
                    'resolved_by_id' => $admin->id,
                    'reason_code' => $reasonCode,
                ]);
            }

            activity('Property')
                ->performedOn($property)
                ->causedBy($admin)
                ->withProperties([
                    'property_report_id' => $report->id,
                    'closed_report_ids' => $reports->pluck('id')->all(),
                    'decision' => $decision,
                    'reason' => $reason,
                    'reason_code' => $reasonCode,
                ])
                ->event('property.report_resolved')
                ->log('property.report_resolved');

            return [$property, $reports];
        });

        $this->notifyOutcome($property, $closed, $decision, $reasonCode, $reason);

        return $report->refresh();
    }

    /**
     * TCK-597 (ADR-0054 §5) — trancher une suspicion de doublon : `hide` masque le bien soupçonné
     * sous verrou plateforme (comme un signalement), `reject` la classe. Le bien recopié n'est
     * jamais touché.
     */
    public function resolveDuplicate(DuplicateSuspicion $suspicion, User $admin, string $decision, ?string $reason, ?string $reasonCode = null): Property
    {
        $motif = $reason !== null && $reason !== '' ? $reason : $reasonCode;

        $property = DB::transaction(function () use ($suspicion, $admin, $decision, $reasonCode, $motif) {
            $property = Property::withTrashed()->whereKey($suspicion->property_id)->lockForUpdate()->firstOrFail();

            if ($decision === 'hide') {
                $this->hold($property, $admin, $motif, $reasonCode);
            }

            $suspicion->update([
                'decision' => $decision,
                'resolved_by_id' => $admin->id,
                'reason_code' => $reasonCode,
                'resolved_at' => now(),
            ]);

            return $property;
        });

        if ($decision === 'hide') {
            $this->notifyOutcome($property, collect(), 'hide', $reasonCode, $reason);
        }

        return $property;
    }

    /** Masquer sous verrou plateforme : rejeté, privé, dépublié, verrouillé (ADR-0043 §4). */
    private function hold(Property $property, User $admin, ?string $motif, ?string $reasonCode): void
    {
        $property->forceFill([
            'status' => PropertyStatus::Rejected,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
            'rejected_at' => now(),
            'rejected_by_user_id' => $admin->id,
            'rejection_reason' => $motif,
            'platform_hold_at' => now(),
            'platform_hold_by_id' => $admin->id,
            'platform_hold_reason' => $reasonCode ?? $motif,
        ])->save();
    }

    /**
     * @param  Collection<int, PropertyReport>  $closed
     */
    /**
     * verif-597 m5 — le motif part CODÉ (`reason_code`), traduit au rendu dans la langue du
     * destinataire ; `reason` ne porte que le texte libre. Avant, le code tenait lieu de texte et
     * le propriétaire lisait « Motif : personal_data. » en français, en anglais et en wolof.
     */
    private function notifyOutcome(Property $property, Collection $closed, string $decision, ?string $reasonCode, ?string $reason): void
    {
        $owner = $property->owner;
        if ($owner !== null && in_array($decision, ['hide', 'remove'], true)) {
            $this->notifications->send(
                $owner,
                $decision === 'hide' ? NotificationCode::ModerationPropertyHidden : NotificationCode::ModerationPropertyRemoved,
                ['property' => $property->title, 'reason_code' => $reasonCode, 'reason' => $reason !== '' ? $reason : null],
                $decision === 'hide' ? NotificationTarget::of('property', $property->id) : null,
            );
        }

        $code = $decision === 'reject' ? NotificationCode::ModerationReportDismissed : NotificationCode::ModerationReportUpheld;
        $reporterIds = $closed->pluck('reporter_user_id')->filter()->unique()->values();

        User::query()->whereIn('id', $reporterIds)->get()->each(
            fn (User $reporter) => $this->notifications->send($reporter, $code, ['property' => $property->title])
        );
    }
}
