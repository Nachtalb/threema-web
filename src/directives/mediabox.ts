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

import {firefoxWorkaroundPdfDownload, jumpToMessage} from '../helpers';
import {MediaboxService} from '../services/mediabox';

export default [
    '$rootScope',
    '$document',
    'MediaboxService',
    function($rootScope: ng.IRootScopeService,
             $document: ng.IDocumentService,
             mediaboxService: MediaboxService) {
        return {
            restrict: 'E',
            scope: {},
            bindToController: {},
            controllerAs: 'ctrl',
            controller: [function() {
                // Data attributes
                this.imageDataUrl = null;
                this.caption = '';
                this.isVideo = false;
                this.loading = false;
                // Read live: the service updates it as bytes arrive
                this.progress = () => mediaboxService.progress;
                this.received = () => mediaboxService.received;
                // The box stays up while the media downloads, so it must not
                // hang off imageDataUrl, which is null until something arrives
                this.open = false;

                // Close and save
                this.objectUrl = null;
                this.releaseUrl = () => {
                    if (this.objectUrl !== null) {
                        URL.revokeObjectURL(this.objectUrl);
                        this.objectUrl = null;
                    }
                };
                this.close = ($event?: Event) => {
                    if ($event !== undefined) {
                        // Dragging a zoomed picture ends on the backdrop, which
                        // would otherwise be taken for a click on it.
                        if (this.zoom !== 1) {
                            return;
                        }
                        // If this was triggered by a click event, only close the box
                        // if the click was directly on the target element.
                        if ($event.target === $event.currentTarget) {
                            this.releaseUrl();
                            this.imageDataUrl = null;
                            this.open = false;
                            mediaboxService.dismiss();
                        }
                    } else {
                        this.releaseUrl();
                        this.imageDataUrl = null;
                        this.open = false;
                        mediaboxService.dismiss();
                    }
                };
                this.jumpToMessage = () => {
                    const id = mediaboxService.messageId;
                    this.close();
                    if (id !== null) {
                        jumpToMessage(id);
                    }
                };
                this.save = () => {
                    if (mediaboxService.data === null) {
                        return;
                    }
                    saveAs(
                        new Blob([mediaboxService.data], {
                            type: firefoxWorkaroundPdfDownload(mediaboxService.mimetype),
                        }),
                        mediaboxService.filename || 'image.jpg'
                    );
                };

                // Zoom and pan
                this.zoom = 1;
                this.panX = 0;
                this.panY = 0;
                this.panning = false;

                this.resetView = () => {
                    this.zoom = 1;
                    this.panX = 0;
                    this.panY = 0;
                };

                this.wheel = ($event: WheelEvent, inner: HTMLElement) => {
                    if (this.isVideo) {
                        return;
                    }
                    $event.preventDefault();
                    const previous = this.zoom;
                    const next = Math.min(8, Math.max(1, previous * (($event.deltaY < 0) ? 1.15 : 1 / 1.15)));
                    if (next === previous) {
                        return;
                    }
                    if (next === 1) {
                        this.resetView();
                        return;
                    }
                    // Keep the point under the cursor still while scaling
                    const image = inner.querySelector('img');
                    if (image !== null) {
                        const box = image.getBoundingClientRect();
                        const dx = $event.clientX - (box.left + box.width / 2);
                        const dy = $event.clientY - (box.top + box.height / 2);
                        const ratio = next / previous;
                        this.panX += dx * (1 - ratio);
                        this.panY += dy * (1 - ratio);
                    }
                    this.zoom = next;
                };

                this.panStart = ($event: MouseEvent) => {
                    if (this.zoom === 1 || this.isVideo) {
                        return;
                    }
                    $event.preventDefault();
                    this.panning = true;
                    this.panFrom = {x: $event.clientX - this.panX, y: $event.clientY - this.panY};
                };

                this.panMove = ($event: MouseEvent) => {
                    if (!this.panning) {
                        return;
                    }
                    this.panX = $event.clientX - this.panFrom.x;
                    this.panY = $event.clientY - this.panFrom.y;
                };

                this.panEnd = () => {
                    this.panning = false;
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
                    // $apply throws when a digest is already running, which is
                    // the case when this comes straight off a click. Losing
                    // that event would leave the box shut until the next one.
                    $rootScope.$evalAsync(() => {
                        if (!dataAvailable) {
                            this.close();
                            return;
                        }
                        this.releaseUrl();
                        this.open = true;
                        this.loading = mediaboxService.loading;
                        this.caption = mediaboxService.caption;
                        if (mediaboxService.data === null) {
                            // Still downloading: hold on the thumbnail
                            this.isVideo = false;
                            this.imageDataUrl = mediaboxService.previewUrl;
                            this.resetView();
                            return;
                        }
                        // The media is here, so nothing is pending any more
                        this.loading = false;
                        this.isVideo = mediaboxService.mimetype.startsWith('video/');
                        // A blob url hands the bytes to the browser as they
                        // are. Base64 would grow them by a third and block the
                        // main thread building the string.
                        this.objectUrl = URL.createObjectURL(new Blob(
                            [mediaboxService.data], {type: mediaboxService.mimetype}));
                        this.imageDataUrl = this.objectUrl;
                        // A new picture starts unzoomed
                        this.resetView();
                    });
                });
            }],
            link($scope: any, $element: ng.IAugmentedJQuery, attrs) {
                // AngularJS has no ng-wheel, and the listener must be passive:
                // false to be able to suppress the page scroll.
                $element[0].addEventListener('wheel', (e: WheelEvent) => {
                    const inner = (e.target as HTMLElement).closest('.inner');
                    if (inner === null || !$scope.ctrl.open) {
                        return;
                    }
                    $scope.$apply(() => $scope.ctrl.wheel(e, inner));
                }, {passive: false});

                // Escape closes, arrows page between pictures
                $document.on('keyup', (e: Event) => {
                    const ke = e as KeyboardEvent;
                    if (!$scope.ctrl.open) {
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
                <div class="box" ng-if="ctrl.open">
                    <div class="action save" ng-click="ctrl.save()" ng-if="!ctrl.loading" role="button" aria-label="Save" translate-attr="{'aria-label': 'common.SAVE', 'title': 'common.SAVE'}">
                        <svg viewBox="0 0 24 24"><path d="M12 3v13m0 0 5-5m-5 5-5-5M4 20h16"/></svg>
                    </div>
                    <div class="action jump" ng-click="ctrl.jumpToMessage()" role="button" aria-label="Jump to message" translate-attr="{'aria-label': 'messenger.JUMP_TO_MESSAGE', 'title': 'messenger.JUMP_TO_MESSAGE'}">
                        <svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <div class="action close" ng-click="ctrl.close()" role="button" aria-label="Close" translate-attr="{'aria-label': 'common.CLOSE', 'title': 'common.CLOSE'}">
                        <svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19"/></svg>
                    </div>
                    <div class="nav previous" ng-if="ctrl.hasNeighbour(false)" ng-click="ctrl.showNeighbour(false, $event)" aria-label="Previous">
                        <svg viewBox="0 0 24 24"><path d="M15 4L7 12l8 8"/></svg>
                    </div>
                    <div class="nav next" ng-if="ctrl.hasNeighbour(true)" ng-click="ctrl.showNeighbour(true, $event)" aria-label="Next">
                        <svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8"/></svg>
                    </div>
                    <div class="inner" ng-class="{'zoomed': ctrl.zoom !== 1, 'panning': ctrl.panning}"
                         ng-click="ctrl.close($event)"
                         ng-mousedown="ctrl.panStart($event)"
                         ng-mousemove="ctrl.panMove($event)"
                         ng-mouseup="ctrl.panEnd()"
                         ng-mouseleave="ctrl.panEnd()"
                         ng-dblclick="ctrl.resetView()">
                        <div class="stage">
                            <img ng-if="!ctrl.isVideo" ng-src="{{ ctrl.imageDataUrl | unsafeResUrl }}"
                                 ng-class="{'placeholder': ctrl.loading}"
                                 ng-style="{transform: 'translate(' + ctrl.panX + 'px, ' + ctrl.panY + 'px) scale(' + ctrl.zoom + ')'}">
                            <video ng-if="ctrl.isVideo" ng-src="{{ ctrl.imageDataUrl | unsafeResUrl }}"
                                   controls autoplay ng-click="$event.stopPropagation()"></video>
                            <div class="loading" ng-if="ctrl.loading">
                                <svg viewBox="0 0 40 40">
                                    <circle class="track" cx="20" cy="20" r="17"/>
                                    <circle class="bar" ng-class="{'indeterminate': ctrl.progress() === null}"
                                            cx="20" cy="20" r="17"
                                            ng-attr-stroke-dasharray="{{ ctrl.progress() === null ? '30 200' : (ctrl.progress() * 106.8) + ' 200' }}"/>
                                </svg>
                                <span class="percent" ng-if="ctrl.progress() !== null">{{ ctrl.progress() * 100 | number:0 }}%</span>
                                <span class="percent" ng-if="ctrl.progress() === null && ctrl.received() > 0">{{ ctrl.received() | fileSize }}</span>
                            </div>
                        </div>
                        <div class="caption" ng-if="ctrl.caption" title="{{ ctrl.caption | escapeHtml}}">
                            <span ng-bind-html="ctrl.caption | escapeHtml | markify | emojify"></span>
                        </div>
                    </div>
                </div>
            `,
        };
    },
];
