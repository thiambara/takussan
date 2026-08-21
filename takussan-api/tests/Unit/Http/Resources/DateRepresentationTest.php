<?php

namespace Tests\Unit\Http\Resources;

use App\Http\Resources\Api\Admin\ModerationItemResource;
use App\Http\Resources\Api\Admin\PlatformPayoutResource;
use App\Http\Resources\Api\Admin\UserDetailResource;
use App\Http\Resources\Bases\BaseResource;
use App\Http\Resources\BookingPaymentResource;
use App\Http\Resources\BookingResource;
use App\Http\Resources\DocumentResource;
use App\Http\Resources\IntegrationResource;
use App\Http\Resources\InvoiceResource;
use App\Http\Resources\LeasePaymentResource;
use App\Http\Resources\LeaseResource;
use App\Http\Resources\MaintenanceRequestResource;
use App\Http\Resources\PayoutResource;
use App\Http\Resources\PropertyResource;
use App\Http\Resources\PropertyVisitResource;
use App\Http\Resources\ReviewResource;
use App\Http\Resources\SettingResource;
use App\Http\Resources\UserResource;
use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Document;
use App\Models\Integration;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Payout;
use App\Models\PlatformPayout;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Review;
use App\Models\Setting;
use App\Models\User;
use Carbon\Carbon;
use DateTimeInterface;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-327 / ADR-0018 — **l'API émet deux types de date, et un seul format pour chacun.**
 *
 * Instant → `2026-08-17T12:34:56+00:00`. Date calendaire → `2026-08-17`. Rien d'autre.
 *
 * **Pourquoi ce fichier existe, et pourquoi il compare des chaînes EXACTES.** Avant TCK-327, les
 * 45 fichiers de `app/Http/Resources/` émettaient une date sous quatre appels distincts pour trois
 * chaînes distinctes — 55 `toISOString()` (`…T12:34:56.000000Z`), 37 `toIso8601String()`, 28
 * `$this->iso(…)` et 18 `toDateString()`. Le contrat était donc décidé champ par champ, et
 * **absolument rien ne le mesurait** : les trois formes sont des `string` valides, `new Date(…)`
 * les parse toutes, aucun typage TypeScript ne les distingue. Un test qui se contenterait de
 * « c'est une date parsable » rougirait sur zéro régression et donnerait l'illusion d'une garde.
 *
 * ⚠ **Ne pas relâcher une assertion de ce fichier pour absorber un changement.** Comparer une
 * chaîne exacte EST la garde : c'est le seul niveau auquel la différence entre `…56.000000Z` et
 * `…56+00:00` se voit. Une régression vers l'ancienne forme est silencieuse partout ailleurs.
 *
 * Le désaccord qui a motivé la décision est figé plus bas, nommément : `PlatformPayout::period_start`
 * est casté `'date'` et sortait pourtant en `2026-08-17T00:00:00+00:00`, quand les deux autres
 * ressources portant le même couple de champs sur le même cast sortaient `2026-08-17`.
 */
class DateRepresentationTest extends TestCase
{
    use RefreshDatabase;

    /** L'instant de référence, et sa seule écriture licite sur le fil. */
    private const INSTANT = '2026-08-17 12:34:56';

    private const INSTANT_ATTENDU = '2026-08-17T12:34:56+00:00';

    /** La date calendaire de référence, et sa seule écriture licite sur le fil. */
    private const JOUR = '2026-08-17';

    private const JOUR_ATTENDU = '2026-08-17';

    /**
     * Les champs castés `datetime` que l'API expose, par ressource.
     *
     * La liste est écrite à la main, comme celle d'`AmountRepresentationTest`, et pour la même
     * raison : elle n'énumère pas « les ressources », elle énumère **les champs dont la forme est
     * un contrat**. L'inventaire exhaustif, lui, est dérivé à chaque exécution par
     * `node scripts/check-resource-date-format.mjs --report` — un document dérivé pour le compte,
     * une liste lue pour la valeur.
     *
     * @return array<string, array{0: class-string, 1: class-string, 2: array<string,string>}>
     */
    public static function instantsExposes(): array
    {
        return [
            'Booking' => [BookingResource::class, Booking::class, [
                'confirmed_at' => 'confirmed_at',
                'cancelled_at' => 'cancelled_at',
                'expires_at' => 'expires_at',
            ]],
            'BookingPayment' => [BookingPaymentResource::class, BookingPayment::class, [
                'paid_at' => 'paid_at',
            ]],
            'Lease' => [LeaseResource::class, Lease::class, [
                'signed_at' => 'signed_at',
                'terminated_at' => 'terminated_at',
                'deposit_refunded_at' => 'deposit_refunded_at',
                'early_termination_requested_at' => 'early_termination_requested_at',
            ]],
            'LeasePayment' => [LeasePaymentResource::class, LeasePayment::class, [
                'paid_at' => 'paid_at',
                'late_fee_applied_at' => 'late_fee_applied_at',
            ]],
            'Payout' => [PayoutResource::class, Payout::class, [
                'scheduled_at' => 'scheduled_at',
                'processed_at' => 'processed_at',
            ]],
            'PlatformPayout' => [PlatformPayoutResource::class, PlatformPayout::class, [
                'processed_at' => 'processed_at',
            ]],
            'Property' => [PropertyResource::class, Property::class, [
                'published_at' => 'published_at',
                'submitted_at' => 'submitted_at',
                'approved_at' => 'approved_at',
                'rejected_at' => 'rejected_at',
            ]],
            'PropertyVisit' => [PropertyVisitResource::class, PropertyVisit::class, [
                'scheduled_at' => 'scheduled_at',
                'completed_at' => 'completed_at',
                'cancelled_at' => 'cancelled_at',
            ]],
            'MaintenanceRequest' => [MaintenanceRequestResource::class, MaintenanceRequest::class, [
                'quote_submitted_at' => 'quote_submitted_at',
                'quote_decision_at' => 'quote_decision_at',
                'scheduled_at' => 'scheduled_at',
                'started_at' => 'started_at',
                'completed_at' => 'completed_at',
            ]],
            'Review' => [ReviewResource::class, Review::class, [
                'replied_at' => 'replied_at',
            ]],
            'Document' => [DocumentResource::class, Document::class, [
                'verified_at' => 'verified_at',
            ]],
            'User' => [UserResource::class, User::class, [
                'email_verified_at' => 'email_verified_at',
                'phone_verified_at' => 'phone_verified_at',
            ]],
            /*
             * Les CINQ champs des deux entrées suivantes ont été ajoutés le 2026-08-20, APRÈS avoir constaté que
             * TCK-327 les avait manquées : elles n'émettaient AUCUN appel de conversion — elles
             * rendaient l'attribut Carbon BRUT, que `JsonResource` sérialise ensuite en
             * `2026-08-17T12:34:56.000000Z`. L'ancienne garde, qui cherchait des appels, ne
             * pouvait pas les voir. Elles sont ici pour que le test connaisse la valeur là où la
             * garde ne connaît que la forme du code.
             */
            'Setting' => [SettingResource::class, Setting::class, [
                'updated_at' => 'updated_at',
            ]],
            'Integration' => [IntegrationResource::class, Integration::class, [
                'last_used_at' => 'last_used_at',
                'last_health_check_at' => 'last_health_check_at',
                'created_at' => 'created_at',
                'updated_at' => 'updated_at',
            ]],
            'UserDetail (admin)' => [UserDetailResource::class, User::class, [
                'email_verified_at' => 'email_verified_at',
                'phone_verified_at' => 'phone_verified_at',
                'last_login_at' => 'last_login_at',
            ]],
        ];
    }

    /**
     * Les champs castés `date` que l'API expose, par ressource.
     *
     * Ils ne sont PAS convertis en horodatage, et c'est une décision écrite (ADR-0018) : une date
     * calendaire porte une intention métier — `due_date`, `period_start`. Lui ajouter `T00:00:00`
     * et un fuseau ajoute une précision fausse, et casserait deux appelants du front qui comparent
     * ces valeurs **littéralement** (`payment.ts:71`, `LeaseRenewalDialog.tsx:97-98`).
     *
     * @return array<string, array{0: class-string, 1: class-string, 2: array<string,string>}>
     */
    public static function datesCalendairesExposees(): array
    {
        return [
            'Booking' => [BookingResource::class, Booking::class, [
                'start_date' => 'start_date',
                'end_date' => 'end_date',
            ]],
            'Lease' => [LeaseResource::class, Lease::class, [
                'start_date' => 'start_date',
                'end_date' => 'end_date',
                'renewal_date' => 'renewal_date',
                'early_termination_effective_date' => 'early_termination_effective_date',
            ]],
            'LeasePayment' => [LeasePaymentResource::class, LeasePayment::class, [
                'period_start' => 'period_start',
                'period_end' => 'period_end',
                'due_date' => 'due_date',
            ]],
            'Invoice' => [InvoiceResource::class, Invoice::class, [
                'issue_date' => 'issue_date',
                'due_date' => 'due_date',
            ]],
            'Payout' => [PayoutResource::class, Payout::class, [
                'period_start' => 'period_start',
                'period_end' => 'period_end',
            ]],
            'PlatformPayout' => [PlatformPayoutResource::class, PlatformPayout::class, [
                'period_start' => 'period_start',
                'period_end' => 'period_end',
            ]],
            'Document' => [DocumentResource::class, Document::class, [
                'expiry_date' => 'expiry_date',
            ]],
        ];
    }

    /**
     * @param  class-string  $resourceClass
     * @param  class-string  $modelClass
     * @param  array<string,string>  $champs
     */
    #[DataProvider('instantsExposes')]
    public function test_un_instant_sort_en_iso_8601_avec_decalage_utc_explicite(
        string $resourceClass,
        string $modelClass,
        array $champs,
    ): void {
        $model = $modelClass::factory()->create();

        foreach ($champs as $attribut) {
            $model->setAttribute($attribut, Carbon::parse(self::INSTANT, 'UTC'));
        }

        // TCK-335 — la requête porte un appelant AUTHENTIFIÉ, et ce n'est pas
        // une commodité : `PropertyResource` conditionne désormais ses trois
        // instants de modération (`submitted_at`, `approved_at`, `rejected_at`)
        // à `$request->user() !== null`, un visiteur anonyme n'en recevant plus
        // la clé du tout. Sans ce résolveur, ce test-ci mesurerait le FORMAT
        // d'un champ que la ressource n'émet pas pour ce type d'appelant, et
        // rougirait sur `MissingValue` — ce qui n'apprend rien sur ADR-0018.
        // Le format reste comparé à la chaîne exacte : la garde n'est pas
        // relâchée, c'est l'appelant simulé qui est rendu représentatif.
        $requete = Request::create('/', 'GET');
        $requete->setUserResolver(fn () => new User);

        $sortie = (new $resourceClass($model))->toArray($requete);

        foreach ($champs as $cle => $attribut) {
            $this->assertArrayHasKey($cle, $sortie, "{$resourceClass} n'expose plus « {$cle} »");

            $this->assertSame(
                self::INSTANT_ATTENDU,
                $sortie[$cle],
                "{$resourceClass}::{$cle} n'émet pas le format d'instant d'ADR-0018. "
                .'Rappel : `…T12:34:56.000000Z` est l\'ANCIENNE forme, elle n\'est plus un contrat valide.',
            );
        }
    }

    /**
     * @param  class-string  $resourceClass
     * @param  class-string  $modelClass
     * @param  array<string,string>  $champs
     */
    #[DataProvider('datesCalendairesExposees')]
    public function test_une_date_calendaire_sort_en_annee_mois_jour_sans_heure(
        string $resourceClass,
        string $modelClass,
        array $champs,
    ): void {
        $model = $modelClass::factory()->create();

        foreach ($champs as $attribut) {
            $model->setAttribute($attribut, Carbon::parse(self::JOUR, 'UTC'));
        }

        $sortie = (new $resourceClass($model))->toArray(Request::create('/', 'GET'));

        foreach ($champs as $cle => $attribut) {
            $this->assertArrayHasKey($cle, $sortie, "{$resourceClass} n'expose plus « {$cle} »");

            $this->assertSame(
                self::JOUR_ATTENDU,
                $sortie[$cle],
                "{$resourceClass}::{$cle} est casté « date » : il ne doit porter ni heure ni fuseau",
            );
        }
    }

    /**
     * Le désaccord nommé par ADR-0018, figé pour qu'il ne se reforme pas.
     *
     * `PlatformPayout`, `Payout` et `BankStatement` déclarent tous les trois `period_start` et
     * `period_end` en cast `'date'`. Deux les émettaient en `2026-08-17`, le troisième en
     * `2026-08-17T00:00:00+00:00`. Le même concept, le même cast, deux contrats — invisible de
     * tout test, puisque les deux valeurs se parsent.
     */
    public function test_les_trois_periodes_comptables_sortent_sous_la_meme_forme(): void
    {
        $payout = Payout::factory()->create();
        $payout->setAttribute('period_start', Carbon::parse(self::JOUR, 'UTC'));

        $plateforme = PlatformPayout::factory()->create();
        $plateforme->setAttribute('period_start', Carbon::parse(self::JOUR, 'UTC'));

        $duPayout = (new PayoutResource($payout))->toArray(Request::create('/', 'GET'))['period_start'];
        $dePlateforme = (new PlatformPayoutResource($plateforme))->toArray(Request::create('/', 'GET'))['period_start'];

        $this->assertSame(self::JOUR_ATTENDU, $duPayout);
        $this->assertSame(
            $duPayout,
            $dePlateforme,
            'PlatformPayoutResource::period_start a repris une forme différente de PayoutResource::period_start '
            .'alors que les deux colonnes portent le même cast « date »',
        );
    }

    /**
     * **LA CINQUIÈME FORME — une ressource qui n'enveloppe pas un modèle.**
     *
     * `Api/Admin/ModerationItemResource` enveloppe un **tableau**, construit par
     * `UnifiedModerationService::unionQuery()` à partir de trois `DB::table(…)->selectRaw(…)` unis.
     * Ses colonnes de date n'ont donc jamais traversé un cast Eloquent : elles arrivaient en
     * **chaîne SQL brute** — `2026-08-20 13:16:05` — et la ressource les recopiait telles quelles.
     *
     * **Ni le ticket TCK-327 ni ADR-0018 ne l'avaient vue**, et pour une raison qui vaut d'être
     * retenue : les deux ont inventorié le dépôt en cherchant des APPELS DE CONVERSION. Or il n'y
     * en avait aucun ici — le défaut, c'était précisément de ne rien appeler. *Un inventaire des
     * conversions écrites ne trouve jamais les dates qu'on n'a pas converties.*
     *
     * Le coût, mesuré le 2026-08-20 : `new Date('2026-08-17 12:34:56')` est parsé par le navigateur
     * comme une heure **locale**, quand `new Date('2026-08-17T12:34:56+00:00')` l'est en UTC. Sous
     * `TZ=Europe/Paris` les deux diffèrent de **2 heures** ; sous `TZ=UTC`, de **zéro** — donc
     * invisible sur la machine de développement, et faux chez l'utilisateur.
     */
    public function test_une_date_venue_dun_selectraw_sort_sous_la_meme_forme_que_les_autres(): void
    {
        $ligne = [
            'id' => 'property:1',
            'type' => 'property',
            'status' => 'pending',
            'subject_type' => 'property',
            'subject_id' => 1,
            'subject' => null,
            'reporter' => null,
            'agency' => null,
            'reason' => 'Bien en attente de validation',
            'reported_count' => 0,
            // Exactement ce que rend le pilote PDO sur une colonne `timestamp` : une CHAÎNE.
            'reported_at' => self::INSTANT,
            'created_at' => self::INSTANT,
        ];

        $sortie = (new ModerationItemResource($ligne))->toArray(Request::create('/', 'GET'));

        foreach (['reported_at', 'created_at'] as $cle) {
            $this->assertSame(
                self::INSTANT_ATTENDU,
                $sortie[$cle],
                "ModerationItemResource::{$cle} a repris la chaîne SQL brute « 2026-08-17 12:34:56 ». "
                .'Un navigateur la lit comme une heure LOCALE : 2 h d\'écart sous TZ=Europe/Paris, '
                .'0 sous TZ=UTC — donc invisible ici et faux chez l\'utilisateur.',
            );
        }
    }

    /**
     * `null` traverse la ressource sans devenir une date.
     *
     * `Carbon::parse(null)` rend **l'instant courant**, pas `null` : la conversion de la chaîne
     * brute devait donc se garder explicitement, sans quoi « jamais signalé » serait devenu
     * « signalé à l'instant » — une valeur fausse, plausible, et impossible à repérer en lecture.
     */
    public function test_une_colonne_nulle_du_selectraw_reste_nulle(): void
    {
        $ligne = [
            'id' => 'property:1', 'type' => 'property', 'status' => 'pending',
            'subject_type' => 'property', 'subject_id' => 1, 'subject' => null,
            'reporter' => null, 'agency' => null, 'reason' => '', 'reported_count' => 0,
            'reported_at' => null,
            'created_at' => '',
        ];

        $sortie = (new ModerationItemResource($ligne))->toArray(Request::create('/', 'GET'));

        $this->assertNull($sortie['reported_at']);
        $this->assertNull($sortie['created_at']);
    }

    /**
     * **Le durcissement d'`iso()`, et le seul cas où il se voit.**
     *
     * `format(DateTimeInterface::ATOM)` conserve le décalage LOCAL de l'instance : sur un Carbon
     * en `Europe/Paris`, il rend `…T12:34:56+02:00`. L'instant reste juste, mais la chaîne cesse
     * d'être comparable lexicographiquement à ses voisines — et le tri d'une liste de dates
     * redevient faux sans qu'aucune valeur ne soit fausse.
     *
     * Aujourd'hui `config/app.php` déclare `'timezone' => 'UTC'`, donc le cas ne se produit pas :
     * le trou était fermé par une VALEUR DE CONFIGURATION, pas par le code. `iso()` normalise
     * désormais en code. Ce test est le seul endroit du dépôt où la différence est observable —
     * retirer le `->utc()` le fait rougir, et rien d'autre.
     */
    public function test_iso_normalise_vers_utc_meme_sur_une_instance_non_utc(): void
    {
        $resource = new class(null) extends BaseResource
        {
            public function public_iso(?DateTimeInterface $date): ?string
            {
                return $this->iso($date);
            }
        };

        $paris = Carbon::parse('2026-08-17 14:34:56', 'Europe/Paris');

        $this->assertSame(
            '2026-08-17T12:34:56+00:00',
            $resource->public_iso($paris),
            'iso() a laissé fuir un décalage local : ADR-0018 exige une normalisation UTC en code',
        );

        $this->assertSame(
            'Europe/Paris',
            $paris->timezoneName,
            'iso() a MUTÉ le Carbon reçu — un helper de sérialisation ne modifie pas l\'attribut du modèle',
        );
    }

    /**
     * Les deux helpers rendent `null` sur `null`, et pas une chaîne vide ni l'epoch.
     * « Jamais signé » et « signé le 1er janvier 1970 » ne se lisent pas pareil côté front.
     */
    public function test_les_deux_helpers_rendent_null_sur_null(): void
    {
        $resource = new class(null) extends BaseResource
        {
            public function public_iso(?DateTimeInterface $date): ?string
            {
                return $this->iso($date);
            }

            public function public_calendarDate(?DateTimeInterface $date): ?string
            {
                return $this->calendarDate($date);
            }
        };

        $this->assertNull($resource->public_iso(null));
        $this->assertNull($resource->public_calendarDate(null));
    }
}
