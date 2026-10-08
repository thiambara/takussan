<?php

namespace App\Console\Commands;

use App\Exceptions\ApiError;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\PrimaryAgentDesignator;
use App\Services\Property\ResponsibleAgentAssigner;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;

/**
 * TCK-603 (ADR-0036, ADR-0059 §5 et §6) — rend aux biens « réattribués » par l'ancien `assignAgent` le
 * BAILLEUR qu'il leur avait retiré.
 *
 * Avant TCK-603, « Réattribuer » écrivait `properties.user_id` : le bailleur perdait son bien, et
 * tout bail créé ensuite désignait l'agent comme bailleur. Chaque geste a laissé une entrée
 * `activity_log` `Property` / `updated` dont `attribute_changes.old.user_id` ≠
 * `attribute_changes.attributes.user_id` (activitylog 5.1) — et c'est la SEULE écriture qui la
 * porte : la passation et cette commande écrivent `user_id` journal du modèle coupé, sous leurs
 * propres évènements (ADR-0059 §4).
 *
 * ⚠ `user_id` vaut aussi l'agent qui a SAISI le bien (`PropertyController::store`), et l'ancien geste
 * servait parfois à rendre un bien saisi à son vrai bailleur (verif-603 M1). La première valeur `old`
 * n'est donc rétablie que si c'est un bailleur de l'agence du bien ; tout autre cas est LISTÉ avec son
 * motif (`REVIEW_REASONS`), sans aucune écriture. Pour un bien restauré :
 *  - `user_id` ← le titulaire d'origine ; un bien qui l'a déjà n'est pas touché (idempotence) ;
 *  - la DERNIÈRE cible devient agent responsable par {@see ResponsibleAgentAssigner} si elle est
 *    encore personnel actif de l'agence ;
 *  - les baux du bien créés à partir de la première réattribution dont `landlord_id` est une cible :
 *    `draft` → `landlord_id` rétabli ; tout autre statut LISTÉ, jamais réécrit — un bail signé est un
 *    document contractuel, il se reprend à la main.
 *
 * `--dry-run` n'écrit rien et imprime les mêmes lignes, une par bien, avec les identifiants. Une
 * transaction par bien.
 *
 * ⚠ Environnements : aucune production API n'existe ; seule la préproduction peut porter ces
 * entrées. Elle s'y joue une fois, `--dry-run` d'abord, par une personne (TCK-603, « Au porteur »).
 */
class RepairReassignedOwners extends Command
{
    public const EVENT = 'property.owner_restored';

    /** ADR-0059 §6 — pourquoi un bien n'est pas rendu, mais listé. */
    public const REVIEW_REASONS = ['no_agency', 'original_missing', 'original_not_landlord', 'current_is_landlord', 'designated_after'];

    protected $signature = 'properties:repair-reassigned-owners {--dry-run : Compter et lister sans rien écrire}';

    protected $description = 'Rend à leur bailleur d\'origine les biens réattribués par l\'ancien « Réattribuer », et à leurs baux brouillons leur bailleur.';

    public function handle(ResponsibleAgentAssigner $assigner, MembershipCapabilityResolver $resolver): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $counts = ['restored' => 0, 'responsible_set' => 0, 'leases_fixed' => 0, 'leases_to_review' => 0, 'owners_to_review' => 0];
        $leasesToReview = [];
        $ownersToReview = [];
        $prefix = $dryRun ? '[dry-run] ' : '';

        foreach ($this->chains() as $propertyId => $chain) {
            $property = Property::withTrashed()->find($propertyId);
            if ($property === null) {
                continue;
            }

            $original = (int) $chain->first()->old_user_id;
            $current = (int) $property->user_id;
            if ($current === $original) {
                continue;
            }

            $reason = $this->reviewReason($property, $original, $current, (string) $chain->first()->created_at);
            if ($reason !== null) {
                $counts['owners_to_review']++;
                $ownersToReview[] = $propertyId;
                $this->line("{$prefix}review property={$propertyId} reason={$reason} owner={$current} original={$original}");

                continue;
            }

            $last = (int) $chain->last()->new_user_id;
            $targets = $chain->pluck('new_user_id')->map(fn ($id) => (int) $id)
                ->reject(fn (int $id) => $id === $original)->unique()->values()->all();
            $leases = Lease::withTrashed()
                ->where('property_id', $propertyId)
                ->where('created_at', '>=', $chain->first()->created_at)
                ->whereIn('landlord_id', $targets)
                ->orderBy('id')
                ->get(['id', 'status']);
            $drafts = $leases->filter(fn (Lease $l) => $l->status === LeaseStatus::Draft)->pluck('id')->all();
            $others = $leases->reject(fn (Lease $l) => $l->status === LeaseStatus::Draft)->pluck('id')->all();

            $lastTarget = $last !== $original ? User::query()->find($last) : null;
            $responsible = $lastTarget !== null && $resolver->isStaffAt($lastTarget, (int) $property->agency_id);

            if (! $dryRun) {
                $responsible = DB::transaction(function () use ($property, $original, $drafts, $others, $lastTarget, $responsible, $assigner): bool {
                    $locked = Property::withTrashed()->whereKey($property->id)->lockForUpdate()->firstOrFail();
                    $previous = (int) $locked->user_id;
                    // ADR-0059 §4 — journal du modèle coupé : cette écriture ne porte pas la
                    // signature qu'on lit, sans quoi le passage suivant la relirait comme une
                    // réattribution. Elle se journalise sous son propre évènement, plus bas.
                    $locked->disableLogging()->forceFill(['user_id' => $original])->save();
                    if ($drafts !== []) {
                        Lease::withTrashed()->whereIn('id', $drafts)->toBase()
                            ->update(['landlord_id' => $original, 'updated_at' => now()]);
                    }

                    if ($responsible) {
                        try {
                            $assigner->assign($locked, $lastTarget, null);
                        } catch (ApiError $e) {
                            if (! in_array($e->errorCode, ResponsibleAgentAssigner::TARGET_REFUSALS, true)) {
                                throw $e;
                            }
                            $responsible = false;
                        }
                    }

                    activity('Property')
                        ->performedOn($locked)
                        ->withProperties([
                            'agency_id' => $locked->agency_id,
                            'previous_user_id' => $previous,
                            'user_id' => $original,
                            'responsible_user_id' => $responsible ? $lastTarget?->id : null,
                            'leases_fixed' => $drafts,
                            'leases_to_review' => $others,
                        ])
                        ->event(self::EVENT)
                        ->log(self::EVENT);

                    return $responsible;
                });
            }

            $counts['restored']++;
            $counts['responsible_set'] += $responsible ? 1 : 0;
            $counts['leases_fixed'] += count($drafts);
            $counts['leases_to_review'] += count($others);
            array_push($leasesToReview, ...$others);
            $this->line(sprintf(
                '%srestore property=%d owner=%d->%d responsible=%s leases_fixed=%s leases_to_review=%s',
                $prefix, $propertyId, $current, $original,
                $responsible ? (string) $lastTarget?->id : '-',
                $drafts === [] ? '-' : implode(',', $drafts),
                $others === [] ? '-' : implode(',', $others),
            ));
        }

        $this->line($prefix.collect($counts)->map(fn (int $n, string $k) => "{$k}={$n}")->implode(' '));
        if ($leasesToReview !== []) {
            $this->line('leases_to_review: '.implode(', ', $leasesToReview));
        }
        if ($ownersToReview !== []) {
            $this->line('owners_to_review (properties): '.implode(', ', $ownersToReview));
        }

        return self::SUCCESS;
    }

    /**
     * ADR-0059 §6 — `null` quand le bien peut être rendu à `$original` ; sinon le motif de la liste.
     * L'ordre est celui de la table de l'ADR : le premier motif qui tient est celui qu'on imprime.
     */
    private function reviewReason(Property $property, int $original, int $current, string $since): ?string
    {
        if ($property->agency_id === null) {
            return 'no_agency';
        }
        $agencyId = (int) $property->agency_id;
        // Suppression douce comprise (verif-603 m1) : un compte supprimé ne redevient pas titulaire.
        if (! User::query()->whereKey($original)->exists()) {
            return 'original_missing';
        }
        $bailleur = fn (int $userId) => OwnerProfile::query()
            ->where('user_id', $userId)->where('agency_id', $agencyId)->exists();
        if (! $bailleur($original)) {
            return 'original_not_landlord';
        }
        if ($bailleur($current)) {
            return 'current_is_landlord';
        }

        $designeApres = Activity::query()
            ->where('subject_type', Property::class)->where('subject_id', $property->id)
            ->where('event', PrimaryAgentDesignator::EVENT)
            ->where('created_at', '>=', $since)
            ->exists()
            || PropertyCollaborator::query()
                ->where('property_id', $property->id)->where('is_primary', true)
                ->where('updated_at', '>=', $since)
                ->exists();

        return $designeApres ? 'designated_after' : null;
    }

    /**
     * La signature de l'ancien geste, groupée par bien, dans l'ordre d'écriture.
     *
     * @return Collection<int, Collection<int, object{subject_id: int, old_user_id: string, new_user_id: string, created_at: string}>>
     */
    private function chains(): Collection
    {
        return DB::table('activity_log')
            ->where('log_name', 'Property')
            ->where('event', 'updated')
            ->where('subject_type', Property::class)
            ->whereRaw("attribute_changes->'attributes'->>'user_id' IS NOT NULL")
            ->whereRaw("attribute_changes->'old'->>'user_id' IS NOT NULL")
            ->whereRaw("attribute_changes->'old'->>'user_id' <> attribute_changes->'attributes'->>'user_id'")
            ->orderBy('id')
            ->get([
                'subject_id',
                DB::raw("attribute_changes->'old'->>'user_id' AS old_user_id"),
                DB::raw("attribute_changes->'attributes'->>'user_id' AS new_user_id"),
                'created_at',
            ])
            ->groupBy('subject_id');
    }
}
