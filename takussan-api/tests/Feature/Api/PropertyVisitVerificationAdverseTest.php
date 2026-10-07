<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\UserStatus;
use App\Models\Enums\VisitStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Notifications\VisitCancelledNotification;
use App\Notifications\VisitConfirmedNotification;
use App\Notifications\VisitRescheduledNotification;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-590 — les défauts de la vérification adverse (VERIF-590), côté visites.
 *
 * Cause racine de B1 et B2 : `StorePropertyVisitRequest::managesProperty()` comptait le CRÉATEUR
 * du bien parmi ceux qui planifient pour un tiers. Le créateur est aussi le bailleur
 * propriétaire, et l'agent qui a créé le bien puis quitté l'agence : ils lisaient n'importe quelle
 * fiche client de l'agence, et faisaient partir un SMS vers un numéro libre.
 */
class PropertyVisitVerificationAdverseTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private Agency $x;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->x = $this->agence();
    }

    private function ficheTierce(): void
    {
        $this->ficheClient($this->x, null, [
            'first_name' => 'Fatou', 'last_name' => 'Secrete',
            'phone' => '+221775550001', 'email' => 'secret@example.com',
        ]);
    }

    private function idFicheTierce(): int
    {
        return (int) Customer::query()->where('email', 'secret@example.com')->value('id');
    }

    /** Les SMS réellement partis vers ce numéro (le canal `sms` figure dans l'envoi). */
    private function smsVers(string $numero): int
    {
        $n = 0;
        foreach (Notification::sentNotifications() as $parId) {
            foreach ($parId as $classes) {
                foreach ($classes as $envois) {
                    foreach ($envois as $envoi) {
                        $a = $envoi['notifiable'] ?? null;
                        if ($a instanceof AnonymousNotifiable && ($a->routes['sms'] ?? null) === $numero
                            && in_array('sms', $envoi['channels'], true)) {
                            $n++;
                        }
                    }
                }
            }
        }

        return $n;
    }

    /** La séquence du vérificateur (N1) : demande anonyme au numéro d'un tiers, confirmation, 8 déplacements. */
    private function relais(User $acteur, Property $bien, string $numero, int $deplacements = 8): int
    {
        $id = $this->postJson("/api/public/properties/{$bien->slug}/visit-request", [
            'visitor_name' => 'Victime', 'visitor_phone' => $numero, 'scheduled_at' => $this->creneau(),
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($acteur);
        $this->postJson("/api/property-visits/{$id}/confirm")->assertOk();
        for ($i = 0; $i < $deplacements; $i++) {
            $this->patchJson("/api/property-visits/{$id}", ['scheduled_at' => $this->creneau(jours: 3 + $i)])->assertOk();
        }

        return (int) $id;
    }

    /** Aucune coordonnée de la fiche tierce n'est rendue, ni écrite, ni prévenue. */
    private function assertRienDeLaFiche(string $json): void
    {
        $this->assertStringNotContainsString('+221775550001', $json);
        $this->assertStringNotContainsString('secret@example.com', $json);
        $this->assertStringNotContainsString('Secrete', $json);
        $this->assertDatabaseMissing('property_visits', ['visitor_phone' => '+221775550001']);
        $this->assertDatabaseMissing('property_visits', ['customer_id' => $this->idFicheTierce()]);
        Notification::assertNothingSentTo(new AnonymousNotifiable);
    }

    /** B1 (R) — le bailleur propriétaire n'emprunte pas la fiche d'un client de l'agence. */
    public function test_b1_le_bailleur_proprietaire_ne_lit_pas_une_fiche_de_l_agence(): void
    {
        $bailleur = $this->bailleur($this->x);
        $this->ficheTierce();
        Sanctum::actingAs($bailleur);

        // Bien privé : il n'est ni personnel ni réservable → 403, rien d'écrit.
        $prive = $this->bienDe($this->x, $bailleur, public: false);
        $this->postJson('/api/property-visits', [
            'property_id' => $prive->id, 'customer_id' => $this->idFicheTierce(), 'scheduled_at' => $this->creneau(),
        ])->assertForbidden();

        // Bien public : il réserve pour LUI-MÊME (contrainte 3) — la fiche envoyée est ignorée.
        $public = $this->bienDe($this->x, $bailleur);
        $reponse = $this->postJson('/api/property-visits', [
            'property_id' => $public->id, 'customer_id' => $this->idFicheTierce(), 'scheduled_at' => $this->creneau(),
        ])->assertCreated();
        $this->assertNull($reponse->json('data.customer_id'));
        $this->assertSame($bailleur->id, $reponse->json('data.visitor_id'));
        $this->assertSame(VisitStatus::Scheduled->value, $reponse->json('data.status'));

        $this->assertRienDeLaFiche($reponse->getContent());
    }

    /** B1 (R) — l'agent qui a créé le bien puis a quitté l'agence non plus. */
    public function test_b1_l_agent_retire_createur_du_bien_ne_lit_pas_une_fiche(): void
    {
        $ancien = $this->personnel($this->x);
        $prive = $this->bienDe($this->x, $ancien, public: false);
        $public = $this->bienDe($this->x, $ancien);
        AgentProfile::query()->where('user_id', $ancien->id)->first()->delete();
        $this->ficheTierce();
        Sanctum::actingAs($ancien->fresh());

        $this->postJson('/api/property-visits', [
            'property_id' => $prive->id, 'customer_id' => $this->idFicheTierce(), 'scheduled_at' => $this->creneau(),
        ])->assertForbidden();

        $reponse = $this->postJson('/api/property-visits', [
            'property_id' => $public->id, 'customer_id' => $this->idFicheTierce(), 'scheduled_at' => $this->creneau(),
        ])->assertCreated();
        $this->assertNull($reponse->json('data.customer_id'));

        $this->assertRienDeLaFiche($reponse->getContent());
        $this->assertRienDeLaFiche($this->getJson('/api/property-visits?include=customer')->assertOk()->getContent());
    }

    /**
     * B2 (R) — un bailleur ne crée pas de visite confirmée vers un numéro libre : bien privé →
     * 403 à chaque essai ; bien public → une visite EN ATTENTE, à son propre numéro. Aucun SMS.
     */
    public function test_b2_un_bailleur_ne_relaie_aucun_sms(): void
    {
        $bailleur = $this->bailleur($this->x, ['phone' => '+221770000099']);
        Sanctum::actingAs($bailleur);

        $prive = $this->bienDe($this->x, $bailleur, public: false);
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/property-visits', [
                'property_id' => $prive->id, 'visitor_name' => 'X', 'visitor_phone' => '+221776660002',
                'scheduled_at' => $this->creneau(jours: 3 + $i),
            ])->assertForbidden();
        }

        $public = $this->bienDe($this->x, $bailleur);
        $id = $this->postJson('/api/property-visits', [
            'property_id' => $public->id, 'visitor_name' => 'X', 'visitor_phone' => '+221776660002',
            'scheduled_at' => $this->creneau(),
        ])->assertCreated()->json('data.id');

        $visite = PropertyVisit::query()->findOrFail($id);
        $this->assertSame(VisitStatus::Scheduled, $visite->status);
        $this->assertSame('+221770000099', $visite->visitor_phone);
        $this->assertDatabaseMissing('property_visits', ['visitor_phone' => '+221776660002']);
        Notification::assertNothingSentTo(new AnonymousNotifiable);
        Notification::assertNotSentTo($bailleur, VisitConfirmedNotification::class);
    }

    /** B2 (R) — la planification est bornée par DESTINATAIRE : 5 visites par heure vers un même numéro. */
    public function test_b2_le_limiteur_borne_les_sms_par_destinataire(): void
    {
        $agent = $this->personnel($this->x);
        $bien = $this->bienDe($this->x);
        Sanctum::actingAs($agent);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/property-visits', [
                'property_id' => $bien->id, 'visitor_name' => 'Moussa Fall', 'visitor_phone' => '77 666 00 02',
                'scheduled_at' => $this->creneau(jours: 2 + $i),
            ])->assertCreated();
        }
        // Même numéro, autre écriture : la clé est la forme E.164.
        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'visitor_name' => 'Moussa Fall', 'visitor_phone' => '+221776660002',
            'scheduled_at' => $this->creneau(jours: 9),
        ])->assertStatus(429);

        // Un autre destinataire passe encore.
        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567',
            'scheduled_at' => $this->creneau(jours: 10),
        ])->assertCreated();
    }

    /**
     * Passe 2 (n1) — la borne par destinataire porte sur le numéro NORMALISÉ, saisi ou lu sur la
     * fiche : alterner le numéro et des fiches au même numéro ne la contourne plus (sonde N2).
     */
    public function test_n1_la_borne_par_destinataire_lit_le_numero_de_la_fiche(): void
    {
        $agent = $this->personnel($this->x);
        $bien = $this->bienDe($this->x);
        Sanctum::actingAs($agent);

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/property-visits', [
                'property_id' => $bien->id, 'visitor_name' => 'A', 'visitor_phone' => '+221776660003',
                'scheduled_at' => $this->creneau(jours: 2 + $i),
            ])->assertCreated();
        }
        for ($i = 0; $i < 2; $i++) {
            $fiche = $this->ficheClient($this->x, null, ['phone' => '77 666 00 03']);
            $this->postJson('/api/property-visits', [
                'property_id' => $bien->id, 'customer_id' => $fiche->id, 'scheduled_at' => $this->creneau(jours: 5 + $i),
            ])->assertCreated();
        }

        $fiche = $this->ficheClient($this->x, null, ['phone' => '00221 77 666 00 03']);
        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'customer_id' => $fiche->id, 'scheduled_at' => $this->creneau(jours: 8),
        ])->assertStatus(429);
    }

    /** B2 (R) — et par ÉMETTEUR : 30 planifications par heure pour un même compte. */
    public function test_b2_le_limiteur_borne_l_emetteur(): void
    {
        $agent = $this->personnel($this->x);
        $bien = $this->bienDe($this->x);
        Sanctum::actingAs($agent);

        for ($i = 0; $i < 30; $i++) {
            $this->postJson('/api/property-visits', [
                'property_id' => $bien->id, 'visitor_name' => 'Client '.$i,
                'visitor_phone' => sprintf('+2217710%05d', $i),
                'scheduled_at' => $this->creneau(jours: 2 + intdiv($i, 10), heure: 9 + ($i % 10)),
            ])->assertCreated();
        }

        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'visitor_name' => 'Client 31', 'visitor_phone' => '+221771099999',
            'scheduled_at' => $this->creneau(jours: 6),
        ])->assertStatus(429);
    }

    /**
     * B2′ (R) — le relais rouvert par une autre porte : demande anonyme, confirmation, 8 `PATCH`.
     * 9 SMS en 9 requêtes avant la borne au point d'envoi ; 5 après, et l'annulation qui suit n'en
     * fait pas partir un sixième. L'e-mail, lui, n'est pas borné.
     */
    public function test_b2prime_le_relais_par_confirmation_et_deplacements_est_borne(): void
    {
        Log::spy();
        $this->personnel($this->x, 'agency_admin');
        $agent = $this->personnel($this->x);
        $bien = $this->bienDe($this->x);

        $id = $this->relais($agent, $bien, '+221779990001');
        $this->postJson("/api/property-visits/{$id}/cancel", ['reason' => 'x'])->assertOk();

        $this->assertSame(5, $this->smsVers('+221779990001'));
        Log::shouldHaveReceived('notice')->withArgs(fn (string $message, array $contexte) => $message === 'visit.sms_retenu'
            && ! str_contains(json_encode($contexte), '779990001'))->times(5);
    }

    /** B2′ (R) — même borne sur un bien SANS agence, où le particulier propriétaire déplace (N1b). */
    public function test_b2prime_le_particulier_proprietaire_est_borne_aussi(): void
    {
        $particulier = $this->client(['phone' => '+221770000099']);
        $bien = $this->bienDe(null, $particulier);

        $this->relais($particulier, $bien, '+221779990002');

        $this->assertSame(5, $this->smsVers('+221779990002'));
    }

    /** B2′ (R) — 5 par heure, 10 par jour : la deuxième heure en rend 5, la troisième aucun. */
    public function test_b2prime_dix_sms_par_jour_vers_un_meme_numero(): void
    {
        $this->personnel($this->x, 'agency_admin');
        $agent = $this->personnel($this->x);
        $bien = $this->bienDe($this->x);

        $id = $this->relais($agent, $bien, '+221779990003', deplacements: 5);
        $this->assertSame(5, $this->smsVers('+221779990003'));

        foreach ([10, 10] as $attendu) {
            $this->travel(61)->minutes();
            for ($i = 0; $i < 6; $i++) {
                $this->patchJson("/api/property-visits/{$id}", ['scheduled_at' => $this->creneau(jours: 10 + $i, heure: 11)])->assertOk();
            }
            $this->assertSame($attendu, $this->smsVers('+221779990003'));
        }

        // Un autre numéro n'est pas touché par la borne du premier.
        $this->postJson('/api/property-visits', [
            'property_id' => $bien->id, 'visitor_name' => 'Awa', 'visitor_phone' => '+221779990004',
            'scheduled_at' => $this->creneau(jours: 20),
        ])->assertCreated();
        $this->assertSame(1, $this->smsVers('+221779990004'));
    }

    /**
     * M3 (R) — un bailleur de X qui annule ou déplace la visite du bien d'un AUTRE bailleur ne
     * prévient pas le visiteur « au nom de l'agence ». (Le geste lui-même : voir le test suivant.)
     */
    public function test_m3_le_bailleur_tiers_ne_previent_pas_le_visiteur(): void
    {
        $b = $this->bailleur($this->x);
        $bienDeC = $this->bienDe($this->x, $this->bailleur($this->x));
        $visite = fn (string $phone) => PropertyVisit::factory()->create([
            'property_id' => $bienDeC->id, 'visitor_id' => null, 'visitor_phone' => $phone,
            'visitor_email' => null, 'status' => VisitStatus::Confirmed,
            'scheduled_at' => CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->setTime(10, 0)->utc(),
        ]);
        $annulee = $visite('+221771010101');
        $deplacee = $visite('+221771010102');

        Sanctum::actingAs($b);
        $this->postJson("/api/property-visits/{$annulee->id}/cancel", ['reason' => 'x']);
        $this->patchJson("/api/property-visits/{$deplacee->id}", ['scheduled_at' => $this->creneau(jours: 4)]);

        Notification::assertNothingSentTo(new AnonymousNotifiable);
    }

    /**
     * M3 — le geste lui-même est refusé (403). `PropertyVisitPolicy` lit encore
     * `$user->agency_id` (TCK-587) ; le contrôleur le refuse désormais lui-même (passe 2, écart b).
     */
    public function test_m3_le_bailleur_tiers_ne_peut_ni_annuler_ni_deplacer(): void
    {
        $b = $this->bailleur($this->x);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->x, $this->bailleur($this->x))->id,
            'visitor_id' => null, 'status' => VisitStatus::Confirmed,
        ]);

        Sanctum::actingAs($b);
        $this->postJson("/api/property-visits/{$visite->id}/cancel", ['reason' => 'x'])->assertForbidden();
        $this->patchJson("/api/property-visits/{$visite->id}", ['scheduled_at' => $this->creneau(jours: 4)])->assertForbidden();
    }

    /**
     * Passe 2, écart (b) — sur un bien d'agence, le bailleur PROPRIÉTAIRE lui-même n'annule ni ne
     * déplace : il n'est pas « l'agence » de la contrainte 4. La séquence N1 du vérificateur
     * s'arrête au premier `PATCH`. Le personnel, lui, garde le geste.
     */
    public function test_b_sur_un_bien_d_agence_seul_le_personnel_annule_ou_deplace(): void
    {
        $this->personnel($this->x, 'agency_admin');
        $bailleur = $this->bailleur($this->x);
        $bien = $this->bienDe($this->x, $bailleur);

        $id = $this->postJson("/api/public/properties/{$bien->slug}/visit-request", [
            'visitor_name' => 'Victime', 'visitor_phone' => '+221779990005', 'scheduled_at' => $this->creneau(),
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($bailleur);
        $this->patchJson("/api/property-visits/{$id}", ['scheduled_at' => $this->creneau(jours: 3)])->assertForbidden();
        $this->postJson("/api/property-visits/{$id}/cancel", ['reason' => 'x'])->assertForbidden();
        $this->deleteJson("/api/property-visits/{$id}")->assertForbidden();
        $this->assertSame(0, $this->smsVers('+221779990005'));
        $this->assertNotSame(VisitStatus::Cancelled, PropertyVisit::query()->findOrFail($id)->status);

        Sanctum::actingAs($this->personnel($this->x));
        $this->patchJson("/api/property-visits/{$id}", ['scheduled_at' => $this->creneau(jours: 3)])->assertOk();
        $this->postJson("/api/property-visits/{$id}/cancel", ['reason' => 'x'])->assertOk();
    }

    /** Écart (b) — sur un bien SANS agence, le propriétaire garde le geste, et le visiteur l'annulation de la sienne. */
    public function test_b_sur_un_bien_sans_agence_le_proprietaire_annule_et_deplace(): void
    {
        $particulier = $this->client();
        $bien = $this->bienDe(null, $particulier);
        $visiteur = $this->client();
        $visite = fn (int $jours) => PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => $visiteur->id, 'status' => VisitStatus::Confirmed,
            'scheduled_at' => $this->creneau(jours: $jours),
        ]);
        [$a, $b, $c] = [$visite(3), $visite(4), $visite(5)];

        Sanctum::actingAs($particulier);
        $this->patchJson("/api/property-visits/{$a->id}", ['scheduled_at' => $this->creneau(jours: 6)])->assertOk();
        $this->postJson("/api/property-visits/{$b->id}/cancel", ['reason' => 'x'])->assertOk();

        Sanctum::actingAs($visiteur);
        $this->postJson("/api/property-visits/{$c->id}/cancel", ['reason' => 'x'])->assertOk();
    }

    /**
     * Passe 2 (n2) — l'agent assigné est bloqué, le bien a un bailleur joignable : l'annulation et
     * le créneau proposé par le visiteur vont aux ADMINS actifs, comme pour une visite non
     * attribuée — pas au contact principal (sonde S4).
     */
    public function test_n2_le_repli_de_l_agent_injoignable_va_aux_admins(): void
    {
        $admin = $this->personnel($this->x, 'agency_admin');
        $agent = $this->personnel($this->x);
        $bailleur = $this->bailleur($this->x);
        $bien = $this->bienDe($this->x, $bailleur);
        $client = $this->client();
        $visite = fn (int $jours) => PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => $client->id, 'agent_id' => $agent->id,
            'status' => VisitStatus::Confirmed, 'scheduled_at' => $this->creneau(jours: $jours),
        ]);
        [$annulee, $deplacee] = [$visite(3), $visite(4)];
        $agent->update(['status' => UserStatus::Blocked]);

        Sanctum::actingAs($client);
        $this->postJson("/api/property-visits/{$annulee->id}/cancel")->assertOk();
        $this->postJson("/api/property-visits/{$deplacee->id}/reschedule", ['scheduled_at' => $this->creneau(jours: 5, heure: 11)])->assertOk();

        Notification::assertSentTo($admin, VisitCancelledNotification::class);
        Notification::assertSentTo($admin, VisitRescheduledNotification::class);
        Notification::assertNotSentTo($bailleur, VisitCancelledNotification::class);
        Notification::assertNotSentTo($bailleur, VisitRescheduledNotification::class);
        Notification::assertNotSentTo($agent, VisitCancelledNotification::class);
    }

    /** M4 (R) — un agent SUSPENDU n'est ni attribuable, ni preneur. */
    public function test_m4_un_agent_suspendu_n_est_pas_du_personnel(): void
    {
        $admin = $this->personnel($this->x, 'agency_admin');
        $suspendu = $this->personnel($this->x);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $bien = $this->bienDe($this->x);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $bien->id, 'visitor_id' => $this->client()->id, 'agent_id' => null, 'status' => VisitStatus::Scheduled,
        ]);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/property-visits/{$visite->id}", ['agent_id' => $suspendu->id])
            ->assertUnprocessable()->assertJsonValidationErrors(['agent_id']);

        Sanctum::actingAs($suspendu->fresh());
        $this->postJson("/api/property-visits/{$visite->id}/claim")->assertForbidden();
        $this->assertNull($visite->fresh()->agent_id);
    }

    /** m5 — `duration_minutes` plafonné à 240, comme sur la route publique. */
    public function test_m5_la_duree_est_plafonnee(): void
    {
        Sanctum::actingAs($this->personnel($this->x));

        $this->postJson('/api/property-visits', [
            'property_id' => $this->bienDe($this->x)->id, 'visitor_name' => 'Awa', 'visitor_phone' => '+221771234567',
            'scheduled_at' => $this->creneau(), 'duration_minutes' => 100000,
        ])->assertUnprocessable()->assertJsonValidationErrors(['duration_minutes']);
    }

    /** Le personnel légitime n'a rien perdu : il planifie, la visite naît confirmée, le client est prévenu. */
    public function test_le_personnel_planifie_toujours(): void
    {
        $agent = $this->personnel($this->x);
        Sanctum::actingAs($agent);

        $this->postJson('/api/property-visits', [
            'property_id' => $this->bienDe($this->x)->id, 'visitor_name' => 'Awa', 'visitor_phone' => '+221771234567',
            'scheduled_at' => $this->creneau(), 'duration_minutes' => 240,
        ])->assertCreated()->assertJsonPath('data.status', VisitStatus::Confirmed->value);

        Notification::assertSentOnDemand(VisitConfirmedNotification::class);
        $this->assertInstanceOf(User::class, $agent);
    }
}
