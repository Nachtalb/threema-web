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

import {
    StateParams as UiStateParams,
    StateProvider as UiStateProvider,
    StateService as UiStateService,
    Transition as UiTransition,
    TransitionService as UiTransitionService,
} from '@uirouter/angularjs';
import {Logger} from 'ts-log';

import {ContactControllerModel} from '../controller_model/contact';
import {DialogController} from '../controllers/dialog';
import {TroubleshootingController} from '../controllers/troubleshooting';
import {bufferToUrl, firstVideoFrame, glideScrollTo, hasValue, jumpToMessage, supportsPassive, u8aToHex} from '../helpers';
import {emojify} from '../helpers/emoji';
import {EmojiPicker} from '../helpers/emoji_picker';
import {EmojiSuggestions} from '../helpers/emoji_suggestions';
import {publicKeyGrid} from '../helpers/public_key';
import {BackgroundStoreService} from '../services/background_store';
import {ContactService} from '../services/contact';
import {ControllerService} from '../services/controller';
import {ControllerModelService} from '../services/controller_model';
import {TrustedKeyStoreService} from '../services/keystore';
import {LogService} from '../services/log';
import {MediaboxService} from '../services/mediabox';
import {MimeService} from '../services/mime';
import {NavigationStateService} from '../services/navigation_state';
import {NotificationService} from '../services/notification';
import {ReceiverService} from '../services/receiver';
import {SettingsService} from '../services/settings';
import {StateService} from '../services/state';
import {ThemeService} from '../services/theme';
import {TimeoutService} from '../services/timeout';
import {VersionService} from '../services/version';
import {WebClientService} from '../services/webclient';
import {controllerModelHasMembers, isContactReceiver} from '../typeguards';
import {Type} from '../types/helpers';

// Type aliases
import ControllerModelMode = threema.ControllerModelMode;

/**
 * Handle sending of files.
 */
class SendFileController extends DialogController {
    public caption: string;
    public sendAsFile: boolean = false;
    public title: string;
    public files: threema.FileMessageData[];
    private preview: threema.FileMessageData | null = null;
    public previewDataUrl: string | null = null;
    private readonly mimeService: MimeService;
    private readonly settingsService: SettingsService;
    private readonly $translate: ng.translate.ITranslateService;
    private readonly $timeout: ng.ITimeoutService;
    private readonly dialogScope: ng.IScope;
    private picker: EmojiPicker | null = null;
    private suggestions: EmojiSuggestions | null = null;

    public static $inject = [
        '$scope', '$mdDialog', '$translate', '$timeout', 'LogService', 'ThemeService', 'MimeService',
        'SettingsService', 'preview', 'title', 'files',
    ];
    constructor(
        $scope: ng.IScope,
        $mdDialog: ng.material.IDialogService,
        $translate: ng.translate.ITranslateService,
        $timeout: ng.ITimeoutService,
        logService: LogService,
        themeService: ThemeService,
        mimeService: MimeService,
        settingsService: SettingsService,
        preview: threema.FileMessageData,
        title: string,
        files: threema.FileMessageData[],
    ) {
        super($scope, $mdDialog, themeService);
        const log = logService.getLogger('SendFile-C');
        this.mimeService = mimeService;
        this.settingsService = settingsService;
        this.$translate = $translate;
        this.$timeout = $timeout;
        this.dialogScope = $scope;
        this.preview = preview;
        this.title = title;
        this.files = files;
        if (preview !== null) {
            if (preview.fileType.startsWith('video/')) {
                // A video has no preview of its own; use its first frame
                firstVideoFrame(preview.data, preview.fileType)
                    .then((dataUrl) => $scope.$applyAsync(() => this.previewDataUrl = dataUrl))
                    .catch((error) => log.debug('No video preview: ' + error));
            } else {
                this.previewDataUrl = bufferToUrl(this.preview.data, this.preview.fileType, log);
            }
        }
        // The caption input is only in the DOM once the dialog is, so the
        // shortcode suggestions are attached a tick later.
        $timeout(() => {
            const parts = this.captionElements();
            if (parts !== null) {
                this.suggestions = new EmojiSuggestions(
                    parts.input, settingsService,
                    (value: string) => $scope.$applyAsync(() => this.caption = value));
            }
        });

        $scope.$on('$destroy', () => {
            this.closeEmojiPicker();
            if (this.suggestions !== null) {
                this.suggestions.destroy();
                this.suggestions = null;
            }
        });
    }

    public iconUrl(file: threema.FileMessageData): string {
        return this.mimeService.getIconUrl(file.fileType);
    }

    /** The caption input and its picker, which sits below it. */
    private captionElements(): {input: HTMLInputElement, keyboard: Element, trigger: Element} | null {
        const dialog = document.querySelector('md-dialog.send-file-dialog');
        if (dialog === null) {
            return null;
        }
        const input = dialog.querySelector('.input-caption input') as HTMLInputElement;
        const keyboard = dialog.querySelector('.emoji-keyboard');
        const trigger = dialog.querySelector('.emoji-trigger');
        if (input === null || keyboard === null || trigger === null) {
            return null;
        }
        return {input: input, keyboard: keyboard, trigger: trigger};
    }

    public toggleEmojiPicker(): void {
        if (this.picker !== null) {
            this.closeEmojiPicker();
        } else {
            this.openEmojiPicker();
        }
    }

    private openEmojiPicker(): void {
        // The picker markup is pulled in by `ng-include`, so it may not be in
        // the dialog yet on the first click.
        this.$timeout(() => {
            const parts = this.captionElements();
            if (parts === null) {
                return;
            }
            const element = parts.keyboard.querySelector('div.twemoji-picker');
            if (element === null) {
                return;
            }

            parts.keyboard.classList.add('active');
            parts.keyboard.setAttribute('aria-expanded', 'true');
            parts.trigger.setAttribute('aria-pressed', 'true');
            parts.trigger.classList.add('is-active');

            this.picker = new EmojiPicker(element, this.settingsService, {
                insert: (emoji: string) => this.insertIntoCaption(emoji),
                close: () => this.dialogScope.$applyAsync(() => this.closeEmojiPicker()),
            }, this.$translate.instant('messenger.SEARCH'));
            this.picker.attach();
        });
    }

    private closeEmojiPicker(): void {
        const parts = this.captionElements();
        if (parts !== null) {
            parts.keyboard.classList.remove('active');
            parts.keyboard.setAttribute('aria-expanded', 'false');
            parts.trigger.setAttribute('aria-pressed', 'false');
            parts.trigger.classList.remove('is-active');
        }
        if (this.picker !== null) {
            this.picker.detach();
            this.picker = null;
        }
        if (parts !== null) {
            parts.input.focus();
        }
    }

    /** Write an emoji at the caret rather than appending it. */
    private insertIntoCaption(emoji: string): void {
        const parts = this.captionElements();
        if (parts === null) {
            return;
        }
        const input = parts.input;
        const text = input.value;
        const at = input.selectionStart ?? text.length;
        const to = input.selectionEnd ?? at;
        const caption = text.slice(0, at) + emoji + text.slice(to);
        this.dialogScope.$applyAsync(() => this.caption = caption);
        // The model update lands on the next digest, so the caret is placed
        // against the value written here rather than the one on screen now.
        input.value = caption;
        const caret = at + emoji.length;
        input.setSelectionRange(caret, caret);
    }

    public send(): void {
        this.hide({
            caption: this.caption,
            sendAsFile: this.sendAsFile,
            previewDataUrl: this.previewDataUrl,
        });
    }

    public keypress($event: KeyboardEvent): void {
        // Enter picks the highlighted shortcode suggestion rather than sending
        if ($event.key === 'Enter' && !this.suggesting()) {
            this.send();
        }
    }

    /** Whether the shortcode strip is showing and owns the enter key. */
    private suggesting(): boolean {
        return this.suggestions !== null && this.suggestions.isOpen();
    }

    public hasPreview(): boolean {
        return this.previewDataUrl !== null && this.previewDataUrl !== undefined;
    }
}

/**
 * Handle device unreachable
 */
export class DeviceUnreachableController extends DialogController {
    private readonly $rootScope: any;
    private readonly $window: ng.IWindowService;
    private readonly $translate: ng.translate.ITranslateService;
    private readonly stateService: StateService;
    private readonly webClientService: WebClientService;
    private readonly log: Logger;
    public retrying: boolean = false;
    public progress: number = 0;
    public highPriorityPushes: boolean;

    public static readonly $inject = [
        '$rootScope', '$window', '$mdDialog', '$translate',
        'StateService', 'ThemeService', 'WebClientService', 'LogService',
    ];
    constructor(
        $rootScope: any,
        $window: ng.IWindowService,
        $mdDialog: ng.material.IDialogService,
        $translate: ng.translate.ITranslateService,
        stateService: StateService,
        themeService: ThemeService,
        webClientService: WebClientService,
        logService: LogService,
    ) {
        super($rootScope, $mdDialog, themeService);
        this.$rootScope = $rootScope;
        this.$window = $window;
        this.$translate = $translate;
        this.stateService = stateService;
        this.webClientService = webClientService;
        this.log = logService.getLogger('DeviceUnreachableDialog-C');

        this.highPriorityPushes = !this.webClientService.hasAppleNonVoipPushToken();

        this.log.info(`Showing "device unreachable" dialog (canRetry=${this.canRetry})`);
    }

    /**
     * We can only retry as long as the signaling connection has not been
     * closed.
     *
     * TODO: This is a hack and should be removed as soon as the transport code
     *       has been rewritten.
     */
    public get canRetry(): boolean {
        switch (this.webClientService.salty.state) {
            case 'closing':
            case 'closed':
                return false;
            default:
                return true;
        }
    }

    /**
     * Retry wakeup of the device via a push session.
     */
    public async retry(): Promise<void> {
        this.log.debug('Retrying...');

        // Reset attempt counter
        this.stateService.attempt = 0;

        // Schedule sending a push
        const [expectedPeriodMaxMs, pushSessionPromise] = this.webClientService.sendPush();

        // Initialise progress circle
        this.retrying = true;
        this.progress = 0;
        const interval = setInterval(() => this.$rootScope.$apply(() => ++this.progress), expectedPeriodMaxMs / 100);

        // Wait for push to succeed/reject and reset the progress circle
        try {
            await pushSessionPromise;
        } finally {
            clearInterval(interval);
            this.$rootScope.$apply(() => this.retrying = false);
        }
    }

    /**
     * Reload the page.
     */
    public reload(): void {
        this.log.info('Reloading page');
        this.$window.location.reload();
    }

    public close(): void {
        this.log.info('Dialog dismissed by user');
        this.cancel();
    }
}

/**
 * Handle device unreachable
 */
export class PushRejectedDialogController extends DialogController {
    private readonly log: Logger;

    private readonly $window: ng.IWindowService;

    private readonly trustedKeyStore: TrustedKeyStoreService;

    public static readonly $inject = [
        '$scope', '$mdDialog', '$window', 'ThemeService', 'TrustedKeyStore', 'LogService',
    ];
    constructor(
        $scope: ng.IScope,
        $mdDialog: ng.material.IDialogService,
        $window: ng.IWindowService,
        themeService: ThemeService,
        trustedKeyStore: TrustedKeyStoreService,
        logService: LogService,
    ) {
        super($scope, $mdDialog, themeService);
        this.$window = $window;
        this.log = logService.getLogger('PushRejectedDialog-C');
        this.trustedKeyStore = trustedKeyStore;
    }

    /**
     * Remove the stored session.
     */
    public forget(): void {
        this.log.info('Forgetting stored session');
        this.trustedKeyStore.clearTrustedKey();
        this.cancel();
        this.$window.location.reload();
    }
}

/**
 * Handle settings
 */
class SettingsController extends DialogController {
    public $window: ng.IWindowService;
    public settingsService: SettingsService;
    private notificationService: NotificationService;
    private navigation: NavigationController;

    private desktopNotifications: boolean;
    private notificationApiAvailable: boolean;
    private notificationPermission: boolean;
    private notificationPreview: boolean;
    private notificationSound: boolean;
    private notifyReactions: boolean;
    private submitWithCtrlEnter: boolean;
    private backgroundBlur: boolean;
    private autoLoadGifs: boolean;
    private cacheMedia: boolean;
    private colourScheme: threema.ColourScheme;
    private hasCustomBackground: boolean = false;
    private backgroundStoreService: BackgroundStoreService;
    private readonly version: string;
    private readonly settingsScope: ng.IScope;
    private readonly log: Logger;

    public static $inject = [
        '$scope', '$mdDialog', '$window', 'SettingsService', 'ThemeService', 'NotificationService',
        'BackgroundStoreService', 'LogService', 'CONFIG',
    ];
    constructor(
        $scope: ng.IScope,
        $mdDialog: ng.material.IDialogService,
        $window: ng.IWindowService,
        settingsService: SettingsService,
        themeService: ThemeService,
        notificationService: NotificationService,
        backgroundStoreService: BackgroundStoreService,
        logService: LogService,
        config: threema.Config,
    ) {
        super($scope, $mdDialog, themeService);
        this.$window = $window;
        this.version = config.VERSION;
        this.settingsService = settingsService;
        this.notificationService = notificationService;
        // The settings live inside the navigation panel, so its controller is
        // the parent scope's.
        this.navigation = ($scope as any).ctrl;
        this.backgroundStoreService = backgroundStoreService;
        this.settingsScope = $scope;
        this.log = logService.getLogger('Settings-C');
        this.desktopNotifications = notificationService.getWantsNotifications();
        this.notificationApiAvailable = notificationService.isNotificationApiAvailable();
        this.notificationPermission = notificationService.getNotificationPermission();
        this.notificationPreview = notificationService.getWantsPreview();
        this.notificationSound = notificationService.getWantsSound();
        this.notifyReactions = settingsService.notifications.getNotifyReactions();
        this.submitWithCtrlEnter =
            settingsService.composeArea.getSubmitKey() === threema.ComposeAreaSubmitKey.CtrlEnter;
        this.backgroundBlur = settingsService.background.getBlur();
        this.autoLoadGifs = settingsService.media.getAutoLoadGifs();
        this.cacheMedia = settingsService.media.getCacheMedia();
        this.colourScheme = settingsService.appearance.getColourScheme();
        backgroundStoreService.get().then((blob) => {
            // A promise callback is outside Angular's digest
            this.settingsScope.$evalAsync(() => {
                this.hasCustomBackground = blob !== null;
            });
        });
    }

    public setWantsNotifications(desktopNotifications: boolean) {
        this.notificationService.setWantsNotifications(desktopNotifications);
    }

    public setWantsPreview(notificationPreview: boolean) {
        this.notificationService.setWantsPreview(notificationPreview);
    }

    public setWantsSound(notificationSound: boolean) {
        this.notificationService.setWantsSound(notificationSound);
    }

    public setNotifyReactions(enabled: boolean) {
        this.settingsService.notifications.setNotifyReactions(enabled);
    }

    public setSubmitWithCtrlEnter(submitWithCtrlEnter: boolean) {
        this.settingsService.composeArea.setSubmitKey(submitWithCtrlEnter
            ? threema.ComposeAreaSubmitKey.CtrlEnter
            : threema.ComposeAreaSubmitKey.Enter);
    }

    public setBackgroundBlur(blur: boolean) {
        this.settingsService.background.setBlur(blur);
    }

    public setAutoLoadGifs(enabled: boolean) {
        this.settingsService.media.setAutoLoadGifs(enabled);
    }

    public setCacheMedia(enabled: boolean) {
        this.settingsService.media.setCacheMedia(enabled);
    }

    public setColourScheme(scheme: threema.ColourScheme) {
        this.colourScheme = scheme;
        this.settingsService.appearance.setColourScheme(scheme);
    }

    /**
     * Use a picture of the user's own as the page background.
     */
    public setBackground(file: File): void {
        this.backgroundStoreService.set(file)
            .then(() => this.settingsScope.$evalAsync(() => {
                this.hasCustomBackground = true;
                this.showBackground(file);
            }))
            .catch((error) => this.log.error('Could not store the background: ' + error));
    }

    /**
     * Go back to the random pictures that ship with the app.
     */
    public clearBackground(): void {
        this.backgroundStoreService.clear()
            .then(() => {
                this.hasCustomBackground = false;
                // Reload so one of the defaults is picked again
                this.$window.location.reload();
            })
            .catch((error) => this.log.error('Could not clear the background: ' + error));
    }

    private showBackground(blob: Blob): void {
        const image = document.getElementById('background-image') as HTMLImageElement | null;
        if (image === null) {
            return;
        }
        if (image.dataset.customUrl !== undefined) {
            URL.revokeObjectURL(image.dataset.customUrl);
        }
        const url = URL.createObjectURL(blob);
        image.dataset.customUrl = url;
        image.src = url;
    }

    public isPersistent(): boolean {
        return this.navigation.isPersistent();
    }

    /**
     * Which destructive row is asking for confirmation, if any. Tapping the row
     * again puts the question away.
     */
    public confirming: 'close' | 'delete' | null = null;

    public troubleshooting(): void {
        this.navigation.openSettingsView('troubleshooting');
    }

    public about(): void {
        this.navigation.openSettingsView('about');
    }

    public askCloseSession(): void {
        this.confirming = this.confirming === 'close' ? null : 'close';
    }

    public askDeleteSession(): void {
        this.confirming = this.confirming === 'delete' ? null : 'delete';
    }

    public closeSession(): void {
        this.confirming = null;
        this.navigation.closeSession();
    }

    public deleteSession(): void {
        this.confirming = null;
        this.navigation.deleteSession();
    }
}

interface ConversationStateParams extends UiStateParams {
    type: threema.ReceiverType;
    id: string;
    initParams: null | {text: string | null};
}

class ConversationController {
    public name = 'navigation';

    // Angular services
    private $stateParams;
    private $state: UiStateService;
    private $scope: ng.IScope;
    private $rootScope: ng.IRootScopeService;
    private $filter: ng.IFilterService;
    private $translate: ng.translate.ITranslateService;

    // Own services
    private webClientService: WebClientService;
    private receiverService: ReceiverService;
    private stateService: StateService;
    private mimeService: MimeService;
    private navigationStateService: NavigationStateService;
    // Whether the sidebar was already open when this conversation was opened
    public wasDetailOpen: boolean;
    // Whether the sidebar is in the DOM. It outlives `isDetailOpen()` by the
    // length of the closing animation, or the panel would vanish before it has
    // finished sliding out. Matches the transition in `_floating.scss`.
    private static readonly DETAIL_ANIMATION_MS = 250;
    public detailVisible: boolean = false;
    private detailHideTimer: number | null = null;
    private timeoutService: TimeoutService;
    // Set while the jump-to-bottom animation runs
    private glidingDown: boolean = false;

    // The day of the message at the top of the view, shown while scrolling
    public floatingDay: string = '';
    public floatingDayVisible: boolean = false;
    private floatingDayTimer: number | null = null;
    private static readonly FLOATING_DAY_TOP = 32;
    private static readonly FLOATING_DAY_LINGER = 1200;

    // Third party services
    private $mdDialog: ng.material.IDialogService;
    private $mdToast: ng.material.IToastService;

    // Logging
    private readonly log: Logger;

    // Controller model
    private controllerModel: threema.ControllerModel<threema.Receiver>;

    // DOM Elements
    private domChatElement: HTMLElement;

    // Scrolling
    public showScrollJump: boolean = false;

    // The conversation receiver
    public receiver: threema.Receiver;
    public _conversation: threema.Conversation;  // Access through getter
    public type: threema.ReceiverType;

    // The conversation messages
    private messages: threema.Message[];

    // This will be set to true as soon as the initial messages have been loaded
    private initialized = false;

    // Mentions
    public allMentions: threema.Mention[] = [];
    public currentMentions: threema.Mention[] = [];
    public currentMentionFilterWord = null;
    public selectedMention: number = null;

    public message: string = '';
    public lastReadMsg: threema.Message | null = null;
    public msgReadReportPending = false;
    private hasMore = true;
    private latestRefMsgId: string | null = null;
    // The message at the top of the view when older ones are requested, and
    // its offset from the top, so it can be pinned back afterwards.
    private anchorMessage: HTMLElement | null = null;
    private anchorOffset = 0;
    private allText: string;
    public initialData: threema.InitialConversationData = {
        draft: '',
        initialText: '',
    };
    private locked = false;
    public maxTextLength: number;
    public isTyping = (): boolean => false;

    private uploading = {
        enabled: false,
        value1: 0,
        value2: 0,
    };

    public static $inject = [
        '$stateParams', '$scope', '$rootScope',
        '$mdDialog', '$mdToast', '$translate', '$filter',
        '$state', '$transitions',
        'LogService', 'WebClientService', 'StateService', 'ReceiverService', 'MimeService',
        'VersionService', 'ControllerModelService', 'TimeoutService', 'NavigationStateService',
    ];
    constructor($stateParams: ConversationStateParams,
                $scope: ng.IScope,
                $rootScope: ng.IRootScopeService,
                $mdDialog: ng.material.IDialogService,
                $mdToast: ng.material.IToastService,
                $translate: ng.translate.ITranslateService,
                $filter: ng.IFilterService,
                $state: UiStateService,
                $transitions: UiTransitionService,
                logService: LogService,
                webClientService: WebClientService,
                stateService: StateService,
                receiverService: ReceiverService,
                mimeService: MimeService,
                versionService: VersionService,
                controllerModelService: ControllerModelService,
                timeoutService: TimeoutService,
                navigationStateService: NavigationStateService) {
        this.$stateParams = $stateParams;
        this.navigationStateService = navigationStateService;
        // The whole conversation is rebuilt when switching chats. If the
        // sidebar was already open, it should appear open rather than
        // animating from nothing again. The flag is cleared after the first
        // paint so closing it still animates.
        this.wasDetailOpen = navigationStateService.isDetailOpen();
        if (this.wasDetailOpen) {
            timeoutService.register(() => {
                $scope.$apply(() => this.wasDetailOpen = false);
            }, 0, true, 'clearDetailInstant');
        }

        this.webClientService = webClientService;
        this.receiverService = receiverService;
        this.stateService = stateService;
        this.mimeService = mimeService;
        this.timeoutService = timeoutService;

        this.log = logService.getLogger('Conversation-C');

        this.$state = $state;
        this.$scope = $scope;
        this.$filter = $filter;

        // Keep the panel in the DOM until it has finished sliding out. Set up
        // after `$state` is assigned, since `isDetailOpen` reads it.
        this.detailVisible = this.isDetailOpen();
        $scope.$watch(() => this.isDetailOpen(), (open: boolean) => {
            if (this.detailHideTimer !== null) {
                clearTimeout(this.detailHideTimer);
                this.detailHideTimer = null;
            }
            if (open) {
                this.detailVisible = true;
            } else {
                this.detailHideTimer = window.setTimeout(() => {
                    this.detailHideTimer = null;
                    $scope.$apply(() => this.detailVisible = false);
                }, ConversationController.DETAIL_ANIMATION_MS);
            }
        });
        this.$rootScope = $rootScope;

        this.$mdDialog = $mdDialog;
        this.$mdToast = $mdToast;
        this.$translate = $translate;

        // Close any showing dialogs
        this.$mdDialog.cancel();

        // Keyboard shortcuts. Escape replaces the back button: close the
        // profile sidebar if it is open, otherwise leave the conversation.
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) {
                return;
            }
            const target = event.target as HTMLElement | null;
            const typing = target !== null && (target.isContentEditable
                || target.tagName === 'INPUT'
                || target.tagName === 'TEXTAREA');

            // Quote the message before or after the one quoted now. Ctrl is
            // used so the arrows still move the caret while writing.
            if (event.ctrlKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                this.$scope.$apply(() => this.quoteNeighbour(event.key === 'ArrowUp'));
                return;
            }

            if (event.key === 'Escape') {
                if (typing) {
                    // Drop the quote rather than leaving the conversation
                    const quoted = this.webClientService.getQuote(this.receiver);
                    if (quoted !== undefined) {
                        event.preventDefault();
                        this.$scope.$apply(() =>
                            this.webClientService.setQuote(this.receiver, null));
                    }
                    return;
                }
                this.$scope.$apply(() => this.onEscape());
            }
        };
        document.addEventListener('keydown', onKeyDown);
        $scope.$on('$destroy', () => {
            document.removeEventListener('keydown', onKeyDown);
            if (this.floatingDayTimer !== null) {
                clearTimeout(this.floatingDayTimer);
            }
            if (this.detailHideTimer !== null) {
                clearTimeout(this.detailHideTimer);
            }
        });

        this.maxTextLength = this.webClientService.getMaxTextLength();
        this.allText = this.$translate.instant('messenger.ALL');

        // On every navigation event, close all dialogs using ui-router transition hooks.
        $transitions.onStart({}, function(trans: UiTransition) {
            const $mdDialogInner: ng.material.IDialogService = trans.injector().get('$mdDialog');
            $mdDialogInner.cancel();
        });

        // Check for version updates
        versionService.checkForUpdate();

        // Redirect to welcome if necessary
        if (stateService.state === 'error') {
            this.log.debug('WebClient not yet running, redirecting to welcome screen');
            $state.go('welcome');
            return;
        }

        if (!this.locked) {
            // Get DOM references
            this.domChatElement = document.querySelector('#conversation-chat') as HTMLElement;

            // Add custom event handlers
            this.domChatElement.addEventListener('scroll', () => {
                this.updateFloatingDay();
                $rootScope.$apply(() => {
                    this.updateScrollJump();
                });
            }, supportsPassive() ? {passive: true} : false);
        }

        // Set receiver, conversation and type
        try {
            this.receiver = webClientService.receivers.getData({type: $stateParams.type, id: $stateParams.id});
            this.type = $stateParams.type;

            // The receiver list may not have arrived yet, in which case there
            // is nothing to show until it does.
            if (!hasValue(this.receiver)) {
                this.log.debug('Receiver not known yet, waiting for the list');
                return;
            }
            this._conversation = this.webClientService.conversations.find(this.receiver);

            if (this.receiver.type === undefined) {
                this.receiver.type = this.type;
            }

            // Initialize controller model
            const mode = ControllerModelMode.CHAT;
            switch (this.receiver.type) {
                case 'me':
                    this.controllerModel = controllerModelService.me(
                        this.receiver as threema.MeReceiver, mode);
                    break;
                case 'contact':
                    this.controllerModel = controllerModelService.contact(
                        this.receiver as threema.ContactReceiver, mode);
                    break;
                case 'group':
                    this.controllerModel = controllerModelService.group(
                        this.receiver as threema.GroupReceiver, mode);
                    break;
                case 'distributionList':
                    this.controllerModel = controllerModelService.distributionList(
                        this.receiver as threema.DistributionListReceiver, mode);
                    break;
                default:
                    this.log.error('Cannot initialize controller model:',
                        'Invalid receiver type "' + this.receiver.type + '"');
                    $state.go('messenger.home');
                    return;
            }

            // Check if this receiver may be chatted with
            if (this.controllerModel.canChat() === false) {
                this.log.warn('Cannot chat with this receiver, redirecting to home');
                $state.go('messenger.home');
                return;
            }

            // Initial set locked state
            this.locked = this.receiver.locked;

            this.receiverService.setActive(this.receiver);

            if (!this.receiver.locked) {

                // Subscribe to messages
                this.messages = this.webClientService.messages.register(
                    this.receiver,
                    this.$scope,
                    (e, allMessages: threema.Message[], hasMore: boolean) => {
                        // This function is called every time there are new or removed messages.

                        // Update data
                        this.messages = allMessages;
                        const wasInitialized = this.initialized;
                        this.initialized = true;
                        this.hasMore = hasMore;

                        // Update "first unread" divider
                        if (!wasInitialized) {
                            this.webClientService.messages.updateFirstUnreadMessage(this.receiver);
                        }

                        // Autoscroll
                        //
                        // Older messages are prepended above the viewport, so
                        // scroll anchoring does not apply — the browser only
                        // anchors to elements inside it. Instead the message
                        // that was at the top of the view is pinned back to
                        // where it was. Media in the prepended messages can
                        // load late and change the height above it, so the
                        // correction is repeated until the list settles.
                        if (this.latestRefMsgId !== null) {
                            const anchor = this.anchorMessage;
                            const anchorOffset = this.anchorOffset;
                            this.latestRefMsgId = null;
                            if (anchor !== null) {
                                // $$postDigest runs after the new messages are
                                // rendered but before the browser paints, so
                                // the correction is never visible as a jump.
                                (this.$scope as any).$$postDigest(
                                    () => this.pinAnchor(anchor, anchorOffset));
                            }
                        }
                    },
                );

                // Notify app about conversation opening (if a conversation already exists)
                if (this.conversation !== null) {
                    this.webClientService.sendActiveConversation(this.conversation);
                }

                // Update "first unread" divider
                this.webClientService.messages.updateFirstUnreadMessage(this.receiver);

                // Enable mentions only in group chats
                if (this.type === 'group' && controllerModelHasMembers(this.controllerModel)) {
                    this.allMentions.push({
                        identity: null,
                        query: this.$translate.instant('messenger.ALL').toLowerCase(),
                        isAll: true,
                    });
                    this.controllerModel.getMembers().forEach((identity: string) => {
                        const contactReceiver = this.webClientService.contacts.get(identity);
                        if (contactReceiver) {
                            this.allMentions.push({
                                identity: identity,
                                query: (contactReceiver.displayName + ' ' + identity).toLowerCase(),
                                isAll: false,
                            });
                        }
                    });
                }

                // Set initial data
                this.initialData = {
                    draft: webClientService.getDraft(this.receiver),
                    initialText: $stateParams.initParams ? $stateParams.initParams.text : '',
                };

                // Set isTyping function for contacts
                if (isContactReceiver(this.receiver)) {
                    this.isTyping = () => this.webClientService.isTyping(this.receiver as threema.ContactReceiver);
                }

                // Due to a bug in Safari, sometimes the in-view element does not trigger when initially loading a chat.
                // As a workaround, manually trigger the initial message loading.
                if (this.webClientService.messages.getList(this.receiver).length === 0) {
                    this.requestMessages();
                }
            }
        } catch (error) {
            this.log.error('Could not set receiver and type:', error);
            $state.go('messenger.home');
        }

        // reload controller if locked state was changed
        $scope.$watch(() => {
            return this.receiver.locked;
        }, () => {
            if (this.locked !== this.receiver.locked) {
                $state.reload().catch((error) => {
                    this.log.error('Unable to reload state:', error);
                });
            }
        });
    }

    public get conversation(): threema.Conversation {
        if (!hasValue(this._conversation)) {
            this._conversation = this.webClientService.conversations.find(this.receiver);
        }
        return this._conversation;
    }

    public isEnabled(): boolean {
        return this.type !== 'group'
            || !(this.receiver as threema.GroupReceiver).disabled;
    }

    public isQuoting(): boolean {
        return this.getQuote() !== undefined;
    }

    public getQuote(): threema.Quote {
        return this.webClientService.getQuote(this.receiver);
    }

    public cancelQuoting(): void {
        // Clear current quote
        this.webClientService.setQuote(this.receiver, null);
    }

    public showError(errorMessage?: string, hideDelayMs = 3000) {
        if (errorMessage === undefined || errorMessage.length === 0) {
            errorMessage = this.$translate.instant('error.ERROR_OCCURRED');
        }
        this.$mdToast.show(
            this.$mdToast.simple()
                .textContent(errorMessage)
                .position('bottom center')
                .hideDelay(hideDelayMs));
    }

    public showMessage(msgTranslation: string, hideDelayMs = 3000) {
        this.$mdToast.show(
            this.$mdToast.simple()
                .textContent(this.$translate.instant(msgTranslation))
                .position('bottom center')
                .hideDelay(hideDelayMs));
    }

    /**
     * Submit function for input field. Can contain text or file data.
     * Return whether sending was successful.
     */
    public submit = (type: threema.MessageContentType, contents: threema.MessageData[]): Promise<void> => {
        // Validate whether a connection is available
        return new Promise((resolve, reject) => {
            if (!this.webClientService.readyToSubmit) {
                // Invalid connection, show toast and abort
                this.showError(this.$translate.instant('error.NO_CONNECTION'));
                return reject();
            }
            let success = true;
            const nextCallback = (index: number) => {
                if (index === contents.length - 1) {
                    if (success) {
                        resolve();
                    } else {
                        reject('Message sending unsuccessful');
                    }
                }
            };

            switch (type) {
                case 'file':
                    const fileCount = contents.length;

                    // The caption input field is only shown for a single file,
                    // since it is otherwise not obvious what happens.
                    const showCaption = fileCount === 1;

                    // Determine file type
                    let showSendAsFileCheckbox = false;
                    for (const msg of contents as threema.FileMessageData[]) {
                        if (!msg.fileType) {
                            msg.fileType = 'application/octet-stream';
                        }

                        // The "send as file" checkbox is shown if one of the files is a media file.
                        const isImage = this.mimeService.isImage(msg.fileType);
                        const isAudio = this.mimeService.isAudio(msg.fileType, this.webClientService.clientInfo.os);
                        const isVideo = this.mimeService.isVideo(msg.fileType);
                        if (isImage || isAudio || isVideo) {
                            showSendAsFileCheckbox = true;
                        }
                    }

                    // Prepare preview
                    let preview: threema.FileMessageData | null = null;
                    if (fileCount === 1) {
                        const msg = contents[0] as threema.FileMessageData;
                        if (this.mimeService.isImage(msg.fileType)) {
                            preview = msg;
                        }
                    }

                    // Eager translations
                    let title;
                    // Escape HTML before emojifying to prevent HTML injection
                    const displayName = (this.$filter('emptyToPlaceholder') as any)(this.receiver.displayName, '-');
                    const escapedDisplayName = (this.$filter('escapeHtml') as any)(displayName);
                    const senderName = emojify(escapedDisplayName);
                    if (fileCount === 1) {
                        title = this.$translate.instant('messenger.CONFIRM_FILE_SEND', {senderName: senderName});
                    } else {
                        title = this.$translate.instant('messenger.CONFIRM_FILE_SEND_MULTI', {
                            fileCount: fileCount,
                            senderName: senderName,
                        });
                    }
                    const placeholder = this.$translate.instant('messenger.CONFIRM_FILE_CAPTION');
                    const confirmSendAsFile = this.$translate.instant('messenger.CONFIRM_SEND_AS_FILE');

                    // Show confirmation dialog
                    this.$mdDialog.show({
                        clickOutsideToClose: false,
                        locals: {
                            preview: preview,
                            title: title,
                            files: contents as threema.FileMessageData[],
                        },
                        controller: 'SendFileController',
                        controllerAs: 'ctrl',
                        // tslint:disable:max-line-length
                        template: `
                            <md-dialog class="send-file-dialog" md-theme="{{ ctrl.theme }}">
                                <md-dialog-content class="md-dialog-content">
                                    <h2 class="md-title" ng-bind-html="ctrl.title"></h2>
                                    <img class="preview" ng-if="ctrl.hasPreview()" ng-src="{{ ctrl.previewDataUrl | unsafeResUrl }}">
                                    <div class="file-row" ng-repeat="file in ctrl.files">
                                        <div class="file-icon">
                                            <img ng-src="{{ ctrl.iconUrl(file) }}" alt="">
                                        </div>
                                        <div class="file-details">
                                            <div class="file-name">{{ file.name }}</div>
                                            <div class="file-size">{{ file.size | fileSize }}</div>
                                        </div>
                                    </div>
                                    <md-input-container md-no-float class="input-caption md-prompt-input-container" ng-show="${showCaption}">
                                        <input maxlength="1000" md-autofocus ng-keypress="ctrl.keypress($event)" ng-model="ctrl.caption" placeholder="${placeholder}" aria-label="${placeholder}">
                                        <i class="md-primary emoji-trigger trigger is-enabled material-icons" role="button" aria-label="emoji" aria-pressed="false" tabindex="0" ng-click="ctrl.toggleEmojiPicker()">tag_faces</i>
                                    </md-input-container>
                                    <div class="emoji-keyboard" aria-expanded="false" ng-show="${showCaption}">
                                        <ng-include src="'partials/emoji-picker.html'" include-replace></ng-include>
                                    </div>
                                    <md-input-container md-no-float class="input-send-as-file md-prompt-input-container" ng-show="${showSendAsFileCheckbox}">
                                        <md-checkbox ng-model="ctrl.sendAsFile" aria-label="${confirmSendAsFile}">
                                            ${confirmSendAsFile}
                                        </md-checkbox>
                                    </md-input-container>
                                </md-dialog-content>
                                <md-dialog-actions>
                                    <md-button ng-click="ctrl.cancel()">
                                        <span translate>common.CANCEL</span>
                                    </md-button>
                                    <md-button class="md-accent" ng-click="ctrl.send()">
                                        <span translate>common.SEND</span>
                                    </md-button>
                                </md-dialog-actions>
                            </md-dialog>
                        `,
                        // tslint:enable:max-line-length
                    }).then((data) => {
                        // TODO: This should probably be moved into the
                        //       WebClientService as a specific method for the
                        //       type.
                        const caption = data.caption;
                        const sendAsFile = data.sendAsFile;
                        const options = { previewDataUrl: data.previewDataUrl || undefined };
                        contents.forEach((msg: threema.FileMessageData, index: number) => {
                            if (caption !== undefined && caption.length > 0) {
                                msg.caption = caption;
                            }
                            msg.sendAsFile = sendAsFile;

                            this.webClientService.sendMessage(this.$stateParams, type, msg, options)
                                .then(() => {
                                    nextCallback(index);
                                })
                                .catch((error) => {
                                    this.log.error(error);
                                    // TODO: Should probably be an alert instead of a toast
                                    this.showError(error);
                                    success = false;
                                    nextCallback(index);
                                });
                        });
                    }, angular.noop);
                    break;
                case 'text':
                    // do not show confirmation, send directly
                    contents.forEach((msg: threema.MessageData, index: number) => {
                        // Move quote from receiver to message
                        const quote = this.webClientService.getQuote(this.receiver);
                        if (hasValue(quote)) {
                            msg.quote = quote;
                        }
                        this.webClientService.setQuote(this.receiver, null);

                        // Send message
                        // TODO: This should probably be moved into the
                        //       WebClientService as a specific method for the
                        //       type.
                        this.webClientService.sendMessage(this.$stateParams, type, msg)
                            .then(() => {
                                nextCallback(index);
                            })
                            .catch((error) => {
                                this.log.error(error);
                                // TODO: Should probably be an alert instead of a toast
                                this.showError(error);
                                success = false;
                                nextCallback(index);
                            });
                    });
                    return;
                default:
                    this.log.warn('Invalid message type:', type);
                    reject();
            }
        });
    }

    /**
     * Something was typed.
     *
     * In contrast to startTyping, this method is is always called, not just if
     * the text field is non-empty.
     */
    public onTyping = (text: string) => {
        // Update draft
        this.webClientService.setDraft(this.receiver, text);
    }

    public getSelectedMention = (): threema.Mention => {
        if (this.selectedMention === null
            || this.selectedMention < 0
            || this.selectedMention > this.currentMentions.length - 1) {
            return null;
        }

        return this.currentMentions[this.selectedMention];
    }

    public showMentionSelector = (): boolean => {
        return this.type === 'group'
            && this.currentMentionFilterWord != null
            && this.currentMentions.length > 0;
    }

    /**
     * Handle mention selector navigation
     */
    public onComposeKeyDown = (ev: KeyboardEvent): boolean => {
        /* Make mentions readonly for now
        if (this.showMentionSelector() && !ev.shiftKey) {
            let move = ev.key === 'ArrowDown' ? 1 : (ev.key === 'ArrowUp' ? - 1 : 0);
            if (move !== 0) {
                // Move cursors position in mention selector
                if (this.selectedMention !== null) {
                    this.selectedMention += move;
                    // Fix positions
                    if (this.selectedMention > this.currentMentions.length - 1) {
                        this.selectedMention = 0;
                    } else if (this.selectedMention < 0) {
                        this.selectedMention = this.currentMentions.length - 1;
                    }
                } else {
                    this.selectedMention = 0;
                }
                return false;
            }

            if (ev.key === 'Enter') {
                // Enter, select current mention
                const selectedMentionObject = this.getSelectedMention();
                if (selectedMentionObject === null) {
                    // If no (or a invalid) mention is selected, select the first mention
                    this.selectedMention = 0;
                } else {
                    this.onMentionSelected(selectedMentionObject.identity);
                }
                return false;
            }
        }
        */
        return true;
    }

    public onMentionSelected(identity: string = null): void {
        this.$rootScope.$broadcast('onMentionSelected', {
            query: '@' + this.currentMentionFilterWord,
            mention: '@[' + (identity === null ? '@@@@@@@@' : identity.toUpperCase()) + ']',
        });
    }

    public onUploading = (inProgress: boolean, percentCurrent: number = null, percentFull: number = null)  => {
        this.uploading.enabled = inProgress;
        this.uploading.value1 = Number(percentCurrent);
        this.uploading.value2 = Number(percentCurrent);
    }

    /**
     * We started typing.
     */
    public startTyping = () => {
        // Notify app
        if (isContactReceiver(this.receiver)) {
            this.webClientService.sendMeIsTyping(this.receiver, true);
        }
    }

    /**
     * We stopped typing.
     */
    public stopTyping = () => {
        // Notify app
        if (isContactReceiver(this.receiver)) {
            this.webClientService.sendMeIsTyping(this.receiver, false);
        }
    }

    /**
     * User scrolled to the top of the chat.
     */
    public topOfChat(): void {
        this.requestMessages();
    }

    public requestMessages(): void {
        const refMsgId = this.webClientService.requestMessages(this.$stateParams);

        // TODO: Couldn't this cause a race condition when called twice asynchronously?
        //       Might be related to #277.
        if (hasValue(refMsgId)) {
            // New messages are requested, scroll to refMsgId
            this.latestRefMsgId = refMsgId;
            // Remember the message at the top of the view and where it sits.
            // Pinning that element back afterwards is immune to the scroll
            // moving on between request and render, and to media above it
            // loading late and changing the height.
            this.anchorMessage = null;
            if (this.domChatElement !== undefined && this.domChatElement !== null) {
                const viewTop = this.domChatElement.getBoundingClientRect().top;
                const messages = this.domChatElement.querySelectorAll('.message');
                for (const message of Array.from(messages) as HTMLElement[]) {
                    if (message.getBoundingClientRect().bottom > viewTop) {
                        this.anchorMessage = message;
                        this.anchorOffset = message.getBoundingClientRect().top - viewTop;
                        break;
                    }
                }
            }
        } else {
            this.latestRefMsgId = null;
        }
    }

    /**
     * Put the anchor message back where it was before older messages were
     * prepended above it.
     *
     * Media in those messages decodes asynchronously, so the height above the
     * anchor keeps changing for a while. A ResizeObserver on the list corrects
     * the position each time until it stops moving.
     */
    private pinAnchor(anchor: HTMLElement, offset: number): void {
        const chat = this.domChatElement;
        const restore = () => {
            const delta = (anchor.getBoundingClientRect().top - chat.getBoundingClientRect().top)
                - offset;
            if (Math.abs(delta) > 0.5) {
                chat.scrollTop += delta;
            }
        };
        restore();

        const observer = new ResizeObserver(restore);
        observer.observe(chat.querySelector('.chat') as HTMLElement);
        this.timeoutService.register(
            () => observer.disconnect(), 1500, true, 'stopPinningAnchor');
    }

    /**
     * Quote the message next to the one quoted now, walking backwards through
     * the conversation from the newest when nothing is quoted yet.
     */
    public quoteNeighbour(older: boolean): void {
        const messages = this.webClientService.messages.getList(this.receiver)
            .filter((message) => !message.isStatus && message.id != null);
        if (messages.length === 0) {
            return;
        }

        const quote = this.webClientService.getQuote(this.receiver);
        let at = messages.length;
        if (quote !== undefined) {
            const current = messages.findIndex((message) => message.id === quote.messageId);
            if (current !== -1) {
                at = current;
            }
        }

        const next = messages[at + (older ? -1 : 1)];
        if (next !== undefined) {
            this.webClientService.setQuote(this.receiver, next);
            // Show which message is being quoted, since it is usually off screen
            jumpToMessage(next.id);
        } else if (!older) {
            // Past the newest message: stop quoting
            this.webClientService.setQuote(this.receiver, null);
        }
    }

    /**
     * Whether the message at this position is the first one of its day, and so
     * carries a date separator above it.
     */
    public startsNewDayFor(index: number): boolean {
        const message = this.messages[index];
        // The unread marker is inserted locally and carries no date, so it
        // never begins a day of its own.
        if (message === undefined || !hasValue(message.date)) {
            return false;
        }
        const previous = this.messages[index - 1];
        if (previous === undefined) {
            return true;
        }
        const day = (of: threema.Message) => {
            const date = new Date(of.date * 1000);
            return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        };
        // A dated message after the marker keeps the separator it would have
        // had, so look past anything without one.
        for (let at = index - 1; at >= 0; at--) {
            const earlier = this.messages[at];
            if (hasValue(earlier.date)) {
                return day(earlier) !== day(message);
            }
        }
        return true;
    }

    /**
     * Report the day of whatever message is at the top of the view, and hide
     * the pill again once scrolling stops.
     *
     * Runs outside Angular: this fires on every scroll frame, and a digest per
     * frame is what makes a list feel heavy.
     */
    private updateFloatingDay(): void {
        const chat = this.domChatElement;
        if (chat === undefined || chat === null) {
            return;
        }

        const top = chat.getBoundingClientRect().top + ConversationController.FLOATING_DAY_TOP;
        let current: number | null = null;
        for (const li of Array.from(chat.querySelectorAll('li[id^="message-"]')) as HTMLElement[]) {
            if (li.getBoundingClientRect().bottom > top) {
                const index = this.messages.findIndex((m) => `message-${m.id}` === li.id);
                current = index === -1 ? null : this.messages[index].date;
                break;
            }
        }

        // The floating pill and the inline separators are the same pill drawn
        // in the same place, so an inline one is hidden once it reaches the
        // floating one. It reads as a single label that stuck.
        let anyHidden = false;
        for (const sep of Array.from(chat.querySelectorAll('.day-separator')) as HTMLElement[]) {
            const hidden = sep.getBoundingClientRect().top < top;
            sep.classList.toggle('behind-floating', hidden);
            anyHidden = anyHidden || hidden;
        }

        const day = hasValue(current) ? (this.$filter('unixToDay') as any)(current) : '';
        if (day !== this.floatingDay || !this.floatingDayVisible) {
            this.floatingDay = day;
            this.floatingDayVisible = day !== '';
            this.$scope.$evalAsync();
        }

        if (this.floatingDayTimer !== null) {
            clearTimeout(this.floatingDayTimer);
            this.floatingDayTimer = null;
        }
        // While a separator is tucked behind it, the pill is standing in for
        // that label and has to stay put.
        if (!anyHidden) {
            this.floatingDayTimer = window.setTimeout(() => {
                this.floatingDayVisible = false;
                this.floatingDayTimer = null;
                this.$scope.$evalAsync();
            }, ConversationController.FLOATING_DAY_LINGER);
        }
    }

    public showReceiver(ev): void {
        this.$state.go('messenger.home.conversation.detail', {
            detailType: this.receiver.type,
            detailId: this.receiver.id,
        });
    }

    /**
     * Return whether the receiver detail sidebar is open.
     */
    public isDetailOpen(): boolean {
        return this.$state.current.name === 'messenger.home.conversation.detail';
    }

    public hasMoreMessages(): boolean {
        return this.hasMore;
    }

    /**
     * A message has been seen. Report it to the app, with a small delay to
     * avoid sending too many messages at once.
     */
    public msgRead(message: threema.Message): void {
        // Ignore status messages
        if (message.type === 'status') {
            return;
        }

        // Ignore our own outgoing messages (those are alway read)
        if (message.isOutbox) {
            return;
        }

        // Ignore messages that are not unread
        if (!message.unread) {
            return;
        }

        // Update lastReadMsg
        if (this.lastReadMsg === null || message.sortKey >= this.lastReadMsg.sortKey) {
            this.lastReadMsg = message;
        }

        if (!this.msgReadReportPending) {
            this.msgReadReportPending = true;
            const receiver = structuredClone(this.receiver);
            receiver.type = this.type;
            this.timeoutService.register(() => {
                this.webClientService.requestRead(receiver, this.lastReadMsg);
                this.msgReadReportPending = false;
            }, 300, false, 'requestRead');
        }
    }

    public goBack(): void {
        this.receiverService.setActive(undefined);
        // redirect to messenger home
        this.$state.go('messenger.home');
    }

    /**
     * Close the profile sidebar if it is open, otherwise leave the
     * conversation.
     */
    public onEscape(): void {
        if (this.isDetailOpen()) {
            // Record the intent first, or the transition hook that keeps the
            // sidebar open across conversations reopens it immediately.
            this.navigationStateService.setDetailOpen(false);
            this.$state.go('messenger.home.conversation', this.receiver);
        } else {
            this.goBack();
        }
    }

    /**
     * Scroll to bottom of chat.
     */
    public scrollDown(): void {
        const chat = this.domChatElement;
        this.glidingDown = true;
        glideScrollTo(chat, chat.scrollHeight - chat.clientHeight, () => {
            this.glidingDown = false;
            this.$scope.$evalAsync(() => this.updateScrollJump());
        });
    }

    /**
     * Only show the scroll to bottom button if user scrolled more than 1px
     * away from bottom.
     */
    private updateScrollJump(): void {
        const chat = this.domChatElement;
        const away = chat.scrollHeight - (chat.scrollTop + chat.offsetHeight) > 1;
        // Hiding the button re-arms scroll-glue, which snaps the last stretch
        // and fights the animation. Keep it shown until the glide is done.
        if (!away && this.glidingDown) {
            return;
        }
        this.showScrollJump = away;
    }

    /**
     * Mark the current conversation as pinned.
     */
    public pinConversation(): void {
        if (!hasValue(this.conversation)) {
            this.log.warn('Cannot pin, no conversation exists');
            return;
        }
        this.webClientService
            .modifyConversation(this.conversation, true)
            .then(() => this.showMessage('messenger.PINNED_CONVERSATION_OK'))
            .catch((e) => {
                this.showMessage('messenger.PINNED_CONVERSATION_ERROR');
                this.log.error('Pinning conversation failed: ' + e);
            });
    }

    /**
     * Mark the current conversation as not pinned.
     */
    public unpinConversation(): void {
        if (!hasValue(this.conversation)) {
            this.log.warn('Cannot unpin, no conversation exists');
            return;
        }
        this.webClientService
            .modifyConversation(this.conversation, false)
            .then(() => this.showMessage('messenger.UNPINNED_CONVERSATION_OK'))
            .catch((e) => {
                this.showMessage('messenger.UNPINNED_CONVERSATION_ERROR');
                this.log.error('Unpinning conversation failed: ' + e);
            });
    }
}

class AboutController extends DialogController {
    public readonly config: threema.Config;

    public static readonly $inject = ['$scope', '$mdDialog', 'ThemeService', 'CONFIG'];
    constructor(
        $scope: ng.IScope,
        $mdDialog: ng.material.IDialogService,
        themeService: ThemeService,
        config: threema.Config,
    ) {
        super($scope, $mdDialog, themeService);
        this.config = config;
    }
}

class NavigationController {

    public name: string = 'navigation';

    private webClientService: WebClientService;
    private receiverService: ReceiverService;
    private stateService: StateService;
    private trustedKeyStoreService: TrustedKeyStoreService;
    private notificationService: NotificationService;
    private log: Logger;

    private activeTab: 'contacts' | 'conversations' = 'conversations';
    private searchVisible = false;
    private searchText: string = '';

    // Whether the settings have slid in over the conversation list, and which
    // of its sub views is showing
    public settingsOpen: boolean = false;
    public settingsView: 'settings' | 'troubleshooting' | 'about' = 'settings';
    // Which way the next sub view change is travelling, so it slides the way
    // the user is moving
    public settingsGoingBack: boolean = false;

    private $mdDialog;
    private $translate: ng.translate.ITranslateService;
    private $state: UiStateService;

    public static $inject = [
        '$scope', '$state', '$mdDialog', '$translate',
        'LogService', 'WebClientService', 'StateService', 'ReceiverService', 'NotificationService', 'TrustedKeyStore',
        'SettingsService'
    ];

    constructor($scope, $state: UiStateService, $mdDialog: ng.material.IDialogService,
                $translate: ng.translate.ITranslateService,
                logService: LogService, webClientService: WebClientService, stateService: StateService,
                receiverService: ReceiverService, notificationService: NotificationService,
                trustedKeyStoreService: TrustedKeyStoreService, settingsService: SettingsService) {
        const log = logService.getLogger('Navigation-C');
        this.log = log;

        // Assigned before the redirect below: `$state.go` only takes effect on
        // a later digest, so the template still renders against this
        // controller once and every getter would fault on a missing field.
        this.webClientService = webClientService;
        this.receiverService = receiverService;
        this.stateService = stateService;
        this.trustedKeyStoreService = trustedKeyStoreService;
        this.notificationService = notificationService;
        this.$mdDialog = $mdDialog;
        this.$translate = $translate;
        this.$state = $state;

        // Redirect to welcome if necessary
        if (stateService.state === 'error') {
            log.debug('WebClient not yet running, redirecting to welcome screen');
            $state.go('welcome');
            return;
        }

        // Alt+arrow steps through the chat list. Alt keeps it clear of the
        // caret movement and of the quote shortcuts.
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) {
                return;
            }
            // Escape steps back out of a view that slid in over the list
            if (event.key === 'Escape' && this.settingsOpen) {
                event.preventDefault();
                $scope.$apply(() => this.settingsBack());
                return;
            }
            if (!event.altKey) {
                return;
            }
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
                return;
            }
            event.preventDefault();
            $scope.$apply(() => this.showAdjacentConversation(event.key === 'ArrowUp'));
        };
        document.addEventListener('keydown', onKeyDown);
        $scope.$on('$destroy', () => document.removeEventListener('keydown', onKeyDown));
    }

    /**
     * Open the conversation above or below the one showing now.
     */
    public showAdjacentConversation(previous: boolean): void {
        const conversations = this.webClientService.conversations.get();
        if (conversations.length === 0) {
            return;
        }

        const at = conversations.findIndex(
            (conversation) => this.isActive(conversation));
        // Nothing open yet: start at either end
        const next = at === -1
            ? conversations[previous ? conversations.length - 1 : 0]
            : conversations[at + (previous ? -1 : 1)];
        if (next !== undefined) {
            this.$state.go('messenger.home.conversation', next.receiver);
        }
    }

    /**
     * Return whether the conversation has anything to mark as read.
     */
    public canMarkAsRead(conversation: threema.Conversation): boolean {
        return conversation.unreadCount > 0 || conversation.isUnread === true;
    }

    /**
     * Mark a conversation as read without opening it.
     */
    public markAsRead(conversation: threema.Conversation): void {
        if (!hasValue(conversation.latestMessage)) {
            return;
        }
        this.webClientService.requestRead(
            {type: conversation.type, id: conversation.id} as threema.Receiver,
            conversation.latestMessage);
    }

    /**
     * Pin or unpin a conversation.
     */
    public togglePinned(conversation: threema.Conversation): void {
        this.webClientService
            .modifyConversation(conversation, conversation.isStarred !== true)
            .catch((e) => this.log.error('Pinning conversation failed: ' + e));
    }

    public contacts(): threema.ContactReceiver[] {
        const contacts = [];
        // Since `values()` on a map returns an iterator, we cannot directly
        // apply the `.filter()` method that arrays provide. Therefore, in
        // order to avoid creating an intermediate array just for filtering,
        // create the list of contacts imperatively.
        for (const contact of this.webClientService.contacts.values()) {
            // Exclude own contact
            if (contact.id === this.webClientService.receivers.me.id) {
                continue;
            }
            // Exclude hidden contacts
            if (contact.hidden === true) {
                continue;
            }
            // Otherwise add to results
            contacts.push(contact);
        }
        return contacts;
    }

    /**
     * Search for `needle` in the `haystack`. The search is case insensitive.
     */
    private matches(haystack: string, needle: string): boolean {
        return haystack.toLowerCase().replace('\n', ' ').indexOf(needle.trim().toLowerCase()) !== -1;
    }

    /**
     * Predicate function used for conversation filtering.
     *
     * Match by contact name *or* id *or* last message text.
     */
    private searchConversation = (value: threema.Conversation, index, array): boolean => {
        return this.searchText === ''
            || this.matches(value.receiver.displayName, this.searchText)
            || (value.latestMessage && value.latestMessage.body
                && this.matches(value.latestMessage.body, this.searchText))
            || (value.receiver.id.length === 8 && this.matches(value.receiver.id, this.searchText));
    }

    /**
     * Predicate function used for contact filtering.
     *
     * Match by contact name *or* id.
     */
    private searchContact = (value, index, array): boolean => {
        return this.searchText === ''
            || value.displayName.toLowerCase().indexOf(this.searchText.toLowerCase()) !== -1
            || value.id.toLowerCase().indexOf(this.searchText.toLowerCase()) !== -1;
    }

    public isVisible(conversation: threema.Conversation) {
        return conversation.receiver.visible;
    }

    public conversations(): threema.Conversation[] {
        return this.webClientService.conversations.get();
    }

    public isActive(value: threema.Conversation): boolean {
        return this.receiverService.isConversationActive(value);
    }

    public startupDone(): boolean {
        return this.webClientService.startupDone;
    }

    /**
     * Return true if the app wants to hide inactive and revoked contacts.
     */
    public hideInactiveAndRevokedContacts(): boolean {
        const config = this.webClientService.appConfig;
        return config !== undefined && !config.showInactiveIDs;
    }

    /**
     * Show dialog.
     */
    public showDialog(name: string, ev: Event, controller: Type<DialogController> = DialogController) {
        this.$mdDialog.show({
            controller: controller,
            controllerAs: 'ctrl',
            templateUrl: 'partials/dialog.' + name + '.html',
            parent: angular.element(document.body),
            targetEvent: ev,
            clickOutsideToClose: true,
            fullscreen: true,
        });
    }

    /**
     * Show troubleshooting dialog.
     */
    public troubleshooting(): void {
        this.$mdDialog.show({
            controller: TroubleshootingController,
            controllerAs: 'ctrl',
            templateUrl: 'partials/dialog.troubleshooting.html',
            parent: angular.element(document.body),
            clickOutsideToClose: true,
            fullscreen: true,
        });
    }

    /**
     * Slide the settings in over the conversation list.
     */
    public openSettings(): void {
        this.settingsOpen = true;
        this.settingsView = 'settings';
    }

    /**
     * Show one of the settings' sub views.
     */
    public openSettingsView(view: 'troubleshooting' | 'about'): void {
        this.settingsGoingBack = false;
        this.settingsView = view;
    }

    /**
     * Step back: out of a sub view to the settings, or out of the settings
     * altogether.
     */
    public settingsBack(): void {
        if (this.settingsView !== 'settings') {
            this.settingsGoingBack = true;
            this.settingsView = 'settings';
        } else {
            this.settingsOpen = false;
        }
    }

    /**
     * Leave the settings, whichever view is showing.
     */
    public closeSettings(): void {
        this.settingsOpen = false;
        this.settingsView = 'settings';
    }

    /**
     * Show profile.
     */
    public showProfile(ev): void {
        this.receiverService.setActive(undefined);
        this.$state.go('messenger.home.detail', this.webClientService.me);
    }

    /**
     * Return whether a trusted key is available.
     */
    public isPersistent(): boolean {
        return this.trustedKeyStoreService.hasTrustedKey();
    }

    /**
     * Close the session. The settings pane asks for confirmation itself.
     */
    public closeSession(): void {
        this.webClientService.stop({
            reason: threema.DisconnectReason.SessionStopped,
            send: true,
            // TODO: Use welcome.stopped once we have it
            close: 'welcome',
            connectionBuildupState: 'closed',
        });
    }

    /**
     * Close and delete the session. The settings pane asks for confirmation
     * itself.
     */
    public deleteSession(): void {
        // The stored media belonged to the session being thrown away
        this.webClientService.forgetStoredMedia();
        this.webClientService.stop({
            reason: threema.DisconnectReason.SessionDeleted,
            send: true,
            // TODO: Use welcome.deleted once we have it
            close: 'welcome',
            connectionBuildupState: 'closed',
        });
    }

    public addContact(ev): void {
        this.$state.go('messenger.home.create', {
            type: 'contact',
        });
    }

    public createGroup(ev): void {
        this.$state.go('messenger.home.create', {
            type: 'group',
        });
    }

    public createDistributionList(ev): void {
        this.$state.go('messenger.home.create', {
            type: 'distributionList',
        });
    }

    /**
     * Toggle search bar.
     */
    public toggleSearch(): void {
        this.searchVisible = !this.searchVisible;
    }

    /**
     * Toggle search bar off.
     */
    public toggleSearchOff(): void {
        if (this.searchVisible) {
            this.searchVisible = false;
        }
    }

    /**
     * Clear search when pressing ESC.
     */
    public clearSearch(ev): void {
        if (ev.key === 'Escape') {
            if (this.searchText === '') {
                this.searchVisible = false;
            } else {
                this.searchText = '';
            }
        }
    }


    /**
     * Return the user profile.
     */
    public getMe(): threema.MeReceiver {
        return this.webClientService.me;
    }

    /**
     * Only show the "create distribution list" button if the app supports it.
     */
    public showCreateDistributionListButton(): boolean {
        const capabilities = this.webClientService.appCapabilities;
        return capabilities !== undefined && capabilities.distributionLists;
    }

    /**
     * Return a simplified DND mode.
     *
     * This will return either 'on', 'off' or 'mention'.
     * The 'until' mode will be processed depending on the expiration timestamp.
     */
    public dndModeSimplified(conversation: threema.Conversation): 'on' | 'mention' | 'off' {
        return this.notificationService.getDndModeSimplified(conversation);
    }

}

class MessengerController {
    public name = 'messenger';
    private receiverService: ReceiverService;
    private $state;
    private webClientService: WebClientService;

    public static $inject = [
        '$scope', '$state', '$mdDialog', '$translate', '$transitions',
        'LogService', 'StateService', 'ReceiverService', 'WebClientService', 'ControllerService',
        'NavigationStateService',
    ];
    constructor($scope, $state, $mdDialog: ng.material.IDialogService, $translate: ng.translate.ITranslateService,
                $transitions: UiTransitionService,
                logService: LogService, stateService: StateService, receiverService: ReceiverService,
                webClientService: WebClientService, controllerService: ControllerService,
                navigationStateService: NavigationStateService) {
        const log = logService.getLogger('Messenger-C');

        // Redirect to welcome if necessary
        if (stateService.state === 'error') {
            log.debug('WebClient not yet running, redirecting to welcome screen');
            $state.go('welcome');
            return;
        }

        controllerService.setControllerName('messenger');

        this.receiverService = receiverService;
        this.$state = $state;
        this.webClientService = webClientService;

        // Remember where we are, so a reload comes back to the same place
        $transitions.onSuccess({}, (transition) => {
            const name = transition.to().name;
            const params = transition.params();
            if (name === 'messenger.home.conversation'
                    || name === 'messenger.home.conversation.detail') {
                navigationStateService.setConversation(params.type, params.id);
                navigationStateService.setDetailOpen(
                    name === 'messenger.home.conversation.detail');
            } else if (name === 'messenger.home') {
                navigationStateService.clearConversation();
            }
        });

        // Keep the profile sidebar open across conversations: opening a chat
        // from the list targets the plain conversation state, which would
        // otherwise close it.
        $transitions.onBefore({to: 'messenger.home.conversation'}, (transition) => {
            if (!navigationStateService.isDetailOpen()) {
                return;
            }
            const params = transition.params();
            return transition.router.stateService.target(
                'messenger.home.conversation.detail',
                {...params, detailType: params.type, detailId: params.id});
        });

        // watch for alerts
        $scope.$watch(() => webClientService.alerts, (alerts: threema.Alert[]) => {
            if (alerts.length > 0) {
                angular.forEach(alerts, (alert: threema.Alert) => {
                    $mdDialog.show(
                        $mdDialog.alert()
                            .clickOutsideToClose(true)
                            .title(alert.type)
                            .textContent(alert.message)
                            .ok($translate.instant('common.OK')));
                });
                // clean array
                webClientService.alerts = [];
            }
        }, true);

        this.webClientService.setReceiverListener({
            onConversationRemoved(receiver: threema.Receiver) {
                switch ($state.current.name) {
                    case 'messenger.home.conversation':
                    case 'messenger.home.conversation.detail':
                    case 'messenger.home.detail':
                    case 'messenger.home.edit':
                        if ($state.params !== undefined
                            && $state.params.type !== undefined
                            && $state.params.id !== undefined) {
                            if ($state.params.type === receiver.type
                                && $state.params.id === receiver.id) {
                                // conversation or sub form is open, redirect to home!
                                $state.go('messenger.home');
                            }
                        }
                        break;
                    default:
                        log.debug('Ignored onRemoved event for state', $state.current.name);
                }
            },
        });
    }

    public showDetail(): boolean {
        return !this.$state.is('messenger.home');
    }
}

class QrDialogController extends DialogController {
    public readonly profile: threema.MeReceiver;
    public readonly qrCode;

    public static readonly $inject = ['$scope', '$mdDialog', 'ThemeService', 'WebClientService'];
    constructor(
        $scope: ng.IScope,
        $mdDialog: ng.material.IDialogService,
        themeService: ThemeService,
        webClientService: WebClientService,
    ) {
        super($scope, $mdDialog, themeService);

        this.profile = webClientService.me;
        this.qrCode = {
             errorCorrectionLevel: 'L',
             size: '400px',
             data: '3mid:'
             + this.profile.id
             + ','
             + u8aToHex(new Uint8Array(this.profile.publicKey)),
         };
    }
}

class ReceiverDetailController {
    // Angular services
    private $mdDialog: any;
    private $scope: ng.IScope;
    private $state: UiStateService;

    // Own services
    private contactService: ContactService;
    private webClientService: WebClientService;
    private mediaboxService: MediaboxService;
    private navigationStateService: NavigationStateService;
    // Search terms for the member and shared group lists
    public memberSearch: string = '';
    public groupSearch: string = '';
    // Editing happens in place, as a second pane over the profile
    public editOpen: boolean = false;
    private viewModel: threema.ControllerModel<threema.Receiver> | null = null;
    private saving: boolean = false;
    private controllerModelService: ControllerModelService;

    public receiver: threema.Receiver;
    public me: threema.MeReceiver;
    public title: string;
    public publicKeyGrid: string = '';
    private showGroups = false;
    private showDistributionLists = false;
    private inGroups: threema.GroupReceiver[] = [];
    private inDistributionLists: threema.DistributionListReceiver[] = [];
    private hasSystemEmails = false;
    private hasSystemPhones = false;
    private isWorkReceiver = false;
    private showBlocked = () => false;

    private controllerModel: threema.ControllerModel<threema.Receiver>;

    public static $inject = [
        '$scope', '$stateParams', '$state', '$mdDialog', '$translate',
        'LogService', 'WebClientService', 'ContactService', 'ControllerModelService',
        'MediaboxService', 'NavigationStateService',
    ];
    constructor($scope: ng.IScope, $stateParams, $state: UiStateService,
                $mdDialog: ng.material.IDialogService, $translate: ng.translate.ITranslateService,
                logService: LogService, webClientService: WebClientService,
                contactService: ContactService, controllerModelService: ControllerModelService,
                mediaboxService: MediaboxService,
                navigationStateService: NavigationStateService) {
        this.$mdDialog = $mdDialog;
        this.$scope = $scope;
        this.$state = $state;
        this.contactService = contactService;
        this.webClientService = webClientService;
        this.mediaboxService = mediaboxService;
        this.navigationStateService = navigationStateService;
        this.controllerModelService = controllerModelService;

        this.receiver = webClientService.receivers.getData(
            $stateParams.detailType !== undefined && $stateParams.detailType !== null
                ? {type: $stateParams.detailType, id: $stateParams.detailId}
                : $stateParams);
        this.me = webClientService.me;

        const log = logService.getLogger('ReceiverDetail-C');

        // Append group membership
        if (isContactReceiver(this.receiver)) {
            const contactReceiver = this.receiver;

            this.contactService.requiredDetails(contactReceiver)
                .then(() => {
                    this.hasSystemEmails = contactReceiver.systemContact !== undefined
                        && contactReceiver.systemContact.emails.length > 0;
                    this.hasSystemPhones = contactReceiver.systemContact !== undefined &&
                        contactReceiver.systemContact.phoneNumbers.length > 0;
                })
                .catch((error) => {
                    // TODO: Redirect or show an alert?
                    log.error(`Contact detail request has been rejected: ${error}`);
                });

            this.isWorkReceiver = contactReceiver.identityType === threema.IdentityType.Work;

            webClientService.groups.forEach((groupReceiver: threema.GroupReceiver) => {
                // check if my identity is a member
                if (groupReceiver.members.indexOf(contactReceiver.id) !== -1) {
                    this.inGroups.push(groupReceiver);
                    this.showGroups = true;
                }
            });

            webClientService.distributionLists.forEach(
                (distributionListReceiver: threema.DistributionListReceiver) => {
                    // check if my identity is a member
                    if (distributionListReceiver.members.indexOf(contactReceiver.id) !== -1) {
                        this.inDistributionLists.push(distributionListReceiver);
                        this.showDistributionLists = true;
                    }
                },
            );

            this.showBlocked = () => contactReceiver.isBlocked;
        }

        switch (this.receiver.type) {
            case 'me':
                const meReceiver = this.receiver as threema.MeReceiver;
                this.controllerModel = controllerModelService.me(meReceiver, ControllerModelMode.VIEW);
                this.publicKeyGrid = publicKeyGrid(new Uint8Array(meReceiver.publicKey));
                break;
            case 'contact':
                const contactReceiver = this.receiver as threema.ContactReceiver;
                this.controllerModel = controllerModelService.contact(contactReceiver, ControllerModelMode.VIEW);
                this.publicKeyGrid = publicKeyGrid(new Uint8Array(contactReceiver.publicKey));
                break;
            case 'group':
                this.controllerModel = controllerModelService
                    .group(this.receiver as threema.GroupReceiver, ControllerModelMode.VIEW);
                break;
            case 'distributionList':
                this.controllerModel = controllerModelService
                    .distributionList(this.receiver as threema.DistributionListReceiver, ControllerModelMode.VIEW);
                break;
            default:
                log.error('Cannot initialize controller model:',
                    'Invalid receiver type "' + this.receiver.type + '"');
                $state.go('messenger.home');
                return;
        }

        // If this receiver was removed, navigate to "home" view
        this.controllerModel.setOnRemoved((receiverId: string) => {
            log.warn('Receiver removed, redirecting to home');
            this.$state.go('messenger.home');
        });

    }

    public chat(): void {
        this.$state.go('messenger.home.conversation', {
            type: this.receiver.type,
            id: this.receiver.id,
            initParams: null,
        });
    }

    /**
     * Return whether a chat with this receiver can be opened. There is no
     * point in offering it for the conversation that is already open behind
     * the detail sidebar.
     */
    public canChat(): boolean {
        if (!this.controllerModel.canChat()) {
            return false;
        }
        const conversation = this.$state.params as {type?: string, id?: string};
        return conversation.type !== this.receiver.type
            || conversation.id !== this.receiver.id;
    }

    /**
     * Return whether the receiver has an avatar to show.
     */
    public hasAvatar(): boolean {
        return hasValue(this.receiver.avatar)
            && hasValue(this.receiver.avatar.high ?? this.receiver.avatar.low);
    }

    /**
     * Show the avatar in the media box.
     */
    public showAvatar(): void {
        const avatar = this.receiver.avatar;
        if (!hasValue(avatar)) {
            return;
        }
        const data = avatar.high ?? avatar.low;
        if (!hasValue(data)) {
            return;
        }
        this.mediaboxService.setMedia(
            data,
            `${this.receiver.displayName}.jpg`,
            this.webClientService.appCapabilities.imageFormat.avatar,
            this.receiver.displayName,
        );
    }

    public edit(): void {
        if (!this.controllerModel.canEdit()) {
            return;
        }
        // Edit in place rather than navigating away from the panel. The edit
        // templates read `controllerModel`, so swap it and put the view model
        // back when the pane closes.
        const editModel = this.modelFor(this.receiver, ControllerModelMode.EDIT);
        if (editModel === null) {
            return;
        }
        this.viewModel = this.controllerModel;
        this.controllerModel = editModel;
        this.editOpen = true;
    }

    /**
     * Leave the edit pane without keeping the changes.
     */
    public cancelEdit(): void {
        if (this.viewModel !== null) {
            this.controllerModel = this.viewModel;
            this.viewModel = null;
        }
        this.editOpen = false;
        this.saving = false;
    }

    /**
     * Keep the changes and go back to the profile.
     */
    public saveEdit(): void {
        if (!this.editOpen || !this.controllerModel.isValid()) {
            return;
        }
        this.saving = true;
        this.controllerModel.save()
            .then(() => this.$scope.$applyAsync(() => {
                // The view model still holds the values from before the save
                this.viewModel = this.modelFor(this.receiver, ControllerModelMode.VIEW);
                this.cancelEdit();
            }))
            .catch(() => this.$scope.$applyAsync(() => this.saving = false));
    }

    public isSaving(): boolean {
        return this.saving;
    }

    /**
     * Save on Enter, as the edit dialog does.
     */
    public keypress($event: KeyboardEvent): void {
        if ($event.key === 'Enter') {
            this.saveEdit();
        }
    }

    private modelFor(
        receiver: threema.Receiver,
        mode: ControllerModelMode,
    ): threema.ControllerModel<threema.Receiver> | null {
        switch (receiver.type) {
            case 'me':
                return this.controllerModelService.me(receiver as threema.MeReceiver, mode);
            case 'contact':
                return this.controllerModelService.contact(receiver as threema.ContactReceiver, mode);
            case 'group':
                return this.controllerModelService.group(receiver as threema.GroupReceiver, mode);
            case 'distributionList':
                return this.controllerModelService.distributionList(
                    receiver as threema.DistributionListReceiver, mode);
            default:
                return null;
        }
    }

    /**
     * Show the QR code of the public key.
     */
    public showQr(): void {
        const $mdDialog = this.$mdDialog;
        $mdDialog.show({
            controllerAs: 'ctrl',
            controller: QrDialogController,
            templateUrl: 'partials/dialog.qr.html',
            parent: angular.element(document.body),
            clickOutsideToClose: true,
            fullscreen: true,
        });
    }

    /**
     * The group members whose name or identity matches the search, or all of
     * them when nothing has been typed.
     */
    public filteredMembers(): string[] {
        const members = (this.receiver as threema.GroupReceiver).members || [];
        const needle = (this.memberSearch || '').trim().toLowerCase();
        if (needle === '') {
            return members;
        }
        return members.filter((identity: string) => {
            const contact = this.webClientService.contacts.get(identity);
            const name = contact === undefined ? '' : contact.displayName;
            return identity.toLowerCase().includes(needle)
                || name.toLowerCase().includes(needle);
        });
    }

    /**
     * The groups shared with this contact that match the search.
     */
    public filteredGroups(): threema.GroupReceiver[] {
        const needle = (this.groupSearch || '').trim().toLowerCase();
        if (needle === '') {
            return this.inGroups;
        }
        return this.inGroups.filter(
            (group: threema.GroupReceiver) => group.displayName.toLowerCase().includes(needle));
    }

    public goBack(): void {
        // Close the sidebar rather than walking browser history, which would
        // jump back to whichever chat was open before.
        const params = this.$state.params as {type?: string, id?: string};
        if (params.type !== undefined && params.id !== undefined) {
            this.navigationStateService.setDetailOpen(false);
            this.$state.go('messenger.home.conversation',
                {type: params.type, id: params.id, initParams: null});
        } else {
            this.$state.go('messenger.home');
        }
    }

}

/**
 * Control edit a group or a contact
 * fields, validate and save routines are implemented in the specific ControllerModel
 */
class ReceiverEditController {
    public $mdDialog: any;
    private $scope: ng.IScope;
    public $state: UiStateService;
    private $translate: ng.translate.ITranslateService;

    public title: string;
    private $timeout: ng.ITimeoutService;
    private future: Future<threema.Receiver>;

    private controllerModel: threema.ControllerModel<threema.Receiver>;
    public type: string;

    public static $inject = [
        '$scope', '$stateParams', '$state', '$mdDialog',
        '$timeout', '$translate', 'LogService', 'WebClientService', 'ControllerModelService',
    ];
    constructor($scope: ng.IScope, $stateParams, $state: UiStateService,
                $mdDialog, $timeout: ng.ITimeoutService, $translate: ng.translate.ITranslateService,
                logService: LogService, webClientService: WebClientService,
                controllerModelService: ControllerModelService) {
        this.$scope = $scope;
        this.$mdDialog = $mdDialog;
        this.$state = $state;
        this.$timeout = $timeout;
        this.$translate = $translate;

        const log = logService.getLogger('ReceiverEdit-C');

        const receiver = webClientService.receivers.getData($stateParams);
        switch (receiver.type) {
            case 'me':
                this.controllerModel = controllerModelService.me(
                    receiver as threema.MeReceiver,
                    ControllerModelMode.EDIT,
                );
                break;
            case 'contact':
                this.controllerModel = controllerModelService.contact(
                    receiver as threema.ContactReceiver,
                    ControllerModelMode.EDIT,
                );
                break;
            case 'group':
                this.controllerModel = controllerModelService.group(
                    receiver as threema.GroupReceiver,
                    ControllerModelMode.EDIT,
                );
                break;
            case 'distributionList':
                this.controllerModel = controllerModelService.distributionList(
                    receiver as threema.DistributionListReceiver,
                    ControllerModelMode.EDIT,
                );
                break;
            default:
                log.error('Cannot initialize controller model:',
                    'Invalid receiver type "' + receiver.type + '"');
                $state.go('messenger.home');
                return;
        }
        this.type = receiver.type;
    }

    public keypress($event: KeyboardEvent): void {
        if ($event.key === 'Enter' && this.controllerModel.isValid()) {
            this.save();
        }
    }

    public save(): void {
        this.future = Future.withMinDuration(this.controllerModel.save(), 100);
        this.future
            .then(() => {
                this.$scope.$apply(() => {
                    this.goBack();
                });
            })
            .catch((errorCode) => {
                this.$scope.$apply(() => {
                    this.showEditError(errorCode);
                });
            });
    }

    public isSaving(): boolean {
        return this.future !== undefined && !this.future.done;
    }

    private showEditError(errorCode: string): void {
        if (errorCode === undefined) {
            errorCode = 'unknown';
        }
        this.$mdDialog.show(
            this.$mdDialog.alert()
                .clickOutsideToClose(true)
                .title(this.controllerModel.subject)
                .textContent(this.$translate.instant('validationError.modifyReceiver.' + errorCode))
                .ok(this.$translate.instant('common.OK')),
        );
    }

    public goBack(): void {
        window.history.back();
    }
}

interface CreateReceiverStateParams extends UiStateParams {
    type: threema.ReceiverType;
    initParams: null | {identity: string | null};
}

/**
 * Control creating a group or adding contact
 * fields, validate and save routines are implemented in the specific ControllerModel
 */
class ReceiverCreateController {
    public $mdDialog: any;
    private $scope: ng.IScope;
    private $timeout: ng.ITimeoutService;
    private $state: UiStateService;
    private $mdToast: any;
    public identity = '';
    private $translate: any;
    public type: string;
    private future: Future<threema.Receiver>;

    public controllerModel: threema.ControllerModel<threema.Receiver>;

    public static $inject = ['$stateParams', '$mdDialog', '$scope', '$mdToast', '$translate',
        '$timeout', '$state', 'LogService', 'ControllerModelService'];
    constructor($stateParams: CreateReceiverStateParams, $mdDialog, $scope: ng.IScope, $mdToast, $translate,
                $timeout: ng.ITimeoutService, $state: UiStateService,
                logService: LogService, controllerModelService: ControllerModelService) {
        this.$mdDialog = $mdDialog;
        this.$scope = $scope;
        this.$timeout = $timeout;
        this.$state = $state;
        this.$mdToast = $mdToast;
        this.$translate = $translate;

        const log = logService.getLogger('ReceiverEdit-C');

        this.type = $stateParams.type;
        switch (this.type) {
            case 'me':
                log.warn('Cannot create own contact');
                $state.go('messenger.home');
                return;
            case 'contact':
                this.controllerModel = controllerModelService.contact(null, ControllerModelMode.NEW);
                if ($stateParams.initParams !== null) {
                    (this.controllerModel as ContactControllerModel)
                        .identity = $stateParams.initParams.identity;
                }
                break;
            case 'group':
                this.controllerModel = controllerModelService.group(null, ControllerModelMode.NEW);
                break;
            case 'distributionList':
                this.controllerModel = controllerModelService.distributionList(null, ControllerModelMode.NEW);
                break;
            default:
                log.error('Invalid type', this.type);
        }
    }

    public isSaving(): boolean {
        return this.future !== undefined && !this.future.done;
    }

    public goBack(): void {
        if (!this.isSaving()) {
            window.history.back();
        }
    }

    private showAddError(errorCode: string): void {
        if (errorCode === undefined) {
            errorCode = 'unknown';
        }
        this.$mdDialog.show(
            this.$mdDialog.alert()
                .clickOutsideToClose(true)
                .title(this.controllerModel.subject)
                .textContent(this.$translate.instant('validationError.modifyReceiver.' + errorCode))
                .ok(this.$translate.instant('common.OK')),
        );
    }

    public keypress($event: KeyboardEvent): void {
        if ($event.key === 'Enter' && this.controllerModel.isValid()) {
            this.create();
        }
    }

    public create(): void {
        // Save, then go to receiver detail page
        this.future = Future.withMinDuration(this.controllerModel.save(), 100);
        this.future
            .then((receiver: threema.Receiver) => {
                this.$scope.$apply(() => {
                    this.$state.go('messenger.home.detail', receiver, {location: 'replace'});
                });
            })
            .catch((errorCode) => {
                this.$scope.$apply(() => {
                    this.showAddError(errorCode);
                });
            });
    }
}

angular.module('3ema.messenger', ['ngMaterial'])

.config(['$stateProvider', function($stateProvider: UiStateProvider) {

    $stateProvider

        .state('messenger', {
            abstract: true,
            templateUrl: 'partials/messenger.html',
            controller: 'MessengerController',
            controllerAs: 'ctrl',
        })

        .state('messenger.home', {
            url: '/messenger',
            views: {
                navigation: {
                    templateUrl: 'partials/messenger.navigation.html',
                    controller: 'NavigationController',
                    controllerAs: 'ctrl',
                },
                content: {
                    // Required because navigation should not be changed,
                    template: '<div ui-view></div>',
                },
            },
        })

        .state('messenger.home.conversation', {
            url: '/conversation/{type}/{id}',
            templateUrl: 'partials/messenger.conversation.html',
            controller: 'ConversationController',
            controllerAs: 'ctrl',
            params: {initParams: null},
        })

        // Nested below the conversation so it opens as a sidebar next to the
        // chat rather than replacing it. It carries its own receiver params so
        // that the profile of any group member can be shown without switching
        // the conversation behind it.
        //
        // Deliberately without a url: the sidebar is UI state, so it should
        // not be addressable or add browser history entries.
        .state('messenger.home.conversation.detail', {
            templateUrl: 'partials/messenger.receiver.html',
            controller: 'ReceiverDetailController',
            controllerAs: 'ctrl',
            params: {detailType: null, detailId: null},
        })

        // Own profile, which has no conversation to sit next to
        .state('messenger.home.detail', {
            url: '/receiver/{type}/{id}/detail',
            templateUrl: 'partials/messenger.receiver.html',
            controller: 'ReceiverDetailController',
            controllerAs: 'ctrl',
        })
        .state('messenger.home.edit', {
            url: '/conversation/{type}/{id}/detail/edit',
            templateUrl: 'partials/messenger.receiver.edit.html',
            controller: 'ReceiverEditController',
            controllerAs: 'ctrl',
        })
        .state('messenger.home.create', {
            url: '/receiver/create/{type}',
            templateUrl: 'partials/messenger.receiver.create.html',
            controller: 'ReceiverCreateController',
            controllerAs: 'ctrl',
            params: {initParams: null},
        })
    ;
}])

.controller('SendFileController', SendFileController)
.controller('SettingsController', SettingsController)
.controller('TroubleshootingController', TroubleshootingController)
.controller('AboutController', AboutController)
.controller('MessengerController', MessengerController)
.controller('ConversationController', ConversationController)
.controller('NavigationController', NavigationController)
.controller('ReceiverDetailController', ReceiverDetailController)
.controller('ReceiverEditController', ReceiverEditController)
.controller('ReceiverCreateController', ReceiverCreateController)
;
