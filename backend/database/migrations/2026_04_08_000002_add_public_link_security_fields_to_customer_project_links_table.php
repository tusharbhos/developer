<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('customer_project_links', 'card_attempts')) {
            Schema::table('customer_project_links', function (Blueprint $table) {
                $table->json('card_attempts')->nullable()->after('mask_identity');
            });
        }

        if (! Schema::hasColumn('customer_project_links', 'locked_project_keys')) {
            Schema::table('customer_project_links', function (Blueprint $table) {
                $table->json('locked_project_keys')->nullable()->after('card_attempts');
            });
        }

        if (! Schema::hasColumn('customer_project_links', 'expires_at')) {
            Schema::table('customer_project_links', function (Blueprint $table) {
                $table->timestamp('expires_at')->nullable()->after('sent_at');
            });
        }

        if (! Schema::hasColumn('customer_project_links', 'is_disabled')) {
            Schema::table('customer_project_links', function (Blueprint $table) {
                $table->boolean('is_disabled')->default(false)->after('expires_at');
            });
        }

        if (! Schema::hasColumn('customer_project_links', 'disabled_at')) {
            Schema::table('customer_project_links', function (Blueprint $table) {
                $table->timestamp('disabled_at')->nullable()->after('is_disabled');
            });
        }
    }

    public function down(): void
    {
        $dropColumns = [];

        foreach (['card_attempts', 'locked_project_keys', 'expires_at', 'is_disabled', 'disabled_at'] as $column) {
            if (Schema::hasColumn('customer_project_links', $column)) {
                $dropColumns[] = $column;
            }
        }

        if (! empty($dropColumns)) {
            Schema::table('customer_project_links', function (Blueprint $table) use ($dropColumns) {
                $table->dropColumn($dropColumns);
            });
        }
    }
};
