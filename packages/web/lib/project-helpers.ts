import { getDb } from "@/lib/db/postgres";

export interface Project {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
}

/**
 * Get project from the current request
 * Checks domain first, then falls back to path-based routing
 */
export async function getProjectFromRequest(
  hostname: string,
  pathname: string
): Promise<Project | null> {
  const sql = getDb();

  // 1. Try to match by domain
  if (hostname && hostname !== "localhost" && !hostname.includes("localhost")) {
    const [project] = await sql<Project[]>`
      SELECT id, name, slug, domain
      FROM projects
      WHERE domain = ${hostname}
      LIMIT 1
    `;

    if (project) {
      console.log("[getProjectFromRequest] Found by domain:", {
        hostname,
        project: project.slug,
      });
      return project;
    }
  }

  // 2. Try to match by subdomain (e.g., masteriyo.docs.yoursite.com)
  if (hostname && hostname.includes(".")) {
    const subdomain = hostname.split(".")[0];
    if (subdomain && subdomain !== "www" && subdomain !== "docs") {
      const [project] = await sql<Project[]>`
        SELECT id, name, slug, domain
        FROM projects
        WHERE slug = ${subdomain}
        LIMIT 1
      `;

      if (project) {
        console.log("[getProjectFromRequest] Found by subdomain:", {
          subdomain,
          project: project.slug,
        });
        return project;
      }
    }
  }

  // 3. Try to match from path (/projects/[slug]/...)
  const pathMatch = pathname.match(/^\/projects\/([^\/]+)/);
  if (pathMatch) {
    const slug = pathMatch[1];
    const [project] = await sql<Project[]>`
      SELECT id, name, slug, domain
      FROM projects
      WHERE slug = ${slug}
      LIMIT 1
    `;

    if (project) {
      console.log("[getProjectFromRequest] Found by path:", {
        slug,
        project: project.slug,
      });
      return project;
    }
  }

  // 4. For localhost or when no project found, use default
  if (hostname === "localhost" || hostname.startsWith("localhost:")) {
    const [project] = await sql<Project[]>`
      SELECT id, name, slug, domain
      FROM projects
      WHERE slug = 'default'
      LIMIT 1
    `;

    if (project) {
      console.log("[getProjectFromRequest] Using default project for localhost");
      return project;
    }
  }

  console.log("[getProjectFromRequest] No project found:", {
    hostname,
    pathname,
  });
  return null;
}

/**
 * Get project by slug
 */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const sql = getDb();
  const [project] = await sql<Project[]>`
    SELECT id, name, slug, domain
    FROM projects
    WHERE slug = ${slug}
    LIMIT 1
  `;
  return project || null;
}

/**
 * Get project by domain
 */
export async function getProjectByDomain(
  domain: string
): Promise<Project | null> {
  const sql = getDb();
  const [project] = await sql<Project[]>`
    SELECT id, name, slug, domain
    FROM projects
    WHERE domain = ${domain}
    LIMIT 1
  `;
  return project || null;
}

/**
 * Check if user has access to a project
 */
export async function checkProjectAccess(
  userId: string,
  projectId: string,
  requiredRole?: "viewer" | "editor" | "admin" | "owner"
): Promise<boolean> {
  const sql = getDb();
  const [member] = await sql<{ role: string }[]>`
    SELECT role FROM project_members
    WHERE user_id = ${userId} AND project_id = ${projectId}
  `;

  if (!member) return false;

  if (requiredRole) {
    const roleHierarchy = ["viewer", "editor", "admin", "owner"];
    const userRoleIndex = roleHierarchy.indexOf(member.role);
    const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);
    return userRoleIndex >= requiredRoleIndex;
  }

  return true;
}
