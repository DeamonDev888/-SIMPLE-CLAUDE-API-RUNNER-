import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
export const createAgentSchema = z.object({
    name: z.string().describe("Nom de l'agent (ex: agent_finance). Sera utilisé pour les noms de fichiers."),
    prompt: z.string().describe("Le prompt système (instructions) de l'agent."),
    model: z.string().optional().default("claude-3-5-sonnet-20241022").describe("Modèle à utiliser (ex: claude-3-5-sonnet-20241022)"),
    copyEnvFrom: z.string().optional().describe("Chemin vers un settings.json existant pour copier les variables d'environnement (ex: .claude/settingsM.json)")
});
export async function createAgent(args) {
    const { name, prompt, model, copyEnvFrom } = args;
    // Résolution des chemins
    const currentFileUrl = import.meta.url;
    const currentFilePath = fileURLToPath(currentFileUrl);
    // src/tools/create_agent.ts -> src/tools -> src -> Workflow
    const projectRoot = path.resolve(path.dirname(currentFilePath), '../../');
    const claudeDir = path.resolve(projectRoot, '.claude');
    const agentsDir = path.resolve(claudeDir, 'agents');
    // Assurer que les dossiers existent
    await fs.mkdir(claudeDir, { recursive: true });
    await fs.mkdir(agentsDir, { recursive: true });
    // 1. Création du fichier Prompt (.md)
    const promptPath = path.join(agentsDir, `${name}.md`);
    await fs.writeFile(promptPath, prompt, 'utf-8');
    // 2. Création du fichier Settings (.json)
    let envVars = {};
    let mcpServers = ["postgresql", "news", "discord", "workflow"]; // Default defaults
    // Copie des env si demandé
    if (copyEnvFrom) {
        try {
            const sourceSettingsPath = path.resolve(projectRoot, copyEnvFrom);
            const sourceContent = await fs.readFile(sourceSettingsPath, 'utf-8');
            const sourceJson = JSON.parse(sourceContent);
            if (sourceJson.env)
                envVars = sourceJson.env;
            if (sourceJson.enabledMcpjsonServers)
                mcpServers = sourceJson.enabledMcpjsonServers;
        }
        catch (e) {
            console.warn(`⚠️ Impossible de copier la config depuis ${copyEnvFrom}: ${e.message}`);
        }
    }
    else {
        // Fallback env (si aucun fichier source fourni)
        envVars = {
            "ANTHROPIC_MODEL": model
        };
    }
    const settings = {
        env: {
            ...envVars,
            "ANTHROPIC_MODEL": model // Force le modèle demandé
        },
        enableAllProjectMcpServers: false,
        enabledMcpjsonServers: mcpServers,
        agent: name
    };
    const settingsFileName = `settings_${name}.json`;
    const settingsPath = path.join(claudeDir, settingsFileName);
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return {
        content: [{
                type: 'text',
                text: `✅ Agent '${name}' créé avec succès !\n\n📂 Fichiers :\n- Prompt : ${promptPath}\n- Config : ${settingsPath}\n\n🚀 Pour lancer cet agent :\nnode dist/index.js --settings .claude/${settingsFileName}`
            }]
    };
}
