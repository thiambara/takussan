<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Make the Spatie Permission team foreign key (agency_id) nullable on the
 * model_has_roles and model_has_permissions pivots so cross-team roles
 * (super_admin) can be assigned to users without an agency.
 *
 * agency_id is part of the composite PRIMARY KEY on both tables, and MySQL
 * does not permit NULL inside a PK. We drop the PK first, then relax the
 * column, then re-establish uniqueness via a UNIQUE index (indexes allow
 * NULL). Spatie looks up assignments via SELECT, not via the PK, so the
 * swap is behavior-preserving.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('model_has_roles', function (Blueprint $table) {
            $table->dropPrimary('model_has_roles_role_model_type_primary');
        });
        Schema::table('model_has_roles', function (Blueprint $table) {
            $table->unsignedBigInteger('agency_id')->nullable()->change();
        });
        Schema::table('model_has_roles', function (Blueprint $table) {
            $table->unique(
                ['agency_id', 'role_id', 'model_id', 'model_type'],
                'model_has_roles_team_role_model_unique',
            );
        });

        Schema::table('model_has_permissions', function (Blueprint $table) {
            $table->dropPrimary('model_has_permissions_permission_model_type_primary');
        });
        Schema::table('model_has_permissions', function (Blueprint $table) {
            $table->unsignedBigInteger('agency_id')->nullable()->change();
        });
        Schema::table('model_has_permissions', function (Blueprint $table) {
            $table->unique(
                ['agency_id', 'permission_id', 'model_id', 'model_type'],
                'model_has_permissions_team_permission_model_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::table('model_has_roles', function (Blueprint $table) {
            $table->dropUnique('model_has_roles_team_role_model_unique');
        });
        Schema::table('model_has_roles', function (Blueprint $table) {
            $table->unsignedBigInteger('agency_id')->nullable(false)->change();
        });
        Schema::table('model_has_roles', function (Blueprint $table) {
            $table->primary(
                ['agency_id', 'role_id', 'model_id', 'model_type'],
                'model_has_roles_role_model_type_primary',
            );
        });

        Schema::table('model_has_permissions', function (Blueprint $table) {
            $table->dropUnique('model_has_permissions_team_permission_model_unique');
        });
        Schema::table('model_has_permissions', function (Blueprint $table) {
            $table->unsignedBigInteger('agency_id')->nullable(false)->change();
        });
        Schema::table('model_has_permissions', function (Blueprint $table) {
            $table->primary(
                ['agency_id', 'permission_id', 'model_id', 'model_type'],
                'model_has_permissions_permission_model_type_primary',
            );
        });
    }
};
