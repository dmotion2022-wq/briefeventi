import { redirect } from "next/navigation";
import { safeNextPath } from "@/auth/next-path";
import { authEnabled, getCurrentUser } from "@/auth/session";
import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Accesso" };

export default async function LoginPage(props: PageProps<"/login">) {
  if (!authEnabled()) redirect("/");
  const sp = await props.searchParams;
  const next = safeNextPath(sp.next);
  if (await getCurrentUser().catch(() => null)) redirect(next);

  return (
    <div className="flex min-h-[80vh] w-full items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 rounded-md bg-ink px-5 py-4 text-paper">
          <Logo />
        </div>
        <div className="rounded-md border border-line bg-card p-6 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold tracking-tight">Accedi</h1>
          <p className="mb-5 text-[13px] text-n500">Event Studio è riservato al team: l&apos;accesso lo crea l&apos;amministratore.</p>
          <LoginForm next={next} />
        </div>
      </div>
    </div>
  );
}
