import React, { useState, useRef, useEffect } from 'react';

export default function TextInput({ onSend, disabled }) {
    const [text, setText] = useState('');
    const textareaRef = useRef(null);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (ta) {
            ta.style.height = 'auto';
            ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
        }
    }, [text]);

    const handleSend = () => {
        const trimmed = text.trim();
        if (trimmed && !disabled) {
            onSend(trimmed);
            setText('');
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="text-input-container">
            <textarea
                ref={textareaRef}
                className="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message or press mic to talk..."
                disabled={disabled}
                rows={1}
            />
            <button
                className="send-btn"
                onClick={handleSend}
                disabled={!text.trim() || disabled}
                title="Send message"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
            </button>
        </div>
    );
}
