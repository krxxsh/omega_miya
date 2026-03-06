import React, { useEffect, useRef } from 'react';

export default function ChatPanel({ messages, isTyping }) {
    const containerRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
        }, 50); // Tiny delay for DOM updates
        return () => clearTimeout(timer);
    }, [messages, isTyping]);

    if (messages.length === 0 && !isTyping) {
        return (
            <div className="chat-panel">
                <div className="chat-empty">
                    <span className="chat-empty-icon">✨</span>
                    <span className="chat-empty-title">Hey there!</span>
                    <span className="chat-empty-sub">
                        Press the mic or type a message to start talking with Miya
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-panel" ref={containerRef}>
            {messages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.role}`}>
                    <div className="message-content">{msg.content}</div>
                    <div className="message-footer">
                        <span className="timestamp">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                        {msg.role === 'assistant' && (
                            <button
                                className="message-action"
                                onClick={() => navigator.clipboard?.writeText(msg.content)}
                                title="Copy"
                            >
                                📋
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
                <div className="chat-message assistant typing-indicator">
                    <div className="typing-dots">
                        <span />
                        <span />
                        <span />
                    </div>
                </div>
            )}

            {/* Scroll bottom anchor */}
        </div>
    );
}
