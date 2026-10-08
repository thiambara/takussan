<?php

namespace App\Console\Commands;

use App\Exceptions\ApiError;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\ResponsibleAgentAssigner;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * TCK-603 (ADR-0036, ADR-0059 §5) — rend aux biens « réattribués » par l'ancien `assignAgent` le
 * titulaire qu'il leur avait retiré.
 *
 * Avant TCK-603, « Réattribuer » écrivait `properties.user_id` : le bailleur perdait son bien, et
 * tout bail créé ensuite désignait l'agent comme bailleur. Chaque geste a laissé une entrée
 * `activity_log` `Property` / `updated` dont `attribute_changes.old.user_id` ≠
 * `attribute_changes.attributes.user_id` (activitylog 5.1) — et c'est la SEULE écriture qui la
 * porte : la passation et cette commande écrivent `user_id` journal du modèle coupé, sous leurs
 * propres évènements (ADR-0059 §4).
 *
 * Pour chaque bien qui porte la signature (chaîne lue par `activity_log.id` croissant) :
 *  - `user_id` ← la PREMIÈRE valeur `old` (le titulaire d'origine) ; un bien qui l'a déjà n'est pas
 *    touché — la commande est idempotente ; un titulaire d'origine disparu est listé, jamais deviné ;
 *  - la DERNIÈRE cible devient agent responsable par {@see ResponsibleAgentAssigner} si elle est
 *    encore personnel actif de l'agence ;
 *  - les baux du bien créés à partir de la première réattribution dont `landlord_id` est une cible :
 *    `draft` → `landlord_id` rétabli ; tout autre statut LISTÉ, jamais réécrit — un bail signé est un
 *    document contractuel, il se reprend à la main.
 *
 * `--dry-run` n'écrit rien et annonce les mêmes comptes. Une transaction par bien.
 *
 * ⚠ Environnements : aucune production API n'existe ; seule la préproduction peut porter ces
 * entrées. Elle s'y joue une fois, `--dry-run` d'abord, par une personne (TCK-603, « Au porteur »).
 */
class RepairReassignedOwners extends Command
{
    public const EVENT = 'property.owner_restored';

    protected $signature = 'properties:repair-reassigned-owners {--dry-run : Compter sans rien écrire}';

    protected $description = 'Rend aux biens réattribués par l\'ancien « Réattribuer » leur titulaire d\'origine, et à leurs baux brouillons leur bailleur.';

    public function handle(ResponsibleAgentAssigner $assigner, MembershipCapabilityResolver $resolver): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $counts = ['restored' => 0, 'responsible_set' => 0, 'leases_fixed' => 0, 'leases_to_review' => 0, 'owners_to_review' => 0];
        $leasesToReview = [];
        $ownersToReview = [];

        foreach ($this->chains() as $propertyId => $chain) {
            $property = Property::withTrashed()->find($propertyId);
            if ($property === null) {
                continue;
            }

            $original = (int) $chain->first()->old_user_id;
            $last = (int) $chain->last()->new_user_id;
            if ((int) $property->user_id === $original) {
                continue;
            }
            if (! User::withTrashed()->whereKey($original)->exists()) {
                $counts['owners_to_review']++;
                $ownersToReview[] = $propertyId;

                continue;
            }

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
            $responsible = $lastTarget !== null && $property->agency_id !== null
                && $resolver->isStaffAt($lastTarget, (int) $property->agency_id);

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
        }

        $this->line(($dryRun ? '[dry-run] ' : '').collect($counts)->map(fn (int $n, string $k) => "{$k}={$n}")->implode(' '));
        if ($leasesToReview !== []) {
            $this->line('leases_to_review: '.implode(', ', $leasesToReview));
        }
        if ($ownersToReview !== []) {
            $this->line('owners_to_review (properties): '.implode(', ', $ownersToReview));
        }

        return self::SUCCESS;
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
