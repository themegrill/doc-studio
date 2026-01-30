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
  title: string;
  path: string;
  children?: NavRoute[];
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

      return nav.structure as Navigation;
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
            structure = ${JSON.stringify(navigation)}::jsonb,
            updated_by = ${session.user.id}
          WHERE id = ${current.id}
        `;
      } else {
        // Create initial navigation for project
        await this.sql`
          INSERT INTO navigation (project_id, structure, updated_by)
          VALUES (${projectId}, ${JSON.stringify(navigation)}::jsonb, ${session.user.id})
        `;
      }

      return true;
    } catch (error) {
      console.error("Error updating navigation:", error);
      return false;
    }
  }
}
