/**
 * ============================================================================
 * LANCEUR BOT NEWS (Version MCP)
 * ============================================================================
 * Configure l'agent News et lance le serveur MCP.
 */
import { createServer } from './index.js';
import { updateConfig } from './lib/config.js';
import path from 'path';
import { fileURLToPath } from 'url';
// 1. Configuration Spécifique pour Agent News
const currentFileUrl = import.meta.url;
const currentFilePath = fileURLToPath(currentFileUrl);
const scriptDir = path.dirname(currentFilePath); // .../Workflow/dist
const projectRoot = path.resolve(scriptDir, '..'); // .../Workflow
const newsSettingsPath = path.resolve(projectRoot, '.claude/settingsM.json');
const localMcpPath = path.resolve(projectRoot, '.mcp.json');
// Mettre à jour la config globale avant de créer le serveur
updateConfig(newsSettingsPath, localMcpPath);
console.error('📰 Démarrage du BOT NEWS (Mode MCP)...');
console.error(`🔧 Settings: ${newsSettingsPath}`);
console.error(`🔧 MCP Config: ${localMcpPath}`);
// 2. Démarrage du Serveur MCP
const server = createServer("Agent News Runner");
server.start({ transportType: 'stdio' });
