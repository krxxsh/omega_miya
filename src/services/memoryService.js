/**
 * Memory Service — with TF-IDF Semantic Search
 * Persistent conversation memory for Miya AI
 * Uses localStorage (browser) or electron-store (Electron)
 */

const MEMORY_KEY = 'miya-memories';
const MAX_MEMORIES = 200;

// ===== Common stop words to ignore in TF-IDF =====
const STOP_WORDS = new Set([
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it', 'they',
    'the', 'a', 'an', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'can', 'may', 'might', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
    'by', 'from', 'as', 'into', 'about', 'that', 'this', 'these', 'those',
    'and', 'but', 'or', 'not', 'no', 'so', 'if', 'then', 'than', 'very',
    'just', 'also', 'like', 'really', 'user', 'users',
]);

/**
 * Tokenize text into normalized terms, filtering stop words
 */
function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Compute TF-IDF scores for a query against a set of documents
 * Returns sorted array of { index, score }
 */
function tfidfSearch(query, documents) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Tokenize all documents
    const docTokens = documents.map(doc => tokenize(doc));
    const N = documents.length;

    // Build document frequency (how many docs contain each term)
    const df = {};
    for (const tokens of docTokens) {
        const seen = new Set(tokens);
        for (const term of seen) {
            df[term] = (df[term] || 0) + 1;
        }
    }

    // Score each document
    const scores = docTokens.map((tokens, index) => {
        if (tokens.length === 0) return { index, score: 0 };

        // Build term frequency for this doc
        const tf = {};
        for (const t of tokens) {
            tf[t] = (tf[t] || 0) + 1;
        }

        // TF-IDF score for query terms against this doc
        let score = 0;
        for (const qt of queryTokens) {
            if (tf[qt]) {
                const termFreq = tf[qt] / tokens.length;           // Normalized TF
                const inverseDocFreq = Math.log(N / (df[qt] || 1)); // IDF
                score += termFreq * inverseDocFreq;
            }
        }
        return { index, score };
    });

    return scores.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
}

// ===== Core Memory Functions =====

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
 */
export function saveMemory(memory) {
    const memories = getMemories();
    const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        type: memory.type || 'fact',
        content: memory.content,
        category: memory.category || 'general',
        createdAt: Date.now(),
    };
    memories.unshift(entry);

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
 * Search memories using TF-IDF ranking (lightweight RAG)
 * Falls back to substring match if TF-IDF returns nothing
 */
export function searchMemories(query) {
    const memories = getMemories();
    if (memories.length === 0) return [];

    // Try TF-IDF first
    const documents = memories.map(m => `${m.content} ${m.category}`);
    const ranked = tfidfSearch(query, documents);

    if (ranked.length > 0) {
        return ranked.map(r => memories[r.index]);
    }

    // Fallback: substring match
    const lower = query.toLowerCase();
    return memories.filter(
        (m) =>
            m.content.toLowerCase().includes(lower) ||
            m.category.toLowerCase().includes(lower)
    );
}

/**
 * Get top-K most relevant memories for a query (RAG retrieval)
 */
export function getRelevantMemories(query, topK = 8) {
    const memories = getMemories();
    if (memories.length === 0) return [];

    const documents = memories.map(m => `${m.content} ${m.category}`);
    const ranked = tfidfSearch(query, documents);

    // Take top K results, or all if fewer
    const results = ranked.slice(0, topK).map(r => memories[r.index]);

    // Always include identity facts (name, role) regardless of query
    const identityFacts = memories.filter(m =>
        m.category === 'identity' && !results.some(r => r.id === m.id)
    );

    return [...identityFacts.slice(0, 3), ...results];
}

/**
 * Extract facts from AI conversation to auto-save
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
 * @param {string} userQuery — current user message for relevance-based retrieval
 */
export function getMemoryContext(userQuery = '') {
    const memories = getMemories();
    if (memories.length === 0) return '';

    // If we have a query, use TF-IDF to retrieve only relevant memories
    let selected;
    if (userQuery && memories.length > 5) {
        selected = getRelevantMemories(userQuery, 8);
    } else {
        selected = memories.slice(0, 15);
    }

    if (selected.length === 0) return '';

    const grouped = {};
    for (const m of selected) {
        const cat = m.category || 'general';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m.content);
    }

    let context = '\n\n[MEMORY - Things you remember about the user]\n';
    for (const [cat, items] of Object.entries(grouped)) {
        context += `${cat}: ${items.join('; ')}\n`;
    }
    context += '[Use these memories naturally. Don\'t list them unless asked.]\n';

    return context;
}
