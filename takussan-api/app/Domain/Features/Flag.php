<?php

namespace App\Domain\Features;

enum Flag: string
{
    case PropertyCompare = 'property_compare';
    case AdvancedSearch = 'advanced_search';
    case MaintenanceBanner = 'maintenance_banner';

    public function label(): string
    {
        return match ($this) {
            self::PropertyCompare => 'Comparateur de biens',
            self::AdvancedSearch => 'Recherche avancée',
            self::MaintenanceBanner => 'Bandeau maintenance',
        };
    }

    public function description(): string
    {
        return match ($this) {
            self::PropertyCompare => 'Active les expériences de comparaison de biens côté client.',
            self::AdvancedSearch => 'Active les filtres avancés et les surfaces de recherche enrichies.',
            self::MaintenanceBanner => 'Expose le bandeau maintenance applicatif.',
        };
    }

    public function clientVisible(): bool
    {
        return match ($this) {
            self::PropertyCompare, self::AdvancedSearch, self::MaintenanceBanner => true,
        };
    }

    /**
     * @return array<int,array<string,string>>
     */
    public static function catalogue(): array
    {
        return collect(self::cases())
            ->map(fn (self $flag) => [
                'key' => $flag->value,
                'label' => $flag->label(),
                'description' => $flag->description(),
                'client_visible' => $flag->clientVisible(),
            ])
            ->all();
    }
}
