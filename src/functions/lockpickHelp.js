import { debug } from "../util/logger";
import { SDK, HOOK_PRIORITIES } from "../util/modding";
import { fbcSettings } from "../util/settings";
import { waitFor } from "../util/utils";

export default async function lockpickHelp() {
  await waitFor(() => !!StruggleMinigames);

  const pinSpacing = 100,
    pinWidth = 200,
    x = 1575,
    y = 300;

  SDK.hookFunction("StruggleLockPickDraw", HOOK_PRIORITIES.AddBehaviour, (args, next) => {
    if (fbcSettings.lockpick && StruggleLockPickOrder) {
      const hints = StruggleLockPickOrder;
      for (let p = 0; p < hints.length; p++) {
        // Replicates pin rendering in the game Struggle.js
        const xx = x - pinWidth / 2 + (0.5 - hints.length / 2 + p) * pinSpacing;
        DrawText(`${StruggleLockPickOrder.indexOf(p) + 1}`, xx, y, "white");
      }
    }
    return next(args);
  });
  debug("hooking struggle for lockpick cheat draw", StruggleMinigames);
  StruggleMinigames.LockPick.Draw = StruggleLockPickDraw;
}
