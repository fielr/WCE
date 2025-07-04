import { patchFunction, SDK, HOOK_PRIORITIES } from "../util/modding";
import { waitFor, isCharacter, drawTextFitLeft } from "../util/utils";
import { fbcSettings } from "../util/settings";
import { displayText } from "../util/localization";

export default async function privateWardrobe() {
  await waitFor(() => !!Player);

  let inCustomWardrobe = false;
  /** @type {Character | null} */
  let targetCharacter = null;
  /** @type {string | null} */
  let appearanceBackup = null;
  let excludeBodyparts = false;

  function currentWardrobeTargetIsPlayer() {
    return (inCustomWardrobe && targetCharacter?.IsPlayer()) || CharacterAppearanceSelection?.IsPlayer();
  }

  patchFunction(
    "DrawProcess",
    { 'CurrentScreen !== "Crafting"': 'CurrentScreen !== "Crafting" && CurrentScreen !== "Wardrobe"' },
    "Full wardrobe may display blur and blindness effects of the background"
  );

  patchFunction(
    "DrawCharacter",
    { '|| CurrentScreen === "Crafting"': '|| CurrentScreen === "Crafting" || CurrentScreen === "Wardrobe"' },
    "Full wardrobe may display blur and blindness effects of the outfits"
  );

  patchFunction(
    "WardrobeLoadCharacters",
    {
      "if (WardrobeCharacter.length <= P && ((W == null) || !Fast)) {": `if (WardrobeCharacter.length <= P && ((W == null) || !Fast)) {
      if (fbcSettingValue("privateWardrobe") && P >= WardrobeOffset + 12) continue;`,
    },
    "private wardrobe load speed optimisation might be broken"
  );

  SDK.hookFunction(
    "CharacterAppearanceWardrobeLoad",
    HOOK_PRIORITIES.OverrideBehaviour,
    (args, next) => {
      const [C] = args;
      if (fbcSettings.privateWardrobe && CurrentScreen === "Appearance") {
        inCustomWardrobe = true;
        targetCharacter = isCharacter(C) ? C : CharacterGetCurrent();
        CommonSetScreen("Character", "Wardrobe");
        return null;
      }
      return next(args);
    }
  );

  SDK.hookFunction(
    "AppearanceLoad",
    HOOK_PRIORITIES.AddBehaviour,
    (args, next) => {
      const ret = next(args);
      if (inCustomWardrobe) {
        CharacterAppearanceBackup = appearanceBackup;
      }
      return ret;
    }
  );

  SDK.hookFunction(
    "AppearanceRun",
    HOOK_PRIORITIES.AddBehaviour,
    (args, next) => {
      if (CharacterAppearanceMode === "Wardrobe" && currentWardrobeTargetIsPlayer()) {
        DrawCheckbox(1300, 350, 64, 64, "", excludeBodyparts, false, "white");
        drawTextFitLeft(displayText("Load without body parts"), 1374, 380, 630, "white");
      }
      return next(args);
    }
  );

  SDK.hookFunction(
    "AppearanceClick",
    HOOK_PRIORITIES.ModifyBehaviourMedium,
    (args, next) => {
      if (CharacterAppearanceMode === "Wardrobe" && MouseIn(1300, 350, 64, 64) && currentWardrobeTargetIsPlayer()) {
        excludeBodyparts = !excludeBodyparts;
        return null;
      }
      return next(args);
    }
  );

  SDK.hookFunction(
    "WardrobeLoad",
    HOOK_PRIORITIES.AddBehaviour,
    (args, next) => {
      appearanceBackup = CharacterAppearanceBackup;
      return next(args);
    }
  );

  SDK.hookFunction(
    "WardrobeRun",
    HOOK_PRIORITIES.AddBehaviour,
    (args, next) => {
      const playerBackup = Player;
      // Replace Player with target character in rendering
      if (inCustomWardrobe) {
        // @ts-ignore - explicitly overriding with another Character temporarily
        Player = targetCharacter;
        // @ts-ignore
        Player.VisualSettings = { ForceFullHeight: false };
      }
      const ret = next(args);
      if (inCustomWardrobe) {
        Player = playerBackup;
      }
      DrawText(`Page: ${((WardrobeOffset / 12) | 0) + 1}/${WardrobeSize / 12}`, 300, 35, "White");
      DrawCheckbox(10, 74, 64, 64, "", excludeBodyparts, false, "white");
      drawTextFitLeft(displayText("Exclude body parts"), 84, 106, 300, "white");
      return ret;
    }
  );

  SDK.hookFunction(
    "WardrobeClick",
    HOOK_PRIORITIES.ModifyBehaviourMedium,
    (args, next) => {
      if (MouseIn(10, 74, 64, 64)) {
        excludeBodyparts = !excludeBodyparts;
        return null;
      }
      const ret = next(args);
      if (fbcSettings.privateWardrobe && WardrobeOffset >= WardrobeCharacter.length && (MouseIn(415, 25, 60, 60) || MouseIn(1000, 25, 60, 60))) {
        WardrobeLoadCharacters(false);
      }
      return ret;
    }
  );

  SDK.hookFunction(
    "WardrobeExit",
    HOOK_PRIORITIES.OverrideBehaviour,
    (args, next) => {
      if (!inCustomWardrobe) {
        return next(args);
      }
      CommonSetScreen("Character", "Appearance");
      inCustomWardrobe = false;
      return null;
    }
  );

  SDK.hookFunction(
    "WardrobeFastLoad",
    HOOK_PRIORITIES.OverrideBehaviour,
    (args, next) => {
      let [C] = args;
      const base = C.Appearance.filter(a => a.Asset.Group.IsDefault && !a.Asset.Group.Clothing);
      if (inCustomWardrobe && isCharacter(C) && C.IsPlayer()) {
        if (!targetCharacter) {
          throw new Error("targetCharacter is not defined in WardrobeFastLoad");
        }
        args[0] = targetCharacter;
        C = targetCharacter;
        args[2] = false;
      }
      const ret = next(args);
      if (excludeBodyparts) {
        C.Appearance = [...base, ...C.Appearance.filter(a => !a.Asset.Group.IsDefault || a.Asset.Group.Clothing)];
        CharacterLoadCanvas(C);
      }
      return ret;
    }
  );

  SDK.hookFunction(
    "WardrobeFastSave",
    HOOK_PRIORITIES.OverrideBehaviour,
    (args, next) => {
      const [C] = args;
      if (inCustomWardrobe && isCharacter(C) && C.IsPlayer()) {
        if (!targetCharacter) {
          throw new Error("targetCharacter is not defined in WardrobeFastSave");
        }
        args[0] = targetCharacter;
      }
      if (fbcSettings.confirmWardrobeSave && Player.Wardrobe?.length > args[1] && Player.Wardrobe[args[1]]?.some(a => a.Group === "Pronouns")) {
        // eslint-disable-next-line no-alert
        if (!window.confirm("Do you really want to override this wardrobe outfit?")) {
          return null;
        }
      }
      return next(args);
    }
  );

  SDK.hookFunction(
    "ServerPlayerIsInChatRoom",
    HOOK_PRIORITIES.AddBehaviour,
    (args, next) => (inCustomWardrobe && CharacterAppearanceReturnScreen?.[1] === "ChatRoom") || next(args)
  );

  /**
   * @param {KeyboardEvent} e
   * @returns {void}
   */
  function keyHandler(e) {
    if (!fbcSettings.privateWardrobe) {
      return;
    }
    if (e.key === "Escape" && inCustomWardrobe) {
      WardrobeExit();
      e.stopPropagation();
      e.preventDefault();
    }
  }

  document.addEventListener("keydown", keyHandler, true);
  document.addEventListener("keypress", keyHandler, true);
}
