import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { warmModel } from './services/localBrainService';

export default function App() {
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef([]);
    const abortControllerRef = useRef(null);

    // Keep messagesRef synced for synchronous access in handleUserInput
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

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

            // Pre-load local brain if using LOCAL_BRAIN mode
            if (key && key.trim().toUpperCase() === 'LOCAL_BRAIN') {
                warmModel();
            }

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

    // RAF-batched streaming ref to avoid per-token re-renders
    const streamBufferRef = useRef({ text: '', rafId: null, msgId: null });

    // Process user input
    const handleUserInput = useCallback(
        async (text) => {
            if (!text.trim()) return;

            // Filter out common STT/Whisper silence hallucinations
            const lowerText = text.toLowerCase();
            if (lowerText.includes('ignore silence') ||
                lowerText.includes('8-billion') ||
                lowerText === 'subtitles by') {
                console.log('Ignored STT hallucination:', text);
                return;
            }

            // Immediately interrupt any ongoing speech or generation
            stopSpeaking();
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            // Create a new abort controller for this request
            abortControllerRef.current = new AbortController();
            const currentSignal = abortControllerRef.current.signal;

            setIsListening(false);
            recognitionRef.current?.stop();
            setInterimText('');

            const sentiment = analyzeSentiment(text);
            const detectedMood = sentiment.mood;
            setMood(detectedMood);
            setEmotion(moodToEmotion(detectedMood));

            const userMsg = { role: 'user', content: text, timestamp: Date.now() };

            // Read safely from our synchronized ref
            const currentMessages = messagesRef.current;
            const allMessages = [...currentMessages, userMsg].map((m) => ({
                role: m.role,
                content: m.content,
            }));

            setMessages((prev) => [...prev, userMsg]);

            setStatus('thinking');
            setStatusText('Processing...');
            setIsTyping(true);

            try {
                if (sentiment.needsCheckIn) {
                    allMessages.push({
                        role: 'system',
                        content: 'The user seems down. Be extra empathetic.',
                    });
                }

                // Setup streaming buffer
                const assistantMsgId = Date.now() + 1;
                streamBufferRef.current = { text: '', rafId: null, msgId: assistantMsgId };

                const response = await sendMessage(allMessages, apiKeyRef.current, (token) => {
                    const buf = streamBufferRef.current;
                    buf.text += token;
                    setIsTyping(false);
                    setStatus('thinking');
                    setStatusText('Thinking...');

                    // Batch DOM updates to animation frames (~60fps)
                    if (!buf.rafId) {
                        buf.rafId = requestAnimationFrame(() => {
                            buf.rafId = null;
                            const snapshot = buf.text;
                            setMessages(prev => {
                                const existing = prev.find(m => m.id === buf.msgId);
                                if (existing) {
                                    return prev.map(m => m.id === buf.msgId ? { ...m, content: snapshot } : m);
                                } else {
                                    return [...prev, {
                                        id: buf.msgId,
                                        role: 'assistant',
                                        content: snapshot,
                                        timestamp: Date.now(),
                                    }];
                                }
                            });
                        });
                    }
                }, currentSignal);

                // Flush any remaining buffered content
                if (streamBufferRef.current.rafId) {
                    cancelAnimationFrame(streamBufferRef.current.rafId);
                }
                setMessages(prev => {
                    const existing = prev.find(m => m.id === assistantMsgId);
                    if (existing) {
                        return prev.map(m => m.id === assistantMsgId ? { ...m, content: response } : m);
                    }
                    return prev;
                });

                extractAndSaveFacts(text, response);
                setIsTyping(false);

                setStatus('speaking');
                setStatusText('Speaking...');
                setEmotion(sentiment.needsCheckIn ? 'concerned' : moodToEmotion(detectedMood));

                const savedRate = parseFloat(localStorage.getItem('miya-rate') || '1.0');
                // Always use the latest selected voice from UI
                const currentVoice = localStorage.getItem('miya-voice') || '';

                speak(response, {
                    voice: currentVoice,
                    rate: savedRate,
                    onStart: () => setStatus('speaking'),
                    onEnd: () => {
                        // Check if we were interrupted before settling back to idle
                        if (!currentSignal.aborted) {
                            setStatus('idle');
                            setStatusText('Ready');
                            setTimeout(() => setEmotion('neutral'), 2000);
                        }
                    },
                });
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('Generation aborted by user interruption.');
                    // The new handleUserInput will safely take over UI state
                    return;
                }

                console.error('AI Error:', err);
                if (!currentSignal.aborted) {
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
            } finally {
                if (!currentSignal.aborted) {
                    setIsTyping(false);
                }
            }
        },
        [] // No dependency on messages — uses functional updater
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
    }, [handleUserInput]);

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
    }, [isListening]);

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
