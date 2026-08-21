/**
 * Pick a random background image.
 *
 * Runs inline before the app boots so the backdrop is set on first paint.
 */
(function () {
    var COUNT = 11;
    var index = Math.floor(Math.random() * COUNT) + 1;
    var image = document.getElementById('background-image');
    if (image !== null) {
        image.src = 'img/backgrounds/bg' + index + '.jpg';
    }
})();
