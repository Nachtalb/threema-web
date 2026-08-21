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
 * Open the message menu on right click instead of showing a button for it.
 *
 * The menu is an md-menu rendered inside the message. It is positioned
 * relative to its (hidden) trigger, so the trigger is moved to the pointer
 * before the menu is opened.
 */
export default [
    function() {
        return {
            restrict: 'A',
            link(scope, element: ng.IAugmentedJQuery) {
                element[0].addEventListener('contextmenu', (event: MouseEvent) => {
                    const menu = element[0].querySelector('.message-menu md-menu') as HTMLElement | null;
                    const trigger = menu === null
                        ? null
                        : menu.querySelector('button') as HTMLElement | null;
                    if (trigger === null) {
                        // No menu for this message, keep the browser's own
                        return;
                    }
                    event.preventDefault();

                    const rect = element[0].getBoundingClientRect();
                    menu.style.left = `${event.clientX - rect.left}px`;
                    menu.style.top = `${event.clientY - rect.top}px`;

                    trigger.click();
                });
            },
        };
    },
];
