<?php

namespace Tests\Feature\Invitation;

use App\Models\Address;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-2609 (ADR-0094 §1-3) — l'invité qui ouvre le lien voit, avant de donner quoi que ce soit,
 * quelle agence l'invite, qui, pour quel rôle et ce qui l'attend. Le jeton est le secret porteur :
 * l'aperçu ne dit rien de plus que le message reçu — destinataire masqué, prénom seul de
 * l'invitant, aucun identifiant interne, la ville seule de l'agence. Le `GET` n'écrit rien.
 */
class PublicInvitationPreviewTest extends TestCase
{
    use RefreshDatabase;

    private const CLES_ACTIONNABLE = [
        'agency', 'awaiting', 'expires_at', 'invited_at', 'inviter', 'prefill', 'recipient', 'recipient_has_account', 'role',
    ];

    private Agency $agency;

    private User $inviter;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create([
            'name' => 'Dakar Immo',
            'phone' => '+221338001122',
            'is_verified' => true,
        ]);
        Address::create([
            'addressable_type' => Agency::class,
            'addressable_id' => $this->agency->id,
            'country' => 'SN',
            'city' => 'Dakar',
            'neighborhood' => 'Plateau',
            'street' => '12 rue Carnot',
        ]);
        $this->inviter = User::factory()->create(['first_name' => 'Moussa', 'last_name' => 'Ndiaye', 'email' => 'moussa.ndiaye@dakar-immo.sn']);
    }

    private function apercu(string $token): TestResponse
    {
        return $this->getJson('/api/public/invitations/'.$token);
    }

    /** @param  array<string, mixed>  $attributs */
    private function invitation(array $attributs = []): Invitation
    {
        return Invitation::factory()->create([
            'agency_id' => $this->agency->id,
            'invited_by' => $this->inviter->id,
            'email' => 'awa.diop@gmail.com',
            'metadata' => ['first_name' => 'Awa', 'last_name' => 'Diop'],
            ...$attributs,
        ]);
    }

    /** AC1 — bailleur avec trois biens liés : le rôle, ce qui l'attend, et rien de plus. */
    public function test_le_bailleur_voit_l_agence_l_invitant_et_ses_trois_biens(): void
    {
        $profil = OwnerProfile::factory()->create(['agency_id' => $this->agency->id, 'user_id' => null]);
        $invitation = $this->invitation(['role' => 'owner', 'invitable_type' => OwnerProfile::class, 'invitable_id' => $profil->id]);
        Property::factory()->draft()->count(3)->create(['agency_id' => $this->agency->id, 'pending_owner_profile_id' => $profil->id]);
        // Deux biens publics de l'agence : le compte de la fiche publique, pas les biens en attente.
        Property::factory()->published()->count(2)->create(['agency_id' => $this->agency->id, 'published_at' => now()->subDay()]);

        $reponse = $this->apercu($invitation->token)->assertOk();
        $data = $reponse->json('data');

        $this->assertEqualsCanonicalizing(self::CLES_ACTIONNABLE, array_keys($data));
        $this->assertSame('owner', $data['role']);
        $this->assertSame(['properties_count' => 3], $data['awaiting']);
        $this->assertSame(['first_name' => 'Moussa'], $data['inviter']);
        $this->assertSame(['channel' => 'email', 'masked' => 'a•••@gmail.com'], $data['recipient']);
        $this->assertFalse($data['recipient_has_account']);
        $this->assertSame(['first_name' => 'Awa', 'last_name' => 'Diop'], $data['prefill']);
        $this->assertSame([
            'name' => 'Dakar Immo',
            'logo_url' => null,
            'city' => 'Dakar',
            'public_properties_count' => 2,
            'verified' => true,
            'public_phone' => '+221338001122',
        ], $data['agency']);
        $this->assertNotNull($data['expires_at']);
        $this->assertNotNull($data['invited_at']);

        $corps = (string) $reponse->getContent();
        foreach (['awa.diop@gmail.com', 'Ndiaye', 'moussa.ndiaye', 'Plateau', 'Carnot', $invitation->token] as $secret) {
            $this->assertStringNotContainsString($secret, $corps, "l'aperçu ne révèle pas « {$secret} »");
        }
        $this->assertStringNotContainsString('"id"', $corps, 'aucun identifiant interne');
    }

    public function test_le_prestataire_voit_l_intervention_qui_l_attend(): void
    {
        $bien = Property::factory()->create(['agency_id' => $this->agency->id, 'title' => 'Villa Almadies']);
        $demande = MaintenanceRequest::factory()->create(['property_id' => $bien->id, 'title' => 'Fuite sous l\'évier']);
        $profil = ServiceProviderProfile::factory()->create();
        $invitation = $this->invitation([
            'role' => 'service_provider',
            'invitable_type' => ServiceProviderProfile::class,
            'invitable_id' => $profil->id,
            'metadata' => ['from_maintenance_request_id' => $demande->id],
        ]);

        $data = $this->apercu($invitation->token)->assertOk()->json('data');

        $this->assertSame('service_provider', $data['role']);
        $this->assertSame(['title', 'property_label', 'reported_at'], array_keys($data['awaiting']['maintenance_request']));
        $this->assertSame('Fuite sous l\'évier', $data['awaiting']['maintenance_request']['title']);
        $this->assertSame('Villa Almadies', $data['awaiting']['maintenance_request']['property_label']);
        $this->assertSame(['first_name' => '', 'last_name' => ''], $data['prefill']);
    }

    /** Une intervention d'une AUTRE agence, citée par la métadonnée, ne sort jamais. */
    public function test_une_intervention_d_une_autre_agence_ne_sort_pas(): void
    {
        $demande = MaintenanceRequest::factory()->create(['title' => 'Chez un autre']);
        $invitation = $this->invitation(['role' => 'service_provider', 'metadata' => ['from_maintenance_request_id' => $demande->id]]);

        $data = $this->apercu($invitation->token)->assertOk()->json('data');

        $this->assertSame([], (array) $data['awaiting']);
        $this->assertStringNotContainsString('Chez un autre', json_encode($data, JSON_UNESCAPED_UNICODE));
    }

    /** L'agent invité par SMS : le numéro masqué, et le compte qui existe déjà est signalé. */
    public function test_par_sms_le_numero_est_masque_et_le_compte_existant_signale(): void
    {
        User::factory()->create(['phone' => '+221771234567', 'phone_verified_at' => now()]);
        $invitation = $this->invitation(['role' => 'agent', 'email' => null, 'phone' => '+221771234567']);

        $data = $this->apercu($invitation->token)->assertOk()->json('data');

        $this->assertSame('agent', $data['role']);
        $this->assertSame('phone', $data['recipient']['channel']);
        $this->assertSame('77 ••• 45 67', $data['recipient']['masked']);
        $this->assertTrue($data['recipient_has_account']);
        $this->assertSame([], (array) $data['awaiting']);
    }

    /** Le téléphone n'est public que si la fiche de l'agence l'est (agence active et standard). */
    public function test_le_telephone_d_un_espace_individuel_n_est_pas_public(): void
    {
        $this->agency->update(['kind' => AgencyKind::Individual]);
        $invitation = $this->invitation(['role' => 'owner']);

        $this->assertNull($this->apercu($invitation->token)->assertOk()->json('data.agency.public_phone'));
    }

    /** Ni celui d'une agence suspendue : sa fiche a quitté le site (TCK-600, ADR-0048). */
    public function test_le_telephone_d_une_agence_suspendue_n_est_pas_public(): void
    {
        $this->agency->update(['status' => AgencyStatus::Suspended]);
        $invitation = $this->invitation(['role' => 'owner']);

        $this->assertNull($this->apercu($invitation->token)->assertOk()->json('data.agency.public_phone'));
    }

    /** AC2 — jeton inconnu : 404, le message et le code, rien d'autre. */
    public function test_un_jeton_inconnu_rend_un_404_sans_donnee(): void
    {
        $reponse = $this->apercu(Str::random(64))->assertNotFound();

        $this->assertEqualsCanonicalizing(['code', 'message'], array_keys($reponse->json()));
        $this->assertSame('invitation.token_not_found', $reponse->json('code'));
    }

    /**
     * AC3 (aperçu) — expiré, révoqué ou accepté : 410 avec son code, l'agence (nom, logo, téléphone
     * public) et la date de l'invitation.
     *
     * @return array<string, array{string, array<string, mixed>}>
     */
    public static function etatsClos(): array
    {
        return [
            'échue' => ['invitation.token_expired', ['expires_at' => now()->subHour()]],
            'passée à expired' => ['invitation.token_expired', ['status' => InvitationStatus::Expired->value]],
            'révoquée' => ['invitation.token_revoked', ['status' => InvitationStatus::Revoked->value, 'revoked_at' => now()]],
            'acceptée' => ['invitation.token_accepted', ['status' => InvitationStatus::Accepted->value, 'accepted_at' => now()]],
        ];
    }

    /** @param  array<string, mixed>  $etat */
    #[DataProvider('etatsClos')]
    public function test_un_jeton_clos_rend_410_avec_l_agence_et_la_date(string $code, array $etat): void
    {
        $invitation = $this->invitation(['role' => 'owner', ...$etat]);

        $reponse = $this->apercu($invitation->token)->assertStatus(410);

        $this->assertSame($code, $reponse->json('code'));
        $this->assertSame(['name' => 'Dakar Immo', 'logo_url' => null, 'public_phone' => '+221338001122'], $reponse->json('agency'));
        $this->assertSame($invitation->created_at->toIso8601String(), $reponse->json('invited_at'));
        $this->assertEqualsCanonicalizing(['agency', 'code', 'invited_at', 'message'], array_keys($reponse->json()));
    }

    /** TCK-1339 — une agence supprimée rend 410 `token_revoked`, comme l'acceptation, sans agence. */
    public function test_une_agence_supprimee_rend_410_revoque(): void
    {
        $invitation = $this->invitation(['role' => 'agent']);
        $this->agency->delete();

        $reponse = $this->apercu($invitation->token)->assertStatus(410);

        $this->assertSame('invitation.token_revoked', $reponse->json('code'));
        $this->assertNull($reponse->json('agency'));
    }

    /** Lecture seule : ni statut, ni vue, ni journal — aucune requête d'écriture. */
    public function test_l_apercu_n_ecrit_rien(): void
    {
        $actionnable = $this->invitation(['role' => 'owner']);
        $echue = $this->invitation(['role' => 'owner', 'expires_at' => now()->subHour()]);
        $avant = [$actionnable->fresh()->toArray(), $echue->fresh()->toArray()];

        $ecritures = [];
        DB::listen(function ($requete) use (&$ecritures) {
            if (preg_match('/^\s*(insert|update|delete)\b/i', $requete->sql) === 1) {
                $ecritures[] = $requete->sql;
            }
        });

        $this->apercu($actionnable->token)->assertOk();
        $this->apercu($echue->token)->assertStatus(410);

        $this->assertSame([], $ecritures);
        $this->assertSame($avant, [$actionnable->fresh()->toArray(), $echue->fresh()->toArray()]);
    }

    /** AC4 — 30 aperçus par minute et par IP ; le 31ᵉ rend 429, une autre IP passe. */
    public function test_le_trente_et_unieme_apercu_de_la_minute_rend_429(): void
    {
        $invitation = $this->invitation(['role' => 'agent']);
        for ($i = 0; $i < 30; $i++) {
            $this->apercu($invitation->token)->assertOk();
        }

        $this->apercu($invitation->token)->assertStatus(429);
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.9'])->getJson('/api/public/invitations/'.$invitation->token)->assertOk();
    }
}
