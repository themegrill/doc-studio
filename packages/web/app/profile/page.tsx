import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProfileSettingsForm } from "@/components/users/ProfileSettingsForm";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
          <p className="text-gray-600 mb-6">
            Update your profile information and preferences.
          </p>

          <div className="bg-white rounded-lg border p-6">
            <ProfileSettingsForm />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
