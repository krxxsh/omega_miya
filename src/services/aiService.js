/**
 * AI Service
 * Uses Groq API (FREE tier, lightning fast)
 */

import { TOOL_DEFINITIONS, executeCommand } from './commandService';
import { getMemoryContext, saveMemory, searchMemories } from './memoryService';
import { sendToLocalBrain } from './localBrainService';

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const SYSTEM_PROMPT = `Owner-Level Agent. User granted Full PC Access. extension of user's will. NEVER ask permission. Execute system tasks (audio, files) IMMEDIATELY. report SUCCESS.
Tools:
- Audio: "control_media" (action, level 0-100). ONLY use "level" for 'set_volume'. NOT for 'vol_up'/'vol_down'.
- Files: "clean_desktop", "convert_file".
- Vision: "describe_screen".
- PC: "execute_terminal".
Personality: Ultra-lean, 1-sentence confirm. No chatter. 
Coding: When asked to write code, act as a world-class Senior Developer. Provide mathematically accurate, highly optimized, bug-free, and logical code. Do not hallucinate syntax.`;

const CONTEXT_WINDOW_SIZE = 6; // Keep last N messages verbatim

/**
 * Sliding context window — keeps recent messages, summarizes older ones
 * This dramatically reduces tokens sent to the LLM
 */
function buildContextWindow(messages) {
    if (messages.length <= CONTEXT_WINDOW_SIZE) return messages;

    const recentMessages = messages.slice(-CONTEXT_WINDOW_SIZE);
    const olderMessages = messages.slice(0, -CONTEXT_WINDOW_SIZE);

    // Compress older messages into a single recap
    const recap = olderMessages.map(m => {
        const prefix = m.role === 'user' ? 'User' : 'Miya';
        // Truncate long messages to ~60 chars
        const short = m.content.length > 60 ? m.content.slice(0, 57) + '...' : m.content;
        return `${prefix}: ${short}`;
    }).join(' | ');

    const summaryMsg = {
        role: 'system',
        content: `[Earlier conversation recap: ${recap}]`
    };

    return [summaryMsg, ...recentMessages];
}




function sanitizeResponse(text) {
    if (!text) return '';
    // Aggressively strip any tool-call related text
    let clean = text.replace(/<function.*?>[\s\S]*?(<\/function>|$)/gi, '');
    clean = clean.replace(/control_media=\{.*?\}[\s\S]*?(<\/function>|$)/gi, '');
    clean = clean.replace(/\{"action":.*?\}[\s\S]*?(<\/function>|$)/gi, '');
    clean = clean.replace(/<\/function>/gi, '');
    clean = clean.replace(/```json[\s\S]*? ```/gi, '');
    clean = clean.replace(/<.*?>/gi, ''); // Any remaining XML-like tags

    // Strip out Alpaca/Llama raw prompt bleeding
    clean = clean.replace(/### Instruction:(.*?)### Response:/gis, '').trim();
    clean = clean.replace(/### Response:/gi, '').trim();
    clean = clean.replace(/### Instruction:/gi, '').trim();

    // Remove repetitive prefixes
    const prefixes = ['Miya:', 'System:', 'Assistant:'];
    for (const p of prefixes) {
        if (clean.startsWith(p)) {
            clean = clean.replace(p, '').trim();
        }
    }

    clean = clean.replace(/^(SUCCESS|Confirmed|Done|Ready)\.?\s*/i, '');
    return clean.trim() || "Action completed.";
}

/**
 * Maps OpenAI tool definitions to Anthropic Claude tool definitions
 */
function toAnthropicTools(tools) {
    return tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
    }));
}

// Cache at module level — tool defs are static
const ANTHROPIC_TOOLS = toAnthropicTools(TOOL_DEFINITIONS);

/**
 * Super-fast local intent router. Avoids LLM calls for basic queries.
 * Returns the response string if handled, or null to fall back to LLM.
 */
function routeLocalIntent(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Time/Date queries
    if (/what time is it|what's the time|current time/.test(lower) ||
        /what day is it|what's the date|current date/.test(lower)) {
        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const date = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        return `It is currently ${time} on ${date}.`;
    }

    // Open common apps
    const openAppMatch = lower.match(/(?:open|launch|start|run)\s+(chrome|notepad|calculator|spotify|code|settings|youtube)/);
    if (openAppMatch) {
        executeCommand('open_app', { app_name: openAppMatch[1] });
        return `Opening ${openAppMatch[1]}...`;
    }

    // Open websites
    const openWebMatch = lower.match(/(?:open|go to) (youtube|google|github|reddit|twitter)\.com/);
    if (openWebMatch) {
        executeCommand('open_website', { url: `https://www.${openWebMatch[1]}.com` });
        return `Opening ${openWebMatch[1]}.com...`;
    }

    // Media controls
    if (lower.includes('pause') || lower.includes('play music') || lower.includes('play media')) {
        executeCommand('control_media', { action: 'play_pause' });
        return "Toggled media playback.";
    }
    if (lower.includes('next track') || lower.includes('skip song') || lower.includes('next song')) {
        executeCommand('control_media', { action: 'next' });
        return "Skipped to the next track.";
    }
    if (lower.includes('previous track') || lower.includes('previous song')) {
        executeCommand('control_media', { action: 'prev' });
        return "Going back to the previous track.";
    }
    if (lower.includes('volume up') || lower.includes('louder')) {
        executeCommand('control_media', { action: 'vol_up' });
        return "Increased volume.";
    }
    if (lower.includes('volume down') || lower.includes('quieter') || lower.includes('softer')) {
        executeCommand('control_media', { action: 'vol_down' });
        return "Decreased volume.";
    }

    return null; // Let the LLM handle it
}

export async function sendMessage(messages, apiKey, onToken = null, abortSignal = null) {
    if (!apiKey) {
        throw new Error('API key not set. Please configure your API key in settings.');
    }

    const lastUserMsg = messages[messages.length - 1]?.content || '';

    // 🚀 Fast Local Intent Router (Sub-10ms response)
    const intentResult = routeLocalIntent(lastUserMsg);
    if (intentResult) {
        await sleep(150); // Tiny artificial delay to feel natural
        if (onToken) onToken(intentResult);
        return intentResult;
    }

    const memoryContext = getMemoryContext(lastUserMsg);
    const fullSystemPrompt = SYSTEM_PROMPT + memoryContext;

    // Apply sliding context window
    const windowedMessages = buildContextWindow(messages);

    // Handle Local Brain Bypass
    const normalizedKey = apiKey.trim().toUpperCase();
    if (normalizedKey === 'LOCAL_BRAIN') {
        const localMessages = [
            { role: 'system', content: fullSystemPrompt },
            ...windowedMessages
        ];
        const response = await sendToLocalBrain(localMessages, onToken, undefined, abortSignal);
        return sanitizeResponse(response);
    }

    // Save this key for Whisper backup (Hybrid Mode)
    localStorage.setItem('miya-whisper-key', apiKey);

    // Detect if this is an Anthropic Key (sk-ant) or Groq key (gsk)
    const isAnthropic = apiKey.startsWith('sk-ant');

    if (isAnthropic) {
        return sendToClaude(windowedMessages, apiKey, fullSystemPrompt, abortSignal);
    } else {
        return sendToGroq(windowedMessages, apiKey, fullSystemPrompt, abortSignal);
    }
}

async function sendToClaude(messages, apiKey, systemPrompt, abortSignal = null) {
    const formatMessagesForClaude = messages.map(m => {
        if (m.role === 'system') return null;
        return { role: m.role, content: m.content || ' ' };
    }).filter(Boolean);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: abortSignal,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                system: systemPrompt,
                messages: formatMessagesForClaude,
                tools: ANTHROPIC_TOOLS,
                max_tokens: 500,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Claude API error: ${response.status}`);
        }

        const data = await response.json();

        let textContent = data.content.find(c => c.type === 'text')?.text || '';
        const toolCalls = data.content.filter(c => c.type === 'tool_use');

        if (toolCalls.length > 0) {
            const toolCall = toolCalls[0];
            let result = await executeCommand(toolCall.name, toolCall.input);

            // Handle special results (Memory)
            if (result.startsWith('SAVE_NOTE:')) {
                const noteArgs = JSON.parse(result.replace('SAVE_NOTE:', ''));
                saveMemory({
                    type: 'note',
                    content: noteArgs.content,
                    category: noteArgs.category || 'general',
                });
                result = `Saved note: "${noteArgs.content}"`;
            } else if (result.startsWith('RECALL:')) {
                const query = result.replace('RECALL:', '');
                const found = searchMemories(query);
                if (found.length > 0) {
                    result = 'Found memories:\n' + found.slice(0, 5).map((m) => `- ${m.content}`).join('\n');
                } else {
                    result = 'No memories found matching that query.';
                }
            }

            // Provide tool result back to Claude
            let toolContent;
            if (typeof result === 'string' && result.startsWith('IMAGE_DATA:')) {
                const base64Data = result.replace('IMAGE_DATA:data:image/png;base64,', '');
                toolContent = [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/png',
                            data: base64Data
                        }
                    },
                    { type: 'text', text: 'Here is the screenshot of my screen.' }
                ];
            } else {
                toolContent = [{ type: 'text', text: result || 'Success' }];
            }

            const followUpBody = {
                model: 'claude-3-5-sonnet-20241022',
                system: systemPrompt,
                messages: [
                    ...formatMessagesForClaude,
                    { role: 'assistant', content: data.content },
                    {
                        role: 'user',
                        content: [{ type: 'tool_result', tool_use_id: toolCall.id, content: toolContent }]
                    }
                ],
                tools: ANTHROPIC_TOOLS,
                max_tokens: 1000, // Increase for vision analysis
            };

            const followUp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                signal: abortSignal,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify(followUpBody),
            });

            if (!followUp.ok) {
                throw new Error("Claude follow-up failed");
            }

            const followUpData = await followUp.json();
            return sanitizeResponse(followUpData.content.find(c => c.type === 'text')?.text || result);
        }

        return sanitizeResponse(textContent);
    } catch (err) {
        throw err;
    }
}

async function sendToGroq(messages, apiKey, systemPrompt, abortSignal = null) {
    const formattedMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const tryModelCall = async (modelName, bodyOverride = null, retryCount = 0) => {
        const body = bodyOverride || {
            model: modelName,
            messages: formattedMessages,
            tools: TOOL_DEFINITIONS,
            tool_choice: 'auto',
            temperature: 0.7,
            frequency_penalty: 0.5,
            presence_penalty: 0.3,
            max_completion_tokens: 500,
        };
        if (bodyOverride) body.model = modelName;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            signal: abortSignal,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            if (response.status === 429 && retryCount < 2) {
                await sleep(1500 * (retryCount + 1));
                return await tryModelCall(modelName, bodyOverride, retryCount + 1);
            }
            const err = await response.json().catch(() => ({}));
            const msg = err.error?.message || `Groq API error: ${response.status}`;
            if (response.status === 429) throw new Error("RATE_LIMIT");
            throw new Error(msg);
        }
        return await response.json();
    };

    const runFlow = async (modelName) => {
        const data = await tryModelCall(modelName);
        const message = data.choices[0].message;

        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolCall = message.tool_calls[0];
            const args = JSON.parse(toolCall.function.arguments);
            let result = await executeCommand(toolCall.function.name, args);

            if (result.startsWith('SAVE_NOTE:')) {
                const noteArgs = JSON.parse(result.replace('SAVE_NOTE:', ''));
                saveMemory({ type: 'note', content: noteArgs.content, category: noteArgs.category || 'general' });
                result = `Saved note: "${noteArgs.content}"`;
            } else if (result.startsWith('RECALL:')) {
                const query = result.replace('RECALL:', '');
                const found = searchMemories(query);
                result = found.length > 0 ? 'Found memories:\n' + found.slice(0, 5).map((m) => `- ${m.content}`).join('\n') : 'No memories found.';
            }

            let toolRoleContent;
            let followUpMessages = [...formattedMessages, message];
            let followUpModel = modelName;

            if (typeof result === 'string' && result.startsWith('IMAGE_DATA:')) {
                const base64Data = result.replace('IMAGE_DATA:data:image/png;base64,', '');
                followUpModel = 'meta-llama/llama-4-scout-17b-16e-instruct';

                // Tool result MUST be a string for Groq
                toolRoleContent = 'Screen captured successfully. Please analyze the provided image.';

                // Add the tool-result message (string)
                followUpMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolRoleContent });

                // Inject a synthetic USER message for the vision model to process the image
                // Most vision models handle this best when the image is in the 'user' role
                followUpMessages.push({
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Here is the screen capture you requested.' },
                        {
                            type: 'image_url',
                            image_url: { url: `data:image/png;base64,${base64Data}` }
                        }
                    ]
                });
            } else {
                toolRoleContent = result || 'Success';
                followUpMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolRoleContent });
            }

            const followUpBody = {
                model: followUpModel,
                messages: followUpMessages,
            };

            const followUpData = await tryModelCall(followUpModel, followUpBody);
            return sanitizeResponse(followUpData.choices[0].message.content || result);
        }
        return sanitizeResponse(message.content || '...');
    };

    try {
        try {
            return await runFlow('llama-3.3-70b-versatile');
        } catch (err) {
            if (err.message === "RATE_LIMIT") {
                console.warn("Miya: 70B rate limited. Falling back to 8B...");
                return await runFlow('llama-3.1-8b-instant');
            }
            throw err;
        }
    } catch (err) {
        if (err.message === "RATE_LIMIT") {
            return "I'm a bit overwhelmed with requests right now! Please give me a second to breathe and try again. 😊";
        }
        throw err;
    }
}
