import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// GET /api/projects - List all projects
export async function GET() {
  const session = await auth();
  const sql = getDb();

  try {
    let projects;

    if (session?.user?.id) {
      // Show projects user has access to
      projects = await sql`
        SELECT p.id, p.name, p.slug, p.description, p.domain, p.settings,
               p.created_at, p.updated_at,
               COUNT(d.id) as doc_count
        FROM projects p
        LEFT JOIN project_members pm ON p.id = pm.project_id
        LEFT JOIN documents d ON p.id = d.project_id
        WHERE pm.user_id = ${session.user.id}
        GROUP BY p.id, p.name, p.slug, p.description, p.domain, p.settings, p.created_at, p.updated_at
        ORDER BY p.created_at DESC
      `;
    } else {
      // Show all projects for non-authenticated users
      projects = await sql`
        SELECT p.id, p.name, p.slug, p.description, p.domain, p.settings,
               p.created_at, p.updated_at,
               COUNT(d.id) as doc_count
        FROM projects p
        LEFT JOIN documents d ON p.id = d.project_id
        GROUP BY p.id, p.name, p.slug, p.description, p.domain, p.settings, p.created_at, p.updated_at
        ORDER BY p.created_at DESC
      `;
    }

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(req: NextRequest) {
  const session = await auth();

  // Require authentication to create projects
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const sql = getDb();

  try {
    const body = await req.json();
    const { name, slug, description, domain, settings, knowledgeBase } = body;

    // Validate required fields
    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Validate slug format (lowercase alphanumeric with hyphens)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { error: "Slug must be lowercase alphanumeric with hyphens only" },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existingProject = await sql`
      SELECT id FROM projects WHERE slug = ${slug}
    `;

    if (existingProject.length > 0) {
      return NextResponse.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      );
    }

    // Create the project
    const [project] = await sql`
      INSERT INTO projects (name, slug, description, domain, settings, created_by)
      VALUES (
        ${name},
        ${slug},
        ${description || null},
        ${domain || null},
        ${settings ? JSON.stringify(settings) : "{}"},
        ${session.user.id}
      )
      RETURNING id, name, slug, description, domain, settings, created_at, updated_at
    `;

    // Add the creator as project owner
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${project.id}, ${session.user.id}, 'owner')
    `;

    // If knowledge base data is provided, save it to file
    if (knowledgeBase) {
      try {
        const knowledgeBasePath = path.join(
          process.cwd(),
          "knowledge-base",
          `${slug}.json`
        );

        // Ensure knowledge-base directory exists
        await fs.mkdir(path.dirname(knowledgeBasePath), { recursive: true });

        // Write knowledge base file
        await fs.writeFile(
          knowledgeBasePath,
          JSON.stringify(knowledgeBase, null, 2),
          "utf-8"
        );

        console.log(`[KB] Created knowledge base file for project: ${slug}`);
      } catch (kbError) {
        console.error("Error saving knowledge base:", kbError);
        // Don't fail the whole request if KB save fails
      }
    }

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
