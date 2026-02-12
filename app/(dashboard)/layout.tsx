import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";

export default async function DashboardLayout({
  children,
}: { children: React.ReactNode }) {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in");

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">User not found. Please try signing in again.</p>
      </div>
    );
  }

  if (!user.targetRole && !user.experience) {
    redirect("/onboarding");
  }

  // Check if user is onboarded (onboardedAt is not null)
  const isOnboarded = user.onboardedAt !== null;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-lg">
            HirinAi
          </Link>
          <nav className="flex items-center gap-4">
            {/* Show full nav menu only after onboarding */}
            {isOnboarded ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm">Dashboard</Button>
                </Link>
                <Link href="/interview/new">
                  <Button size="sm">New Interview</Button>
                </Link>
                <Link href="/sessions">
                  <Button variant="ghost" size="sm">Sessions</Button>
                </Link>
                <Link href="/profile">
                  <Button variant="ghost" size="sm">Profile</Button>
                </Link>
              </>
            ) : null}
            {/* Always show Clerk profile button */}
            <UserButton />
          </nav>
        </div>
      </header>
      <main className="container py-6">{children}</main>
    </div>
  );
}
