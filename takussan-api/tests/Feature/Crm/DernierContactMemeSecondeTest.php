<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\LastContactChannel;
use App\Models\Enums\VisitStatus;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Crm\ContactGestureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\FabriqueDemandesEtVisites;

/**
 * TCK-2784 — deux contacts dans la même seconde ne perdent plus leur ordre :
 * `customers.last_contacted_at` est un `timestamp(6)`, et `ContactGestureService::touchCustomer()`
 * lie l'instant à la microseconde, en garde comme en valeur écrite. L'un sans l'autre ne corrige
 * rien (AC5) :
 *
 *   · colonne à la seconde : PostgreSQL ARRONDIT (12:00:00.600 devient 12:00:01), et le contact de
 *     12:00:00.900 se voit refusé par la garde `last_contacted_at < $at` ;
 *   · valeur liée à la seconde (`Grammar::getDateFormat()`) : les deux contacts arrivent en
 *     12:00:00, et le second ne passe pas la garde.
 *
 * L'instant se lit par `to_char(…, 'US')` : PostgreSQL supprime les zéros de queue à l'affichage
 * (`12:00:00.7`), et la comparaison de chaînes doit porter sur six chiffres.
 */
class DernierContactMemeSecondeTest extends ApiTestCase
{
    use FabriqueDemandesEtVisites;
    use RefreshDatabase;

    private const MIGRATION = 'migrations/2026_11_14_120000_change_last_contacted_at_precision_on_customers.php';

    private Agency $agence;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $this->agence = $this->agence();
        $this->agent = $this->personnel($this->agence);
    }

    private function fiche(?string $dernierContact = null): Customer
    {
        $fiche = $this->ficheClient($this->agence, $this->client(), ['added_by_id' => $this->agent->id]);
        $fiche->forceFill([
            'last_contacted_at' => $dernierContact !== null ? Carbon::parse($dernierContact) : null,
            'last_contact_channel' => null,
        ])->saveQuietly();

        return $fiche;
    }

    /** @return array{0: ?string, 1: ?string} l'instant (six chiffres de microseconde) et le canal, lus sur la LIGNE */
    private function ligne(Customer $fiche): array
    {
        $l = DB::selectOne(
            "SELECT to_char(last_contacted_at, 'YYYY-MM-DD HH24:MI:SS.US') AS a, last_contact_channel AS c FROM customers WHERE id = ?",
            [$fiche->id],
        );

        return [$l->a, $l->c];
    }

    private function precision(): ?int
    {
        $p = DB::table('information_schema.columns')
            ->whereRaw('table_schema = current_schema()')
            ->where('table_name', 'customers')
            ->where('column_name', 'last_contacted_at')
            ->value('datetime_precision');

        return $p === null ? null : (int) $p;
    }

    private function toucher(Customer|int $fiche, LastContactChannel $canal, string $instant): void
    {
        app(ContactGestureService::class)->touchCustomer($fiche, $canal, Carbon::parse($instant));
    }

    /** AC1 — 12:00:00.200 `call` puis 12:00:00.700 `whatsapp` : le second gagne, à la microseconde. */
    public function test_ac1_le_second_contact_de_la_meme_seconde_gagne(): void
    {
        $fiche = $this->fiche();

        $this->toucher((int) $fiche->id, LastContactChannel::Call, '2026-11-10 12:00:00.200');
        $this->toucher((int) $fiche->id, LastContactChannel::Whatsapp, '2026-11-10 12:00:00.700');

        $this->assertSame(['2026-11-10 12:00:00.700000', 'whatsapp'], $this->ligne($fiche), 'précision de la colonne : '.var_export($this->precision(), true));
        // La lecture par le modèle tolère la fraction (`asDateTime` retombe sur `parse`).
        $this->assertSame('2026-11-10 12:00:00.700000', $fiche->fresh()->last_contacted_at->format('Y-m-d H:i:s.u'));
    }

    /**
     * AC1 bis (AC5, ablation « liaison seule ») — 12:00:00.600 `call` puis 12:00:00.900 `whatsapp`.
     * Sur une colonne à la seconde, le premier est ARRONDI à 12:00:01 et refuse le second : c'est le
     * canal lui-même qui rougit, pas seulement l'instant.
     */
    public function test_ac1_l_arrondi_de_la_colonne_ne_refuse_plus_le_second(): void
    {
        $fiche = $this->fiche();

        $this->toucher((int) $fiche->id, LastContactChannel::Call, '2026-11-10 12:00:00.600');
        $this->toucher((int) $fiche->id, LastContactChannel::Whatsapp, '2026-11-10 12:00:00.900');

        $this->assertSame(['2026-11-10 12:00:00.900000', 'whatsapp'], $this->ligne($fiche), 'précision de la colonne : '.var_export($this->precision(), true));
    }

    /** AC2 — le plus récent écrit d'abord : le plus ancien ne déplace ni l'instant ni le canal, sur la ligne comme sur l'instance. */
    public function test_ac2_le_plus_ancien_ecrit_apres_ne_deplace_rien(): void
    {
        $fiche = $this->fiche();

        $this->toucher($fiche, LastContactChannel::Whatsapp, '2026-11-10 12:00:00.700');
        $this->toucher($fiche, LastContactChannel::Call, '2026-11-10 12:00:00.200');

        $this->assertSame(['2026-11-10 12:00:00.700000', 'whatsapp'], $this->ligne($fiche));
        $this->assertSame('2026-11-10 12:00:00.700000', $fiche->last_contacted_at->format('Y-m-d H:i:s.u'));
        $this->assertSame(LastContactChannel::Whatsapp, $fiche->last_contact_channel);
        $this->assertFalse($fiche->isDirty(['last_contacted_at', 'last_contact_channel']));
    }

    /** AC1 sur l'instance : le miroir en mémoire suit la ligne, microseconde comprise. */
    public function test_l_instance_suit_la_ligne_dans_l_ordre_naturel(): void
    {
        $fiche = $this->fiche();

        $this->toucher($fiche, LastContactChannel::Call, '2026-11-10 12:00:00.200');
        $this->toucher($fiche, LastContactChannel::Whatsapp, '2026-11-10 12:00:00.700');

        $this->assertSame(['2026-11-10 12:00:00.700000', 'whatsapp'], $this->ligne($fiche));
        $this->assertSame('2026-11-10 12:00:00.700000', $fiche->last_contacted_at->format('Y-m-d H:i:s.u'));
        $this->assertSame(LastContactChannel::Whatsapp, $fiche->last_contact_channel);
    }

    /**
     * AC3 — `datetime_precision` vaut 6 après `up()`, 0 après `down()`, et l'index
     * `customers_agency_last_contacted_idx` traverse l'aller-retour à l'identique. Le DDL de PostgreSQL
     * est transactionnel : l'aller-retour se défait avec le test.
     */
    public function test_ac3_la_precision_va_et_vient_et_l_index_survit(): void
    {
        $index = fn (): ?string => DB::table('pg_indexes')
            ->whereRaw('schemaname = current_schema()')
            ->where('indexname', 'customers_agency_last_contacted_idx')
            ->value('indexdef');

        $migration = require database_path(self::MIGRATION);
        $avant = $index();
        $this->assertNotNull($avant);
        $this->assertSame(6, $this->precision());

        $migration->down();
        $this->assertSame(0, $this->precision());
        $this->assertSame($avant, $index());

        $migration->up();
        $this->assertSame(6, $this->precision());
        $this->assertSame($avant, $index());
    }

    /** AC4 — `sort=last_contacted_at` rend, sur des fiches à la seconde, le même ordre avant et après la migration. */
    public function test_ac4_le_tri_garde_son_ordre_sur_des_donnees_a_la_seconde(): void
    {
        $f1 = $this->fiche('2026-11-09 10:00:02');
        $f2 = $this->fiche('2026-11-09 10:00:01');
        $f3 = $this->fiche(null);
        $f4 = $this->fiche('2026-11-08 18:30:00');

        Sanctum::actingAs($this->agent);
        $ids = fn (string $tri): array => collect(
            $this->getJson("/api/customers?fields[customers]=id&per_page=100&sort={$tri}")->assertOk()->json('data')
        )->pluck('id')->map(fn ($id) => (int) $id)->all();

        $migration = require database_path(self::MIGRATION);
        $migration->down();
        $this->assertSame(0, $this->precision());
        $avant = ['asc' => $ids('last_contacted_at'), 'desc' => $ids('-last_contacted_at')];
        $this->assertSame([$f4->id, $f2->id, $f1->id, $f3->id], $avant['asc']);

        $migration->up();
        $this->assertSame(6, $this->precision());
        $this->assertSame($avant, ['asc' => $ids('last_contacted_at'), 'desc' => $ids('-last_contacted_at')]);
    }

    /**
     * Recensement des écrivains — une note écrite à 12:00:00.800 après un appel à 12:00:00.300 est le
     * dernier contact. `CustomerNoteController` passait `$note->created_at`, déjà au format de la
     * seconde : la note arrivait en 12:00:00 et perdait contre l'appel.
     */
    public function test_une_note_apres_un_appel_de_la_meme_seconde_garde_l_ordre(): void
    {
        $fiche = $this->fiche();
        $this->toucher((int) $fiche->id, LastContactChannel::Call, '2026-11-10 12:00:00.300');

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00.800'));
        $this->postJson("/api/customers/{$fiche->id}/notes", ['body' => 'Rappelé, rappellera lundi.'])->assertCreated();

        $this->assertSame(['2026-11-10 12:00:00.800000', 'note'], $this->ligne($fiche));
    }

    /** Même chose pour la visite terminée : `$visit->completed_at` relu du modèle était tronqué à la seconde. */
    public function test_une_visite_terminee_apres_un_appel_de_la_meme_seconde_garde_l_ordre(): void
    {
        $fiche = $this->fiche();
        $visite = PropertyVisit::factory()->create([
            'property_id' => $this->bienDe($this->agence)->id,
            'visitor_id' => $fiche->user_id,
            'customer_id' => $fiche->id,
            'agent_id' => $this->agent->id,
            'status' => VisitStatus::Confirmed,
            'scheduled_at' => Carbon::parse('2026-11-10 11:00:00'),
        ]);
        $this->toucher((int) $fiche->id, LastContactChannel::Call, '2026-11-10 12:00:00.300');

        Sanctum::actingAs($this->agent);
        $this->travelTo(Carbon::parse('2026-11-10 12:00:00.800'));
        $this->postJson("/api/property-visits/{$visite->id}/complete")->assertOk();

        $this->assertSame(['2026-11-10 12:00:00.800000', 'visit'], $this->ligne($fiche));
    }
}
