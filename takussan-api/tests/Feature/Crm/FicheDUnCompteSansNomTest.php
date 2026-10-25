<?php

namespace Tests\Feature\Crm;

use App\Models\User;
use App\Services\Model\CustomerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone (noms `''`) garde des noms
 * vides : décision du porteur, rien n'est écrit en base, c'est le front qui la nomme
 * (`nomAffichable`). Le repli `?? 'Client'` / `?? '#id'` de `findOrCreateFromUser` ne jouait jamais
 * (`users.first_name` et `last_name` sont `NOT NULL`) ; il est retiré.
 *
 * Épingle : vert avant comme après le retrait — c'est la garde de la décision « rien en base ».
 */
class FicheDUnCompteSansNomTest extends TestCase
{
    use RefreshDatabase;

    public function test_la_fiche_d_un_compte_sans_nom_garde_des_noms_vides(): void
    {
        $compte = User::factory()->create([
            'first_name' => '',
            'last_name' => '',
            'email' => null,
            'phone' => '+221770000622',
        ]);

        $fiche = app(CustomerService::class)->findOrCreateFromUser($compte);

        $this->assertSame(['', ''], [$fiche->fresh()->first_name, $fiche->fresh()->last_name]);
        $this->assertSame('+221770000622', $fiche->phone);
    }
}
