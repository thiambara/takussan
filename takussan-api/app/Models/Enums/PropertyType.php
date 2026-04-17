<?php

namespace App\Models\Enums;

enum PropertyType: string
{
    case Apartment = 'apartment';
    case House = 'house';
    case Villa = 'villa';
    case Studio = 'studio';
    case Land = 'land';
    case Office = 'office';
    case Shop = 'shop';
    case Other = 'other';

    public function label(): string
    {
        return match ($this) {
            self::Apartment => 'Appartement',
            self::House => 'Maison',
            self::Villa => 'Villa',
            self::Studio => 'Studio',
            self::Land => 'Terrain',
            self::Office => 'Bureau',
            self::Shop => 'Commerce',
            self::Other => 'Autre',
        };
    }
}
