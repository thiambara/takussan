<?php

namespace Tests\Feature\Public;

use App\Models\AgencyRole;
use App\Models\AppNotification;
use App\Models\Enums\Capability;
use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyContactLead;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\ContactLeadReceivedNotification;
use App\Notifications\NewContactLeadNotification;
use App\Notifications\VisitRequestedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Sanctum\Sanctum;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

class PropertyContactLeadTest extends TestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('throttle:5,10|127.0.0.1');
    }

    public function test_anonymous_visitor_can_send_contact_lead(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);

        $response = $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop',
            'email' => 'awa@example.com',
            'phone' => '+221 77 123 45 67',
            'message' => 'Bonjour, je suis intéressée par ce bien — disponibilité ?',
        ]);

        $response->assertCreated()->assertJson(['data' => ['accepted' => true]]);

        $this->assertDatabaseHas('property_contact_leads', [
            'property_id' => $property->id,
            'recipient_user_id' => $owner->id,
            'name' => 'Awa Diop',
            'email' => 'awa@example.com',
        ]);
    }

    public function test_lead_routes_to_primary_agent_when_collaborator_exists(): void
    {
        $owner = User::factory()->create();
        $agent = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
            'accepted_at' => now(),
        ]);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Mamadou Sarr',
            'email' => 'mamadou@example.com',
            'message' => 'Je veux visiter ce week-end.',
        ])->assertCreated();

        $this->assertDatabaseHas('property_contact_leads', [
            'property_id' => $property->id,
            'recipient_user_id' => $agent->id,
        ]);

        // TCK-590 — plus de titre figé « Nouveau lead anonyme » : le titre nomme le visiteur et
        // le moyen de le joindre, dans la langue de l'agent.
        $notification = AppNotification::query()->where('user_id', $agent->id)->sole();
        $this->assertStringContainsString('Mamadou Sarr', $notification->title);
        $this->assertStringContainsString('mamadou@example.com', $notification->title);
    }

    public function test_invalid_email_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Test',
            'email' => 'not-an-email',
            'message' => 'Message valide ici.',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_honeypot_silently_accepts_without_persisting(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Spammer',
            'email' => 'spam@example.com',
            'message' => 'spam content here',
            'company' => 'evil-corp',
        ])->assertCreated();

        $this->assertDatabaseMissing('property_contact_leads', [
            'property_id' => $property->id,
        ]);
    }

    public function test_rate_limits_per_ip(): void
    {
        $property = Property::factory()->published()->create();
        $payload = [
            'name' => 'Loop',
            'email' => 'loop@example.com',
            'message' => 'Message valide ici.',
        ];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson("/api/public/properties/{$property->slug}/contact-lead", $payload)
                ->assertCreated();
        }

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", $payload)
            ->assertStatus(429);

        $this->assertSame(5, PropertyContactLead::query()->count());
    }

    // ── TCK-590 ─────────────────────────────────────────────────────────────────────────────

    /** AC3 — le téléphone seul suffit ; ni téléphone ni e-mail → 422 ; un numéro sans indicatif → 422. */
    public function test_un_telephone_seul_suffit_et_il_faut_l_un_des_deux(): void
    {
        $property = Property::factory()->published()->create();
        $url = "/api/public/properties/{$property->slug}/contact-lead";

        $this->postJson($url, ['name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Disponible ce samedi ?'])
            ->assertCreated();
        $this->assertDatabaseHas('property_contact_leads', ['phone' => '+221771234567', 'email' => null, 'channel' => 'form']);

        $this->postJson($url, ['name' => 'Awa Diop', 'message' => 'Disponible ce samedi ?'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone', 'email']);

        // Relevé de TCK-588 : le format national est ramené à E.164, plus refusé ni gardé tel quel.
        $this->postJson($url, ['name' => 'Moussa Fall', 'phone' => '78 765 43 21', 'message' => 'Disponible ce samedi ?'])
            ->assertCreated();
        $this->assertDatabaseHas('property_contact_leads', ['name' => 'Moussa Fall', 'phone' => '+221787654321']);

        $this->postJson($url, ['name' => 'Awa Diop', 'phone' => '77 123 45', 'message' => 'Disponible ce samedi ?'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['phone']);
    }

    /** Vérification adverse (m6) — « +77 … » n'est pas un « +7 » : 422, rien d'écrit. */
    public function test_un_indicatif_manquant_est_refuse(): void
    {
        $url = '/api/public/properties/'.Property::factory()->published()->create()->slug.'/contact-lead';
        foreach (['+77 123 45 67', '00 77 123 45 67'] as $faux) {
            $this->postJson($url, ['name' => 'Awa Diop', 'phone' => $faux, 'message' => 'Disponible ce samedi ?'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['phone']);
        }
        $this->assertDatabaseMissing('property_contact_leads', ['phone' => '+771234567']);
    }

    /**
     * Les numéros déjà enregistrés au format national — visites et pistes — sont rattrapés en
     * E.164 ; un numéro qu'aucune forme connue n'explique reste tel quel.
     */
    public function test_la_migration_rattrape_les_telephones_au_format_national(): void
    {
        $property = $this->bienDe($this->agence());
        $piste = fn (string $phone) => DB::table('property_contact_leads')->insertGetId([
            'property_id' => $property->id, 'name' => 'Ancienne', 'phone' => $phone, 'message' => 'Antérieure',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $nationale = $piste('77 123 45 67');
        $inconnue = $piste('61 234 56 78');
        $visite = PropertyVisit::factory()->create(['property_id' => $property->id, 'visitor_id' => null]);
        DB::table('property_visits')->where('id', $visite->id)->update(['visitor_phone' => '00221 78 765 43 21']);

        (require database_path('migrations/2026_10_07_150200_normaliser_les_telephones_saisis.php'))->up();

        $this->assertSame('+221771234567', DB::table('property_contact_leads')->where('id', $nationale)->value('phone'));
        $this->assertSame('61 234 56 78', DB::table('property_contact_leads')->where('id', $inconnue)->value('phone'));
        $this->assertSame('+221787654321', DB::table('property_visits')->where('id', $visite->id)->value('visitor_phone'));
    }

    /** AC15 (R) — une piste de bien porte l'agence du bien. */
    public function test_la_piste_d_un_bien_porte_l_agence_du_bien(): void
    {
        $agency = $this->agence();
        $agent = $this->personnel($agency);
        $property = $this->bienDe($agency);
        $this->collaborateur($property, $agent);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Disponible ce samedi ?',
        ])->assertCreated();

        $this->assertSame($agency->id, PropertyContactLead::query()->sole()->agency_id);
    }

    /** AC15 (R) — la migration rattrape l'agence des pistes de bien déjà enregistrées. */
    public function test_la_migration_rattrape_l_agence_des_pistes_existantes(): void
    {
        $agency = $this->agence();
        $property = $this->bienDe($agency);
        $migration = require database_path('migrations/2026_10_07_150000_alter_property_contact_leads_for_inbox.php');

        $migration->down();
        DB::table('property_contact_leads')->insert([
            'property_id' => $property->id, 'agency_id' => null, 'name' => 'Ancienne', 'email' => 'a@example.com',
            'message' => 'Piste antérieure au ticket', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $migration->up();

        $this->assertSame($agency->id, (int) DB::table('property_contact_leads')->value('agency_id'));
        $this->assertSame('form', DB::table('property_contact_leads')->value('channel'));
    }

    /**
     * AC18 (R) — un propriétaire qui a supprimé son compte laisse un bien d'agence sans
     * collaborateur : les admins de l'agence reçoivent la piste, qui porte l'agence.
     */
    public function test_sans_destinataire_les_admins_de_l_agence_recoivent_la_piste(): void
    {
        Notification::fake();
        $agency = $this->agence();
        $admin = $this->personnel($agency, 'agency_admin');
        $owner = $this->bailleur($agency);
        $property = $this->bienDe($agency, $owner);

        Sanctum::actingAs($owner);
        $this->deleteJson('/api/auth/account')->assertSuccessful();
        $this->app['auth']->forgetGuards();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Disponible ce samedi ?',
        ])->assertCreated();

        $lead = PropertyContactLead::query()->sole();
        $this->assertSame($agency->id, $lead->agency_id);
        $this->assertNull($lead->recipient_user_id);
        Notification::assertSentTo($admin, NewContactLeadNotification::class);
    }

    /** AC18 (R) — même bien SANS agence : 409 `contact_unavailable`, et rien n'est écrit. */
    public function test_sans_destinataire_ni_agence_la_demande_est_refusee_sans_rien_ecrire(): void
    {
        $owner = User::factory()->create();
        $property = $this->bienDe(null, $owner);

        Sanctum::actingAs($owner);
        $this->deleteJson('/api/auth/account')->assertSuccessful();
        $this->app['auth']->forgetGuards();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Disponible ce samedi ?',
        ])->assertStatus(409)->assertJsonPath('code', 'contact_unavailable');

        $this->assertDatabaseCount('property_contact_leads', 0);
    }

    /**
     * AC19c — l'accusé de réception part vers l'e-mail donné, une fois, sans recopier le message ;
     * avec un téléphone seul, aucun envoi au visiteur.
     */
    public function test_l_accuse_de_reception_part_par_e_mail_seulement(): void
    {
        Notification::fake();
        $property = Property::factory()->published()->create();
        $url = "/api/public/properties/{$property->slug}/contact-lead";
        $message = 'Message confidentiel du visiteur, à ne pas relayer.';

        $this->postJson($url, ['name' => 'Awa Diop', 'email' => 'awa@example.com', 'message' => $message])->assertCreated();

        Notification::assertSentOnDemandTimes(ContactLeadReceivedNotification::class, 1);
        Notification::assertSentOnDemand(
            ContactLeadReceivedNotification::class,
            function (ContactLeadReceivedNotification $n, array $channels, AnonymousNotifiable $to) use ($message) {
                $mail = $n->toMail($to);
                $texte = implode(' ', [...$mail->introLines, ...$mail->outroLines, $mail->subject]);

                return $channels === ['mail']
                    && $to->routes === ['mail' => 'awa@example.com']
                    && ! str_contains($texte, $message)
                    && ! str_contains($texte, 'Awa Diop');
            },
        );

        $this->postJson($url, ['name' => 'Moussa Fall', 'phone' => '+221771234567', 'message' => 'Rappelez-moi svp.'])->assertCreated();
        Notification::assertSentOnDemandTimes(ContactLeadReceivedNotification::class, 1);
    }

    /** AC17 (R) — un agent en anglais reçoit un titre anglais qui contient le téléphone du visiteur. */
    public function test_l_agent_anglophone_recoit_un_titre_anglais_avec_le_telephone(): void
    {
        $agent = User::factory()->create(['preferred_language' => 'en']);
        $property = Property::factory()->published()->create(['user_id' => $agent->id]);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Is it still available?',
        ], ['Accept-Language' => 'fr'])->assertCreated();

        $title = AppNotification::query()->where('user_id', $agent->id)->sole()->title;
        $this->assertStringStartsWith('New request from', $title);
        $this->assertStringContainsString('+221771234567', $title);
    }

    /** AC21 — la source d'arrivée accompagne la piste. */
    public function test_la_source_d_arrivee_est_enregistree(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Vu sur WhatsApp, disponible ?',
            'source' => 'whatsapp', 'medium' => 'share',
        ])->assertCreated();

        $this->assertDatabaseHas('property_contact_leads', ['source' => 'whatsapp', 'medium' => 'share']);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Vu sur WhatsApp, disponible ?',
            'source' => 'Une phrase entière',
        ])->assertUnprocessable()->assertJsonValidationErrors(['source']);
    }

    /**
     * Décision de la session (vérification adverse, m3) — une agence sans admin actif ni contact
     * joignable : personne ne lirait la demande. 409 `contact_unavailable` avant toute écriture,
     * pour la piste comme pour la visite — jamais un 201 pour une demande que personne ne lira.
     */
    public function test_une_agence_sans_personne_pour_lire_refuse_la_demande(): void
    {
        $agency = $this->agence();
        AgencyAdminProfile::query()->where('agency_id', $agency->id)->delete();
        // Passe 2 (n3) — un agent qui ne lit QUE ses demandes (sans `crm.view_all`) n'est pas un lecteur.
        $this->personnel($agency, agencyRole: AgencyRole::factory()->for($agency)
            ->withCapabilities([Capability::PropertiesCreate])->create());
        $owner = User::factory()->create(['status' => 'blocked']);
        $property = $this->bienDe($agency, $owner);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Disponible ce samedi ?',
        ])->assertStatus(409)->assertJsonPath('code', 'contact_unavailable')
            ->assertJsonPath('message', __('leads.contact_unavailable'));

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567', 'scheduled_at' => $this->creneau(),
        ])->assertStatus(409)->assertJsonPath('code', 'contact_unavailable');

        $this->assertDatabaseCount('property_contact_leads', 0);
        $this->assertDatabaseCount('property_visits', 0);
    }

    /**
     * Passe 2 (n3) — une agence sans admin actif, mais dont un agent actif détient `crm.view_all` :
     * il lit toute la boîte, la demande lui arrive (201), et la visite demandée aussi.
     */
    public function test_sans_admin_le_personnel_qui_lit_toute_la_boite_recoit_la_demande(): void
    {
        Notification::fake();
        $agency = $this->agence();
        AgencyAdminProfile::query()->where('agency_id', $agency->id)->delete();
        $lecteur = $this->personnel($agency);
        $this->assertTrue($lecteur->canActAt(Capability::CrmViewAll, $agency));
        $property = $this->bienDe($agency, User::factory()->create(['status' => 'blocked']));

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop', 'phone' => '+221771234567', 'message' => 'Disponible ce samedi ?',
        ])->assertCreated();
        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567', 'scheduled_at' => $this->creneau(),
        ])->assertCreated();

        $lead = PropertyContactLead::query()->latest('id')->firstOrFail();
        Notification::assertSentTo($lecteur, NewContactLeadNotification::class);
        Notification::assertSentTo($lecteur, VisitRequestedNotification::class);

        Sanctum::actingAs($lecteur);
        $this->getJson("/api/contact-leads/{$lead->id}")->assertOk();
        $this->assertContains($lead->id, collect($this->getJson('/api/contact-leads')->json('data'))->pluck('id')->all());
    }
}
