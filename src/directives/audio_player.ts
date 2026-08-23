/**
 * This file is part of Threema Web.
 *
 * Threema Web is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Threema Web. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * Play a voice message in place: a play/pause button and a track to scrub
 * with, and nothing else the native control set would bring along.
 */
export default [
    '$rootScope',
    function($rootScope: ng.IRootScopeService) {
        return {
            restrict: 'E',
            scope: {},
            bindToController: {
                src: '=eeeSrc',
                duration: '=?eeeDuration',
            },
            controllerAs: 'ctrl',
            controller: [function() {
                this.$onInit = function() {
                    this.playing = false;
                    this.position = 0;
                    // The blob carries no duration until it is decoded, so the
                    // one the message reports fills the gap in the meantime.
                    this.total = this.duration || 0;
                    this.scrubbing = false;
                };
            }],
            link($scope: any, $element: ng.IAugmentedJQuery) {
                const ctrl = $scope.ctrl;
                const audio = $element[0].querySelector('audio') as HTMLAudioElement;
                const track = $element[0].querySelector('.track') as HTMLElement;

                const apply = (fn: () => void) => $rootScope.$evalAsync(fn);

                audio.addEventListener('loadedmetadata', () => apply(() => {
                    if (isFinite(audio.duration)) {
                        ctrl.total = audio.duration;
                    }
                }));
                audio.addEventListener('timeupdate', () => apply(() => {
                    if (!ctrl.scrubbing) {
                        ctrl.position = audio.currentTime;
                    }
                }));
                audio.addEventListener('ended', () => apply(() => {
                    ctrl.playing = false;
                    ctrl.position = 0;
                }));
                // The download was a click asking to hear it, and `autoplay`
                // starts outside Angular, so the button follows the element.
                audio.addEventListener('play', () => apply(() => ctrl.playing = true));
                audio.addEventListener('pause', () => apply(() => ctrl.playing = false));

                ctrl.toggle = () => {
                    if (audio.paused) {
                        // A rejected play leaves the element paused, and the
                        // 'pause' listener already keeps the button in step.
                        audio.play().catch(() => undefined);
                    } else {
                        audio.pause();
                    }
                };

                const seekTo = (clientX: number) => {
                    const box = track.getBoundingClientRect();
                    const fraction = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
                    ctrl.position = fraction * ctrl.total;
                    audio.currentTime = ctrl.position;
                };

                track.addEventListener('mousedown', (event: MouseEvent) => {
                    event.preventDefault();
                    ctrl.scrubbing = true;
                    apply(() => seekTo(event.clientX));
                });
                // On the document, so a drag that leaves the track still ends
                const onMove = (event: MouseEvent) => {
                    if (ctrl.scrubbing) {
                        apply(() => seekTo(event.clientX));
                    }
                };
                const onUp = () => {
                    ctrl.scrubbing = false;
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                $scope.$on('$destroy', () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                });
            },
            // tslint:disable:max-line-length
            template: `
                <div class="inline-audio">
                    <audio ng-src="{{ ctrl.src | unsafeResUrl }}" preload="metadata" autoplay></audio>
                    <button class="play" ng-click="ctrl.toggle()" type="button"
                            translate-attr="{'aria-label': ctrl.playing ? 'messenger.AUDIO_PAUSE' : 'messenger.AUDIO_PLAY'}">
                        <svg viewBox="0 0 24 24" ng-if="!ctrl.playing"><path d="M8 5v14l11-7z"/></svg>
                        <svg viewBox="0 0 24 24" ng-if="ctrl.playing"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>
                    </button>
                    <div class="track" role="slider">
                        <div class="elapsed" ng-style="{width: (ctrl.total ? (ctrl.position / ctrl.total * 100) : 0) + '%'}"></div>
                        <div class="knob" ng-style="{left: (ctrl.total ? (ctrl.position / ctrl.total * 100) : 0) + '%'}"></div>
                    </div>
                    <span class="time">{{ ctrl.position | duration }} / {{ ctrl.total | duration }}</span>
                </div>
            `,
        };
    },
];
