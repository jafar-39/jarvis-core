"use strict";

// =====================================
// JARVIS CORE 5.0 CONFIGURATION
// =====================================

const API_URL = JARVIS_CONFIG.API_URL;

const HISTORY_KEY = "jarvis_core_history_v5";
const MEMORY_KEY = "jarvis_core_memory_v4";

const WAKE_PHRASE = "hey jarvis";

let currentLanguage = "en";

let recognition = null;
let wakeMode = false;
let recognitionRunning = false;
let waitingForCommand = false;
let isSpeaking = false;
let isProcessing = false;

let restartTimer = null;

const chat = document.getElementById("chat");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendButton");
const voiceButton = document.getElementById("voiceButton");
const voiceStatus = document.getElementById("voiceStatus");
const connectionStatus = document.getElementById("connectionStatus");
const languageSelect = document.getElementById("languageSelect");
const clearButton = document.getElementById("clearButton");


// =====================================
// LANGUAGE SETTINGS
// =====================================

const speechLanguages = {
    en: "en-US",
    ha: "ha-NG",
    pcm: "en-NG",
    fr: "fr-FR",
    ar: "ar-SA"
};


// =====================================
// CHAT INTERFACE
// =====================================

function addMessage(sender, message, type = "normal") {

    const box = document.createElement("div");

    box.className = "message";

    if (sender === "JARVIS") {
        box.classList.add("jarvis-message");
    } else if (type === "error") {
        box.classList.add("error-message");
    } else {
        box.classList.add("user-message");
    }

    const name = document.createElement("strong");
    name.textContent = sender;

    const content = document.createElement("p");
    content.textContent = message;

    box.appendChild(name);
    box.appendChild(content);

    chat.appendChild(box);

    chat.scrollTop = chat.scrollHeight;
}


// =====================================
// CONVERSATION HISTORY
// =====================================

let history = [];

try {

    history = JSON.parse(
        localStorage.getItem(HISTORY_KEY) || "[]"
    );

    if (!Array.isArray(history)) {
        history = [];
    }

} catch {
    history = [];
}

function saveHistory() {

    try {

        localStorage.setItem(
            HISTORY_KEY,
            JSON.stringify(history.slice(-40))
        );

    } catch (error) {

        console.warn("History could not be saved:", error);

    }
}

function restoreHistory() {

    history.forEach(item => {
        addMessage(item.role, item.content);
    });

    chat.scrollTop = chat.scrollHeight;
}


// =====================================
// LOCAL MEMORY
// =====================================

function getMemory() {

    try {

        return JSON.parse(
            localStorage.getItem(MEMORY_KEY) || "[]"
        );

    } catch {

        return [];

    }
}

function saveMemory(items) {

    localStorage.setItem(
        MEMORY_KEY,
        JSON.stringify(items)
    );

}

function processLocalCommand(message) {

    const text = message.trim();
    const lower = text.toLowerCase();

    if (lower.startsWith("remember that ")) {

        const memory = getMemory();

        const fact = text.substring(14).trim();

        if (!fact) {
            return "Please tell me what you want me to remember.";
        }

        memory.push(fact);

        saveMemory(memory);

        return "Information saved to your local JARVIS memory.";
    }

    if (
        lower === "show my memory" ||
        lower === "what do you remember?"
    ) {

        const memory = getMemory();

        if (!memory.length) {
            return "Your local memory is currently empty.";
        }

        return "Here is what I remember:\n\n" +
            memory.map((item, index) =>
                `${index + 1}. ${item}`
            ).join("\n");
    }

    if (lower === "clear my memory") {

        saveMemory([]);

        return "Your local JARVIS memory has been cleared.";
    }

    if (
        lower === "who created you" ||
        lower === "who is your creator"
    ) {

        return "I was created by Jafar Muhammad Lawal.";
    }

    return null;
}


// =====================================
// BACKEND CONNECTION
// =====================================

async function askBackend(message) {

    const response = await fetch(
        API_URL + "/chat",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                message: message,
                language: currentLanguage
            })
        }
    );

    const raw = await response.text();

    let data;

    try {

        data = JSON.parse(raw);

    } catch {

        throw new Error(
            "The backend returned an invalid response: " +
            raw.substring(0, 300)
        );

    }

    if (!response.ok) {

        throw new Error(
            data.details ||
            data.message ||
            `Backend returned HTTP ${response.status}`
        );

    }

    if (
        data.status !== "success" ||
        typeof data.message !== "string"
    ) {

        throw new Error(
            data.details ||
            data.message ||
            "The AI returned an unexpected response."
        );

    }

    return data.message;
}


// =====================================
// VOICE OUTPUT
// =====================================

function speak(message, onComplete = null) {

    if (!("speechSynthesis" in window)) {

        if (onComplete) onComplete();

        return;

    }

    window.speechSynthesis.cancel();

    isSpeaking = true;

    const speech = new SpeechSynthesisUtterance(message);

    speech.lang =
        speechLanguages[currentLanguage] || "en-US";

    speech.rate = 0.95;
    speech.pitch = 0.9;
    speech.volume = 1;

    speech.onend = function () {

        isSpeaking = false;

        if (onComplete) {
            onComplete();
        }

    };

    speech.onerror = function () {

        isSpeaking = false;

        if (onComplete) {
            onComplete();
        }

    };

    window.speechSynthesis.speak(speech);

}


// =====================================
// AUTOMATIC WAKE MODE RESTART
// =====================================

function resumeWakeMode() {

    if (
        !wakeMode ||
        isSpeaking ||
        isProcessing
    ) {
        return;
    }

    clearTimeout(restartTimer);

    restartTimer = setTimeout(() => {

        startRecognition();

    }, 700);

}


// =====================================
// SPEECH RECOGNITION SETUP
// =====================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

if (SpeechRecognition) {

    recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = function () {

        recognitionRunning = true;

        if (wakeMode && !waitingForCommand) {

            voiceStatus.textContent =
                'WAITING FOR "HEY JARVIS"...';

        } else if (waitingForCommand) {

            voiceStatus.textContent =
                "JARVIS IS LISTENING...";

        }

    };


    // =================================
    // PROCESS RECOGNIZED SPEECH
    // =================================

    recognition.onresult = function (event) {

        const spokenText =
            event.results[0][0].transcript.trim();

        console.log("Recognized speech:", spokenText);

        if (!wakeMode) return;

        // Waiting for the actual command.
        if (waitingForCommand) {

            waitingForCommand = false;

            handleMessage(spokenText);

            return;
        }

        // Waiting for the wake phrase.
        const normalized = spokenText
            .toLowerCase()
            .replace(/[.,!?]/g, " ");

        const wakePattern = /\bhey\s+jarvis\b/i;

        const match = wakePattern.exec(normalized);

        if (!match) {

            voiceStatus.textContent =
                'WAITING FOR "HEY JARVIS"...';

            return;
        }

        // Extract anything spoken after the wake phrase.
        const command = normalized
            .substring(match.index + match[0].length)
            .trim();

        if (command.length > 0) {

            waitingForCommand = false;

            handleMessage(command);

        } else {

            waitingForCommand = true;

            voiceStatus.textContent =
                "WAKE PHRASE DETECTED";

            speak(
                "I'm listening, sir.",
                resumeWakeMode
            );

        }

    };


    // =================================
    // RECOGNITION ERRORS
    // =================================

    recognition.onerror = function (event) {

        console.error(
            "JARVIS VOICE ERROR:",
            event.error
        );

        recognitionRunning = false;

        if (
            event.error === "not-allowed" ||
            event.error === "service-not-allowed"
        ) {

            stopWakeMode();

            voiceStatus.textContent =
                "MICROPHONE PERMISSION DENIED";

            return;
        }

        if (event.error === "audio-capture") {

            voiceStatus.textContent =
                "MICROPHONE NOT AVAILABLE";

        }

    };


    // =================================
    // RECOGNITION ENDED
    // =================================

    recognition.onend = function () {

        recognitionRunning = false;

        resumeWakeMode();

    };

}


// =====================================
// START SPEECH RECOGNITION
// =====================================

function startRecognition() {

    if (
        !recognition ||
        !wakeMode ||
        recognitionRunning ||
        isSpeaking ||
        isProcessing
    ) {
        return;
    }

    try {

        recognition.lang =
            speechLanguages[currentLanguage] || "en-US";

        recognition.start();

    } catch (error) {

        console.warn(
            "Recognition could not start:",
            error
        );

        resumeWakeMode();

    }

}


// =====================================
// ACTIVATE WAKE MODE
// =====================================

function startWakeMode() {

    if (!recognition) {

        voiceStatus.textContent =
            "VOICE RECOGNITION NOT SUPPORTED";

        return;
    }

    wakeMode = true;

    waitingForCommand = false;

    voiceStatus.textContent =
        "ACTIVATING WAKE MODE...";

    speak(
        'Wake mode activated. Say "Hey JARVIS" when you need me.',
        resumeWakeMode
    );

}


// =====================================
// DEACTIVATE WAKE MODE
// =====================================

function stopWakeMode() {

    wakeMode = false;

    waitingForCommand = false;

    clearTimeout(restartTimer);

    if (recognition && recognitionRunning) {

        recognition.stop();

    }

    if ("speechSynthesis" in window) {

        window.speechSynthesis.cancel();

    }

    isSpeaking = false;

    voiceStatus.textContent =
        "WAKE MODE OFF";

}


// =====================================
// TOGGLE WAKE MODE
// =====================================

function toggleWakeMode() {

    if (wakeMode) {

        stopWakeMode();

    } else {

        startWakeMode();

    }

}


// =====================================
// PROCESS MESSAGE
// =====================================

async function handleMessage(message) {

    if (!message || isProcessing) return;

    isProcessing = true;

    addMessage("YOU", message);

    history.push({
        role: "user",
        content: message
    });

    saveHistory();

    sendButton.disabled = true;

    voiceStatus.textContent =
        "JARVIS IS THINKING...";

    try {

        // Check local commands first.
        const localResponse =
            processLocalCommand(message);

        let answer;

        if (localResponse !== null) {

            answer = localResponse;

        } else {

            answer = await askBackend(message);

        }

        addMessage("JARVIS", answer);

        history.push({
            role: "JARVIS",
            content: answer
        });

        saveHistory();

        voiceStatus.textContent =
            "JARVIS IS RESPONDING...";

        speak(answer, function () {

            if (wakeMode) {

                voiceStatus.textContent =
                    'WAITING FOR "HEY JARVIS"...';

            } else {

                voiceStatus.textContent =
                    "SYSTEM READY";

            }

            isProcessing = false;

            sendButton.disabled = false;

            resumeWakeMode();

        });

        return;

    } catch (error) {

        console.error("JARVIS ERROR:", error);

        const errorMessage =
            error.message ||
            "Unknown connection error.";

        addMessage(
            "JARVIS ERROR",
            errorMessage,
            "error"
        );

        voiceStatus.textContent =
            "SYSTEM ERROR";

        isProcessing = false;

        sendButton.disabled = false;

        resumeWakeMode();

    }

}


// =====================================
// MANUAL TEXT MESSAGE
// =====================================

function sendCommand() {

    const message = userInput.value.trim();

    if (!message || isProcessing) return;

    userInput.value = "";

    handleMessage(message);

}


// =====================================
// BUTTON EVENTS
// =====================================

sendButton.addEventListener(
    "click",
    sendCommand
);

userInput.addEventListener(
    "keydown",
    function (event) {

        if (event.key === "Enter") {

            sendCommand();

        }

    }
);


// =====================================
// MICROPHONE BUTTON
// =====================================

if (recognition) {

    voiceButton.addEventListener(
        "click",
        toggleWakeMode
    );

} else {

    voiceButton.disabled = true;

    voiceStatus.textContent =
        "VOICE RECOGNITION NOT SUPPORTED";

}


// =====================================
// LANGUAGE SELECTION
// =====================================

languageSelect.addEventListener(
    "change",
    function () {

        currentLanguage = languageSelect.value;

        if (wakeMode) {

            if (recognition && recognitionRunning) {

                recognition.stop();

            }

        }

    }
);


// =====================================
// CLEAR CHAT
// =====================================

clearButton.addEventListener(
    "click",
    function () {

        history = [];

        saveHistory();

        chat.innerHTML = "";

        addMessage(
            "JARVIS",
            "Conversation cleared. How may I assist you?"
        );

    }
);


// =====================================
// BACKEND HEALTH CHECK
// =====================================

async function checkConnection() {

    try {

        const response = await fetch(
            API_URL + "/health"
        );

        if (!response.ok) {

            throw new Error("Backend unavailable");

        }

        const data = await response.json();

        if (data.status !== "online") {

            throw new Error("Backend is offline");

        }

        connectionStatus.textContent =
            "BACKEND ONLINE";

        const dot = document.querySelector(".status-dot");

        if (dot) {
            dot.style.background = "#28d9a5";
        }

        voiceStatus.textContent =
            "SYSTEM READY";

    } catch (error) {

        connectionStatus.textContent =
            "BACKEND OFFLINE";

        const dot = document.querySelector(".status-dot");

        if (dot) {
            dot.style.background = "#ff687b";
        }

        voiceStatus.textContent =
            "CONNECTION ERROR";

        console.error(
            "Connection error:",
            error
        );

    }

}


// =====================================
// INITIALIZE JARVIS CORE 5.0
// =====================================

restoreHistory();

checkConnection();

console.log(
    "JARVIS CORE 5.0 initialized."
);

console.log(
    "Wake phrase:",
    WAKE_PHRASE
);