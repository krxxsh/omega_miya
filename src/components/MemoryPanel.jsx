import React, { useState } from 'react';
import { getMemories, deleteMemory, clearAllMemories, searchMemories } from '../services/memoryService';

export default function MemoryPanel({ isOpen, onClose }) {
    const [query, setQuery] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);

    if (!isOpen) return null;

    const memories = query ? searchMemories(query) : getMemories();

    const categoryIcons = {
        identity: '👤',
        preferences: '❤️',
        general: '📝',
        work: '💼',
        personal: '🏠',
        ideas: '💡',
    };

    const handleClearAll = () => {
        if (confirmClear) {
            clearAllMemories();
            setConfirmClear(false);
        } else {
            setConfirmClear(true);
            setTimeout(() => setConfirmClear(false), 3000);
        }
    };

    return (
        <div className="memory-panel-overlay" onClick={onClose}>
            <div className="memory-panel" onClick={(e) => e.stopPropagation()}>
                <div className="memory-header">
                    <div className="memory-title">🧠 MEMORY</div>
                    <button className="memory-close" onClick={onClose}>✕</button>
                </div>

                <div className="memory-search">
                    <input
                        type="text"
                        placeholder="Search memories..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="memory-search-input"
                    />
                </div>

                <div className="memory-list">
                    {memories.length === 0 ? (
                        <div className="memory-empty">
                            {query ? 'No memories match your search' : 'No memories yet. I\'ll remember things as we talk!'}
                        </div>
                    ) : (
                        memories.map((m) => (
                            <div key={m.id} className="memory-item">
                                <span className="memory-icon">
                                    {categoryIcons[m.category] || '📝'}
                                </span>
                                <div className="memory-content">
                                    <div className="memory-text">{m.content}</div>
                                    <div className="memory-meta">
                                        {m.category} • {new Date(m.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    className="memory-delete"
                                    onClick={() => deleteMemory(m.id)}
                                    title="Forget this"
                                >
                                    🗑
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="memory-footer">
                    <span className="memory-count">{memories.length} memories</span>
                    <button
                        className={`memory-clear-btn ${confirmClear ? 'confirm' : ''}`}
                        onClick={handleClearAll}
                    >
                        {confirmClear ? 'Click again to confirm' : 'Clear All'}
                    </button>
                </div>
            </div>
        </div>
    );
}
