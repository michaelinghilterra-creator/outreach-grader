// Run a one-shot prompt on the user's Claude PLAN (their `claude login`), via the
// bundled Claude Code CLI — no Anthropic API key needed.
import { spawn } from 'child_process';
import os from 'os';

function modelAlias(model) {
  if (!model) return null;
  const m = String(model).toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return /^claude-[a-z0-9.-]+$/i.test(m) ? model : null;
}

function startErr(e) {
  if (e && e.code === 'ENOENT') {
    return 'Claude Code CLI not found. Make sure `claude` is installed and on your PATH, then retry.';
  }
  return (e && e.message) || 'Failed to start Claude Code.';
}

function planErr(msg, stderr) {
  const all = `${msg || ''}\n${stderr || ''}`;
  if (/not recognized|command not found|ENOENT/i.test(all)) {
    return 'Claude Code CLI not found. Make sure `claude` is installed and on your PATH.';
  }
  if (/\b401\b|login|authenticat|unauthor|not logged in|sign ?in|token (?:expired|invalid)/i.test(all)) {
    return 'Not signed in to Claude. Run `claude login` in a terminal, then retry.';
  }
  return msg || 'Claude Code failed to generate a response.';
}

export function runClaudePrompt(prompt, { model, system, timeoutMs = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const alias = modelAlias(model);
    const args = ['-p', '--output-format', 'json', '--no-session-persistence'];
    if (alias) args.push('--model', alias);

    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    let child;
    try {
      child = spawn('claude', args, { cwd: os.tmpdir(), env, shell: isWin, windowsHide: true });
    } catch (e) {
      return reject(new Error(startErr(e)));
    }

    let out = '', err = '', settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; clearTimeout(timer); fn(val); } };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { }
      finish(reject, new Error('Claude timed out. Try again.'));
    }, timeoutMs);

    child.on('error', (e) => finish(reject, new Error(startErr(e))));
    child.stdout && child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr && child.stderr.on('data', (d) => { err += d.toString(); });

    if (child.stdin) {
      try {
        child.stdin.write(system ? `${system}\n\n${prompt}` : prompt);
        child.stdin.end();
      } catch { }
    }

    child.on('close', (code) => {
      let parsed = null;
      try { parsed = JSON.parse(out.trim()); } catch { }
      if (parsed && typeof parsed.result === 'string' && !parsed.is_error) {
        return finish(resolve, parsed.result);
      }
      if (parsed && parsed.is_error) {
        return finish(reject, new Error(planErr(parsed.result, err)));
      }
      if (code !== 0) {
        return finish(reject, new Error(planErr(err || `claude exited ${code}`, err)));
      }
      if (out.trim()) return finish(resolve, out.trim());
      return finish(reject, new Error(planErr(err || 'Claude returned no output', err)));
    });
  });
}
