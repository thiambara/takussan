<?php

namespace Tests\Unit;

use App\Models\Enums\MaintenanceCategory;
use PHPUnit\Framework\TestCase;

/**
 * TCK-2713 — la correspondance catégorie de demande → métiers du prestataire (décision du porteur du
 * 2026-11-11). Chaque cas de l'enum en a une : un cas neuf sans entrée lève ici.
 */
class MaintenanceCategoryTradesTest extends TestCase
{
    public function test_chaque_categorie_a_ses_metiers(): void
    {
        $attendu = [
            'plumbing' => ['plumbing'],
            'electrical' => ['electrical'],
            'structural' => ['masonry'],
            'appliance' => ['climate_control', 'electrical'],
            'painting' => ['painting'],
            'cleaning' => ['cleaning'],
            'pest_control' => ['pest_control'],
            'locksmith' => ['locksmith'],
            'other' => [],
        ];

        $obtenu = [];
        foreach (MaintenanceCategory::cases() as $cas) {
            $obtenu[$cas->value] = $cas->trades();
        }

        $this->assertSame($attendu, $obtenu);
    }

    /** L'invitation par l'agence écrit des valeurs de catégorie : elles désignent toujours. */
    public function test_la_categorie_elle_meme_designe_aussi_sauf_autre(): void
    {
        $this->assertSame(['masonry', 'structural'], MaintenanceCategory::Structural->matchingSpecialties());
        $this->assertSame(['climate_control', 'electrical', 'appliance'], MaintenanceCategory::Appliance->matchingSpecialties());
        $this->assertSame(['plumbing'], MaintenanceCategory::Plumbing->matchingSpecialties());
        $this->assertSame([], MaintenanceCategory::Other->matchingSpecialties());
    }
}
