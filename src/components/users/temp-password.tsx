import { CopyButton } from "@/components/copy-button";

/** Password temporanea mostrata una sola volta, con le istruzioni per chi la riceve. */
export function TempPassword({ email, password, ok }: { email?: string; password: string; ok?: string }) {
  return (
    <div className="rounded-sm border border-ok/30 bg-ok-soft p-3 text-[13px]">
      {ok && <div className="mb-2 font-medium text-ok">{ok}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-n700">Email:</span> <code className="font-mono">{email}</code>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="text-n700">Password temporanea:</span>
        <code className="rounded-xs bg-card px-1.5 py-0.5 font-mono text-[14px] tracking-wide">{password}</code>
        <CopyButton text={password} />
      </div>
      <p className="mt-2 text-xs text-n700">
        Si vede solo ora: comunicala in privato (non nella stessa email del link). Al primo accesso Event Studio chiede di sceglierne una nuova.
      </p>
    </div>
  );
}
