"use client";

import { useState, useEffect } from "react";
import { AddMemberDialog } from "./AddMemberDialog";
import { EditMemberDialog } from "./EditMemberDialog";
import { DeleteMemberDialog } from "./DeleteMemberDialog";
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

interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  created_at: string;
}

interface ProjectMembersTableProps {
  projectSlug: string;
  currentUserRole: string;
}

export function ProjectMembersTable({
  projectSlug,
  currentUserRole,
}: ProjectMembersTableProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [deleteMember, setDeleteMember] = useState<Member | null>(null);

  const fetchMembers = async () => {
    try {
      const response = await fetch(`/api/projects/${projectSlug}/members`);
      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, [projectSlug]);

  const getUserInitials = (member: Member) => {
    return member.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase() || member.email[0].toUpperCase();
  };

  const getRoleBadgeVariant = (role: string): "owner" | "admin" | "editor" | "viewer" => {
    const roleMap: Record<string, "owner" | "admin" | "editor" | "viewer"> = {
      owner: "owner",
      admin: "admin",
      editor: "editor",
      viewer: "viewer",
    };
    return roleMap[role.toLowerCase()] || "viewer";
  };

  const getRoleLabel = (role: string): string => {
    return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
  };

  const canEditMember = (memberRole: string) => {
    if (currentUserRole === "owner") return true;
    if (currentUserRole === "admin" && memberRole !== "owner") return true;
    return false;
  };

  if (loading) {
    return <div className="text-center py-8">Loading members...</div>;
  }

  return (
    <>
      <div className="mb-4">
        <AddMemberDialog
          projectSlug={projectSlug}
          onMemberAdded={fetchMembers}
        />
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.image || undefined} />
                        <AvatarFallback className="text-xs">
                          {getUserInitials(member)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {member.name || "Unnamed User"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">{member.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(member.role)}>
                      {getRoleLabel(member.role)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-gray-600">
                      {formatDistance(new Date(member.created_at), new Date(), {
                        addSuffix: true,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {canEditMember(member.role) && (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditMember(member)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteMember(member)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total members: {members.length}
      </div>

      <EditMemberDialog
        member={editMember}
        projectSlug={projectSlug}
        open={!!editMember}
        onOpenChange={(open) => !open && setEditMember(null)}
        onMemberUpdated={fetchMembers}
      />

      <DeleteMemberDialog
        member={deleteMember}
        projectSlug={projectSlug}
        open={!!deleteMember}
        onOpenChange={(open) => !open && setDeleteMember(null)}
        onMemberDeleted={fetchMembers}
      />
    </>
  );
}
