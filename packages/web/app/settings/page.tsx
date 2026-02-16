import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AISettings } from "@/components/settings/AISettings";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/postgres";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const sql = getDb();

  // Check if user is admin
  const [user] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  if (!user || !["admin", "super_admin"].includes(user.role)) {
    redirect("/projects");
  }

  return (
    <DashboardLayout>
      <div className="p-8 max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">
            Manage global application settings
          </p>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-semibold mb-4">AI Configuration</h2>
            <AISettings />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = "force-dynamic";
