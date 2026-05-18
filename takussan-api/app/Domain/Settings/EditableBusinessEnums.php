<?php

namespace App\Domain\Settings;

use App\Models\Enums\ContractType;
use App\Models\Enums\PropertyType;
use App\Models\Enums\RentPeriod;
use App\Models\Enums\TitleType;
use App\Models\Property;

class EditableBusinessEnums
{
    /**
     * @return array<string,array{name:string,description:string,source:class-string,usage:array{model:class-string,column:string}}>
     */
    public static function all(): array
    {
        return [
            'property_type' => [
                'name' => 'Types de biens',
                'description' => 'Catégories visibles dans les formulaires et les filtres de biens.',
                'source' => PropertyType::class,
                'usage' => ['model' => Property::class, 'column' => 'type'],
            ],
            'contract_type' => [
                'name' => 'Types de transaction',
                'description' => 'Vente, location et futurs modes de commercialisation.',
                'source' => ContractType::class,
                'usage' => ['model' => Property::class, 'column' => 'contract_type'],
            ],
            'title_type' => [
                'name' => 'Titres fonciers',
                'description' => 'Libellés métier des titres fonciers rattachés aux biens.',
                'source' => TitleType::class,
                'usage' => ['model' => Property::class, 'column' => 'title_type'],
            ],
            'rent_period' => [
                'name' => 'Périodes de loyer',
                'description' => 'Cadences de facturation affichées sur les biens en location.',
                'source' => RentPeriod::class,
                'usage' => ['model' => Property::class, 'column' => 'rent_period'],
            ],
        ];
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::all());
    }

    /**
     * @return array{name:string,description:string,source:class-string,usage:array{model:class-string,column:string}}
     */
    public static function get(string $key): array
    {
        return self::all()[$key];
    }
}
