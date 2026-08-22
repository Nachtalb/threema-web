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
 * Run an expression when a file is picked, with the file exposed as `file`.
 *
 * `ng-change` does not fire for file inputs, hence this.
 */
export default [
    function() {
        return {
            restrict: 'A',
            link($scope: ng.IScope, $element: ng.IAugmentedJQuery, attrs: ng.IAttributes) {
                const input = $element[0] as HTMLInputElement;
                input.addEventListener('change', () => {
                    const file = input.files === null ? null : input.files[0];
                    if (file !== null && file !== undefined) {
                        $scope.$apply(() => $scope.$eval(attrs.eeeFilePick, {file: file}));
                    }
                    // Allow picking the same file again
                    input.value = '';
                });
            },
        };
    },
];
