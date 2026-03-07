import { createYandexPlatform } from "./platform/yandex/sdk.ts";
import { bootstrap } from "./game/bootstrap.ts";

// Entry point — wire up platform then start the game.
createYandexPlatform().then(bootstrap).catch(console.error);
