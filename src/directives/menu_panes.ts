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
 * Size the message menu to whichever of its two panes is showing.
 *
 * The panes are stacked and absolutely positioned, so the container has no
 * size of its own and CSS cannot transition to `auto`. Both panes are measured
 * up front and the size is applied on the same class change that starts the
 * slide, so the resize and the slide animate together.
 */
export default [
    function() {
        return {
            restrict: 'A',
            link(scope: ng.IScope, element: ng.IAugmentedJQuery) {
                const container = element[0] as HTMLElement;
                const sizes = new Map<string, {width: number, height: number}>();

                const measure = () => {
                    for (const selector of ['.message-menu-actions', '.message-details']) {
                        const pane = container.querySelector(selector) as HTMLElement | null;
                        if (pane !== null && pane.offsetHeight > 0) {
                            sizes.set(selector, {width: pane.offsetWidth, height: pane.offsetHeight});
                        }
                    }
                };

                const apply = (open: boolean) => {
                    const size = sizes.get(open ? '.message-details' : '.message-menu-actions');
                    if (size !== undefined) {
                        container.style.width = `${size.width}px`;
                        container.style.height = `${size.height}px`;
                    }
                };

                const isOpen = () => container.classList.contains('details-open');

                // The menu is hidden until it opens, so the panes have no size
                // to measure yet. Watch for them getting one.
                const observer = new ResizeObserver(() => {
                    measure();
                    apply(isOpen());
                });
                container.querySelectorAll('.message-menu-pane')
                    .forEach((pane) => observer.observe(pane));

                // ng-class toggles `details-open` on this element. The
                // MutationObserver fires as soon as the class lands, so the
                // size change starts alongside the slide.
                const classObserver = new MutationObserver(() => apply(isOpen()));
                classObserver.observe(container, {attributes: true, attributeFilter: ['class']});

                scope.$on('$destroy', () => {
                    observer.disconnect();
                    classObserver.disconnect();
                });
            },
        };
    },
];
