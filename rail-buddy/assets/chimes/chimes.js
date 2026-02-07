/* Audio Elements */
// Only attach handlers once DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    var ccl = document.getElementById("chimes");
    if (ccl) {
        ccl.addEventListener('mousedown', handleChimesClick);
        ccl.addEventListener('touchstart', handleChimesTap);
    }
});

let clickCount = 0;
let clickTimer = null;
let tapCount = 0;
let tapTimer = null;

// Single click/tap to play normal chime, triple click/tap to play alternate chime
function handleChimesClick(event) {
    if (event.button !== 0) return; // Only left mouse button
    clickCount++;
    if (clickCount === 3) {
        clearTimeout(clickTimer);
        playAltAudio();
        clickCount = 0;
    } else {
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
            if (clickCount === 1) playAudio();
            clickCount = 0;
        }, 400);
    }
}

function handleChimesTap(event) {
    tapCount++;
    if (tapCount === 3) {
        clearTimeout(tapTimer);
        playAltAudio();
        tapCount = 0;
    } else {
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
            if (tapCount === 1) playAudio();
            tapCount = 0;
        }, 500);
    }
}

function playAudio() {
    const audio = document.getElementById('chimes-audio');
    const altAudio = document.getElementById('chimes-alt');
    if (audio) {
        // Stop and reset both audios before playing
        if (altAudio) {
            altAudio.pause();
            altAudio.currentTime = 0;
        }
        audio.pause();
        audio.currentTime = 0;
        audio.play();
    }
}

function playAltAudio() {
    const audio = document.getElementById('chimes-audio');
    const altAudio = document.getElementById('chimes-alt');
    if (altAudio) {
        // Stop and reset both audios before playing
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
        altAudio.pause();
        altAudio.currentTime = 0;
        altAudio.play();
    }
}
