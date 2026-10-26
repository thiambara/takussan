<?php

namespace Database\Seeders\Activity;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\ContractType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Support\Search\PropertyLabels;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Les baux d'une agence, bien par bien, dans l'ordre du temps (TCK-2377).
 *
 * Chaque bien en location reçoit une CHAÎNE : le temps de le faire visiter après sa mise en ligne,
 * un locataire qui l'a visité, un bail, son issue — expiré, renouvelé (le successeur porte
 * `renewed_from_lease_id` et le même locataire), résilié —, une vacance, le locataire suivant. Un
 * bien n'a donc jamais deux baux actifs, aucun bail ne précède son bien, et le statut d'un bail
 * correspond à ses dates.
 *
 * Avant, chaque bail tirait un bien, un locataire et une date au hasard : 76 biens à deux baux
 * actifs, 30 baux `expired` sur 36 à fin future, 92 « leads » locataires (mesuré le 2026-10-25).
 */
class LeaseSeeder extends Seeder
{
    /** Délai entre la mise en ligne d'un bien et son premier bail, en jours. */
    private const DELAI_PREMIER_BAIL = [30, 75];

    /** Vacance entre deux locataires, en jours. */
    private const VACANCE = [10, 90];

    /** Part des baux semés qui ont un garant. */
    private const PART_AVEC_GARANT = 40;

    /** Part des premiers baux précédés d'une réservation. */
    private const PART_PAR_RESERVATION = 35;

    /** Le motif de résiliation dont {@see LeasePaymentSeeder} laisse les derniers loyers impayés. */
    public const MOTIF_IMPAYES = 'Impayés répétés';

    /** @var Collection<int, Guarantor> */
    private Collection $garantsLibres;

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $this->seedAgencyLeases($agency->id);
        }

        $this->ctx->activeLeases = $this->ctx->leases
            ->filter(fn (Lease $l) => $l->status === LeaseStatus::Active)
            ->values();

        // Le statut d'un bien se déduit de ses baux (TCK-2376) : loué s'il en a un actif.
        $rentedPropertyIds = $this->ctx->activeLeases->pluck('property_id')->unique()->values();
        if ($rentedPropertyIds->isNotEmpty()) {
            Property::whereIn('id', $rentedPropertyIds)
                ->update(['status' => PropertyStatus::Rented->value]);
        }
    }

    private function seedAgencyLeases(int $agencyId): void
    {
        // Un bail de location ne porte que sur un bien EN LOCATION, publié et bâti (TCK-2376).
        $properties = ($this->ctx->propertiesByAgency[$agencyId] ?? collect())
            ->filter(fn (Property $p) => $p->contract_type === ContractType::Rent
                && $p->status === PropertyStatus::Available
                && self::typeDeBailPour($p) !== null)
            ->values();
        if ($properties->isEmpty() || $this->ctx->equipe($agencyId)->isEmpty()) {
            return;
        }

        /** @var Collection<int, Customer> $locatairesLibres un client n'a qu'un logement à la fois */
        $locatairesLibres = ($this->ctx->customersByAgency[$agencyId] ?? collect())->values();
        $this->garantsLibres = Guarantor::query()
            ->where('agency_id', $agencyId)
            ->orderBy('id')
            ->get();

        $cible = $this->ctx->volume($this->ctx->config->leasesPerAgency, $agencyId);
        $semes = 0;
        $vacants = collect();

        foreach (Tirage::melanger($properties) as $property) {
            if ($semes >= $cible) {
                break;
            }

            $debut = self::premierDuMois(CarbonImmutable::parse($property->created_at)->addDays(mt_rand(...self::DELAI_PREMIER_BAIL)));
            $occupe = false;

            while ($debut->lessThan(Timeline::seedEnd()) && $semes < $cible) {
                $locataire = $this->locataireDisponible($locatairesLibres, $debut);
                if ($locataire === null) {
                    // Personne d'inscrit assez tôt pour ce mois : le bien attend le mois suivant.
                    $debut = $debut->addMonthNoOverflow();

                    continue;
                }

                [$fin, $occupe, $crees] = $this->chaineDUnLocataire($property, $locataire, $debut);
                $semes += $crees;
                if ($occupe) {
                    break;
                }

                $debut = self::premierDuMois($fin->addDays(mt_rand(...self::VACANCE)));
            }

            if (! $occupe) {
                $vacants->push($property);
            }
        }

        // Quelques baux en préparation sur des biens libres : signés plus tard, ils ne sont pas actifs.
        foreach (Tirage::plusieurs($vacants, min($vacants->count(), max(1, intdiv($cible, 30)))) as $property) {
            $debut = Timeline::seedEnd()->startOfMonth()->addMonthsNoOverflow(mt_rand(1, 2));
            $locataire = $this->locataireDisponible($locatairesLibres, $debut);
            if ($locataire !== null) {
                $this->visites($property, $locataire, $debut);
                $this->bail($property, $locataire, $debut, LeaseStatus::Draft, null, null);
            }
        }
    }

    /**
     * Un locataire dans un bien : son bail, et ses renouvellements, jusqu'à ce qu'il parte ou
     * qu'il soit encore là aujourd'hui.
     *
     * @return array{0: CarbonImmutable, 1: bool, 2: int} date de départ, encore occupé, baux créés
     */
    private function chaineDUnLocataire(Property $property, Customer $locataire, CarbonImmutable $debut): array
    {
        $this->visites($property, $locataire, $debut);
        // Un locataire sur trois a bloqué le bien par une réservation avant de signer.
        $reservation = mt_rand(1, 100) <= self::PART_PAR_RESERVATION ? $this->reservation($property, $locataire, $debut) : null;
        $parent = null;
        $crees = 0;
        $aujourdhui = Timeline::seedEnd();

        while (true) {
            $fin = $debut->addMonths(self::typeDeBailPour($property) === LeaseType::CommercialRent ? 24 : 12)->subDay();
            $resiliation = $debut->addMonths(2)->lessThan($aujourdhui) && mt_rand(1, 100) <= 15
                ? Timeline::randomDateBetween($debut->addMonths(2), $fin->lessThan($aujourdhui) ? $fin : $aujourdhui->subDay())->startOfDay()
                : null;

            $statut = match (true) {
                $resiliation !== null => LeaseStatus::Terminated,
                $fin->greaterThanOrEqualTo($aujourdhui) => LeaseStatus::Active,
                default => LeaseStatus::from(StatusDistribution::pick([
                    LeaseStatus::Expired->value => 50,
                    LeaseStatus::Renewed->value => 50,
                ])),
            };

            $parent = $this->bail($property, $locataire, $debut, $statut, $resiliation, $parent, $parent === null ? $reservation : null);
            $crees++;

            if ($statut === LeaseStatus::Renewed) {
                $debut = $fin->addDay();

                continue;
            }

            return [$resiliation ?? $fin, $statut === LeaseStatus::Active, $crees];
        }
    }

    /**
     * Le client qui prendra le bien à cette date : inscrit avant, et sans autre logement chez nous.
     *
     * @param  Collection<int, Customer>  $libres  retiré de la réserve s'il est choisi
     */
    private function locataireDisponible(Collection $libres, CarbonImmutable $debut): ?Customer
    {
        $candidats = $libres->filter(fn (Customer $c) => CarbonImmutable::parse($c->created_at)->lessThanOrEqualTo($debut->subDays(35)));
        if ($candidats->isEmpty()) {
            return null;
        }

        $choisi = Tirage::un($candidats);
        $libres->forget($libres->search($choisi, true));

        return $choisi;
    }

    /**
     * Une ou deux visites du futur locataire, faites avant la réservation et la signature — jamais
     * avant la mise en ligne du bien ni l'inscription du client.
     */
    private function visites(Property $property, Customer $locataire, CarbonImmutable $debut): void
    {
        $auPlusTot = collect([
            CarbonImmutable::parse($property->created_at)->addDay(),
            CarbonImmutable::parse($locataire->created_at)->addDay(),
            $debut->subDays(60),
        ])->max();

        $nombre = mt_rand(1, 2);
        for ($i = 0; $i < $nombre; $i++) {
            $visite = Timeline::businessHour(Timeline::randomDateBetween($auPlusTot, $debut->subDays(30)));
            PropertyVisit::create([
                'property_id' => $property->id,
                'customer_id' => $locataire->id,
                'agent_id' => $this->ctx->agentAu($property->agency_id, $visite),
                'type' => VisitType::InPerson->value,
                'status' => VisitStatus::Completed->value,
                'scheduled_at' => $visite,
                'duration_minutes' => 45,
                'completed_at' => $visite->addMinutes(mt_rand(30, 75)),
                'created_at' => $visite->subDays(mt_rand(2, 7))->max($auPlusTot),
                'updated_at' => $visite,
            ]);
        }
    }

    /**
     * La réservation qui a bloqué le bien jusqu'à la signature : l'acompte d'un demi-loyer, puis le
     * bail qui en est tiré la clôt (`completed`, comme `LeaseService::create`).
     */
    private function reservation(Property $property, Customer $locataire, CarbonImmutable $debut): Booking
    {
        $creee = Timeline::businessHour($debut->subDays(mt_rand(10, 25)));
        $loyer = (int) (round((float) $property->price / 5_000) * 5_000);

        return Booking::withoutEvents(fn () => Booking::create([
            'property_id' => $property->id,
            'customer_id' => $locataire->id,
            'created_by_id' => $this->ctx->agentAu($property->agency_id, $creee),
            'agency_id' => $property->agency_id,
            'reference_number' => 'BK-'.strtoupper(Tirage::code(8)),
            'status' => BookingStatus::Completed->value,
            'total_amount' => $loyer,
            'deposit_amount' => (int) (round($loyer / 2 / 5_000) * 5_000),
            'currency' => 'XOF',
            'start_date' => $debut->toDateString(),
            'end_date' => $debut->addMonth()->toDateString(),
            'expires_at' => $creee->addDays(7),
            'confirmed_at' => $creee->addDays(mt_rand(1, 3)),
            'created_at' => $creee,
            'updated_at' => $debut->subDays(5),
        ]));
    }

    private function bail(
        Property $property,
        Customer $locataire,
        CarbonImmutable $debut,
        LeaseStatus $statut,
        ?CarbonImmutable $resiliation,
        ?Lease $parent,
        ?Booking $reservation = null,
    ): Lease {
        $type = self::typeDeBailPour($property);
        $fin = $debut->addMonths($type === LeaseType::CommercialRent ? 24 : 12)->subDay();
        // Un renouvellement garde le loyer, révisé au plus de quelques pour cent ; le premier bail
        // prend le prix affiché, à la négociation près (±10 %, arrondi à 5 000).
        $loyer = $parent !== null
            ? (int) (round((float) $parent->monthly_rent * (1 + mt_rand(0, 5) / 100) / 5_000) * 5_000)
            : (int) (round((float) $property->price * mt_rand(90, 110) / 100 / 5_000) * 5_000);
        $caution = $loyer * ($property->deposit_months ?: 1);

        $lease = Lease::withoutEvents(fn () => Lease::create([
            'property_id' => $property->id,
            'landlord_id' => $property->user_id,
            'tenant_id' => $locataire->id,
            'agency_id' => $property->agency_id,
            'agent_id' => $this->ctx->agentAu($property->agency_id, $debut->subDays(5)),
            'renewed_from_lease_id' => $parent?->id,
            'booking_id' => $reservation?->id,
            'reference_number' => 'LS-'.strtoupper(Tirage::code(8)),
            'type' => $type->value,
            'status' => $statut->value,
            'start_date' => $debut->toDateString(),
            'end_date' => $fin->toDateString(),
            'monthly_rent' => $loyer,
            'currency' => 'XOF',
            'deposit_amount' => $parent !== null ? $parent->deposit_amount : $caution,
            'commission_rate' => $this->ctx->faker()->randomFloat(2, 5, 10),
            // TCK-2379 — les frais d'agence du mandat : un mois de loyer, l'usage à Dakar. C'est la base
            // que le grand livre ventile (`CommissionLedgerService`) ; un renouvellement n'en porte pas.
            'commission_amount' => $parent === null ? $loyer : null,
            'payment_frequency' => PaymentFrequency::Monthly->value,
            'payment_day' => 5,
            'signed_at' => $statut === LeaseStatus::Draft ? null : $debut->subDays(2),
            'terminated_at' => $resiliation,
            'termination_reason' => $resiliation ? $this->ctx->faker()->randomElement([
                'Départ du locataire', 'Mutation professionnelle', 'Achat d\'un logement', self::MOTIF_IMPAYES,
            ]) : null,
            'created_at' => $debut->subDays(5),
            'updated_at' => $resiliation ?? ($statut === LeaseStatus::Active || $statut === LeaseStatus::Draft ? $debut : $fin),
        ]));

        // Le garant se pose à la signature du premier bail ; un renouvellement naît sans garant
        // (TCK-2316), comme dans l'application.
        if ($parent === null && $statut !== LeaseStatus::Draft && $this->garantsLibres->isNotEmpty() && mt_rand(1, 100) <= self::PART_AVEC_GARANT) {
            $garant = $this->garantsLibres->shift();
            // Le dossier du garant existe avant qu'il se porte caution.
            if (CarbonImmutable::parse($garant->created_at)->greaterThan($debut->subDays(3))) {
                Guarantor::whereKey($garant->id)->update(['created_at' => $debut->subDays(10), 'updated_at' => $debut->subDays(10)]);
            }
            DB::table('lease_guarantor')->insert([
                'lease_id' => $lease->id,
                'guarantor_id' => $garant->id,
                'role' => null,
                'created_at' => $debut->subDays(3),
                'updated_at' => $debut->subDays(3),
            ]);
        }

        $this->ctx->leases->push($lease);

        return $lease;
    }

    /** Un bail commence le premier du mois : ses loyers ne chevauchent pas ceux du bail précédent. */
    private static function premierDuMois(CarbonImmutable $date): CarbonImmutable
    {
        return $date->day === 1 ? $date->startOfDay() : $date->addMonthNoOverflow()->startOfMonth();
    }

    /**
     * Le type de bail que le bien admet : résidentiel pour une habitation, commercial pour un local
     * professionnel, aucun pour du foncier.
     */
    public static function typeDeBailPour(Property $property): ?LeaseType
    {
        return match (PropertyLabels::famille($property->type)) {
            PropertyLabels::FAMILLE_HABITATION => LeaseType::ResidentialRent,
            PropertyLabels::FAMILLE_PROFESSIONNEL => LeaseType::CommercialRent,
            default => null,
        };
    }
}
