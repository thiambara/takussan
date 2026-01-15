<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     *
     * @return void
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('username')->unique()->nullable();
            $table->string('password');
            $table->string('type')->nullable();
            $table->string('status')->nullable()->default('active');

            $table->string('first_name')->nullable();
            $table->string('last_name')->nullable();
            $table->string('phone')->nullable()->nullable();
            $table->string('email')->unique()->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->nullableMorphs('model');

            $table->foreignId('agency_id')->nullable()->after('id')->constrained('agencies')->onDelete('set null');
            $table->foreignId('added_by_id')->nullable()->constrained('users')->onDelete('set null');
            $table->string('google_id')->nullable();

            $table->rememberToken();
            $table->json('metadata')->default('[]')->nullable();
            $table->softDeletes();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     *
     * @return void
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
