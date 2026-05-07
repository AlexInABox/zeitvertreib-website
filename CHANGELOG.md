# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project DOES NOT adhere to [Semantic Versioning](https://semver.org/spec/v2.0.0.html), but uses monotonically increasing integers as version numbers.

## [26] - Unreleased

## [25]

### Added

- Minecraft integration via account linking.
- Divided sprays into three slots: free, paid, and donators.
- Fakerank renewal pricing adjusted, with special rates for donators.
- New Minecraft server economy system with player-to-player trading and team features.

## [24]

### Added

- New Eventim plugin to automatically run in-game events.
- A new notification system tracking various Zeitvertreib-related events on the website.
- Updated all plugins to newer versions of HintServiceMeow and LabAPI.

### Fixed

- Adjusted spray rules to disallow indecent content.
- AFKReplace now ignores users that are in the tutorial tower.
- Spawn protection no longer applies for damage caused by SCP173 or the Warhead.

## [23]

### Added

- AFKReplace plugin no longer replaces users in the tutorial tower.
- Pushing is disabled after the Warhead has detonated.
- Semi-automated system for users to easily upload clips to open reports.

### Fixed

- Fixed frontend cache issues that could display incorrect ZVC values.
- Enforced age limit for setting birthdays when using the Discord command.
- Fixed a bug in the Pushed plugin where weak pushes could exceed allowed force.
- Slot machine functionality restored.

## [22]

### Added

- New daily and weekly quest system with rewards in ZVC.
- New soundtrack for Chiikawa mode.
- Reworked case system to include linked users and creators.
- Added Z.E.I.T. system to lookup people and view linked cases and warnings.
- New spawn protection plugin.
- Case rule selection and sorting features.

### Fixed

- Alignment of the Discord button.
- Improved readability for Chiikawa mode.
- Lucky wheel win condition sound behavior fixed.
- Miscellaneous plugin fixes.

## [21]

### Added

- Easier access to the dev site (#88).
- Updated UI for sending ZVC via the Discord bot.
- Theme-specific background music.
- System to manipulate user luck in minigames.
- A modern, clean ZVC overlay.
- Minigames now have dedicated pages to avoid cluttering the dashboard.

### Fixed

- Chiikawa easter egg now correctly preserves theme instead of forcing light mode.
- Various fixes and improvements.

## [20]

### Added

- Ability to send and manage ZVC via a Discord command (`/zvc`).
- Sound effects added to games on the website.
- Several website easter eggs.

### Fixed

- Improved dark mode appearance site-wide, especially on the dashboard.
- Chicken Cross game payout adjusted to compound each step for larger payouts.

[26]: https://github.com/alexinabox/zeitvertreib-website/compare/build-25...dev
[25]: https://github.com/alexinabox/zeitvertreib-website/compare/build-24...build-25
[24]: https://github.com/alexinabox/zeitvertreib-website/compare/build-23...build-24
[23]: https://github.com/alexinabox/zeitvertreib-website/compare/build-22...build-23
[22]: https://github.com/alexinabox/zeitvertreib-website/compare/build-21...build-22
[21]: https://github.com/alexinabox/zeitvertreib-website/compare/build-20...build-21
[20]: https://github.com/alexinabox/zeitvertreib-website/compare/build-19...build-20
