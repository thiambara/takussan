<?php

namespace Tests\Feature\Radar;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Enums\PropertyVisibility;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarOutreachOutcome;
use App\Models\Enums\RadarSourceKind;
use App\Models\GeoNeighborhood;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarConsent;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\SearchQueryStat;
use App\Models\User;
use App\Services\Radar\AdvertiserRevocation;
use App\Services\Radar\ClaimDecline;
use App\Services\Radar\ClaimLinks;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Tests\Support\FakeSmsRouter;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2511 — depuis le lien de réclamation, l'annonceur dit non sans code (« Ce n'est pas moi », « Ne plus me contacter ») :
 * l'effet est celui d'un STOP ({@see AdvertiserRevocation::apply()}). Et la page lit la demande du
 * quartier de ses annonces, comptée sur le journal des recherches, `null` sous le seuil.
 */
class RadarClaimDeclineTest extends TestCase
{
    use OperateursPlateforme;
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
        config(['auth.phone_login.enabled' => true, 'radar.claim.link_ttl_days' => 30, 'radar.claim.demand_min_searches' => 50]);
        $this->withoutMiddleware(ThrottleRequests::class);
        $this->sms = FakeSmsRouter::install();
        $this->operateur = User::factory()->create();
        $this->quartier = GeoNeighborhood::factory()->create(['name' => 'Almadies', 'slug' => 'almadies']);
        $this->annonceur = RadarAdvertiser::factory()->create(['phone' => self::NUMERO, 'display_name' => 'Awa Diop']);
        $this->message = RadarOutreach::factory()->sent()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'clauses_version' => 'accord.v2',
            'created_by_id' => $this->operateur->id, 'sent_by_id' => $this->operateur->id,
        ]);
    }

    private function annonce(?int $quartier = null, RadarListingStage $etape = RadarListingStage::Contacted): RadarListing
    {
        $annonce = RadarListing::factory()
            ->extracted(['neighborhood' => ['neighborhood_id' => $quartier ?? $this->quartier->id]])
            ->create([
                'radar_advertiser_id' => $this->annonceur->id,
                'stage' => $etape,
                'source_kind' => RadarSourceKind::Text,
                'raw_text' => 'Appelez Awa au 77 123 45 67, '.fake()->unique()->sentence(),
            ]);
        $this->message->listings()->attach($annonce->id);

        return $annonce->fresh();
    }

    private function jeton(?\DateTimeInterface $emis = null): string
    {
        return app(ClaimLinks::class)->token($this->annonceur, $emis ?? $this->message->created_at);
    }

    private function refuser(string $motif = 'stop_contact', ?string $jeton = null): TestResponse
    {
        return $this->postJson('/api/radar/claims/'.($jeton ?? $this->jeton()).'/decline', ['reason' => $motif]);
    }

    private function lire(): TestResponse
    {
        return $this->getJson('/api/radar/claims/'.$this->jeton());
    }

    /** Une ligne du journal des recherches (ADR-0088), `$jours` jours avant aujourd'hui. */
    private function recherches(string $lieu, int $nombre, int $jours = 0): void
    {
        SearchQueryStat::query()->create([
            'day' => now()->subDays($jours)->toDateString(),
            'query_key' => hash('sha256', Str::random(16)),
            'normalized_query' => null,
            'criteria' => ['location' => $lieu],
            'searches_count' => $nombre,
            'distinct_visitors' => 1,
            'distinct_networks' => 1,
        ]);
    }

    // --- AC1 : le refus vaut un STOP ---------------------------------------------------------------------------------------

    /** @return array<string, array{string}> */
    public static function motifs(): array
    {
        return ['ce n\'est pas moi' => ['not_me'], 'ne plus me contacter' => ['stop_contact']];
    }

    #[DataProvider('motifs')]
    public function test_ac1_le_refus_par_le_lien_vaut_un_stop_et_journalise_le_motif(string $motif): void
    {
        $annonce = $this->annonce();
        RadarConsent::factory()->confirmed($this->operateur)->create(['radar_outreach_id' => $this->message->id]);

        $this->refuser($motif)->assertOk()->assertExactJson(['data' => ['status' => 'declined']]);

        $annonceur = $this->annonceur->fresh();
        $this->assertNotNull($annonceur->do_not_contact_at);
        // L'empreinte reste pour ne plus le contacter ; la purge (file synchrone) efface le numéro : plus aucune annonce publiée.
        $this->assertSame(RadarPhone::hmac(self::NUMERO), $annonceur->phone_hmac);
        $this->assertNull($annonceur->phone);
        $this->assertSame(RadarListingStage::Purged, $annonce->fresh()->stage);
        $this->assertNull($annonce->fresh()->raw_text);
        $this->assertNotNull(RadarConsent::query()->sole()->revoked_at);
        // Le message prend l'issue `stop`, sans auteur — comme le STOP reçu par WhatsApp.
        $message = $this->message->fresh();
        $this->assertSame(RadarOutreachOutcome::Stop, $message->outcome);
        $this->assertNull($message->outcome_by_id);

        $journal = Activity::query()->where('event', 'radar_claim_declined')->sole();
        $this->assertSame($motif, $journal->properties['reason']);
        $this->assertSame($this->annonceur->id, $journal->properties['advertiser_id']);
        $this->assertSame([$annonce->id], $journal->properties['listing_ids']);
    }

    public function test_ac1_apres_le_refus_le_numero_ne_se_contacte_plus_et_une_annonce_neuve_n_ouvre_rien(): void
    {
        $annonce = $this->annonce();
        $this->refuser('not_me')->assertOk();

        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/claim")->assertOk();
        // Même vérification que pour un STOP par message : aucun message ne se prépare plus pour lui.
        $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/outreaches", ['listing_ids' => [$annonce->id], 'locale' => 'fr'])
            ->assertStatus(422)->assertJsonPath('code', 'radar.advertiser.do_not_contact');

        // Une annonce neuve de ce numéro est rattachée à l'annonceur refusé (par l'empreinte) et purgée aussitôt.
        $this->postJson('/api/admin/radar/listings', ['text' => "Villa à vendre à Almadies, 85 000 000 FCFA, 4 chambres. Contact : 77 123 45 67\nVisite sur rendez-vous."])
            ->assertCreated();
        $neuve = RadarListing::query()->latest('id')->firstOrFail();
        $this->assertSame($this->annonceur->id, $neuve->radar_advertiser_id);
        $this->assertSame(RadarListingStage::Purged, $neuve->stage);
    }

    public function test_un_bien_publie_sous_le_lien_quitte_le_public_comme_pour_un_stop(): void
    {
        $this->annonce();
        $publiee = $this->annonce(etape: RadarListingStage::Published);
        $bien = Property::factory()->create(['visibility' => PropertyVisibility::Public, 'published_at' => now(), 'status' => 'available']);
        $publiee->forceFill(['property_id' => $bien->id])->save();

        $this->refuser()->assertOk();

        $this->assertSame(0, Property::query()->public()->whereKey($bien->id)->count());
        // Il lui reste une annonce publiée : la purge garde son numéro, comme après un STOP (`RadarStopPurgeTest`).
        $this->assertSame(RadarListingStage::Published, $publiee->fresh()->stage);
        $this->assertSame(self::NUMERO, $this->annonceur->fresh()->phone);
        $this->assertNotNull($this->annonceur->fresh()->do_not_contact_at);
    }

    // --- AC2 : après le refus, le lien est mort ------------------------------------------------------------------------------

    public function test_ac2_apres_le_refus_le_lien_repond_comme_un_lien_mort(): void
    {
        $this->annonce();
        $jeton = $this->jeton();
        $this->refuser('not_me', $jeton)->assertOk();

        $this->getJson("/api/radar/claims/{$jeton}")->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');
        // Un second refus ne dit rien de plus qu'un lien mort, et n'écrit rien.
        $this->refuser('stop_contact', $jeton)->assertStatus(410)->assertJsonPath('code', 'radar.claim.revoked');
        $this->assertSame(1, Activity::query()->where('event', 'radar_claim_declined')->count());
    }

    public function test_un_lien_expire_ou_falsifie_ne_refuse_rien(): void
    {
        $this->annonce();

        $this->refuser('not_me', $this->jeton(now()->subDays(31)))->assertStatus(410)->assertJsonPath('code', 'radar.claim.expired');
        [$id, $emis] = explode('.', $this->jeton());
        $this->refuser('not_me', "{$id}.{$emis}.".str_repeat('x', 22))->assertNotFound()->assertJsonPath('code', 'radar.claim.invalid');

        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
        $this->assertSame(0, Activity::query()->where('event', 'radar_claim_declined')->count());
    }

    public function test_un_motif_absent_ou_inconnu_est_refuse_sans_rien_ecrire(): void
    {
        $this->annonce();

        $this->postJson('/api/radar/claims/'.$this->jeton().'/decline', [])->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->refuser('autre')->assertUnprocessable()->assertJsonValidationErrors('reason');

        $this->assertNull($this->annonceur->fresh()->do_not_contact_at);
    }

    /** Le droit d'opposition ne dépend pas des portes de la publication (connexion par téléphone, aperçu des codes). */
    public function test_le_refus_reste_ouvert_quand_la_page_est_fermee(): void
    {
        $this->annonce();
        config(['auth.phone_login.enabled' => false]);

        $this->lire()->assertStatus(503);
        $this->refuser()->assertOk();

        $this->assertNotNull($this->annonceur->fresh()->do_not_contact_at);
    }

    // --- AC4 : aucun SMS ------------------------------------------------------------------------------------------------------

    public function test_ac4_le_refus_n_envoie_aucun_sms(): void
    {
        $this->annonce();

        $this->refuser('not_me')->assertOk();

        $this->assertSame([], $this->sms->sent);
    }

    // --- AC3 : la demande du quartier -----------------------------------------------------------------------------------------

    public function test_ac3_sous_le_seuil_la_demande_est_nulle(): void
    {
        $this->annonce();
        $this->recherches('Almadies', 30);
        $this->recherches('almadies', 19, jours: 29);

        $this->lire()->assertOk()->assertJsonPath('data.demand', null);
    }

    public function test_ac3_au_seuil_la_demande_compte_les_recherches_du_quartier_sur_trente_jours(): void
    {
        $this->annonce();
        $this->annonce();
        $this->recherches('Almadies', 30);
        // Une autre écriture du même quartier (casse, accents, tiret) compte : c'est sa clé qui se compare.
        $this->recherches('ALMADIÉS', 20, jours: 29);
        // Hors fenêtre, autre quartier : ne comptent pas.
        $this->recherches('Almadies', 500, jours: 30);
        $this->recherches('Ngor', 500);

        $this->lire()->assertOk()->assertJsonPath('data.demand', ['quarter' => 'Almadies', 'searches_30d' => 50]);
    }

    public function test_un_ancien_nom_ou_un_quartier_fusionne_compte_pour_le_quartier(): void
    {
        $this->quartier->forceFill(['former_names' => ['Les Almadies']])->save();
        GeoNeighborhood::factory()->create(['name' => 'Pointe des Almadies', 'slug' => 'pointe-des-almadies', 'merged_into_id' => $this->quartier->id]);
        $this->annonce();
        $this->recherches('les almadies', 25);
        $this->recherches('Pointe des Almadies', 25);

        $this->lire()->assertOk()->assertJsonPath('data.demand.searches_30d', 50);
    }

    public function test_le_seuil_se_regle(): void
    {
        config(['radar.claim.demand_min_searches' => 10]);
        $this->annonce();
        $this->recherches('Almadies', 10);

        $this->lire()->assertOk()->assertJsonPath('data.demand.searches_30d', 10);
    }

    public function test_des_annonces_sans_quartier_commun_n_ont_pas_de_demande(): void
    {
        $ngor = GeoNeighborhood::factory()->create(['name' => 'Ngor', 'slug' => 'ngor']);
        $this->annonce();
        $this->annonce($ngor->id);
        $this->recherches('Almadies', 500);
        $this->recherches('Ngor', 500);

        $this->lire()->assertOk()->assertJsonPath('data.demand', null);
    }

    public function test_une_annonce_sans_quartier_n_a_pas_de_demande(): void
    {
        $this->annonce();
        $sans = RadarListing::factory()->extracted()->create([
            'radar_advertiser_id' => $this->annonceur->id, 'stage' => RadarListingStage::Contacted, 'source_kind' => RadarSourceKind::Text,
        ]);
        $this->message->listings()->attach($sans->id);
        $this->recherches('Almadies', 500);

        $this->lire()->assertOk()->assertJsonPath('data.demand', null);
    }

    public function test_la_demande_ne_porte_aucune_donnee_d_un_tiers(): void
    {
        $this->annonce();
        SearchQueryStat::query()->create([
            'day' => now()->toDateString(), 'query_key' => hash('sha256', 'x'), 'normalized_query' => 'villa awa diop',
            'criteria' => ['location' => 'Almadies'], 'searches_count' => 60, 'distinct_visitors' => 7, 'distinct_networks' => 7,
        ]);

        $demande = $this->lire()->assertOk()->json('data.demand');

        $this->assertSame(['quarter', 'searches_30d'], array_keys($demande));
        $this->assertSame(60, $demande['searches_30d']);
    }

    // --- Revue adverse (2026-11-09) : trois angles morts fermés ------------------------------------------------------------

    /** Deux refus qui ont tous deux passé `resolve()` : le second se juge sous le verrou de l'annonceur, et ne journalise rien. */
    public function test_un_second_refus_concurrent_se_juge_sous_le_verrou(): void
    {
        $this->annonce();
        // Les deux requêtes tiennent la même lecture de l'annonceur, encore vivante : la première l'emporte.
        $lu = $this->annonceur->fresh();
        app(ClaimDecline::class)->decline($lu, 'not_me');

        try {
            app(ClaimDecline::class)->decline($lu, 'stop_contact');
            $this->fail('Le second refus aurait dû rendre 410.');
        } catch (HttpExceptionInterface $e) {
            $this->assertSame(410, $e->getStatusCode());
        }
        $this->assertSame(1, Activity::query()->where('event', 'radar_claim_declined')->count());
        $this->assertSame('not_me', Activity::query()->where('event', 'radar_claim_declined')->sole()->properties['reason']);
    }

    /** Une annonce rattachée à un quartier depuis fusionné : la demande est celle du quartier cible, comptée sur ses clés. */
    public function test_une_annonce_d_un_quartier_fusionne_lit_la_demande_du_quartier_cible(): void
    {
        $source = GeoNeighborhood::factory()->create(['name' => 'Pointe des Almadies', 'slug' => 'pointe-des-almadies']);
        $this->annonce($source->id);
        $source->forceFill(['merged_into_id' => $this->quartier->id])->save();
        $this->recherches('Almadies', 30);
        $this->recherches('Pointe des Almadies', 20);

        $reponse = $this->lire()->assertOk()->assertJsonPath('data.demand', ['quarter' => 'Almadies', 'searches_30d' => 50]);

        // Le même nom que la carte de l'annonce : la page ne dit pas deux quartiers.
        $this->assertSame($reponse->json('data.listings.0.neighborhood'), $reponse->json('data.demand.quarter'));
    }

    /** Le refus a son propre seau par IP (10/min) : épuisé, il rend 429 sans entamer celui de la lecture. */
    public function test_le_refus_a_son_propre_limiteur(): void
    {
        $this->withMiddleware(ThrottleRequests::class);
        $this->annonce();

        // Un motif inconnu : rien ne s'écrit, chaque requête compte quand même au limiteur (il précède la validation).
        $codes = [];
        for ($i = 0; $i < 11; $i++) {
            $codes[] = $this->refuser('inconnu')->status();
        }

        $this->assertSame(array_fill(0, 10, 422), array_slice($codes, 0, 10));
        $this->assertSame(429, $codes[10]);
        $this->lire()->assertOk();
    }
}
