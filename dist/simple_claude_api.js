/**
 * ============================================================================
 * SIMPLE CLAUDE API - Generic HTTP → Claude CLI Gateway (TypeScript Version)
 * ============================================================================
 *
 * ⚠️  ATTENTION - LIMITATION IMPORTANTE DU MODE STREAMING ⚠️
 * ==========================================================
 * En mode streaming (`stream: true`), Claude CLI envoie le texte brut au fil de l'eau.
 * IL NE RENVOIE PAS LE `session_id` DANS CE FLUX DE SORTIE.
 *
 * Conséquence :
 * - Si vous commencez une conversation en mode STREAM, vous ne récupérez pas l'ID
 *   de session généré automatiquement par Claude si vous ne l'avez pas fourni.
 * - Pour maintenir une conversation en mode STREAM, le client DOIT :
 *   1. Soit récupérer un sessionId via une première requête non-streamée (JSON).
 *   2. Soit gérer ses propres IDs et espérer que Claude les accepte (si supporté).
 *   3. Soit fournir impérativement le `sessionId` à chaque requête de suite.
 * ==========================================================
 *
 * PISTES D'AMÉLIORATION (COMMENT COMPLÉTER CE SCRIPT) :
 * -----------------------------------------------------
 * Ce script est un "Runner" minimaliste. Pour une prod robuste :
 *
 * 1. Gestion de la Concurrence :
 *    - Actuellement : Chaque requête lance un nouveau process `claude`. C'est lourd.
 *    - Idéal : Garder des processus `claude` chauds (pool de workers) ou une queue de tâches
 *      pour ne pas saturer le CPU si 50 requêtes arrivent en même temps.
 *
 * 2. Gestion des Erreurs Fines :
 *    - Parser mieux `stderr` pour distinguer:
 *      * Erreurs d'outils MCP (pas grave, on continue)
 *      * Crash du process (grave, faut retry)
 *      * Erreurs de quota API (faut attendre)
 *
 * 3. Sécurité :
 *    - Ajouter une clé API (Header `x-api-key`) pour protéger l'accès /run.
 *    - Valider / sanitizer le prompt pour éviter des injections de commandes si le shell est actif.
 *
 * 4. Monitoring :
 *    - Logger les temps de réponse, les tokens consommés (si dispo), et les erreurs dans un fichier.
 * ============================================================================
 */
import express from 'express';
import { spawn } from 'child_process';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// ===========================================
// CONFIGURATION
// ===========================================
export const CONFIG = {
    PORT: 3000,
    TIMEOUT_MS: 300000, // 5 minutes
    CLAUDE: {
        /**
         * FLAGS PRINCIPAUX VÉRIFIÉS PAR TEST (07/01/2026) :
         * -------------------------------------------------
         * -p (ou --print) :
         *    Mode non-interactif indispensable pour l'automation.
         *    Empêche Claude de lancer une TUI (interface terminal) et écrit dans stdout.
         *
         * --output-format json :
         *    Force la sortie au format JSON structuré.
         *    Format: { "type": "result", "session_id": "...", "content": "..." }
         *    CRITIQUE : C'est le seul moyen fiable de récupérer le `session_id` pour la persistance.
         *
         * --dangerously-skip-permissions :
         *    Désactive toutes les demandes de confirmation (lecture fichiers, exec shell).
         *    CRITIQUE pour l'automation serveur, sinon le process bloque en attendant un "y/n" invisible.
         *
         * --settings <path> :
         *    Charge un fichier de configuration spécifique.
         *    Permet de définir l'agent à utiliser ("agent": "nom_agent") et les variables d'env (API keys).
         *    Le chemin doit être absolu ou relatif au CWD.
         *
         * --mcp-config <path> :
         *    Charge la configuration des serveurs MCP (Model Context Protocol).
         *    Sépare la définition des outils de la config de l'agent.
         *
         * --resume <session_id> :
         *    (Ajouté dynamiquement) Reprend le contexte d'une conversation précédente.
         */
        CORE: '-p --output-format json',
        PERMISSIONS: '--dangerously-skip-permissions',
        PATHS: {
            SETTINGS: '.claude/settings.json', // Sera dans Workflow/.claude/settings.json par défaut si non surchargé
            MCP: '../.mcp.json' // Remonte à la racine 'Serveur MCP/'
        }
    }
};
export class SimpleClaudeRunner {
    app;
    constructor() {
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '50mb' }));
    }
    setupRoutes() {
        // --- ROUTE PRINCIPALE ---
        this.app.post('/run', async (req, res) => {
            try {
                const { prompt, sessionId, stream } = req.body;
                if (!prompt) {
                    res.status(400).json({ error: 'Prompt requis' });
                    return;
                }
                console.log(`📥 Reçu (Session: ${sessionId || 'Nouvelle'} | Stream: ${stream}): ${prompt.substring(0, 50)}...`);
                if (stream || req.body.sse) {
                    // MODE STREAMING (Chunked ou SSE)
                    const isSSE = !!req.body.sse;
                    if (isSSE) {
                        res.setHeader('Content-Type', 'text/event-stream');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Connection', 'keep-alive');
                    }
                    else {
                        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    }
                    res.setHeader('Transfer-Encoding', 'chunked');
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                    await this.executeClaudeStream(prompt, sessionId, res, isSSE);
                }
                else {
                    // MODE JSON (Structuré avec Session ID à la fin)
                    const result = await this.executeClaude(prompt, sessionId);
                    res.json(result);
                }
            }
            catch (error) {
                console.error('❌ Erreur:', error.message);
                // Si les headers sont déjà envoyés (mode stream), on ne peut pas renvoyer de JSON
                if (!res.headersSent) {
                    res.status(500).json({
                        error: 'Erreur exécution Claude',
                        details: error.message
                    });
                }
                else {
                    res.end(`\n❌ ERREUR: ${error.message}`);
                }
            }
        });
        // --- STATUS CHECK ---
        this.app.get('/health', (_req, res) => {
            res.json({ status: 'ok' });
        });
    }
    /**
     * Exécute Claude en mode Streaming (Pipe stdout -> HTTP Response)
     */
    executeClaudeStream(prompt, sessionId, res, isSSE = false) {
        return new Promise((resolve, reject) => {
            const { CORE, PERMISSIONS, PATHS } = CONFIG.CLAUDE;
            // ... (setup command)
            const settingsPath = path.resolve(process.cwd(), PATHS.SETTINGS);
            const mcpPath = path.resolve(process.cwd(), PATHS.MCP);
            const safePath = (p) => p.includes(' ') ? `"${p}"` : p;
            const coreFlags = CORE.replace('--output-format json', '');
            let command = `claude ${coreFlags} ${PERMISSIONS} --settings ${safePath(settingsPath)} --mcp-config ${safePath(mcpPath)}`;
            if (sessionId) {
                command += ` --resume ${sessionId}`;
            }
            console.log(`🚀 Exec (Stream) [SSE:${isSSE}]: ${command.substring(0, 100)}...`);
            const child = spawn(command, [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: process.cwd(),
                shell: true
            });
            // PIPE STDOUT
            if (child.stdout) {
                child.stdout.on('data', (chunk) => {
                    if (isSSE) {
                        // Formatage SSE : "data: <contenu>\n\n"
                        // On encode en base64 ou text, mais Claude renvoie du texte.
                        // Pour faire simple et robuste aux sauts de ligne :
                        const lines = chunk.toString().split('\n');
                        lines.forEach(line => {
                            if (line)
                                res.write(`data: ${line}\n\n`);
                        });
                    }
                    else {
                        // Raw Stream
                        res.write(chunk);
                    }
                });
            }
            if (child.stderr) {
                child.stderr.on('data', (d) => {
                    const msg = d.toString();
                    // On peut choisir de logger stderr ou de l'envoyer au client
                    console.error("⚠️ Stderr:", msg);
                    // Optionnel: Envoyer les erreurs dans le stream ? Pour l'instant on log juste.
                });
            }
            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error(`Timeout (${CONFIG.TIMEOUT_MS}ms)`));
            }, CONFIG.TIMEOUT_MS);
            child.on('close', (code) => {
                clearTimeout(timeout);
                res.end(); // Fin du stream HTTP
                resolve();
            });
            child.on('error', (err) => {
                reject(err);
            });
            if (child.stdin) {
                child.stdin.write(prompt);
                child.stdin.end();
            }
        });
    }
    /**
     * Exécute Claude CLI avec le prompt donné (Mode JSON Standard)
     */
    executeClaude(prompt, sessionId = null) {
        return new Promise((resolve, reject) => {
            const { CORE, PERMISSIONS, PATHS } = CONFIG.CLAUDE;
            // --- LOGIQUE DE RÉSOLUTION DES CHEMINS ---
            // Le but est de trouver les fichiers de config peu importe d'où on lance le script.
            // 1. Déterminer la racine de référence (là où se trouve le script compilé dist/)
            const currentFileUrl = import.meta.url;
            const currentFilePath = fileURLToPath(currentFileUrl);
            const scriptDir = path.dirname(currentFilePath); // .../Workflow/dist
            const projectRoot = path.resolve(scriptDir, '..'); // .../Workflow
            // Fonction helper pour résoudre un chemin
            // Si chemin absolu -> on garde
            // Si chemin relatif -> on le colle au projectRoot (Workflow/)
            const resolveConfigPath = (configPath) => {
                if (path.isAbsolute(configPath))
                    return configPath;
                return path.resolve(projectRoot, configPath);
            };
            const settingsPath = resolveConfigPath(PATHS.SETTINGS);
            const mcpPath = resolveConfigPath(PATHS.MCP);
            // Debug des chemins pour être sûr
            console.log(`📂 Working Directory (CWD): ${process.cwd()}`);
            console.log(`📂 Script Directory: ${scriptDir}`);
            console.log(`⚙️  Resolved Settings: ${settingsPath}`);
            console.log(`⚙️  Resolved MCP Config: ${mcpPath}`);
            // Échappement pour Windows (simplifié)
            const safePath = (p) => p.includes(' ') ? `"${p}"` : p;
            let command = `claude ${CORE} ${PERMISSIONS} --settings ${safePath(settingsPath)} --mcp-config ${safePath(mcpPath)}`;
            if (sessionId) {
                command += ` --resume ${sessionId}`;
            }
            console.log(`🚀 Exec: ${command.substring(0, 100)}...`);
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
                    // Vérifier si stdout est vide avant de rejeter
                    console.error("⚠️ Stderr:", stderr);
                    if (!stdout)
                        return reject(new Error(stderr || `Exit code ${code}`));
                }
                try {
                    const response = JSON.parse(stdout.trim());
                    resolve(response);
                }
                catch (e) {
                    console.warn("⚠️ Non-JSON output received");
                    resolve({ result: stdout.trim(), raw: true });
                }
            });
            child.on('error', (err) => reject(err));
            if (child.stdin) {
                child.stdin.write(prompt);
                child.stdin.end();
            }
        });
    }
    start() {
        const server = this.app.listen(CONFIG.PORT, () => {
            console.log(`
┌──────────────────────────────────────────────────┐
│  🤖 SIMPLE CLAUDE API RUNNER (TypeScript)        │
│  Port: ${CONFIG.PORT}                              │
│  Mode: JSON / Automation                         │
└──────────────────────────────────────────────────┘
            `);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ ERREUR FATALE: Le port ${CONFIG.PORT} est déjà utilisé.`);
                console.error(`   Arrêtez les autres processus (Node, Python...) qui utilisent ce port.`);
                process.exit(1);
            }
            else {
                console.error('❌ Erreur serveur:', err);
            }
        });
    }
}
// ============================================================================
// EXECUTION AUTOMATIQUE (Main)
// ============================================================================
// Détection si le fichier est exécuté directement
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    // Gestion des arguments CLI pour surcharger la config
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--settings' && args[i + 1]) {
            CONFIG.CLAUDE.PATHS.SETTINGS = args[i + 1];
            console.log(`🔧 Settings override: ${CONFIG.CLAUDE.PATHS.SETTINGS}`);
            i++;
        }
        else if (args[i] === '--mcp-config' && args[i + 1]) {
            CONFIG.CLAUDE.PATHS.MCP = args[i + 1];
            console.log(`🔧 MCP Config override: ${CONFIG.CLAUDE.PATHS.MCP}`);
            i++;
        }
    }
    const server = new SimpleClaudeRunner();
    server.start();
}
