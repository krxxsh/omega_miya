/**
 * AI Service
 * Uses Groq API (FREE tier, lightning fast)
 */

import Anthropic from '@anthropic-ai/sdk';
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
Personality: Ultra-lean, 1-sentence confirm. No chatter.`;




function sanitizeResponse(text) {
    if (!text) return '';
    // Aggressively strip any tool-call related text
    let clean = text.replace(/<function.*?>[\s\S]*?(<\/function>|$)/gi, '');
    clean = clean.replace(/control_media=\{.*?\}[\s\S]*?(<\/function>|$)/gi, '');
    clean = clean.replace(/\{"action":.*?\}[\s\S]*?(<\/function>|$)/gi, '');
    clean = clean.replace(/<\/function>/gi, '');
    clean = clean.replace(/```json[\s\S]*?```/gi, '');
    clean = clean.replace(/<.*?>/gi, ''); // Any remaining XML-like tags
    // Remove repetitive prefixes
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

export async function sendMessage(messages, apiKey) {
    if (!apiKey) {
        throw new Error('API key not set. Please configure your API key in settings.');
    }

    const memoryContext = getMemoryContext();
    const fullSystemPrompt = SYSTEM_PROMPT + memoryContext;

    // Handle Local Brain Bypass
    const normalizedKey = apiKey.trim().toUpperCase();
    if (normalizedKey === 'LOCAL_BRAIN') {
        const response = await sendToLocalBrain(messages);
        return sanitizeResponse(response);
    }

    // Save this key for Whisper backup (Hybrid Mode)
    localStorage.setItem('miya-whisper-key', apiKey);

    // Detect if this is an Anthropic Key (sk-ant) or Groq key (gsk)
    const isAnthropic = apiKey.startsWith('sk-ant');

    if (isAnthropic) {
        return sendToClaude(messages, apiKey, fullSystemPrompt);
    } else {
        return sendToGroq(messages, apiKey, fullSystemPrompt);
    }
}

async function sendToClaude(messages, apiKey, systemPrompt) {
    const formatMessagesForClaude = messages.map(m => {
        if (m.role === 'system') return null;
        return { role: m.role, content: m.content || ' ' };
    }).filter(Boolean);

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
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
                tools: toAnthropicTools(TOOL_DEFINITIONS),
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
                tools: toAnthropicTools(TOOL_DEFINITIONS),
                max_tokens: 1000, // Increase for vision analysis
            };

            const followUp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
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

async function sendToGroq(messages, apiKey, systemPrompt) {
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
            max_completion_tokens: 500,
        };
        if (bodyOverride) body.model = modelName;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
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
