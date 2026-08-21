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

import {Logger} from 'ts-log';

import {copyShallow} from '../helpers';
import * as clipboard from '../helpers/clipboard';

import {BrowserService} from '../services/browser';
import {LogService} from '../services/log';
import {ThemeService} from '../services/theme';
import {WebClientService} from '../services/webclient';
import {DialogController} from './dialog';

export class TroubleshootingController extends DialogController {
    public static readonly $inject = [
        '$scope', '$mdDialog', '$mdToast', '$translate',
        'CONFIG', 'LogService', 'BrowserService', 'ThemeService', 'WebClientService',
    ];

    private readonly $mdToast: ng.material.IToastService;
    private readonly $translate: ng.translate.ITranslateService;
    private readonly config: threema.Config;
    private readonly logService: LogService;
    private readonly browserService: BrowserService;
    private readonly webClientService: WebClientService;
    private readonly log: Logger;
    public sanitize: boolean = true;

    constructor(
        $scope: ng.IScope,
        $mdDialog: ng.material.IDialogService,
        $mdToast: ng.material.IToastService,
        $translate: ng.translate.ITranslateService,
        config: threema.Config,
        logService: LogService,
        browserService: BrowserService,
        themeService: ThemeService,
        webClientService: WebClientService,
    ) {
        super($scope, $mdDialog, themeService);
        this.$mdToast = $mdToast;
        this.$translate = $translate;
        this.config = config;
        this.logService = logService;
        this.browserService = browserService;
        this.webClientService = webClientService;
        this.log = logService.getLogger('Troubleshooting-C');
    }

    /**
     * Return whether the web client is currently connected (or able to
     * reconnect on its own).
     */
    public get isConnected(): boolean {
        return this.webClientService.readyToSubmit;
    }

    /**
     * Return the URL for opening a new issue on GitHub.
     */
    public get issueUrl(): string {
        return `${this.config.GIT_REPO}/issues/new`;
    }

    /**
     * Copy the log into the clipboard.
     */
    public copyToClipboard(): void {
        // Get the log
        const log = this.getLog(this.sanitize);

        // Copy to clipboard
        let toastString = 'messenger.COPIED';
        try {
            clipboard.copyString(log, this.browserService.getBrowser().isSafari());
        } catch (error) {
            this.log.warn('Could not copy text to clipboard:', error);
            toastString = 'messenger.COPY_ERROR';
        }

        // Show toast
        this.$mdToast.show(this.$mdToast.simple()
            .textContent(this.$translate.instant(toastString))
            .position('bottom center'));
    }

    /**
     * Serialise the memory log and add some metadata.
     */
    private getLog(sanitize: boolean): string {
        const browser = this.browserService.getBrowser();

        // Sanitise usernames and credentials from ICE servers in config
        const config = copyShallow(this.config) as threema.Config;
        // tslint:disable-next-line: no-string-literal
        const userConfig = copyShallow(window['UserConfig']) as threema.UserConfig;
        if (sanitize) {
            userConfig.ICE_SERVERS = userConfig.ICE_SERVERS.map((server: RTCIceServer) => {
                server = copyShallow(server) as RTCIceServer;
                for (const key of ['username', 'credential', 'credentialType']) {
                    if (server[key] !== undefined) {
                        server[key] = `[${server[key].constructor.name}]`;
                    }
                }
                return server;
            });
        }

        // Create container for meta data and log records
        const container = {
            config: config,
            userConfig: userConfig,
            browser: browser.description(),
            log: this.logService.memory.getRecords(),
        };

        // Return serialised and sanitised
        const replacer = this.logService.memory.getReplacer(sanitize);
        return JSON.stringify(container, replacer, 2);
    }
}
