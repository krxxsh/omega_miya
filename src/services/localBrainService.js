/**
 * Local Brain Service
 * Redirects Miya's thoughts to her local fine-tuned model (Ollama)
 */

const OLLAMA_BASE = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'miya-omega-lite';

/**
 * Warm the model on app startup — pre-loads weights into RAM
 * Call this once on init so the first real message is fast
 */
export async function warmModel(modelName = DEFAULT_MODEL) {
    try {
        await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: '### Instruction:\nhi\n\n### Response:\n',
                stream: false,
                keep_alive: '30m',
                options: { num_predict: 1 } // Generate just 1 token to trigger load
            }),
        });
        console.log('Miya Brain: Model pre-loaded ✓');
    } catch (err) {
        console.warn('Miya Brain: Ollama not running, skipping warm-up');
    }
}

export async function sendToLocalBrain(messages, onToken = null, modelName = DEFAULT_MODEL, abortSignal = null) {
    // 1. Manually format the prompt into strict Alpaca format
    let systemPrompt = '';
    let conversationHistory = '';

    messages.forEach(m => {
        if (m.role === 'system') {
            systemPrompt += m.content + '\n\n';
        } else if (m.role === 'user') {
            conversationHistory += `User: ${m.content}\n`;
        } else if (m.role === 'assistant') {
            conversationHistory += `Miya: ${m.content}\n`;
        }
    });

    const rawPrompt = `${systemPrompt}### Instruction:\n${conversationHistory.trim()}\n\n### Response:\n`;

    try {
        const response = await fetch(`${OLLAMA_BASE}/api/generate`, {
            method: 'POST',
            signal: abortSignal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                prompt: rawPrompt,
                stream: !!onToken,
                keep_alive: '30m',  // Keep model loaded for 30 min
                options: {
                    temperature: 0.35,    // Lowered from 0.6 to enforce strict, logical code generation without hallucinating
                    repeat_penalty: 1.2, // Slightly relaxed so standard code syntaxes aren't wrongly penalized
                    num_predict: -1,  // -1 = infinite prediction until model naturally stops
                    num_ctx: 8192,  // Expanded context window to fit massive <think> loops
                    stop: ["### Instruction:", "User:", "Miya:"] // Hard stops to prevent conversational hallucinations
                }
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Ollama Error (${response.status}): ${errBody || 'Model not found'}`);
        }

        if (onToken) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let streamedLength = 0;

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.response) {
                                fullText += json.response;

                                // 1. Strip out completed <think> blocks
                                let cleaned = fullText.replace(/<think>[\s\S]*?<\/think>/g, '');

                                // Remove any standalone or broken tags entirely
                                cleaned = cleaned.replace(/<\/think>/g, '');

                                // 2. If we are currently INSIDE an open <think> block, hide everything after it
                                const openThinkIdx = cleaned.indexOf('<think>');
                                if (openThinkIdx !== -1) {
                                    cleaned = cleaned.substring(0, openThinkIdx);
                                }

                                // 3. Delay emitting characters if they look like the start of a "<think>" tag
                                // This prevents flashing "<t" on the screen before the tag finishes
                                const thinkStr = "<think>";
                                for (let i = thinkStr.length - 1; i > 0; i--) {
                                    if (cleaned.endsWith(thinkStr.substring(0, i))) {
                                        cleaned = cleaned.substring(0, cleaned.length - i);
                                        break;
                                    }
                                }

                                // Emit only newly finalized characters
                                if (cleaned.length > streamedLength) {
                                    const newToken = cleaned.substring(streamedLength);
                                    onToken(newToken);
                                    streamedLength = cleaned.length;
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing Ollama chunk:", e);
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }

            // Clean up full text return just in case
            fullText = fullText.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\/think>/g, '').replace(/<think>/g, '');
            return fullText.trim();
        } else {
            const data = await response.json();
            return data.response.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<\/think>/g, '').replace(/<think>/g, '').trim();
        }
    } catch (err) {
        if (err.message.includes('Failed to fetch')) {
            throw new Error("Ollama connection failed. Ensure 'ollama serve' is running.");
        }
        throw err;
    }
}
