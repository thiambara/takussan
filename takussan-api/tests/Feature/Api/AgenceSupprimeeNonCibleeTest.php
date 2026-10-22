<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Announcement;
use App\Models\Enums\AnnouncementSeverity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * P96.03 (TCK-1338) — le super-admin choisit l'agence d'un seuil d'alerte, d'une configuration
 * d'indicateur, d'une intégration, d'un bien, d'une invitation et du ciblage d'une annonce : une
 * agence supprimée en douceur y est refusée en 422 sur le champ, comme une agence absente.
 * Avant, `exists:agencies,id` l'acceptait, et la ligne s'écrivait rattachée à une agence supprimée.
 *
 * Le corps n'est pas complet : seule compte l'erreur portée, ou non, par le champ de l'agence.
 */
class AgenceSupprimeeNonCibleeTest extends ApiTestCase
{
    use RefreshDatabase;

    /** @return array<string, array{0: string, 1: string}> chemin → [clé, champ] */
    public static function chemins(): array
    {
        return [
            'seuil d\'alerte' => ['seuil', 'agency_id'],
            'configuration d\'indicateur' => ['indicateur', 'agency_id'],
            'intégration' => ['integration', 'agency_id'],
            'bien' => ['bien', 'agency_id'],
            'invitation' => ['invitation', 'agency_id'],
            'annonce créée' => ['annonce', 'segment.agency_ids.0'],
            'annonce modifiée' => ['annonce_modifiee', 'segment.agency_ids.0'],
        ];
    }

    private function envoyer(string $chemin, int $agencyId): TestResponse
    {
        return match ($chemin) {
            'seuil' => $this->apiPost('/api/threshold-alerts', ['agency_id' => $agencyId]),
            'indicateur' => $this->apiPost('/api/kpi-configs', ['agency_id' => $agencyId]),
            'integration' => $this->apiPost('/api/integrations', ['agency_id' => $agencyId]),
            'bien' => $this->apiPost('/api/properties', ['agency_id' => $agencyId]),
            'invitation' => $this->apiPost('/api/invitations', ['agency_id' => $agencyId]),
            'annonce' => $this->apiPost('/api/admin/announcements', ['segment' => ['agency_ids' => [$agencyId]]]),
            'annonce_modifiee' => $this->apiPatch('/api/admin/announcements/'.$this->annonce()->id, ['segment' => ['agency_ids' => [$agencyId]]]),
        };
    }

    private function annonce(): Announcement
    {
        return Announcement::query()->create([
            'title' => ['fr' => 'Maintenance', 'en' => 'Maintenance', 'wo' => 'Maintenance'],
            'body' => ['fr' => 'Ce soir.', 'en' => 'Tonight.', 'wo' => 'Ce soir.'],
            'severity' => AnnouncementSeverity::Warning,
            'segment' => [],
            'starts_at' => now()->subMinute(),
            'ends_at' => now()->addDay(),
            'is_active' => true,
        ]);
    }

    #[DataProvider('chemins')]
    public function test_une_agence_supprimee_est_refusee_comme_une_agence_absente(string $chemin, string $champ): void
    {
        $this->apiActingAsRole('super_admin');
        $supprimee = Agency::factory()->create();
        $supprimee->delete();

        $this->envoyer($chemin, $supprimee->id)->assertStatus(422)->assertJsonValidationErrors([$champ]);
        $this->envoyer($chemin, 99_999_999)->assertStatus(422)->assertJsonValidationErrors([$champ]);
    }

    #[DataProvider('chemins')]
    public function test_une_agence_vivante_passe_la_regle(string $chemin, string $champ): void
    {
        $this->apiActingAsRole('super_admin');
        $vivante = Agency::factory()->create();

        $this->envoyer($chemin, $vivante->id)->assertJsonMissingValidationErrors([$champ]);
    }
}
