<?php

namespace Tests\Feature\Admin\Platform;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-600 (ADR-0048 §3, verif-600 O2) — une agence suspendue ne reçoit plus de travail.
 *
 * Sonde de la vérification, rejouée sur `e0147999` : dans une agence suspendue, l'accord du
 * bailleur au devis rendait 423, mais le prestataire ACCEPTAIT l'intervention (200). Le verrou ne
 * voyait que les profils d'agence, et un prestataire n'en porte aucun.
 *
 * Un test par geste du prestataire, et pour chacun le témoin : le même geste, dans la même
 * intervention d'une agence active, passe. Le 423 vient donc de la suspension, pas d'un état que
 * le geste refuserait de toute façon.
 */
class AgencySuspensionProviderLockTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function gestes(): array
    {
        return array_map(fn (string $g) => [$g], array_combine(self::GESTES, self::GESTES));
    }

    private const GESTES = [
        'accepter', 'refuser', 'devis', 'statut', 'demarrer', 'terminer', 'photos_avant', 'modifier',
        'message', 'piece_jointe',
    ];

    #[DataProvider('gestes')]
    public function test_le_prestataire_n_ecrit_plus_pour_une_agence_suspendue(string $geste): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'fil' => $fil] = $this->intervention($geste);
        $agency->forceFill(['status' => AgencyStatus::Suspended])->save();
        $avant = $this->empreinte($mr, $fil);

        Sanctum::actingAs($provider);
        $this->faire($geste, $mr, $fil)
            ->assertStatus(423)
            ->assertJsonPath('code', 'agency.suspended');

        $this->assertSame($avant, $this->empreinte($mr, $fil), "« {$geste} » a écrit malgré le 423");
    }

    #[DataProvider('gestes')]
    public function test_temoin_le_meme_geste_passe_dans_une_agence_active(string $geste): void
    {
        ['mr' => $mr, 'provider' => $provider, 'fil' => $fil] = $this->intervention($geste);

        Sanctum::actingAs($provider);
        $this->faire($geste, $mr, $fil)->assertSuccessful();
    }

    /** La lecture reste ouverte : la fiche, le devis, le fil. */
    public function test_le_prestataire_lit_toujours_l_intervention(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency, 'fil' => $fil] = $this->intervention('accepter');
        $agency->forceFill(['status' => AgencyStatus::Suspended])->save();

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk();
        $this->getJson("/api/conversations/{$fil}/messages")->assertOk();
    }

    /**
     * Sur le fil, seul le message est un travail pour l'agence : marquer lu reste à la personne
     * (nommé dans ADR-0048 §3).
     */
    public function test_marquer_le_fil_lu_reste_ouvert(): void
    {
        ['provider' => $provider, 'agency' => $agency, 'fil' => $fil] = $this->intervention('accepter');
        $agency->forceFill(['status' => AgencyStatus::Suspended])->save();

        Sanctum::actingAs($provider);
        $this->putJson("/api/conversations/{$fil}/read")->assertSuccessful();
    }

    /** Le verrou ne vaut que pour `suspended` (ADR-0048) : une agence `inactive` reçoit encore. */
    public function test_une_agence_inactive_ne_verrouille_pas_le_prestataire(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'agency' => $agency] = $this->intervention('accepter');
        $agency->forceFill(['status' => AgencyStatus::Inactive])->save();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/accept")->assertOk();
    }

    /**
     * Une intervention assignée, avec son fil (ouvert par l'assignation, comme en production), dans
     * l'état que le geste exige.
     *
     * @return array{mr: MaintenanceRequest, provider: User, agency: Agency, fil: int}
     */
    private function intervention(string $geste): array
    {
        Storage::fake(config('media-library.disk_name'));
        Storage::fake('private');

        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $fil = (int) $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])
            ->assertOk()->json('data.conversation_id');

        [$status, $acceptee] = match ($geste) {
            'accepter', 'refuser' => [MaintenanceStatus::Assigned, false],
            'devis' => [MaintenanceStatus::QuoteRequested, true],
            'statut', 'demarrer', 'photos_avant' => [MaintenanceStatus::Assigned, true],
            default => [MaintenanceStatus::InProgress, true],
        };
        $mr->forceFill(['status' => $status, 'accepted_at' => $acceptee ? now() : null])->save();

        return ['mr' => $mr->refresh(), 'provider' => $provider, 'agency' => $agency, 'fil' => $fil];
    }

    private function faire(string $geste, MaintenanceRequest $mr, int $fil): TestResponse
    {
        $base = "/api/maintenance-requests/{$mr->id}";

        return match ($geste) {
            'accepter' => $this->postJson("{$base}/accept"),
            'refuser' => $this->postJson("{$base}/decline", ['reason' => 'Indisponible']),
            'devis' => $this->postJson("{$base}/quote/submit", $this->quoteBody(27000)),
            'statut' => $this->putJson("{$base}/status", ['status' => 'in_progress']),
            'demarrer' => $this->postJson("{$base}/start"),
            'terminer' => $this->putJson("{$base}/complete", ['resolution_notes' => 'Réparé']),
            'photos_avant' => $this->post("{$base}/photos", [
                'collection' => 'before_photos',
                'photos' => [UploadedFile::fake()->image('avant.jpg')],
            ], ['Accept' => 'application/json']),
            'modifier' => $this->patchJson($base, ['resolution_notes' => 'Pièce commandée']),
            'message' => $this->postJson("/api/conversations/{$fil}/messages", ['content' => 'Je passe demain']),
            'piece_jointe' => $this->post('/api/media', [
                'file' => UploadedFile::fake()->image('p.jpg'),
                'collection' => 'photos',
                'model_type' => MaintenanceRequest::class,
                'model_id' => $mr->id,
            ], ['Accept' => 'application/json']),
        };
    }

    /** Ce qu'un geste du prestataire changerait : l'intervention, ses pièces, son fil. */
    private function empreinte(MaintenanceRequest $mr, int $fil): string
    {
        $mr = $mr->fresh();

        return json_encode([
            $mr->only(['status', 'assigned_to', 'accepted_at', 'started_at', 'completed_at', 'quote_amount', 'resolution_notes']),
            $mr->media()->pluck('id')->all(),
            Message::query()->where('conversation_id', $fil)->count(),
        ]);
    }
}
