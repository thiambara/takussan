<?php

namespace Tests\Feature\Notifications;

use App\Domain\Integrations\Providers\IntegrationProviderRegistry;
use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Booking;
use App\Models\Invitation;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\NotificationTemplate;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use App\Notifications\ActivityLogExportReadyNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\AgentTenantInventoryReminderNotification;
use App\Notifications\BookingExpiredNotification;
use App\Notifications\CodedNotification;
use App\Notifications\InvitationAcceptedNotification;
use App\Notifications\InvitationExpiredNotification;
use App\Notifications\LeaseDepositRefundNotification;
use App\Notifications\LeaseRentReviewedNotification;
use App\Notifications\OwnerWeeklyDigestNotification;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\PropertyRejectedNotification;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Notifications\TaskDueReminderNotification;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use App\Services\Notifications\NotificationRenderer;
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Mailable;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\RateLimiter;
use ReflectionClass;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * TCK-605 — une saisie reste du TEXTE dans TOUS les e-mails (suite de TCK-599, verif-599 B1).
 *
 * Le défaut : `POST /api/public/properties/{slug}/contact-lead`, SANS compte, avec un nom
 * `[Payez ici](https://evil.example)` — l'e-mail `lead.received` de l'agent portait trois liens et
 * images vivants vers un tiers, signés Takussan. Le remède de 599 (`MarkdownText::escape`) vit
 * désormais au point de rendu : `NotificationRenderer` pour les codes (surface `mail_body` seule),
 * et chaque classe hors code à la source. Ce test en est la garde EXHAUSTIVE : `NotificationCode::cases()`
 * et la réflexion sur `app/Notifications` et `app/Mail`, jamais une liste écrite à la main.
 */
class SaisieDansTousLesEmailsTest extends TestCase
{
    use RefreshDatabase;

    /** La charge utile de référence du ticket : lien, image, emphase, titre. */
    private const P = '[Payez ici](https://evil.example/l) ![x](https://evil.example/i.png) **gras** # titre';

    /**
     * AC4 — les classes qui n'ont AUCUNE saisie d'un tiers dans leur corps, et pourquoi. Une classe
     * qui définit `toMail` (ou un `Mailable`) absente de cette table ET des cas d'injection rougit.
     */
    private const EXEMPTIONS = [
        'AccountDeletionExecutedNotification' => 'aucune saisie : libellés seuls',
        'AccountDeletionReminderNotification' => 'aucune saisie : un compte de jours et une date générés',
        'AccountDeletionRequestedNotification' => 'aucune saisie : une date générée',
        'AccountDeletionStepUpCodeNotification' => 'aucune saisie : un code à usage unique généré',
        'AgencyAdminActivationNotification' => 'aucune saisie : libellés, jeton et durée générés',
        'AgencyUpgradeApprovedNotification' => 'aucune saisie : libellés seuls',
        'DataExportReadyNotification' => 'aucune saisie : libellés et durée générés',
        'FavoriteChangesNotification' => 'échappe déjà à la source (TCK-599, SaisieDansLesEmailsTest)',
        'InvoiceOverdueReminderNotification' => 'aucune saisie : référence, montant et date générés',
        'LeaseEarlyTerminationNotification' => 'aucune saisie : référence, date et montant générés',
        'LeasePaymentLateFeeNotification' => 'aucune saisie : référence, montants, taux générés',
        'LeaseRenewedNotification' => 'aucune saisie : référence et dates générées',
        'LeaseSignatureCodeNotification' => 'aucune saisie : référence et code générés',
        'RegistrationConfirmationNotification' => 'aucune saisie : libellés et lien signé',
        'ReportExportReadyNotification' => 'aucune saisie : le rapport est validé contre une liste fermée (ReportingController::export)',
        'ResetPasswordNotification' => 'aucune saisie : libellés et lien signé',
        'SavedSearchMatchesNotification' => 'échappe déjà à la source (TCK-599, SaisieDansLesEmailsTest)',
        'SearchAlertConfirmationNotification' => 'aucune saisie : libellés et lien de confirmation (TCK-599)',
        'TenantInventoryReminderNotification' => 'aucune saisie : référence générée',
        'TenantWelcomeNotification' => 'aucune saisie : référence générée',
        'ThresholdAlertTriggered' => 'aucune saisie : métrique et sévérité validées contre des listes fermées, valeurs numériques',
        'InvitationMailable' => 'aucune saisie : le libellé du rôle et une date générée',
        'NotificationDigestMail' => 'échappe déjà dans son gabarit (verif-599 B1-bis, NotificationDigestMailTest)',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('throttle:5,10|127.0.0.1');
        // Les gabarits éditables et les comparaisons de surfaces se rendent en français.
        app()->setLocale('fr');
    }

    private function assertAucunLienVivant(string $html, string $contexte): void
    {
        $this->assertDoesNotMatchRegularExpression('/\bhref\s*=\s*["\']?[^"\'>\s]*evil\.example/i', $html, "{$contexte} : un lien vivant vers un tiers");
        $this->assertDoesNotMatchRegularExpression('/\bsrc\s*=\s*["\']?[^"\'>\s]*evil\.example/i', $html, "{$contexte} : une image vivante d'un tiers");
        $this->assertStringNotContainsString('<strong>gras</strong>', $html, "{$contexte} : l'emphase d'un tiers");
    }

    // ── AC1 — le relais anonyme ────────────────────────────────────────────────────────────

    public function test_ac1_le_contact_anonyme_d_un_bien_arrive_en_texte_chez_l_agent(): void
    {
        Notification::fake();
        $agent = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $agent->id]);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => self::P,
            'email' => 'visiteur@exemple.sn',
            'message' => self::P,
        ])->assertCreated();

        $this->assertLeadEnTexte($agent);
    }

    public function test_ac1_le_contact_anonyme_d_un_agent_arrive_en_texte_chez_l_agent(): void
    {
        Notification::fake();
        $agency = Agency::factory()->create();
        $agent = User::factory()->create([
            'username' => 'awa-diop',
            'phone' => '+221771234567',
            'phone_verified_at' => now(),
        ]);
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $agency->id]);

        $this->postJson('/api/public/agents/awa-diop/contact-lead', [
            'name' => self::P,
            'email' => 'visiteur@exemple.sn',
            'message' => self::P,
        ])->assertCreated();

        $this->assertLeadEnTexte($agent);
    }

    private function assertLeadEnTexte(User $agent): void
    {
        $envois = Notification::sent($agent, CodedNotification::class, fn (CodedNotification $n) => $n->code === NotificationCode::LeadReceived);
        $this->assertCount(1, $envois, "l'agent reçoit exactement un lead.received");

        $html = (string) $envois->first()->toMail($agent)->render();
        $this->assertAucunLienVivant($html, 'lead.received');
        // Lisible : la saisie se lit telle qu'elle a été écrite, sans barre oblique.
        $this->assertGreaterThanOrEqual(2, substr_count($html, self::P), 'nom et message lisibles à l\'identique');
    }

    // ── AC2 / AC3 — chaque code, par construction ──────────────────────────────────────────

    /**
     * Les paramètres d'un code : `P` dans tout ce qui peut porter du texte, une valeur valide
     * ailleurs. Les compléments libres (`reason`, `message`) reçoivent `P` aussi.
     *
     * @return array<string, mixed>
     */
    private function params(NotificationCode $code, bool $avecFacultatifs): array
    {
        $types = $code->params() + ($avecFacultatifs ? $code->optionalParams() : []);
        $params = ['reason' => self::P, 'message' => self::P];
        foreach ($types as $name => $type) {
            $params[$name] = match ($type) {
                NotificationCode::PARAM_MONEY => NotificationRenderer::money(15000, 'XOF'),
                NotificationCode::PARAM_DATE => '2026-11-16',
                NotificationCode::PARAM_DATETIME => '2026-11-16T10:00:00Z',
                NotificationCode::PARAM_COUNT => 3,
                NotificationCode::PARAM_URL => 'https://takussan.test/lien',
                NotificationCode::PARAM_PROVIDER => app(IntegrationProviderRegistry::class)->keys()[0],
                NotificationCode::PARAM_REASON_CODE => 'personal_data',
                default => self::P,
            };
        }

        return $params;
    }

    /** @return list<array{0: string, 1: object}> */
    private function destinataires(): array
    {
        $user = User::factory()->create(['first_name' => self::P, 'preferred_language' => 'fr']);

        return [
            ['User', $user],
            ['AnonymousNotifiable', (new AnonymousNotifiable)->route('mail', 'contact@exemple.sn')],
        ];
    }

    public function test_ac2_aucun_code_ne_rend_un_lien_d_un_tiers_dans_son_corps(): void
    {
        $rendus = 0;
        $lisibles = 0;
        foreach ($this->destinataires() as [$sorte, $notifiable]) {
            foreach (NotificationCode::cases() as $code) {
                foreach ([true, false] as $avecFacultatifs) {
                    $mail = (new CodedNotification($code, $this->params($code, $avecFacultatifs)))->toMail($notifiable);
                    $html = (string) $mail->render();
                    $this->assertAucunLienVivant($html, "{$code->value} ({$sorte})");
                    $lisibles += str_contains($html, self::P) ? 1 : 0;
                    $rendus++;
                }
            }
        }

        // Garde contre un test vide, et contre un échappement qui rendrait la saisie illisible.
        $this->assertGreaterThanOrEqual(4 * 100, $rendus);
        $this->assertGreaterThanOrEqual(100, $lisibles, 'la saisie reste lisible à l\'identique dans le corps');
    }

    /**
     * AC2 — les gabarits ACTIFS de l'éditeur du super-admin : leurs variables (`property.title`,
     * `user.first_name`) sont des saisies, échappées comme les paramètres de `lang/`.
     */
    public function test_ac2_les_gabarits_editables_rendent_leurs_variables_en_texte(): void
    {
        $evenements = [];
        foreach (NotificationCode::cases() as $code) {
            if ($code->templateEvent() !== null) {
                $evenements[$code->templateEvent()] = true;
            }
        }
        foreach (array_keys($evenements) as $event) {
            NotificationTemplate::query()->create([
                'event' => $event,
                'channel' => 'email',
                'locale' => 'fr',
                'subject' => 'Sujet {{ property.title }}',
                'body' => "Bonjour {{ user.first_name }}.\nBien : {{ property.title }} {{ maintenance.reference }} {{ booking.code }}.",
                'is_active' => true,
            ]);
        }

        $user = User::factory()->create(['first_name' => self::P, 'preferred_language' => 'fr']);
        $verifies = 0;
        foreach (NotificationCode::cases() as $code) {
            if ($code->templateEvent() === null) {
                continue;
            }
            $html = (string) (new CodedNotification($code, $this->params($code, true)))->toMail($user)->render();
            $this->assertStringContainsString('Bonjour', $html, "{$code->value} : le gabarit actif est rendu");
            $this->assertAucunLienVivant($html, "{$code->value} (gabarit éditable)");
            $this->assertStringContainsString(self::P, $html, "{$code->value} : la saisie se lit à l'identique");
            $verifies++;
        }
        $this->assertGreaterThanOrEqual(3, $verifies);
    }

    /** AC3 — sujet, SMS et cloche portent la saisie telle quelle : l'échappement ne déborde pas. */
    public function test_ac3_sujet_sms_et_cloche_ne_sont_pas_echappes(): void
    {
        $renderer = app(NotificationRenderer::class);
        $sujets = 0;
        $sms = 0;
        $cloches = 0;
        $prefixeSms = mb_substr(self::P, 0, NotificationRenderer::SMS_TEXT_MAX - 3);

        foreach (NotificationCode::cases() as $code) {
            $params = $this->params($code, true);
            $notification = new CodedNotification($code, $params);

            $sujet = $renderer->render($code, $params, 'fr', null, 'mail_subject');
            $this->assertStringNotContainsString('\\', $sujet, "{$code->value} : sujet sans barre oblique");
            $sujets += str_contains($sujet, self::P) ? 1 : 0;
            $this->assertSame($sujet, $notification->toMail(new AnonymousNotifiable)->subject);

            $texteSms = $notification->toSms(new AnonymousNotifiable);
            $this->assertStringNotContainsString('\\', $texteSms, "{$code->value} : SMS sans barre oblique");
            $sms += str_contains($texteSms, rtrim($prefixeSms)) ? 1 : 0;

            // TCK-2952 — la cloche n'a plus de `toBroadcast()` : elle affiche le titre et le corps que
            // `NotificationService::send()` rend par le même moteur, écrits sur la ligne `app_notifications`.
            $cloche = $renderer->render($code, $params, 'fr', null, 'title').$renderer->render($code, $params, 'fr', null, 'body');
            $this->assertStringNotContainsString('\\', $cloche, "{$code->value} : cloche sans barre oblique");
            $cloches += str_contains($cloche, self::P) ? 1 : 0;
        }

        $this->assertGreaterThanOrEqual(20, $sujets, 'des sujets portent la saisie à l\'identique');
        $this->assertGreaterThanOrEqual(20, $sms, 'des SMS portent la saisie (tronquée) à l\'identique');
        $this->assertGreaterThanOrEqual(50, $cloches, 'des cloches portent la saisie à l\'identique');
    }

    /** AC3 — `Awa & Fils [SARL]` se lit à l'identique : ni barre oblique, ni entité doublée. */
    public function test_ac3_une_saisie_echappee_se_lit_a_l_identique(): void
    {
        $html = (string) (new CodedNotification(NotificationCode::LeadReceived, [
            'name' => 'Awa & Fils [SARL]',
            'contact' => 'awa@exemple.sn',
            'message' => 'Bonjour (vers 10h) — 2 pièces.',
        ]))->toMail(new AnonymousNotifiable)->render();

        $this->assertStringContainsString('Awa &amp; Fils [SARL]', $html);
        $this->assertStringContainsString('Bonjour (vers 10h) — 2 pièces.', $html);
        $this->assertStringNotContainsString('&amp;amp;', $html);
        $this->assertStringNotContainsString('\\[', $html);
    }

    // ── AC4 / AC5 — chaque classe hors code ────────────────────────────────────────────────

    /**
     * Le jeu de données d'injection : pour chaque classe, la notification construite avec `P` dans
     * chaque champ saisi, et si `P` doit se lire à l'identique dans le SUJET (non échappé).
     *
     * @return array<string, Closure(): array{0: object, 1: bool}>
     */
    private function cas(): array
    {
        return [
            'AgencyUpgradeRequestSubmittedNotification' => function () {
                $demande = (new AgencyUpgradeRequest)->forceFill(['id' => 1, 'agency_id' => 1]);
                $demande->setRelation('agency', (new Agency)->forceFill(['name' => self::P]));

                return [new AgencyUpgradeRequestSubmittedNotification($demande, (new User)->forceFill(['first_name' => self::P, 'last_name' => self::P])), true];
            },
            'AgencyUpgradeRejectedNotification' => fn () => [new AgencyUpgradeRejectedNotification((new AgencyUpgradeRequest)->forceFill(['id' => 1, 'review_comment' => self::P])), false],
            'BookingExpiredNotification' => function () {
                $booking = (new Booking)->forceFill(['id' => 1, 'reference_number' => 'BK-1']);
                $booking->setRelation('property', (new Property)->forceFill(['title' => self::P]));

                return [new BookingExpiredNotification($booking), false];
            },
            // TCK-2985 — le nom de l'agence est la seule saisie du résumé du lundi.
            'OwnerWeeklyDigestNotification' => fn () => [new OwnerWeeklyDigestNotification([
                'agency' => self::P, 'paid_count' => 1, 'paid_total' => ['amount' => '1000.00', 'currency' => 'XOF'],
                'late_count' => 0, 'late_total' => ['amount' => '0.00', 'currency' => 'XOF'],
                'maintenance_opened' => 0, 'maintenance_closed' => 0, 'visits' => 0,
            ]), true],
            'TaskDueReminderNotification' => fn () => [new TaskDueReminderNotification((new Task)->forceFill(['id' => 1, 'title' => self::P, 'due_at' => now()])), true],
            'UrgentMaintenanceCreatedNotification' => fn () => [new UrgentMaintenanceCreatedNotification((new MaintenanceRequest)->forceFill(['id' => 1, 'title' => self::P])), true],
            'UrgentMaintenanceCreatedNotification (escalade)' => fn () => [new UrgentMaintenanceCreatedNotification((new MaintenanceRequest)->forceFill(['id' => 1, 'title' => self::P]), isEscalation: true), true],
            'LeaseDepositRefundNotification' => fn () => [new class($this->bail(), 1000, 500, self::P) extends LeaseDepositRefundNotification
            {
                protected function attachments(bool $signed = true): array
                {
                    return [['id' => 1, 'name' => '[Facture](https://evil.example/f) ![y](https://evil.example/f.png)', 'url' => 'https://takussan.test/f']];
                }
            }, false],
            'LeaseRentReviewedNotification' => fn () => [new LeaseRentReviewedNotification($this->bail(), 100000, 110000, self::P, '2026-12-01'), false],
            'SuperAdminInvitedBroadcast' => fn () => [new SuperAdminInvitedBroadcast(
                (new Invitation)->forceFill(['email' => self::P]),
                (new User)->forceFill(['first_name' => self::P, 'last_name' => self::P]),
            ), true],
            'SuperAdminAcceptedBroadcast' => fn () => [new SuperAdminAcceptedBroadcast((new User)->forceFill(['first_name' => self::P, 'last_name' => self::P, 'email' => self::P])), true],
            'AgentTenantInventoryReminderNotification' => function () {
                $bail = $this->bail();
                $bail->setRelation('tenant', (new User)->forceFill(['first_name' => self::P, 'last_name' => self::P]));

                return [new AgentTenantInventoryReminderNotification($bail), false];
            },
            'InvitationAcceptedNotification' => fn () => [new InvitationAcceptedNotification((new Invitation)->forceFill(['email' => self::P, 'role' => 'agent'])), true],
            'InvitationExpiredNotification' => fn () => [new InvitationExpiredNotification((new Invitation)->forceFill(['email' => self::P])), true],
            'ActivityLogExportReadyNotification' => fn () => [new ActivityLogExportReadyNotification('https://takussan.test/x', self::P, 3), false],
            'PropertyApprovedNotification' => fn () => [new PropertyApprovedNotification((new Property)->forceFill(['id' => 1, 'title' => self::P])), true],
            'PropertyRejectedNotification' => fn () => [new PropertyRejectedNotification((new Property)->forceFill(['id' => 1, 'title' => self::P]), self::P), true],
            'CodedNotification' => fn () => [new CodedNotification(NotificationCode::LeadReceived, ['name' => self::P, 'contact' => 'x@exemple.sn', 'message' => self::P]), false],
        ];
    }

    private function bail(): Lease
    {
        return (new Lease)->forceFill(['id' => 1, 'reference_number' => 'BAIL-1', 'currency' => 'XOF']);
    }

    /** AC5 — chaque cas mord : zéro lien vivant, saisie lisible, sujet intact. */
    public function test_ac5_chaque_classe_hors_code_rend_ses_saisies_en_texte(): void
    {
        $user = User::factory()->create(['preferred_language' => 'fr']);
        foreach ($this->cas() as $nom => $fabrique) {
            [$notification, $sujetPorteP] = $fabrique();
            /** @var MailMessage $mail */
            $mail = $notification->toMail($user);
            $html = (string) $mail->render();

            $this->assertAucunLienVivant($html, $nom);
            $this->assertStringContainsString('evil.example', $html, "{$nom} : la saisie reste lisible, en texte");
            if ($sujetPorteP) {
                // Une adresse est rangée en minuscules par le modèle : la comparaison ignore la casse.
                $this->assertStringContainsString(mb_strtolower(self::P), mb_strtolower((string) $mail->subject), "{$nom} : le sujet n'est pas échappé");
            }
        }
    }

    /** AC4 — l'inventaire est exhaustif par construction. */
    public function test_ac4_toute_classe_qui_envoie_un_e_mail_est_couverte_ou_exemptee(): void
    {
        $couvertes = array_map(fn (string $k) => explode(' ', $k)[0], array_keys($this->cas()));
        $trouvees = [];

        foreach (['Notifications' => 'toMail', 'Mail' => null] as $dossier => $methode) {
            foreach ((new Finder)->files()->in(app_path($dossier))->name('*.php') as $fichier) {
                $classe = 'App\\'.$dossier.'\\'.str_replace(['/', '.php'], ['\\', ''], $fichier->getRelativePathname());
                if (! class_exists($classe)) {
                    continue;
                }
                $reflexion = new ReflectionClass($classe);
                if ($reflexion->isAbstract() || $reflexion->isInterface()) {
                    continue;
                }
                $envoie = $methode !== null
                    ? $reflexion->hasMethod($methode)
                    : $reflexion->isSubclassOf(Mailable::class);
                if (! $envoie) {
                    continue;
                }
                $court = $reflexion->getShortName();
                $trouvees[] = $court;
                $this->assertTrue(
                    in_array($court, $couvertes, true) || array_key_exists($court, self::EXEMPTIONS),
                    "{$classe} envoie un e-mail sans cas d'injection ni exemption motivée (TCK-605)",
                );
            }
        }

        // Une exemption ou un cas qui ne vise plus aucune classe est une garde morte.
        foreach (array_merge(array_keys(self::EXEMPTIONS), $couvertes) as $nom) {
            $this->assertContains($nom, $trouvees, "{$nom} n'existe plus : retirer son entrée");
        }
        $this->assertGreaterThanOrEqual(38, count($trouvees));
        $this->assertContains('InvitationMailable', $trouvees);
        $this->assertContains('NotificationDigestMail', $trouvees);
    }
}
