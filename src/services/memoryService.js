/**
 * Memory Service
 * Persistent conversation memory for Miya AI
 * Uses localStorage (browser) or electron-store (Electron)
 */

const MEMORY_KEY = 'miya-memories';
const MAX_MEMORIES = 200;

/**
 * Get all stored memories
 */
export function getMemories() {
    try {
        const raw = localStorage.getItem(MEMORY_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Save a memory entry
 * @param {{ type: string, content: string, category?: string }} memory
 */
export function saveMemory(memory) {
    const memories = getMemories();
    const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        type: memory.type || 'fact',       // fact, preference, summary, reminder
        content: memory.content,
        category: memory.category || 'general',
        createdAt: Date.now(),
    };
    memories.unshift(entry);

    // Cap memory size
    if (memories.length > MAX_MEMORIES) {
        memories.length = MAX_MEMORIES;
    }

    localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
    return entry;
}

/**
 * Delete a memory by ID
 */
export function deleteMemory(id) {
    const memories = getMemories().filter((m) => m.id !== id);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memories));
}

/**
 * Clear all memories
 */
export function clearAllMemories() {
    localStorage.removeItem(MEMORY_KEY);
}

/**
 * Search memories by text
 */
export function searchMemories(query) {
    const lower = query.toLowerCase();
    return getMemories().filter(
        (m) =>
            m.content.toLowerCase().includes(lower) ||
            m.category.toLowerCase().includes(lower)
    );
}

/**
 * Extract facts from AI conversation to auto-save
 * Looks for name introductions, preferences, goals, etc.
 */
export function extractAndSaveFacts(userText, aiResponse) {
    const lower = userText.toLowerCase();
    const facts = [];

    // Name detection
    const namePatterns = [
        /my name is (\w+)/i,
        /i'?m (\w+)/i,
        /call me (\w+)/i,
        /i go by (\w+)/i,
    ];
    for (const pat of namePatterns) {
        const match = lower.match(pat);
        if (match && match[1].length > 1 && match[1].length < 20) {
            const name = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            // Avoid saving common words as names
            const skipWords = ['happy', 'sad', 'tired', 'fine', 'good', 'okay', 'doing', 'not', 'feeling'];
            if (!skipWords.includes(name.toLowerCase())) {
                facts.push({ type: 'fact', content: `User's name is ${name}`, category: 'identity' });
            }
        }
    }

    // Favorite/preference detection
    const prefPatterns = [
        /i (?:really )?(?:love|like|enjoy|prefer) (.+?)(?:\.|!|$)/i,
        /my favorite (\w+ is .+?)(?:\.|!|$)/i,
        /i'?m (?:a|an) (.+?) (?:person|fan|lover)/i,
    ];
    for (const pat of prefPatterns) {
        const match = userText.match(pat);
        if (match && match[1].length > 2 && match[1].length < 80) {
            facts.push({ type: 'preference', content: `User likes: ${match[1].trim()}`, category: 'preferences' });
        }
    }

    // Job/role detection
    const jobPatterns = [
        /i (?:work as|am) (?:a |an )?(\w[\w\s]{2,30}?)(?:\.|!|,|$)/i,
        /i'?m (?:a |an )?(\w[\w\s]{2,30}?)(?:by profession|at work)/i,
    ];
    for (const pat of jobPatterns) {
        const match = userText.match(pat);
        if (match) {
            facts.push({ type: 'fact', content: `User's role: ${match[1].trim()}`, category: 'identity' });
        }
    }

    // Save extracted facts (avoid duplicates)
    const existingMemories = getMemories();
    for (const fact of facts) {
        const isDuplicate = existingMemories.some(
            (m) => m.content.toLowerCase() === fact.content.toLowerCase()
        );
        if (!isDuplicate) {
            saveMemory(fact);
        }
    }

    return facts;
}

/**
 * Get formatted memory context for injection into AI prompts
 */
export function getMemoryContext() {
    const memories = getMemories();
    if (memories.length === 0) return '';

    const grouped = {};
    for (const m of memories.slice(0, 30)) {
        const cat = m.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m.content);
    }

    let context = '\n\n[MEMORY - Things you remember about the user]\n';
    for (const [cat, items] of Object.entries(grouped)) {
        context += `${cat}: ${items.join('; ')}\n`;
    }
    context += '[Use these memories naturally in conversation. Don\'t list them unless asked.]\n';

    return context;
}
