<?php

namespace App\Observers;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Document;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Laravel\Scout\ModelObserver;

/**
 * TCK-2781 — l'index des documents recopie des faits de leur porteur (`Document::porteurPourLIndex`) :
 * son agence, sa présence, et le compte que la règle d'auteur épargne. Quand l'un change, les
 * documents du porteur se réindexent, sinon la recherche lirait encore l'ancienne agence — le bien
 * passé à une autre agence resterait trouvé par le personnel de la première.
 *
 * Trois événements : une colonne recopiée qui change, la suppression (un porteur supprimé n'est plus
 * lu), la restauration. Certains faits se lisent par un autre modèle : l'agence d'un état des lieux est
 * celle de son bien, le sujet d'un bail ou d'une réservation est le compte de sa fiche client.
 *
 * Une écriture de masse (`DB::table()->update()`, `Model::query()->update()`) ne passe pas par ici :
 * elle appelle {@see self::reindexer()} elle-même.
 */
class DocumentsDuPorteurObserver
{
    /** Les colonnes de chaque porteur que l'index recopie. */
    public const COLONNES = [
        Property::class => ['agency_id'],
        Lease::class => ['agency_id', 'tenant_id'],
        Booking::class => ['agency_id', 'customer_id'],
        Customer::class => ['agency_id', 'user_id'],
        Agency::class => [],
        Inventory::class => ['property_id'],
        AgencyUpgradeRequest::class => ['agency_id'],
        OwnerProfile::class => ['agency_id', 'user_id'],
        AgentProfile::class => ['agency_id', 'user_id'],
        AgencyAdminProfile::class => ['agency_id', 'user_id'],
    ];

    public function updated(Model $porteur): void
    {
        $colonnes = self::COLONNES[$porteur::class] ?? [];
        if ($colonnes !== [] && $porteur->wasChanged($colonnes)) {
            self::reindexer($porteur::class, [$porteur->getKey()]);
        }
    }

    public function deleted(Model $porteur): void
    {
        self::reindexer($porteur::class, [$porteur->getKey()]);
    }

    public function restored(Model $porteur): void
    {
        self::reindexer($porteur::class, [$porteur->getKey()]);
    }

    /**
     * Réindexe les documents de ces porteurs, et ceux des porteurs qui lisent leurs faits : les états
     * des lieux d'un bien, les baux et réservations d'une fiche client. Après le commit, pour que la
     * réindexation (en file en production, `SCOUT_QUEUE=true`) lise l'état écrit.
     *
     * @param  class-string<Model>  $classe
     * @param  array<int, int|string>  $ids
     */
    public static function reindexer(string $classe, array $ids): void
    {
        if ($ids === [] || ModelObserver::syncingDisabledFor(Document::class)) {
            return;
        }

        DB::afterCommit(function () use ($classe, $ids): void {
            $porteurs = [$classe => $ids];
            if ($classe === Property::class) {
                $porteurs[Inventory::class] = Inventory::withTrashed()->whereIn('property_id', $ids)->pluck('id')->all();
            }
            if ($classe === Customer::class) {
                $porteurs[Lease::class] = Lease::withTrashed()->whereIn('tenant_id', $ids)->pluck('id')->all();
                $porteurs[Booking::class] = Booking::withTrashed()->whereIn('customer_id', $ids)->pluck('id')->all();
            }

            Document::query()
                ->where(function (Builder $q) use ($porteurs): void {
                    foreach ($porteurs as $type => $cles) {
                        if ($cles !== []) {
                            $q->orWhere(fn (Builder $d) => $d
                                ->where('documentable_type', (new $type)->getMorphClass())
                                ->whereIn('documentable_id', $cles));
                        }
                    }
                })
                ->searchable();
        });
    }
}
