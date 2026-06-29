"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Database, Loader2, FileText, BookOpen, Users, ArrowLeftRight, Search, Bot } from "lucide-react";

interface Props {
  projectSlug: string;
}

const items = [
  { icon: FileText, text: "Docs & categories — nested topics + an empty category" },
  { icon: BookOpen, text: "Knowledge bases — one of each type (upload, website, codebase, ui_flow)" },
  { icon: Users, text: "Members — sample users with editor / viewer / admin roles" },
  { icon: ArrowLeftRight, text: "Redirects — a couple of sample rules" },
  { icon: Search, text: "SEO metadata — on the sample docs" },
  { icon: Bot, text: "AI usage logs — sample rows for the usage dashboard" },
];

export function SampleDataSettings({ projectSlug }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<null | "seed" | "clear">(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(method: "POST" | "DELETE") {
    setLoading(method === "POST" ? "seed" : "clear");
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/sample-data`, { method });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed. Please try again.");
        return;
      }
      if (method === "POST" && data.created) {
        const c = data.created;
        setMessage(`Loaded: ${c.categories} categories, ${c.docs} docs, ${c.knowledgeBases} KBs, ${c.members} members, ${c.redirects} redirects, ${c.aiLogs} AI logs.`);
      } else if (data.removed) {
        const r = data.removed;
        setMessage(`Cleared: ${r.docs} docs, ${r.knowledgeBases} KBs, ${r.members} members, ${r.users} users, ${r.redirects} redirects, ${r.aiLogs} AI logs.`);
      } else {
        setMessage("Done.");
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <Database className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Load sample data</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Populate this project with realistic sample data so every feature can be tested. Safe to
              re-run — it never duplicates or overwrites your existing content.
            </p>
          </div>
        </div>

        <ul className="space-y-2 mb-5">
          {items.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
              <Icon className="h-4 w-4 text-gray-400 shrink-0" />
              {text}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <Button onClick={() => run("POST")} disabled={loading !== null}>
            {loading === "seed" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Load sample data
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={loading !== null}>
                {loading === "clear" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Clear sample data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear sample data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes only the sample data added by this tool (sample docs, knowledge bases,
                  members, redirects, SEO, and AI logs). Your own content is left untouched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => run("DELETE")}>Clear</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {message && <p className="text-sm text-green-600 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
      </div>
    </div>
  );
}
