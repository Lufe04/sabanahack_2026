"use server";

import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { REVISIONES_HUMANAS, type RevisionHumana } from "@/db/schema";

/** Marca la revisión humana de una captura (confirmada, descartada o pendiente). */
export async function marcarRevision(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "") as RevisionHumana;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !REVISIONES_HUMANAS.includes(estado)) return;
  await getDb().execute(sql`
    UPDATE cultivos_registros
    SET revision_humana = ${estado}, revisado_en = ${estado === "pendiente" ? null : sql`now()`}
    WHERE id = ${id}
  `);
  revalidatePath(`/capturas/${id}`);
  revalidatePath("/capturas");
}
