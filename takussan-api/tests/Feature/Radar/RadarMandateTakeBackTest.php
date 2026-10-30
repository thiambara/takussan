<?php

namespace Tests\Feature\Radar;

use App\Domain\Features\Flag;
use App\Jobs\Radar\PublishClaimedRadarListings;
use App\Jobs\Radar\TransmitTakenBackConversations;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\BoostKind;
use App\Models\Enums\BoostStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\FeatureFlag;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyBoost;
use App\Models\PropertyContact;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\RadarListing;
use App\Models\ServiceProviderBill;
use App\Models\User;
use App\Services\Admin\PlatformSettingService;
use App\Services\Auth\PhoneLoginService;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Property\PublishReadiness;
use App\Services\Radar\ClaimLinks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Testing\Fakes\QueueFake;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2421 (ADR-0079, amendement « la reprise ») — l'annonceur publié sous mandat qui vérifie son numéro par le lien de
 * réclamation reprend ses biens dans son espace : mêmes biens (ni republication, ni perte de vues ou de demandes), dans une
 * transaction, journalisée, sous le verrou de l'annonceur. Rien ne passe à un compte qui n'a pas vérifié son numéro.
 */
class RadarMandateTakeBackTest extends TestCase
{
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    private FakeSmsRouter $sms;

    private Agency $espace;

    private User $gerant;

    /** @var list<int> les biens publiés sous mandat */
    private array $biens;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->installerLaPublication();
        $this->gerant = User::factory()->create(['first_name' => 'Équipe', 'last_name' => 'Takussan']);
        $this->espace = Agency::factory()->create(['name' => 'Takussan — diffusion', 'primary_admin_id' => $this->gerant->id]);
        app(PlatformSettingService::class)->bulkUpdate(['radar.mandate_agency_id' => $this->espace->id], $this->operateur);
        FeatureFlag::query()->create(['key' => Flag::RadarMandate->value, 'label' => Flag::RadarMandate->value, 'enabled' => true, 'segments_json' => []]);

        $a = $this->annonceConsentie();
        $b = $this->annonceConsentie();
        $reponse = $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish-mandate", ['listing_ids' => [$a->id, $b->id]])
            ->assertCreated();
        $this->biens = array_map('intval', array_column($reponse->json('data.properties'), 'id'));
        $this->visiteur();
    }

    /** La suite se joue sur la page publique : ni l'opérateur ni sa session. */
    private function visiteur(): void
    {
        $this->app['auth']->forgetGuards();
    }

    private function jeton(): string
    {
        return app(ClaimLinks::class)->token($this->annonceur, $this->message->created_at);
    }

    private function lire(): TestResponse
    {
        return $this->getJson('/api/radar/claims/'.$this->jeton());
    }

    private function demanderLeCode(): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.$this->jeton().'/otp', []);
    }

    /** @param  list<array<string, mixed>>  $annonces */
    private function confirmer(array $annonces = [], ?string $code = null): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.$this->jeton().'/confirm', [
            'code' => $code ?? $this->sms->lastCodeFor(self::NUMERO_ANNONCEUR),
            'accept_terms' => true,
            'terms_version' => PublishReadiness::TERMS_VERSION,
            'listings' => $annonces,
            'first_name' => 'Awa',
            'space_name' => 'Awa Immobilier',
        ]);
    }

    /** @return array<int, array{int, int}> par bien : [espace, titulaire] */
    private function ouSontLesBiens(): array
    {
        return Property::query()->whereIn('id', $this->biens)->orderBy('id')->get()
            ->mapWithKeys(fn (Property $bien) => [$bien->id => [(int) $bien->agency_id, (int) $bien->user_id]])->all();
    }

    /** @return array<int, array{int, int}> */
    private function sousMandat(): array
    {
        return array_fill_keys($this->biens, [$this->espace->id, $this->gerant->id]);
    }

    // --- AC1 : la reprise, après la vérification du numéro --------------------------------------------------------------

    public function test_ac1_la_page_dit_le_mandat_et_propose_la_reprise(): void
    {
        $this->lire()->assertOk()
            ->assertJsonPath('data.account.state', 'new')
            ->assertJsonPath('data.mandate.properties_count', 2)
            ->assertJsonCount(2, 'data.published')
            ->assertJsonCount(0, 'data.listings');
    }

    public function test_ac1_apres_son_code_l_annonceur_retrouve_ses_biens_dans_son_espace_sans_republication(): void
    {
        $premier = $this->biens[0];
        Property::query()->whereKey($premier)->update(['views_count' => 37]);
        $demande = PropertyContactLead::factory()->create(['property_id' => $premier, 'recipient_user_id' => $this->gerant->id]);
        $clic = PropertyContactLead::factory()->create(['property_id' => $premier, 'channel' => 'whatsapp', 'name' => null]);
        $biensAvant = Property::query()->count();
        $journalDuModele = fn () => Activity::query()->where('subject_type', (new Property)->getMorphClass())->whereIn('subject_id', $this->biens)->where('event', 'updated')->count();
        $journalAvant = $journalDuModele();

        $this->demanderLeCode()->assertStatus(202);
        $reponse = $this->confirmer()->assertOk()
            ->assertJsonPath('claim.state', 'new')
            ->assertJsonPath('claim.listing_ids', [])
            ->assertJsonPath('claim.taken_back_property_ids', $this->biens);

        $compte = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();
        $espace = Agency::query()->where('primary_admin_id', $compte->id)->sole();
        $this->assertSame($espace->id, $reponse->json('claim.agency.id'));
        $this->assertNotNull($compte->phone_verified_at);

        // Les MÊMES biens : aucun de plus, chacun dans son espace, encore public, son contact et ses vues gardés.
        $this->assertSame($biensAvant, Property::query()->count());
        $this->assertSame(array_fill_keys($this->biens, [$espace->id, $compte->id]), $this->ouSontLesBiens());
        foreach (Property::query()->whereIn('id', $this->biens)->get() as $bien) {
            $this->assertSame(PropertyVisibility::Public, $bien->visibility);
            $this->assertFalse($bien->metadata['radar_mandate']);
            $this->assertSame(self::NUMERO_ANNONCEUR, PropertyContact::query()->where('property_id', $bien->id)->sole()->phone);
        }
        $this->assertSame(37, Property::query()->findOrFail($premier)->views_count);
        $this->assertSame($this->biens, $this->annonceur->listings()->orderBy('property_id')->pluck('property_id')->map(fn ($id) => (int) $id)->all());

        // Ses demandes le suivent : l'espace, et lui pour destinataire.
        $this->assertSame([$espace->id, $compte->id], [(int) $demande->fresh()->agency_id, (int) $demande->fresh()->recipient_user_id]);
        $this->assertSame($espace->id, (int) $clic->fresh()->agency_id);

        // `mandate_at` reste comme trace ; la reprise se date.
        $annonceur = $this->annonceur->fresh();
        $this->assertSame($compte->id, $annonceur->user_id);
        $this->assertNotNull($annonceur->mandate_at);
        $this->assertSame(now()->toIso8601String(), $annonceur->mandate_taken_back_at->toIso8601String());
        $this->assertFalse($annonceur->underMandate());

        $ligne = Activity::query()->where('event', 'radar_mandate_taken_back')->sole();
        $this->assertSame($compte->id, $ligne->causer_id);
        $this->assertSame($this->biens, $ligne->properties['property_ids']);
        $this->assertSame([$this->espace->id], $ligne->properties['from_agency_ids']);
        $this->assertSame($espace->id, $ligne->properties['agency_id']);
        $this->assertSame($this->biens, Activity::query()->where('event', 'radar_claimed')->sole()->properties['taken_back_property_ids']);
        // ADR-0059 § 4 : `user_id` réécrit journal du modèle coupé (la réparation des réattributions déferait la reprise).
        $this->assertSame($journalAvant, $journalDuModele());
    }

    public function test_ac1_le_titulaire_connecte_les_reprend_dans_son_espace_existant(): void
    {
        $titulaire = User::factory()->create(['phone' => self::NUMERO_ANNONCEUR, 'phone_verified_at' => now(), 'first_name' => 'Fatou']);
        $espace = Agency::factory()->create(['primary_admin_id' => $titulaire->id, 'name' => 'Fatou Location', 'kind' => 'individual']);
        Sanctum::actingAs($titulaire);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'existing')->assertJsonPath('data.mandate.properties_count', 2);
        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk()->assertJsonPath('claim.agency.id', $espace->id);

        $this->assertSame(array_fill_keys($this->biens, [$espace->id, $titulaire->id]), $this->ouSontLesBiens());
    }

    public function test_ac1_une_annonce_encore_a_publier_se_reclame_avec_la_reprise(): void
    {
        $nouvelle = $this->annonceConsentie();
        $this->lire()->assertOk()->assertJsonPath('data.listings.0.id', $nouvelle->id);

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer([['id' => $nouvelle->id]])->assertOk()
            ->assertJsonPath('claim.listing_ids', [$nouvelle->id])
            ->assertJsonPath('claim.taken_back_property_ids', $this->biens);
    }

    /**
     * Ce que les visiteurs ont laissé suit le bien — visites, conversations, empreintes — et ce qui appartient à l'espace
     * des mandats y reste : ses prospects (une demande ou une visite ne vise plus un prospect d'un autre espace) et ses
     * collaborateurs (ils perdent l'accès au bien).
     */
    public function test_ac1_visites_conversations_et_collaborateurs(): void
    {
        $premier = $this->biens[0];
        $prospect = Customer::factory()->create(['agency_id' => $this->espace->id]);
        $convertie = PropertyContactLead::factory()->create(['property_id' => $premier, 'customer_id' => $prospect->id]);
        $visite = PropertyVisit::factory()->create(['property_id' => $premier, 'agent_id' => $this->gerant->id, 'customer_id' => $prospect->id]);
        $collegue = User::factory()->create();
        DB::table('property_collaborators')->insert(['property_id' => $premier, 'user_id' => $collegue->id, 'role' => 'agent', 'is_primary' => false, 'created_at' => now(), 'updated_at' => now()]);
        $visiteurInscrit = User::factory()->create();
        $fil = Conversation::factory()->create(['property_id' => $premier, 'created_by' => $visiteurInscrit->id, 'type' => 'direct']);
        foreach ([$visiteurInscrit, $this->gerant] as $participant) {
            DB::table('conversation_participants')->insert(['conversation_id' => $fil->id, 'user_id' => $participant->id, 'role' => 'member', 'joined_at' => now(), 'is_muted' => false]);
        }

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk();
        $compte = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();

        $this->assertNull($convertie->fresh()->customer_id);
        $this->assertSame($this->espace->id, (int) $prospect->fresh()->agency_id);
        $this->assertSame([$compte->id, null], [(int) $visite->fresh()->agent_id, $visite->fresh()->customer_id]);
        $this->assertFalse(DB::table('property_collaborators')->where('property_id', $premier)->exists());
        // Transmis au contact principal actuel (lui) : le gérant quitte le fil (`left_at`), le visiteur reste.
        $this->assertEqualsCanonicalizing(
            [$visiteurInscrit->id, $compte->id],
            DB::table('conversation_participants')->where('conversation_id', $fil->id)->whereNull('left_at')->pluck('user_id')->map(fn ($id) => (int) $id)->all(),
        );
    }

    /**
     * Vérification adverse I1 — le contact principal du bien est un agent de l'espace des mandats (ADR-0068) : après la reprise,
     * le fil du visiteur passe au nouveau titulaire, qui le lit et y répond ; l'agent le perd ; la réponse du visiteur arrive.
     */
    public function test_ac1_le_fil_d_un_collaborateur_contact_principal_passe_au_nouveau_titulaire(): void
    {
        $premier = $this->biens[0];
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->espace->id]);
        DB::table('property_collaborators')->insert(['property_id' => $premier, 'user_id' => $agent->id, 'role' => 'agent', 'is_primary' => true, 'created_at' => now(), 'updated_at' => now()]);
        $visiteur = User::factory()->create();
        $fil = Conversation::factory()->create(['property_id' => $premier, 'created_by' => $visiteur->id, 'type' => 'direct']);
        foreach ([$visiteur, $agent] as $participant) {
            DB::table('conversation_participants')->insert(['conversation_id' => $fil->id, 'user_id' => $participant->id, 'role' => 'member', 'joined_at' => now(), 'is_muted' => false]);
        }

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk();
        $compte = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();

        $this->enTantQue($agent)->getJson("/api/conversations/{$fil->id}")->assertForbidden();
        $this->enTantQue($compte)->getJson("/api/conversations/{$fil->id}")->assertOk();
        $this->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Oui, toujours disponible.'])->assertCreated();
        $this->enTantQue($visiteur)->postJson("/api/conversations/{$fil->id}/messages", ['content' => 'Je peux visiter samedi ?'])->assertCreated();
        $contenus = $this->enTantQue($compte)->getJson("/api/conversations/{$fil->id}/messages")->assertOk()->json('data.*.content');
        $this->assertContains('Je peux visiter samedi ?', $contenus);
    }

    private function enTantQue(User $user): static
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($user);

        return $this;
    }

    /**
     * Vérification adverse N1 (banc Q2) — la transmission des fils lève : la reprise est faite, la réponse est 200 (le compte neuf
     * garde sa session), la publication des annonces cochées est en file, et la transmission aussi, pour être rejouée.
     */
    public function test_une_transmission_qui_leve_ne_retient_ni_la_reponse_ni_la_publication(): void
    {
        $file = $this->fileQuiNoteLOrdre([PublishClaimedRadarListings::class, TransmitTakenBackConversations::class]);
        $this->instance(PropertyConversationResolver::class, Mockery::mock(PropertyConversationResolver::class, function ($double): void {
            $double->shouldReceive('transmitForProperty')->andThrow(new RuntimeException('transmission en panne'));
        }));
        $nouvelle = $this->annonceConsentie();

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer([['id' => $nouvelle->id]])->assertOk()
            ->assertJsonPath('claim.taken_back_property_ids', $this->biens)
            ->assertJsonPath('is_new_account', true)
            ->assertJsonStructure(['token']);

        $compte = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();
        $sien = Agency::query()->where('primary_admin_id', $compte->id)->sole();
        $this->assertSame(array_fill_keys($this->biens, [$sien->id, $compte->id]), $this->ouSontLesBiens());
        Queue::assertPushed(PublishClaimedRadarListings::class, fn (PublishClaimedRadarListings $job) => $job->listingIds === [$nouvelle->id]);
        Queue::assertPushed(TransmitTakenBackConversations::class, fn (TransmitTakenBackConversations $job) => $job->propertyIds === $this->biens);
        // La publication part AVANT la transmission : sur une file `sync`, une transmission qui lève ne la retient pas.
        $this->assertSame([PublishClaimedRadarListings::class, TransmitTakenBackConversations::class], $file->ordre);
    }

    /**
     * Une file factice qui note l'ordre des mises en file des jobs donnés (`QueueFake` les range par classe).
     *
     * @param  list<class-string>  $jobs
     */
    private function fileQuiNoteLOrdre(array $jobs): QueueFake
    {
        $file = new class(app(), $jobs, Queue::getFacadeRoot()) extends QueueFake
        {
            /** @var list<class-string> */
            public array $ordre = [];

            public function push($job, $data = '', $queue = null)
            {
                if (is_object($job) && $this->shouldFakeJob($job)) {
                    $this->ordre[] = $job::class;
                }

                return parent::push($job, $data, $queue);
            }
        };
        Queue::swap($file);

        return $file;
    }

    /** N1 — le job lève pour être rejoué, sans laisser un bien en panne retenir les suivants ; son abandon se signale. */
    public function test_la_transmission_se_rejoue_et_son_abandon_se_signale(): void
    {
        [$premier, $second] = $this->biens;
        $visiteur = User::factory()->create();
        $fil = Conversation::factory()->create(['property_id' => $second, 'created_by' => $visiteur->id, 'type' => 'direct']);
        foreach ([$visiteur, $this->gerant] as $participant) {
            DB::table('conversation_participants')->insert(['conversation_id' => $fil->id, 'user_id' => $participant->id, 'role' => 'member', 'joined_at' => now(), 'is_muted' => false]);
        }
        Queue::fake([TransmitTakenBackConversations::class]);
        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk();
        $compte = User::query()->where('phone', self::NUMERO_ANNONCEUR)->sole();
        $actifs = fn () => DB::table('conversation_participants')->where('conversation_id', $fil->id)->whereNull('left_at')->orderBy('user_id')->pluck('user_id')->map(fn ($id) => (int) $id)->all();
        $job = new TransmitTakenBackConversations($this->biens);
        $this->assertSame(5, $job->tries);
        $this->assertNotEmpty($job->backoff());

        // Le premier bien lève : le second est transmis quand même, puis le job lève pour être rejoué.
        $reel = app(PropertyConversationResolver::class);
        $enPanne = Mockery::mock(PropertyConversationResolver::class);
        $enPanne->shouldReceive('transmitForProperty')->with($premier)->andThrow(new RuntimeException('transmission en panne'));
        $enPanne->shouldReceive('transmitForProperty')->with($second)->andReturnUsing(fn (int $id) => $reel->transmitForProperty($id));
        $this->assertThrows(fn () => $job->handle($enPanne), RuntimeException::class);
        $this->assertEqualsCanonicalizing([$visiteur->id, $compte->id], $actifs());

        // Rejoué, il ne fait rien de plus sur un fil déjà transmis.
        $job->handle($reel);
        $job->handle($reel);
        $this->assertEqualsCanonicalizing([$visiteur->id, $compte->id], $actifs());

        Log::spy();
        $job->failed(new RuntimeException('transmission en panne'));
        Log::shouldHaveReceived('error')->with('radar.take_back.conversations_not_transmitted', ['property_ids' => $this->biens])->once();
    }

    /** Vérification adverse m2 — `agencies.properties_count` suit les biens : le changement d'espace s'y reporte des deux côtés. */
    public function test_ac1_le_compteur_de_biens_des_deux_espaces_suit_la_reprise(): void
    {
        $avant = (int) $this->espace->fresh()->properties_count;

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk();

        $sien = Agency::query()->where('primary_admin_id', User::query()->where('phone', self::NUMERO_ANNONCEUR)->value('id'))->sole();
        $this->assertSame($avant - 2, (int) $this->espace->fresh()->properties_count);
        $this->assertSame(Property::query()->where('agency_id', $sien->id)->count(), (int) $sien->fresh()->properties_count);
        $this->assertSame(2, (int) $sien->fresh()->properties_count);
    }

    /**
     * Vérification adverse I3 — seuls les biens publiés SOUS MANDAT se reprennent : un bien publié « pour lui » dans un compte A
     * depuis délié (`AdvertiserAccountRelease`) reste dans l'espace de A.
     */
    public function test_ac2_un_bien_d_un_autre_compte_publie_pour_lui_ne_suit_pas(): void
    {
        $a = User::factory()->create();
        $espaceA = Agency::factory()->create(['primary_admin_id' => $a->id]);
        $ancien = Property::factory()->create(['agency_id' => $espaceA->id, 'user_id' => $a->id, 'metadata' => ['radar_listing_id' => 1]]);
        RadarListing::factory()->create(['radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Published, 'property_id' => $ancien->id]);

        $this->lire()->assertOk()->assertJsonPath('data.mandate.properties_count', 2);
        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk()->assertJsonPath('claim.taken_back_property_ids', $this->biens);

        $this->assertSame([$espaceA->id, $a->id], [(int) $ancien->fresh()->agency_id, (int) $ancien->fresh()->user_id]);
    }

    public function test_ac1_apres_la_reprise_le_second_message_suit_le_nouvel_etat(): void
    {
        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk();

        $this->actingAsWithStepUp($this->operateur);
        $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message")->assertOk()
            ->assertJsonPath('data.version', 'publie.v2');
        $apercu = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publication-preview")->assertOk()
            ->assertJsonPath('data.advertiser.mandate_taken_back_at', now()->toIso8601String());
        // Rattaché à son compte : plus sous mandat (« publier pour lui » n'est plus fermé), et pas de nouveau mandat.
        $this->assertNotContains('radar.publish.under_mandate', $apercu->json('data.blocking'));
        $this->assertContains('radar.mandate.account_exists', $apercu->json('data.mandate.blocking'));
    }

    /**
     * Le second message sous mandat porte le lien de la reprise quand ce lien s'ouvre (`mandat.v2`) ; connexion par
     * téléphone éteinte, il ne promet rien (`mandat.v1`, éprouvé par `RadarMandateTest`).
     */
    public function test_le_second_message_sous_mandat_porte_le_lien_de_la_reprise(): void
    {
        $this->actingAsWithStepUp($this->operateur);

        $message = $this->getJson("/api/admin/radar/advertisers/{$this->annonceur->id}/published-message")->assertOk()
            ->assertJsonPath('data.version', 'mandat.v2')
            ->json('data.text');

        $this->assertStringContainsString('Takussan diffuse vos annonces pour votre compte', $message);
        $this->assertStringContainsString('reprenez-les dans votre propre espace avec un code reçu par SMS à ce numéro : ', $message);
        $this->assertMatchesRegularExpression('#/fr/claim/'.ClaimLinks::TOKEN_PATTERN.'#', $message);
        $this->assertStringContainsString('Répondez STOP', $message);
    }

    // --- AC2 : rien ne passe à un compte qui n'a pas vérifié le numéro --------------------------------------------------

    public function test_ac2_un_code_faux_ne_transfere_rien(): void
    {
        $this->demanderLeCode()->assertStatus(202);

        $this->confirmer(code: '000000')->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');

        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
        $this->assertTrue($this->annonceur->fresh()->underMandate());
        $this->assertNull($this->annonceur->fresh()->user_id);
    }

    /**
     * Le code envoyé au numéro de l'annonceur ne suffit pas : il ouvre le compte qui porte ce numéro, jamais la session d'un
     * autre compte connecté dans le même navigateur, même si ce navigateur détient le code.
     */
    public function test_ac2_un_autre_compte_connecte_ne_recoit_rien_meme_avec_le_code(): void
    {
        $autre = User::factory()->create(['phone' => '+221770000001', 'phone_verified_at' => now()]);
        Agency::factory()->create(['primary_admin_id' => $autre->id, 'kind' => 'individual']);
        Sanctum::actingAs($autre);

        $this->demanderLeCode()->assertStatus(403)->assertJsonPath('code', 'radar.claim.wrong_account');
        $this->assertSame([], $this->sms->sentTo(self::NUMERO_ANNONCEUR));
        // Le code obtenu par un autre chemin (la connexion par téléphone) : la confirmation le refuse quand même.
        app(PhoneLoginService::class)->requestCode(self::NUMERO_ANNONCEUR, 'fr');
        $this->confirmer()->assertStatus(403)->assertJsonPath('code', 'radar.claim.wrong_account');

        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
        $this->assertTrue($this->annonceur->fresh()->underMandate());
    }

    public function test_ac2_le_titulaire_du_numero_non_connecte_ne_les_reprend_pas_sans_sa_connexion(): void
    {
        User::factory()->create(['phone' => self::NUMERO_ANNONCEUR, 'phone_verified_at' => now()]);

        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.login_required');
        $this->confirmer(code: '123456')->assertStatus(409)->assertJsonPath('code', 'radar.claim.login_required');

        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
    }

    // --- Les garde-fous de la reprise ---------------------------------------------------------------------------------

    /** Un bien qui porte une réservation (paiement, prospect de l'espace des mandats) ne se déplace pas sans le support. */
    public function test_un_bien_qui_porte_une_reservation_renvoie_au_support_sans_rien_transferer(): void
    {
        Booking::factory()->create(['property_id' => $this->biens[1], 'agency_id' => $this->espace->id]);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'mandate_support');
        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.mandate_support_required');
        $this->assertSame([], $this->sms->sentTo(self::NUMERO_ANNONCEUR));

        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
    }

    /** @return array<string, array{\Closure(int, Agency): void}> une gestion par table, et le lot */
    public static function gestions(): array
    {
        return [
            'réservation' => [fn (int $bien, Agency $espace) => Booking::factory()->create(['property_id' => $bien, 'agency_id' => $espace->id])],
            'bail' => [fn (int $bien, Agency $espace) => Lease::factory()->create(['property_id' => $bien, 'agency_id' => $espace->id])],
            'facture de prestataire' => [fn (int $bien) => DB::table('service_provider_bills')->where('id', ServiceProviderBill::factory()->create()->id)->update(['property_id' => $bien])],
            'mise en avant' => [fn (int $bien, Agency $espace) => PropertyBoost::query()->create([
                'property_id' => $bien, 'agency_id' => $espace->id, 'kind' => BoostKind::Featured, 'price_credits' => 20, 'duration_days' => 7,
                'starts_at' => now(), 'ends_at' => now()->addDays(7), 'status' => BoostStatus::Active, 'offered' => false,
            ])],
            'maintenance' => [fn (int $bien) => MaintenanceRequest::factory()->create(['property_id' => $bien])],
            'état des lieux' => [fn (int $bien) => Inventory::factory()->create(['property_id' => $bien])],
            'flux de calendrier' => [fn (int $bien) => DB::table('property_calendar_feeds')->insert([
                'property_id' => $bien, 'url' => 'https://calendrier.test/flux.ics', 'url_host' => 'calendrier.test', 'created_at' => now(), 'updated_at' => now(),
            ])],
            'lot' => [fn (int $bien, Agency $espace) => Property::factory()->create(['parent_id' => $bien, 'agency_id' => $espace->id])],
        ];
    }

    /** Vérification adverse m1 — chaque gestion que `transferable()` nomme renvoie au support, sans rien transférer. */
    #[DataProvider('gestions')]
    public function test_chaque_gestion_renvoie_au_support(\Closure $gestion): void
    {
        $gestion($this->biens[1], $this->espace);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'mandate_support');
        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.mandate_support_required');
        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
    }

    /** @return array<string, array{AgencyStatus}> les statuts où l'espace ne rend pas ses biens au public (`agencyIsPublic()`) */
    public static function espacesNonActifs(): array
    {
        return [
            'suspendu' => [AgencyStatus::Suspended],
            // N2 : « non vérifié » par le super-admin, ou administrateur effacé (`ErasedAgencyAdmin`).
            'inactif' => [AgencyStatus::Inactive],
        ];
    }

    /**
     * Vérification adverse I2 et N2 (décision de la session, à revoir) — le titulaire du numéro dont l'espace n'est pas actif :
     * la reprise est refusée avant le SMS, comme `publishClaimed()` ; ses biens restent sous mandat, en ligne.
     */
    #[DataProvider('espacesNonActifs')]
    public function test_un_espace_suspendu_refuse_la_reprise_et_les_biens_restent_sous_mandat_en_ligne(AgencyStatus $statut): void
    {
        $titulaire = User::factory()->create(['phone' => self::NUMERO_ANNONCEUR, 'phone_verified_at' => now()]);
        Agency::factory()->create(['primary_admin_id' => $titulaire->id, 'kind' => 'individual', 'status' => $statut]);
        Sanctum::actingAs($titulaire);

        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.space_suspended');
        $this->assertSame([], $this->sms->sentTo(self::NUMERO_ANNONCEUR));
        $this->confirmer(code: '123456')->assertStatus(409)->assertJsonPath('code', 'radar.claim.space_suspended');

        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
        $this->assertTrue($this->annonceur->fresh()->underMandate());
        $this->assertSame(2, Property::query()->whereIn('id', $this->biens)->public()->count());
    }

    /** I2 et N2 rejugés sous le verrou : l'espace qui cesse d'être actif entre le code et la confirmation défait tout. */
    #[DataProvider('espacesNonActifs')]
    public function test_un_espace_suspendu_pendant_la_confirmation_se_rejuge_sous_le_verrou(AgencyStatus $statut): void
    {
        $titulaire = User::factory()->create(['phone' => self::NUMERO_ANNONCEUR, 'phone_verified_at' => now()]);
        $sien = Agency::factory()->create(['primary_admin_id' => $titulaire->id, 'kind' => 'individual']);
        Sanctum::actingAs($titulaire);
        $this->demanderLeCode()->assertStatus(202);
        $fait = false;
        DB::listen(function ($requete) use (&$fait, $sien, $statut): void {
            if (! $fait && str_contains($requete->sql, '"radar_advertisers"') && str_contains($requete->sql, 'for update')) {
                $fait = true;
                Agency::query()->whereKey($sien->id)->update(['status' => $statut->value]);
            }
        });

        $this->confirmer()->assertStatus(409)->assertJsonPath('code', 'radar.claim.space_suspended');

        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
        $this->assertTrue($this->annonceur->fresh()->underMandate());
        $this->assertNull($this->annonceur->fresh()->user_id);
    }

    /** Rejugé sous le verrou : une réservation arrivée entre le code et la confirmation défait tout, compte ouvert compris. */
    public function test_la_reprise_se_rejuge_sous_le_verrou(): void
    {
        $this->demanderLeCode()->assertStatus(202);
        $comptes = User::query()->count();
        $fait = false;
        DB::listen(function ($requete) use (&$fait): void {
            if (! $fait && str_contains($requete->sql, '"radar_advertisers"') && str_contains($requete->sql, 'for update')) {
                $fait = true;
                Booking::factory()->create(['property_id' => $this->biens[0], 'agency_id' => $this->espace->id]);
            }
        });

        $this->confirmer()->assertStatus(409)->assertJsonPath('code', 'radar.claim.mandate_support_required');

        $this->assertSame($comptes, User::query()->count());
        $this->assertSame($this->sousMandat(), $this->ouSontLesBiens());
        $this->assertTrue($this->annonceur->fresh()->underMandate());
        $this->assertSame(0, Activity::query()->where('event', 'radar_mandate_taken_back')->count());
    }

    /** Sous mandat, sans bien en ligne à reprendre ni annonce à publier : rien ne se confirme. */
    public function test_sous_mandat_sans_bien_a_reprendre_ni_annonce_a_publier_rien_ne_se_confirme(): void
    {
        Property::query()->whereIn('id', $this->biens)->get()->each->delete();

        $this->lire()->assertOk()->assertJsonPath('data.mandate.properties_count', 0);
        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertStatus(422)->assertJsonPath('code', 'radar.claim.nothing_selected');
    }

    /** Délié d'un compte supprimé après la reprise, l'annonceur n'est plus sous mandat ; un nouveau mandat ouvre une période neuve. */
    public function test_apres_la_reprise_un_nouveau_mandat_ouvre_une_periode_neuve(): void
    {
        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk();
        $premierMandat = $this->annonceur->fresh()->mandate_at;
        User::query()->whereKey($this->annonceur->fresh()->user_id)->sole()->delete();
        $this->annonceur->forceFill(['user_id' => null])->save();
        $this->assertFalse($this->annonceur->fresh()->underMandate());

        $this->travel(2)->days();
        $this->actingAsWithStepUp($this->operateur);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        $nouvelle = $this->annonceConsentie();
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish-mandate", ['listing_ids' => [$nouvelle->id]])->assertCreated();

        $annonceur = $this->annonceur->fresh();
        $this->assertTrue($annonceur->underMandate());
        $this->assertNull($annonceur->mandate_taken_back_at);
        $this->assertTrue($annonceur->mandate_at->greaterThan($premierMandat));
    }

    /** Le drapeau éteint après coup n'enferme pas l'annonceur : la reprise est sa sortie. */
    public function test_la_reprise_ne_depend_pas_du_drapeau(): void
    {
        FeatureFlag::query()->where('key', Flag::RadarMandate->value)->delete();

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer()->assertOk()->assertJsonPath('claim.taken_back_property_ids', $this->biens);
    }
}
