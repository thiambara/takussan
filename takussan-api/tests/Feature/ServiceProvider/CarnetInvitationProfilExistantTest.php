<?php

namespace Tests\Feature\ServiceProvider;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\CollaborationStatus;
use App\Models\Enums\InvitationStatus;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Invitation;
use App\Models\Profiles\ServiceProviderAgencyCollaboration;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\Review;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FakeSmsRouter;
use Tests\Support\MaintenanceActors;

/**
 * TCK-2834 — l'agence B invite un prestataire déjà inscrit (actif dans l'agence A). L'invitation
 * réutilise le profil maître et ne crée aucune collaboration avant l'acceptation (TCK-262) : le
 * carnet par défaut de B rend une ligne CONSTRUITE DEPUIS L'INVITATION, marquée
 * `pending_invitation_only`, qui ne porte que ce que B a saisi.
 *
 * Les valeurs du profil maître sont des sentinelles ASCII (un accent sortirait échappé en `\u…` et
 * l'assertion « absent du corps » passerait à vide).
 */
class CarnetInvitationProfilExistantTest extends ApiTestCase
{
    use MaintenanceActors, RefreshDatabase;

    private const FIELDS = 'fields[service_provider_profiles]=id,user_id,status,specialties,service_areas,metadata,created_at';

    /** Les valeurs propres au profil maître et à son compte : aucune ne sort vers B. */
    private const SENTINELLES_DU_MAITRE = ['Zebulonmaitre', 'Compteprive', '779990001', 'toiturexyz', 'Kaolackzone', 'Metaprenomxyz'];

    private Agency $agenceA;

    private Agency $agenceB;

    private Agency $agenceC;

    private User $adminA;

    private User $adminB;

    private User $adminC;

    private User $compte;

    private ServiceProviderProfile $maitre;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true]);
        Mail::fake();
        FakeSmsRouter::install();
        Storage::fake(config('media-library.disk_name'));

        $this->agenceA = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->agenceB = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->agenceC = Agency::factory()->create(['kind' => AgencyKind::Standard]);
        $this->adminA = $this->apiActingAsRole('agency_admin', ['agency' => $this->agenceA]);
        $this->adminC = $this->apiActingAsRole('agency_admin', ['agency' => $this->agenceC]);
        $this->adminB = $this->apiActingAsRole('agency_admin', ['agency' => $this->agenceB]);

        // Le prestataire maître, actif dans A : nom, téléphone, métiers, zones, métadonnées, un avis
        // approuvé et une pièce d'assurance vivante — tout ce que B ne doit pas voir.
        $this->compte = User::factory()->create([
            'email' => 'compte.reel@example.test',
            'first_name' => 'Zebulonmaitre',
            'last_name' => 'Compteprive',
            'phone' => '+221779990001',
            'phone_verified_at' => now(),
        ]);
        $this->maitre = ServiceProviderProfile::factory()->create([
            'user_id' => $this->compte->id,
            'status' => ServiceProviderProfileStatus::Active->value,
            'specialties' => ['toiturexyz'],
            'service_areas' => ['Kaolackzone'],
            'metadata' => ['first_name' => 'Metaprenomxyz', 'trades' => ['toiturexyz'], 'intervention_zones' => ['Kaolackzone']],
        ]);
        ServiceProviderAgencyCollaboration::query()->create([
            'service_provider_profile_id' => $this->maitre->id,
            'agency_id' => $this->agenceA->id,
            'status' => CollaborationStatus::Active->value,
            'started_at' => now()->subMonth()->toDateString(),
        ]);
        Review::factory()->create([
            'reviewable_type' => $this->maitre->getMorphClass(),
            'reviewable_id' => $this->maitre->id,
            'rating' => 5,
            'is_approved' => true,
        ]);
        Sanctum::actingAs($this->compte);
        $this->postJson("/api/me/profiles/{$this->maitre->id}/kyc/upload", [
            'file' => UploadedFile::fake()->create('assurance.pdf', 120, 'application/pdf'),
            'kind' => 'insurance',
        ])->assertCreated();

        $this->actingAs($this->adminB, 'sanctum');
    }

    public function test_ac1_l_invitation_d_un_prestataire_inscrit_ailleurs_parait_au_carnet_de_b(): void
    {
        $invitation = $this->inviterParB();

        $lignes = $this->carnet($this->agenceB, '')->json('data');
        $this->assertCount(1, $lignes);
        $ligne = $lignes[0];
        $this->assertSame($invitation->id, $ligne['pending_invitation_id']);
        $this->assertTrue($ligne['pending_invitation_only']);
        $this->assertSame('draft', $ligne['status']);
        $this->assertNull($ligne['id']);
        $this->assertSame(['Saisi', 'Parbee'], [$ligne['metadata']['first_name'], $ligne['metadata']['last_name']]);
        $this->assertSame(['plumbing'], $ligne['metadata']['trades']);
        $this->assertSame(['Ngorzone'], $ligne['metadata']['intervention_zones']);
        $this->assertSame('+221770002834', $ligne['phone']);
        $this->assertNotNull($ligne['created_at']);

        // Les filtres jugent la ligne sur ce que B a saisi.
        $this->assertSame([$invitation->id], $this->invitations('filter[search]=parbee'));
        $this->assertSame([$invitation->id], $this->invitations('filter[search]=saisi parbee'));
        $this->assertSame([$invitation->id], $this->invitations('filter[search]=770002834'));
        $this->assertSame([$invitation->id], $this->invitations('filter[zone]=Ngorzone'));
        $this->assertSame([$invitation->id], $this->invitations('filter[specialty]=plumbing'));
        $this->assertSame([$invitation->id], $this->invitations('filter[status]=draft'));
        $this->assertSame(['Ngorzone'], $this->carnet($this->agenceB, '')->json('meta.zones'));

        // Un filtre que l'invitation ne sait pas juger ferme : aucune ligne d'invitation.
        $this->assertSame([], $this->invitations('filter[status]=active'));
        $this->assertSame([], $this->invitations('filter[user_id]='.$this->compte->id));
        $this->assertSame([], $this->invitations('filter[collaboration_status]=active'));
        $this->assertSame([], $this->invitations('filter[collaboration_status]=paused'));
    }

    public function test_ac2_rien_du_profil_maitre_ne_sort_vers_b_invitation_par_e_mail(): void
    {
        $this->inviterParB();

        $this->assertRienDuMaitre();
    }

    public function test_ac2_rien_du_profil_maitre_ne_sort_vers_b_invitation_par_numero(): void
    {
        // Par le numéro VÉRIFIÉ du compte : l'e-mail du compte ne doit pas sortir non plus.
        $invitation = $this->inviterParB(['email' => null, 'phone' => '+221779990001']);
        $this->assertTrue((bool) data_get($invitation->metadata, 'existing_sp_other_agency'));

        $lignes = $this->carnet($this->agenceB, '')->json('data');
        $this->assertCount(1, $lignes);
        $this->assertSame($invitation->id, $lignes[0]['pending_invitation_id']);
        $corps = $this->carnet($this->agenceB, 'include=user,agencyCollaborations,invitations')->getContent();
        $this->assertStringNotContainsString('compte.reel', $corps);
        foreach (['Zebulonmaitre', 'Compteprive', 'toiturexyz', 'Kaolackzone', 'Metaprenomxyz'] as $valeur) {
            $this->assertStringNotContainsString($valeur, $corps);
        }
    }

    public function test_ac3_ni_l_agence_a_ni_une_agence_c_ne_voient_l_invitation_de_b(): void
    {
        $deB = $this->inviterParB();

        $this->actingAs($this->adminA, 'sanctum');
        $carnetA = $this->carnet($this->agenceA, 'include=user,agencyCollaborations,invitations');
        $this->assertSame([$this->maitre->id], collect($carnetA->json('data'))->pluck('id')->all());
        $this->assertNotContains($deB->id, collect($carnetA->json('data'))->pluck('pending_invitation_id')->all());
        $this->assertStringNotContainsString('Parbee', $carnetA->getContent());
        $this->assertStringNotContainsString('Ngorzone', $carnetA->getContent());

        $this->actingAs($this->adminC, 'sanctum');
        $this->assertSame([], $this->carnet($this->agenceC, '')->json('data'));

        // C invite à son tour le même prestataire, sous le même nom : chacune ne voit que la sienne.
        $deC = $this->inviter($this->agenceC, ['intervention_zones' => ['Yoffzone']]);
        $this->assertSame([$deC->id], $this->invitations('', $this->agenceC));
        $this->assertSame(['Yoffzone'], $this->carnet($this->agenceC, '')->json('meta.zones'));

        $this->actingAs($this->adminB, 'sanctum');
        $this->assertSame([$deB->id], $this->invitations(''));
        $this->assertSame([$deB->id], $this->invitations('filter[search]=parbee'));
        $this->assertSame([], $this->invitations('filter[zone]=Yoffzone'));
        $this->assertSame(['Ngorzone'], $this->carnet($this->agenceB, '')->json('meta.zones'));

        // B ne lit pas le carnet de C.
        $this->apiGet("/api/agencies/{$this->agenceC->id}/service-providers?per_page=100")->assertForbidden();
    }

    public function test_ac4_aucune_collaboration_avant_l_acceptation_puis_une_seule_ligne_active(): void
    {
        $invitation = $this->inviterParB();
        $this->assertFalse($this->collaborationAvecB()->exists());

        Sanctum::actingAs($this->compte);
        $this->postJson("/api/invitations/{$invitation->token}/accept", [])->assertOk();

        $this->assertSame(CollaborationStatus::Active, $this->collaborationAvecB()->sole()->status);

        $this->actingAs($this->adminB, 'sanctum');
        $lignes = $this->carnet($this->agenceB, '')->json('data');
        $this->assertCount(1, $lignes);
        $this->assertSame($this->maitre->id, $lignes[0]['id']);
        $this->assertArrayNotHasKey('pending_invitation_only', $lignes[0]);
        $this->assertNull($lignes[0]['pending_invitation_id']);

        // Les inclus ne rendent que ce qui touche B : ni la collaboration avec A, ni A elle-même.
        $inclus = $this->carnet($this->agenceB, 'include=agencyCollaborations,agencies,invitations')->json('data.0');
        $this->assertSame([$this->agenceB->id], collect($inclus['agency_collaborations'])->pluck('agency_id')->all());
        $this->assertSame([$this->agenceB->id], collect($inclus['agencies'])->pluck('id')->all());
        $this->assertSame([$this->agenceB->id], collect($inclus['invitations'])->pluck('agency_id')->unique()->values()->all());
    }

    public function test_ac4_deux_invitations_de_b_une_seule_ligne_avant_et_apres_l_acceptation(): void
    {
        // Par e-mail, puis par le numéro vérifié du compte : deux invitations `sent`, un seul profil.
        $parEmail = $this->inviterParB();
        $parNumero = $this->inviterParB(['email' => null, 'phone' => '+221779990001']);
        $this->assertSame([$parNumero->id], $this->invitations(''), 'la plus récente, une seule fois');

        Sanctum::actingAs($this->compte);
        $this->postJson("/api/invitations/{$parEmail->token}/accept", [])->assertOk();

        // L'invitation par numéro peut rester `sent` : la collaboration née la fait sortir.
        $this->actingAs($this->adminB, 'sanctum');
        $this->assertSame([$this->maitre->id], collect($this->carnet($this->agenceB, '')->json('data'))->pluck('id')->all());
    }

    public function test_ac5_une_invitation_revoquee_sort_du_carnet_par_defaut(): void
    {
        $invitation = $this->inviterParB();
        $this->assertSame([$invitation->id], $this->invitations(''));

        $this->apiPost("/api/invitations/{$invitation->id}/revoke")->assertOk();

        $this->assertSame([], $this->carnet($this->agenceB, '')->json('data'));
        $this->assertSame([], $this->carnet($this->agenceB, '')->json('meta.zones'));
    }

    public function test_une_invitation_expiree_ou_sans_le_marqueur_ne_parait_pas(): void
    {
        $invitation = $this->inviterParB();
        $invitation->forceFill(['status' => InvitationStatus::Expired->value])->save();
        $this->assertSame([], $this->carnet($this->agenceB, '')->json('data'));

        // Une invitation `sent` de B sur un profil sans collaboration ici, mais qui n'est pas celle
        // d'un profil existant (le cas « Orphelin » de TCK-2829) : hors du carnet.
        $invitation->forceFill([
            'status' => InvitationStatus::Sent->value,
            'metadata' => [...$invitation->metadata, 'existing_sp_other_agency' => false],
        ])->save();
        $this->assertSame([], $this->carnet($this->agenceB, '')->json('data'));
    }

    public function test_la_pagination_compte_les_invitations_sans_doublon_ni_perte(): void
    {
        $actif = (int) ServiceProviderProfile::query()->where('user_id', $this->providerFor($this->agenceB)->id)->value('id');
        $invitation = $this->inviterParB();

        $page1 = $this->apiGet("/api/agencies/{$this->agenceB->id}/service-providers?per_page=1&page=1&".self::FIELDS)->assertOk();
        $page2 = $this->apiGet("/api/agencies/{$this->agenceB->id}/service-providers?per_page=1&page=2&".self::FIELDS)->assertOk();
        $page3 = $this->apiGet("/api/agencies/{$this->agenceB->id}/service-providers?per_page=1&page=3&".self::FIELDS)->assertOk();

        $this->assertSame(2, $page1->json('meta.total'));
        $this->assertSame(2, $page1->json('meta.last_page'));
        $this->assertSame($invitation->id, $page1->json('data.0.pending_invitation_id'));
        $this->assertTrue($page1->json('data.0.pending_invitation_only'));
        $this->assertSame([$actif], collect($page2->json('data'))->pluck('id')->all());
        $this->assertSame([], $page3->json('data'));

        // `meta.zones` : celles des profils (« Dakar ») et celles saisies sur l'invitation, sans doublon,
        // dans la collation racine (« École » avec les E, pas après « Ngorzone »).
        $this->inviterParB(['email' => null, 'phone' => '+221779990001', 'intervention_zones' => ['École', 'Dakar', 'Ngorzone']]);
        $this->assertSame(['Dakar', 'École', 'Ngorzone'], $this->carnet($this->agenceB, '')->json('meta.zones'));
    }

    public function test_ni_l_id_du_profil_maitre_ni_celui_de_son_compte_ne_sortent(): void
    {
        $this->inviterParB();
        $this->inviterParB(['email' => null, 'phone' => '+221779990001']);

        foreach (['', 'include=user,agencyCollaborations,invitations,agencies'] as $requete) {
            $ligne = $this->carnet($this->agenceB, $requete)->json('data.0');
            $this->assertNull($ligne['id']);
            $this->assertNull($ligne['user_id']);
            // Toute clé d'identifiant de la ligne, à toute profondeur, hors l'invitation elle-même.
            foreach ($this->identifiants($ligne) as $chemin => $valeur) {
                $this->assertNotSame($this->maitre->id, $valeur, "id du profil maître en « {$chemin} » ({$requete})");
                $this->assertNotSame($this->compte->id, $valeur, "id du compte maître en « {$chemin} » ({$requete})");
            }
        }
    }

    public function test_la_pagination_a_la_frontiere_des_invitations_et_des_profils(): void
    {
        // k = 2 invitations (deux prestataires inscrits dans A), puis 3 profils actifs de B.
        $second = $this->providerFor($this->agenceA, userAttributes: ['email' => 'second.compte@example.test']);
        $invitations = [$this->inviterParB()->id, $this->inviterParB(['email' => 'second.compte@example.test', 'phone' => null])->id];
        $profils = collect(range(1, 3))
            ->map(fn (): int => (int) ServiceProviderProfile::query()->where('user_id', $this->providerFor($this->agenceB)->id)->value('id'))
            ->all();
        $this->assertNotNull($second);

        $page = fn (int $n) => $this->apiGet("/api/agencies/{$this->agenceB->id}/service-providers?per_page=3&page={$n}&".self::FIELDS)->assertOk();
        [$p1, $p2, $p3] = [$page(1), $page(2), $page(3)];

        foreach ([$p1, $p2, $p3] as $p) {
            $this->assertSame(5, $p->json('meta.total'));
            $this->assertSame(2, $p->json('meta.last_page'));
        }
        $this->assertCount(3, $p1->json('data'));
        $this->assertCount(2, $p2->json('data'));
        $this->assertSame([], $p3->json('data'));

        // Page 1 : les deux invitations, puis le premier profil ; page 2 : les deux autres. Ni doublon ni trou.
        $this->assertEqualsCanonicalizing($invitations, collect($p1->json('data'))->take(2)->pluck('pending_invitation_id')->all());
        $this->assertSame([true, true], collect($p1->json('data'))->take(2)->pluck('pending_invitation_only')->all());
        $vus = [...collect($p1->json('data'))->slice(2)->pluck('id')->all(), ...collect($p2->json('data'))->pluck('id')->all()];
        $this->assertSame($vus, array_values(array_unique($vus)));
        $this->assertEqualsCanonicalizing($profils, $vus);
    }

    // ------------------------------------------------------------------

    /**
     * Les valeurs des clés `id` et `*_id` d'une ligne, à toute profondeur, sauf `pending_invitation_id`
     * et les identifiants d'agence (B est l'agence du carnet).
     *
     * @param  array<string, mixed>  $ligne
     * @return array<string, mixed>
     */
    private function identifiants(array $ligne, string $prefixe = ''): array
    {
        $trouves = [];
        foreach ($ligne as $cle => $valeur) {
            $chemin = $prefixe.$cle;
            if (is_array($valeur)) {
                $trouves += $this->identifiants($valeur, $chemin.'.');
            } elseif (is_string($cle) && ($cle === 'id' || str_ends_with($cle, '_id'))
                && ! in_array($cle, ['pending_invitation_id', 'agency_id'], true)) {
                $trouves[$chemin] = $valeur;
            }
        }

        return $trouves;
    }

    private function assertRienDuMaitre(): void
    {
        foreach (['', 'include=user,agencyCollaborations,invitations'] as $requete) {
            $reponse = $this->carnet($this->agenceB, $requete);
            $corps = $reponse->getContent();
            foreach (self::SENTINELLES_DU_MAITRE as $valeur) {
                $this->assertStringNotContainsString($valeur, $corps, "« {$valeur} » sort du profil maître ({$requete})");
            }
            $ligne = $reponse->json('data.0');
            $this->assertFalse($ligne['insured']);
            $this->assertNull($ligne['average_rating']);
            $this->assertSame(0, $ligne['reviews_count']);
            $this->assertNull($ligne['user_id']);
            $this->assertNull($ligne['specialties']);
            $this->assertNull($ligne['service_areas']);
            $this->assertNull($ligne['response_delay_minutes']);
            $this->assertNull($ligne['user'] ?? null);
            $this->assertArrayNotHasKey('agency_collaborations', $ligne);
            $this->assertNotContains('Kaolackzone', $reponse->json('meta.zones'));
        }

        // La recherche ne lit que le nom saisi : le vrai nom du compte ne trouve rien.
        $this->assertSame([], $this->invitations('filter[search]=compteprive'));
        $this->assertSame([], $this->invitations('filter[search]=zebulonmaitre'));
        $this->assertSame([], $this->invitations('filter[search]=779990001'));
        $this->assertSame([], $this->invitations('filter[search]=kaolackzone'));
        $this->assertSame([], $this->invitations('filter[zone]=Kaolackzone'));
        $this->assertSame([], $this->invitations('filter[specialty]=toiturexyz'));
    }

    /** @param  array<string, mixed>  $surcharges */
    private function inviterParB(array $surcharges = []): Invitation
    {
        return $this->inviter($this->agenceB, $surcharges);
    }

    /** @param  array<string, mixed>  $surcharges */
    private function inviter(Agency $agence, array $surcharges = []): Invitation
    {
        $avant = Invitation::query()->max('id') ?? 0;
        $reponse = $this->apiPost("/api/agencies/{$agence->id}/service-providers/invite", array_merge([
            'email' => 'compte.reel@example.test',
            'phone' => '+221770002834',
            'first_name' => 'Saisi',
            'last_name' => 'Parbee',
            'trades' => ['plumbing'],
            'intervention_zones' => ['Ngorzone'],
        ], $surcharges))->assertCreated();
        $this->assertTrue((bool) $reponse->json('meta.existing_sp_other_agency'));

        return Invitation::query()->where('id', '>', $avant)->sole();
    }

    private function carnet(Agency $agence, string $requete): TestResponse
    {
        return $this->apiGet("/api/agencies/{$agence->id}/service-providers?per_page=100&".self::FIELDS.($requete !== '' ? '&'.$requete : ''))->assertOk();
    }

    /** @return list<int> les `pending_invitation_id` des lignes d'invitation seule. */
    private function invitations(string $requete, ?Agency $agence = null): array
    {
        return collect($this->carnet($agence ?? $this->agenceB, $requete)->json('data'))
            ->filter(fn (array $ligne): bool => ($ligne['pending_invitation_only'] ?? false) === true)
            ->pluck('pending_invitation_id')
            ->values()
            ->all();
    }

    private function collaborationAvecB()
    {
        return ServiceProviderAgencyCollaboration::query()
            ->where('service_provider_profile_id', $this->maitre->id)
            ->where('agency_id', $this->agenceB->id);
    }
}
