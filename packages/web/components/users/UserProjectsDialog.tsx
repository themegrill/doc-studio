"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Folder } from "lucide-react";

interface Project {
  project_id: string;
  project_name: string;
  project_slug: string;
  role: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  projects: Project[] | null;
}

interface UserProjectsDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getRoleBadgeVariant(role: string): "owner" | "admin" | "editor" | "viewer" {
  const roleMap: Record<string, "owner" | "admin" | "editor" | "viewer"> = {
    owner: "owner",
    admin: "admin",
    editor: "editor",
    viewer: "viewer",
  };
  return roleMap[role.toLowerCase()] || "viewer";
}

export function UserProjectsDialog({ user, open, onOpenChange }: UserProjectsDialogProps) {
  if (!user) return null;

  const projects = user.projects || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Projects for {user.name || user.email}</DialogTitle>
          <DialogDescription>
            {projects.length} {projects.length === 1 ? "project" : "projects"} membership
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {projects.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No projects assigned</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <div
                  key={project.project_id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-lg">
                      <Folder className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">{project.project_name}</p>
                      <p className="text-sm text-gray-500">/{project.project_slug}</p>
                    </div>
                  </div>
                  <Badge variant={getRoleBadgeVariant(project.role)}>
                    {project.role}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
