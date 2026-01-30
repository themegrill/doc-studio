import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default async function ProjectsPage() {
  const session = await auth();
  const sql = getDb();

  let projects;

  if (session?.user?.id) {
    // Show projects user has access to
    projects = await sql`
      SELECT p.id, p.name, p.slug, p.description,
             COUNT(d.id) as doc_count
      FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id
      LEFT JOIN documents d ON p.id = d.project_id
      WHERE pm.user_id = ${session.user.id}
      GROUP BY p.id, p.name, p.slug, p.description
      ORDER BY p.name
    `;
  } else {
    // Show all projects for non-authenticated users
    projects = await sql`
      SELECT p.id, p.name, p.slug, p.description,
             COUNT(d.id) as doc_count
      FROM projects p
      LEFT JOIN documents d ON p.id = d.project_id
      GROUP BY p.id, p.name, p.slug, p.description
      ORDER BY p.name
    `;
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Documentation Projects</h1>
          <p className="text-gray-600">Select a project to view its documentation</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.slug}/docs`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {project.name}
                  </CardTitle>
                  <CardDescription>
                    {project.description || "Documentation for " + project.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-600">
                    {project.doc_count} {project.doc_count === 1 ? "document" : "documents"}
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
  );
}

export const dynamic = "force-dynamic";
