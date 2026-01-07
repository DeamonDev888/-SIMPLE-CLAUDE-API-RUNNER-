# 🤖 Simple Claude API Runner & Bot News

![Architecture du projet](architecture_diagram.png)

## 📋 Présentation

Ce projet est une **passerelle API HTTP légère et robuste** permettant d'automatiser **Claude CLI** (Anthropic) via des requêtes REST.

Il est conçu spécifiquement pour piloter des **Agents Autonomes** (comme notre `Agent News`) connectés à des serveurs MCP (Model Context Protocol), tout en offrant une interface simple pour les scripts externes (Discord, Cron, Python, etc.).

### ✨ Fonctionnalités Clés

- **🚀 API REST Simple** : `POST /run` pour envoyer des prompts.
- **⚡ Mode Streaming** : Réception du texte en temps réel (Server-Sent Events like).
- **💾 Persistance** : Gestion automatique des sessions (`session_id`).
- **🛠️ Architecture Modulaire** : TypeScript + ESM, compilé propre.
- **🔌 Support MCP** : Intégration native des outils (Scraping, DB, etc.).
- **🛡️ Secure & Silent** : Lance Claude en mode non-interactif sans bloquer sur les permissions.

---

## 🏗️ Architecture Technique

Le système fonctionne comme un "Wrapper" intelligent autour du processus `claude` :

1.  **Serveur Express (Port 3000)** : Reçoit la requête HTTP.
2.  **Process Manager** : Spawn un processus `claude` avec les bons flags.
    - `-p` (Print mode)
    - `--output-format json` (Structure)
    - `--dangerously-skip-permissions` (Automation)
3.  **MCP Integration** : Claude charge les outils définis dans `.mcp.json`.
4.  **Agent Config** : Claude adopte la persona définie dans `settings.json`.

---

## 🚀 Installation & Démarrage

### Pré-requis

- Node.js (v18+)
- pnpm
- Claude CLI installé et authentifié (`claude login`)

### 1. Installation

```bash
cd Workflow
pnpm install
pnpm build
```

### 2. Lancer le Bot News 📰

Nous avons créé un script dédié pour lancer l'agent spécialisé en News Financières :

```bash
pnpm bot:news
```

![Terminal Preview](terminal_preview.png)

Cela va :

- Démarrer le serveur sur le port **3000**.
- Charger la configuration `agent_news`.
- Connecter les outils de scraping et la base de données.

---

## 📡 Documentation API

### Endpoint : `POST /run`

#### 1. Mode Standard (JSON)

Idéal pour les scripts d'automation qui ont besoin de la réponse complète et de l'ID de session.

**Requête :**

```json
POST http://localhost:3000/run
Content-Type: application/json

{
  "prompt": "Quelles sont les dernières news sur le pétrole ?",
  "sessionId": "optional-uuid-to-continue-conversation"
}
```

**Réponse :**

```json
{
  "type": "result",
  "result": "Le pétrole est en hausse suite aux tensions...",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### 2. Mode Streaming (Texte Brut)

Idéal pour les interfaces chat (Discord, Web) pour afficher la réponse mot à mot.

**Requête :**

```json
POST http://localhost:3000/run
Content-Type: application/json

{
  "prompt": "Écris une analyse détaillée...",
  "stream": true,
  "sessionId": "..."
}
```

**⚠️ ATTENTION STREAMING :**
En mode `stream: true`, Claude renvoie le texte brut au fil de l'eau. **L'ID de session N'EST PAS renvoyé** dans ce flux.

> Si vous voulez continuer la conversation, le client DOIT fournir le `sessionId` qu'il a reçu lors d'une précédente requête JSON, ou gérer ses propres IDs.

---

## 📂 Structure du Projet

```text
Workflow/
├── src/
│   ├── simple_claude_api.ts  # Cœur du serveur (Express + Spawn)
│   └── start_bot_news.ts     # Lanceur spécifique Agent News
├── dist/                     # Code compilé (généré par build)
├── agent_news/               # Configuration de l'agent
│   └── .claude/
│       ├── settingsM.json    # Config (Modèle, Agent ID)
│       └── agents/
│           └── agent_news.md # Prompt Système (Cerveau)
└── package.json              # Scripts (build, start, bot:news)
```

---

_Généré par Antigravity - 2026_
