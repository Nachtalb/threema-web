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
 * angular-material positions the menu relative to its trigger, so the (hidden)
 * trigger is moved to the pointer first. The message is marked as selected for
 * as long as the menu is open.
 */
export default [
    '$rootScope', '$mdMenu',
    function($rootScope: ng.IRootScopeService, $mdMenu: any) {
        return {
            restrict: 'A',
            link(scope, element: ng.IAugmentedJQuery) {
                const message = element[0];

                const open = (event: MouseEvent) => {
                    const menu = message.querySelector('.message-menu md-menu') as HTMLElement | null;
                    const trigger = menu === null
                        ? null
                        : menu.querySelector('button') as HTMLElement | null;
                    if (trigger === null) {
                        // No menu for this message, keep the browser's own
                        return false;
                    }

                    // The menu opens from the trigger's own box, so place that
                    // box exactly under the pointer.
                    const rect = message.getBoundingClientRect();
                    menu.style.left = `${event.clientX - rect.left}px`;
                    menu.style.top = `${event.clientY - rect.top}px`;

                    // Only ever one message is selected at a time
                    document.querySelectorAll('.message-selected')
                        .forEach((el) => el.classList.remove('message-selected'));
                    message.classList.add('message-selected');
                    // Always open on the action list, never on the details
                    // left behind by a previous visit.
                    const menuScope = (window as any).angular.element(menu).scope();
                    if (menuScope !== undefined && menuScope.ctrl !== undefined) {
                        menuScope.ctrl.detailsOpen = false;
                    }
                    trigger.click();
                    return true;
                };

                message.addEventListener('contextmenu', (event: MouseEvent) => {
                    if (open(event)) {
                        event.preventDefault();
                    }
                });

                // While a menu is open its backdrop swallows the event, so the
                // click never reaches the message underneath. Close the open
                // menu and open this one instead of falling back to the
                // browser's own menu.
                const onBackdropContextmenu = (event: MouseEvent) => {
                    const backdrop = document.querySelector('.md-menu-backdrop, md-backdrop');
                    if (backdrop === null || event.target !== backdrop) {
                        return;
                    }
                    const under = document
                        .elementsFromPoint(event.clientX, event.clientY)
                        .find((el) => el.classList.contains('message'));
                    if (under !== message) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    // Close the open menu properly, then open this one once it
                    // has torn down.
                    $mdMenu.hide(null, {closeAll: true});
                    setTimeout(() => scope.$apply(() => open(event)), 0);
                };
                document.addEventListener('contextmenu', onBackdropContextmenu, true);

                // md-menu closes by removing its container from the body, so
                // watch for that rather than listening on the trigger.
                const deregister = $rootScope.$on(
                    '$mdMenuClose', () => message.classList.remove('message-selected'));

                scope.$on('$destroy', () => {
                    document.removeEventListener('contextmenu', onBackdropContextmenu, true);
                    deregister();
                });
            },
        };
    },
];
