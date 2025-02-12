import * as os from 'os';
import * as cp from 'child_process';
import * as vscode from 'vscode';


async function getCmdVersion(cmd: string): Promise<string> {
  return new Promise(resolve => {
    cp.exec(`${cmd} --version`, (err, stdout) => {
      if (err) {
        resolve('Not installed');
      } else {
        resolve(stdout.trim());
      }
    });
  });
}


export async function getSystemDiagnostics(): Promise<Record<string, string>> {
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : '';
  const vscodeVer = await getCmdVersion('code');
  const elanVer = await getCmdVersion('elan');
  const leanVer = await getCmdVersion('lean');
  const lakeVer = await getCmdVersion('lake');

  return {
    'Operating system': `${os.type()} ${os.release()}`,
    'CPU architecture': os.arch(),
    'CPU model': cpuModel,
    'Total memory (GB)': (os.totalmem() / 1_000_000_000).toFixed(2),
    'Elan version': elanVer,
    'Lean version': leanVer,
    'Lake version': lakeVer,
    'VSCode version': vscodeVer,
    'Lean 4 extension version': vscode.extensions.getExtension('leanprover.lean4')?.packageJSON.version
  };
}