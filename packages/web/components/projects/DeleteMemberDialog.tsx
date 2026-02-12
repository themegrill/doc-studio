"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Member {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  role: string;
}

interface DeleteMemberDialogProps {
  member: Member | null;
  projectSlug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMemberDeleted: () => void;
}

export function DeleteMemberDialog({
  member,
  projectSlug,
  open,
  onOpenChange,
  onMemberDeleted,
}: DeleteMemberDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!member) return;

    setLoading(true);

    try {
      const response = await fetch(
        `/api/projects/${projectSlug}/members/${member.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove member");
      }

      toast({
        title: "Member removed",
        description: `${member.name || member.email} has been removed from the project`,
      });

      onOpenChange(false);
      onMemberDeleted();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove member",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Member</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove{" "}
            <strong>{member?.name || member?.email}</strong> from this project?
            They will lose all access immediately.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Remove Member
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
