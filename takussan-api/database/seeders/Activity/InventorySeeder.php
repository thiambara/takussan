<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PropertyType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

/**
 * Les états des lieux d'entrée et de sortie, aux bornes de l'occupation (TCK-2377).
 *
 * Un état des lieux d'entrée ouvre le premier bail d'un locataire ; un renouvellement n'en refait
 * pas. Celui de sortie clôt le dernier bail, expiré ou résilié. Les pièces sont celles du bien : avant,
 * chaque bail avait les quatre mêmes pièces — un bureau avait une « chambre principale ».
 */
class InventorySeeder extends Seeder
{
    /** Remarques d'usure relevées à la sortie, par pièce usée. */
    private const USURES = [
        'Traces de frottement sur les murs',
        'Joints de carrelage noircis',
        'Peinture écaillée près des fenêtres',
        'Robinetterie entartrée',
        'Trous de chevilles non rebouchés',
        'Porte de placard à régler',
    ];

    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        $properties = collect($this->ctx->propertiesByAgency)->flatten(1)->keyBy('id');

        foreach ($this->ctx->leases as $lease) {
            $property = $properties->get($lease->property_id);
            if ($lease->status === LeaseStatus::Draft || $property === null) {
                continue;
            }

            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $lease->agency_id);
            $conductedBy = $agents->isNotEmpty()
                ? $agents->pluck('id')->values()->pipe(Tirage::un(...))
                : $lease->landlord_id;
            $pieces = self::piecesDuBien($property);

            if ($lease->renewed_from_lease_id === null) {
                $this->etatDesLieux($lease, InventoryType::MoveIn, $conductedBy, CarbonImmutable::parse($lease->start_date), InventoryCondition::Good, array_map(
                    fn (string $piece) => ['name' => $piece, 'condition' => mt_rand(1, 100) <= 80 ? 'good' : 'excellent', 'notes' => null],
                    $pieces,
                ));
            }

            $sortie = match (true) {
                $lease->status === LeaseStatus::Terminated && $lease->terminated_at !== null => CarbonImmutable::parse($lease->terminated_at),
                $lease->status === LeaseStatus::Expired => CarbonImmutable::parse($lease->end_date),
                default => null,
            };
            if ($sortie !== null) {
                $this->etatDesLieux($lease, InventoryType::MoveOut, $conductedBy, $sortie, InventoryCondition::Fair, array_map(function (string $piece) {
                    $usee = mt_rand(1, 100) <= 35;

                    return ['name' => $piece, 'condition' => $usee ? 'fair' : 'good', 'notes' => $usee ? Tirage::un(self::USURES) : null];
                }, $pieces));
            }
        }
    }

    /**
     * Les pièces que décrit l'état des lieux, selon le type du bien et son nombre de chambres.
     *
     * @return list<string>
     */
    public static function piecesDuBien(Property $property): array
    {
        $chambres = max(1, (int) $property->bedrooms);
        $sdb = max(1, (int) $property->bathrooms);
        $numerotees = fn (string $nom, int $n) => $n === 1 ? [$nom] : array_map(fn (int $i) => "{$nom} {$i}", range(1, $n));

        return match ($property->type) {
            PropertyType::Studio => ['Pièce principale', 'Coin cuisine', 'Salle d\'eau'],
            PropertyType::Room => ['Chambre', 'Salle d\'eau'],
            PropertyType::Apartment, PropertyType::House, PropertyType::Villa => [
                'Entrée', 'Salon', 'Cuisine',
                ...$numerotees('Chambre', $chambres),
                ...$numerotees('Salle de bain', $sdb),
                ...($property->type === PropertyType::Villa ? ['Terrasse', 'Jardin'] : []),
                ...($property->type === PropertyType::House ? ['Cour'] : []),
            ],
            PropertyType::Shop => ['Espace de vente', 'Réserve', 'Sanitaires'],
            PropertyType::Office => ['Accueil', 'Plateau de bureaux', 'Salle de réunion', 'Sanitaires'],
            PropertyType::Warehouse, PropertyType::Factory => ['Zone de stockage', 'Quai de chargement', 'Bureau', 'Sanitaires'],
            PropertyType::Garage, PropertyType::Parking => ['Emplacement', 'Porte et accès'],
            default => ['Espace principal', 'Sanitaires'],
        };
    }

    /** @param  list<array{name: string, condition: string, notes: ?string}>  $rooms */
    private function etatDesLieux(Lease $lease, InventoryType $type, ?int $conductedBy, CarbonImmutable $le, InventoryCondition $etat, array $rooms): void
    {
        Inventory::create([
            'lease_id' => $lease->id,
            'property_id' => $lease->property_id,
            'type' => $type->value,
            'conducted_by' => $conductedBy,
            'tenant_id' => $lease->tenant_id,
            'conducted_at' => $le,
            'status' => InventoryStatus::Signed->value,
            'general_condition' => $etat->value,
            'rooms' => $rooms,
            'tenant_signed' => true,
            'tenant_signed_at' => $le,
            'owner_signed' => true,
            'owner_signed_at' => $le,
            'created_at' => $le,
            'updated_at' => $le,
        ]);
    }
}
