<?php

namespace Tests\Feature\Invitation;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    // ------------------------------------------------------------------
    // TCK-368 (revue) — la relance ZOMBIE
    // ------------------------------------------------------------------

    /**
     * D1 — « le courriel échoue, et l'invitation reste intacte ».
     *
     * La séquence d'origine réécrivait le jeton dans une transaction qui
     * COMMITAIT, puis envoyait, puis journalisait. Mesuré avec un envoi en
     * échec : jeton tourné, statut `sent`, zéro entrée d'audit — l'ancien
     * lien du destinataire mort, aucun nouveau parti, et l'écran affichant
     * « en attente ».
     *
     * Les trois assertions comptent ENSEMBLE, et c'est ce qui distingue le
     * correctif d'une régression qui les cocherait à moitié : un jeton
     * inchangé sans journal propre laisserait l'audit mentir, et un journal
     * propre avec un jeton tourné laisserait le destinataire dehors.
     */
    public function test_a_failing_email_leaves_the_invitation_exactly_as_it_was(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'email' => 'zombie@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);
        $jetonAvant = $invitation->token;
        $expirationAvant = $invitation->expires_at;

        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP indisponible'));

        $this->postJson("/api/invitations/{$invitation->id}/resend")
            ->assertStatus(500);

        $apres = $invitation->fresh();
        $this->assertSame($jetonAvant, $apres->token, "Le jeton a tourné alors qu'aucun courriel n'est parti : le lien du destinataire est mort pour rien.");
        $this->assertTrue($expirationAvant->equalTo($apres->expires_at), 'La fenêtre de validité a été repoussée sans qu\'aucun lien ne parte.');
        $this->assertSame(
            0,
            DB::table('activity_log')->where('event', 'invitation_resent')->count(),
            "L'audit porte une relance qui n'a jamais eu lieu.",
        );
    }

    // ------------------------------------------------------------------
    // TCK-368 (revue) — l'invitation expirée
    // ------------------------------------------------------------------

    /**
     * D2, moitié LECTURE — une invitation morte ne s'évapore pas de l'écran,
     * et elle se signale comme morte.
     *
     * Deux façons de l'être, et la section doit voir les deux : `status =
     * expired` (écrit par le cron) et `status = sent` dont `expires_at` est
     * déjà passé (le cron tourne à l'heure). `is_expired` est le champ que
     * TCK-367 a ajouté pour ça ; ce test vérifie qu'il est SERVI sur les deux.
     */
    public function test_the_pending_listing_serves_expired_rows_and_flags_them(): void
    {
        $admin = $this->actingAsRole('agency_admin');

        $morteNonMarquee = Invitation::factory()->create([
            'email' => 'morte-non-marquee@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->subHour(),
        ]);
        $marquee = Invitation::factory()->create([
            'email' => 'marquee@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Expired->value,
            'expires_at' => now()->subDays(3),
        ]);
        $vivante = Invitation::factory()->create([
            'email' => 'vivante@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);
        // Terminale : elle, la section ne doit PAS la ramener.
        $revoquee = Invitation::factory()->revoked()->create([
            'email' => 'revoquee@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
        ]);

        $lignes = $this->getJson('/api/invitations?filter[status]=sent,expired&sort=-created_at')
            ->assertOk()
            ->json('data');

        $parId = collect($lignes)->keyBy('id');
        $this->assertTrue($parId->has($morteNonMarquee->id));
        $this->assertTrue($parId->has($marquee->id));
        $this->assertTrue($parId->has($vivante->id));
        $this->assertFalse($parId->has($revoquee->id), 'Une invitation révoquée est terminale : elle n\'a rien à faire dans la liste.');

        $this->assertTrue($parId[$morteNonMarquee->id]['is_expired'], 'Une ligne `sent` déjà périmée doit se signaler expirée — sinon l\'écran l\'affiche « en attente ».');
        $this->assertTrue($parId[$marquee->id]['is_expired']);
        $this->assertFalse($parId[$vivante->id]['is_expired']);
    }

    /**
     * D2, moitié ÉCRITURE — relancer une invitation expirée la RESSUSCITE au
     * lieu d'en laisser naître une seconde.
     *
     * Le compte se prend sur l'e-mail, pas sur l'id : c'est la propriété qui
     * compte pour le destinataire. Avant, l'admin n'avait que « Inviter »
     * comme issue, et `send()` — qui ne regarde que les lignes `sent` — posait
     * une SECONDE ligne.
     */
    public function test_resending_an_expired_invitation_revives_it_instead_of_creating_a_second_row(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'email' => 'perimee@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Expired->value,
            'expires_at' => now()->subDays(2),
        ]);
        $jetonAvant = $invitation->token;

        $this->postJson("/api/invitations/{$invitation->id}/resend")
            ->assertOk()
            ->assertJsonPath('data.status', InvitationStatus::Sent->value)
            ->assertJsonPath('data.is_expired', false);

        $this->assertSame(
            1,
            Invitation::query()->where('email', 'perimee@example.com')->count(),
            'Relancer une invitation expirée ne doit jamais en créer une seconde.',
        );
        $apres = $invitation->fresh();
        $this->assertNotSame($jetonAvant, $apres->token);
        $this->assertTrue($apres->expires_at->isFuture());
    }

    /**
     * ... et la résurrection est REFUSÉE quand une ligne vivante l'a
     * supplantée. C'est la seule branche qui augmente le nombre de lignes
     * `sent` d'un destinataire : sans cette garde, elle rouvre exactement le
     * trou qu'elle vient de fermer, deux jetons ouvrants pour un seul invité.
     */
    public function test_reviving_an_expired_invitation_is_refused_when_a_live_one_supersedes_it(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $perimee = Invitation::factory()->create([
            'email' => 'doublon@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'invitable_type' => null,
            'invitable_id' => null,
            'status' => InvitationStatus::Expired->value,
            'expires_at' => now()->subDays(2),
        ]);
        $vivante = Invitation::factory()->create([
            'email' => 'doublon@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'invitable_type' => null,
            'invitable_id' => null,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $this->postJson("/api/invitations/{$perimee->id}/resend")
            ->assertStatus(409);

        $this->assertSame(InvitationStatus::Expired, $perimee->fresh()->status);
        $this->assertSame(
            1,
            Invitation::query()
                ->where('email', 'doublon@example.com')
                ->where('status', InvitationStatus::Sent->value)
                ->count(),
            'Au plus UNE ligne `sent` par destinataire — la garde a laissé passer une seconde.',
        );
        $this->assertSame($vivante->id, Invitation::query()
            ->where('email', 'doublon@example.com')
            ->where('status', InvitationStatus::Sent->value)
            ->value('id'));
    }

    /**
     * Les états VRAIMENT terminaux restent refusés : la porte ouverte à
     * `expired` ne doit pas être une porte ouverte tout court.
     */
    public function test_resend_stays_refused_on_revoked_and_accepted_invitations(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');

        $revoquee = Invitation::factory()->revoked()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
        ]);
        $acceptee = Invitation::factory()->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
        ]);

        $this->postJson("/api/invitations/{$revoquee->id}/resend")->assertStatus(422);
        $this->postJson("/api/invitations/{$acceptee->id}/resend")->assertStatus(422);
    }

    // ------------------------------------------------------------------
    // TCK-368 (revue) — l'autorisation
    // ------------------------------------------------------------------

    /**
     * D7 (TCK-429) — `invited_by` NE FRANCHIT PAS la frontière d'agence.
     *
     * Mesuré avant correctif : un `agency_admin` dont l'`AgencyAdminProfile`
     * avait été retiré de l'agence obtenait encore **200** sur `resend` ET
     * sur `revoke` d'une invitation de cette agence — un ex-membre pouvait
     * continuer à réémettre un lien d'accès vers une agence qu'il a quittée.
     *
     * Le test agit sur l'invitation que l'ex-admin a LUI-MÊME émise : c'est
     * le seul cas que l'ancienne règle laissait passer, et donc le seul qui
     * prouve quoi que ce soit.
     */
    public function test_an_ex_admin_can_no_longer_act_on_the_invitations_of_the_agency_they_left(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $invitation = Invitation::factory()->create([
            'email' => 'ex-admin@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        // Tant qu'il est membre, il agit.
        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertOk();

        AgencyAdminProfile::query()
            ->where('user_id', $admin->id)
            ->where('agency_id', $admin->agency_id)
            ->forceDelete();

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertStatus(403);
        $this->postJson("/api/invitations/{$invitation->id}/revoke")->assertStatus(403);
        $this->assertSame(InvitationStatus::Sent, $invitation->fresh()->status);
    }

    /**
     * D6 — le front cache les deux boutons sur `useCan('team.invite')` ; le
     * serveur doit accepter la MÊME capacité.
     *
     * `team.invite` n'est pas réservée à la plateforme
     * (`Capability::platformReserved()` ne porte que `properties.moderate` et
     * `reports.view_global`), donc une agence peut l'attacher à un rôle
     * personnalisé de base `Agent` (TCK-279). Cet agent-là voyait les deux
     * boutons et prenait 403 sur les deux : deux gardes qui ne disaient pas
     * la même chose.
     */
    public function test_an_agent_holding_team_invite_can_resend_and_revoke(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $agencyId = (int) $admin->agency_id;

        $invitation = Invitation::factory()->create([
            'email' => 'par-un-agent@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $agencyId,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::TeamInvite])
            ->create(['agency_id' => $agencyId]);

        $agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agencyId,
            'agency_role_id' => $role->id,
        ]);

        $this->actingAs($agent);

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertOk();
        $this->postJson("/api/invitations/{$invitation->id}/revoke")->assertOk();
        $this->assertSame(InvitationStatus::Revoked, $invitation->fresh()->status);
    }

    /**
     * ... et un agent SANS la capacité reste dehors. Sans ce contre-test, le
     * précédent serait coché par une policy qui aurait simplement cessé de
     * juger.
     */
    public function test_an_agent_without_team_invite_is_still_refused(): void
    {
        Mail::fake();
        $admin = $this->actingAsRole('agency_admin');
        $agencyId = (int) $admin->agency_id;

        $invitation = Invitation::factory()->create([
            'email' => 'pas-touche@example.com',
            'invited_by' => $admin->id,
            'agency_id' => $agencyId,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::AgencyUpdate])
            ->create(['agency_id' => $agencyId]);

        $agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $agencyId,
            'agency_role_id' => $role->id,
        ]);

        $this->actingAs($agent);

        $this->postJson("/api/invitations/{$invitation->id}/resend")->assertStatus(403);
        $this->postJson("/api/invitations/{$invitation->id}/revoke")->assertStatus(403);
    }

    /**
     * La pagination de la section est RÉELLE côté serveur : `per_page` et
     * `page` bornent la liste et `meta.total` porte le compte entier.
     *
     * Sans ça, la section n'aurait aucun moyen d'atteindre les invitations
     * au-delà de la première page — mesuré à 13 invitations : 10 rendues,
     * `meta.total = 13`, trois invisibles et inactionnables.
     */
    public function test_the_listing_paginates_and_reports_the_full_total(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        Invitation::factory()->count(13)->create([
            'invited_by' => $admin->id,
            'agency_id' => $admin->agency_id,
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDay(),
        ]);

        $premiere = $this->getJson('/api/invitations?filter[status]=sent,expired&sort=-created_at&page=1&per_page=10')
            ->assertOk()
            ->json();
        $this->assertCount(10, $premiere['data']);
        $this->assertSame(13, $premiere['meta']['total']);
        $this->assertSame(2, $premiere['meta']['last_page']);

        $seconde = $this->getJson('/api/invitations?filter[status]=sent,expired&sort=-created_at&page=2&per_page=10')
            ->assertOk()
            ->json();
        $this->assertCount(3, $seconde['data']);

        // Les deux pages ne se recouvrent pas : 13 lignes distinctes, toutes
        // atteignables.
        $ids = array_merge(array_column($premiere['data'], 'id'), array_column($seconde['data'], 'id'));
        $this->assertCount(13, array_unique($ids));
    }
}
