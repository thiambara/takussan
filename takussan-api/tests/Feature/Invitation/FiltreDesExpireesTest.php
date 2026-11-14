<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * Vérification de TCK-2668 (D6) — `GET /api/invitations?filter[expired]=1|0` : « expirée » au sens de
 * la purge (`ExpiredInvitationPurge`) et d'`is_expired`, pas de la seule colonne `status`.
 *
 * Mesuré sur 776dc214f : « Tout effacer » annonçait le `meta.total` de `filter[status]=expired`, et la
 * purge effaçait aussi les `sent` à l'échéance passée que le balayage horaire n'avait pas encore
 * marquées — listées, elles, sous « En cours ». Le nombre dit était inférieur à ce qui partait.
 */
class FiltreDesExpireesTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
    }

    private function invitation(InvitationStatus $status, bool $past): Invitation
    {
        return Invitation::factory()->create([
            'agency_id' => $this->agency->id, 'role' => 'agent', 'status' => $status->value,
            'expires_at' => $past ? now()->subDay() : now()->addDays(3),
        ]);
    }

    /** @return list<int> */
    private function ids(string $query): array
    {
        $ids = array_column($this->apiGet("/api/invitations?filter[role]=agent&{$query}")->assertOk()->json('data'), 'id');
        sort($ids);

        return $ids;
    }

    public function test_les_expirees_et_les_en_cours_se_partagent_les_sans_reponse_comme_la_purge(): void
    {
        $marquee = $this->invitation(InvitationStatus::Expired, true);
        $nonMarquee = $this->invitation(InvitationStatus::Sent, true);
        $enCours = $this->invitation(InvitationStatus::Sent, false);
        $this->invitation(InvitationStatus::Accepted, true);
        $this->invitation(InvitationStatus::Revoked, true);
        $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);

        $expirees = $this->ids('filter[status]=sent,expired&filter[expired]=1');
        $this->assertSame([$marquee->id, $nonMarquee->id], $expirees);
        $this->assertSame([$enCours->id], $this->ids('filter[status]=sent&filter[expired]=0'));
        $this->assertSame([], $this->ids('filter[expired]=abc'));

        // Le nombre annoncé est ce que la purge efface.
        $this->deleteJson('/api/invitations/expired?filter[role]=agent')->assertOk()->assertExactJson(['deleted' => count($expirees)]);
    }
}
