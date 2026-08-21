/**
 * Threema Web configuration.
 *
 * The various options are explained in the `README.md` file.
 */

// tslint:disable:max-line-length
export default {
    // Version
    VERSION: '[[VERSION]]',

    // Set this to `true` if this instance of Threema Web isn't being hosted on
    // `web.threema.com`.
    SELF_HOSTED: false,

    // General
    GIT_BRANCH: 'master',

    // When the Threema Web protocol version changes, this can be set to the
    // last version of Threema Web that supported the previous protocol
    // version. If set to something different than `null`, a message will be
    // shown to the user if reconnecting fails.
    PREV_PROTOCOL_LAST_VERSION: '1.8.2',

    // Store session password for the lifetime of the app, so a reload does not
    // require re-entering it. Auto-generate a session password if none was
    // entered.
    IN_MEMORY_SESSION_PASSWORD: true,
} as threema.Config;
