import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ProjectMembersTable } from "@/components/projects/ProjectMembersTable";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProjectSettingsPageProps {
  params: Promise<{
    projectSlug: string;
  }>;
}

export default async function ProjectSettingsPage({
  params,
}: ProjectSettingsPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const sql = getDb();
  const { projectSlug } = await params;

  // Get project
  const [project] = await sql`
    SELECT id, name, slug
    FROM projects
    WHERE slug = ${projectSlug}
  `;

  if (!project) {
    notFound();
  }

  // Check if user is system admin
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const isSuperAdmin =
    userData?.role === "super_admin" || userData?.role === "admin";

  // Check if user is a project member
  const [membership] = await sql`
    SELECT role FROM project_members
    WHERE project_id = ${project.id} AND user_id = ${session.user.id}
  `;

  // Allow access if: super admin OR (member AND owner/admin)
  if (!isSuperAdmin) {
    if (!membership) {
      redirect("/projects");
    }

    if (!["owner", "admin"].includes(membership.role)) {
      redirect(`/projects/${projectSlug}/docs`);
    }
  }

  // Set role for display (super admin gets owner role)
  const effectiveRole = isSuperAdmin ? "owner" : membership?.role || "owner";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href={`/projects/${projectSlug}/docs`}>
            <Button variant="ghost" size="sm" className="mb-4 -ml-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Docs
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-600 mt-1">Project Settings</p>
        </div>

        <div className="bg-white rounded-lg border">
          <div className="border-b px-6 py-4">
            <h2 className="text-xl font-semibold">Members</h2>
            <p className="text-sm text-gray-600 mt-1">
              Manage who has access to this project and their roles
            </p>
          </div>

          <div className="p-6">
            {isSuperAdmin && (
              <div className="mb-4 bg-purple-50 border border-purple-200 rounded-md p-3">
                <p className="text-sm text-purple-800">
                  You have full access to this project as a system
                  administrator.
                </p>
              </div>
            )}
            <ProjectMembersTable
              projectSlug={project.slug}
              currentUserRole={effectiveRole}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
