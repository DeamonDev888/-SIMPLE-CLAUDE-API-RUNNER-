/**
 * ============================================================================
 * LANCEUR BOT NEWS
 * ============================================================================
 * Script de démarrage dédié pour l'Agent News.
 * Configure automatiquement les chemins pour pointer vers agent_news.
 */
import { SimpleClaudeRunner, CONFIG } from './simple_claude_api.js';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Configuration Spécifique pour Agent News
// On calcule les chemins par rapport à ce script (dans dist/)
const currentFileUrl = import.meta.url;
const currentFilePath = fileURLToPath(currentFileUrl);
const scriptDir = path.dirname(currentFilePath); // .../Workflow/dist
const projectRoot = path.resolve(scriptDir, '..'); // .../Workflow

// Définir les chemins relatifs à Workflow/
CONFIG.CLAUDE.PATHS.SETTINGS = path.resolve(projectRoot, 'agent_news/.claude/settingsM.json');
// MCP Config reste par défaut ('../.mcp.json' relatif à Workflow)

console.log('📰 Démarrage du BOT NEWS...');
console.log(`🔧 Settings: ${CONFIG.CLAUDE.PATHS.SETTINGS}`);

// 2. Démarrage du Serveur
const server = new SimpleClaudeRunner();
server.start();
