

// Audio context initialization
let mediaRecorder, audioChunks, audioBlob, stream, audioRecorded;
const ctx = new AudioContext();
let currentAudioForPlaying;
let lettersOfWordAreCorrect = [];

// UI-related variables
const page_title = "AI Pronunciation Trainer";
const accuracy_colors = ["green", "orange", "red"];
let badScoreThreshold = 30;
let mediumScoreThreshold = 70;
let currentSample = 0;
let currentScore = 0.;
let sample_difficult = 0;
let scoreMultiplier = 1;
let playAnswerSounds = true;
let isNativeSelectedForPlayback = true;
let isRecording = false;
let serverIsInitialized = false;
let serverWorking = true;
let languageFound = true;
let currentSoundRecorded = false;
let currentText, currentIpa, real_transcripts_ipa, matched_transcripts_ipa;
let wordCategories;
let startTime, endTime;

// API related variables 
let AILanguage = "fr"; // Standard is German


let STScoreAPIKey = 'rll5QsTiv83nti99BW6uCmvs9BDVxSB39SVFceYb'; // Public Key. If, for some reason, you would like a private one, send-me a message and we can discuss some possibilities
let apiMainPathSample = '';// 'http://127.0.0.1:3001';// 'https://a3hj0l2j2m.execute-api.eu-central-1.amazonaws.com/Prod';
let apiMainPathSTS = '';// 'https://wrg7ayuv7i.execute-api.eu-central-1.amazonaws.com/Prod';


// Variables to playback accuracy sounds
let soundsPath = '../static';//'https://stscore-sounds-bucket.s3.eu-central-1.amazonaws.com';
let soundFileGood = null;
let soundFileOkay = null;
let soundFileBad = null;

// Speech generation
var synth = window.speechSynthesis;
let voice_idx = 0;
let voice_synth = null;

// Real-time IPA conversion variables
let ipaConversionTimeout = null;
let isConvertingIPA = false;
const IPA_DEBOUNCE_DELAY = 300; // milliseconds

//############################ UI general control functions ###################
const unblockUI = () => {
    document.getElementById("recordAudio").classList.remove('disabled');
    document.getElementById("playSampleAudio").classList.remove('disabled');
    document.getElementById("buttonNext").onclick = () => getNextSample();
    document.getElementById("nextButtonDiv").classList.remove('disabled');
    document.getElementById("original_script").classList.remove('disabled');
    document.getElementById("buttonNext").style["background-color"] = '#58636d';

    if (currentSoundRecorded)
        document.getElementById("playRecordedAudio").classList.remove('disabled');


};

const blockUI = () => {

    document.getElementById("recordAudio").classList.add('disabled');
    document.getElementById("playSampleAudio").classList.add('disabled');
    document.getElementById("buttonNext").onclick = null;
    document.getElementById("original_script").classList.add('disabled');
    document.getElementById("playRecordedAudio").classList.add('disabled');

    document.getElementById("buttonNext").style["background-color"] = '#adadad';


};

const UIError = () => {
    blockUI();
    document.getElementById("buttonNext").onclick = () => getNextSample(); //If error, user can only try to get a new sample
    document.getElementById("buttonNext").style["background-color"] = '#58636d';

    document.getElementById("recorded_ipa_script").innerHTML = "";
    document.getElementById("single_word_ipa_pair").innerHTML = "Error";
    document.getElementById("ipa_script").innerHTML = "Error"

    document.getElementById("main_title").innerHTML = 'Server Error';
    document.getElementById("original_script").innerHTML = 'Server error. Either the daily quota of the server is over or there was some internal error. You can try to generate a new sample in a few seconds. If the error persist, try comming back tomorrow or download the local version from Github :)';
};

const UINotSupported = () => {
    unblockUI();

    document.getElementById("main_title").innerHTML = "Browser unsupported";

}

const UIRecordingError = () => {
    unblockUI();
    document.getElementById("main_title").innerHTML = "Recording error, please try again or restart page.";
    startMediaDevice();
}



//################### Application state functions #######################
function updateScore(currentPronunciationScore) {

    if (isNaN(currentPronunciationScore))
        return;
    currentScore += currentPronunciationScore * scoreMultiplier;
    currentScore = Math.round(currentScore);
}

const cacheSoundFiles = async () => {
    await fetch(soundsPath + '/ASR_good.wav').then(data => data.arrayBuffer()).
        then(arrayBuffer => ctx.decodeAudioData(arrayBuffer)).
        then(decodeAudioData => {
            soundFileGood = decodeAudioData;
        });

    await fetch(soundsPath + '/ASR_okay.wav').then(data => data.arrayBuffer()).
        then(arrayBuffer => ctx.decodeAudioData(arrayBuffer)).
        then(decodeAudioData => {
            soundFileOkay = decodeAudioData;
        });

    await fetch(soundsPath + '/ASR_bad.wav').then(data => data.arrayBuffer()).
        then(arrayBuffer => ctx.decodeAudioData(arrayBuffer)).
        then(decodeAudioData => {
            soundFileBad = decodeAudioData;
        });
}

const getNextSample = async () => {



    blockUI();

    if (!serverIsInitialized)
        await initializeServer();

    if (!serverWorking) {
        UIError();
        return;
    }

    if (soundFileBad == null)
        cacheSoundFiles();



    updateScore(parseFloat(document.getElementById("pronunciation_accuracy").innerHTML));

    document.getElementById("main_title").innerHTML = "Processing new sample...";


    if (document.getElementById('lengthCat1').checked) {
        sample_difficult = 0;
        scoreMultiplier = 1.3;
    }
    else if (document.getElementById('lengthCat2').checked) {
        sample_difficult = 1;
        scoreMultiplier = 1;
    }
    else if (document.getElementById('lengthCat3').checked) {
        sample_difficult = 2;
        scoreMultiplier = 1.3;
    }
    else if (document.getElementById('lengthCat4').checked) {
        sample_difficult = 3;
        scoreMultiplier = 1.6;
    }

    try {
        await fetch(apiMainPathSample + '/getSample', {
            method: "post",
            body: JSON.stringify({
                "category": sample_difficult.toString(), "language": AILanguage
            }),
            headers: { "X-Api-Key": STScoreAPIKey }
        }).then(res => res.json()).
            then(data => {



                let doc = document.getElementById("original_script");
                currentText = data.real_transcript;
                doc.innerHTML = currentText;

                currentIpa = data.ipa_transcript

                let doc_ipa = document.getElementById("ipa_script");
                doc_ipa.innerHTML = "/ " + currentIpa + " /";

                // Generate Portuguese transcription for generated sentences
                generatePortugueseForGeneratedSentence(currentIpa);

                document.getElementById("recorded_ipa_script").innerHTML = ""
                document.getElementById("pronunciation_accuracy").innerHTML = "";
                document.getElementById("single_word_ipa_pair").innerHTML = "Reference | Spoken"
                document.getElementById("section_accuracy").innerHTML = "| Score: " + currentScore.toString() + " - (" + currentSample.toString() + ")";
                currentSample += 1;

                document.getElementById("main_title").innerHTML = page_title;

                document.getElementById("translated_script").innerHTML = data.transcript_translation;

                currentSoundRecorded = false;
                unblockUI();
                document.getElementById("playRecordedAudio").classList.add('disabled');

            })
    }
    catch
    {
        UIError();
    }


};

const updateRecordingState = async () => {
    if (isRecording) {
        stopRecording();
        return
    }
    else {
        recordSample()
        return;
    }
}

const generateWordModal = (word_idx) => {

    document.getElementById("single_word_ipa_pair").innerHTML = wrapWordForPlayingLink(real_transcripts_ipa[word_idx], word_idx, false, "black")
        + ' | ' + wrapWordForPlayingLink(matched_transcripts_ipa[word_idx], word_idx, true, accuracy_colors[parseInt(wordCategories[word_idx])])
}

const recordSample = async () => {

    document.getElementById("main_title").innerHTML = "Recording... click again when done speaking";
    document.getElementById("recordIcon").innerHTML = 'pause_presentation';
    blockUI();
    document.getElementById("recordAudio").classList.remove('disabled');
    audioChunks = [];
    isRecording = true;
    mediaRecorder.start();

}

const changeLanguage = (language, generateNewSample = false) => {
    voices = synth.getVoices();
    AILanguage = language;
    languageFound = false;
    let languageIdentifier, languageName;
    switch (language) {
        case 'de':

            document.getElementById("languageBox").innerHTML = "German";
            languageIdentifier = 'de';
            languageName = 'Anna';
            break;

        case 'en':

            document.getElementById("languageBox").innerHTML = "English";
            languageIdentifier = 'en';
            languageName = 'Daniel';
            break;

        case 'fr':
            document.getElementById("languageBox").innerHTML = "French";
            languageIdentifier = 'fr';
            languageName = 'Paul';
            break;
    };

    for (idx = 0; idx < voices.length; idx++) {
        if (voices[idx].lang.slice(0, 2) == languageIdentifier && voices[idx].name == languageName) {
            voice_synth = voices[idx];
            languageFound = true;
            break;
        }

    }
    // If specific voice not found, search anything with the same language 
    if (!languageFound) {
        for (idx = 0; idx < voices.length; idx++) {
            if (voices[idx].lang.slice(0, 2) == languageIdentifier) {
                voice_synth = voices[idx];
                languageFound = true;
                break;
            }
        }
    }
    if (generateNewSample)
        getNextSample();
}

//################### Speech-To-Score function ########################
const mediaStreamConstraints = {
    audio: {
        channelCount: 1,
        sampleRate: 48000
    }
}


const startMediaDevice = () => {
    navigator.mediaDevices.getUserMedia(mediaStreamConstraints).then(_stream => {
        stream = _stream
        mediaRecorder = new MediaRecorder(stream);

        let currentSamples = 0
        mediaRecorder.ondataavailable = event => {

            currentSamples += event.data.length
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {


            document.getElementById("recordIcon").innerHTML = 'mic';
            blockUI();


            audioBlob = new Blob(audioChunks, { type: 'audio/ogg;' });

            let audioUrl = URL.createObjectURL(audioBlob);
            audioRecorded = new Audio(audioUrl);

            let audioBase64 = await convertBlobToBase64(audioBlob);

            let minimumAllowedLength = 6;
            if (audioBase64.length < minimumAllowedLength) {
                setTimeout(UIRecordingError, 50); // Make sure this function finished after get called again
                return;
            }

            try {
                // Get currentText from "original_script" div, in case user has change it
                let text = document.getElementById("original_script").innerHTML;
                // Remove html tags
                text = text.replace(/<[^>]*>?/gm, '');
                //Remove spaces on the beginning and end
                text = text.trim();
                // Remove double spaces
                text = text.replace(/\s\s+/g, ' ');
                currentText = [text];

                await fetch(apiMainPathSTS + '/GetAccuracyFromRecordedAudio', {
                    method: "post",
                    body: JSON.stringify({ "title": currentText[0], "base64Audio": audioBase64, "language": AILanguage }),
                    headers: { "X-Api-Key": STScoreAPIKey }

                }).then(res => res.json()).
                    then(data => {

                        if (playAnswerSounds)
                            playSoundForAnswerAccuracy(parseFloat(data.pronunciation_accuracy))

                        document.getElementById("recorded_ipa_script").innerHTML = "/ " + data.ipa_transcript + " /";
                        document.getElementById("recordAudio").classList.add('disabled');
                        document.getElementById("main_title").innerHTML = page_title;
                        document.getElementById("pronunciation_accuracy").innerHTML = data.pronunciation_accuracy + "%";
                        document.getElementById("ipa_script").innerHTML = data.real_transcripts_ipa

                        lettersOfWordAreCorrect = data.is_letter_correct_all_words.split(" ")


                        startTime = data.start_time;
                        endTime = data.end_time;


                        real_transcripts_ipa = data.real_transcripts_ipa.split(" ")
                        matched_transcripts_ipa = data.matched_transcripts_ipa.split(" ")
                        wordCategories = data.pair_accuracy_category.split(" ")
                        let currentTextWords = currentText[0].split(" ")

                        coloredWords = "";
                        for (let word_idx = 0; word_idx < currentTextWords.length; word_idx++) {

                            wordTemp = '';
                            for (let letter_idx = 0; letter_idx < currentTextWords[word_idx].length; letter_idx++) {
                                letter_is_correct = lettersOfWordAreCorrect[word_idx][letter_idx] == '1'
                                if (letter_is_correct)
                                    color_letter = 'green'
                                else
                                    color_letter = 'red'

                                wordTemp += '<font color=' + color_letter + '>' + currentTextWords[word_idx][letter_idx] + "</font>"
                            }
                            currentTextWords[word_idx]
                            coloredWords += " " + wrapWordForIndividualPlayback(wordTemp, word_idx)
                        }



                        document.getElementById("original_script").innerHTML = coloredWords

                        currentSoundRecorded = true;
                        unblockUI();
                        document.getElementById("playRecordedAudio").classList.remove('disabled');

                    });
            }
            catch {
                UIError();
            }
        };

    });
};
startMediaDevice();

// ################### Audio playback ##################
const playSoundForAnswerAccuracy = async (accuracy) => {

    currentAudioForPlaying = soundFileGood;
    if (accuracy < mediumScoreThreshold) {
        if (accuracy < badScoreThreshold) {
            currentAudioForPlaying = soundFileBad;
        }
        else {
            currentAudioForPlaying = soundFileOkay;
        }
    }
    playback();

}

const playAudio = async () => {

    document.getElementById("main_title").innerHTML = "Generating sound...";
    const currentUserText = getCurrentText();
    if (currentUserText && currentUserText.length > 0) {
        playWithMozillaApi(currentUserText);
    } else {
        // Fallback to original text if no user text
        playWithMozillaApi(currentText[0]);
    }
    document.getElementById("main_title").innerHTML = "Current Sound was played";

};

function playback() {
    const playSound = ctx.createBufferSource();
    playSound.buffer = currentAudioForPlaying;
    playSound.connect(ctx.destination);
    playSound.start(ctx.currentTime)
}


const playRecording = async (start = null, end = null) => {
    blockUI();

    try {
        if (start == null || end == null) {
            endTimeInMs = Math.round(audioRecorded.duration * 1000)
            audioRecorded.addEventListener("ended", function () {
                audioRecorded.currentTime = 0;
                unblockUI();
                document.getElementById("main_title").innerHTML = "Recorded Sound was played";
            });
            await audioRecorded.play();

        }
        else {
            audioRecorded.currentTime = start;
            audioRecorded.play();
            durationInSeconds = end - start;
            endTimeInMs = Math.round(durationInSeconds * 1000);
            setTimeout(function () {
                unblockUI();
                audioRecorded.pause();
                audioRecorded.currentTime = 0;
                document.getElementById("main_title").innerHTML = "Recorded Sound was played";
            }, endTimeInMs);

        }
    }
    catch {
        UINotSupported();
    }
};

const playNativeAndRecordedWord = async (word_idx) => {

    if (isNativeSelectedForPlayback)
        playCurrentWord(word_idx)
    else
        playRecordedWord(word_idx);

    isNativeSelectedForPlayback = !isNativeSelectedForPlayback;
}

const stopRecording = () => {
    isRecording = false
    mediaRecorder.stop()
    document.getElementById("main_title").innerHTML = "Processing audio...";
}


const playCurrentWord = async (word_idx) => {

    document.getElementById("main_title").innerHTML = "Generating word...";
    const currentUserText = getCurrentText();
    if (currentUserText && currentUserText.length > 0) {
        const words = currentUserText.split(' ');
        if (word_idx < words.length) {
            playWithMozillaApi(words[word_idx]);
        } else {
            // Fallback if word index is out of bounds
            playWithMozillaApi(currentText[0].split(' ')[word_idx]);
        }
    } else {
        // Fallback to original text if no user text
        playWithMozillaApi(currentText[0].split(' ')[word_idx]);
    }
    document.getElementById("main_title").innerHTML = "Word was played";
}

// TODO: Check if fallback is correct
const playWithMozillaApi = (text) => {

    if (languageFound) {
        blockUI();
        if (voice_synth == null)
            changeLanguage(AILanguage);

        var utterThis = new SpeechSynthesisUtterance(text);
        utterThis.voice = voice_synth;
        utterThis.rate = 0.7;
        utterThis.onend = function (event) {
            unblockUI();
        }
        synth.speak(utterThis);
    }
    else {
        UINotSupported();
    }
}
const playRecordedWord = (word_idx) => {
    // Garante que os tempos são arrays de números
    const startTimes = (startTime || '').split(' ').map(t => parseFloat(t)).filter(t => !isNaN(t));
    const endTimes = (endTime || '').split(' ').map(t => parseFloat(t)).filter(t => !isNaN(t));

    if (word_idx >= startTimes.length || word_idx >= endTimes.length) {
        console.error(`Índice de palavra (${word_idx}) fora do intervalo.`);
        return;
    }

    let adjustedStartTime = startTimes[word_idx];
    let adjustedEndTime = endTimes[word_idx];

    if (AILanguage === 'fr') {
        // Aplica uma correção mais suave para o francês
        const correctedTimes = correctFrenchWordTiming(word_idx, startTimes, endTimes);
        adjustedStartTime = correctedTimes.start;
        adjustedEndTime = correctedTimes.end;
    }

    // Validação final para garantir que o tempo de fim seja maior que o de início
    if (adjustedEndTime <= adjustedStartTime) {
        // Se a duração for inválida, cria uma duração mínima segura (ex: 300ms)
        adjustedEndTime = adjustedStartTime + 0.3; 
    }
    
    console.log(`Reproduzindo áudio: Início: ${adjustedStartTime.toFixed(2)}s, Fim: ${adjustedEndTime.toFixed(2)}s`);
    playRecording(adjustedStartTime, adjustedEndTime);
};

const correctFrenchWordTiming = (word_idx, startTimes, endTimes) => {
    let correctedStart = startTimes[word_idx];
    let correctedEnd = endTimes[word_idx];

    // Estratégia 1: Corrigir sobreposição com a palavra anterior
    if (word_idx > 0) {
        const previousEndTime = endTimes[word_idx - 1];
        if (correctedStart < previousEndTime) {
            // Se a palavra atual começar antes do fim da anterior, ajusta o início para logo após.
            // Isso evita a reprodução do final da palavra anterior.
            correctedStart = previousEndTime + 0.01; // Um pequeno gap de 10ms
            console.log(`Correção de sobreposição: Início ajustado para ${correctedStart.toFixed(2)}s`);
        }
    }

    // Estratégia 2: Garantir que a palavra não invada a próxima
    if (word_idx < startTimes.length - 1) {
        const nextStartTime = startTimes[word_idx + 1];
        if (correctedEnd > nextStartTime) {
            // Se a palavra atual terminar depois do início da próxima, ajusta o fim.
            // Isso evita que o início da próxima palavra seja reproduzido junto.
            correctedEnd = nextStartTime - 0.01; // Termina 10ms antes da próxima começar
            console.log(`Correção de sobreposição: Fim ajustado para ${correctedEnd.toFixed(2)}s`);
        }
    }
    
    // Evita durações negativas após as correções
    if (correctedEnd < correctedStart) {
        correctedEnd = correctedStart + 0.1; // Garante uma duração mínima
    }

    return {
        start: correctedStart,
        end: correctedEnd
    };
};

// ############# Utils #####################
const convertBlobToBase64 = async (blob) => {
    return await blobToBase64(blob);
}

const blobToBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

const wrapWordForPlayingLink = (word, word_idx, isFromRecording, word_accuracy_color) => {
    if (isFromRecording)
        return '<a style = " white-space:nowrap; color:' + word_accuracy_color + '; " href="javascript:playRecordedWord(' + word_idx.toString() + ')"  >' + word + '</a> '
    else
        return '<a style = " white-space:nowrap; color:' + word_accuracy_color + '; " href="javascript:playCurrentWord(' + word_idx.toString() + ')" >' + word + '</a> '
}

const wrapWordForIndividualPlayback = (word, word_idx) => {


    return '<a onmouseover="generateWordModal(' + word_idx.toString() + ')" style = " white-space:nowrap; " href="javascript:playNativeAndRecordedWord(' + word_idx.toString() + ')"  >' + word + '</a> '

}

// ########## Function to initialize server ###############
// This is to try to avoid aws lambda cold start 
try {
    fetch(apiMainPathSTS + '/GetAccuracyFromRecordedAudio', {
        method: "post",
        body: JSON.stringify({ "title": '', "base64Audio": '', "language": AILanguage }),
        headers: { "X-Api-Key": STScoreAPIKey }

    });
}
catch { }

const initializeServer = async () => {

    valid_response = false;
    document.getElementById("main_title").innerHTML = 'Initializing server, this may take up to 2 minutes...';
    let number_of_tries = 0;
    let maximum_number_of_tries = 4;

    while (!valid_response) {
        if (number_of_tries > maximum_number_of_tries) {
            serverWorking = false;
            break;
        }

        try {
            await fetch(apiMainPathSTS + '/GetAccuracyFromRecordedAudio', {
                method: "post",
                body: JSON.stringify({ "title": '', "base64Audio": '', "language": AILanguage }),
                headers: { "X-Api-Key": STScoreAPIKey }

            }).then(
                valid_response = true);
            serverIsInitialized = true;
        }
        catch
        {
            number_of_tries += 1;
        }
    }
}

// ########## Utility function to get current text ###############

const getCurrentText = () => {
    // Get current text from the editable element
    const textElement = document.getElementById("original_script");
    let text = textElement.innerHTML;
    
    // Remove HTML tags and clean up text
    text = text.replace(/<[^>]*>?/gm, '');
    text = text.trim();
    text = text.replace(/\s\s+/g, ' ');
    
    return text;
};

// ########## Real-time IPA conversion functions ###############

const convertTextToIPA = async (text, language) => {
    try {
        const response = await fetch('/convertToIPA', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                language: language
            })
        });
        
        const data = await response.json();
        return data.ipa || '';
    } catch (error) {
        console.error('Error converting text to IPA:', error);
        return '';
    }
};

const convertIPAToPortuguese = async (ipa, language) => {
    try {
        const response = await fetch('/convertToPortuguese', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ipa: ipa,
                language: language
            })
        });
        
        const data = await response.json();
        return data.portuguese || '';
    } catch (error) {
        console.error('Error converting IPA to Portuguese:', error);
        return '';
    }
};

const generatePortugueseForGeneratedSentence = async (ipa) => {
    try {
        // Only generate for French and English
        if (AILanguage === 'fr' || AILanguage === 'en') {
            const portuguese = await convertIPAToPortuguese(ipa, AILanguage);
            const portugueseElement = document.getElementById("portuguese_script");
            
            if (portuguese) {
                portugueseElement.innerHTML = "🇧🇷 " + portuguese;
            } else {
                portugueseElement.innerHTML = "";
            }
        } else {
            // Clear for other languages
            document.getElementById("portuguese_script").innerHTML = "";
        }
    } catch (error) {
        console.error('Error generating Portuguese for generated sentence:', error);
        document.getElementById("portuguese_script").innerHTML = "";
    }
};

const updateIPADisplay = async (text) => {
    if (isConvertingIPA) return;
    
    isConvertingIPA = true;
    
    try {
        const ipa = await convertTextToIPA(text, AILanguage);
        const ipaElement = document.getElementById("ipa_script");
        const portugueseElement = document.getElementById("portuguese_script");
        
        if (ipa) {
            ipaElement.innerHTML = "/ " + ipa + " /";
            
            // Convert IPA to Portuguese approximation (only for French and English)
            if (AILanguage === 'fr' || AILanguage === 'en') {
                const portuguese = await convertIPAToPortuguese(ipa, AILanguage);
                if (portuguese) {
                    portugueseElement.innerHTML = "🇧🇷 " + portuguese;
                } else {
                    portugueseElement.innerHTML = "";
                }
            } else {
                portugueseElement.innerHTML = "";
            }
        } else {
            ipaElement.innerHTML = "";
            portugueseElement.innerHTML = "";
        }
    } catch (error) {
        console.error('Error updating IPA display:', error);
    } finally {
        isConvertingIPA = false;
    }
};

const handleTextChange = () => {
    // Clear existing timeout
    if (ipaConversionTimeout) {
        clearTimeout(ipaConversionTimeout);
    }
    
    // Get current text from the editable element
    const textElement = document.getElementById("original_script");
    let text = textElement.innerHTML;
    
    // Remove HTML tags and clean up text
    text = text.replace(/<[^>]*>?/gm, '');
    text = text.trim();
    text = text.replace(/\s\s+/g, ' ');
    
    // Set new timeout for debounced IPA conversion
    ipaConversionTimeout = setTimeout(() => {
        if (text.length > 0) {
            updateIPADisplay(text);
        } else {
            document.getElementById("ipa_script").innerHTML = "";
            document.getElementById("portuguese_script").innerHTML = "";
        }
    }, IPA_DEBOUNCE_DELAY);
};

const initializeRealTimeIPA = () => {
    const textElement = document.getElementById("original_script");
    
    if (textElement) {
        // Add event listeners for real-time text changes
        textElement.addEventListener('input', handleTextChange);
        textElement.addEventListener('paste', () => {
            // Small delay to allow paste content to be processed
            setTimeout(handleTextChange, 10);
        });
        textElement.addEventListener('keyup', handleTextChange);
    }
};

// Initialize real-time IPA when page loads
document.addEventListener('DOMContentLoaded', initializeRealTimeIPA);

// Also initialize when the page is ready (fallback)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRealTimeIPA);
} else {
    initializeRealTimeIPA();
}

