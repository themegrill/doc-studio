"use client";

import { useState } from "react";
import { EditUserDialog } from "./EditUserDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { UserProjectsDialog } from "./UserProjectsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Edit, Trash2 } from "lucide-react";
import { formatDistance } from "date-fns";

interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  created_at: string;
  project_count: number;
  role: string;
  projects: Array<{
    project_id: string;
    project_name: string;
    project_slug: string;
    role: string;
  }> | null;
}

interface UsersTableProps {
  users: User[];
  currentUserRole?: string;
}

export function UsersTable({ users, currentUserRole }: UsersTableProps) {
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [projectsUser, setProjectsUser] = useState<User | null>(null);

  const getUserInitials = (user: User) => {
    return user.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || user.email[0].toUpperCase();
  };

  const getRoleBadgeVariant = (role: string): "owner" | "admin" | "editor" | "viewer" => {
    const roleMap: Record<string, "owner" | "admin" | "editor" | "viewer"> = {
      owner: "owner",     // purple
      admin: "admin",     // blue
      editor: "editor",   // green
      viewer: "viewer",   // gray
    };
    return roleMap[role.toLowerCase()] || "viewer";
  };

  const getRoleLabel = (role: string): string => {
    // Capitalize first letter
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  return (
    <>
      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Projects</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.image || undefined} />
                        <AvatarFallback className="text-xs">
                          {getUserInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {user.name || "Unnamed User"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">{user.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => setProjectsUser(user)}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                    >
                      {user.project_count} {user.project_count === 1 ? "project" : "projects"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDistance(new Date(user.created_at), new Date(), {
                        addSuffix: true,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditUser(user)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteUser(user)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total users: {users.length}
      </div>

      <EditUserDialog
        user={editUser}
        open={!!editUser}
        onOpenChange={(open) => !open && setEditUser(null)}
        currentUserRole={currentUserRole}
      />

      <DeleteUserDialog
        user={deleteUser}
        open={!!deleteUser}
        onOpenChange={(open) => !open && setDeleteUser(null)}
      />

      <UserProjectsDialog
        user={projectsUser}
        open={!!projectsUser}
        onOpenChange={(open) => !open && setProjectsUser(null)}
      />
    </>
  );
}
