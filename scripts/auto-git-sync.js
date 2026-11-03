import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let debounceTimer = null;
let isSyncing = false;

export function triggerGitAutoSync(reason = 'atualização automática') {
  if (isSyncing) return;
  isSyncing = true;

  exec('git status --porcelain', (err, stdout) => {
    if (err || !stdout || !stdout.trim()) {
      isSyncing = false;
      return;
    }

    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const commitMsg = `chore(auto-sync): ${reason} (${timestamp})`;

    exec(`git add -A && git commit -m "${commitMsg}" && git push origin main`, (pushErr, pushOut, pushStderr) => {
      isSyncing = false;
      if (pushErr) {
        console.warn('[Auto-Sync Git] Aviso ao sincronizar com GitHub:', pushStderr || pushErr.message);
      } else {
        console.log(`✅ [Auto-Sync Git] Alterações enviadas automaticamente para o GitHub (${timestamp})`);
      }
    });
  });
}

export function startGitAutoWatcher() {
  const watchTargets = ['src', 'server', 'public', 'README.md', 'index.html', 'package.json', 'vite.config.js'];

  for (const target of watchTargets) {
    const fullPath = path.resolve(process.cwd(), target);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const stat = fs.statSync(fullPath);
      fs.watch(
        fullPath,
        { recursive: stat.isDirectory() },
        (eventType, filename) => {
          if (filename && (filename.endsWith('.tmp') || filename.includes('.git'))) return;
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            triggerGitAutoSync(filename ? `arquivo ${filename} atualizado` : 'arquivos atualizados');
          }, 4000);
        }
      );
    } catch {
      // ignora se o SO não suportar watch em algum arquivo específico
    }
  }

  console.log('🔄 [Auto-Sync Git] Monitoramento ativo: qualquer alteração será enviada automaticamente ao GitHub.');
}

// Se executado diretamente via `npm run sync`
if (process.argv[1] && process.argv[1].endsWith('auto-git-sync.js')) {
  triggerGitAutoSync('sincronização manual/imediata');
}

