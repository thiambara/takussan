<?php

namespace Tests\Feature\Notifications;

use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\NotificationChannel;
use App\Models\Enums\NotificationType;
use App\Models\Property;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Notifications\AgencyUpgradeRequestSubmittedNotification;
use App\Notifications\Channels\AppDatabaseChannel;
use App\Notifications\PropertyApprovedNotification;
use App\Notifications\SuperAdminAcceptedBroadcast;
use App\Notifications\SuperAdminInvitedBroadcast;
use App\Notifications\ThresholdAlertTriggered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Schema;
use LogicException;
use ReflectionClass;
use Tests\TestCase;

/**
 * Le canal `database` écrit dans `app_notifications` — et il ne l'a pas toujours fait.
 *
 * ## Ce que ces tests gardent, et le défaut qu'ils ferment
 *
 * `docs/models-spec.md` §12 tranche l'architecture depuis le 2026-04-13 : le feed in-app
 * vit dans `app_notifications`, **table applicative distincte de la table
 * `notifications` de Laravel**, et un canal maison enregistré via
 * `ChannelManager::extend()` fait le pont.
 *
 * **Ce canal n'a jamais été écrit.** Les 29 classes de `app/Notifications/` déclaraient
 * donc `'database'`, le canal natif, qui vise la table écartée par la décision — table
 * qu'aucune migration ne créait. Vingt-quatre d'entre elles sont réellement envoyées
 * depuis `app/` : elles écrivaient dans le vide, et l'échec était avalé.
 *
 * Aucune assertion du dépôt ne pouvait le voir : la requête HTTP rendait 201, la
 * notification partait, et personne ne vérifiait qu'elle atterrissait. C'est la bascule
 * PostgreSQL (ADR-0020) qui l'a rendu bruyant, un moteur qui abandonne la transaction au
 * premier échec ne laissant pas une écriture perdue passer inaperçue.
 *
 * ## Pourquoi le dernier test est le plus important
 *
 * `test_toute_notification_database_sait_se_ranger` ne vérifie pas un comportement : il
 * garde une **carte**. `AppDatabaseChannel::TYPES` est écrite à la main, et ce dépôt sait
 * ce que coûte une liste tenue à la main — l'INDEX du backlog était faux sur 80 % de ses
 * entrées. Ici la trentième classe de notification écrite demain fera rougir la suite si
 * personne ne l'a rangée. *Une carte à la main ne reste juste que si quelque chose casse
 * quand elle ne l'est plus.*
 */
class AppDatabaseChannelTest extends TestCase
{
    use RefreshDatabase;

    public function test_le_canal_database_ecrit_dans_app_notifications(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['title' => 'Villa Almadies']);

        Notification::send($owner, new PropertyApprovedNotification($property));

        $ligne = AppNotification::query()->where('user_id', $owner->id)->sole();

        $this->assertSame('Bien approuvé : Villa Almadies', $ligne->title);
        $this->assertSame(NotificationType::System, $ligne->type);
        $this->assertSame(NotificationChannel::App, $ligne->delivery_channel);
        $this->assertSame($property->id, $ligne->data['property_id']);
        $this->assertNotNull($ligne->sent_at);
        $this->assertFalse($ligne->is_read);
    }

    public function test_la_table_notifications_de_laravel_reste_absente(): void
    {
        // La décision de 2026-04-13 est que cette table N'EXISTE PAS : un second magasin
        // pour le même objet métier, qu'aucun endpoint ne lit. Une migration l'a créée
        // brièvement pendant la bascule PostgreSQL avant que ce canal ne la rende
        // inutile ; ce test empêche qu'elle revienne par inadvertance.
        $this->assertFalse(Schema::hasTable('notifications'));
    }

    public function test_un_notifiable_qui_n_est_pas_un_user_leve(): void
    {
        // `app_notifications.user_id` référence `users`. Sauter en silence rejouerait
        // exactement la faute que ce canal répare ; laisser PostgreSQL rendre une
        // violation de clé étrangère nommerait la colonne, jamais la cause.
        $this->expectException(LogicException::class);
        $this->expectExceptionMessageMatches('/app_notifications/');

        app(AppDatabaseChannel::class)->send(
            Agency::factory()->create(),
            new PropertyApprovedNotification(Property::factory()->create()),
        );
    }

    public function test_toute_notification_database_sait_se_ranger(): void
    {
        $orphelines = [];

        foreach (glob(app_path('Notifications/*.php')) ?: [] as $fichier) {
            $classe = 'App\\Notifications\\'.basename($fichier, '.php');

            if (! class_exists($classe) || (new ReflectionClass($classe))->isAbstract()) {
                continue;
            }
            // On lit la SOURCE et non `via()` : `via()` dépend des préférences de
            // l'utilisateur, donc l'appeler ici ne dirait que ce que le hasard du
            // notifiable rend vrai. Ce qu'on garde, c'est « cette classe PEUT emprunter
            // le canal », pas « elle l'emprunte pour cet utilisateur-là ».
            if (! str_contains((string) file_get_contents($fichier), "'database'")) {
                continue;
            }
            if (isset(AppDatabaseChannel::TYPES[$classe]) || method_exists($classe, 'toAppNotification')) {
                continue;
            }
            $orphelines[] = $classe;
        }

        $this->assertSame([], $orphelines, sprintf(
            "Ces notifications empruntent le canal `database` sans que %s sache leur donner un type :\n  - %s\n".
            'Les ajouter à AppDatabaseChannel::TYPES, ou leur donner un toAppNotification().',
            AppDatabaseChannel::class,
            implode("\n  - ", $orphelines),
        ));
    }

    public function test_les_six_classes_sans_titre_en_declarent_un(): void
    {
        // Les six classes dont le `toArray()` ne porte pas de `title` prennent la main
        // via `toAppNotification()`. `app_notifications.title` est NOT NULL : une seule
        // qui rendrait un titre vide ferait échouer l'insertion en production.
        $sansTitre = [
            AgencyUpgradeApprovedNotification::class,
            AgencyUpgradeRejectedNotification::class,
            AgencyUpgradeRequestSubmittedNotification::class,
            SuperAdminAcceptedBroadcast::class,
            SuperAdminInvitedBroadcast::class,
            ThresholdAlertTriggered::class,
        ];

        foreach ($sansTitre as $classe) {
            $this->assertTrue(
                method_exists($classe, 'toAppNotification'),
                "{$classe} n'a pas de titre dans son toArray() et doit donc en déclarer un.",
            );
        }
    }
}
