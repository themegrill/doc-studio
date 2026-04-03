import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// GET /api/projects - List all projects
export async function GET() {
  const session = await auth();
  const sql = getDb();

  try {

  type ProjectRow = {
    id: string;
    name: string;
    slug: string;
    created_at: string | Date;
    updated_at: string | Date;
    metadata: unknown;
  };

  let projects: ProjectRow[] = [];

    if (session?.user?.email) {
      // Resolve the authenticated user from the database by email
      const [dbUser] = await sql`
        SELECT id, email, name
        FROM users
        WHERE email = ${session.user.email}
      `;

      if (dbUser) {
        // Show only projects the resolved DB user has access to
        projects = await sql`
          SELECT
            p.id,
            p.name,
            p.slug,
            p.description,
            p.domain,
            p.settings,
            p.created_at,
            p.updated_at,
            COUNT(d.id) as doc_count
          FROM projects p
          LEFT JOIN project_members pm ON p.id = pm.project_id
          LEFT JOIN documents d ON p.id = d.project_id
          WHERE pm.user_id = ${dbUser.id}
          GROUP BY
            p.id,
            p.name,
            p.slug,
            p.description,
            p.domain,
            p.settings,
            p.created_at,
            p.updated_at
          ORDER BY p.created_at DESC
        `;
      } else {
        // Fallback: authenticated session exists but matching DB user was not found
        projects = [];
      }
    } else {
      // Show all projects for non-authenticated users
      projects = await sql`
        SELECT
          p.id,
          p.name,
          p.slug,
          p.description,
          p.domain,
          p.settings,
          p.created_at,
          p.updated_at,
          COUNT(d.id) as doc_count
        FROM projects p
        LEFT JOIN documents d ON p.id = d.project_id
        GROUP BY
          p.id,
          p.name,
          p.slug,
          p.description,
          p.domain,
          p.settings,
          p.created_at,
          p.updated_at
        ORDER BY p.created_at DESC
      `;
    }

    return NextResponse.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch projects",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(req: NextRequest) {
  const session = await auth();

  // Require authentication to create projects
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const sql = getDb();

  try {
    const body = await req.json();
    const {
      name,
      slug,
      description,
      domain,
      settings,
      knowledgeBase,
      siteLink,
    } = body;

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

    // Resolve the authenticated user from the database by email
    const [dbUser] = await sql`
      SELECT id, email, name
      FROM users
      WHERE email = ${session.user.email}
    `;

    if (!dbUser) {
      return NextResponse.json(
        {
          error: "Authenticated user not found in database",
          sessionEmail: session.user.email,
        },
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

    // Merge siteLink and knowledgeBase into settings if provided
    const projectSettings = {
      ...(settings || {}),
      ...(siteLink ? { siteLink } : {}),
      ...(knowledgeBase ? { knowledgeBase } : {}),
    };

    // Create the project using the resolved DB user id
    const [project] = await sql`
      INSERT INTO projects (name, slug, description, domain, settings, created_by)
      VALUES (
        ${name},
        ${slug},
        ${description || null},
        ${domain || null},
        ${JSON.stringify(projectSettings)},
        ${dbUser.id}
      )
      RETURNING
        id,
        name,
        slug,
        description,
        domain,
        settings,
        created_at,
        updated_at
    `;

    // Add the creator as project owner using the resolved DB user id
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${project.id}, ${dbUser.id}, 'owner')
    `;

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      {
        error: "Failed to create project",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
