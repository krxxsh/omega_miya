/**
 * Local Brain Service
 * Redirects Miya's thoughts to her local fine-tuned model (Ollama)
 */

export async function sendToLocalBrain(messages, modelName = "miya-v1") {
    // Standard system prompt logic removed; her brain is pre-trained with it
    const formattedMessages = messages.map(m => ({
        role: m.role,
        content: m.content
    }));

    try {
        const response = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: modelName,
                messages: formattedMessages,
                stream: false,
                options: {
                    temperature: 0.2, // Low temp for hardware precision
                    num_predict: 256
                }
            }),
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Ollama Error (${response.status}): ${errBody || 'Model not found or blocked'}`);
        }

        const data = await response.json();
        return data.message.content;
    } catch (err) {
        if (err.message.includes('Failed to fetch')) {
            throw new Error("Ollama is not responding. 1. Quit Ollama. 2. Run 'ollama serve' in PowerShell. 3. Try again.");
        }
        console.error("Local Brain Error:", err);
        throw err;
    }
}
