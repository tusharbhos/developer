<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_restore_hidden')->default(false)->after('deleted_by');
            $table->index('is_restore_hidden', 'users_is_restore_hidden_index');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_is_restore_hidden_index');
            $table->dropColumn('is_restore_hidden');
        });
    }
};
