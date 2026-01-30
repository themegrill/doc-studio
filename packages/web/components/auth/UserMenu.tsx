"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";

export default function UserMenu() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  if (status === "loading") return null;
  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User size={16} />
        <span>{session.user.email}</span>
      </div>
      <Button
        onClick={handleSignOut}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <LogOut size={16} />
        Sign Out
      </Button>
    </div>
  );
}
