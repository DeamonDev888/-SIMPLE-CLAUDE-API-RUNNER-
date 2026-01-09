import { z } from 'zod';
import { spawn } from 'child_process';
import { CONFIG, resolveConfigPath } from '../lib/config.js';
export const runAgentSchema = z.object({
    prompt: z.string().describe("Le prompt à envoyer à l'agent"),
    sessionId: z.string().optional().describe("ID de session pour continuer une conversation"),
    agentName: z.string().optional().describe("Nom de l'agent (pour logging/monitoring)")
});
export async function runClaudeAgent(args) {
    const { prompt, sessionId } = args;
    const { CORE, PERMISSIONS, PATHS } = CONFIG.CLAUDE;
    const settingsPath = resolveConfigPath(PATHS.SETTINGS);
    const mcpPath = resolveConfigPath(PATHS.MCP);
    const safePath = (p) => p.includes(' ') ? `"${p}"` : p;
    let command = `claude ${CORE} ${PERMISSIONS} --settings ${safePath(settingsPath)} --mcp-config ${safePath(mcpPath)}`;
    if (sessionId) {
        command += ` --resume ${sessionId}`;
    }
    console.error(`🚀 Exec Claude: ${command.substring(0, 100)}...`); // stderr for logging in MCP
    return new Promise((resolve, reject) => {
        const child = spawn(command, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: process.cwd(),
            shell: true
        });
        let stdout = '';
        let stderr = '';
        if (child.stdout) {
            child.stdout.on('data', (d) => stdout += d.toString());
        }
        if (child.stderr) {
            child.stderr.on('data', (d) => stderr += d.toString());
        }
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error(`Timeout (${CONFIG.TIMEOUT_MS}ms)`));
        }, CONFIG.TIMEOUT_MS);
        child.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                console.error("⚠️ Stderr:", stderr);
                if (!stdout)
                    return reject(new Error(stderr || `Exit code ${code}`));
            }
            try {
                // Claude returns JSON { type: 'result', content: '...', session_id: '...' }
                const response = JSON.parse(stdout.trim());
                resolve({
                    content: [{ type: 'text', text: response.result || JSON.stringify(response) }],
                    metadata: { sessionId: response.session_id }
                });
            }
            catch (e) {
                // Fallback raw text
                resolve({
                    content: [{ type: 'text', text: stdout.trim() }],
                    isError: false
                });
            }
        });
        child.on('error', (err) => reject(err));
        if (child.stdin) {
            child.stdin.write(prompt);
            child.stdin.end();
        }
    });
}
