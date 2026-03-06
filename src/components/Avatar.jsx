import React from 'react';

const EMOTION_COLORS = {
    neutral: { primary: '#06b6d4', secondary: '#3b82f6', glow: 'rgba(6, 182, 212, 0.5)' },
    happy: { primary: '#fbbf24', secondary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.5)' },
    sad: { primary: '#60a5fa', secondary: '#2563eb', glow: 'rgba(37, 99, 235, 0.4)' },
    thinking: { primary: '#a78bfa', secondary: '#8b5cf6', glow: 'rgba(139, 92, 246, 0.5)' },
    excited: { primary: '#f472b6', secondary: '#ec4899', glow: 'rgba(236, 72, 153, 0.5)' },
    concerned: { primary: '#fb923c', secondary: '#ea580c', glow: 'rgba(234, 88, 12, 0.5)' },
};

export default function Avatar({ emotion = 'neutral', status = 'idle', mood = '' }) {
    const orbClass = ['avatar-orb'];

    if (status === 'speaking') orbClass.push('speaking');
    else if (status === 'listening') orbClass.push('listening');
    else if (status === 'thinking') orbClass.push('thinking');

    if (['happy', 'sad', 'concerned', 'excited'].includes(emotion) && status !== 'listening') {
        orbClass.push(emotion);
    }

    const statusLabels = {
        idle: 'STANDING BY',
        listening: 'LISTENING',
        thinking: 'PROCESSING',
        speaking: 'SPEAKING',
    };

    const colors = EMOTION_COLORS[emotion] || EMOTION_COLORS.neutral;

    return (
        <div className="avatar-section">
            <div className="avatar-container">
                {/* Outer particle rings */}
                <div className="avatar-particles">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            className="particle"
                            style={{
                                '--i': i,
                                '--color': colors.primary,
                                animationDelay: `${i * 0.4}s`,
                            }}
                        />
                    ))}
                </div>

                {/* Main orb */}
                <div className={orbClass.join(' ')}>
                    <div className="orb-inner">
                        <div className="orb-core" />
                        <div className="orb-wave wave-1" />
                        <div className="orb-wave wave-2" />
                        <div className="orb-wave wave-3" />
                    </div>
                </div>

                {/* Rotating ring */}
                <div className="avatar-ring" />
                <div className="avatar-ring ring-2" />
            </div>

            <div className="avatar-name">MIYA</div>
            <div className="avatar-status">{statusLabels[status] || 'ONLINE'}</div>
            {mood && mood !== 'neutral' && (
                <div className="avatar-mood">Sensing: {mood}</div>
            )}
        </div>
    );
}
