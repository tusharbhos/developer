<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('id')->constrained('companies')->nullOnDelete();
            $table->boolean('is_company_owner')->default(false)->after('role');
        });

        // Backfill existing users into companies table using company_name + rera_no.
        $users = DB::table('users')
            ->select('id', 'company_name', 'rera_no')
            ->whereNotNull('company_name')
            ->get();

        foreach ($users as $u) {
            $companyId = DB::table('companies')
                ->where('name', $u->company_name)
                ->where(function ($q) use ($u) {
                    if ($u->rera_no === null) {
                        $q->whereNull('rera_no');
                    } else {
                        $q->where('rera_no', $u->rera_no);
                    }
                })
                ->value('id');

            if (! $companyId) {
                $companyId = DB::table('companies')->insertGetId([
                    'name' => $u->company_name,
                    'rera_no' => $u->rera_no,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            DB::table('users')->where('id', $u->id)->update([
                'company_id' => $companyId,
            ]);
        }

        // First user by id in each company becomes owner (safe default for old records).
        $companyIds = DB::table('users')->whereNotNull('company_id')->distinct()->pluck('company_id');
        foreach ($companyIds as $companyId) {
            $ownerId = DB::table('users')->where('company_id', $companyId)->orderBy('id')->value('id');
            if ($ownerId) {
                DB::table('users')->where('id', $ownerId)->update(['is_company_owner' => true]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_id');
            $table->dropColumn('is_company_owner');
        });
    }
};
