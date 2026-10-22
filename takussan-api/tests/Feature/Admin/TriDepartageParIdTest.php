<?php

namespace Tests\Feature\Admin;

use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\PrivacyRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-1292 (P118.06) — trois lectures de la console triaient sur une colonne non unique sans `id` :
 * l'ordre de deux lignes égales suivait alors le rangement physique de la table, qui change dès
 * qu'une ligne est réécrite (PostgreSQL range la nouvelle version en fin de table). Chaque test
 * crée des lignes égales sur la clé de tri, puis réécrit la première pour la déplacer.
 */
class TriDepartageParIdTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        $this->admin = $this->apiActingAsRole('super_admin');
    }

    public function test_les_invitations_de_cooptation_egales_se_departagent_par_id(): void
    {
        $ids = [];
        foreach (['a', 'b', 'c'] as $nom) {
            $ids[] = Invitation::factory()->create([
                'email' => "coopte-{$nom}@example.com",
                'invited_by' => $this->admin->id,
                'agency_id' => null,
                'role' => 'super_admin',
                'status' => InvitationStatus::Sent->value,
                'expires_at' => now()->addDays(7),
                'created_at' => now(),
            ])->id;
        }
        $this->deplacerEnFinDeTable('invitations', $ids[2]);

        $rendus = $this->apiGet('/api/admin/super-admins')->assertOk()->json('data.pending_invitations.*.id');

        $this->assertSame(array_reverse($ids), $rendus);
    }

    public function test_l_export_des_demandes_de_droits_egales_se_departage_par_id(): void
    {
        $ids = [];
        foreach (['Awa', 'Binta', 'Coumba'] as $nom) {
            $ids[] = PrivacyRequest::query()->create([
                'requester_name' => $nom,
                'requester_contact' => strtolower($nom).'@example.test',
                'type' => 'access',
                'channel' => 'email',
                'received_at' => now(),
                'due_at' => now()->addDays(30),
            ])->id;
        }
        $this->deplacerEnFinDeTable('privacy_requests', $ids[0]);

        $csv = $this->get('/api/admin/privacy-requests/export')->assertOk()->streamedContent();
        $lignes = array_slice(array_filter(explode("\n", trim($csv))), 1);
        $rendus = array_map(fn (string $ligne) => (int) str_getcsv($ligne, escape: '\\')[0], $lignes);

        $this->assertSame($ids, $rendus);
    }

    public function test_les_sessions_egales_d_un_utilisateur_se_departagent_par_id(): void
    {
        $user = User::factory()->create();
        $ids = [];
        foreach (['web', 'mobile', 'tablette'] as $nom) {
            $token = $user->createToken($nom)->accessToken;
            $token->forceFill(['last_used_at' => now(), 'created_at' => now()])->save();
            $ids[] = $token->id;
        }
        $this->deplacerEnFinDeTable('personal_access_tokens', $ids[2]);

        $rendus = $this->apiGet("/api/admin/users/{$user->id}/sessions")->assertOk()->json('data.*.id');

        $this->assertSame(array_reverse($ids), $rendus);
    }

    /** Réécrit la ligne sans changer de valeur : sa nouvelle version part en fin de table. */
    private function deplacerEnFinDeTable(string $table, int $id): void
    {
        DB::table($table)->where('id', $id)->update(['updated_at' => now()]);
    }
}
