/**
 * Text-to-Speech Service
 * Wraps the browser SpeechSynthesis API with voice/rate settings
 */

let currentUtterance = null;

export function speak(text, { onStart, onEnd, voice, rate } = {}) {
    return new Promise((resolve) => {
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        currentUtterance = utterance;

        // Apply settings
        utterance.rate = rate || parseFloat(localStorage.getItem('miya-rate') || '1.0');
        utterance.pitch = 0.95;
        utterance.volume = 1.0;

        // Select voice
        const voices = window.speechSynthesis.getVoices();
        const voiceName = voice || localStorage.getItem('miya-voice') || '';

        if (voiceName) {
            const selected = voices.find((v) => v.name === voiceName || v.name.includes(voiceName));
            if (selected) utterance.voice = selected;
        } else {
            const preferred = voices.find(
                (v) =>
                    v.lang.startsWith('en') &&
                    (v.name.includes('Google') ||
                        v.name.includes('Microsoft') ||
                        v.name.includes('Natural') ||
                        v.name.includes('Zira') ||
                        v.name.includes('David'))
            );
            if (preferred) utterance.voice = preferred;
        }

        utterance.onstart = () => {
            if (onStart) onStart();
        };

        utterance.onend = () => {
            currentUtterance = null;
            if (onEnd) onEnd();
            resolve();
        };

        utterance.onerror = () => {
            currentUtterance = null;
            if (onEnd) onEnd();
            resolve();
        };

        window.speechSynthesis.speak(utterance);
    });
}

export function stopSpeaking() {
    window.speechSynthesis.cancel();
    currentUtterance = null;
}

export function isSpeaking() {
    return window.speechSynthesis.speaking;
}

// Pre-load voices
if (typeof window !== 'undefined') {
    window.speechSynthesis?.getVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
        window.speechSynthesis.getVoices();
    });
}
