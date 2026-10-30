<?php

namespace Tests\Feature\Radar;

use App\Jobs\Radar\PrepareRadarListingPhotos;
use App\Jobs\Radar\PublishClaimedRadarListings;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\CreditWelcomeGrant;
use App\Models\Customer;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarConsentProof;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\UserStatus;
use App\Models\GeoNeighborhood;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Auth\PhoneLoginService;
use App\Services\Property\PublishReadiness;
use App\Services\Radar\ClaimLinks;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FakeSmsRouter;
use Tests\TestCase;

/**
 * TCK-2390 (ADR-0077 §3, §6 ; ADR-0033 §3) — l'annonceur réclame ses annonces depuis le lien du message : une page publique
 * qui ne révèle ni son numéro ni rien du Radar, un code SMS à SON seul numéro, puis la publication dans son espace, avec la
 * preuve `otp` et l'acceptation des conditions. Le même lien active le compte publié pour lui.
 */
class RadarClaimTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = '+221771234567';

    private FakeSmsRouter $sms;

    private User $operateur;

    private RadarAdvertiser $annonceur;

    private GeoNeighborhood $quartier;

    private RadarOutreach $message;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.phone_login.enabled' => true, 'radar.claim.link_ttl_days' => 30]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->operateur = User::factory()->create();
        $this->quartier = GeoNeighborhood::factory()->create();
        $this->annonceur = RadarAdvertiser::factory()->create([
            'phone' => self::NUMERO, 'display_name' => 'Awa Diop', 'nature' => 'probable_intermediary', 'nature_signals' => ['plusieurs annonces'],
        ]);
        $this->message = RadarOutreach::factory()->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v2',
            'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
    }

    /** Une annonce démarchée (`contacted`) par le message, sa réserve de photos déjà garnie à la main. */
    private function annonce(array $extracted = [], int $photos = 1, RadarListingStage $etape = RadarListingStage::Contacted): RadarListing
    {
        $annonce = RadarListing::factory()
            ->extracted(array_replace_recursive(['neighborhood' => ['neighborhood_id' => $this->quartier->id]], $extracted))
            ->create([
                'radar_advertiser_id' => $this->annonceur->id,
                'stage' => $etape,
                'source_kind' => RadarSourceKind::Text,
                'raw_text' => 'Appelez Awa au 77 123 45 67, '.fake()->unique()->sentence(),
            ]);
        for ($i = 0; $i < $photos; $i++) {
            $annonce->addMediaFromString(self::jpeg(100 + $i * 20))->usingFileName("p{$i}.jpg")->toMediaCollection('radar_photos');
        }
        $this->message->listings()->attach($annonce->id);

        return $annonce->fresh();
    }

    private static function jpeg(int $teinte): string
    {
        $image = imagecreatetruecolor(16, 12);
        imagefill($image, 0, 0, (int) imagecolorallocate($image, $teinte, 83, 50));
        ob_start();
        imagejpeg($image);

        return (string) ob_get_clean();
    }

    private function jeton(?RadarAdvertiser $annonceur = null): string
    {
        return app(ClaimLinks::class)->token($annonceur ?? $this->annonceur, $this->message->created_at);
    }

    private function lire(?string $jeton = null): TestResponse
    {
        return $this->getJson('/api/radar/claims/'.($jeton ?? $this->jeton()));
    }

    private function demanderLeCode(array $corps = []): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.$this->jeton().'/otp', $corps);
    }

    /** @param  list<array<string, mixed>>  $annonces */
    private function confirmer(array $annonces, array $surcharge = [], ?string $code = null): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.$this->jeton().'/confirm', $surcharge + [
            'code' => $code ?? $this->sms->lastCodeFor(self::NUMERO),
            'accept_terms' => true,
            'terms_version' => PublishReadiness::TERMS_VERSION,
            'listings' => $annonces,
            'first_name' => 'Awa',
            'space_name' => 'Awa Immobilier',
        ]);
    }

    /** Le compte que « Publier pour lui » a créé : sans mot de passe ni e-mail, numéro non vérifié, un bien publié. */
    private function publiePourLui(): array
    {
        $compte = new User;
        $compte->forceFill([
            'first_name' => 'Agence', 'last_name' => 'Immo Dakar', 'email' => null, 'password' => bcrypt('x'),
            'phone' => self::NUMERO, 'phone_verified_at' => null, 'status' => 'active', 'preferred_language' => 'fr',
        ])->save();
        $espace = Agency::factory()->create(['primary_admin_id' => $compte->id, 'name' => 'Espace de Agence', 'kind' => 'individual']);
        $this->annonceur->forceFill(['user_id' => $compte->id])->save();
        $publiee = $this->annonce(etape: RadarListingStage::Published);
        $bien = Property::factory()->create([
            'agency_id' => $espace->id, 'user_id' => $compte->id, 'visibility' => PropertyVisibility::Public, 'published_at' => now(),
            'status' => 'available', 'title' => 'Villa à Ngor',
        ]);
        $publiee->forceFill(['property_id' => $bien->id])->save();
        RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $this->message->id]);
        $this->message->forceFill(['outcome' => RadarOutreachOutcome::Consented, 'outcome_at' => now()])->save();

        return [$compte, $espace, $bien];
    }

    // --- AC1 : la page ne révèle ni le numéro ni rien du Radar --------------------------------------------------------

    public function test_ac1_la_page_montre_les_annonces_sans_le_numero_ni_rien_du_radar(): void
    {
        $annonce = $this->annonce(['description' => ['value' => 'Belle villa. Contact : 77 123 45 67 ou +221 77 123 45 67.']]);

        $reponse = $this->lire()->assertOk()
            ->assertJsonPath('data.advertiser.first_name', 'Awa')
            ->assertJsonPath('data.advertiser.phone_masked', '+221 •• ••• •• 67')
            ->assertJsonPath('data.account.state', 'new')
            ->assertJsonPath('data.account.space_name', 'Espace de Awa')
            ->assertJsonPath('data.terms_version', PublishReadiness::TERMS_VERSION)
            ->assertJsonPath('data.listings.0.id', $annonce->id)
            ->assertJsonPath('data.listings.0.title', 'Appartement 3 chambres à Mermoz')
            ->assertJsonPath('data.listings.0.price', 450000)
            ->assertJsonPath('data.listings.0.neighborhood', $this->quartier->canonique()->name);

        $this->assertNotNull($reponse->json('data.listings.0.photo_url'));
        $corps = (string) $reponse->getContent();
        // Ni le numéro sous aucune forme (E.164, national, groupé), ni la nature, ses indices, la source, un verdict (les clés
        // se cherchent avec leur guillemet : la signature de l'URL de la photo contient « nature »).
        foreach (['771234567', '77 123 45 67', '77 123 45 67', 'probable', '"nature', 'plusieurs annonces', '"source', 'coinafrique', 'verdict', '"matches"', '"raw_text"', '"phones', '"stage'] as $interdit) {
            $this->assertStringNotContainsString($interdit, $corps, $interdit);
        }
        $this->assertStringContainsString('[TELEPHONE]', $reponse->json('data.listings.0.description'));
        $this->assertSame(
            ['id', 'title', 'description', 'price', 'contract', 'rent_period', 'property_type', 'bedrooms', 'bathrooms', 'surface_m2', 'furnished', 'neighborhood', 'photo_url'],
            array_keys($reponse->json('data.listings.0')),
        );
    }

    /** @return array<string, array{string, string}> le nom d'affichage, et le prénom qu'il doit donner */
    public static function nomsQuiPortentLeNumero(): array
    {
        return [
            'numéro après le prénom' => ['Awa 77 123 45 67', 'Awa'],
            'numéro avant le prénom' => ['771234567 Awa', 'Awa'],
            'numéro international seul' => ['+221 77 123 45 67', ''],
        ];
    }

    /** Vérification adverse I-1 — le nom d'affichage vient d'une signature ou du profil WhatsApp, et peut porter le numéro. */
    #[DataProvider('nomsQuiPortentLeNumero')]
    public function test_ac1_le_nom_d_affichage_ne_fait_pas_sortir_le_numero(string $nom, string $prenom): void
    {
        $this->annonceur->forceFill(['display_name' => $nom])->save();
        $this->annonce();

        $reponse = $this->lire()->assertOk()
            ->assertJsonPath('data.advertiser.first_name', $prenom)
            ->assertJsonMissingPath('data.advertiser.last_name')
            ->assertJsonPath('data.account.space_name', $prenom === '' ? 'Mon espace' : "Espace de {$prenom}");

        $corps = (string) $reponse->getContent();
        foreach (['771234567', '77 123 45 67', '123 45'] as $interdit) {
            $this->assertStringNotContainsString($interdit, $corps, $interdit);
        }
    }

    /** @return array<string, array{array<string, string>, list<string>}> */
    public static function nomsAvecNumero(): array
    {
        return [
            'les deux' => [['first_name' => 'Awa 77 123 45 67', 'space_name' => 'Location 771234567'], ['first_name', 'space_name']],
            'le nom de l\'espace seul' => [['space_name' => 'Location 771234567'], ['space_name']],
        ];
    }

    /** Un code et les champs en cause, que la page affiche sous chacun : pas le message brut de la validation. */
    #[DataProvider('nomsAvecNumero')]
    public function test_un_prenom_ou_un_nom_d_espace_qui_porte_un_numero_est_refuse(array $noms, array $champs): void
    {
        $annonce = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);

        $this->confirmer([['id' => $annonce->id]], $noms)
            ->assertStatus(422)
            ->assertJsonPath('code', 'radar.claim.name_contains_phone')
            ->assertJsonPath('fields', $champs)
            ->assertJsonMissingPath('errors');
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
        $this->assertSame(0, User::query()->where('phone', self::NUMERO)->count());
    }

    /** Vérification adverse M-3 — le titre passe au masque comme la description. */
    public function test_ac1_le_titre_ne_fait_pas_sortir_le_numero(): void
    {
        $this->annonce(['title' => ['value' => 'Villa à Ngor, appelez le 77 123 45 67']]);

        $reponse = $this->lire()->assertOk();

        $this->assertStringContainsString('[TELEPHONE]', (string) $reponse->json('data.listings.0.title'));
        $this->assertStringNotContainsString('77 123 45 67', (string) $reponse->getContent());
    }

    public function test_seules_les_annonces_d_un_message_envoye_encore_ouvertes_sont_proposees(): void
    {
        $proposee = $this->annonce();
        $refusee = $this->annonce(etape: RadarListingStage::Refused);
        $brouillon = RadarOutreach::factory()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $nonEnvoyee = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $this->annonceur->id]);
        $brouillon->listings()->attach($nonEnvoyee->id);
        $autre = RadarAdvertiser::factory()->create();
        $etrangere = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => $autre->id, 'stage' => RadarListingStage::Contacted]);
        $this->message->listings()->attach($etrangere->id);

        $this->assertSame([$proposee->id], array_column($this->lire()->assertOk()->json('data.listings'), 'id'));
        $this->assertNotContains($refusee->id, array_column($this->lire()->json('data.listings'), 'id'));
    }

    // --- AC2 : après STOP, le lien rend 410 ----------------------------------------------------------------------------

    public function test_ac2_apres_un_stop_le_lien_rend_410_sur_les_trois_routes(): void
    {
        $annonce = $this->annonce();
        $jeton = $this->jeton();
        $this->annonceur->forceFill(['do_not_contact_at' => now()])->save();

        $this->getJson("/api/radar/claims/{$jeton}")->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');
        $this->postJson("/api/radar/claims/{$jeton}/otp")->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');
        $this->postJson("/api/radar/claims/{$jeton}/confirm", [
            'code' => '123456', 'accept_terms' => true, 'terms_version' => PublishReadiness::TERMS_VERSION, 'listings' => [['id' => $annonce->id]],
        ])->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');
        $this->assertSame([], $this->sms->sent);
    }

    public function test_un_lien_expire_ou_falsifie_est_refuse(): void
    {
        $this->annonce();
        $expire = app(ClaimLinks::class)->token($this->annonceur, now()->subDays(31));

        $this->lire($expire)->assertStatus(410)->assertJsonPath('code', 'radar.claim.expired');
        $this->postJson("/api/radar/claims/{$expire}/otp")->assertStatus(410);
        [$id, $emis] = explode('.', $this->jeton());
        $this->lire("{$id}.{$emis}.".str_repeat('x', 22))->assertNotFound()->assertJsonPath('code', 'radar.claim.invalid');
        $this->assertSame([], $this->sms->sent);
    }

    public function test_un_accord_revoque_tue_le_lien(): void
    {
        $this->annonce();
        RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $this->message->id, 'revoked_at' => now()]);

        $this->lire()->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');
    }

    // --- Le code part au seul numéro de l'annonceur ----------------------------------------------------------------------

    public function test_le_code_part_au_seul_numero_de_l_annonceur_quel_que_soit_le_corps(): void
    {
        $this->annonce();

        $reponse = $this->demanderLeCode(['phone' => '+221781112233', 'to' => '+221781112233'])->assertStatus(202)
            ->assertJsonPath('data.phone_masked', '+221 •• ••• •• 67');

        $this->assertSame([self::NUMERO], array_values(array_unique(array_column($this->sms->sent, 'to'))));
        $this->assertCount(1, $this->sms->sent);
        $this->assertStringNotContainsString('771234567', (string) $reponse->getContent());
        $this->assertIsInt($reponse->json('data.retry_after'));
    }

    public function test_la_borne_par_numero_de_la_connexion_par_telephone_s_applique(): void
    {
        $this->annonce();
        $this->travelTo(now());
        for ($i = 0; $i < 3; $i++) {
            $this->demanderLeCode()->assertStatus(202);
            $this->travel(61)->seconds();
        }

        $this->demanderLeCode()->assertStatus(429)->assertJsonPath('code', 'phone.send_limit');
        $this->assertCount(3, $this->sms->sentTo(self::NUMERO));
        // Le même seau que la connexion par téléphone : la page ne rouvre pas un budget neuf pour ce numéro.
        $this->postJson('/api/auth/phone/request-code', ['phone' => self::NUMERO])->assertStatus(429);
    }

    // --- AC3 : une confirmation publie, enregistre la preuve `otp` et les conditions ----------------------------------

    public function test_ac3_la_confirmation_publie_les_annonces_retenues_avec_la_preuve_otp_et_les_conditions(): void
    {
        $retenue = $this->annonce(['price' => ['value' => 450000]]);
        $decochee = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);

        $reponse = $this->confirmer([['id' => $retenue->id, 'title' => 'Bel appartement à Mermoz', 'price' => 400000]])->assertOk()
            ->assertJsonPath('is_new_account', true)
            ->assertJsonPath('claim.state', 'new')
            ->assertJsonPath('claim.listing_ids', [$retenue->id])
            ->assertJsonPath('claim.declined_ids', [$decochee->id])
            ->assertJsonPath('claim.agency.name', 'Awa Immobilier');
        $this->assertNotEmpty($reponse->json('token'));

        // Le compte : neuf, numéro vérifié par le code, conditions acceptées avec leur version, prénom corrigé.
        $compte = User::query()->findOrFail($reponse->json('user.id'));
        $this->assertSame(self::NUMERO, $compte->phone);
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertNotNull($compte->terms_accepted_at);
        $this->assertSame(PublishReadiness::TERMS_VERSION, $compte->terms_version);
        $this->assertSame('Awa', $compte->first_name);
        $this->assertSame($compte->id, $this->annonceur->fresh()->user_id);

        // Le bien : publié dans son espace, avec la correction.
        $retenue->refresh();
        $this->assertSame(RadarListingStage::Published, $retenue->stage);
        $bien = Property::query()->findOrFail($retenue->property_id);
        $this->assertSame('Bel appartement à Mermoz', $bien->title);
        $this->assertSame(400000, (int) $bien->price);
        $this->assertSame($compte->id, $bien->user_id);
        $this->assertSame(Agency::query()->where('primary_admin_id', $compte->id)->sole()->id, $bien->agency_id);
        $this->assertTrue(Property::query()->public()->whereKey($bien->id)->exists());

        // La preuve `otp`, confirmée par la connexion elle-même, sur le message ; le message est clos par l'accord.
        $preuve = RadarConsent::query()->where('proof', RadarConsentProof::Otp->value)->sole();
        $this->assertSame($this->message->id, $preuve->radar_outreach_id);
        $this->assertSame($compte->id, $preuve->confirmed_by_id);
        $this->assertNotNull($preuve->confirmed_at);
        $this->assertNull($preuve->revoked_at);
        $this->assertSame(RadarOutreachOutcome::Consented, $this->message->fresh()->outcome);

        // L'annonce décochée n'est plus publiable par cet accord.
        $this->assertSame(RadarListingStage::Refused, $decochee->fresh()->stage);
        $this->assertSame('radar.claim.declined', $decochee->fresh()->stage_reason);

        $journal = Activity::query()->where('event', 'radar_claimed')->sole();
        $this->assertSame($compte->id, $journal->causer_id);
        $this->assertStringNotContainsString('771234567', json_encode($journal->properties));

        // La session rendue ouvre bien ce compte.
        $this->app['auth']->forgetGuards();
        $this->withToken($reponse->json('token'))->getJson('/api/auth/me')->assertOk()->assertJsonPath('id', $compte->id);
    }

    public function test_un_code_faux_n_ecrit_rien(): void
    {
        $annonce = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);
        $comptes = User::query()->count();
        $bon = $this->sms->lastCodeFor(self::NUMERO);

        $this->confirmer([['id' => $annonce->id]], code: $bon === '000000' ? '111111' : '000000')
            ->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');

        $this->assertSame($comptes, User::query()->count());
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
        $this->assertSame(0, RadarConsent::query()->count());
        $this->assertNull($this->annonceur->fresh()->user_id);
    }

    public function test_des_conditions_d_une_autre_version_ou_non_acceptees_sont_refusees(): void
    {
        $annonce = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);

        $this->confirmer([['id' => $annonce->id]], ['terms_version' => '2020-01-01'])->assertStatus(422)->assertJsonPath('code', 'radar.claim.terms_outdated');
        $this->confirmer([['id' => $annonce->id]], ['accept_terms' => false])->assertStatus(422)->assertJsonValidationErrors(['accept_terms']);
        // Le code n'a pas été consommé : il sert encore.
        $this->confirmer([['id' => $annonce->id]])->assertOk();
    }

    public function test_une_annonce_hors_de_la_page_ou_aucune_annonce_sont_refusees(): void
    {
        $this->annonce();
        $autre = RadarListing::factory()->reviewed()->create(['radar_advertiser_id' => RadarAdvertiser::factory()->create()->id, 'stage' => RadarListingStage::Contacted]);
        $this->demanderLeCode()->assertStatus(202);

        $this->confirmer([['id' => $autre->id]])->assertStatus(422)->assertJsonPath('code', 'radar.claim.listing_unavailable');
        $this->confirmer([])->assertStatus(422)->assertJsonPath('code', 'radar.claim.nothing_selected');
        $this->assertSame(RadarListingStage::Contacted, $autre->fresh()->stage);
    }

    public function test_une_correction_qui_garde_le_numero_masque_est_refusee(): void
    {
        $annonce = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);

        $this->confirmer([['id' => $annonce->id, 'description' => 'Appelez le [TELEPHONE]']])
            ->assertStatus(422)->assertJsonValidationErrors(['listings.0.description']);
    }

    // --- AC4 : l'annonceur publié pour lui active son compte --------------------------------------------------------------

    public function test_ac4_le_compte_publie_pour_lui_s_active_et_recoit_le_credit_de_bienvenue(): void
    {
        [$compte, $espace, $bien] = $this->publiePourLui();

        $this->lire()->assertOk()
            ->assertJsonPath('data.account.state', 'activation')
            ->assertJsonPath('data.listings', [])
            ->assertJsonPath('data.published.0.title', 'Villa à Ngor');
        $this->assertSame(0, CreditWelcomeGrant::query()->count());
        $comptes = User::query()->count();

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer([], ['first_name' => 'Moussa', 'space_name' => 'Espace de Moussa'])->assertOk()
            ->assertJsonPath('is_new_account', false)
            ->assertJsonPath('user.id', $compte->id)
            ->assertJsonPath('claim.state', 'activation');

        $compte->refresh();
        $this->assertSame($comptes, User::query()->count());
        $this->assertNotNull($compte->phone_verified_at);
        $this->assertSame(PublishReadiness::TERMS_VERSION, $compte->terms_version);
        $this->assertSame('Moussa', $compte->first_name);
        $this->assertSame('Espace de Moussa', $espace->fresh()->name);
        $this->assertSame(1, CreditWelcomeGrant::query()->where('user_id', $compte->id)->count());
        $this->assertSame(1, RadarConsent::query()->where('proof', 'otp')->where('radar_outreach_id', $this->message->id)->count());
        $this->assertSame($espace->id, $bien->fresh()->agency_id);
    }

    public function test_ac4_une_annonce_de_plus_se_publie_dans_l_espace_du_compte_publie_pour_lui(): void
    {
        [$compte, $espace] = $this->publiePourLui();
        $nouvelle = $this->annonce();

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer([['id' => $nouvelle->id]])->assertOk()->assertJsonPath('claim.agency.id', $espace->id);

        $this->assertSame($espace->id, Property::query()->findOrFail($nouvelle->fresh()->property_id)->agency_id);
        $this->assertSame($compte->id, $this->annonceur->fresh()->user_id);
    }

    // --- Numéro déjà inscrit : connexion exigée -----------------------------------------------------------------------------

    public function test_un_numero_deja_inscrit_exige_la_connexion_avant_tout_code(): void
    {
        $annonce = $this->annonce();
        User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'existing')->assertJsonPath('data.account.viewer_is_owner', false);
        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.login_required');
        $this->assertSame([], $this->sms->sent);
        $this->confirmer([['id' => $annonce->id]], code: '123456')->assertStatus(409)->assertJsonPath('code', 'radar.claim.login_required');
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
    }

    public function test_connecte_le_titulaire_publie_dans_son_espace_avec_un_code_frais(): void
    {
        $annonce = $this->annonce();
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now(), 'first_name' => 'Fatou']);
        $espace = Agency::factory()->create(['primary_admin_id' => $titulaire->id, 'name' => 'Fatou Location', 'kind' => 'individual']);
        Sanctum::actingAs($titulaire);

        $this->lire()->assertOk()
            ->assertJsonPath('data.account.viewer_is_owner', true)
            ->assertJsonPath('data.account.space.name', 'Fatou Location');
        $this->demanderLeCode()->assertStatus(202);
        $reponse = $this->confirmer([['id' => $annonce->id]], ['space_name' => 'Ne doit pas renommer'])->assertOk()
            ->assertJsonPath('claim.state', 'existing')
            ->assertJsonPath('claim.agency.id', $espace->id)
            ->assertJsonMissingPath('token');

        $this->assertSame('Fatou Location', $espace->fresh()->name);
        $this->assertSame('Fatou', $titulaire->fresh()->first_name);
        $this->assertSame($espace->id, Property::query()->findOrFail($annonce->fresh()->property_id)->agency_id);
        $this->assertSame($titulaire->id, $this->annonceur->fresh()->user_id);
        $this->assertSame(1, RadarConsent::query()->where('proof', 'otp')->count());
        $this->assertNull($reponse->json('is_new_account'));
    }

    public function test_connecte_le_titulaire_doit_encore_saisir_le_code(): void
    {
        $annonce = $this->annonce();
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        Sanctum::actingAs($titulaire);

        $this->confirmer([['id' => $annonce->id]], code: '123456')->assertStatus(422)->assertJsonPath('code', 'phone_code_invalid');
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
    }

    public function test_le_compte_orphelin_jamais_active_suit_l_annonceur_puis_se_supprime(): void
    {
        [$compteRadar, $espaceRadar, $bien] = $this->publiePourLui();
        // Ce que les visiteurs ont laissé au bien publié par le Radar : une demande de contact, un prospect, une conversation.
        $demande = PropertyContactLead::factory()->create(['property_id' => $bien->id, 'recipient_user_id' => $compteRadar->id]);
        $prospect = Customer::factory()->create(['agency_id' => $espaceRadar->id]);
        $visiteur = User::factory()->create();
        $conversation = Conversation::factory()->create(['property_id' => $bien->id, 'created_by' => $visiteur->id]);
        $conversation->participants()->attach([$visiteur->id => ['role' => 'member'], $compteRadar->id => ['role' => 'member']]);
        // Le titulaire a vérifié le numéro sur un autre compte : la connexion par code ouvre celui-là.
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $nouvelle = $this->annonce();
        Sanctum::actingAs($titulaire);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'existing');
        $this->demanderLeCode()->assertStatus(202);
        $reponse = $this->confirmer([['id' => $nouvelle->id]])->assertOk()->assertJsonPath('claim.moved_property_ids', [$bien->id]);

        $espace = Agency::query()->where('primary_admin_id', $titulaire->id)->sole();
        $this->assertSame($espace->id, $reponse->json('claim.agency.id'));
        $this->assertSame([$espace->id, $titulaire->id], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertSame($espace->id, Property::query()->findOrFail($nouvelle->fresh()->property_id)->agency_id);
        $this->assertSame($titulaire->id, $this->annonceur->fresh()->user_id);
        // Rien n'est laissé derrière : la demande, le prospect et la conversation suivent le bien.
        $this->assertSame([$espace->id, $titulaire->id], [$demande->fresh()->agency_id, $demande->fresh()->recipient_user_id]);
        $this->assertSame($espace->id, $prospect->fresh()->agency_id);
        $this->assertEqualsCanonicalizing([$visiteur->id, $titulaire->id], $conversation->participants()->pluck('users.id')->all());
        // Puis A et son espace se suppriment (suppression douce).
        $this->assertSoftDeleted($compteRadar);
        $this->assertSoftDeleted($espaceRadar);
        $journal = Activity::query()->where('event', 'radar_orphan_absorbed')->sole();
        $this->assertSame([$titulaire->id, $compteRadar->id], [$journal->causer_id, $journal->subject_id]);
        $this->assertSame([$espaceRadar->id], $journal->properties['deleted_agency_ids']);
        $this->assertSame([$bien->id], $journal->properties['moved_property_ids']);
    }

    /** @return array<string, array{\Closure(User, Agency): void}> */
    public static function comptesRadarQuiOntServi(): array
    {
        return [
            'une connexion' => [fn (User $compte) => $compte->forceFill(['last_login_at' => now()])->save()],
            'un mot de passe choisi' => [fn (User $compte) => $compte->forceFill(['password_set_at' => now()])->save()],
            'une adresse e-mail' => [fn (User $compte) => $compte->forceFill(['email' => 'awa@example.test'])->save()],
            'un jeton de session' => [fn (User $compte) => $compte->createToken('x')],
            'une session de navigateur' => [fn (User $compte) => DB::table('sessions')->insert([
                'id' => 'session-a', 'user_id' => $compte->id, 'payload' => '', 'last_activity' => now()->getTimestamp(),
            ])],
            'un autre bien dans son espace' => [fn (User $compte, Agency $espace) => Property::factory()->create(['agency_id' => $espace->id, 'user_id' => $compte->id])],
            'un profil dans une autre agence' => [fn (User $compte) => AgentProfile::factory()->create(['user_id' => $compte->id, 'agency_id' => Agency::factory()->create()->id])],
        ];
    }

    /** Décision 5a : un compte du Radar qui a servi ne se réunit pas — rien ne bouge, la page renvoie au support. */
    #[DataProvider('comptesRadarQuiOntServi')]
    public function test_le_compte_orphelin_qui_a_servi_ne_bouge_pas_et_renvoie_au_support(\Closure $servir): void
    {
        [$compteRadar, $espaceRadar, $bien] = $this->publiePourLui();
        $servir($compteRadar, $espaceRadar);
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $nouvelle = $this->annonce();
        Sanctum::actingAs($titulaire);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'support');
        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.support_required');
        $this->assertSame([], $this->sms->sent);
        $this->confirmer([['id' => $nouvelle->id]], code: '123456')->assertStatus(409)->assertJsonPath('code', 'radar.claim.support_required');

        $this->assertSame([$espaceRadar->id, $compteRadar->id], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertSame($compteRadar->id, $this->annonceur->fresh()->user_id);
        $this->assertSame(RadarListingStage::Contacted, $nouvelle->fresh()->stage);
        $this->assertNotSoftDeleted($compteRadar);
        $this->assertNotSoftDeleted($espaceRadar);
        $this->assertSame(0, Activity::query()->where('event', 'radar_orphan_absorbed')->count());
    }

    /** B6 — un compte du Radar supprimé (par le support) n'est pas « jamais servi » : rien ne se réunit sans le support. */
    public function test_le_compte_orphelin_supprime_renvoie_au_support(): void
    {
        [$compteRadar, $espaceRadar, $bien] = $this->publiePourLui();
        $compteRadar->delete();
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $nouvelle = $this->annonce();
        Sanctum::actingAs($titulaire);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'support');
        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.support_required');
        $this->assertSame([], $this->sms->sent);

        $this->assertSame([$espaceRadar->id, $compteRadar->id], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertSame($compteRadar->id, $this->annonceur->fresh()->user_id);
        $this->assertSame(RadarListingStage::Contacted, $nouvelle->fresh()->stage);
    }

    /**
     * Confirmée, l'annonce attend le job : la page rechargée la montre « en cours de publication », sans case ni bouton, et une
     * seconde confirmation ne la reprend pas — ni second job, ni seconde preuve (contrôle au navigateur de TCK-2390).
     */
    public function test_une_annonce_reclamee_en_attente_du_job_ne_se_reclame_pas_deux_fois(): void
    {
        Queue::fake();
        $reclamee = $this->annonce();
        $autre = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);
        $compte = User::query()->findOrFail($this->confirmer([['id' => $reclamee->id], ['id' => $autre->id]])->assertOk()->json('user.id'));
        $this->assertSame(RadarListingStage::Consented, $reclamee->fresh()->stage);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($compte);
        $this->lire()->assertOk()
            ->assertJsonPath('data.account.state', 'existing')
            ->assertJsonPath('data.listings', [])
            ->assertJsonPath('data.publishing.0.id', $reclamee->id)
            ->assertJsonPath('data.publishing.1.id', $autre->id)
            ->assertJsonMissingPath('data.publishing.0.nature');

        $this->demanderLeCode()->assertStatus(202);
        $this->confirmer([['id' => $reclamee->id]])->assertStatus(422)
            ->assertJsonPath('code', 'radar.claim.listing_unavailable')
            ->assertJsonPath('params.listing_ids', [$reclamee->id]);

        Queue::assertPushed(PublishClaimedRadarListings::class, 1);
        $this->assertSame(1, RadarConsent::query()->where('proof', 'otp')->count());
    }

    public function test_connecte_avec_un_autre_compte_la_page_refuse(): void
    {
        $annonce = $this->annonce();
        Sanctum::actingAs(User::factory()->create());

        $this->lire()->assertOk()->assertJsonPath('data.account.viewer_is_other', true);
        // La confirmation refuserait : aucun SMS ne part (vérification adverse M-6), le refus a le code de la confirmation.
        $this->demanderLeCode()->assertStatus(403)->assertJsonPath('code', 'radar.claim.wrong_account');
        $this->assertSame([], $this->sms->sent);
        app(PhoneLoginService::class)->requestCode(self::NUMERO, 'fr');
        $this->confirmer([['id' => $annonce->id]])->assertStatus(403)->assertJsonPath('code', 'radar.claim.wrong_account');
        $this->assertNull($this->annonceur->fresh()->user_id);
    }

    public function test_connecte_avec_un_autre_compte_l_activation_n_envoie_aucun_sms(): void
    {
        [$compteRadar] = $this->publiePourLui();
        Sanctum::actingAs(User::factory()->create());

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'activation');
        $this->demanderLeCode()->assertStatus(403)->assertJsonPath('code', 'radar.claim.wrong_account');
        $this->assertSame([], $this->sms->sent);
        $this->assertNull($compteRadar->fresh()->phone_verified_at);
    }

    /** Vérification adverse I-3 — C, connecté, connaît un code du numéro (téléphone partagé) : il ne réunit pas A chez lui. */
    public function test_un_autre_compte_connecte_avec_un_code_valide_ne_reunit_pas_l_orphelin(): void
    {
        [$compteRadar, $espaceRadar, $bien] = $this->publiePourLui();
        User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $nouvelle = $this->annonce();
        $intrus = User::factory()->create();
        Sanctum::actingAs($intrus);
        // Le code demandé par la connexion ordinaire, qui est publique : il est valide pour le numéro.
        app(PhoneLoginService::class)->requestCode(self::NUMERO, 'fr');

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'existing')->assertJsonPath('data.account.viewer_is_owner', false);
        $this->confirmer([['id' => $nouvelle->id]])->assertStatus(403)->assertJsonPath('code', 'radar.claim.wrong_account');

        $this->assertSame([$espaceRadar->id, $compteRadar->id], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertSame($compteRadar->id, $this->annonceur->fresh()->user_id);
        $this->assertNotSoftDeleted($compteRadar);
        $this->assertSame(0, Agency::query()->where('primary_admin_id', $intrus->id)->count());
        $this->assertSame(RadarListingStage::Contacted, $nouvelle->fresh()->stage);
        $this->assertSame(0, Activity::query()->where('event', 'radar_orphan_absorbed')->count());
    }

    /** @return array<string, array{\Closure(User, Agency): void, bool}> le geste de modération, et si le bien était public avant */
    public static function comptesRadarModeres(): array
    {
        return [
            'compte bloqué' => [fn (User $compte) => $compte->forceFill(['status' => UserStatus::Blocked])->save(), true],
            'espace suspendu' => [fn (User $compte, Agency $espace) => $espace->forceFill(['status' => AgencyStatus::Suspended])->save(), false],
        ];
    }

    /**
     * Vérification adverse I-2 — un compte du Radar modéré ne se réunit pas : ses biens ne quittent pas la modération pour
     * l'espace actif de B. La même règle que le chemin de l'opérateur et l'état `activation` ; la page renvoie au support.
     */
    #[DataProvider('comptesRadarModeres')]
    public function test_le_compte_orphelin_modere_ne_se_reunit_pas(\Closure $moderer, bool $publicAvant): void
    {
        [$compteRadar, $espaceRadar, $bien] = $this->publiePourLui();
        $moderer($compteRadar, $espaceRadar);
        $this->assertSame($publicAvant, Property::query()->public()->whereKey($bien->id)->exists());
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $nouvelle = $this->annonce();
        Sanctum::actingAs($titulaire);

        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'support');
        $this->demanderLeCode()->assertStatus(409)->assertJsonPath('code', 'radar.claim.support_required');
        $this->assertSame([], $this->sms->sent);
        app(PhoneLoginService::class)->requestCode(self::NUMERO, 'fr');
        $this->confirmer([['id' => $nouvelle->id]])->assertStatus(409)->assertJsonPath('code', 'radar.claim.support_required');

        $this->assertSame([$espaceRadar->id, $compteRadar->id], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertSame($publicAvant, Property::query()->public()->whereKey($bien->id)->exists());
        $this->assertNotSoftDeleted($compteRadar);
        $this->assertNotSoftDeleted($espaceRadar);
        $this->assertSame(RadarListingStage::Contacted, $nouvelle->fresh()->stage);
        $this->assertSame(0, Activity::query()->where('event', 'radar_orphan_absorbed')->count());
    }

    // --- Les courses : ce qui change entre la lecture de l'état et le verrou (vérification adverse M-2) -----------------------

    /**
     * Joue `$geste` une fois, juste après la première requête `… for update` sur `$table` dans `claim()` — un geste commité
     * juste avant le verrou suivant. `radar_listings` précède le verrou de l'annonceur, que la ligne lue sous lui voie le geste.
     */
    private function auVerrou(string $table, \Closure $geste): void
    {
        $fait = false;
        DB::listen(function ($requete) use (&$fait, $table, $geste): void {
            if (! $fait && str_contains($requete->sql, '"'.$table.'"') && str_contains($requete->sql, 'for update')) {
                $fait = true;
                $geste();
            }
        });
    }

    /** @return array<string, array{\Closure(User, Agency): void}> */
    public static function gestesDeLAdministrateur(): array
    {
        return [
            'un profil dans une autre agence' => [fn (User $compte) => AgentProfile::factory()->create(['user_id' => $compte->id, 'agency_id' => Agency::factory()->create()->id])],
            'l\'espace suspendu' => [fn (User $compte, Agency $espace) => $espace->forceFill(['status' => AgencyStatus::Suspended])->save()],
            'le compte bloqué' => [fn (User $compte) => $compte->forceFill(['status' => UserStatus::Blocked])->save()],
        ];
    }

    /** A7 — l'orphelin se rejuge sous verrou : la page a lu « jamais servi », un administrateur a agi depuis. */
    #[DataProvider('gestesDeLAdministrateur')]
    public function test_l_orphelin_se_rejuge_sous_le_verrou(\Closure $geste): void
    {
        [$compteRadar, $espaceRadar, $bien] = $this->publiePourLui();
        $titulaire = User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now()]);
        $nouvelle = $this->annonce();
        Sanctum::actingAs($titulaire);
        $this->lire()->assertOk()->assertJsonPath('data.account.state', 'existing');
        $this->demanderLeCode()->assertStatus(202);

        $this->auVerrou('radar_advertisers', fn () => $geste($compteRadar, $espaceRadar));
        $this->confirmer([['id' => $nouvelle->id]])->assertStatus(409)->assertJsonPath('code', 'radar.claim.support_required');

        $this->assertSame([$espaceRadar->id, $compteRadar->id], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertNotSoftDeleted($compteRadar);
        $this->assertSame(RadarListingStage::Contacted, $nouvelle->fresh()->stage);
    }

    /**
     * TCK-2421 (ADR-0079) — une publication sous mandat passée entre la lecture et le verrou : relue sous le verrou, la
     * confirmation reprend aussi ce bien dans l'espace de l'annonceur. Jamais un compte à côté de biens restés sous mandat.
     */
    public function test_sous_mandat_la_reclamation_se_rejuge_sous_le_verrou(): void
    {
        $annonce = $this->annonce();
        $publiee = $this->annonce(etape: RadarListingStage::Published);
        $gerant = User::factory()->create();
        $espaceDesMandats = Agency::factory()->create(['primary_admin_id' => $gerant->id]);
        $bien = Property::factory()->create([
            'agency_id' => $espaceDesMandats->id, 'user_id' => $gerant->id, 'metadata' => ['radar_listing_id' => $publiee->id, 'radar_mandate' => true],
            'visibility' => PropertyVisibility::Public, 'published_at' => now(), 'status' => 'available',
        ]);
        $this->lire()->assertOk()->assertJsonPath('data.mandate', null);
        $this->demanderLeCode()->assertStatus(202);

        $this->auVerrou('radar_listings', function () use ($publiee, $bien): void {
            RadarListing::query()->whereKey($publiee->id)->update(['property_id' => $bien->id]);
            RadarAdvertiser::query()->whereKey($this->annonceur->id)->update(['mandate_at' => now()]);
        });
        $reponse = $this->confirmer([['id' => $annonce->id]])->assertOk()
            ->assertJsonPath('claim.listing_ids', [$annonce->id])
            ->assertJsonPath('claim.taken_back_property_ids', [$bien->id]);

        $compte = $this->annonceur->fresh()->user_id;
        $this->assertSame([$reponse->json('claim.agency.id'), $compte], [$bien->fresh()->agency_id, $bien->fresh()->user_id]);
        $this->assertFalse($this->annonceur->fresh()->underMandate());
    }

    /** A8 — un STOP enregistré entre la lecture et le verrou : rien ne se publie, rien ne s'écrit. */
    public function test_un_stop_arrive_pendant_la_confirmation_ne_publie_rien(): void
    {
        $annonce = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);

        $this->auVerrou('radar_listings', fn () => RadarAdvertiser::query()->whereKey($this->annonceur->id)->update(['do_not_contact_at' => now()]));
        $this->confirmer([['id' => $annonce->id]])->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');

        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
        $this->assertNull($annonce->fresh()->property_id);
        $this->assertSame(0, RadarConsent::query()->where('proof', 'otp')->count());
        $this->assertSame(0, Property::query()->count());
    }

    /**
     * A13 — la page a lu `new`, puis un compte a vérifié ce numéro avant l'ouverture de session : le code ouvre CE compte,
     * qui n'est pas celui que la page annonçait. Le geste est joué au début de la transaction de la confirmation.
     */
    public function test_un_compte_verifie_entre_la_lecture_et_le_code_arrete_la_confirmation(): void
    {
        $annonce = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);
        $fait = false;
        Event::listen(TransactionBeginning::class, function () use (&$fait): void {
            if (! $fait) {
                $fait = true;
                User::factory()->create(['phone' => self::NUMERO, 'phone_verified_at' => now(), 'email' => 'autre@example.test']);
            }
        });

        $this->confirmer([['id' => $annonce->id]])->assertStatus(409)->assertJsonPath('code', 'radar.claim.account_changed');

        $this->assertTrue($fait);
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
        $this->assertNull($this->annonceur->fresh()->user_id);
        $this->assertSame(0, Agency::query()->count());
        $this->assertSame(0, RadarConsent::query()->where('proof', 'otp')->count());
    }

    // --- Les portes de la publication pour lui ----------------------------------------------------------------------------

    public function test_sans_connexion_par_telephone_la_page_est_fermee(): void
    {
        $this->annonce();
        config(['auth.phone_login.enabled' => false]);

        $this->lire()->assertStatus(503)->assertJsonPath('code', 'radar.claim.unavailable');
        $this->demanderLeCode()->assertStatus(503);
        $this->assertSame([], $this->sms->sent);
    }

    public function test_en_staging_avec_l_apercu_des_codes_la_page_est_fermee(): void
    {
        $this->annonce();
        app()->detectEnvironment(fn () => 'staging');
        config(['auth.otp_preview.enabled' => true]);

        $this->lire()->assertStatus(503)->assertJsonPath('code', 'radar.claim.unavailable');
        $this->demanderLeCode()->assertStatus(503);
        $this->assertSame([], $this->sms->sent);
    }

    // --- La publication attend les photos d'une annonce-URL ---------------------------------------------------------------

    public function test_une_annonce_url_fait_lire_ses_photos_puis_publier_apres_le_commit(): void
    {
        Queue::fake();
        $url = $this->annonce(photos: 0);
        $url->forceFill(['source_kind' => RadarSourceKind::Url, 'source_url' => 'https://sn.coinafrique.com/annonce/1', 'photo_urls' => ['https://a.cdn.test/p/1.jpg']])->save();
        $texte = $this->annonce();
        $this->demanderLeCode()->assertStatus(202);

        $this->confirmer([['id' => $url->id], ['id' => $texte->id]])->assertOk();

        Queue::assertPushed(PrepareRadarListingPhotos::class, fn (PrepareRadarListingPhotos $job) => $job->listingId === $url->id);
        Queue::assertNotPushed(PrepareRadarListingPhotos::class, fn (PrepareRadarListingPhotos $job) => $job->listingId === $texte->id);
        Queue::assertPushed(PublishClaimedRadarListings::class, fn (PublishClaimedRadarListings $job) => $job->listingIds === [$url->id, $texte->id]
            && $job->advertiserId === $this->annonceur->id);
        $this->assertSame(RadarListingStage::Consented, $url->fresh()->stage);
    }

    // --- Le seau par numéro de la vérification ----------------------------------------------------------------------------

    public function test_la_confirmation_partage_le_seau_par_numero_de_la_connexion_par_telephone(): void
    {
        $annonce = $this->annonce();
        $this->withMiddleware(ThrottleRequests::class);
        $this->demanderLeCode()->assertStatus(202);
        $bon = $this->sms->lastCodeFor(self::NUMERO);
        $faux = $bon === '000000' ? '111111' : '000000';

        // Deux essais par la connexion par téléphone, deux par la page : le cinquième, d'où qu'il vienne, est borné.
        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $faux])->assertStatus(422);
        $this->postJson('/api/auth/phone/verify-code', ['phone' => self::NUMERO, 'code' => $faux])->assertStatus(422);
        $this->confirmer([['id' => $annonce->id]], code: $faux)->assertStatus(422);
        $this->confirmer([['id' => $annonce->id]], code: $faux)->assertStatus(422);
        $this->confirmer([['id' => $annonce->id]], code: $bon)->assertStatus(429);
        $this->assertSame(RadarListingStage::Contacted, $annonce->fresh()->stage);
    }
}
