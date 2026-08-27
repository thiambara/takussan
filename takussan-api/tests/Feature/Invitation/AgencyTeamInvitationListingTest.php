<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * TCK-368 — les trois propriétés SERVEUR dont dépend la zone « invitations en
 * attente » de la console Équipe.
 *
 * Elles sont éprouvées ici et non côté front parce qu'aucune d'elles n'est
 * observable depuis un composant : la portée par agence, l'idempotence de la
 * relance et la sortie de la liste après révocation sont des faits de base de
 * données. Un test jsdom qui les « vérifierait » ne vérifierait que son propre
 * bouchon.
 */
class AgencyTeamInvitationListingTest extends TestCase
{
    use RefreshDatabase;

    /**
     * AC2 — « deux relances successives ne créent pas deux invitations ».
     *
     * Le compte est pris sur l'e-mail, pas sur l'id : c'est la propriété qui
     * compte pour le destinataire (une seule invitation vivante), et c'est celle
     * qu'une implémentation naïve — relancer en ré-invitant — casserait sans
     * casser un test sur l'id.
     */
    public function test_two_successive_resends_do_not_create_a_second_invitation(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'email' => 'collab@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);
        $premierJeton = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertOk();
        $deuxiemeJeton = $invitation->fresh()->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertOk();
        $troisiemeJeton = $invitation->fresh()->token;

        $this->assertSame(
            1,
            Invitation::query()->where('email', 'collab@example.com')->count(),
            'Une relance doit réémettre la ligne existante, jamais en créer une seconde.',
        );
        // Chaque relance invalide le lien précédent : trois jetons distincts.
        $this->assertNotSame($premierJeton, $deuxiemeJeton);
        $this->assertNotSame($deuxiemeJeton, $troisiemeJeton);
        $this->assertSame($invitation->id, Invitation::query()->where('email', 'collab@example.com')->value('id'));
    }

    /**
     * Contrainte stricte du ticket — « les invitations listées sont bornées à
     * l'agence active ; le front n'envoie jamais de `filter[agency_id]` ».
     *
     * Le test appelle donc l'endpoint EXACTEMENT comme le front le fait, sans
     * aucun filtre d'agence, et vérifie que l'isolation tient quand même. Une
     * régression qui déplacerait la portée vers le client rougirait ici.
     */
    public function test_the_pending_listing_is_bounded_to_the_active_agency_without_any_agency_filter(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $autreAgence = Agency::factory()->create();

        $mienne = Invitation::factory()->create([
            'email' => 'chez-moi@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);
        $etrangere = Invitation::factory()->create([
            'email' => 'ailleurs@example.com',
            'agency_id' => $autreAgence->id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $reponse = $this->getJson('/api/invitations?filter[status]=sent&sort=-created_at')
            ->assertOk();

        $ids = array_column($reponse->json('data'), 'id');
        $this->assertContains($mienne->id, $ids);
        $this->assertNotContains($etrangere->id, $ids);
    }

    /**
     * AC3, côté serveur — « la révocation fait disparaître la ligne ». Le front
     * ne retire rien de lui-même : il refetch. Si la ligne restait `sent`, elle
     * reviendrait, et l'écran mentirait sur un geste destructif.
     */
    public function test_a_revoked_invitation_leaves_the_pending_listing(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'email' => 'a-annuler@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $avant = array_column(
            $this->getJson('/api/invitations?filter[status]=sent')->assertOk()->json('data'),
            'id',
        );
        $this->assertContains($invitation->id, $avant);

        $this->postJson("/api/invitations/{$invitation->id}/revoke")->assertOk();

        $apres = array_column(
            $this->getJson('/api/invitations?filter[status]=sent')->assertOk()->json('data'),
            'id',
        );
        $this->assertNotContains($invitation->id, $apres);
    }

    /**
     * Le sparse fieldset que la section envoie doit RÉELLEMENT être servi : les
     * sept colonnes demandées, `created_at` comprise — c'est elle qui porte le
     * « depuis quand » de chaque ligne, et `InvitationSummary` (owners.ts) ne la
     * déclarait pas.
     */
    public function test_the_listing_serves_the_columns_the_section_asks_for(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        Invitation::factory()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $ligne = $this->getJson(
            '/api/invitations?fields[invitations]=id,email,role,status,agency_id,expires_at,created_at&filter[status]=sent'
        )->assertOk()->json('data.0');

        foreach (['id', 'email', 'role', 'status', 'agency_id', 'expires_at', 'created_at'] as $colonne) {
            $this->assertArrayHasKey($colonne, $ligne, "La colonne `{$colonne}` manque à la réponse.");
            if ($colonne !== 'agency_id') {
                $this->assertNotNull($ligne[$colonne], "La colonne `{$colonne}` est nulle.");
            }
        }
    }
}
