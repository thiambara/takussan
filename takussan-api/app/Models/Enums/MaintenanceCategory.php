<?php

namespace App\Models\Enums;

enum MaintenanceCategory: string
{
    case Plumbing = 'plumbing';
    case Electrical = 'electrical';
    case Structural = 'structural';
    case Appliance = 'appliance';
    case Painting = 'painting';
    case Cleaning = 'cleaning';
    case PestControl = 'pest_control';
    case Locksmith = 'locksmith';
    case Other = 'other';

    /**
     * TCK-2713 — les métiers d'un prestataire (`specialties`) qui servent cette catégorie, dans
     * l'ordre de préférence ; vide : aucune suggestion. Décision du porteur du 2026-11-11. Un
     * `match` sans défaut : un cas neuf sans entrée lève, et `MaintenanceCategoryTradesTest` le voit.
     *
     * ⚠ `specialties` porte DEUX vocabulaires : l'onboarding du prestataire écrit des métiers
     * (`masonry`, `climate_control`…), l'invitation par l'agence des valeurs de catégorie
     * (`structural`, `appliance`…). {@see self::matchingSpecialties()} accepte donc les deux.
     *
     * @return list<string>
     */
    public function trades(): array
    {
        return match ($this) {
            self::Plumbing => ['plumbing'],
            self::Electrical => ['electrical'],
            self::Structural => ['masonry'],
            self::Appliance => ['climate_control', 'electrical'],
            self::Painting => ['painting'],
            self::Cleaning => ['cleaning'],
            self::PestControl => ['pest_control'],
            self::Locksmith => ['locksmith'],
            self::Other => [],
        };
    }

    /**
     * TCK-2713 — les valeurs de `specialties` qui désignent un prestataire pour cette catégorie : ses
     * métiers, puis la valeur de la catégorie elle-même (vocabulaire de l'invitation par l'agence,
     * qui correspondait déjà avant TCK-2713). Vide pour `other` : aucune suggestion.
     *
     * @return list<string>
     */
    public function matchingSpecialties(): array
    {
        $trades = $this->trades();

        return $trades === [] ? [] : array_values(array_unique([...$trades, $this->value]));
    }
}
