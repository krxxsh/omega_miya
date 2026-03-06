import React, { useState, useEffect, useRef, useCallback } from 'react';
import Avatar from './components/Avatar';
import ChatPanel from './components/ChatPanel';
import VoiceControls from './components/VoiceControls';
import TextInput from './components/TextInput';
import SettingsModal from './components/SettingsModal';
import MemoryPanel from './components/MemoryPanel';
import { createSpeechRecognition } from './services/speechRecognition';
import { speak, stopSpeaking } from './services/textToSpeech';
import { sendMessage } from './services/aiService';
import { analyzeSentiment, moodToEmotion } from './services/sentimentAnalysis';
import { extractAndSaveFacts } from './services/memoryService';
import { requestNotificationPermission } from './services/commandService';

export default function App() {
    const [messages, setMessages] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState('idle');
    const [emotion, setEmotion] = useState('neutral');
    const [mood, setMood] = useState('');
    const [statusText, setStatusText] = useState('Ready');
    const [showSettings, setShowSettings] = useState(false);
    const [showMemory, setShowMemory] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [interimText, setInterimText] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const recognitionRef = useRef(null);
    const apiKeyRef = useRef('');

    useEffect(() => {
        apiKeyRef.current = apiKey;
    }, [apiKey]);

    // Load API key and init
    useEffect(() => {
        const init = async () => {
            let key = '';
            if (window.electronAPI) {
                key = await window.electronAPI.getApiKey();
            } else {
                key = localStorage.getItem('miya-api-key') || '';
            }

            if (key) {
                setApiKey(key);
            } else {
                setShowSettings(true);
            }

            requestNotificationPermission();

            // Daily check-in greeting
            const hour = new Date().getHours();
            let greeting;
            if (hour < 12) greeting = 'Good morning!';
            else if (hour < 17) greeting = 'Good afternoon!';
            else greeting = 'Good evening!';

            const greetMsg = `${greeting} I'm Miya, your personal AI assistant. How's your day going? I'm here to chat, help you search the web, open apps, create files, or just keep you company. 😊`;

            setMessages([{
                role: 'assistant',
                content: greetMsg,
                timestamp: Date.now(),
            }]);

            // Speak greeting
            setTimeout(() => {
                setStatus('speaking');
                setEmotion('happy');
                const savedRate = parseFloat(localStorage.getItem('miya-rate') || '1.0');
                const savedVoice = localStorage.getItem('miya-voice') || '';
                speak(greetMsg, {
                    voice: savedVoice,
                    rate: savedRate,
                    onEnd: () => {
                        setStatus('idle');
                        setTimeout(() => setEmotion('neutral'), 1500);
                    },
                });
            }, 600);
        };

        init();
    }, []);

    // Process user input
    const handleUserInput = useCallback(
        async (text) => {
            if (!text.trim()) return;

            setIsListening(false);
            recognitionRef.current?.stop();
            setInterimText('');

            const sentiment = analyzeSentiment(text);
            const detectedMood = sentiment.mood;
            setMood(detectedMood);
            setEmotion(moodToEmotion(detectedMood));

            const userMsg = { role: 'user', content: text, timestamp: Date.now() };
            setMessages((prev) => [...prev, userMsg]);

            setStatus('thinking');
            setStatusText('Processing...');
            setIsTyping(true);

            try {
                const allMessages = [...messages, userMsg].map((m) => ({
                    role: m.role,
                    content: m.content,
                }));

                if (sentiment.needsCheckIn) {
                    allMessages.push({
                        role: 'system',
                        content: 'The user seems down. Be extra empathetic.',
                    });
                }

                const response = await sendMessage(allMessages, apiKeyRef.current);

                extractAndSaveFacts(text, response);

                const assistantMsg = {
                    role: 'assistant',
                    content: response,
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
                setIsTyping(false);

                setStatus('speaking');
                setStatusText('Speaking...');
                setEmotion(sentiment.needsCheckIn ? 'concerned' : moodToEmotion(detectedMood));

                const savedRate = parseFloat(localStorage.getItem('miya-rate') || '1.0');
                const savedVoice = localStorage.getItem('miya-voice') || '';
                await speak(response, {
                    voice: savedVoice,
                    rate: savedRate,
                    onStart: () => setStatus('speaking'),
                    onEnd: () => {
                        setStatus('idle');
                        setStatusText('Ready');
                        setTimeout(() => setEmotion('neutral'), 2000);
                    },
                });
            } catch (err) {
                console.error('AI Error:', err);
                setIsTyping(false);
                const errorMsg = {
                    role: 'assistant',
                    content: `I'm having trouble: ${err.message}`,
                    timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, errorMsg]);
                setStatus('idle');
                setStatusText('Error');
                setEmotion('concerned');
            }
        },
        [messages]
    );

    // Keep latest callbacks in a ref to avoid stale closures in event listeners
    const voiceCallbacks = useRef({});

    // Always update to the latest state references
    useEffect(() => {
        voiceCallbacks.current = {
            onResult: (text) => {
                setInterimText('');
                handleUserInput(text);
            },
            onInterim: (text) => setInterimText(text),
            onError: (err) => {
                setStatusText(`Mic error: ${err}`);
                setStatus('idle');
                setIsListening(false);
            },
            onEnd: () => {
                setStatus('idle');
                setStatusText('Ready');
                setIsListening(false);
            }
        };
    });

    // Toggle microphone (Push to Talk / Click to Stop)
    const toggleMic = useCallback(() => {
        if (isListening) {
            // STOP listening and trigger transcription
            setIsListening(false);
            setStatus('thinking');
            setStatusText('Transcribing...');
            recognitionRef.current?.stop();
        } else {
            // START listening
            stopSpeaking();

            if (!recognitionRef.current) {
                recognitionRef.current = createSpeechRecognition({
                    onResult: (text) => voiceCallbacks.current.onResult?.(text),
                    onInterim: (text) => voiceCallbacks.current.onInterim?.(text),
                    onError: (err) => voiceCallbacks.current.onError?.(err),
                    onEnd: () => voiceCallbacks.current.onEnd?.()
                });
            }

            recognitionRef.current.start();
            setIsListening(true);
            setStatus('listening');
            setStatusText('Listening... (Click again to send)');
        }
    }, [isListening, handleUserInput, status]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKey = (e) => {
            if (e.ctrlKey && e.key === 'm') {
                e.preventDefault();
                toggleMic();
            }
            if (e.key === 'Escape') {
                if (showSettings) setShowSettings(false);
                if (showMemory) setShowMemory(false);
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [toggleMic, showSettings, showMemory]);

    // Save API key
    const saveApiKey = async (key) => {
        setApiKey(key);
        if (window.electronAPI) {
            await window.electronAPI.setApiKey(key);
        } else {
            localStorage.setItem('miya-api-key', key);
        }
        setShowSettings(false);
    };

    return (
        <div className="app">
            {/* Title Bar */}
            <div className="titlebar">
                <span className="titlebar-title">MIYA</span>
                <div className="titlebar-controls">
                    <button
                        className="titlebar-btn"
                        onClick={() => window.electronAPI?.minimize?.()}
                        title="Minimize"
                    >−</button>
                    <button
                        className="titlebar-btn close"
                        onClick={() => window.electronAPI?.quit?.()}
                        title="Close"
                    >×</button>
                </div>
            </div>

            {/* Avatar */}
            <Avatar emotion={emotion} status={status} mood={mood} />

            {/* Interim text */}
            {interimText && (
                <div style={{
                    textAlign: 'center', padding: '4px 16px', fontSize: 12,
                    color: 'var(--text-dim)', fontStyle: 'italic', zIndex: 1, position: 'relative',
                }}>
                    "{interimText}..."
                </div>
            )}

            {/* Chat */}
            <ChatPanel messages={messages} isTyping={isTyping} />

            {/* Controls */}
            <div className="controls-bar">
                <VoiceControls
                    isListening={isListening}
                    onToggleMic={toggleMic}
                    onOpenSettings={() => setShowSettings(true)}
                    onOpenMemory={() => setShowMemory(true)}
                />
                <TextInput
                    onSend={handleUserInput}
                    disabled={status === 'thinking' || status === 'speaking'}
                />
            </div>

            {/* Settings */}
            {showSettings && (
                <SettingsModal
                    currentKey={apiKey}
                    onSave={saveApiKey}
                    onClose={() => (apiKey ? setShowSettings(false) : null)}
                />
            )}

            {/* Memory Panel */}
            <MemoryPanel isOpen={showMemory} onClose={() => setShowMemory(false)} />
        </div>
    );
}
