<?php

namespace Database\Seeders;

use App\Models\Document;
use App\Models\Message;
use App\Models\Property;
use Database\Seeders\Activity\BookingPaymentSeeder;
use Database\Seeders\Activity\BookingSeeder;
use Database\Seeders\Activity\InventorySeeder;
use Database\Seeders\Activity\InvoiceSeeder;
use Database\Seeders\Activity\LeasePaymentSeeder;
use Database\Seeders\Activity\LeaseSeeder;
use Database\Seeders\Activity\PayoutSeeder;
use Database\Seeders\Activity\PropertyVisitSeeder;
use Database\Seeders\Catalog\PropertyCollaboratorSeeder;
use Database\Seeders\Catalog\PropertyMediaSeeder;
use Database\Seeders\Catalog\PropertyPriceHistorySeeder;
use Database\Seeders\Catalog\PropertySeeder;
use Database\Seeders\Core\AgencySeeder;
use Database\Seeders\Core\IntegrationSeeder;
use Database\Seeders\Core\UserSeeder;
use Database\Seeders\Crm\CustomerNoteSeeder;
use Database\Seeders\Crm\CustomerSeeder;
use Database\Seeders\Crm\FavoriteSeeder;
use Database\Seeders\Crm\GuarantorSeeder;
use Database\Seeders\Crm\SavedSearchSeeder;
use Database\Seeders\Crm\UserCustomerRelationshipSeeder;
use Database\Seeders\Engagement\ActivityLogBackfillSeeder;
use Database\Seeders\Engagement\AppNotificationSeeder;
use Database\Seeders\Engagement\NotificationPreferenceSeeder;
use Database\Seeders\Engagement\ReviewSeeder;
use Database\Seeders\Operations\ConversationSeeder;
use Database\Seeders\Operations\DocumentSeeder;
use Database\Seeders\Operations\DocumentShareLinkSeeder;
use Database\Seeders\Operations\MaintenanceRequestSeeder;
use Database\Seeders\Operations\MessageSeeder;
use Database\Seeders\Operations\TaskSeeder;
use Database\Seeders\Support\DemoUsersSeeder;
use Database\Seeders\Support\EdgeCaseSeeder;
use Database\Seeders\Support\FilterCoverageSeeder;
use Database\Seeders\Support\PostProcessingSeeder;
use Database\Seeders\Support\SeedingConfig;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\AgencyUpgradeRequestSeeder;
use Database\Seeders\System\SettingsSeeder;
use Database\Seeders\System\TagSeeder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

class YearOfActivitySeeder extends Seeder
{
    /** @var array<int, class-string<Seeder>> */
    private const PIPELINE = [
        // System
        TagSeeder::class,
        // Core
        AgencySeeder::class,
        SettingsSeeder::class,
        UserSeeder::class,
        DemoUsersSeeder::class,
        IntegrationSeeder::class,
        // Doit s'exécuter après UserSeeder/DemoUsersSeeder (besoin du
        // primary_admin de chaque agence) et avant les seeders d'activité.
        AgencyUpgradeRequestSeeder::class,
        // Catalog
        PropertySeeder::class,
        PropertyCollaboratorSeeder::class,
        PropertyPriceHistorySeeder::class,
        // CRM
        CustomerSeeder::class,
        GuarantorSeeder::class,
        UserCustomerRelationshipSeeder::class,
        CustomerNoteSeeder::class,
        FavoriteSeeder::class,
        SavedSearchSeeder::class,
        // Activity
        PropertyVisitSeeder::class,
        BookingSeeder::class,
        BookingPaymentSeeder::class,
        LeaseSeeder::class,
        LeasePaymentSeeder::class,
        InventorySeeder::class,
        InvoiceSeeder::class,
        PayoutSeeder::class,
        // Operations
        MaintenanceRequestSeeder::class,
        ConversationSeeder::class,
        MessageSeeder::class,
        DocumentSeeder::class,
        DocumentShareLinkSeeder::class,
        TaskSeeder::class,
        // Engagement
        ReviewSeeder::class,
        AppNotificationSeeder::class,
        NotificationPreferenceSeeder::class,
        ActivityLogBackfillSeeder::class,
        // Post-processing (doit être en dernier)
        FilterCoverageSeeder::class,
        EdgeCaseSeeder::class,
        // PropertyMediaSeeder runs last so properties created by FilterCoverage
        // / EdgeCase get media too. The seeder iterates Property::all() and
        // skips any that already have files in the `photos` collection, so
        // it stays idempotent.
        PropertyMediaSeeder::class,
        PostProcessingSeeder::class,
    ];

    /**
     * Searchable models that must be (re)pushed to the search engine once the
     * pipeline is done. Scout syncing is disabled during seeding (see
     * {@see prepareEnvironment()}) so the bulk inserts never reach the engine
     * on their own.
     *
     * @var array<int, class-string<Model>>
     */
    private const SEARCHABLE_MODELS = [
        Property::class,
        Document::class,
        Message::class,
    ];

    private SeedingConfig $config;

    /** Scout driver captured before it's disabled for seeding, restored on reindex. */
    private ?string $originalScoutDriver = null;

    public function run(): void
    {
        $this->config = SeedingConfig::fromEnv();
        $this->prepareEnvironment();

        $context = new SeedingContext($this->config);
        app()->instance(SeedingContext::class, $context);

        $this->command?->getOutput()?->writeln("Seeding with config: {$this->config->agencies} agencies, {$this->config->propertiesPerAgency} properties/agency");

        // Each seeder runs in its own transaction so partial progress is kept
        // on failure (easier to debug) and the undo log / lock footprint per
        // transaction stays bounded on MySQL-backed environments. Earlier
        // seeders establish foreign-key targets that later seeders depend on,
        // so a failure mid-pipeline leaves a consistent prefix of the data.
        foreach (self::PIPELINE as $class) {
            $this->command?->getOutput()?->writeln("  > Seeding {$class}");
            /** @var Seeder $seeder */
            $seeder = app($class);
            $seeder->setContainer(app());
            if (method_exists($seeder, 'setCommand') && $this->command) {
                $seeder->setCommand($this->command);
            }
            DB::transaction(fn () => $seeder->run());
        }

        $this->reindexSearchableModels();
    }

    private function prepareEnvironment(): void
    {
        Config::set('queue.default', 'sync');
        // Disable Scout syncing so the bulk inserts below don't push to the
        // search engine row-by-row. The full index is rebuilt in one shot by
        // reindexSearchableModels() once seeding completes.
        $this->originalScoutDriver = config('scout.driver');
        Config::set('scout.driver', null);
        Config::set('database.seed_download_media', $this->config->downloadMedia);
        DB::disableQueryLog();
    }

    /**
     * Rebuild the search index for every searchable model. Without this the
     * Meilisearch-backed endpoints (e.g. GET /public/properties/search) return
     * nothing after a fresh seed, because Scout was muted during the inserts.
     *
     * No-op when no real engine is configured (CI / tests run Scout on the
     * "database" / null driver) to keep seeding fast and side-effect free.
     */
    private function reindexSearchableModels(): void
    {
        Config::set('scout.driver', $this->originalScoutDriver);

        if (in_array($this->originalScoutDriver, [null, '', 'null', 'database', 'collection'], true)) {
            return;
        }

        foreach (self::SEARCHABLE_MODELS as $model) {
            $this->command?->getOutput()?->writeln("  > Reindexing {$model}");
            $model::removeAllFromSearch();
            $model::makeAllSearchable();
        }
    }
}
