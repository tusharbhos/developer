<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('assigned_projects')->nullable()->after('unique_key');
            $table->unsignedBigInteger('parent_user_id')->nullable()->after('assigned_projects');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['assigned_projects', 'parent_user_id']);
        });
    }
};
