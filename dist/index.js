import { FastMCP } from 'fastmcp';
import { runClaudeAgent, runAgentSchema } from './tools/run_claude.js';
import { getAgentPrompt } from './prompts/agent_prompts.js';
import { updateConfig } from './lib/config.js';
import { fileURLToPath } from 'url';
export function createServer(name = "Claude-Code MCP Runner") {
    const server = new FastMCP({
        name,
        version: "1.0.0"
    });
    // Outil principal : Exécuter l'agent
    server.addTool({
        name: "run_agent",
        description: "Exécute une commande sur l'agent Claude configuré via CLI",
        parameters: runAgentSchema,
        execute: runClaudeAgent
    });
    // Prompt : Inspecter la config
    server.addPrompt({
        name: "inspect_agent_config",
        description: "Affiche la configuration actuelle de l'agent",
        load: async () => {
            const content = await getAgentPrompt();
            return {
                messages: [{
                        role: 'user',
                        content: { type: 'text', text: content }
                    }]
            };
        }
    });
    return server;
}
// Auto-start si exécuté directement
// node dist/index.js --settings ...
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const args = process.argv.slice(2);
    let settingsPath, mcpPath;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--settings' && args[i + 1]) {
            settingsPath = args[i + 1];
            i++;
        }
        else if (args[i] === '--mcp-config' && args[i + 1]) {
            mcpPath = args[i + 1];
            i++;
        }
    }
    if (settingsPath || mcpPath) {
        updateConfig(settingsPath, mcpPath);
        console.error(`🔧 Config surchargée : Settings=${settingsPath}, MCP=${mcpPath}`);
    }
    const server = createServer();
    server.start({ transportType: 'stdio' });
}
