<?php

namespace Tests\Feature\Radar\Observatory;

use App\Domain\Notifications\NotificationCode;
use App\Jobs\SendAdminAlert;
use App\Models\Agency;
use App\Models\AlertRule;
use App\Models\AppNotification;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceSite;
use App\Models\NotificationPreference;
use App\Models\Property;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Notifications\CodedNotification;
use App\Services\Property\PropertyPublication;
use App\Services\Radar\Observatory\RadarAvailabilityCheck;
use App\Services\Radar\Observatory\RadarSourceWatch;
use App\Support\RadarPhone;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-2432 — la source d'un bien publié par le Radar a disparu : son titulaire est prié de dire si le bien est toujours
 * disponible (AC1 : une fois par disparition) ; sans réponse, une proposition de retrait à l'équipe, jamais un retrait.
 */
class RadarAvailabilityCheckTest extends TestCase
{
    use ConstruitLeMarche;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        $this->travelTo('2026-10-30 12:00:00');
        Queue::fake();
        Notification::fake();
    }

    private function observer(): array
    {
        return app(RadarSourceWatch::class)->observe();
    }

    /** @return array{0: Property, 1: RadarListing} un bien publié par le Radar, sa source vue jusqu'au 28 puis manquée deux fois */
    private function bienDontLaSourceDisparait(array $bien = []): array
    {
        $property = Property::factory()->published()->create($bien);
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $property->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        return [$property, $annonce];
    }

    private function questions(User $titulaire): int
    {
        return AppNotification::query()
            ->where('user_id', $titulaire->id)
            ->where('code', NotificationCode::PropertySourceListingGone->value)
            ->count();
    }

    /** AC1 — la disparition notifie le titulaire du bien, une seule fois : la commande rejouée ne renotifie pas. */
    public function test_la_disparition_notifie_le_titulaire_une_seule_fois(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $titulaire = User::query()->findOrFail($property->user_id);

        $this->artisan('radar:observe-sources')->assertSuccessful();
        $this->artisan('radar:observe-sources')->assertSuccessful();

        $this->assertSame(1, $this->questions($titulaire));
        Notification::assertSentToTimes($titulaire, CodedNotification::class, 1);
        Notification::assertSentTo($titulaire, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::PropertySourceListingGone
            && $n->target['path'] === '/app/properties/'.$property->id
            && $n->params === ['property' => $property->title]);
        $this->assertNotNull($annonce->refresh()->availability_asked_at);
    }

    /** AC1 — sous course : deux demandes pour la même disparition, une seule notification (mise à jour conditionnelle). */
    public function test_deux_demandes_pour_la_meme_disparition_ne_notifient_qu_une_fois(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $titulaire = User::query()->findOrFail($property->user_id);
        $annonce->forceFill(['source_gone_at' => now()])->save();

        $checks = app(RadarAvailabilityCheck::class);
        $this->assertTrue($checks->ask($annonce, $property));
        $this->assertFalse($checks->ask($annonce->fresh(), $property));
        // Une copie périmée (lue avant la première demande) ne passe pas non plus : le marqueur se relit en base.
        $this->assertFalse($checks->ask($annonce, $property));

        $this->assertSame(1, $this->questions($titulaire));
    }

    /** AC1 — un retour de l'annonce, puis une nouvelle disparition : une nouvelle notification. */
    public function test_un_retour_puis_une_nouvelle_disparition_renotifient(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $titulaire = User::query()->findOrFail($property->user_id);
        $this->observer();
        $this->assertSame(1, $this->questions($titulaire));

        $annonce->snapshots()->update(['last_seen_at' => '2026-10-30 08:03:00']);
        $this->passage('2026-10-30 08:00:00', finDeListe: false);
        $this->assertSame(1, $this->observer()['back']);
        $this->assertNull($annonce->refresh()->availability_asked_at);

        $this->passage('2026-10-30 10:00:00');
        $this->passage('2026-10-30 11:00:00');
        $this->observer();

        $this->assertSame(2, $this->questions($titulaire));
    }

    /**
     * On ne demande que lorsque la DERNIÈRE source en ligne du bien disparaît : tant qu'une autre annonce du même bien est
     * en ligne, la question attend ; deux sources disparues ne font qu'une question.
     */
    public function test_une_seule_question_quand_toutes_les_sources_du_bien_ont_disparu(): void
    {
        $property = Property::factory()->published()->create();
        $titulaire = User::query()->findOrFail($property->user_id);
        $publiee = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $property->id], RadarSourceSite::Coinafrique);
        $this->instantane($publiee, '2026-10-20 08:00:00', '2026-10-29 09:00:00');
        // Le site de la publication a un passage complet qui l'a vue : la veille la juge, elle compte « en ligne ».
        $this->passage('2026-10-29 08:30:00', site: RadarSourceSite::Coinafrique);
        $doublon = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $publiee->id]);
        $this->instantane($doublon, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->assertSame(1, $this->observer()['alerts']);
        $this->assertSame(0, $this->questions($titulaire));

        $this->passage('2026-10-29 20:00:00', site: RadarSourceSite::Coinafrique);
        $this->passage('2026-10-30 08:00:00', site: RadarSourceSite::Coinafrique);
        $this->assertSame(1, $this->observer()['alerts']);

        $this->assertSame(1, $this->questions($titulaire));
        Notification::assertSentToTimes($titulaire, CodedNotification::class, 1);
    }

    /** Un bien déjà sorti de la vitrine (loué, archivé, privé) : rien à demander. */
    public function test_un_bien_hors_vitrine_n_est_pas_demande(): void
    {
        [$property] = $this->bienDontLaSourceDisparait(['status' => PropertyStatus::Rented]);

        $this->assertSame(1, $this->observer()['alerts']);

        $this->assertSame(0, $this->questions(User::query()->findOrFail($property->user_id)));
    }

    /**
     * Un bien du catalogue que le Radar n'a pas publié, dont une annonce collectée n'est que le doublon : l'équipe est
     * alertée (TCK-2393), son titulaire n'est pas questionné — il apprendrait que la plateforme surveille ses annonces ailleurs.
     */
    public function test_un_bien_du_catalogue_que_le_radar_n_a_pas_publie_n_est_pas_demande(): void
    {
        $property = Property::factory()->published()->create();
        $annonce = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_property_id' => $property->id]);
        $this->instantane($annonce, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->assertSame(1, $this->observer()['alerts']);

        $this->assertSame(0, $this->questions(User::query()->findOrFail($property->user_id)));
        $this->assertNull($annonce->refresh()->availability_asked_at);
    }

    /**
     * Le titulaire est un COMPTE Takussan : la question part à lui, jamais à un numéro. Même quand l'annonceur source de
     * la publication a dit STOP, aucun envoi à la demande (SMS, WhatsApp vers un numéro) ne part, et le code n'ouvre aucun
     * canal mobile vers le compte.
     */
    public function test_la_question_part_au_compte_jamais_a_un_numero(): void
    {
        $stop = RadarAdvertiser::query()->create([
            'phone' => '+221740000011',
            'phone_hmac' => RadarPhone::hmac('+221740000011'),
            'do_not_contact_at' => '2026-10-27 09:00:00',
        ]);
        $titulaire = User::factory()->create(['phone' => '+221740000011', 'phone_verified_at' => now()]);
        $property = Property::factory()->published()->create(['user_id' => $titulaire->id]);
        $publiee = $this->annonceCollectee(['stage' => RadarListingStage::Published, 'property_id' => $property->id, 'radar_advertiser_id' => $stop->id]);
        $doublon = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $publiee->id]);
        $this->instantane($doublon, '2026-10-20 08:00:00', '2026-10-28 08:05:00');
        $this->passage('2026-10-28 20:00:00');
        $this->passage('2026-10-29 08:00:00');

        $this->observer();

        $this->assertSame(1, $this->questions($titulaire));
        Notification::assertSentOnDemandTimes(CodedNotification::class, 0);
        Notification::assertSentTo($titulaire, CodedNotification::class, function (CodedNotification $n) use ($titulaire): bool {
            $canaux = $n->via($titulaire);

            return ! in_array('sms', $canaux, true) && ! in_array('whatsapp', $canaux, true);
        });
        $this->assertFalse(NotificationCode::PropertySourceListingGone->mobile());
        $this->assertFalse(NotificationCode::PropertySourceListingGone->reachesContacts());
    }

    /**
     * Le titulaire a un compte et des préférences : la question les suit. Par défaut l'e-mail part ; l'e-mail coupé, il ne
     * part plus (et, sans transport de push, rien d'autre ne part en file) — la cloche reste, elle ne se coupe pas.
     */
    public function test_la_question_suit_les_preferences_du_titulaire(): void
    {
        $joint = User::factory()->create(['email' => 'joint@example.test']);
        $this->bienDontLaSourceDisparait(['user_id' => $joint->id]);
        $coupe = User::factory()->create(['email' => 'coupe@example.test']);
        $this->bienDontLaSourceDisparait(['user_id' => $coupe->id]);
        NotificationPreference::query()->updateOrCreate([
            'user_id' => $coupe->id,
            'event_type' => NotificationCode::PropertySourceListingGone->preferenceEvent(),
            'channel' => 'email',
        ], ['enabled' => false]);

        $this->observer();

        $this->assertSame('property_availability_check', NotificationCode::PropertySourceListingGone->preferenceEvent());
        $this->assertSame(1, $this->questions($joint));
        Notification::assertSentTo($joint, CodedNotification::class, fn (CodedNotification $n, array $canaux) => in_array('mail', $canaux, true));
        $this->assertSame(1, $this->questions($coupe));
        Notification::assertNotSentTo($coupe, CodedNotification::class);
    }

    /** Le geste « loué » : le bien passe à son statut existant, hors vitrine ; la réponse est notée. */
    public function test_le_titulaire_repond_loue(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $titulaire = User::query()->findOrFail($property->user_id);
        $this->observer();

        $this->actingAs($titulaire)->getJson("/api/properties/{$property->id}/availability-check")
            ->assertOk()
            ->assertJsonPath('data.open', true)
            ->assertJsonPath('data.asked_at', '2026-10-30T12:00:00+00:00');

        $this->actingAs($titulaire)->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'rented'])
            ->assertOk()
            ->assertJsonPath('data.answer', 'rented')
            ->assertJsonPath('data.status', 'rented');

        $property->refresh();
        $this->assertSame(PropertyStatus::Rented, $property->status);
        $this->assertFalse(Property::query()->public()->whereKey($property->id)->exists());
        $annonce->refresh();
        $this->assertSame('rented', $annonce->availability_answer);
        $this->assertSame($titulaire->id, $annonce->availability_answered_by_id);
        $this->assertTrue($annonce->availability_answered_at->eq(now()));
        $this->actingAs($titulaire)->getJson("/api/properties/{$property->id}/availability-check")->assertJsonPath('data.open', false);
        $this->assertSame('rented', Activity::query()->where('event', RadarAvailabilityCheck::ANSWER_EVENT)->sole()->properties['answer']);
    }

    /** Le geste « vendu » : statut existant `sold`, hors vitrine. */
    public function test_le_titulaire_repond_vendu(): void
    {
        [$property] = $this->bienDontLaSourceDisparait();
        $this->observer();

        $this->actingAs(User::query()->findOrFail($property->user_id))
            ->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'sold'])
            ->assertOk();

        $this->assertSame(PropertyStatus::Sold, $property->refresh()->status);
        $this->assertFalse(Property::query()->public()->whereKey($property->id)->exists());
    }

    /** Le geste « toujours disponible » ne fait rien d'autre que noter la réponse. */
    public function test_le_titulaire_repond_toujours_disponible(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $this->observer();

        $this->actingAs(User::query()->findOrFail($property->user_id))
            ->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'available'])
            ->assertOk()
            ->assertJsonPath('data.status', 'available');

        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
        $this->assertTrue(Property::query()->public()->whereKey($property->id)->exists());
        $this->assertSame('available', $annonce->refresh()->availability_answer);
    }

    /** Seul qui peut modifier le bien répond ; une réponse hors de la liste est refusée. */
    public function test_la_reponse_est_gardee(): void
    {
        [$property] = $this->bienDontLaSourceDisparait();
        $this->observer();

        $this->actingAs(User::factory()->create())
            ->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'rented'])
            ->assertForbidden();
        $this->actingAs(User::query()->findOrFail($property->user_id))
            ->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'archived'])
            ->assertUnprocessable();

        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
    }

    /**
     * Sans réponse après `radar.observe.owner_answer_days` (7) jours : une PROPOSITION de retrait à l'équipe, par les règles
     * d'alerte de la console, une seule fois. Le bien reste en ligne : jamais de retrait automatique.
     */
    public function test_sans_reponse_une_proposition_de_retrait_jamais_un_retrait(): void
    {
        $regle = AlertRule::create([
            'event' => RadarAvailabilityCheck::PROPOSAL_EVENT,
            'channels_json' => ['email'],
            'recipients_json' => ['emails' => ['ops@example.test']],
            'is_active' => true,
        ]);
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $this->observer();

        $this->travelTo('2026-11-06 11:59:00');
        $this->assertSame(0, app(RadarAvailabilityCheck::class)->proposeWithdrawals());

        $this->travelTo('2026-11-06 12:00:00');
        $this->artisan('radar:observe-sources')->expectsOutputToContain('proposals=1')->assertSuccessful();
        $this->artisan('radar:observe-sources')->expectsOutputToContain('proposals=0')->assertSuccessful();

        Queue::assertPushed(SendAdminAlert::class, fn (SendAdminAlert $job) => $job->ruleId === $regle->id
            && $job->alert['event'] === RadarAvailabilityCheck::PROPOSAL_EVENT);
        $activite = Activity::query()->where('event', RadarAvailabilityCheck::PROPOSAL_EVENT)->sole();
        $this->assertSame($annonce->getMorphClass(), $activite->subject_type);
        $this->assertSame($property->id, $activite->properties['property_id']);
        $this->assertNull($activite->getAttribute('agency_id'));
        $this->assertNotNull($annonce->refresh()->withdrawal_proposed_at);
        $this->assertTrue(Property::query()->public()->whereKey($property->id)->exists());
        $this->assertSame(PropertyStatus::Available, $property->refresh()->status);
    }

    /** Une réponse, quelle qu'elle soit, éteint la proposition ; le délai se règle. */
    public function test_une_reponse_eteint_la_proposition_et_le_delai_se_regle(): void
    {
        config(['radar.observe.owner_answer_days' => 2]);
        [$property] = $this->bienDontLaSourceDisparait();
        $autreTitulaire = User::factory()->create();
        [$autre] = $this->bienDontLaSourceDisparait(['user_id' => $autreTitulaire->id]);
        $this->observer();

        $this->actingAs(User::query()->findOrFail($property->user_id))
            ->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'available'])
            ->assertOk();

        $this->travelTo('2026-11-01 12:00:00');
        $this->assertSame(1, app(RadarAvailabilityCheck::class)->proposeWithdrawals());
        $this->assertSame($autre->id, Activity::query()->where('event', RadarAvailabilityCheck::PROPOSAL_EVENT)->sole()->properties['property_id']);
    }

    /** Un bien sorti de la vitrine avant le délai (retiré par l'équipe, loué par une autre voie) : rien à proposer. */
    public function test_un_bien_sorti_de_la_vitrine_avant_le_delai_n_est_pas_propose(): void
    {
        [$property] = $this->bienDontLaSourceDisparait();
        $this->observer();
        $property->update(['status' => PropertyStatus::Archived]);

        $this->travelTo('2026-11-07 12:00:00');

        $this->assertSame(0, app(RadarAvailabilityCheck::class)->proposeWithdrawals());
        $this->assertSame(0, Activity::query()->where('event', RadarAvailabilityCheck::PROPOSAL_EVENT)->count());
    }

    /** La question se lit avec le bien : l'équipe la voit ouverte, un inconnu est refusé. */
    public function test_la_question_se_lit_avec_le_bien(): void
    {
        [$property] = $this->bienDontLaSourceDisparait();
        $this->observer();
        $operateur = $this->actingAsRole('super_admin');

        $this->assertTrue($operateur->can('update', $property));
        $this->getJson("/api/properties/{$property->id}/availability-check")->assertOk()->assertJsonPath('data.open', true);
        $this->actingAs(User::factory()->create())->getJson("/api/properties/{$property->id}/availability-check")->assertForbidden();
    }

    /**
     * I1 (vérification adverse) — un doublon que la veille ne juge jamais (annonceur STOP, stade `do_not_contact` ou purgé)
     * ne compte pas « en ligne » : sa dernière vraie source disparue, le titulaire est questionné.
     */
    public function test_un_doublon_jamais_juge_ne_retient_pas_la_question(): void
    {
        $stop = RadarAdvertiser::query()->create([
            'phone' => '+221740000012',
            'phone_hmac' => RadarPhone::hmac('+221740000012'),
            'do_not_contact_at' => '2026-10-27 09:00:00',
        ]);
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        foreach ([
            ['radar_advertiser_id' => $stop->id, 'stage' => RadarListingStage::Duplicate],
            ['stage' => RadarListingStage::DoNotContact],
            ['stage' => RadarListingStage::Purged],
        ] as $surcharge) {
            $doublon = $this->annonceCollectee($surcharge + ['duplicate_of_listing_id' => $annonce->id], RadarSourceSite::Coinafrique);
            $this->instantane($doublon, '2026-10-20 08:00:00', '2026-10-29 09:00:00');
        }
        $this->passage('2026-10-29 10:00:00', site: RadarSourceSite::Coinafrique);

        $this->assertSame(1, $this->observer()['alerts']);

        $this->assertSame(1, $this->questions(User::query()->findOrFail($property->user_id)));
    }

    /** I1 — une source d'un site qui n'a aucun passage complet n'est jamais jugée : elle ne compte pas « en ligne » non plus. */
    public function test_une_source_d_un_site_sans_passage_complet_ne_retient_pas_la_question(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $doublon = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $annonce->id], RadarSourceSite::Coinafrique);
        $this->instantane($doublon, '2026-10-20 08:00:00', '2026-10-29 09:00:00');

        $this->observer();

        $this->assertSame(1, $this->questions(User::query()->findOrFail($property->user_id)));
    }

    /** M1 (vérification adverse) — le bien quitte la vitrine après la question : la fiche ne la pose plus. */
    public function test_la_question_se_tait_quand_le_bien_quitte_la_vitrine(): void
    {
        [$property] = $this->bienDontLaSourceDisparait();
        $titulaire = User::query()->findOrFail($property->user_id);
        $this->observer();
        $this->actingAs($titulaire)->getJson("/api/properties/{$property->id}/availability-check")->assertJsonPath('data.open', true);

        $property->update(app(PropertyPublication::class)->archivedAttributes());

        $this->actingAs($titulaire)->getJson("/api/properties/{$property->id}/availability-check")
            ->assertOk()
            ->assertJsonPath('data.open', false)
            ->assertJsonPath('data.asked_at', null);
    }

    /** M2 (vérification adverse) — un bien supprimé règle sa question sans proposition : elle n'est plus relue à chaque passage. */
    public function test_un_bien_supprime_n_est_plus_relu(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $this->observer();
        $property->delete();

        $this->travelTo('2026-11-07 12:00:00');

        $this->assertSame(0, app(RadarAvailabilityCheck::class)->proposeWithdrawals());
        $this->assertNotNull($annonce->refresh()->withdrawal_proposed_at);
        $this->assertSame(0, Activity::query()->where('event', RadarAvailabilityCheck::PROPOSAL_EVENT)->count());
    }

    /** M3 — décision 5 : « loué » sur un bien déjà archivé note la réponse sans le désarchiver. */
    public function test_loue_sur_un_bien_archive_ne_le_desarchive_pas(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $this->observer();
        $property->update(app(PropertyPublication::class)->archivedAttributes());

        $this->actingAs(User::query()->findOrFail($property->user_id))
            ->postJson("/api/properties/{$property->id}/availability-check", ['answer' => 'rented'])
            ->assertOk()
            ->assertJsonPath('data.status', 'archived');

        $property->refresh();
        $this->assertSame(PropertyStatus::Archived, $property->status);
        $this->assertNotNull($property->archived_at);
        $this->assertSame('rented', $annonce->refresh()->availability_answer);
    }

    /** M3 — qui lit le bien sans pouvoir le modifier (un agent de l'agence, sans `properties.update_any`) ne voit pas la question. */
    public function test_la_question_n_est_ouverte_qu_a_qui_peut_repondre(): void
    {
        $agence = Agency::factory()->create();
        [$property] = $this->bienDontLaSourceDisparait(['agency_id' => $agence->id]);
        $this->observer();
        $this->assertSame(1, $this->questions(User::query()->findOrFail($property->user_id)));
        $agent = $this->actingAsRole('agent', ['agency' => $agence]);

        $this->assertTrue($agent->can('view', $property));
        $this->assertFalse($agent->can('update', $property));
        $this->getJson("/api/properties/{$property->id}/availability-check")->assertOk()->assertJsonPath('data.open', false);
    }

    /** M3 — une question déjà ouverte pour le bien couvre la disparition d'une source collectée après elle : pas de seconde notification. */
    public function test_une_question_ouverte_couvre_une_source_collectee_apres_elle(): void
    {
        [$property, $annonce] = $this->bienDontLaSourceDisparait();
        $titulaire = User::query()->findOrFail($property->user_id);
        $this->observer();
        $this->assertSame(1, $this->questions($titulaire));

        $tardive = $this->annonceCollectee(['stage' => RadarListingStage::Duplicate, 'duplicate_of_listing_id' => $annonce->id]);
        $this->instantane($tardive, '2026-10-29 09:00:00', '2026-10-30 09:00:00');
        $this->passage('2026-10-30 10:00:00');
        $this->passage('2026-10-30 11:00:00');
        $this->observer();

        $this->assertNotNull($tardive->refresh()->availability_asked_at);
        $this->assertSame(1, $this->questions($titulaire));
    }
}
