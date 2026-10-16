<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-697 (P23.01, ADR-0055 §3) — sous impersonation, les pièces (`id_card`, `rib`, `ninea`)
 * rattachées à un PROFIL ne s'ouvrent pas par `/api/documents`, comme `api/kyc/documents/*` est
 * déjà refusé pour la pièce d'agence.
 *
 * Un cas par profil (propriétaire, agent, prestataire), chacun téléversé par la voie réelle de son
 * assistant d'accueil. Chaque cas porte son versant « autorisé » : la cible, sous son propre jeton,
 * lit toujours sa pièce — sans lui, une policy qui refuserait tout le monde rendrait le test vert.
 */
class ImpersonationProfilePiecesTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    /** @return array<string, array{0: string, 1: string}> */
    public static function profils(): array
    {
        return [
            'propriétaire' => [OwnerProfile::class, 'owner-profiles'],
            'agent' => [AgentProfile::class, 'agent-profiles'],
            'prestataire' => [ServiceProviderProfile::class, 'profiles'],
        ];
    }

    #[DataProvider('profils')]
    public function test_la_piece_d_un_profil_est_refusee_sous_impersonation(string $profilClass, string $segment): void
    {
        $cible = User::factory()->create();
        $piece = $this->televerserUneCni($cible, $profilClass, $segment);

        // Versant autorisé : la cible lit sa pièce sous son propre jeton.
        $this->commeCible($cible);
        $this->assertContains($piece->id, $this->getJson('/api/documents')->assertOk()->json('data.*.id'));
        $this->getJson("/api/documents/{$piece->id}")->assertOk();

        $session = $this->ouvrirUneSession(cible: $cible);
        $this->avecLeJeton($session['jeton']);

        $this->assertNotContains($piece->id, $this->getJson('/api/documents')->assertOk()->json('data.*.id'));
        $this->getJson("/api/documents/{$piece->id}")->assertForbidden();
        $this->getJson("/api/documents/{$piece->id}/versions")->assertForbidden();
    }

    /** Le refus vise les pièces : un autre document du même profil reste lisible sous impersonation. */
    public function test_un_document_du_profil_qui_n_est_pas_une_piece_reste_lisible(): void
    {
        $cible = User::factory()->create();
        $agent = AgentProfile::factory()->create(['user_id' => $cible->id]);
        Sanctum::actingAs($cible);
        $this->postJson("/api/me/agent-profiles/{$agent->id}/kyc/upload", [
            'file' => UploadedFile::fake()->image('license.jpg')->size(200),
            'kind' => 'license',
        ])->assertCreated();
        $licenceId = Document::query()->where('type', DocumentType::Other)->sole()->id;

        $session = $this->ouvrirUneSession(cible: $cible);
        $this->avecLeJeton($session['jeton']);

        $this->assertContains($licenceId, $this->getJson('/api/documents')->assertOk()->json('data.*.id'));
        $this->getJson("/api/documents/{$licenceId}")->assertOk();
    }

    private function televerserUneCni(User $cible, string $profilClass, string $segment): Document
    {
        $profil = $profilClass::factory()->create(['user_id' => $cible->id]);

        Sanctum::actingAs($cible);
        $this->postJson("/api/me/{$segment}/{$profil->id}/kyc/upload", [
            'file' => UploadedFile::fake()->create('cni.pdf', 200, 'application/pdf'),
            'kind' => 'cni',
        ])->assertCreated();

        return Document::query()
            ->where('documentable_type', $profilClass)
            ->where('documentable_id', $profil->id)
            ->where('type', DocumentType::IdCard)
            ->sole();
    }

    private function commeCible(User $cible): void
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($cible->fresh());
    }
}
