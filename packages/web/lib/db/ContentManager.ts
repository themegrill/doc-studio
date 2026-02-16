import { getDb } from "@/lib/db/postgres";
import { auth } from "@/lib/auth";

export interface DocMeta {
  id?: string;
  title: string;
  description?: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  published?: boolean;
  orderIndex?: number;
}

export interface Block {
  id: string;
  type: string;
  props?: any;
  content?: any[];
  children?: Block[];
}

export interface DocContent {
  id?: string;
  slug: string;
  title: string;
  description?: string;
  blocks: Block[];
  published?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Navigation {
  id?: string;
  title: string;
  version: string;
  routes: NavRoute[];
}

export interface NavRoute {
  id?: string;
  title: string;
  path?: string;
  slug?: string;
  children?: NavRoute[];
  orderIndex?: number;
}

export class ContentManager {
  private sql = getDb();

  constructor() {}

  static create() {
    return new ContentManager();
  }

  async getDoc(projectId: string, slug: string): Promise<DocContent | null> {
    try {
      const [doc] = await this.sql`
        SELECT * FROM documents
        WHERE project_id = ${projectId} AND slug = ${slug} AND published = true
        LIMIT 1
      `;

      if (!doc) {
        return null;
      }

      return {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        blocks: doc.blocks || [],
        published: doc.published,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      };
    } catch (error) {
      console.error("Error fetching document:", error);
      return null;
    }
  }

  async saveDoc(projectId: string, slug: string, content: Partial<DocContent>): Promise<boolean> {
    try {
      // Get current user from NextAuth
      const session = await auth();

      if (!session?.user?.id) {
        console.error("User not authenticated");
        return false;
      }

      // Check if document exists in this project
      const [existing] = await this.sql`
        SELECT id FROM documents WHERE project_id = ${projectId} AND slug = ${slug} LIMIT 1
      `;

      const title = content.title || "Untitled";
      const description = content.description || null;
      const blocks = content.blocks || [];
      const userId = session.user.id;

      if (existing) {
        // Update existing document
        await this.sql`
          UPDATE documents
          SET
            title = ${title},
            description = ${description},
            blocks = ${this.sql.json(blocks as any)},
            updated_by = ${userId}
          WHERE project_id = ${projectId} AND slug = ${slug}
        `;

        // Update title in navigation structure if it exists there
        const [nav] = await this.sql`
          SELECT id, structure FROM navigation
          WHERE project_id = ${projectId}
          ORDER BY updated_at DESC
          LIMIT 1
        `;

        if (nav && nav.structure) {
          const structure = nav.structure as Navigation;
          const docPath = `/docs/${slug}`;
          let titleUpdated = false;

          // Ensure routes array exists
          if (!structure.routes) {
            structure.routes = [];
          }

          // Check if this is a section overview (slug has no "/" - it's a top-level section)
          const isSectionOverview = !slug.includes("/");

          if (isSectionOverview) {
            // First, check if this document exists as a child in any section
            let isActuallyChild = false;
            structure.routes.forEach((route) => {
              if (route.children && route.children.length > 0) {
                const hasMatchingChild = route.children.some((child: any) => {
                  const childSlug = child.slug || child.path?.replace('/docs/', '');
                  return childSlug === slug;
                });
                if (hasMatchingChild) {
                  isActuallyChild = true;
                }
              }
            });

            // Only treat as section overview if it's NOT a child document
            if (!isActuallyChild) {
              // Update section title in navigation
              const sectionIndex = structure.routes.findIndex((route) => {
                // Only match sections with actual paths (not category sections)
                if (route.path === docPath) {
                  return true;
                }
                return false;
              });

              if (sectionIndex !== -1) {
                structure.routes[sectionIndex].title = title;
                titleUpdated = true;
              }
            }
          }

          // If not found as section overview, or if isSectionOverview is false, try as child document
          if (!titleUpdated) {
            // Update document title in navigation (inside a section)
            structure.routes = structure.routes.map((route) => {
              if (route.children && route.children.length > 0) {
                const childIndex = route.children.findIndex((child) => {
                  // Check multiple matching strategies to handle different navigation formats
                  if (child.path === docPath) {
                    return true;
                  }
                  if (child.slug === slug) {
                    return true;
                  }
                  // Also check path without /docs/ prefix
                  if (child.path === `/docs/${slug}`) {
                    return true;
                  }
                  return false;
                });

                if (childIndex !== -1) {
                  route.children[childIndex].title = title;
                  titleUpdated = true;
                }
              }
              return route;
            });
          }

          // Only update navigation if title was found and updated
          if (titleUpdated) {
            await this.sql`
              UPDATE navigation
              SET
                structure = ${this.sql.json(structure as any)},
                updated_by = ${userId}
              WHERE id = ${nav.id}
            `;
          }
        }
      } else {
        // Insert new document
        await this.sql`
          INSERT INTO documents (project_id, slug, title, description, blocks, created_by, updated_by, published)
          VALUES (
            ${projectId},
            ${slug},
            ${title},
            ${description},
            ${this.sql.json(blocks as any)},
            ${userId},
            ${userId},
            true
          )
        `;
      }

      return true;
    } catch (error) {
      console.error("Error saving document:", error);
      return false;
    }
  }

  async deleteDoc(projectId: string, slug: string): Promise<boolean> {
    try {
      // Get current user from NextAuth
      const session = await auth();

      if (!session?.user?.id) {
        console.error("User not authenticated");
        return false;
      }

      // Delete the document from database
      await this.sql`
        DELETE FROM documents
        WHERE project_id = ${projectId} AND slug = ${slug}
      `;

      // Remove from navigation
      const [nav] = await this.sql`
        SELECT id, structure FROM navigation
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      if (nav && nav.structure) {
        const structure = nav.structure as Navigation;
        const docPath = `/docs/${slug}`;

        // Ensure routes array exists
        if (!structure.routes) {
          structure.routes = [];
        }

        // Remove document from navigation structure
        const updatedRoutes = structure.routes.map((route) => {
          if (route.children) {
            return {
              ...route,
              children: route.children.filter((child) => child.path !== docPath)
            };
          }
          return route;
        });

        const updatedStructure = {
          ...structure,
          routes: updatedRoutes
        };

        // Update navigation using sql.json() for proper JSONB handling
        await this.sql`
          UPDATE navigation
          SET
            structure = ${this.sql.json(updatedStructure as any)},
            updated_by = ${session.user.id}
          WHERE id = ${nav.id}
        `;
      }

      return true;
    } catch (error) {
      console.error("Error deleting document:", error);
      return false;
    }
  }

  async listDocs(projectId: string): Promise<DocMeta[]> {
    try {
      const docs = await this.sql`
        SELECT id, slug, title, description, created_at, updated_at, published, order_index
        FROM documents
        WHERE project_id = ${projectId} AND published = true
        ORDER BY order_index ASC
      `;

      return docs.map((doc) => ({
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        description: doc.description,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        published: doc.published,
        orderIndex: doc.order_index,
      }));
    } catch (error) {
      console.error("Error listing documents:", error);
      return [];
    }
  }

  async getNavigation(projectId: string): Promise<Navigation> {
    try {
      const [nav] = await this.sql`
        SELECT * FROM navigation
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      if (!nav) {
        return {
          title: "Documentation",
          version: "1.0",
          routes: [],
        };
      }

      let structure = nav.structure;

      // Handle double-encoded JSON (stored as string)
      if (typeof structure === "string") {
        structure = JSON.parse(structure);
      }

      const navigation = structure as Navigation;

      // Ensure routes array exists
      if (!navigation.routes) {
        navigation.routes = [];
      }

      return navigation;
    } catch (error) {
      console.error("Error fetching navigation:", error);
      return {
        title: "Documentation",
        version: "1.0",
        routes: [],
      };
    }
  }

  async updateNavigation(projectId: string, navigation: Navigation): Promise<boolean> {
    try {
      // Get current user from NextAuth
      const session = await auth();

      if (!session?.user?.id) {
        console.error("User not authenticated");
        return false;
      }

      // Get the current navigation ID for this project
      const [current] = await this.sql`
        SELECT id FROM navigation
        WHERE project_id = ${projectId}
        ORDER BY updated_at DESC
        LIMIT 1
      `;

      if (current) {
        await this.sql`
          UPDATE navigation
          SET
            structure = ${this.sql.json(navigation)},
            updated_by = ${session.user.id}
          WHERE id = ${current.id}
        `;
      } else {
        // Create initial navigation for project
        await this.sql`
          INSERT INTO navigation (project_id, structure, updated_by)
          VALUES (${projectId}, ${this.sql.json(navigation)}, ${session.user.id})
        `;
      }

      return true;
    } catch (error) {
      console.error("Error updating navigation:", error);
      return false;
    }
  }
}
