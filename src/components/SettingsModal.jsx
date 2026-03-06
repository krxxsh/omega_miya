import React, { useState, useEffect } from 'react';

export default function SettingsModal({ currentKey, onSave, onClose }) {
    const [key, setKey] = useState(currentKey || '');
    const [selectedVoice, setSelectedVoice] = useState('');
    const [speechRate, setSpeechRate] = useState(1.0);
    const [voices, setVoices] = useState([]);
    const [autoStart, setAutoStart] = useState(false);

    useEffect(() => {
        // Load voices
        const loadVoices = () => {
            const v = window.speechSynthesis?.getVoices() || [];
            const english = v.filter((voice) => voice.lang.startsWith('en'));
            setVoices(english);
        };
        loadVoices();
        window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);

        // Load settings
        setSelectedVoice(localStorage.getItem('miya-voice') || '');
        setSpeechRate(parseFloat(localStorage.getItem('miya-rate') || '1.0'));

        // Load auto-start
        if (window.electronAPI?.getAutostart) {
            window.electronAPI.getAutostart().then(setAutoStart);
        }

        return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices);
    }, []);

    const handleSave = () => {
        localStorage.setItem('miya-voice', selectedVoice);
        localStorage.setItem('miya-rate', speechRate.toString());

        onSave(key);
    };

    const handleAutoStartToggle = () => {
        const newVal = !autoStart;
        setAutoStart(newVal);
        if (window.electronAPI?.setAutostart) {
            window.electronAPI.setAutostart(newVal);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-title">⚙ SETTINGS</div>

                {/* API Key */}
                <div className="settings-section">
                    <label className="modal-label">AI Engine API Key</label>
                    <input
                        className="modal-input"
                        type="password"
                        placeholder="gsk_... (Groq) or sk-ant_... (Claude)"
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                        autoFocus
                    />
                    <div className="modal-hint">
                        Supports <b>Groq</b> (Free, Ultra-Fast) or <b>Claude 3.5</b> (Advanced reasoning).
                    </div>
                </div>

                {/* Voice */}
                <div className="settings-section">
                    <label className="modal-label">Voice</label>
                    <select
                        className="modal-input modal-select"
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                    >
                        <option value="">Auto (Default)</option>
                        {voices.map((v) => (
                            <option key={v.name} value={v.name}>
                                {v.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Speech Rate */}
                <div className="settings-section">
                    <label className="modal-label">
                        Speech Rate: {speechRate.toFixed(1)}x
                    </label>
                    <input
                        type="range"
                        className="modal-slider"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={speechRate}
                        onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    />
                </div>

                {/* Auto-start */}
                <div className="settings-section">
                    <label className="settings-toggle" onClick={handleAutoStartToggle}>
                        <span className={`toggle-switch ${autoStart ? 'on' : ''}`} />
                        <span>Start Miya when I turn on my laptop</span>
                    </label>
                </div>

                <div className="modal-actions">
                    <button className="modal-btn" onClick={onClose}>Cancel</button>
                    <button className="modal-btn primary" onClick={handleSave}>Save</button>
                </div>
            </div>
        </div>
    );
}
