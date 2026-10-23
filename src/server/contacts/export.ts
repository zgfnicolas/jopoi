// Núcleo privado de CLI: cliente y raíz explícitos, sin HTTP, entorno ni marcador server-only.
import { randomUUID } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { PrismaClient } from "../../generated/prisma/client";

const PAGE_SIZE = 500;
const HEADERS = ["fecha_solicitud", "nombre", "email", "empresa", "mensaje"];

export class ContactExportCleanupError extends Error {
  constructor() {
    super("CONTACT_EXPORT_CLEANUP_REQUIRED");
    this.name = "ContactExportCleanupError";
  }
}

/** Protección orientada a Excel; solo cambia la copia, nunca los datos de SQL. */
function csvCell(value: string): string {
  const dangerous = /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@＝＋－＠]/u.test(value) || /^[\t\r\n]/u.test(value);
  const text = dangerous ? `\t${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: readonly string[]): string {
  return `${values.map(csvCell).join(";")}\r\n`;
}

export async function exportContacts(client: PrismaClient, root: string): Promise<{ count: number; file: string }> {
  const cutoff = new Date();
  const directory = resolve(root, ".cache", "exports");
  const file = resolve(directory, `contacts-${cutoff.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.csv`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Fuera del try: si wx falla, no cerrar ni borrar un archivo preexistente.
  const handle = await open(file, "wx", 0o600);
  try {
    await handle.writeFile(`\uFEFF${csvRow(HEADERS)}`, "utf8");
    let count = 0;
    let after: { createdAt: Date; id: string } | undefined;
    while (true) {
      const rows = await client.demoRequest.findMany({
        where: {
          createdAt: { lte: cutoff },
          expiresAt: { gt: cutoff },
          ...(after === undefined ? {} : {
            OR: [
              { createdAt: { gt: after.createdAt } },
              { createdAt: after.createdAt, id: { gt: after.id } },
            ],
          }),
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: PAGE_SIZE,
        select: { id: true, createdAt: true, name: true, email: true, company: true, message: true },
      });
      const last = rows.at(-1);
      if (last === undefined) break;
      await handle.writeFile(rows.map((row) => csvRow([
        row.createdAt.toISOString(), row.name, row.email, row.company, row.message ?? "",
      ])).join(""), "utf8");
      count += rows.length;
      if (rows.length < PAGE_SIZE) break;
      after = { createdAt: last.createdAt, id: last.id };
    }
    await handle.sync();
    await handle.close();
    return { count, file };
  } catch (error) {
    try { await handle.close(); } catch { /* El cierre ya pudo haberse completado. */ }
    try { await unlink(file); } catch { throw new ContactExportCleanupError(); }
    throw error;
  }
}
