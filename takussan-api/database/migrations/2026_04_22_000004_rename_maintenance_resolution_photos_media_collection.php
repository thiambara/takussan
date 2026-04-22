<?php

use App\Models\MaintenanceRequest;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Rename the spatie/medialibrary collection `resolution_photos` to
 * `completion_photos` on existing MaintenanceRequest media rows.
 *
 * The Wave 2 code change (§21 alignment) dropped the `resolution_photos`
 * collection registration in favour of `completion_photos`. Without this
 * migration, any media uploaded before the release keeps the old
 * `collection_name` and becomes invisible to `getMedia('completion_photos')`.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('media')
            ->where('model_type', MaintenanceRequest::class)
            ->where('collection_name', 'resolution_photos')
            ->update(['collection_name' => 'completion_photos']);
    }

    public function down(): void
    {
        DB::table('media')
            ->where('model_type', MaintenanceRequest::class)
            ->where('collection_name', 'completion_photos')
            ->update(['collection_name' => 'resolution_photos']);
    }
};
