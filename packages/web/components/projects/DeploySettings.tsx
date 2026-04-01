"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Loader2,
  Globe,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Rocket,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DnsRecord {
  type: string;
  name: string;
  value: string;
  purpose: string;
}

interface DeployState {
  domain: string;
  status: "pending_dns" | "verified" | "active";
  dnsRecords: DnsRecord[];
  verification: Array<{ type: string; domain: string; value: string }>;
  addedAt: string;
  verifiedAt: string | null;
}

type DeploymentState = "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";

interface Deployment {
  id: string;
  url: string | null;
  state: DeploymentState;
  createdAt: string;
}

interface DeploySettingsProps {
  projectSlug: string;
  initialDomain: string | null;
  initialDeploy: DeployState | null;
  isSuperAdmin: boolean;
}

const DOMAIN_STATUS_CONFIG = {
  pending_dns: {
    label: "Pending DNS",
    icon: Clock,
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
    iconClass: "text-yellow-500",
  },
  verified: {
    label: "DNS Verified",
    icon: CheckCircle2,
    className: "bg-blue-50 text-blue-700 border-blue-200",
    iconClass: "text-blue-500",
  },
  active: {
    label: "Active",
    icon: ShieldCheck,
    className: "bg-green-50 text-green-700 border-green-200",
    iconClass: "text-green-500",
  },
} as const;

const DEPLOYMENT_STATUS_CONFIG: Record<
  DeploymentState,
  { label: string; className: string; iconClass: string }
> = {
  QUEUED: {
    label: "Queued",
    className: "bg-gray-50 text-gray-600 border-gray-200",
    iconClass: "text-gray-400",
  },
  BUILDING: {
    label: "Building",
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
    iconClass: "text-yellow-500",
  },
  READY: {
    label: "Deployed",
    className: "bg-green-50 text-green-700 border-green-200",
    iconClass: "text-green-500",
  },
  ERROR: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border-red-200",
    iconClass: "text-red-500",
  },
  CANCELED: {
    label: "Canceled",
    className: "bg-gray-50 text-gray-500 border-gray-200",
    iconClass: "text-gray-400",
  },
};

export function DeploySettings({
  projectSlug,
  initialDomain,
  initialDeploy,
  isSuperAdmin,
}: DeploySettingsProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [domain, setDomain] = useState(initialDomain);
  const [deploy, setDeploy] = useState<DeployState | null>(initialDeploy);
  const [domainInput, setDomainInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling when component unmounts or deployment reaches terminal state
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollDeploymentStatus = (deploymentId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/projects/${projectSlug}/domain/deploy?id=${deploymentId}`
        );
        if (!res.ok) { stopPolling(); return; }

        const data: Deployment = await res.json();
        setDeployment(data);

        if (!["QUEUED", "INITIALIZING", "BUILDING"].includes(data.state)) {
          stopPolling();
          setIsDeploying(false);
          if (data.state === "READY") {
            toast({ title: "Deployment successful!", description: "Your docs are live." });
          } else if (data.state === "ERROR") {
            toast({ title: "Deployment failed", description: "Check Vercel dashboard for details.", variant: "destructive" });
          }
        }
      } catch {
        stopPolling();
        setIsDeploying(false);
      }
    }, 4000);
  };

  const handleAddDomain = async () => {
    const trimmed = domainInput.trim().toLowerCase();
    if (!trimmed) {
      toast({ title: "Error", description: "Please enter a domain", variant: "destructive" });
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add domain");

      setDomain(trimmed);
      setDeploy(data.deploy);
      setDomainInput("");
      toast({ title: "Domain added", description: "Configure the DNS records shown below." });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to add domain",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleVerify = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/domain/verify`, {
        method: "POST",
      });

      let data: { error?: string; status?: string; deploy?: DeployState };
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid response from server");
      }
      if (!res.ok) throw new Error(data?.error ?? "Failed to verify domain");

      setDeploy(data.deploy ?? null);

      if (data.status === "active") {
        toast({ title: "Domain is active!", description: "DNS is verified and SSL is ready." });
      } else if (data.status === "verified") {
        toast({ title: "DNS verified", description: "SSL certificate is being provisioned." });
      } else {
        toast({
          title: "DNS not yet propagated",
          description: "Please check your DNS records and try again in a few minutes.",
          variant: "destructive",
        });
      }

      router.refresh();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to verify",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeploy = async () => {
    setIsDeploying(true);
    setDeployment(null);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/domain/deploy`, {
        method: "POST",
      });

      let data: { error?: string; deployment?: Deployment };
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid response from server");
      }
      if (!res.ok) throw new Error(data?.error ?? "Failed to trigger deployment");

      const dep = data.deployment!;
      setDeployment(dep);
      toast({ title: "Deployment started", description: "Building your client project on Vercel." });
      pollDeploymentStatus(dep.id);
    } catch (err) {
      setIsDeploying(false);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to deploy",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/projects/${projectSlug}/domain`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove domain");

      setDomain(null);
      setDeploy(null);
      setDeployment(null);
      stopPolling();
      toast({ title: "Domain removed" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to remove domain",
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const statusCfg = deploy ? DOMAIN_STATUS_CONFIG[deploy.status] : null;
  const canDeploy =
    isSuperAdmin && deploy && (deploy.status === "verified" || deploy.status === "active");

  return (
    <div className="space-y-6">
      {/* Current domain card */}
      {domain && deploy ? (
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">{domain}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Added {new Date(deploy.addedAt).toLocaleDateString()}
                  {deploy.verifiedAt &&
                    ` · Verified ${new Date(deploy.verifiedAt).toLocaleDateString()}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {statusCfg && (
                <span
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${statusCfg.className}`}
                >
                  <statusCfg.icon className={`h-3.5 w-3.5 ${statusCfg.iconClass}`} />
                  {statusCfg.label}
                </span>
              )}

              {isSuperAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleVerify}
                    disabled={isVerifying || deploy.status === "active"}
                  >
                    {isVerifying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">
                      {deploy.status === "active" ? "Verified" : "Check DNS"}
                    </span>
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={isRemoving}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove domain?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will remove <strong>{domain}</strong> from the Vercel project
                          and clear all DNS configuration. Your DNS records won&apos;t be
                          deleted automatically — you&apos;ll need to remove them from your
                          DNS provider.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleRemove}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Remove Domain
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Add domain card */
        isSuperAdmin && (
          <div className="bg-white border rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-1">Custom Domain</h3>
            <p className="text-sm text-gray-600 mb-4">
              Set a custom domain so users access this project&apos;s docs at your own URL
              (e.g.&nbsp;<span className="font-mono text-gray-800">help.yourcompany.com</span>).
            </p>
            <div className="flex gap-2 max-w-lg">
              <div className="flex-1">
                <Label htmlFor="domain-input" className="sr-only">
                  Domain
                </Label>
                <Input
                  id="domain-input"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="help.yourcompany.com"
                  onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                />
              </div>
              <Button onClick={handleAddDomain} disabled={isAdding}>
                {isAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Domain"
                )}
              </Button>
            </div>
          </div>
        )
      )}

      {/* DNS records card */}
      {deploy && deploy.dnsRecords?.length > 0 && deploy.status !== "active" && (
        <div className="bg-white border rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-1">DNS Configuration</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add the following records to your DNS provider. Changes can take up to 48&nbsp;hours
            to propagate.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 pr-4 font-medium text-gray-600 w-16">Type</th>
                  <th className="pb-2 pr-4 font-medium text-gray-600">Name</th>
                  <th className="pb-2 pr-4 font-medium text-gray-600">Value</th>
                  <th className="pb-2 font-medium text-gray-600">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {deploy.dnsRecords.map((record, i) => (
                  <tr key={i} className="group">
                    <td className="py-3 pr-4">
                      <span className="inline-block font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                        {record.type}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-gray-800 max-w-[160px] truncate">
                      {record.name}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-800 break-all">
                          {record.value}
                        </span>
                        <button
                          onClick={() => copyToClipboard(record.value, i)}
                          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy value"
                        >
                          {copiedIndex === i ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3 text-xs text-gray-500">{record.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {deploy.status === "pending_dns" && (
            <div className="mt-4 flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <p className="text-sm text-yellow-800">
                After adding the DNS records, click <strong>Check DNS</strong> to verify
                propagation and activate SSL.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleVerify}
                disabled={isVerifying}
                className="ml-4 shrink-0"
              >
                {isVerifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1.5">Check DNS</span>
              </Button>
            </div>
          )}

          {deploy.status === "verified" && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-md p-3">
              <p className="text-sm text-blue-800">
                DNS is verified. Vercel is provisioning your SSL certificate — this usually
                takes a few minutes. Click <strong>Check DNS</strong> to refresh the status.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Active state card */}
      {deploy?.status === "active" && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="font-medium text-green-900">Domain is live</p>
              <p className="text-sm text-green-700 mt-0.5">
                Your docs are accessible at{" "}
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  https://{domain}
                </a>
                {" "}with a valid SSL certificate.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Deploy card — shown once DNS is verified */}
      {canDeploy && (
        <div className="bg-white border rounded-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">Deploy</h3>
              <p className="text-sm text-gray-600 mt-1">
                Push the latest version of the client project to Vercel and serve it at your domain.
              </p>
            </div>

            <Button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="shrink-0"
            >
              {isDeploying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Deploy
                </>
              )}
            </Button>
          </div>

          {/* Deployment status */}
          {deployment && (
            <div className="mt-4 border rounded-md p-4 bg-gray-50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  {["BUILDING", "QUEUED", "INITIALIZING"].includes(deployment.state) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-500 shrink-0" />
                  ) : deployment.state === "READY" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}

                  <div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${
                        (DEPLOYMENT_STATUS_CONFIG[deployment.state] ?? DEPLOYMENT_STATUS_CONFIG.QUEUED).className
                      }`}
                    >
                      {(DEPLOYMENT_STATUS_CONFIG[deployment.state] ?? DEPLOYMENT_STATUS_CONFIG.QUEUED).label}
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Started {new Date(deployment.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {deployment.url && deployment.state === "READY" && (
                  <a
                    href={deployment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0"
                  >
                    View deployment
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}