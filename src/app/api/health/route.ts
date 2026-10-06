// Usata dal file di avvio per capire se Event Studio è già acceso (e non un altro programma sulla stessa porta).
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ app: "event-studio", ok: true });
}
