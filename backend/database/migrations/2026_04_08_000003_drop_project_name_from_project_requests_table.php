<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('project_requests')) {
            return;
        }

        if (Schema::hasColumn('project_requests', 'project_name')) {
            Schema::table('project_requests', function (Blueprint $table) {
                $table->dropIndex(['project_name']);
                $table->dropColumn('project_name');
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('project_requests')) {
            return;
        }

        if (! Schema::hasColumn('project_requests', 'project_name')) {
            Schema::table('project_requests', function (Blueprint $table) {
                $table->string('project_name')->nullable()->after('developer_name');
                $table->index('project_name');
            });
        }
    }
};
