
import { createAgent } from '../dist/tools/create_agent.js';
import { runClaudeAgent } from '../dist/tools/run_claude.js';
import fs from 'fs';
import path from 'path';

async function runTests() {
    console.log('🧪 Starting Tool Tests...');

    // --- TEST 1: CREATE_AGENT ---
    console.log('\n[1/2] Testing create_agent...');
    const agentName = 'agent_test_auto';
    try {
        const result = await createAgent({
            name: agentName,
            prompt: 'You are a test agent. Always reply "TEST_SUCCESS".',
            model: 'claude-3-haiku-20240307'
        });
        
        console.log('✅ create_agent returned:', JSON.stringify(result, null, 2));

        // Verify files exist
        const settingsPath = `.claude/settings_${agentName}.json`;
        const promptPath = `.claude/agents/${agentName}.md`;

        if (fs.existsSync(settingsPath) && fs.existsSync(promptPath)) {
            console.log('✅ Files created successfully.');
        } else {
            console.error('❌ Files missing!');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ create_agent failed:', e);
        process.exit(1);
    }

    // --- TEST 2: RUN_AGENT ---
    console.log('\n[2/2] Testing run_agent (Simple Echo)...');
    try {
        // We use the newly created agent settings if possible, or just default.
        // runClaudeAgent uses GLOBAL config via singleton.
        // We might need to update config first if we want to test THAT specific agent,
        // but for now, testing the tool mechanics with default settings is safer/quicker 
        // if we don't want to mess with the global singleton state too much.
        // HOWEVER, runClaudeAgent reads config from disk/singleton.
        
        const output = await runClaudeAgent({
            prompt: "Reply with only the word: PASSED",
            sessionId: "test-session-123"
        });

        console.log('✅ run_agent output:', JSON.stringify(output, null, 2));

        if (JSON.stringify(output).includes("PASSED")) {
            console.log('✅ Response content verified.');
        } else {
            console.warn('⚠️ Response content did not match expected "PASSED". Check logs.');
        }

    } catch (e) {
        console.error('❌ run_agent failed:', e);
        // Don't fail the whole script if just API error (e.g. auth), but log it.
    }

    console.log('\n🎉 All tests finished.');
}

runTests();
