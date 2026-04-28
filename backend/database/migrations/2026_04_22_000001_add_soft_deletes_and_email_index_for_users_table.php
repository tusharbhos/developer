<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_email_unique');
            $table->index('email', 'users_email_index');
            $table->softDeletes();
            $table->unique(['email', 'deleted_at'], 'users_email_deleted_at_unique');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_email_deleted_at_unique');
            $table->dropIndex('users_email_index');
            $table->dropSoftDeletes();
            $table->unique('email', 'users_email_unique');
        });
    }
};
