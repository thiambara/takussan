<?php

namespace Tests\Feature\Public;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\UserStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-2863 (défaut trouvé par TCK-2862) — la fiche publique d'un agent, et l'équipe d'une fiche
 * d'agence, servaient `$user->avatar_url` : un attribut qui n'existe pas sur `User` (ni colonne, ni
 * accesseur), donc toujours `null`. La photo n'était jamais affichée. Elles servent désormais
 * `User::avatarUrl()`, la miniature, comme le reste de l'API.
 */
class PublicAvatarDeLaFicheTest extends TestCase
{
    use RefreshDatabase;

    private function agentAvecPhoto(Agency $agence): User
    {
        Storage::fake((string) config('media-library.public_disk_name'));
        $agent = User::factory()->create(['username' => 'awa-photo', 'status' => UserStatus::Active]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agence->id]);
        $agent->addMedia(UploadedFile::fake()->image('avatar.jpg', 256, 256))->toMediaCollection('avatar');

        $attendue = $agent->fresh()->avatarUrl();
        $this->assertNotNull($attendue, 'la miniature de l\'avatar doit avoir été produite');

        return $agent;
    }

    public function test_la_fiche_publique_de_l_agent_sert_l_url_de_sa_photo(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active]);
        $agent = $this->agentAvecPhoto($agence);

        $this->getJson('/api/public/agents/awa-photo')
            ->assertOk()
            ->assertJsonPath('data.avatar_url', $agent->fresh()->avatarUrl());
    }

    public function test_l_equipe_de_la_fiche_d_agence_sert_l_url_de_la_photo(): void
    {
        $agence = Agency::factory()->create(['status' => AgencyStatus::Active, 'slug' => 'sahel-photo']);
        $agent = $this->agentAvecPhoto($agence);

        $membre = collect($this->getJson('/api/public/agencies/sahel-photo')->assertOk()->json('data.agents'))
            ->firstWhere('id', $agent->id);
        $this->assertNotNull($membre);
        $this->assertSame($agent->fresh()->avatarUrl(), $membre['avatar_url']);
    }
}
