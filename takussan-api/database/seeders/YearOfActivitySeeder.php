<?php

namespace Database\Seeders;

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
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Database\Seeders\System\SettingsSeeder;
use Database\Seeders\System\TagSeeder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

class YearOfActivitySeeder extends Seeder
{
    /** @var array<int, class-string<Seeder>> */
    private const PIPELINE = [
        // System
        RolesAndPermissionsSeeder::class,
        TagSeeder::class,
        // Core
        AgencySeeder::class,
        SettingsSeeder::class,
        UserSeeder::class,
        IntegrationSeeder::class,
        // Catalog
        PropertySeeder::class,
        PropertyMediaSeeder::class,
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
    ];

    public function run(): void
    {
        $this->prepareEnvironment();

        $context = app(SeedingContext::class);
        app()->instance(SeedingContext::class, $context);

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
    }

    private function prepareEnvironment(): void
    {
        Config::set('queue.default', 'sync');
        Config::set('scout.driver', null);
        DB::disableQueryLog();
    }
}
