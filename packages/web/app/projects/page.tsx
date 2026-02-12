import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

type ProjectWithRole = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  doc_count: number;
  role: string;
};

function getRoleBadgeVariant(
  role: string,
): "owner" | "admin" | "editor" | "viewer" {
  const roleMap: Record<string, "owner" | "admin" | "editor" | "viewer"> = {
    owner: "owner",
    admin: "admin",
    editor: "editor",
    viewer: "viewer",
    member: "viewer", // fallback for old "member" role
  };
  return roleMap[role.toLowerCase()] || "viewer";
}

export default async function ProjectsPage() {
  const session = await auth();
  const sql = getDb();

  let projects: ProjectWithRole[];
  let isSuperAdmin = false;

  if (session?.user?.id) {
    // Check if user is super_admin or admin
    const [userData] = await sql`
      SELECT role FROM users WHERE id = ${session.user.id}
    `;

    isSuperAdmin =
      userData?.role === "super_admin" || userData?.role === "admin";

    if (isSuperAdmin) {
      // Super admins see ALL projects with owner role
      projects = (await sql`
        SELECT p.id, p.name, p.slug, p.description,
               'owner' as role,
               COUNT(d.id) as doc_count
        FROM projects p
        LEFT JOIN documents d ON p.id = d.project_id
        GROUP BY p.id, p.name, p.slug, p.description
        ORDER BY p.name
      `) as unknown as ProjectWithRole[];
    } else {
      // Regular users see only their projects
      projects = (await sql`
        SELECT p.id, p.name, p.slug, p.description,
               pm.role,
               COUNT(d.id) as doc_count
        FROM projects p
        INNER JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN documents d ON p.id = d.project_id
        WHERE pm.user_id = ${session.user.id}
        GROUP BY p.id, p.name, p.slug, p.description, pm.role
        ORDER BY p.name
      `) as unknown as ProjectWithRole[];
    }
  } else {
    // Show all projects for non-authenticated users (no role)
    projects = (await sql`
      SELECT p.id, p.name, p.slug, p.description,
             'viewer' as role,
             COUNT(d.id) as doc_count
      FROM projects p
      LEFT JOIN documents d ON p.id = d.project_id
      GROUP BY p.id, p.name, p.slug, p.description
      ORDER BY p.name
    `) as unknown as ProjectWithRole[];
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Projects</h1>
              <p className="text-gray-600">
                Select a project to view its documentation
              </p>
            </div>
            {session?.user && <CreateProjectDialog />}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.slug}/docs`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        {project.name}
                      </CardTitle>
                      <Badge variant={getRoleBadgeVariant(project.role)}>
                        {project.role}
                      </Badge>
                    </div>
                    <CardDescription>
                      {project.description ||
                        "Documentation for " + project.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-gray-600">
                      {project.doc_count}{" "}
                      {project.doc_count === 1 ? "document" : "documents"}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {projects.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No projects available.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export const dynamic = "force-dynamic";
