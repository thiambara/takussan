<?php

namespace Database\Seeders\Engagement;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Property;
use App\Models\Review;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ReviewSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();
            $auteurs = $this->auteursPossibles($agency->id);

            foreach ($properties as $property) {
                $candidats = $auteurs->get($property->id, collect());
                if ($candidats->isEmpty() || ! $this->ctx->faker()->boolean(45)) {
                    continue;
                }

                foreach (Tirage::plusieurs($candidats, min($candidats->count(), mt_rand(1, 3))) as [$authorId, $depuis]) {
                    $createdAt = Timeline::randomDateBetween($depuis->addDay(), Timeline::seedEnd()->subHour());
                    $isApproved = $this->ctx->faker()->boolean(80);

                    $rating = $this->ctx->faker()->numberBetween(3, 5);
                    [$title, $content] = $this->ctx->texts()->avis($rating);

                    Review::create([
                        'reviewable_id' => $property->id,
                        'reviewable_type' => Property::class,
                        'author_id' => $authorId,
                        'rating' => $rating,
                        'title' => $title,
                        'content' => $content,
                        'is_approved' => $isApproved,
                        'approved_at' => $isApproved ? $createdAt->addDays(1) : null,
                        'approved_by_id' => $isApproved ? $agency->primary_admin_id : null,
                        'created_at' => $createdAt,
                        'updated_at' => $createdAt,
                    ]);
                }
            }
        }
    }

    /**
     * Qui peut donner son avis sur un bien : le client qui l'a visité ou loué, à partir de ce jour-là
     * (TCK-2377). Tiré parmi les comptes de l'agence, l'auteur était un agent, un admin ou le bailleur
     * du bien dans 311 avis sur 386 (mesuré le 2026-10-25).
     *
     * @return Collection<int, Collection<int, array{0: int, 1: CarbonImmutable}>> par bien, une entrée par auteur
     */
    private function auteursPossibles(int $agencyId): Collection
    {
        $visites = DB::table('property_visits')
            ->join('customers', 'customers.id', '=', 'property_visits.customer_id')
            ->where('customers.agency_id', $agencyId)
            ->whereNotNull('customers.user_id')
            ->where('property_visits.status', VisitStatus::Completed->value)
            ->select('property_visits.property_id', 'customers.user_id', 'property_visits.completed_at as depuis');

        $baux = DB::table('leases')
            ->join('customers', 'customers.id', '=', 'leases.tenant_id')
            ->where('leases.agency_id', $agencyId)
            ->whereNotNull('customers.user_id')
            ->where('leases.status', '!=', LeaseStatus::Draft->value)
            ->select('leases.property_id', 'customers.user_id', 'leases.start_date as depuis');

        return $visites->unionAll($baux)
            ->orderBy('property_id')->orderBy('user_id')->orderBy('depuis')
            ->get()
            ->groupBy('property_id')
            ->map(fn (Collection $lignes) => $lignes
                ->groupBy('user_id')
                ->map(fn (Collection $parAuteur) => [(int) $parAuteur->first()->user_id, CarbonImmutable::parse($parAuteur->first()->depuis)])
                ->values());
    }
}
