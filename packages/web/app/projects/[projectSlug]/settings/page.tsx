import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ProjectSettingsTabs } from "@/components/projects/ProjectSettingsTabs";
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
    SELECT id, name, slug, description, metadata, domain, settings, redirects
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

  // Fetch global GitHub config to pass to KB settings
  const [githubSettingsRow] = await sql`
    SELECT value FROM global_settings WHERE key = 'github.config'
  `;
  const githubConfig = githubSettingsRow?.value || {};
  const githubConfigured = !!(githubConfig.repo as string | undefined)?.trim();

  // Fetch existing knowledge base entries (type + metadata only, no content)
  const existingKbs = await sql`
    SELECT type, metadata, updated_at
    FROM project_knowledge_bases
    WHERE project_id = ${project.id}
    ORDER BY type
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

        <ProjectSettingsTabs
          projectSlug={project.slug}
          projectId={project.id}
          projectName={project.name}
          projectDescription={project.description ?? ""}
          projectMetadata={project.metadata || {}}
          projectDomain={project.domain ?? null}
          projectDeploy={project.settings?.deploy ?? null}
          projectRedirects={project.redirects ?? []}
          projectIntegrations={project.settings?.integrations ?? {}}
          currentUserRole={effectiveRole}
          isSuperAdmin={isSuperAdmin}
          githubConfigured={githubConfigured}
          existingKbs={existingKbs.map((row) => ({
            type: row.type as "upload" | "website" | "codebase" | "ui_flow",
            metadata: (row.metadata || {}) as Record<string, unknown>,
            updatedAt: row.updated_at instanceof Date
              ? row.updated_at.toISOString()
              : String(row.updated_at),
          }))}
        />
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";
