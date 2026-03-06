/**
 * Sentiment Analysis Service
 * Lightweight keyword-based mood detection
 */

const MOOD_KEYWORDS = {
    sad: [
        'sad', 'depressed', 'unhappy', 'miserable', 'crying', 'cry', 'tears',
        'heartbroken', 'lonely', 'alone', 'hopeless', 'worthless', 'down',
        'blue', 'gloomy', 'grief', 'loss', 'miss', 'missing', 'hurt',
        'pain', 'broken', 'empty', 'numb',
    ],
    stressed: [
        'stressed', 'stress', 'anxious', 'anxiety', 'worried', 'worry',
        'overwhelmed', 'exhausted', 'tired', 'burned out', 'burnout',
        'frustrated', 'frustrating', 'annoyed', 'irritated', 'can\'t cope',
        'too much', 'pressure', 'deadline', 'panic', 'nervous',
    ],
    happy: [
        'happy', 'great', 'amazing', 'wonderful', 'fantastic', 'awesome',
        'excellent', 'love', 'excited', 'joy', 'thrilled', 'delighted',
        'pleased', 'good', 'nice', 'perfect', 'celebrate', 'fun',
        'glad', 'grateful', 'thankful', 'blessed',
    ],
    excited: [
        'excited', 'exciting', 'can\'t wait', 'pumped', 'stoked', 'hyped',
        'eager', 'looking forward', 'thrilling', 'incredible', 'wow',
        'unbelievable', 'mind blown', 'epic',
    ],
    angry: [
        'angry', 'furious', 'mad', 'rage', 'hate', 'pissed', 'annoying',
        'stupid', 'terrible', 'awful', 'worst', 'unfair', 'ridiculous',
    ],
};

const NEGATIVE_MOODS = ['sad', 'stressed', 'angry'];

let moodHistory = [];

/**
 * Analyze text for emotional content
 * @param {string} text - The user's message
 * @returns {{ mood: string, confidence: number, needsCheckIn: boolean }}
 */
export function analyzeSentiment(text) {
    const lower = text.toLowerCase();
    const scores = {};

    for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
        scores[mood] = 0;
        for (const keyword of keywords) {
            if (lower.includes(keyword)) {
                scores[mood]++;
            }
        }
    }

    // Find dominant mood
    let topMood = 'neutral';
    let topScore = 0;

    for (const [mood, score] of Object.entries(scores)) {
        if (score > topScore) {
            topScore = score;
            topMood = mood;
        }
    }

    const confidence = Math.min(topScore / 3, 1); // 0-1 scale

    // Track mood history for check-in detection
    if (topMood !== 'neutral') {
        moodHistory.push(topMood);
    }
    if (moodHistory.length > 5) {
        moodHistory = moodHistory.slice(-5);
    }

    // Check if user needs a check-in (2+ negative moods recently)
    const recentNegative = moodHistory
        .slice(-3)
        .filter((m) => NEGATIVE_MOODS.includes(m)).length;

    const needsCheckIn = recentNegative >= 2;

    return {
        mood: topScore > 0 ? topMood : 'neutral',
        confidence,
        needsCheckIn,
    };
}

/**
 * Map sentiment mood to avatar emotion
 */
export function moodToEmotion(mood) {
    const map = {
        happy: 'happy',
        excited: 'happy',
        sad: 'sad',
        stressed: 'concerned',
        angry: 'concerned',
        neutral: 'neutral',
    };
    return map[mood] || 'neutral';
}

/**
 * Reset mood history
 */
export function resetMoodHistory() {
    moodHistory = [];
}
