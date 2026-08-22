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
 * Open a conversation's menu on right click.
 *
 * angular-material positions a menu relative to its trigger, so the (hidden)
 * trigger is moved under the pointer before it is clicked.
 */
export default [
    '$mdMenu',
    function($mdMenu: any) {
        return {
            restrict: 'A',
            link(scope: ng.IScope, element: ng.IAugmentedJQuery) {
                const row = element[0];

                const open = (event: MouseEvent): boolean => {
                    const menu = row.querySelector('.conversation-menu') as HTMLElement | null;
                    if (menu === null) {
                        return false;
                    }
                    const trigger = menu.querySelector('button') as HTMLElement | null;
                    if (trigger === null) {
                        return false;
                    }
                    const rect = row.getBoundingClientRect();
                    menu.style.left = `${event.clientX - rect.left}px`;
                    menu.style.top = `${event.clientY - rect.top}px`;
                    trigger.click();
                    return true;
                };

                row.addEventListener('contextmenu', (event: MouseEvent) => {
                    // Another row's backdrop handler may already have dealt
                    // with this event.
                    if (event.defaultPrevented) {
                        return;
                    }
                    if (open(event)) {
                        event.preventDefault();
                    }
                });

                // An open menu covers the list with a backdrop, so a right
                // click on another conversation never reaches it.
                const onBackdropContextmenu = (event: MouseEvent) => {
                    if (event.defaultPrevented) {
                        return;
                    }
                    const backdrop = document.querySelector('.md-menu-backdrop, md-backdrop');
                    if (backdrop === null || event.target !== backdrop) {
                        return;
                    }
                    const under = document
                        .elementsFromPoint(event.clientX, event.clientY)
                        .find((el) => el.classList.contains('conversation-wrapper'));
                    if (under !== row) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    $mdMenu.hide(null, {closeAll: true});
                    setTimeout(() => scope.$apply(() => open(event)), 0);
                };
                document.addEventListener('contextmenu', onBackdropContextmenu, true);

                scope.$on('$destroy', () => {
                    document.removeEventListener('contextmenu', onBackdropContextmenu, true);
                });
            },
        };
    },
];
