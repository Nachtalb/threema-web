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

import {saveAs} from 'file-saver';

import {bufferToUrl, firefoxWorkaroundPdfDownload} from '../helpers';
import {LogService} from '../services/log';
import {MediaboxService} from '../services/mediabox';

export default [
    '$rootScope',
    '$document',
    'LogService',
    'MediaboxService',
    function($rootScope: ng.IRootScopeService,
             $document: ng.IDocumentService,
             logService: LogService,
             mediaboxService: MediaboxService) {
        const log = logService.getLogger('Mediabox-C');
        return {
            restrict: 'E',
            scope: {},
            bindToController: {},
            controllerAs: 'ctrl',
            controller: [function() {
                // Data attributes
                this.imageDataUrl = null;
                this.caption = '';

                // Close and save
                this.close = ($event?: Event) => {
                    if ($event !== undefined) {
                        // If this was triggered by a click event, only close the box
                        // if the click was directly on the target element.
                        if ($event.target === $event.currentTarget) {
                            this.imageDataUrl = null;
                        }
                    } else {
                        this.imageDataUrl = null;
                    }
                };
                this.save = () => {
                    saveAs(
                        new Blob([mediaboxService.data], {
                            type: firefoxWorkaroundPdfDownload(mediaboxService.mimetype),
                        }),
                        mediaboxService.filename || 'image.jpg'
                    );
                };

                // Paging between the pictures of a conversation
                this.hasNeighbour = (forward: boolean) =>
                    mediaboxService.hasNeighbour !== null
                    && mediaboxService.hasNeighbour(forward);
                this.showNeighbour = (forward: boolean, $event?: Event) => {
                    if ($event !== undefined) {
                        // The backdrop closes the box on click
                        $event.stopPropagation();
                    }
                    if (mediaboxService.loadNeighbour !== null) {
                        mediaboxService.loadNeighbour(forward);
                    }
                };

                // Listen to Mediabox service events
                mediaboxService.evtMediaChanged.attach((dataAvailable: boolean) => {
                    $rootScope.$apply(() => {
                        if (dataAvailable) {
                            this.imageDataUrl = bufferToUrl(
                                mediaboxService.data, mediaboxService.mimetype, log);
                            this.caption = mediaboxService.caption || mediaboxService.filename;
                        } else {
                            this.close();
                        }
                    });
                });
            }],
            link($scope: any, $element: ng.IAugmentedJQuery, attrs) {
                // Escape closes, arrows page between pictures
                $document.on('keyup', (e: Event) => {
                    const ke = e as KeyboardEvent;
                    if ($scope.ctrl.imageDataUrl === null) {
                        return;
                    }
                    switch (ke.key) {
                        case 'Escape':
                            $scope.$apply($scope.ctrl.close);
                            break;
                        case 'ArrowLeft':
                            $scope.$apply(() => $scope.ctrl.showNeighbour(false));
                            break;
                        case 'ArrowRight':
                            $scope.$apply(() => $scope.ctrl.showNeighbour(true));
                            break;
                        default:
                            break;
                    }
                });
            },
            // tslint:disable:max-line-length
            template: `
                <div class="box" ng-if="ctrl.imageDataUrl !== null">
                    <md-icon class="save material-icons md-24" ng-click="ctrl.save()" aria-label="Save" translate-attr="{'aria-label': 'common.SAVE', 'title': 'common.SAVE'}">save</md-icon>
                    <md-icon class="close material-icons md-24" ng-click="ctrl.close()" aria-label="Close" translate-attr="{'aria-label': 'common.CLOSE', 'title': 'common.CLOSE'}">close</md-icon>
                    <div class="nav previous" ng-if="ctrl.hasNeighbour(false)" ng-click="ctrl.showNeighbour(false, $event)" aria-label="Previous">
                        <md-icon class="material-icons md-24">chevron_left</md-icon>
                    </div>
                    <div class="nav next" ng-if="ctrl.hasNeighbour(true)" ng-click="ctrl.showNeighbour(true, $event)" aria-label="Next">
                        <md-icon class="material-icons md-24">chevron_right</md-icon>
                    </div>
                    <div class="inner" ng-click="ctrl.close($event)">
                        <img ng-src="{{ ctrl.imageDataUrl }}">
                        <div class="caption" title="{{ ctrl.caption | escapeHtml}}">
                            <span ng-bind-html="ctrl.caption | escapeHtml | markify | emojify"></span>
                        </div>
                    </div>
                </div>
            `,
        };
    },
];
