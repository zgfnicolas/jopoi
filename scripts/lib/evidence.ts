import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function evidenceRevision() {
  const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", windowsHide: true });
  const files = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0")
    .filter(file => /^(src|tests|scripts|prisma|public)\//.test(file) || /^(package(-lock)?\.json|[^/]+\.config\.ts|tsconfig[^/]*\.json|vercel\.json)$/.test(file)).sort();
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file + "\0"); hash.update(readFileSync(file)); hash.update("\0"); }
  return { revision: git(["rev-parse", "HEAD"]).trim(), dirty: !!git(["status", "--porcelain"]).trim(), fingerprint: hash.digest("hex") };
}
