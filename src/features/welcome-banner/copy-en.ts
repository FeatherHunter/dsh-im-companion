/** P 英文文案（与 data.ts PH 逐段对齐）：五段×三套，一字结构对齐中文（含 mock 前缀与计数句式）。
 * 跟随 DSH 系统语言切换；助理口吻（I / you），不出现 work / start working 类直白词。 */
import type { TimeOpt, TimeSeg } from "./data";

interface SegDefEn {
  tab: string;
  sky: string;
  moon: boolean;
  horizon: boolean;
  opts: [TimeOpt, TimeOpt, TimeOpt];
}

export const PH_EN: Record<TimeSeg, SegDefEn> = {
  wee: { tab: "Wee", sky: "wb-sky-wee", moon: true, horizon: true, opts: [
    { t: "Still up? I saved you a light", s: "Online · Deep night. I'm awake", b: "Home", bs: "Cold out, warm inside" },
    { t: "Dark still. I'll see you to dawn", s: "Online · Insomnia or overtime, I'm on shift", b: "Home", bs: "A little longer" },
    { t: "Chilly out. Come warm up", s: "Online · Hot tea's poured", b: "Home", bs: "No questions about the late night" },
  ] },
  dawn: { tab: "Dawn", sky: "wb-sky-dawn", moon: false, horizon: false, opts: [
    { t: "Morning—I'm already up", s: "Online · Have something hot first, then talk", b: "Home for breakfast", bs: "Porridge's on" },
    { t: "Morning—today's your call", s: "Online · I'm all ears today", b: "Home", bs: "I'm here" },
    { t: "Swept the doorway clean", s: "Online · Just waiting on you", b: "Home", bs: "All clean" },
  ] },
  day: { tab: "Day", sky: "wb-sky-day", moon: false, horizon: false, opts: [
    { t: "Bright home, come back anytime", s: "Online · I'm minding today", b: "Home", bs: "Door's open" },
    { t: "High noon. Catch your breath?", s: "Online · Water first, breathe easy", b: "Home", bs: "No rush" },
    { t: "Loud out there, quiet in here", s: "Online · Quiet in here", b: "Home", bs: "Come sit quiet" },
  ] },
  dusk: { tab: "Dusk", sky: "wb-sky-dusk", moon: false, horizon: false, opts: [
    { t: "Dusk—lamps are lit", s: "Online · Waiting on you", b: "Home for dinner", bs: "Food's warm" },
    { t: "Dark outside, bright inside", s: "Online · Lights on for you", b: "Home", bs: "Come home before dark" },
    { t: "Day done? Home first", s: "Online · You did well today", b: "Home", bs: "Rest up" },
  ] },
  night: { tab: "Night", sky: "wb-sky-night", moon: true, horizon: false, opts: [
    { t: "Late night, lamps still on", s: "Online · Tonight, I'm awake", b: "Home", bs: "Still early" },
    { t: "Late—come home soon", s: "Online · Anytime", b: "Home", bs: "Door's unlocked" },
    { t: "Tired? Come back, lamps stay on", s: "Online · Won't ask about your day", b: "Home", bs: "Sleep first" },
  ] },
};