/**
 * Speech Recognition Service
 * Uses MediaRecorder + Groq Whisper API for flawless, lightning-fast voice recognition.
 * Fully manual Push-to-Talk for 100% reliability (no flaky silence detection).
 */

let mediaRecorder = null;
let audioChunks = [];
let isListening = false;

export function createSpeechRecognition({ onResult, onInterim, onError, onEnd }) {

    const startRecording = async () => {
        try {
            console.log("🎤 Mic: Requesting stream...");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunks = [];

            console.log("🎤 Mic: Recorder started.");
            if (onInterim) onInterim("Listening... (Click mic to send)");

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                    console.log(`🎤 Mic: Received chunk (${event.data.size} bytes). Total: ${audioChunks.length}`);
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("🎤 Mic: Recorder stopped. Processing binary data...");
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log(`🎤 Mic: Created Blob (${audioBlob.size} bytes).`);

                // Cleanup
                isListening = false;
                stream.getTracks().forEach(track => track.stop());

                // If no audio chunks at all, end early
                if (audioChunks.length === 0 || audioBlob.size < 100) {
                    console.warn("🎤 Mic: Recording was too short or empty.");
                    if (onEnd) onEnd();
                    return;
                }

                if (onInterim) onInterim("Thinking...");

                try {
                    let apiKey = '';
                    if (window.electronAPI) {
                        apiKey = await window.electronAPI.getApiKey();
                        console.log("🎤 Mic: Fetched API key from Electron.");
                    } else {
                        apiKey = localStorage.getItem('miya-api-key') || '';
                        console.log("🎤 Mic: Fetched API key from localStorage.");
                    }

                    if (!apiKey) {
                        throw new Error("No API key found.");
                    }

                    // Hybrid Mode Check
                    const normalizedKey = apiKey.trim().toUpperCase();
                    if (normalizedKey === 'LOCAL_BRAIN') {
                        apiKey = localStorage.getItem('miya-whisper-key') || '';
                        console.log("🎤 Mic: Hybrid Mode. Using backup Whisper key.");
                    }

                    if (!apiKey) {
                        throw new Error("Local Mode Active. Please enter a Groq key ONCE in settings to enable voice.");
                    }

                    const formData = new FormData();
                    formData.append('file', audioBlob, 'audio.webm');
                    formData.append('model', 'whisper-large-v3-turbo');
                    formData.append('response_format', 'json');
                    formData.append('language', 'en');
                    formData.append('prompt', 'A voice command. Ignore silence. Only output spoken words.'); // Context hint

                    console.log("🎤 Mic: Sending to Groq Whisper...");
                    const startTime = Date.now();

                    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.error?.message || "Transcription failed");
                    }

                    const data = await response.json();
                    console.log(`🎤 Mic: Groq result (in ${Date.now() - startTime}ms): "${data.text}"`);

                    if (data.text && data.text.trim()) {
                        if (onResult) onResult(data.text.trim());
                    } else {
                        console.log("🎤 Mic: Whisper returned empty text.");
                        if (onEnd) onEnd();
                    }

                } catch (err) {
                    console.error("❌ Mic: Error:", err);
                    if (onError) onError(err.message);
                }
            };

            mediaRecorder.start();
            isListening = true;

        } catch (err) {
            console.error("❌ Mic: Access denied:", err);
            isListening = false;
            if (onError) onError("Microphone access denied. Please check permissions.");
        }
    };

    return {
        start() {
            if (!isListening) {
                startRecording();
            }
        },
        stop() {
            if (isListening && mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                isListening = false;
            }
        },
        get listening() {
            return isListening;
        }
    };
}
