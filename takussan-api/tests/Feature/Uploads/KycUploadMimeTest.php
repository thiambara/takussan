<?php

namespace Tests\Feature\Uploads;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-601 — AC5 : une pièce KYC a une liste de types, sur les QUATRE routes d'upload. Un `.html`,
 * un `.svg` et un fichier vide sont refusés ; une photo `.heic` et un `.pdf` passent.
 */
class KycUploadMimeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string}> */
    public static function routes(): array
    {
        return [
            'bailleur' => ['owner'],
            'agent' => ['agent'],
            'prestataire' => ['provider'],
            'agence' => ['agency'],
        ];
    }

    /** @return array{0: string, 1: array<string, string>, 2: string} uri, champs, nom du champ fichier */
    private function route(string $route): array
    {
        if ($route === 'agency') {
            $agency = Agency::factory()->create();
            $this->actingAsRole('agency_admin', ['agency' => $agency]);

            return ["/api/agencies/{$agency->id}/kyc/documents", ['document_type' => 'rccm'], 'document'];
        }

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        return match ($route) {
            'owner' => ['/api/me/owner-profiles/'.OwnerProfile::factory()->create(['user_id' => $user->id])->id.'/kyc/upload', ['kind' => 'cni'], 'file'],
            'agent' => ['/api/me/agent-profiles/'.AgentProfile::factory()->create(['user_id' => $user->id])->id.'/kyc/upload', ['kind' => 'cni'], 'file'],
            'provider' => ['/api/me/profiles/'.ServiceProviderProfile::factory()->create(['user_id' => $user->id])->id.'/kyc/upload', ['kind' => 'cni'], 'file'],
        };
    }

    #[DataProvider('routes')]
    public function test_un_fichier_html_svg_ou_vide_est_refuse(string $route): void
    {
        [$uri, $fields, $field] = $this->route($route);

        $refused = [
            'html' => UploadedFile::fake()->create('piece.html', 20, 'text/html'),
            'svg' => UploadedFile::fake()->create('piece.svg', 20, 'image/svg+xml'),
            'vide' => UploadedFile::fake()->create('piece.pdf', 0, 'application/pdf'),
        ];

        foreach ($refused as $label => $file) {
            $this->postJson($uri, $fields + [$field => $file])
                ->assertStatus(422)
                ->assertJsonValidationErrors($field);
        }
    }

    #[DataProvider('routes')]
    public function test_un_heic_et_un_pdf_passent(string $route): void
    {
        [$uri, $fields, $field] = $this->route($route);

        foreach ([
            UploadedFile::fake()->create('piece.heic', 300, 'image/heic'),
            UploadedFile::fake()->create('piece.pdf', 300, 'application/pdf'),
        ] as $file) {
            $this->postJson($uri, $fields + [$field => $file])->assertCreated();
        }
    }
}
