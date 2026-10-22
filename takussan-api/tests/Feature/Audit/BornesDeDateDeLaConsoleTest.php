<?php

namespace Tests\Feature\Audit;

use App\Models\Activity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * P119.02 (TCK-1271) — une date de fin seule couvre tout le jour choisi sur l'audit de la console
 * et sur l'activité d'un compte, comme sur le journal de l'agence (`normalizeRangeBoundary()`) :
 * le sélecteur envoie `yyyy-MM-dd`, et « du 22 au 22 » ne rendait aucune ligne.
 */
class BornesDeDateDeLaConsoleTest extends ApiTestCase
{
    use RefreshDatabase;

    private function ligneAMidi(User $cible): void
    {
        activity('tmp')->causedBy($cible)->event('borne_119')->log('borne_119');
        Activity::query()->where('event', 'borne_119')->update(['created_at' => '2026-10-22 12:00:00']);
    }

    public function test_l_audit_de_la_console_rend_la_ligne_du_jour_choisi(): void
    {
        $this->ligneAMidi(User::factory()->create());
        $this->apiActingAsRole('super_admin');

        $this->apiGet('/api/admin/audit?filter[event]=borne_119&filter[date_from]=2026-10-22&filter[date_to]=2026-10-22')
            ->assertOk()->assertJsonCount(1, 'data');
        $this->apiGet('/api/admin/audit?filter[event]=borne_119&filter[date_to]=2026-10-21')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_l_activite_d_un_compte_rend_la_ligne_du_jour_choisi(): void
    {
        $cible = User::factory()->create();
        $this->ligneAMidi($cible);
        $this->apiActingAsRole('super_admin');

        $this->apiGet("/api/admin/users/{$cible->id}/activity?filter[event]=borne_119&filter[date_from]=2026-10-22&filter[date_to]=2026-10-22")
            ->assertOk()->assertJsonCount(1, 'data');
    }
}
