import { spawn } from "cross-spawn";

export function run(cmd: string, args: string[], opts: any = {}): Promise<{code:number, stdout:string, stderr:string}> {
  return new Promise((resolve) => {
    const ps = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    let stdout = "", stderr = "";
    ps.stdout.on("data", (d)=> stdout += d.toString());
    ps.stderr.on("data", (d)=> stderr += d.toString());
    ps.on("close", (code)=> resolve({ code: code ?? -1, stdout, stderr }));
  });
}

export async function runOrThrow(cmd:string, args:string[], opts:any={}, label?:string) {
  const r = await run(cmd,args,opts);
  if (r.code !== 0) throw new Error(`[${label||cmd}] exit ${r.code}\n${r.stderr || r.stdout}`);
  return r;
}
