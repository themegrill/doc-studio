import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AddUserDialog } from "@/components/users/AddUserDialog";
import { UsersTable } from "@/components/users/UsersTable";
import { redirect } from "next/navigation";

type UserWithProjects = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  created_at: string;
  system_role: string;
  project_count: number;
  role: string;
  projects: Array<{
    project_id: string;
    project_name: string;
    project_slug: string;
    role: string;
  }> | null;
};

export default async function UsersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const sql = getDb();

  // Check if user has system admin permissions
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const userRole = userData?.role || "user";

  // Only admins and super_admins can access this page
  if (userRole !== "admin" && userRole !== "super_admin") {
    redirect("/projects");
  }

  // Fetch users on server side with their highest project role
  const users = (await sql`
    SELECT
      u.id,
      u.email,
      u.name,
      u.image,
      u.created_at,
      u.role as system_role,
      COUNT(DISTINCT pm.project_id) as project_count,
      CASE
        WHEN COUNT(CASE WHEN pm.role = 'owner' THEN 1 END) > 0 THEN 'owner'
        WHEN COUNT(CASE WHEN pm.role = 'admin' THEN 1 END) > 0 THEN 'admin'
        WHEN COUNT(CASE WHEN pm.role = 'editor' THEN 1 END) > 0 THEN 'editor'
        WHEN COUNT(CASE WHEN pm.role = 'viewer' THEN 1 END) > 0 THEN 'viewer'
        ELSE 'viewer'
      END as role,
      json_agg(
        json_build_object(
          'project_id', p.id,
          'project_name', p.name,
          'project_slug', p.slug,
          'role', pm.role
        )
      ) FILTER (WHERE pm.project_id IS NOT NULL) as projects
    FROM users u
    LEFT JOIN project_members pm ON u.id = pm.user_id
    LEFT JOIN projects p ON pm.project_id = p.id
    GROUP BY u.id, u.email, u.name, u.image, u.created_at, u.role
    ORDER BY u.created_at DESC
  `) as unknown as UserWithProjects[];

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Users</h1>
              <p className="text-gray-600">
                Manage user accounts and permissions
              </p>
            </div>
            {session?.user && <AddUserDialog currentUserRole={userRole} />}
          </div>

          <UsersTable users={users} currentUserRole={userRole} />
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = "force-dynamic";
