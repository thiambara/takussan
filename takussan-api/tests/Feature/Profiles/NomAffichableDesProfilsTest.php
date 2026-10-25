<?php

namespace Tests\Feature\Profiles;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * P234.07 (TCK-2280) — `display_name` d'un profil lié à un compte créé par téléphone (noms `''`)
 * rendait `''`, sans retomber sur le nom saisi à l'invitation (`metadata`) comme le fait le front
 * depuis TCK-2136. Son lecteur, `AgencyRoleService::blockingProfiles` (409 de suppression d'un
 * rôle), rendait alors une ligne vide.
 */
class NomAffichableDesProfilsTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{class-string<Model>}> */
    public static function profils(): array
    {
        return [
            'agent' => [AgentProfile::class],
            'bailleur' => [OwnerProfile::class],
            'prestataire' => [ServiceProviderProfile::class],
        ];
    }

    /** @param class-string<Model> $classe */
    #[DataProvider('profils')]
    public function test_un_compte_lie_sans_nom_retombe_sur_le_nom_de_l_invitation(string $classe): void
    {
        $compte = User::factory()->create(['first_name' => '', 'last_name' => '']);

        $this->assertSame('Awa Sarr', $this->profil($classe, $compte)->display_name);
    }

    /** @param class-string<Model> $classe */
    #[DataProvider('profils')]
    public function test_un_compte_nomme_garde_son_nom(string $classe): void
    {
        $compte = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Ba']);

        $this->assertSame('Moussa Ba', $this->profil($classe, $compte)->display_name);
    }

    /** @param class-string<Model> $classe */
    private function profil(string $classe, User $compte): Model
    {
        $attributs = ['user_id' => $compte->id, 'metadata' => ['first_name' => 'Awa', 'last_name' => 'Sarr']];
        if ($classe !== ServiceProviderProfile::class) {
            $attributs['agency_id'] = Agency::factory()->create()->id;
        }

        return $classe::factory()->create($attributs)->fresh();
    }
}
