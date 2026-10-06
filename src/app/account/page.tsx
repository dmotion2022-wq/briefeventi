import { redirect } from "next/navigation";
import { logoutAction, logoutEverywhereAction } from "@/auth/actions";
import { activeSessionCount, authEnabled, getCurrentUser } from "@/auth/session";
import { PasswordForm } from "@/components/auth/password-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Account" };

// Qui non si usa requireUser: chi deve cambiare la password temporanea arriva proprio su questa pagina.
export default async function AccountPage(props: PageProps<"/account">) {
  if (!authEnabled()) redirect("/");
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");
  const sp = await props.searchParams;
  const forced = user.mustChangePassword || sp.cambio === "1";
  const sessions = await activeSessionCount(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Account" title={user.name} description={`${user.email} · ${user.role === "admin" ? "amministratore" : "membro del team"}`} />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title={forced ? "Scegli la tua password" : "Cambia password"}
            description={
              forced
                ? "Stai usando una password temporanea: sceglierne una tua è il primo passo, poi Event Studio si apre."
                : "La nuova password vale subito; le altre sessioni aperte vengono chiuse."
            }
          />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Sessioni" description={`Accessi aperti con il tuo utente: ${sessions}.`} />
          <CardBody className="flex flex-wrap gap-2">
            <form action={logoutAction}>
              <SubmitButton variant="secondary">Esci</SubmitButton>
            </form>
            <form action={logoutEverywhereAction}>
              <SubmitButton variant="ghost">Esci da tutti i dispositivi</SubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
