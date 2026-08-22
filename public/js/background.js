/**
 * Pick a random background image.
 *
 * Runs inline before the app boots so the backdrop is set on first paint,
 * which is why the blur setting is read from storage directly rather than
 * through SettingsService.
 */
(function () {
    var COUNT = 19;
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

    var index = Math.floor(Math.random() * COUNT) + 1;
    image.src = 'img/backgrounds/bg' + index + (blurred ? '' : '.sharp') + '.avif';

    // A picture of the user's own wins over the shipped ones. It lives in
    // IndexedDB, so it arrives a moment after the default is already showing.
    try {
        var request = indexedDB.open('threema-background', 1);
        request.onupgradeneeded = function () {
            request.result.createObjectStore('image');
        };
        request.onsuccess = function () {
            var db = request.result;
            if (!db.objectStoreNames.contains('image')) {
                return;
            }
            var read = db.transaction('image', 'readonly')
                .objectStore('image')
                .get('custom');
            read.onsuccess = function () {
                if (read.result) {
                    image.src = URL.createObjectURL(read.result);
                }
            };
        };
    } catch (e) {
        // No IndexedDB: the shipped pictures are already in place
    }
})();
