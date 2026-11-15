<?php

namespace Tests\Unit\Services\Documents;

use App\Models\Enums\DocumentType;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeasePaymentType;
use App\Services\Documents\RechercheDuCoffre;
use Tests\TestCase;

/**
 * TCK-2769 — le vocabulaire de la recherche du coffre (`resources/documents/vocabulaire-du-coffre.json`)
 * est DÉRIVÉ des libellés du front (`takussan-web/scripts/gen-vocabulaire-du-coffre.mjs`), qui tient la
 * liste des catégories. Ce test rougit quand le coffre émet une catégorie, ou une pièce un type, que le
 * fichier ne connaît pas : sans libellé, l'entrée ne se trouverait plus par ce que l'écran en montre.
 */
class RechercheDuCoffreVocabulaireTest extends TestCase
{
    /** @return list<string> les catégories d'entrées générées que `DocumentVault` peut émettre */
    private function categoriesEmises(): array
    {
        return [
            'lease_contract',
            ...array_map(fn (InventoryType $t) => "inventory_{$t->value}", InventoryType::cases()),
            ...array_map(fn (LeasePaymentType $t) => "receipt_{$t->value}", LeasePaymentType::cases()),
            'owner_statement',
            'annual_attestation',
            'provider_bill',
        ];
    }

    public function test_chaque_categorie_emise_et_chaque_type_ont_un_libelle_en_francais_et_en_anglais(): void
    {
        $vocabulaire = RechercheDuCoffre::vocabulaire();

        foreach ($this->categoriesEmises() as $categorie) {
            $this->assertNotEmpty($vocabulaire['categories'][$categorie]['fr'] ?? null, "catégorie {$categorie} (fr)");
            $this->assertNotEmpty($vocabulaire['categories'][$categorie]['en'] ?? null, "catégorie {$categorie} (en)");
        }
        foreach (DocumentType::cases() as $type) {
            $this->assertNotEmpty($vocabulaire['types'][$type->value]['fr'] ?? null, "type {$type->value} (fr)");
            $this->assertNotEmpty($vocabulaire['types'][$type->value]['en'] ?? null, "type {$type->value} (en)");
        }
    }

    public function test_les_termes_de_la_requete_sont_replies_et_sans_mots_outils(): void
    {
        $this->assertSame(['quittance', 'aout', '2026'], RechercheDuCoffre::termes('Quittance d’Août 2026'));
        $this->assertSame(['etat', 'lieux'], RechercheDuCoffre::termes('État des lieux'));
        $this->assertSame([], RechercheDuCoffre::termes('de la'));
    }
}
