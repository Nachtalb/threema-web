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
 * Scroll text back and forth when it does not fit its container.
 *
 * Overflow cannot be expressed in CSS, so the element is measured and the
 * distance it has to travel is handed to the animation as a custom property.
 */
export default [
    '$window',
    function($window: ng.IWindowService) {
        // Seconds it takes to travel the hidden part of the text
        const SECONDS_PER_100_PX = 3;

        return {
            restrict: 'A',
            link(scope: ng.IScope, element: ng.IAugmentedJQuery) {
                const node = element[0] as HTMLElement;

                const update = () => {
                    // ng-bind-html replaces the content, so the inner wrapper
                    // has to be (re)established before measuring.
                    let inner = node.firstElementChild as HTMLElement | null;
                    if (inner === null || !inner.classList.contains('marquee-inner')) {
                        inner = document.createElement('span');
                        inner.className = 'marquee-inner';
                        while (node.firstChild !== null) {
                            inner.appendChild(node.firstChild);
                        }
                        node.appendChild(inner);
                    }

                    const overflow = inner.scrollWidth - node.clientWidth;
                    if (overflow <= 1) {
                        node.classList.remove('marquee');
                        node.style.removeProperty('--marquee-distance');
                        node.style.removeProperty('--marquee-duration');
                        return;
                    }
                    node.style.setProperty('--marquee-distance', `-${overflow}px`);
                    node.style.setProperty(
                        '--marquee-duration', `${(overflow / 100) * SECONDS_PER_100_PX}s`);
                    node.classList.add('marquee');
                };

                // Re-measure whenever the text or the available width changes
                const observer = new MutationObserver(() => {
                    // Skip the mutations the wrapper itself causes
                    observer.disconnect();
                    update();
                    observer.observe(node, {childList: true, characterData: true, subtree: true});
                });
                observer.observe(node, {childList: true, characterData: true, subtree: true});
                $window.addEventListener('resize', update);
                scope.$watch(() => node.clientWidth, update);

                scope.$on('$destroy', () => {
                    observer.disconnect();
                    $window.removeEventListener('resize', update);
                });
            },
        };
    },
];
