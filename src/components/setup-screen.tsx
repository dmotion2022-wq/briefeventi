import { CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { cloudSetupChecks } from "@/lib/cloud-setup";

/** Pagina mostrata online finché nel progetto Vercel mancano database o archivio dei file. */
export function SetupScreen() {
  const checks = cloudSetupChecks();
  return (
    <div className="mx-auto w-full max-w-2xl py-10">
      <div className="eyebrow mb-2">Event Studio · prima configurazione</div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">Manca ancora qualcosa su Vercel</h1>
      <p className="mb-6 text-[14px] text-n700">
        Il sito è online, ma per partire servono il database e l&apos;archivio dei file. Aggiungili nel progetto su vercel.com, poi
        vai in <b>Deployments</b>, apri il menu <b>⋯</b> dell&apos;ultima versione e scegli <b>Redeploy</b>: questa pagina sparisce da sola.
      </p>
      <div className="flex flex-col gap-3">
        {checks.map((c) => (
          <div key={c.key} className="flex gap-3 rounded-md border border-line bg-card p-4">
            <div className="mt-0.5">
              {c.ok ? (
                <CircleCheck size={18} className="text-ok" />
              ) : c.required ? (
                <TriangleAlert size={18} className="text-warn" />
              ) : (
                <CircleDashed size={18} className="text-amber" />
              )}
            </div>
            <div className="min-w-0">
              <div className="font-medium">
                {c.label} <span className="text-[12px] font-normal text-n500">{c.ok ? "· a posto" : c.required ? "· da fare" : "· consigliato"}</span>
              </div>
              {!c.ok && <div className="mt-1 text-[13px] text-n700">{c.how}</div>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-n500">
        Le chiavi e le password stanno solo nelle variabili d&apos;ambiente del progetto: il codice su GitHub è pubblico e non ne contiene.
      </p>
    </div>
  );
}
