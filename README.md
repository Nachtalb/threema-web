# Threema Web

[![License](https://img.shields.io/badge/License-AGPLv3-blue.svg)](https://github.com/Nachtalb/threema-web/blob/hate-driven-development/LICENSE.txt)

> :information_source: **This is an unofficial fork** of
> [threema-ch/threema-web](https://github.com/threema-ch/threema-web), which is
> in maintenance mode upstream. It is not affiliated with, endorsed by, or
> supported by Threema GmbH.
>
> Please do not report problems with this fork to Threema. Open an issue
> [here](https://github.com/Nachtalb/threema-web/issues/new) instead.

Threema Web is a web client for Threema, a privacy-focussed end-to-end
encrypted mobile messenger hosted and developed in Switzerland. With Threema
Web, you can use Threema on your Desktop without compromising security.

Threema Web establishes a connection between Desktop and mobile device using
[WebRTC](https://webrtc.org/) (Android) or encrypted WebSockets (iOS).
Signaling and data is end-to-end encrypted with [SaltyRTC](https://saltyrtc.org/).

For more information, see the [Threema Cryptography
Whitepaper](https://threema.com/press-files/2_documentation/cryptography_whitepaper.pdf).


## Bug Reports and Feature Requests

Found a bug in this fork? [Open an
issue](https://github.com/Nachtalb/threema-web/issues/new). Please search the
existing issues first.


## Protocol

The protocol used to communicate between the Threema app and Threema Web
is documented [here](https://threema-ch.github.io/app-remote-protocol/).


## Configuration

The configuration of Threema Web can be tweaked in
[`src/config.ts`](src/config.ts) and [`src/userconfig.js`](src/userconfig.js) /
[`src/userconfig.overrides.js`](src/userconfig.overrides.js) (see
[`src/userconfig.overrides.js.example`](src/userconfig.overrides.js.example).
The config variables are defined at build time, and the userconfig variables
can be modified at runtime. Please refer to those files for documentation on
what variables exist and how to configure them.

In the Docker image, userconfig variables are set by mounting a
`userconfig.overrides.js`. See [`docs/docker.md`](docs/docker.md) for the image
and [`k8s/README.md`](k8s/README.md) for the Kubernetes manifests.


## Self Hosting

For instructions on how to host your own version of Threema Web, please refer
to [docs/self_hosting.md](docs/self_hosting.md).


## Development

<details>
<summary>Building, testing and contributing</summary>

Threema Web is written using [TypeScript](https://www.typescriptlang.org/) and
[AngularJS 1](https://www.angularjs.org/). Dependencies are managed with
[Bun](https://bun.com/). You currently need Bun 1.x to build Threema
Web. (Note that Node.js is only a build dependency, the result is plain old
client-side JavaScript.)

If your default NodeJS version is not 24, use nvm to install it:

    nvm install
    nvm use

Install development dependencies:

    bun install

Run the dev server:

    bun run devserver

Then open the URL in your browser:

    firefox http://localhost:9966

*(Note that this setup should not be used in production. To run Threema
Web on a server, please follow the instructions at
[docs/self_hosting.md](docs/self_hosting.md).)*

### Testing

To run unit tests:

    bun run build:unittests && bun run testserver
    firefox http://localhost:7777/tests/testsuite.html

To run UI tests:

    bun run build  # Required for CSS to be rebuilt
    bun run test:ui <browser>

For example:

    bun run test:ui firefox
    bun run test:ui chrome

You can also filter the test cases:

    bun run test:ui firefox emoji

To run linting checks:

    bun run lint

You can also install a pre-push hook to do the linting:

    echo -e '#!/bin/sh\nbun run lint' > .git/hooks/pre-push
    chmod +x .git/hooks/pre-push

### Contributing

Contributions are welcome! Please open a pull request with your proposed
changes.

</details>


## Security

> :information_source: The contacts below belong to **Threema GmbH**, not to
> the maintainer of this fork. Use them for vulnerabilities in Threema itself.
> For issues specific to this fork, [open an
> issue](https://github.com/Nachtalb/threema-web/issues/new).

Upstream releases are tagged and cryptographically signed using the following
PGP key:

    pub   rsa4096 2016-09-06 [SC] [expires: 2026-09-04]
          E7AD D991 4E26 0E8B 35DF  B506 65FD E935 573A CDA6
    uid           Threema Signing Key <dev@threema.ch>

The public key can be found [on Keybase](https://keybase.io/threema).

If you discover a security issue in Threema, please adhere to the coordinated
vulnerability disclosure model. To be eligible for a bug bounty, please [file a
report on GObugfree](https://app.gobugfree.com/programs/threema) (where all the
details, including the bounty levels, are listed). If you're not interested in
the bug bounty program, you can contact them via Threema or by email; for
contact details, see [threema.com/contact](https://threema.com/en/contact)
(section "Security").


## License

Threema Web license:

    Threema Web.

    Copyright © Threema GmbH (https://threema.com/).

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program. If not, see <http://www.gnu.org/licenses/>.

For third party library licenses, see `LICENSE-3RD-PARTY.txt`.
