import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { MARGEM_PREPARO_PADRAO_MIN, validarHorarioPedido } from "@/lib/horarioMinimo";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const scheduledDate = typeof body?.scheduledDate === "string" ? body.scheduledDate.trim() : "";
    const scheduledTime = typeof body?.scheduledTime === "string" ? body.scheduledTime.trim() : "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
      return Response.json({ error: "Data do pedido ausente ou inválida." }, { status: 400 });
    }
    if (!/^\d{1,2}:\d{2}$/.test(scheduledTime)) {
      return Response.json({ error: "Horário do pedido ausente ou inválido." }, { status: 400 });
    }

    const snap = await getDoc(doc(db, "configuracoes", "loja"));
    const bruto = (snap.data() as { margemPreparoMinutos?: unknown } | undefined)?.margemPreparoMinutos;
    const numero = bruto === undefined || bruto === null || bruto === "" ? NaN : Number(bruto);
    const margem = Number.isFinite(numero) && numero >= 0 ? numero : MARGEM_PREPARO_PADRAO_MIN;

    const resultado = validarHorarioPedido({
      scheduledDate,
      scheduledTime,
      margemPreparoMinutos: margem,
    });

    if (!resultado.ok) {
      return Response.json({ ok: false, error: resultado.error }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("validar-horario error:", err);
    return Response.json({ error: "Erro ao validar horário." }, { status: 500 });
  }
}
