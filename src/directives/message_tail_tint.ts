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
 * Tint a message tail with the colour of the picture it hangs off.
 *
 * A caption gives the bubble a coloured strip for the tail to grow out of, but
 * without one the tail sits directly against the image. Sampling the corner it
 * touches makes it look like the picture flows into it.
 */
export default [
    function() {
        return {
            restrict: 'A',
            link(scope: ng.IScope, element: ng.IAugmentedJQuery) {
                const tail = element[0] as unknown as SVGElement;
                const body = tail.closest('.message-body') as HTMLElement | null;
                if (body === null) {
                    return;
                }

                const tint = () => {
                    // Only for media without a caption; anything else has a
                    // bubble whose own colour is correct.
                    if (body.querySelector('.message-text') !== null) {
                        return;
                    }
                    const image = body.querySelector(
                        '.message-media img') as HTMLImageElement | null;
                    if (image === null || !image.complete || image.naturalWidth === 0) {
                        return;
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = image.naturalWidth;
                    canvas.height = image.naturalHeight;
                    const context = canvas.getContext('2d');
                    if (context === null) {
                        return;
                    }
                    try {
                        context.drawImage(image, 0, 0);
                        // The corner the tail hangs off. Read now rather than
                        // at link time: ng-class may not have marked the
                        // message as outgoing yet.
                        const isOutbox = tail.closest('.message-out') !== null;
                        const x = isOutbox ? canvas.width - 1 : 0;
                        const pixel = context.getImageData(x, canvas.height - 1, 1, 1).data;
                        const path = tail.querySelector('path');
                        if (path !== null) {
                            path.style.fill = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
                        }
                    } catch (error) {
                        // Tainted canvas: keep the bubble colour
                    }
                };

                const image = body.querySelector('.message-media img') as HTMLImageElement | null;
                if (image !== null && !image.complete) {
                    image.addEventListener('load', tint, {once: true});
                }
                tint();

                // The thumbnail is replaced once the full picture arrives
                const observer = new MutationObserver(tint);
                observer.observe(body, {childList: true, subtree: true, attributes: true,
                                        attributeFilter: ['src']});
                scope.$on('$destroy', () => observer.disconnect());
            },
        };
    },
];
