# Changelog


## [0.5.3](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.5.2...v0.5.3) (2026-10-29)

## [0.5.2](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.5.1...v0.5.2) (2026-10-29)

### Bug Fixes

* **bot:** keep chat pairs per configuring user ([0fa150e](https://github.com/MurzNN/tg-threadifier-bot/commit/0fa150e676a55eba083f0f06a65e3b74cda3f547))

## [0.5.1](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.5.0...v0.5.1) (2026-10-29)

## [0.5.0](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.4.1...v0.5.0) (2026-10-29)

### Features

* **bot:** show chat-pair status from bare /pair ([050e506](https://github.com/MurzNN/tg-threadifier-bot/commit/050e506183ce2f68b06cf1ec146890e0187be640))
* **db:** expand environment references in DATABASE_URL ([e6c92cb](https://github.com/MurzNN/tg-threadifier-bot/commit/e6c92cb4bced31364813e2956eff2ac5164da880))
* **i18n:** add Spanish, French, and Russian catalogs ([3e23333](https://github.com/MurzNN/tg-threadifier-bot/commit/3e233338927227b56081c3871dc0957198e26e2d))
* **i18n:** set bot language per chat ([440effb](https://github.com/MurzNN/tg-threadifier-bot/commit/440effb8d5685b7254bca496b5093aafaf0b1f47))
* **relocate:** implement Flow A with author attribution and chat migration ([ffd7d45](https://github.com/MurzNN/tg-threadifier-bot/commit/ffd7d452b34f700f8212cb4e7f4c5173b474e114))

### Bug Fixes

* **i18n:** remove line numbers from po files ([43cb919](https://github.com/MurzNN/tg-threadifier-bot/commit/43cb919281ed0d9f3296f8d69198a21434a3527f))
* **pairs:** keep one enabled pair per target for relocate matching ([7216a75](https://github.com/MurzNN/tg-threadifier-bot/commit/7216a7588385f1c7488f09e070d0cf4c352cafee))
* **test:** fake only timer functions in the batcher tests ([d7dfd96](https://github.com/MurzNN/tg-threadifier-bot/commit/d7dfd96e33932c932ecc90f2cfb6145496e7542a))
* **test:** stop faking timers in the batcher tests ([f59360d](https://github.com/MurzNN/tg-threadifier-bot/commit/f59360de99725659c29229d8f4b7aee501cd2fc6))

## [0.4.1](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.4.0...v0.4.1) (2026-10-28)

## [0.4.0](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.3.0...v0.4.0) (2026-10-28)

### Features

* **helm:** ship M1.5 packaging for manual testing ([9a09813](https://github.com/MurzNN/tg-threadifier-bot/commit/9a098132e813b1926e802b2f9fb42a5168154fc8))

## [0.3.0](https://github.com/MurzNN/tg-threadifier-bot/compare/v0.2.0...v0.3.0) (2026-10-28)

### Features

* **bot:** configure chat pairs via env and slash commands ([e772123](https://github.com/MurzNN/tg-threadifier-bot/commit/e772123a313db16d8ebe499df7fc379dcfaf8ed9))
* **bot:** ingest messages from configured chat pairs ([feb725a](https://github.com/MurzNN/tg-threadifier-bot/commit/feb725a4ccbe690a4b8e07b7e77fb9c330d96c8f))
* **db:** add postgres schema with PGlite boot ([6a9a6e4](https://github.com/MurzNN/tg-threadifier-bot/commit/6a9a6e46b004afb2ffeeb12b3f57be3213a7df3d))

### Bug Fixes

* **test:** silence unused ingest transformer arg ([eb9044a](https://github.com/MurzNN/tg-threadifier-bot/commit/eb9044a8b016c4c74a706f046e1da093fd774fb4))

## 0.2.0 (2026-10-28)

### Features

* **bot:** scaffold M0 TypeScript app on Nub ([27aba98](https://github.com/MurzNN/tg-threadifier-bot/commit/27aba984fb85e3ac82bca86333c7a7b609075aca))

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/)
via [release-it](https://github.com/release-it/release-it) and Conventional Commits.
