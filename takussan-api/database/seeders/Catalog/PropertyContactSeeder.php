<?php

namespace Database\Seeders\Catalog;

use App\Models\Enums\PropertyStatus;
use App\Models\Property;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

/**
 * TCK-2379 — les numéros affichés sur l'annonce d'un bien (`PropertyContactController::sync`) : le
 * standard de l'agence, souvent joignable sur WhatsApp, et parfois la ligne de l'agent qui suit le
 * bien. Un bien sans numéro propre affiche le contact principal ; tous n'en ont donc pas.
 */
class PropertyContactSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies->sortBy('id') as $agency) {
            $agents = $this->ctx->equipe($agency->id);

            foreach (($this->ctx->propertiesByAgency[$agency->id] ?? collect())->sortBy('id') as $bien) {
                if ($bien->status === PropertyStatus::Draft || mt_rand(1, 100) > 45) {
                    continue;
                }
                $numeros = [['label' => 'Agence', 'phone' => (string) $agency->phone, 'has_whatsapp' => mt_rand(1, 100) <= 70]];
                $agent = mt_rand(1, 100) <= 35 ? $agents->firstWhere('id', $this->ctx->agentAu($agency->id, CarbonImmutable::parse($bien->created_at))) : null;
                if ($agent instanceof User && is_string($agent->phone) && $agent->phone !== '') {
                    $numeros[] = ['label' => $agent->first_name, 'phone' => $agent->phone, 'has_whatsapp' => true];
                }

                Timeline::aLaDate(CarbonImmutable::parse($bien->created_at)->addHours(mt_rand(1, 48)), function () use ($bien, $numeros): void {
                    foreach ($numeros as $position => $numero) {
                        if ($numero['phone'] !== '') {
                            Property::query()->find($bien->id)?->contacts()->create($numero + ['position' => $position]);
                        }
                    }
                });
            }
        }
    }
}
