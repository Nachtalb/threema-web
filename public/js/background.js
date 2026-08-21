/**
 * Pick a random background image.
 *
 * Runs inline before the app boots so the backdrop is set on first paint,
 * which is why the blur setting is read from storage directly rather than
 * through SettingsService.
 */
(function () {
    var COUNT = 19;
    var index = Math.floor(Math.random() * COUNT) + 1;
    var image = document.getElementById('background-image');
    if (image === null) {
        return;
    }

    // The blurred default hides compression artifacts, so it can use a much
    // smaller variant. Sharp mode gets the higher quality one.
    var blurred = true;
    try {
        blurred = localStorage.getItem('settings-backgroundBlur') !== 'false';
    } catch (e) {
        // Storage may be blocked; keep the default
    }

    image.src = 'img/backgrounds/bg' + index + (blurred ? '' : '.sharp') + '.avif';
})();
