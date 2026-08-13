"use client";

import { useState } from "react";
import { ProjectMembersTable } from "./ProjectMembersTable";
import { MigrationImport } from "./MigrationImport";
import { ProjectGeneralSettings } from "./ProjectGeneralSettings";
import { Users, Settings, BookOpen, Globe, Upload, ArrowLeftRight, Puzzle, Database, ClipboardCheck } from "lucide-react";
import { KnowledgeBaseSettings } from "./KnowledgeBaseSettings";
import { DeploySettings } from "./DeploySettings";
import { RedirectsSettings } from "./RedirectsSettings";
import { IntegrationsSettings } from "./IntegrationsSettings";
import { SampleDataSettings } from "./SampleDataSettings";
import { EditorialGuidelinesSettings } from "@/components/settings/EditorialGuidelinesSettings";

interface DeployState {
  domain: string;
  status: "pending_dns" | "verified" | "active";
  dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }>;
  verification: Array<{ type: string; domain: string; value: string }>;
  addedAt: string;
  verifiedAt: string | null;
}

interface KbEntry {
  type: "upload" | "website" | "codebase" | "ui_flow";
  metadata: Record<string, unknown>;
  updatedAt: string;
}

interface Redirect {
  from: string;
  to: string;
}

interface ProjectSettingsTabsProps {
  projectSlug: string;
  projectId: string;
  projectName: string;
  projectDescription: string;
  projectMetadata: Record<string, any>;
  projectDomain: string | null;
  projectDeploy: DeployState | null;
  currentUserRole: string;
  isSuperAdmin: boolean;
  githubConfigured: boolean;
  existingKbs: KbEntry[];
  projectRedirects: Redirect[];
  projectIntegrations: Record<string, any>;
}

type TabType = "general" | "members" | "knowledge-base" | "import" | "deploy" | "redirects" | "integrations" | "guidelines" | "sample-data";

export function ProjectSettingsTabs({
  projectSlug,
  projectId,
  projectName,
  projectDescription,
  projectMetadata,
  projectDomain,
  projectDeploy,
  currentUserRole,
  isSuperAdmin,
  githubConfigured,
  existingKbs,
  projectRedirects,
  projectIntegrations,
}: ProjectSettingsTabsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("general");

  // The Sample Data tool is for local/dev testing only — never show it in production.
  const showSampleData = process.env.NODE_ENV !== "production";

  const tabs = [
    {
      id: "general" as const,
      label: "General",
      icon: Settings,
    },
    {
      id: "members" as const,
      label: "Members",
      icon: Users,
    },
    {
      id: "knowledge-base" as const,
      label: "Knowledge Base",
      icon: BookOpen,
    },
    {
      id: "deploy" as const,
      label: "Deploy",
      icon: Globe,
    },
    {
      id: "import" as const,
      label: "Import",
      icon: Upload,
    },
    {
      id: "redirects" as const,
      label: "Redirects",
      icon: ArrowLeftRight,
    },
    {
      id: "integrations" as const,
      label: "Integrations",
      icon: Puzzle,
    },
    {
      id: "guidelines" as const,
      label: "Guidelines",
      icon: ClipboardCheck,
    },
    {
      id: "sample-data" as const,
      label: "Sample Data",
      icon: Database,
    },
  ].filter((tab) => tab.id !== "sample-data" || showSampleData);

  return (
    <div className="bg-white rounded-lg border">
      {/* Tab Navigation */}
      <div className="border-b">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors
                  ${
                    isActive
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }
                `}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "general" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">General Settings</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage project details and settings
              </p>
            </div>

            <ProjectGeneralSettings
              projectSlug={projectSlug}
              projectId={projectId}
              projectName={projectName}
              projectDescription={projectDescription}
              projectMetadata={projectMetadata}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        )}

        {activeTab === "members" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Members</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage who has access to this project and their roles
              </p>
            </div>

            {isSuperAdmin && (
              <div className="mb-4 bg-purple-50 border border-purple-200 rounded-md p-3">
                <p className="text-sm text-purple-800">
                  You have full access to this project as a system administrator.
                </p>
              </div>
            )}

            <ProjectMembersTable
              projectSlug={projectSlug}
              currentUserRole={currentUserRole}
            />
          </div>
        )}
        {activeTab === "knowledge-base" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Knowledge Base</h2>
              <p className="text-sm text-gray-600 mt-1">
                Maintain knowledge base for the project
              </p>
            </div>

            <KnowledgeBaseSettings
              projectName={projectName}
              projectSlug={projectSlug}
              projectMetadata={projectMetadata}
              isSuperAdmin={isSuperAdmin}
              githubConfigured={githubConfigured}
              existingKbs={existingKbs}
            />
          </div>
        )}

        {activeTab === "deploy" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Deploy</h2>
              <p className="text-sm text-gray-600 mt-1">
                Configure a custom domain for this project&apos;s documentation site
              </p>
            </div>

            <DeploySettings
              projectSlug={projectSlug}
              initialDomain={projectDomain}
              initialDeploy={projectDeploy}
              isSuperAdmin={isSuperAdmin}
            />
          </div>
        )}

        {activeTab === "import" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Import Documentation</h2>
              <p className="text-sm text-gray-600 mt-1">
                Import documentation from BetterDocs CSV export
              </p>
            </div>

            <MigrationImport projectSlug={projectSlug} projectId={projectId} />
          </div>
        )}

        {activeTab === "redirects" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">URL Redirects</h2>
              <p className="text-sm text-gray-600 mt-1">
                Map old documentation URLs to their new locations. Redirects are applied with a 301 (permanent) status on the client site.
              </p>
            </div>

            <RedirectsSettings
              projectSlug={projectSlug}
              initialRedirects={projectRedirects}
            />
          </div>
        )}

        {activeTab === "guidelines" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Documentation Guidelines</h2>
              <p className="text-sm text-gray-600 mt-1">
                Override the org-wide editorial rules for this project. The
                site-name suffix, the product name and the approved category
                list are product-specific; everything else usually stays at the
                inherited value.
              </p>
            </div>

            <EditorialGuidelinesSettings projectSlug={projectSlug} />
          </div>
        )}

        {activeTab === "integrations" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Integrations</h2>
              <p className="text-sm text-gray-600 mt-1">
                Connect third-party services to your documentation site.
              </p>
            </div>

            <IntegrationsSettings
              projectSlug={projectSlug}
              initialIntegrations={projectIntegrations}
            />
          </div>
        )}

        {showSampleData && activeTab === "sample-data" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold">Sample Data</h2>
              <p className="text-sm text-gray-600 mt-1">
                Load realistic sample data into this project to test every feature, then clear it when you&apos;re done.
              </p>
            </div>

            <SampleDataSettings projectSlug={projectSlug} />
          </div>
        )}
      </div>
    </div>
  );
}
