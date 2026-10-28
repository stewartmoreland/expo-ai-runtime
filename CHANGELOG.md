# Changelog

## [0.8.0](https://github.com/stewartmoreland/expo-ai-runtime/compare/v0.7.2...v0.8.0) (2026-10-28)

### ⚠ BREAKING CHANGES

* **evals:** @stewmore/expo-ai-cloud is an optional peer of evals and the default fallback is none.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **react:** useObject return shape now includes result.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **apple:** Apple results now report provider usage and the native module contract changed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **core:** GenerateResult.usage is required and carries a source; new ExpoAIError codes and detail.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
* **core:** cloud is no longer in the default provider priority; sessions now honor sensitive privacy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### Features

* **android:** availability change notifications ([0ee38dc](https://github.com/stewartmoreland/expo-ai-runtime/commit/0ee38dcfd18937317f84b56c5e4d8dd282ce9552))
* **apple:** usage, context size, guided generation, cancel, prewarm, locale, PCC adapter and privateCloudCompute plugin option ([48fd4c1](https://github.com/stewartmoreland/expo-ai-runtime/commit/48fd4c1be9ad8f3874efe567c52fe555fd202180))
* **core:** app-wide privacy policy, PCC off-device gating, sessions honor sensitive ([c93c7e1](https://github.com/stewartmoreland/expo-ai-runtime/commit/c93c7e1e093dc73cb8b494d8288745d79496d39b))
* **core:** required usage on every result, new error codes, structured output modes, prewarm, availability events, native cancel bridge ([05c8d0c](https://github.com/stewartmoreland/expo-ai-runtime/commit/05c8d0c5c9b34437779e3f8f1f4f679fea970554))
* **evals:** cloud optional peer, --providers/--fallback, default fallback none; cloud error codes ([87b37d8](https://github.com/stewartmoreland/expo-ai-runtime/commit/87b37d85b8c0ea978860d6fb580a40fa254ea790))
* **react:** useObject exposes result; useCapabilities refreshes on availability change ([9af916c](https://github.com/stewartmoreland/expo-ai-runtime/commit/9af916c2fec0f00e714a82abc2be4246707a36a4))

### Bug Fixes

* **apple:** declare podspecPath in expo-module.config.json ([ea5e20d](https://github.com/stewartmoreland/expo-ai-runtime/commit/ea5e20da43abe4e5feb0bda9b920f926a6bf347a))
* **apple:** PCC session errors name PCC provider; clarify SDK requirements ([5341808](https://github.com/stewartmoreland/expo-ai-runtime/commit/534180818ea83fe3eff0db7c0914bfc81a9447e1))
* **core:** native streamObject falls back, count blank-seed usage, adapter owns error provider ([2913d7f](https://github.com/stewartmoreland/expo-ai-runtime/commit/2913d7f8a9ca4b17edb7cd45d9d3c0dd8b5413d1))
* **evals:** warn when ENDPOINT is set but cloud is not in --providers ([b1e3698](https://github.com/stewartmoreland/expo-ai-runtime/commit/b1e369844b198eff44a39686ec9ba0044438b920))
* **release:** CI concurrency, verify-published gate, no-network check, api/pkg lint for apple ([8d41b32](https://github.com/stewartmoreland/expo-ai-runtime/commit/8d41b324191c8f662c876a1d08b6e4465956d113))
* **release:** keep breaking changes on 0.x as minor bumps (preMajor) ([5934180](https://github.com/stewartmoreland/expo-ai-runtime/commit/5934180bc432a42576316046bd45176cdec5a4e0))

## [0.7.2](https://github.com/stewartmoreland/expo-ai-runtime/compare/v0.7.1...v0.7.2) (2026-06-23)

### Bug Fixes

* **examples:** float internal [@stewmore](https://github.com/stewmore) deps to "*" so examples link the workspace ([1d07c1b](https://github.com/stewartmoreland/expo-ai-runtime/commit/1d07c1b0b4b8d477963263a9fed8f2d436032fe9))
* **release:** let release-it push the tag before the GitHub release ([51cdf40](https://github.com/stewartmoreland/expo-ai-runtime/commit/51cdf40ec97b3d8b08ae2e2e33c19899d0bf01b3))

## [0.7.1](https://github.com/stewartmoreland/expo-ai-runtime/compare/v0.7.0...v0.7.1) (2026-06-23)

### Bug Fixes

* **release:** add repository metadata for npm provenance ([853957b](https://github.com/stewartmoreland/expo-ai-runtime/commit/853957b714c038ece03f5da92c1bbac134607426))
