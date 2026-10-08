<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-600 — AC20 : les deux recherches existantes de la console ne sont plus sensibles à la casse
 * (`like` nu sur PostgreSQL : « diop » ne trouvait pas « Diop »).
 */
class AdminConsoleSearchCaseTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    public function test_la_liste_des_comptes_trouve_diop(): void
    {
        $diop = User::factory()->create(['last_name' => 'Diop']);
        User::factory()->create(['last_name' => 'Fall']);
        $this->agirEnOperateur(PlatformProfileLevel::Support);

        $ids = collect($this->getJson('/api/admin/users?filter[search]=diop')->assertOk()->json('data'))->pluck('id');

        $this->assertSame([$diop->id], $ids->all());
    }

    public function test_la_liste_des_agences_trouve_keur_et_cafe(): void
    {
        $keur = Agency::factory()->create(['name' => 'Keur Immo']);
        $cafe = Agency::factory()->create(['name' => 'CAFÉ IMMO']);
        Agency::factory()->create(['name' => 'Teranga Biens']);
        $this->agirEnOperateur(PlatformProfileLevel::Viewer);

        $this->assertSame([$keur->id], $this->agences('keur'));
        $this->assertSame([$cafe->id], $this->agences('café'));
        $this->assertSame([], $this->agences('%'));
    }

    /** @return list<int> */
    private function agences(string $search): array
    {
        return collect($this->getJson('/api/admin/agencies?filter[search]='.urlencode($search))->assertOk()->json('data'))
            ->pluck('id')->values()->all();
    }
}
