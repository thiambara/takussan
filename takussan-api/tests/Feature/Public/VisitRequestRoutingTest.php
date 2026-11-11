<?php

namespace Tests\Feature\Public;

use App\Domain\Notifications\NotificationCode;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyVisit;
use App\Notifications\CodedNotification;
use App\Services\Notifications\NotificationRenderer;
use App\Services\Visit\VisitSchedulingService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\Support\EnvoisParCode;
use Tests\Support\FabriqueDemandesEtVisites;
use Tests\TestCase;

/**
 * TCK-590 — la demande de visite déposée sur le site public arrive chez quelqu'un.
 *
 * `PublicPropertyController::visitRequest` faisait un `PropertyVisit::create` direct : ni agent,
 * ni notification, ni quota, ni fiche client. C'était pourtant le chemin de tous les clients.
 */
class VisitRequestRoutingTest extends TestCase
{
    use EnvoisParCode;
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private function demander(string $slug, array $payload = []): TestResponse
    {
        return $this->postJson("/api/public/properties/{$slug}/visit-request", $payload + [
            'scheduled_at' => $this->creneau(),
        ]);
    }

    /** AC1 (R) — l'agent principal devient l'agent de la visite ; lui et le propriétaire sont prévenus. */
    public function test_la_demande_va_a_l_agent_principal_et_au_proprietaire(): void
    {
        Notification::fake();
        $x = $this->agence();
        $owner = $this->bailleur($x);
        $agentA = $this->personnel($x);
        $bien = $this->bienDe($x, $owner);
        $this->collaborateur($bien, $agentA);

        Sanctum::actingAs($this->client());
        $id = $this->demander($bien->slug)->assertCreated()->json('data.id');

        $this->assertSame($agentA->id, PropertyVisit::query()->findOrFail($id)->agent_id);
        Notification::assertSentTo($agentA, CodedNotification::class, self::deCode(NotificationCode::VisitRequested));
        Notification::assertSentTo($owner, CodedNotification::class, self::deCode(NotificationCode::VisitRequested));
    }

    /** AC2 (R) — la 4ᵉ demande active sur le même bien est refusée par la route publique aussi. */
    public function test_la_quatrieme_demande_active_est_refusee(): void
    {
        $bien = $this->bienDe($this->agence());
        Sanctum::actingAs($this->client());

        foreach ([10, 11, 14] as $heure) {
            $this->demander($bien->slug, ['scheduled_at' => $this->creneau(heure: $heure)])->assertCreated();
        }
        $this->demander($bien->slug, ['scheduled_at' => $this->creneau(heure: 15)])->assertUnprocessable();
        $this->assertSame(3, PropertyVisit::query()->count());
    }

    /** AC2b (R) — la fiche client rattachée est celle de l'agence DU BIEN, jamais une autre. */
    public function test_la_fiche_client_est_celle_de_l_agence_du_bien(): void
    {
        $x = $this->agence();
        $y = $this->agence();
        $client = $this->client();
        $this->ficheClient($y, $client);
        $ficheX = $this->ficheClient($x, $client);
        $bienX = $this->bienDe($x);

        Sanctum::actingAs($client);
        $id = $this->demander($bienX->slug)->assertCreated()->json('data.id');
        $this->assertSame($ficheX->id, PropertyVisit::query()->findOrFail($id)->customer_id);

        $seulementY = $this->client();
        $this->ficheClient($y, $seulementY);
        Sanctum::actingAs($seulementY);
        $id = $this->demander($bienX->slug)->assertCreated()->json('data.id');
        $this->assertNull(PropertyVisit::query()->findOrFail($id)->customer_id);
    }

    /**
     * AC3 — sans compte : nom + téléphone suffisent ; le téléphone est ramené à E.164 puis doit
     * être joignable. Le format national sénégalais est NORMALISÉ, plus refusé (relevé de
     * TCK-588 : enregistré tel quel, il privait le visiteur de son rappel).
     */
    public function test_anonyme_nom_et_telephone_suffisent(): void
    {
        $bien = $this->bienDe($this->agence());

        $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567'])
            ->assertCreated();
        $id = $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '77 123 45 67', 'scheduled_at' => $this->creneau(heure: 11)])
            ->assertCreated()->json('data.id');
        $this->assertSame('+221771234567', PropertyVisit::query()->findOrFail($id)->visitor_phone);
        $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '77 123 45', 'scheduled_at' => $this->creneau(heure: 12)])
            ->assertUnprocessable()->assertJsonValidationErrors(['visitor_phone']);
        $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'scheduled_at' => $this->creneau(heure: 11)])
            ->assertUnprocessable()->assertJsonValidationErrors(['visitor_phone']);
    }

    /** AC9 — le dépôt d'une demande n'envoie AUCUN SMS, à personne. */
    public function test_le_depot_n_envoie_aucun_sms(): void
    {
        Notification::fake();
        $x = $this->agence();
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x);
        $this->collaborateur($bien, $agent);

        $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567'])->assertCreated();

        Notification::assertSentTo($agent, CodedNotification::class, fn ($n, array $channels) => $n->code === NotificationCode::VisitRequested && ! in_array('sms', $channels, true));
        Notification::assertNothingSentTo(new AnonymousNotifiable);

        $canaux = collect(Notification::sentNotifications())->flatten(3)->pluck('channels')->flatten();
        $this->assertNotEmpty($canaux);
        $this->assertNotContains('sms', $canaux->all());

        // Vérification adverse (m4) — le drapeau lui-même : adressée à un numéro, la notification
        // de DÉPÔT ne prend jamais le canal SMS. Sans cette ligne, rendre le code mobile
        // (`NotificationCode::mobile()`) laissait le test vert (le dépôt ne s'adresse simplement
        // jamais au visiteur).
        $this->assertFalse(NotificationCode::VisitRequested->mobile());
        $this->assertNotContains('sms', (new CodedNotification(NotificationCode::VisitRequested, []))->via(Notification::route('sms', '+221771234567')));
    }

    /** AC10 (serveur) — une heure hors de la grille de Dakar est refusée. */
    public function test_une_heure_hors_grille_est_refusee(): void
    {
        $bien = $this->bienDe($this->agence());
        Sanctum::actingAs($this->client());

        $this->demander($bien->slug, ['scheduled_at' => $this->creneau(heure: 7, minute: 30)])
            ->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);
        $this->demander($bien->slug, ['scheduled_at' => $this->creneau(heure: 10, minute: 15)])
            ->assertUnprocessable()->assertJsonValidationErrors(['scheduled_at']);
        $this->demander($bien->slug, ['scheduled_at' => $this->creneau(heure: 18, minute: 30)])
            ->assertCreated();
    }

    /**
     * AC18 (R) — propriétaire parti, bien d'agence sans collaborateur : les admins sont prévenus de
     * la demande de visite. Bien sans agence et sans personne : 409, rien d'enregistré.
     */
    public function test_proprietaire_parti_les_admins_sont_prevenus(): void
    {
        Notification::fake();
        $x = $this->agence();
        $admin = $this->personnel($x, 'agency_admin');
        $owner = $this->bailleur($x);
        $bien = $this->bienDe($x, $owner);
        $sansAgence = $this->bienDe(null, $owner);

        // TCK-600 — `DELETE /api/auth/account` (effacement immédiat) n'existe plus : le compte parti
        // est supprimé en douceur directement, SANS `ErasedAccountListings` (qui dépublierait le
        // bien et rendrait sans objet ce que ce test éprouve, le repli de la demande).
        $owner->delete();

        $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567'])->assertCreated();
        Notification::assertSentTo($admin, CodedNotification::class, self::deCode(NotificationCode::VisitRequested));

        $this->demander($sansAgence->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567'])
            ->assertStatus(409)->assertJsonPath('code', 'lead.contact_unavailable');
        $this->assertSame(0, PropertyVisit::query()->where('property_id', $sansAgence->id)->count());
    }

    /**
     * Le `contact` de l'avis « visite demandée » reçu par ce destinataire (TCK-2717). Lève si l'avis
     * n'a pas été reçu, ou en double.
     */
    private function contactRecuPar(object $destinataire): ?string
    {
        $avis = Notification::sent($destinataire, CodedNotification::class, self::deCode(NotificationCode::VisitRequested, NotificationCode::VisitRequestedWindow));
        $this->assertCount(1, $avis);

        return $avis->first()->params['contact'];
    }

    /**
     * TCK-2717 AC5 (décision du porteur du 2026-11-11, option a) — un compte déjà fiché dans X demande
     * une visite publique : la visite naît AVEC la fiche, et l'écran cache son contact au bailleur
     * reconnu. L'avis aussi : celui du bailleur n'a pas de `contact`, ni le numéro ailleurs dans ses
     * paramètres ; celui de l'agent de X (l'agent principal du bien, seul prévenu du personnel) l'a.
     */
    public function test_tck2717_ac5_le_bailleur_ne_recoit_pas_le_contact_d_un_visiteur_fiche(): void
    {
        Notification::fake();
        $x = $this->agence();
        $owner = $this->bailleur($x);
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x, $owner);
        $this->collaborateur($bien, $agent);
        $client = $this->client(['phone' => '+221776665544', 'email' => 'fiche@exemple.sn']);
        $fiche = $this->ficheClient($x, $client);

        Sanctum::actingAs($client);
        $id = $this->demander($bien->slug)->assertCreated()->json('data.id');
        $visite = PropertyVisit::query()->findOrFail($id);
        $this->assertSame($fiche->id, $visite->customer_id, 'prémisse : la visite naît avec la fiche');
        $this->assertNotNull($visite->visitor_phone ?? $visite->visitor_email, 'prémisse : la visite porte un contact');

        $this->assertNull($this->contactRecuPar($owner));
        $avisDuBailleur = Notification::sent($owner, CodedNotification::class, self::deCode(NotificationCode::VisitRequested, NotificationCode::VisitRequestedWindow))->first();
        $this->assertStringNotContainsString('776665544', json_encode($avisDuBailleur->params));
        $this->assertStringNotContainsString('fiche@exemple.sn', json_encode($avisDuBailleur->params));
        // La phrase sans contact (`body_unnamed`, `mail_body_unnamed`), jamais « Pour joindre le visiteur : — ».
        $rendu = app(NotificationRenderer::class);
        foreach (['fr', 'en', 'wo'] as $langue) {
            foreach (['body', 'mail_body'] as $surface) {
                $texte = $rendu->render($avisDuBailleur->code, $avisDuBailleur->params, $langue, null, $surface);
                $this->assertStringNotContainsString('—.', $texte, "{$langue} {$surface}");
                $this->assertStringNotContainsString(':contact', $texte, "{$langue} {$surface}");
            }
        }
        $this->assertStringNotContainsString('joindre', $rendu->render($avisDuBailleur->code, $avisDuBailleur->params, 'fr', null, 'body'));
        $this->assertNotNull($this->contactRecuPar($agent));
        $this->assertStringContainsString('776665544', $this->contactRecuPar($agent));
    }

    /**
     * Vérification de TCK-2717 (m2) — AC5 sur l'AUTRE code, `visit.requested_window` (une demande par
     * tranche, l'heure à fixer) : l'avis du bailleur n'a pas de `contact`, et ses deux corps se rendent
     * sous `body_unnamed` / `mail_body_unnamed` dans les trois langues — ni « — », ni `:contact`, ni la
     * mention de joindre le visiteur. Celui de l'agent porte le numéro et la phrase complète.
     */
    public function test_tck2717_ac5_par_tranche_le_bailleur_lit_la_phrase_sans_contact(): void
    {
        Notification::fake();
        $x = $this->agence();
        $owner = $this->bailleur($x);
        $agent = $this->personnel($x);
        $bien = $this->bienDe($x, $owner);
        $this->collaborateur($bien, $agent);
        $client = $this->client(['phone' => '+221776665544', 'email' => 'fiche@exemple.sn']);
        $this->ficheClient($x, $client);

        Sanctum::actingAs($client);
        $jour = CarbonImmutable::now(VisitSchedulingService::TIMEZONE)->addDays(3)->format('Y-m-d');
        $this->demander($bien->slug, ['scheduled_at' => null, 'date' => $jour, 'preferred_window' => 'morning'])->assertCreated();

        $avisDuBailleur = Notification::sent($owner, CodedNotification::class, self::deCode(NotificationCode::VisitRequestedWindow))->first();
        $this->assertNotNull($avisDuBailleur, 'prémisse : la demande par tranche rend visit.requested_window');
        $this->assertNull($avisDuBailleur->params['contact']);
        $rendu = app(NotificationRenderer::class);
        $phrases = ['fr' => 'joindre', 'en' => 'reach', 'wo' => 'joindre'];
        foreach ($phrases as $langue => $joindre) {
            foreach (['body', 'mail_body'] as $surface) {
                $texte = $rendu->render($avisDuBailleur->code, $avisDuBailleur->params, $langue, null, $surface);
                $this->assertStringNotContainsString('—.', $texte, "{$langue} {$surface}");
                $this->assertStringNotContainsString(':contact', $texte, "{$langue} {$surface}");
                $this->assertStringNotContainsString($joindre, $texte, "{$langue} {$surface}");
                $this->assertStringNotContainsString('776665544', $texte, "{$langue} {$surface}");
            }
        }

        $avisDeLAgent = Notification::sent($agent, CodedNotification::class, self::deCode(NotificationCode::VisitRequestedWindow))->first();
        $this->assertStringContainsString('776665544', (string) $avisDeLAgent->params['contact']);
        $this->assertStringContainsString('776665544', $rendu->render($avisDeLAgent->code, $avisDeLAgent->params, 'fr', null, 'body'));
    }

    /** TCK-2717 AC6 — demande anonyme, sans fiche : l'avis du bailleur reconnu porte le contact, comme aujourd'hui. */
    public function test_tck2717_ac6_le_bailleur_recoit_le_contact_d_un_visiteur_sans_fiche(): void
    {
        Notification::fake();
        $x = $this->agence();
        $owner = $this->bailleur($x);
        $bien = $this->bienDe($x, $owner);

        $this->demander($bien->slug, ['visitor_name' => 'Awa Diop', 'visitor_phone' => '+221771234567'])->assertCreated();

        $this->assertSame('+221771234567', $this->contactRecuPar($owner));
        $avis = Notification::sent($owner, CodedNotification::class, self::deCode(NotificationCode::VisitRequested, NotificationCode::VisitRequestedWindow))->first();
        $this->assertStringContainsString('Pour joindre le visiteur : +221771234567', app(NotificationRenderer::class)->render($avis->code, $avis->params, 'fr', null, 'body'));
    }

    /**
     * TCK-2717 — le propriétaire qui est AUSSI personnel actif de l'agence du bien est de la console :
     * il reçoit le contact du visiteur fiché, comme il le lit (le jugement porte sur l'agence du bien,
     * pas sur l'espace ouvert).
     */
    public function test_tck2717_le_proprietaire_personnel_de_l_agence_garde_le_contact(): void
    {
        Notification::fake();
        $x = $this->agence();
        $owner = $this->bailleur($x);
        AgentProfile::factory()->create(['user_id' => $owner->id, 'agency_id' => $x->id]);
        $bien = $this->bienDe($x, $owner->fresh());
        $client = $this->client(['phone' => '+221776665544']);
        $this->ficheClient($x, $client);

        Sanctum::actingAs($client);
        $this->demander($bien->slug)->assertCreated();

        $this->assertStringContainsString('776665544', (string) $this->contactRecuPar($owner));
    }
}
