<?php

namespace Tests\Feature\Radar\Observatory;

use App\Domain\Features\Flag;
use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RadarSourceSite;
use App\Models\FeatureFlag;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\RadarListing;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Admin\PlatformSettingService;
use App\Services\Radar\Observatory\RadarAvailabilityCheck;
use App\Services\Radar\Observatory\RadarSourceWatch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;
use Tests\Support\FixturesDePublicationRadar;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2432, suite de TCK-2394 (ADR-0079, proposé) — la question de disponibilité pour un bien publié SOUS MANDAT.
 *
 * Sous mandat, aucun compte n'est créé : le bien naît dans l'espace des mandats, avec son administrateur principal pour
 * auteur (`properties.user_id`), et le numéro de l'annonceur pour contact. La question part donc à ce compte de l'équipe
 * Takussan — qui transmet à l'annonceur par un geste humain, comme pour une demande de contact (ADR-0079 § 2) —, jamais au
 * numéro de l'annonceur. Sans réponse, la proposition de retrait rattrape le silence, comme pour tout bien publié.
 */
class RadarAvailabilityCheckSousMandatTest extends TestCase
{
    use ConstruitLeMarche;
    use FixturesDePublicationRadar;
    use OperateursPlateforme;
    use RefreshDatabase;

    private Agency $espace;

    private User $gerant;

    private Property $bien;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->travelTo('2026-10-28 08:00:00');
        $this->installerLaPublication();
        $this->gerant = User::factory()->create(['first_name' => 'Équipe', 'last_name' => 'Takussan', 'email' => 'diffusion@example.test']);
        $this->espace = Agency::factory()->create(['name' => 'Takussan — diffusion', 'primary_admin_id' => $this->gerant->id]);
        app(PlatformSettingService::class)->bulkUpdate(['radar.mandate_agency_id' => $this->espace->id], $this->operateur);
        FeatureFlag::query()->create(['key' => Flag::RadarMandate->value, 'label' => Flag::RadarMandate->value, 'enabled' => true, 'segments_json' => []]);

        $annonce = $this->annonceConsentie(['source_site' => RadarSourceSite::Coinafrique]);
        $id = $this->postJson("/api/admin/radar/advertisers/{$this->annonceur->id}/publish-mandate", ['listing_ids' => [$annonce->id]])
            ->assertCreated()
            ->json('data.properties.0.id');
        $this->bien = Property::query()->findOrFail($id);

        // La source, vue jusqu'au 28 à 8 h 05, manque deux passages complets de son site.
        $this->instantane(RadarListing::query()->findOrFail($annonce->id), '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00', site: RadarSourceSite::Coinafrique);
        $this->passage('2026-10-29 08:00:00', site: RadarSourceSite::Coinafrique);
        $this->travelTo('2026-10-30 12:00:00');
        Queue::fake();
        Notification::fake();
    }

    private function questions(User $a): int
    {
        return AppNotification::query()->where('user_id', $a->id)->where('code', NotificationCode::PropertySourceListingGone->value)->count();
    }

    /** La question part à l'administrateur de l'espace des mandats, auteur du bien ; jamais au numéro de l'annonceur. */
    public function test_sous_mandat_la_question_part_au_compte_de_l_espace_des_mandats_jamais_au_numero(): void
    {
        $this->assertSame($this->gerant->id, $this->bien->user_id);
        $this->assertSame($this->espace->id, $this->bien->agency_id);
        $this->assertNull($this->annonceur->fresh()->user_id);

        $this->assertSame(1, app(RadarSourceWatch::class)->observe()['alerts']);

        $this->assertSame(1, $this->questions($this->gerant));
        $this->assertSame(1, AppNotification::query()->where('code', NotificationCode::PropertySourceListingGone->value)->count());
        $ligne = AppNotification::query()->where('code', NotificationCode::PropertySourceListingGone->value)->sole();
        $this->assertSame($this->espace->id, $ligne->target['agency_id']);
        Notification::assertSentOnDemandTimes(CodedNotification::class, 0);
        Notification::assertSentTo($this->gerant, CodedNotification::class, fn (CodedNotification $n, array $canaux) => $canaux === ['mail']);
    }

    /** L'administrateur de l'espace (profil d'admin, prérequis de l'espace des mandats, ADR-0079 § 2) voit la question et répond. */
    public function test_sous_mandat_l_administrateur_de_l_espace_repond(): void
    {
        AgencyAdminProfile::factory()->create(['user_id' => $this->gerant->id, 'agency_id' => $this->espace->id]);
        app(RadarSourceWatch::class)->observe();

        $this->actingAs($this->gerant)->getJson("/api/properties/{$this->bien->id}/availability-check")
            ->assertOk()->assertJsonPath('data.open', true);
        $this->actingAs($this->gerant)->postJson("/api/properties/{$this->bien->id}/availability-check", ['answer' => 'rented'])
            ->assertOk()->assertJsonPath('data.status', 'rented');

        $this->assertSame(PropertyStatus::Rented, $this->bien->refresh()->status);
        $this->assertFalse(Property::query()->public()->whereKey($this->bien->id)->exists());
    }

    /**
     * Un espace dont l'administrateur principal n'a pas de profil d'admin (incohérent : la demande de contact y est déjà
     * refusée) : la question part, mais il ne voit pas le bien et ne peut pas y répondre ; la proposition de retrait rattrape
     * le silence.
     */
    public function test_sous_mandat_sans_profil_d_admin_la_proposition_rattrape_le_silence(): void
    {
        app(RadarSourceWatch::class)->observe();
        $this->assertSame(1, $this->questions($this->gerant));

        $this->actingAs($this->gerant)->getJson("/api/properties/{$this->bien->id}/availability-check")
            ->assertForbidden();

        $this->travelTo('2026-11-06 12:00:00');
        $this->assertSame(1, app(RadarAvailabilityCheck::class)->proposeWithdrawals());
        $this->assertSame($this->bien->id, Activity::query()->where('event', RadarAvailabilityCheck::PROPOSAL_EVENT)->sole()->properties['property_id']);
    }
}
