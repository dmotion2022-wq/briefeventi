import { asc } from "drizzle-orm";
import { authEnabled, requireUser } from "@/auth/session";
import { getDb, schema } from "@/db/client";
import { CreateUserForm } from "@/components/users/create-user-form";
import { UserActions } from "@/components/users/user-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { formatDateTime } from "@/lib/labels";

export const metadata = { title: "Utenti" };

export default async function UsersPage() {
  const me = await requireUser();
  if (!authEnabled()) {
    return <EmptyState title="Gli utenti servono online">Sul Mac Event Studio non ha login e risponde solo da questo computer.</EmptyState>;
  }
  if (me.role !== "admin") return <EmptyState title="Solo per amministratori">Gli accessi li gestisce chi amministra Event Studio.</EmptyState>;
  const users = await getDb().select().from(schema.users).orderBy(asc(schema.users.name)).all();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Sistema"
        title="Utenti"
        description="Chi può entrare in Event Studio online. Gli amministratori gestiscono anche utenti e impostazioni; i membri del team lavorano su progetti e archivio."
      />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Nuovo accesso" description="L'utente riceve una password temporanea e al primo accesso ne sceglie una sua." />
          <CardBody>
            <CreateUserForm />
          </CardBody>
        </Card>
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Utente</Th>
                <Th>Ruolo</Th>
                <Th>Stato</Th>
                <Th>Ultimo accesso</Th>
                <Th />
              </tr>
            </THead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <div className="font-medium">
                      {u.name} {u.id === me.id && <span className="text-n500">(tu)</span>}
                    </div>
                    <div className="font-mono text-[12px] text-n500">{u.email}</div>
                  </Td>
                  <Td>{u.role === "admin" ? <Badge tone="violet">amministratore</Badge> : <Badge>membro</Badge>}</Td>
                  <Td>
                    {!u.active ? (
                      <Badge tone="warn">disattivato</Badge>
                    ) : u.mustChangePassword ? (
                      <Badge tone="amber">password temporanea</Badge>
                    ) : (
                      <Badge tone="ok">attivo</Badge>
                    )}
                  </Td>
                  <Td className="text-n500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "mai"}</Td>
                  <Td>
                    <UserActions id={u.id} name={u.name} active={u.active} role={u.role} self={u.id === me.id} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
