import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/postgres";
import { Sidebar } from "./Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export async function DashboardLayout({ children }: DashboardLayoutProps) {
  const session = await auth();

  // Redirect to login if not authenticated
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  // Get user's system role
  const sql = getDb();
  const [userData] = await sql`
    SELECT role FROM users WHERE id = ${session.user.id}
  `;

  const userRole = userData?.role || "user";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={{ ...session.user, role: userRole } as any} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
